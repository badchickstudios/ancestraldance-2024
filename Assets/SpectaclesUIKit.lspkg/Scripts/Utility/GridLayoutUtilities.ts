import {
  AddOrder,
  Anchor,
  Axis,
  GridBoundsConstraints,
  GridCoordinate,
  GridMetrics,
  GridPlacement,
  InitializableItem,
  Size3D
} from "../Components/Layout/LayoutConfigurationTypes"
import {LayoutItemInitializationTracker} from "./LayoutItemInitializationTracker"
import {isCellWithinGridBounds} from "./LayoutValidation"

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS & CONTEXT
// ═══════════════════════════════════════════════════════════════════════════

const BFS_DIRECTIONS_ORDER: {x: number; y: number; z: number}[] = [
  {x: 1, y: 0, z: 0},
  {x: -1, y: 0, z: 0},
  {x: 0, y: 1, z: 0},
  {x: 0, y: -1, z: 0},
  {x: 0, y: 0, z: 1},
  {x: 0, y: 0, z: -1}
]

/**
 * Context object for BFS search to reuse buffers and avoid GC.
 */
export class GridSearchContext {
  public visited: Set<number> = new Set()
  public queue: Int32Array | null = null
  public candidates: number[] = []

  /**
   * Ensures the queue buffer is large enough and returns it.
   */
  public ensureQueueSize(size: number): Int32Array {
    if (!this.queue || this.queue.length < size) {
      this.queue = new Int32Array(size)
    }
    return this.queue
  }

  /**
   * Resets the visited set and candidates array for a new search.
   * Does not clear the queue buffer (it is overwritten).
   */
  public reset(): void {
    this.visited.clear()
    this.candidates.length = 0
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// INITIALIZATION & SORT UTILITIES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Helper to wait for a static list of items to initialize.
 *
 * @param items - The items to wait for.
 * @param callback - The function to call when all items are ready.
 * @returns A cleanup function that unsubscribes any pending listeners.
 */
export function waitForItemsInitialized<T extends InitializableItem>(items: T[], callback: () => void): () => void {
  const tracker = new LayoutItemInitializationTracker(callback)
  tracker.addItems(items)

  // If already ready, it fired callback immediately.
  // We return a dispose function.
  return () => tracker.dispose()
}

/**
 * Compares two Size3D objects by volume based on the specified order.
 * @param a - First item size.
 * @param b - Second item size.
 * @param order - The sort order (LargestFirst or SmallestFirst).
 * @returns Comparison result number.
 */
export function compareVolumes(a: Size3D, b: Size3D, order: AddOrder): number {
  const aVolume = a.width * a.height * a.depth
  const bVolume = b.width * b.height * b.depth
  return order === AddOrder.LargestFirst ? bVolume - aVolume : aVolume - bVolume
}

// ═══════════════════════════════════════════════════════════════════════════
// GRID DIMENSIONS & METRICS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Packs 3 coordinates into a single number for efficient Set/Map keys.
 * Supports coordinates in range [-32768, 32767].
 *
 * @param col - Column index
 * @param row - Row index
 * @param layer - Layer index
 * @returns Packed 52-bit integer key
 */
export function getCellKey(col: number, row: number, layer: number): number {
  // Offset by 32768 to handle negative coordinates
  const c = (col + 32768) & 0xffff
  const r = (row + 32768) & 0xffff
  const l = (layer + 32768) & 0xffff

  // Pack: Layer(16) | Row(16) | Col(16)
  // Use multiplication for upper bits to avoid 32-bit bitwise wrapping
  return c + r * 65536 + l * 4294967296
}

/**
 * Calculates how many cells an item spans based on its size.
 * @param itemSize - The size of the item along one axis.
 * @param cellSize - The size of each cell along that axis.
 * @param spacing - The spacing between cells along that axis.
 * @returns The number of cells the item spans (minimum 1).
 */
function calculateCellSpan(itemSize: number, cellSize: number, spacing: number): number {
  if (cellSize <= 0) return 1
  // Item spans enough cells to contain its size
  // Formula: ceil((itemSize + spacing) / (cellSize + spacing)), minimum 1
  return Math.max(1, Math.ceil((itemSize + spacing) / (cellSize + spacing)))
}

/**
 * Calculates the column, row, and layer spans for an item based on grid metrics.
 * @param itemSize - The size of the item.
 * @param metrics - The grid metrics (cell size, spacing).
 * @returns An object containing colSpan, rowSpan, and layerSpan.
 */
export function calculateItemSpans(
  itemSize: Size3D,
  metrics: GridMetrics
): {colSpan: number; rowSpan: number; layerSpan: number} {
  return {
    colSpan: calculateCellSpan(itemSize.width, metrics.cellSize.x, metrics.spacing.x),
    rowSpan: calculateCellSpan(itemSize.height, metrics.cellSize.y, metrics.spacing.y),
    layerSpan: calculateCellSpan(itemSize.depth, metrics.cellSize.z, metrics.spacing.z)
  }
}

/**
 * Calculates the total size of the grid along one axis from constraints.
 * @param numCells - The number of cells along this axis.
 * @param cellSize - The size of each cell along this axis.
 * @param spacing - The spacing between cells along this axis.
 * @param paddingStart - The padding at the start of this axis.
 * @param paddingEnd - The padding at the end of this axis.
 * @returns The total size along this axis.
 */
function calculateTotalGridSizeAlongAxis(
  numCells: number,
  cellSize: number,
  spacing: number,
  paddingStart: number,
  paddingEnd: number
): number {
  // Total size = (numCells * cellSize) + ((numCells - 1) * spacing) + paddingStart + paddingEnd
  const cellsSize = numCells * cellSize
  const spacingSize = numCells > 1 ? (numCells - 1) * spacing : 0
  return cellsSize + spacingSize + paddingStart + paddingEnd
}

/**
 * Calculates the effective number of cells and the start index for a grid axis.
 * Used to determine the actual range of the grid whether it is fixed or flexible.
 *
 * @param isFixed - Whether the axis is fixed size.
 * @param maxCells - The maximum number of cells (if fixed).
 * @param occupiedMin - The minimum occupied index.
 * @param occupiedMax - The maximum occupied index.
 * @returns An object containing `count` (number of cells) and `start` (start index).
 */
function calculateEffectiveGridAxisDimension(
  isFixed: boolean,
  maxCells: number,
  occupiedMin: number,
  occupiedMax: number
): {count: number; start: number} {
  if (isFixed) {
    return {count: maxCells, start: 0}
  }

  if (occupiedMin === Infinity) {
    return {count: 0, start: 0}
  }

  return {
    count: occupiedMax - occupiedMin + 1,
    start: occupiedMin
  }
}

/**
 * Calculates the total size of a grid based on its configuration and occupied bounds.
 *
 * @param constraints - The grid bounds constraints (fixed/max values for each axis).
 * @param occupiedMin - The minimum occupied grid coordinates.
 * @param occupiedMax - The maximum occupied grid coordinates.
 * @param cellSize - The size of each cell (width, height, depth).
 * @param spacing - The spacing between cells (x, y, z).
 * @param padding - The padding on each side.
 * @returns The total grid size as a vec3 (width, height, depth).
 */
export function calculateGridSize(
  constraints: GridBoundsConstraints,
  occupiedMin: GridCoordinate,
  occupiedMax: GridCoordinate,
  cellSize: {x: number; y: number; z: number},
  spacing: {x: number; y: number; z: number},
  padding: {left: number; right: number; bottom: number; top: number; back: number; front: number}
): vec3 {
  const numColumns = calculateEffectiveGridAxisDimension(
    constraints.fixedColumns,
    constraints.maxColumns,
    occupiedMin.col,
    occupiedMax.col
  ).count

  const numRows = calculateEffectiveGridAxisDimension(
    constraints.fixedRows,
    constraints.maxRows,
    occupiedMin.row,
    occupiedMax.row
  ).count

  const numLayers = calculateEffectiveGridAxisDimension(
    constraints.fixedLayers,
    constraints.maxLayers,
    occupiedMin.layer,
    occupiedMax.layer
  ).count

  const width = calculateTotalGridSizeAlongAxis(numColumns, cellSize.x, spacing.x, padding.left, padding.right)

  const height = calculateTotalGridSizeAlongAxis(numRows, cellSize.y, spacing.y, padding.bottom, padding.top)

  const depth = calculateTotalGridSizeAlongAxis(numLayers, cellSize.z, spacing.z, padding.back, padding.front)

  return new vec3(width, height, depth)
}

// ═══════════════════════════════════════════════════════════════════════════
// BOUNDS & OCCUPANCY
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Calculates the min/max occupied bounds from a collection of grid placements.
 * Returns the bounding box that contains all placements.
 *
 * @param placements - Iterable of GridPlacement objects to calculate bounds from.
 * @returns An object with `min` and `max` GridCoordinate representing the occupied bounds.
 *          If no placements are provided, returns Infinity/-Infinity bounds indicating empty.
 */
export function calculateOccupiedBoundsFromPlacements(placements: Iterable<GridPlacement>): {
  min: GridCoordinate
  max: GridCoordinate
} {
  const min: GridCoordinate = {col: Infinity, row: Infinity, layer: Infinity}
  const max: GridCoordinate = {col: -Infinity, row: -Infinity, layer: -Infinity}

  for (const placement of placements) {
    const startCol = Math.floor(placement.col)
    const startRow = Math.floor(placement.row)
    const startLayer = Math.floor(placement.layer)
    const endCol = startCol + placement.colSpan
    const endRow = startRow + placement.rowSpan
    const endLayer = startLayer + placement.layerSpan

    min.col = Math.min(min.col, startCol)
    min.row = Math.min(min.row, startRow)
    min.layer = Math.min(min.layer, startLayer)

    // Note: max is inclusive index, so end - 1
    max.col = Math.max(max.col, endCol - 1)
    max.row = Math.max(max.row, endRow - 1)
    max.layer = Math.max(max.layer, endLayer - 1)
  }

  return {min, max}
}

/**
 * Updates the occupied bounds based on a new placement.
 * @param currentMin - The current minimum occupied bounds (mutable).
 * @param currentMax - The current maximum occupied bounds (mutable).
 * @param placement - The new placement to include in the bounds.
 */
export function updateOccupiedBounds(
  currentMin: GridCoordinate,
  currentMax: GridCoordinate,
  placement: GridPlacement
): void {
  const startCol = Math.floor(placement.col)
  const startRow = Math.floor(placement.row)
  const startLayer = Math.floor(placement.layer)
  const endCol = startCol + placement.colSpan
  const endRow = startRow + placement.rowSpan
  const endLayer = startLayer + placement.layerSpan

  currentMin.col = Math.min(currentMin.col, startCol)
  currentMin.row = Math.min(currentMin.row, startRow)
  currentMin.layer = Math.min(currentMin.layer, startLayer)

  // Note: max is inclusive index, so end - 1
  currentMax.col = Math.max(currentMax.col, endCol - 1)
  currentMax.row = Math.max(currentMax.row, endRow - 1)
  currentMax.layer = Math.max(currentMax.layer, endLayer - 1)
}

/**
 * A helper class to track changes to an occupancy map without cloning the entire map.
 * Used for simulation steps where changes might be discarded.
 */
class DeltaOccupancyMap<T> {
  private overlay: Map<number, T | null> = new Map()

  public constructor(private parent: Map<number, T> | DeltaOccupancyMap<T>) {}

  public get(key: number): T | undefined {
    if (this.overlay.has(key)) {
      const val = this.overlay.get(key)
      return val === null ? undefined : val
    }
    return this.parent.get(key)
  }

  public set(key: number, value: T): void {
    this.overlay.set(key, value)
  }

  public delete(key: number): void {
    this.overlay.set(key, null)
  }

  public clear(): void {
    this.overlay.clear()
  }
}

/**
 * Sets or clears occupancy for all cells covered by a placement in a given map.
 * Used for tracking which items occupy which grid cells during placement and simulation.
 *
 * @param placement - The grid placement defining the region to update.
 * @param item - The item to set as occupying the cells, or null to clear occupancy.
 * @param occupancyMap - The map to update (can be a regular Map or DeltaOccupancyMap).
 * @param originalItem - Optional. When clearing (item is null), only clears cells currently owned by this item.
 *                       If not provided, clears unconditionally.
 */
export function setPlacementOccupancyInMap<T>(
  placement: GridPlacement,
  item: T | null,
  occupancyMap: Map<number, T> | DeltaOccupancyMap<T>,
  originalItem?: T
): void {
  for (let c = 0; c < placement.colSpan; c++) {
    for (let r = 0; r < placement.rowSpan; r++) {
      for (let l = 0; l < placement.layerSpan; l++) {
        const key = getCellKey(placement.col + c, placement.row + r, placement.layer + l)
        if (item) {
          occupancyMap.set(key, item)
        } else {
          // Only delete if the cell is currently owned by the item we are clearing
          // OR if no specific originalItem was provided (legacy behavior)
          if (!originalItem || occupancyMap.get(key) === originalItem) {
            occupancyMap.delete(key)
          }
        }
      }
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// PLACEMENT AVAILABILITY & INTERSECTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Normalizes a GridPlacement by flooring its coordinates to ensure integer cell indices.
 */
export function floorGridPlacement(placement: GridPlacement): GridPlacement {
  return {
    col: Math.floor(placement.col),
    row: Math.floor(placement.row),
    layer: Math.floor(placement.layer),
    colSpan: placement.colSpan,
    rowSpan: placement.rowSpan,
    layerSpan: placement.layerSpan
  }
}

/**
 * Clamps a placement to the grid bounds if dimensions are fixed.
 * Rounds coordinates to the nearest integer.
 */
export function clampGridPlacement(placement: GridPlacement, constraints: GridBoundsConstraints): GridPlacement {
  let col = Math.round(placement.col)
  let row = Math.round(placement.row)
  let layer = Math.round(placement.layer)

  if (constraints.fixedColumns) {
    col = Math.max(0, Math.min(col, constraints.maxColumns - placement.colSpan))
  }
  if (constraints.fixedRows) {
    row = Math.max(0, Math.min(row, constraints.maxRows - placement.rowSpan))
  }
  if (constraints.fixedLayers) {
    layer = Math.max(0, Math.min(layer, constraints.maxLayers - placement.layerSpan))
  }

  return {
    col,
    row,
    layer,
    colSpan: placement.colSpan,
    rowSpan: placement.rowSpan,
    layerSpan: placement.layerSpan
  }
}

/**
 * Checks if two grid placements intersect.
 */
function doGridPlacementsIntersect(a: GridPlacement, b: GridPlacement): boolean {
  return (
    a.col < b.col + b.colSpan &&
    a.col + a.colSpan > b.col &&
    a.row < b.row + b.rowSpan &&
    a.row + a.rowSpan > b.row &&
    a.layer < b.layer + b.layerSpan &&
    a.layer + a.layerSpan > b.layer
  )
}

/**
 * Finds all items whose placements intersect a given region.
 * Used for optimized collision detection when checking a large region against a small number of items.
 *
 * @param region - The region to check for intersections.
 * @param placements - Map of items to their placements.
 * @returns Set of items whose placements intersect the region.
 */
function findItemsIntersectingRegion<K>(region: GridPlacement, placements: Map<K, GridPlacement>): Set<K> {
  const result = new Set<K>()
  for (const [item, placement] of placements) {
    if (doGridPlacementsIntersect(region, placement)) {
      result.add(item)
    }
  }
  return result
}

/**
 * Checks if any placement in the collection intersects the given region.
 * Used for optimized availability checks when the region volume is large relative to item count.
 *
 * @param region - The region to check for intersections.
 * @param placements - Iterable of placements to check against.
 * @returns True if any placement intersects the region, false otherwise.
 */
function hasAnyPlacementIntersectingRegion(region: GridPlacement, placements: Iterable<GridPlacement>): boolean {
  for (const placement of placements) {
    if (doGridPlacementsIntersect(region, placement)) {
      return true
    }
  }
  return false
}

/**
 * Checks if a range of cells is available for placement.
 * Uses a similar heuristic to queryGridRegion for optimization.
 *
 * @param startCol - Starting column index.
 * @param startRow - Starting row index.
 * @param startLayer - Starting layer index.
 * @param colSpan - Number of columns to check.
 * @param rowSpan - Number of rows to check.
 * @param layerSpan - Number of layers to check.
 * @param placements - Map of items to their placements.
 * @param gridCells - Map of cell keys to items.
 * @param constraints - Grid constraints (fixed/max dimensions).
 * @returns True if all cells in the range are available (empty and within bounds).
 */
export function checkGridRegionAvailability<T>(
  startCol: number,
  startRow: number,
  startLayer: number,
  colSpan: number,
  rowSpan: number,
  layerSpan: number,
  placements: Map<T, GridPlacement>,
  gridCells: Map<number, T>,
  constraints: GridBoundsConstraints
): boolean {
  const startX = Math.floor(startCol)
  const startY = Math.floor(startRow)
  const startZ = Math.floor(startLayer)
  const endX = Math.floor(startCol + colSpan)
  const endY = Math.floor(startRow + rowSpan)
  const endZ = Math.floor(startLayer + layerSpan)

  if (!isCellWithinGridBounds(startX, startY, startZ, constraints)) return false
  // Check end bound (exclusive index, so check end-1)
  if (!isCellWithinGridBounds(endX - 1, endY - 1, endZ - 1, constraints)) return false

  // Optimization: If searching a large volume relative to the number of items,
  // it's faster to check intersections against existing items than to query the map for every cell.
  const volume = (endX - startX) * (endY - startY) * (endZ - startZ)
  if (placements.size > 0 && volume > placements.size * 2) {
    const region: GridPlacement = {
      col: startX,
      row: startY,
      layer: startZ,
      colSpan: endX - startX,
      rowSpan: endY - startY,
      layerSpan: endZ - startZ
    }
    return !hasAnyPlacementIntersectingRegion(region, placements.values())
  }

  // Check each cell in the range
  for (let c = startX; c < endX; c++) {
    for (let r = startY; r < endY; r++) {
      for (let l = startZ; l < endZ; l++) {
        // If the cell exists and is occupied, range is not available
        if (gridCells.has(getCellKey(c, r, l))) {
          return false
        }
      }
    }
  }
  return true
}

/**
 * Finds all items whose placements intersect a given region.
 * Uses an optimized heuristic: if the region volume is much larger than the number of items,
 * it iterates through items checking for intersection. Otherwise, it iterates through the
 * grid cells in the region.
 *
 * @param startCol - Starting column index.
 * @param startRow - Starting row index.
 * @param startLayer - Starting layer index.
 * @param colSpan - Number of columns to check.
 * @param rowSpan - Number of rows to check.
 * @param layerSpan - Number of layers to check.
 * @param placements - Map of items to their placements.
 * @param gridCells - Map of cell keys to items.
 * @param occupiedMin - Minimum occupied grid coordinates.
 * @param occupiedMax - Maximum occupied grid coordinates.
 * @param constraints - Grid constraints (fixed/max dimensions).
 * @returns Set of items found in the region.
 */
function queryGridRegion<T>(
  startCol: number,
  startRow: number,
  startLayer: number,
  colSpan: number,
  rowSpan: number,
  layerSpan: number,
  placements: Map<T, GridPlacement>,
  gridCells: Map<number, T>,
  occupiedMin: GridCoordinate,
  occupiedMax: GridCoordinate,
  constraints: GridBoundsConstraints
): Set<T> {
  const items = new Set<T>()
  const startX = Math.floor(startCol)
  const startY = Math.floor(startRow)
  const startZ = Math.floor(startLayer)
  const endX = Math.floor(startCol + colSpan)
  const endY = Math.floor(startRow + rowSpan)
  const endZ = Math.floor(startLayer + layerSpan)

  // If searching a large empty area, iterate items instead of cells
  const volume = (endX - startX) * (endY - startY) * (endZ - startZ)
  if (placements.size > 0 && volume > placements.size * 2) {
    const region: GridPlacement = {
      col: startX,
      row: startY,
      layer: startZ,
      colSpan: endX - startX,
      rowSpan: endY - startY,
      layerSpan: endZ - startZ
    }
    return findItemsIntersectingRegion(region, placements)
  }

  // We only need to check the intersection of the request and the known occupied area.
  // occupiedMin/Max are reliable supersets of the occupied cells.
  const searchMinX = Math.max(startX, occupiedMin.col)
  const searchMaxX = Math.min(endX, occupiedMax.col + 1)
  if (searchMinX >= searchMaxX) return items

  const searchMinY = Math.max(startY, occupiedMin.row)
  const searchMaxY = Math.min(endY, occupiedMax.row + 1)
  if (searchMinY >= searchMaxY) return items

  const searchMinZ = Math.max(startZ, occupiedMin.layer)
  const searchMaxZ = Math.min(endZ, occupiedMax.layer + 1)
  if (searchMinZ >= searchMaxZ) return items

  // Bound loop only if fixed, otherwise loop through optimized range
  const minX = constraints.fixedColumns ? Math.max(0, searchMinX) : searchMinX
  const maxX = constraints.fixedColumns ? Math.min(constraints.maxColumns, searchMaxX) : searchMaxX
  const minY = constraints.fixedRows ? Math.max(0, searchMinY) : searchMinY
  const maxY = constraints.fixedRows ? Math.min(constraints.maxRows, searchMaxY) : searchMaxY
  const minZ = constraints.fixedLayers ? Math.max(0, searchMinZ) : searchMinZ
  const maxZ = constraints.fixedLayers ? Math.min(constraints.maxLayers, searchMaxZ) : searchMaxZ

  for (let c = minX; c < maxX; c++) {
    for (let r = minY; r < maxY; r++) {
      for (let l = minZ; l < maxZ; l++) {
        const item = gridCells.get(getCellKey(c, r, l))
        if (item) {
          items.add(item)
        }
      }
    }
  }
  return items
}

// ═══════════════════════════════════════════════════════════════════════════
// PUSH LOGIC
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Calculates the virtual center of a pusher item in grid coordinates.
 * Converts world position -> local position -> grid indices.
 *
 * @param worldPos - The world position of the pusher item.
 * @param gridInverseTransform - The grid's inverse world transform matrix.
 * @param metrics - The grid configuration metrics.
 * @param itemSize - The size of the pusher item.
 * @param alignment - The alignment settings for the pusher item.
 * @param targetPlacement - The target placement of the item being placed (used for spans).
 * @returns The calculated center grid coordinates (x=col, y=row, z=layer).
 */
export function calculatePusherGridCenter(
  worldPos: vec3,
  gridInverseTransform: mat4,
  metrics: GridMetrics,
  itemSize: Size3D,
  alignment: {x: string; y: string; z: string},
  targetPlacement: GridPlacement
): {x: number; y: number; z: number} {
  const localPos = gridInverseTransform.multiplyPoint(worldPos)

  const col = calculateAxisGridIndex(Axis.X, localPos.x, metrics, itemSize.width, targetPlacement.colSpan, alignment.x)
  const row = calculateAxisGridIndex(Axis.Y, localPos.y, metrics, itemSize.height, targetPlacement.rowSpan, alignment.y)
  const layer = calculateAxisGridIndex(
    Axis.Z,
    localPos.z,
    metrics,
    itemSize.depth,
    targetPlacement.layerSpan,
    alignment.z
  )

  return {
    x: col + targetPlacement.colSpan / 2,
    y: row + targetPlacement.rowSpan / 2,
    z: layer + targetPlacement.layerSpan / 2
  }
}

/**
 * Calculates a new placement by pushing a victim relative to a pusher in a specific direction.
 * @param pusherPlacement - The placement of the item doing the pushing.
 * @param victimPlacement - The placement of the item being pushed.
 * @param direction - The direction to push in (x, y, z components -1, 0, 1).
 * @returns The new GridPlacement for the victim.
 */
function calculatePushPlacement(
  pusherPlacement: GridPlacement,
  victimPlacement: GridPlacement,
  direction: {x: number; y: number; z: number}
): GridPlacement {
  const newPlacement = {...victimPlacement}

  if (direction.x !== 0) {
    newPlacement.col =
      direction.x > 0 ? pusherPlacement.col + pusherPlacement.colSpan : pusherPlacement.col - victimPlacement.colSpan
  } else if (direction.y !== 0) {
    newPlacement.row =
      direction.y > 0 ? pusherPlacement.row + pusherPlacement.rowSpan : pusherPlacement.row - victimPlacement.rowSpan
  } else if (direction.z !== 0) {
    newPlacement.layer =
      direction.z > 0
        ? pusherPlacement.layer + pusherPlacement.layerSpan
        : pusherPlacement.layer - victimPlacement.layerSpan
  }

  return newPlacement
}

/**
 * Sorts direction vectors based on their alignment with a target vector (dot product).
 * Sorts by dot product ascending (most opposite first), then by predefined order.
 */
function sortDirectionsByTargetAlignment(
  directions: {x: number; y: number; z: number}[],
  targetVector: {x: number; y: number; z: number}
): void {
  directions.sort((a, b) => {
    const dotA = a.x * targetVector.x + a.y * targetVector.y + a.z * targetVector.z
    const dotB = b.x * targetVector.x + b.y * targetVector.y + b.z * targetVector.z
    if (dotA !== dotB) {
      return dotA - dotB
    }
    return BFS_DIRECTIONS_ORDER.indexOf(a) - BFS_DIRECTIONS_ORDER.indexOf(b)
  })
}

/**
 * Propagates a push operation through the grid, finding a chain of moves.
 * Uses DFS (via stack) to find valid new positions for all displaced items.
 *
 * @param startStack - Initial stack of items to push.
 * @param moves - Map to store the calculated moves.
 * @param occupiedCells - Delta map of occupied cells to track simulation state.
 * @param gridCells - Source of truth for cell occupancy (if not in delta map).
 * @param placements - Source of truth for item placements.
 * @param constraints - Grid boundaries.
 * @param maxIterations - Safety limit for the simulation loop.
 * @param itemToPlace - The item initiating the push (to check for specific collisions).
 * @param targetPlacement - The reserved placement for the new item.
 * @returns True if a valid push chain was found, false otherwise.
 */
function propagateGridPush<T>(
  startStack: Array<{item: T; placement: GridPlacement; dir: {x: number; y: number; z: number}}>,
  moves: Map<T, GridPlacement>,
  occupiedCells: DeltaOccupancyMap<T>,
  gridCells: Map<number, T>,
  placements: Map<T, GridPlacement>,
  constraints: GridBoundsConstraints,
  maxIterations: number,
  itemToPlace?: T,
  targetPlacement?: GridPlacement
): boolean {
  let iterations = 0
  const stack = [...startStack]

  while (stack.length > 0) {
    if (iterations++ > maxIterations) return false

    const {item: pusher, placement: pusherPlacement, dir} = stack.pop()!

    // Find collisions at the NEW placement
    // We need to check both the base grid (if not moved in simulation) and the simulation state
    const collisions = new Set<T>()

    // Check collisions in the simulation state (DeltaOccupancyMap)
    // We iterate the cells of the pusher's new placement
    for (let c = 0; c < pusherPlacement.colSpan; c++) {
      for (let r = 0; r < pusherPlacement.rowSpan; r++) {
        for (let l = 0; l < pusherPlacement.layerSpan; l++) {
          const key = getCellKey(pusherPlacement.col + c, pusherPlacement.row + r, pusherPlacement.layer + l)

          // Check for static items in the base grid that haven't moved yet
          const staticItem = gridCells.get(key)
          if (staticItem && staticItem !== pusher) {
            // If the item hasn't been moved in this simulation, it's still here -> collision
            if (!moves.has(staticItem)) {
              collisions.add(staticItem)
            }
          }

          // Also check occupiedCells for any dynamic items (though typically we overwrite them)
          // If we find an item in occupiedCells that is NOT the pusher, it's a collision
          const dynamicItem = occupiedCells.get(key)
          if (dynamicItem && dynamicItem !== pusher) {
            collisions.add(dynamicItem)
          }
        }
      }
    }

    const validVictims = new Map<T, GridPlacement>()

    for (const victim of collisions) {
      if (itemToPlace && victim === itemToPlace) {
        if (targetPlacement && doGridPlacementsIntersect(pusherPlacement, targetPlacement)) {
          return false
        }
        continue
      }
      if (victim === pusher) continue

      // Check against victim's CURRENT location in the simulation (moved or original)
      const victimCurrentPlacement = moves.get(victim) || placements.get(victim)
      if (!victimCurrentPlacement) continue

      if (!doGridPlacementsIntersect(pusherPlacement, victimCurrentPlacement)) continue

      // Propagate push in the SAME direction as the pusher
      const newPlacement = calculatePushPlacement(pusherPlacement, victimCurrentPlacement, dir)

      // Check bounds
      if (!isCellWithinGridBounds(newPlacement.col, newPlacement.row, newPlacement.layer, constraints)) return false
      // Check max bounds (width/height/depth)
      if (
        !isCellWithinGridBounds(
          newPlacement.col + newPlacement.colSpan - 1,
          newPlacement.row + newPlacement.rowSpan - 1,
          newPlacement.layer + newPlacement.layerSpan - 1,
          constraints
        )
      )
        return false

      // Check against target placement - prevent pushing items INTO the reserved spot
      if (targetPlacement && doGridPlacementsIntersect(newPlacement, targetPlacement)) {
        return false
      }

      // Check conflicts with existing moves using spatial lookup
      let isBlocked = false
      const potentialConflicts = new Set<T>()

      for (let c = 0; c < newPlacement.colSpan; c++) {
        for (let r = 0; r < newPlacement.rowSpan; r++) {
          for (let l = 0; l < newPlacement.layerSpan; l++) {
            const key = getCellKey(newPlacement.col + c, newPlacement.row + r, newPlacement.layer + l)
            const owner = occupiedCells.get(key)

            if (owner && owner !== victim) {
              potentialConflicts.add(owner)
            }
          }
        }
      }

      // Process conflicts: if occupied by another item, calculate its new position
      // and treat it as a victim of the current push.
      for (const owner of potentialConflicts) {
        const ownerCurrentPlacement = moves.get(owner) || placements.get(owner)
        if (!ownerCurrentPlacement) {
          isBlocked = true
          continue
        }

        // Calculate new placement for the blocking item
        const ownerNewPlacement = calculatePushPlacement(newPlacement, ownerCurrentPlacement, dir)

        if (
          !isCellWithinGridBounds(ownerNewPlacement.col, ownerNewPlacement.row, ownerNewPlacement.layer, constraints) ||
          !isCellWithinGridBounds(
            ownerNewPlacement.col + ownerNewPlacement.colSpan - 1,
            ownerNewPlacement.row + ownerNewPlacement.rowSpan - 1,
            ownerNewPlacement.layer + ownerNewPlacement.layerSpan - 1,
            constraints
          )
        ) {
          return false
        }

        // Check against target placement
        if (targetPlacement && doGridPlacementsIntersect(ownerNewPlacement, targetPlacement)) {
          return false
        }

        const existingMove = moves.get(owner)
        if (existingMove) {
          if (
            existingMove.col !== ownerNewPlacement.col ||
            existingMove.row !== ownerNewPlacement.row ||
            existingMove.layer !== ownerNewPlacement.layer
          ) {
            return false
          }
        } else {
          const pending = validVictims.get(owner)
          let useNew = true
          if (pending) {
            if (dir.x !== 0)
              useNew = dir.x > 0 ? ownerNewPlacement.col > pending.col : ownerNewPlacement.col < pending.col
            else if (dir.y !== 0)
              useNew = dir.y > 0 ? ownerNewPlacement.row > pending.row : ownerNewPlacement.row < pending.row
            else useNew = dir.z > 0 ? ownerNewPlacement.layer > pending.layer : ownerNewPlacement.layer < pending.layer
          }

          if (useNew) {
            validVictims.set(owner, ownerNewPlacement)
          }
        }
      }

      if (isBlocked) {
        return false
      }

      const existingMove = moves.get(victim)
      if (existingMove) {
        if (
          existingMove.col !== newPlacement.col ||
          existingMove.row !== newPlacement.row ||
          existingMove.layer !== newPlacement.layer
        ) {
          return false
        }
      } else {
        validVictims.set(victim, newPlacement)
      }
    }

    const sortedVictims = Array.from(validVictims.entries()).map(([item, placement]) => ({item, placement}))

    // Sort victims to prioritize the chain most likely to fail (further along the push direction)
    if (sortedVictims.length > 1) {
      sortedVictims.sort((a, b) => {
        const axis = dir.x !== 0 ? Axis.X : dir.y !== 0 ? Axis.Y : Axis.Z
        const centerA = getGridPlacementCenter(a.placement, axis)
        const centerB = getGridPlacementCenter(b.placement, axis)
        const sign = dir.x !== 0 ? dir.x : dir.y !== 0 ? dir.y : dir.z
        return (centerA - centerB) * sign
      })
    }

    for (const {item: victim, placement: newPlacement} of sortedVictims) {
      // Clear old occupancy to prevent ghost collisions
      const oldPlacement = moves.get(victim) || placements.get(victim)
      if (oldPlacement) {
        setPlacementOccupancyInMap(oldPlacement, null, occupiedCells, victim)
      }

      moves.set(victim, newPlacement)
      setPlacementOccupancyInMap(newPlacement, victim, occupiedCells)
      stack.push({item: victim, placement: newPlacement, dir})
    }
  }

  return true
}

/**
 * Simulates a push in a specific direction.
 * Returns information about the validity and cost of the push.
 */
function simulateGridPushInDirection<T>(
  victim: T,
  direction: {x: number; y: number; z: number},
  targetPlacement: GridPlacement,
  currentMoves: Map<T, GridPlacement>,
  parentOccupancy: DeltaOccupancyMap<T>,
  gridCells: Map<number, T>,
  placements: Map<T, GridPlacement>,
  constraints: GridBoundsConstraints,
  maxIterations: number,
  itemToPlace?: T,
  probeOccupancy?: DeltaOccupancyMap<T>
): {valid: boolean; moves: Map<T, GridPlacement>; movedCount: number; movedVolume: number} {
  // Create copies to avoid side effects on the parent simulation until valid
  const simMoves = new Map<T, GridPlacement>(currentMoves)

  let simOccupied: DeltaOccupancyMap<T>
  if (probeOccupancy) {
    simOccupied = probeOccupancy
    simOccupied.clear()
  } else {
    simOccupied = new DeltaOccupancyMap<T>(parentOccupancy)
  }

  // 1. Calculate initial move for the victim
  const victimPlacement = simMoves.get(victim) || placements.get(victim)
  if (!victimPlacement) return {valid: false, moves: simMoves, movedCount: 0, movedVolume: 0}

  // Clear victim's current occupancy from the simulation map
  setPlacementOccupancyInMap(victimPlacement, null, simOccupied, victim)

  const newPlacement = calculatePushPlacement(targetPlacement, victimPlacement, direction)

  // Check bounds
  if (!isCellWithinGridBounds(newPlacement.col, newPlacement.row, newPlacement.layer, constraints))
    return {valid: false, moves: simMoves, movedCount: 0, movedVolume: 0}
  if (
    !isCellWithinGridBounds(
      newPlacement.col + newPlacement.colSpan - 1,
      newPlacement.row + newPlacement.rowSpan - 1,
      newPlacement.layer + newPlacement.layerSpan - 1,
      constraints
    )
  )
    return {valid: false, moves: simMoves, movedCount: 0, movedVolume: 0}

  // Update simulation state for the victim
  simMoves.set(victim, newPlacement)
  setPlacementOccupancyInMap(newPlacement, victim, simOccupied)

  const stack = [{item: victim, placement: newPlacement, dir: direction}]

  // 2. Delegate to DFS Propagation
  const success = propagateGridPush(
    stack,
    simMoves,
    simOccupied,
    gridCells,
    placements,
    constraints,
    maxIterations,
    itemToPlace,
    targetPlacement
  )

  if (!success) {
    return {valid: false, moves: simMoves, movedCount: 0, movedVolume: 0}
  }

  // Calculate metrics
  let volume = 0
  for (const [, mPlace] of simMoves) {
    volume += mPlace.colSpan * mPlace.rowSpan * mPlace.layerSpan
  }

  return {valid: true, moves: simMoves, movedCount: simMoves.size, movedVolume: volume}
}

/**
 * Simulates an "Omni-Directional" push strategy.
 * It tries to push conflicting items away from the target placement.
 *
 * @param itemToPlace - The item being placed.
 * @param targetPlacement - The desired placement for the item.
 * @param pusherGridCenter - The virtual center of the pusher in grid coordinates (used for exact overlap ties).
 * @param placements - Map of current item placements.
 * @param gridCells - Map of grid cells to items.
 * @param occupiedMin - Minimum occupied coordinates (optimization).
 * @param occupiedMax - Maximum occupied coordinates (optimization).
 * @param constraints - Grid constraints.
 * @param maxIterations - Max iterations for push propagation.
 * @returns Map of moves if successful, undefined otherwise.
 */
export function simulateOmniGridPush<T>(
  itemToPlace: T,
  targetPlacement: GridPlacement,
  pusherGridCenter: {x: number; y: number; z: number},
  placements: Map<T, GridPlacement>,
  gridCells: Map<number, T>,
  occupiedMin: GridCoordinate,
  occupiedMax: GridCoordinate,
  constraints: GridBoundsConstraints,
  maxIterations: number
): Map<T, GridPlacement> | undefined {
  const moves = new Map<T, GridPlacement>()
  // Spatial lookup to optimize conflict checks
  const occupiedCells = new DeltaOccupancyMap<T>(gridCells)
  const probeOccupancy = new DeltaOccupancyMap<T>(occupiedCells)

  const targetCenterX = getGridPlacementCenter(targetPlacement, Axis.X)
  const targetCenterY = getGridPlacementCenter(targetPlacement, Axis.Y)
  const targetCenterZ = getGridPlacementCenter(targetPlacement, Axis.Z)

  // 1. Identify immediate collisions with the target placement
  const initialCollisions = queryGridRegion(
    targetPlacement.col,
    targetPlacement.row,
    targetPlacement.layer,
    targetPlacement.colSpan,
    targetPlacement.rowSpan,
    targetPlacement.layerSpan,
    placements,
    gridCells,
    occupiedMin,
    occupiedMax,
    constraints
  )

  // 1.1 Allocate sort buffer outside the loop to avoid garbage
  const directionBuffer = [...BFS_DIRECTIONS_ORDER]

  const candX = {axis: Axis.X, val: 0, dir: 0}
  const candY = {axis: Axis.Y, val: 0, dir: 0}
  const candZ = {axis: Axis.Z, val: 0, dir: 0}
  const candidatesBuffer = [candX, candY, candZ]

  for (const victim of initialCollisions) {
    if (victim === itemToPlace) continue

    // Use current move if available, otherwise original placement
    const victimPlacement = moves.get(victim) || placements.get(victim)
    if (!victimPlacement) continue

    // If already moved, check if it still conflicts. If not, we can skip.
    if (moves.has(victim)) {
      if (!doGridPlacementsIntersect(victimPlacement, targetPlacement)) {
        continue
      }
    }

    const victimCenterX = getGridPlacementCenter(victimPlacement, Axis.X)
    const victimCenterY = getGridPlacementCenter(victimPlacement, Axis.Y)
    const victimCenterZ = getGridPlacementCenter(victimPlacement, Axis.Z)

    // Calculate vector from target to victim
    const dx = victimCenterX - targetCenterX
    const dy = victimCenterY - targetCenterY
    const dz = victimCenterZ - targetCenterZ

    // Determine dominant axis
    const absDx = Math.abs(dx)
    const absDy = Math.abs(dy)
    const absDz = Math.abs(dz)

    if (absDx === 0 && absDy === 0 && absDz === 0) {
      // Exact overlap: use specialized logic based on incoming direction of the placed item
      const pushDx = pusherGridCenter.x - targetCenterX
      const pushDy = pusherGridCenter.y - targetCenterY
      const pushDz = pusherGridCenter.z - targetCenterZ

      // Sort candidates by dot product with incoming vector (ascending/most negative first)
      // We prefer directions that are "opposite" to the incoming vector (negative dot product)
      sortDirectionsByTargetAlignment(directionBuffer, {x: pushDx, y: pushDy, z: pushDz})

      let bestResult: {
        dir: {x: number; y: number; z: number}
        valid: boolean
        moves: Map<T, GridPlacement>
        movedCount: number
        movedVolume: number
      } | null = null

      for (const dir of directionBuffer) {
        const result = simulateGridPushInDirection(
          victim,
          dir,
          targetPlacement,
          moves,
          occupiedCells,
          gridCells,
          placements,
          constraints,
          maxIterations,
          itemToPlace,
          probeOccupancy
        )
        if (!result.valid) continue

        const currentDot = dir.x * pushDx + dir.y * pushDy + dir.z * pushDz

        if (!bestResult) {
          bestResult = {dir, ...result}
        } else {
          const bestDot = bestResult.dir.x * pushDx + bestResult.dir.y * pushDy + bestResult.dir.z * pushDz

          // If current direction is significantly less "opposite" (worse dot product), stop looking.
          if (currentDot > bestDot) {
            break
          }

          // Compare metrics for tie-breaking "equally opposite" directions
          if (result.movedCount < bestResult.movedCount) {
            bestResult = {dir, ...result}
          } else if (result.movedCount === bestResult.movedCount) {
            if (result.movedVolume < bestResult.movedVolume) {
              bestResult = {dir, ...result}
            }
          }
        }
      }

      if (bestResult) {
        // Merge the moves from the simulation
        for (const [mItem, mPlace] of bestResult.moves) {
          const existing = moves.get(mItem)
          // Update if it's a new item OR the placement is different
          if (
            !existing ||
            existing.col !== mPlace.col ||
            existing.row !== mPlace.row ||
            existing.layer !== mPlace.layer
          ) {
            if (existing) setPlacementOccupancyInMap(existing, null, occupiedCells, mItem)

            moves.set(mItem, mPlace)
            setPlacementOccupancyInMap(mPlace, mItem, occupiedCells)
          }
        }
        continue
      } else {
        return undefined // No solution found
      }
    } else {
      // Fallback strategy: Try axes ordered by separation distance (largest overlap/dist first)
      candY.val = absDy
      candY.dir = dy
      candX.val = absDx
      candX.dir = dx
      candZ.val = absDz
      candZ.dir = dz

      candidatesBuffer.sort((a, b) => b.val - a.val)

      let bestResult: {
        moves: Map<T, GridPlacement>
        movedCount: number
        movedVolume: number
        val: number
      } | null = null

      for (const cand of candidatesBuffer) {
        let sign = 0
        if (cand.axis === Axis.Y) sign = dy >= 0 ? 1 : -1
        else if (cand.axis === Axis.X) sign = dx >= 0 ? 1 : -1
        else sign = dz >= 0 ? 1 : -1

        const testDir = {x: 0, y: 0, z: 0}
        if (cand.axis === Axis.X) testDir.x = sign
        else if (cand.axis === Axis.Y) testDir.y = sign
        else testDir.z = sign

        const result = simulateGridPushInDirection(
          victim,
          testDir,
          targetPlacement,
          moves,
          occupiedCells,
          gridCells,
          placements,
          constraints,
          maxIterations,
          itemToPlace,
          probeOccupancy
        )
        if (result.valid) {
          if (!bestResult) {
            bestResult = {...result, val: cand.val}
          } else {
            const isDominanceEqual = Math.abs(bestResult.val - cand.val) < 0.001

            if (isDominanceEqual) {
              if (result.movedCount < bestResult.movedCount) {
                bestResult = {...result, val: cand.val}
              } else if (result.movedCount === bestResult.movedCount) {
                if (result.movedVolume < bestResult.movedVolume) {
                  bestResult = {...result, val: cand.val}
                }
              }
            }
          }
        }
      }

      if (bestResult) {
        for (const [mItem, mPlace] of bestResult.moves) {
          const existing = moves.get(mItem)
          if (
            !existing ||
            existing.col !== mPlace.col ||
            existing.row !== mPlace.row ||
            existing.layer !== mPlace.layer
          ) {
            if (existing) setPlacementOccupancyInMap(existing, null, occupiedCells, mItem)
            moves.set(mItem, mPlace)
            setPlacementOccupancyInMap(mPlace, mItem, occupiedCells)
          }
        }
      } else {
        return undefined
      }
    }
  }

  return moves
}

// ═══════════════════════════════════════════════════════════════════════════
// POSITION CALCULATION (REFLOW)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Calculates the offset for aligning an item within a cell/available space.
 * @param alignment - The alignment string ("-", "+", "", "*").
 * @param availableSpace - The total available space.
 * @param itemSize - The size of the item.
 * @returns The calculated offset.
 */
function calculateCellAlignmentOffset(alignment: string, availableSpace: number, itemSize: number): number {
  switch (alignment) {
    case "-": // Start alignment
      return itemSize / 2
    case "+": // End alignment
      return availableSpace - itemSize / 2
    case "": // Center alignment
    case "*": // Treat stretch alignment as center alignment
    default:
      return availableSpace / 2
  }
}

/**
 * Calculates the position along a single axis for an item within its cell(s).
 *
 * @param index - The cell index (col, row, or layer).
 * @param span - The number of cells the item spans along this axis.
 * @param cellSize - The size of each cell along this axis.
 * @param spacing - The spacing between cells along this axis.
 * @param itemSize - The size of the item along this axis.
 * @param alignment - The alignment setting ("-" for start, "" for center, "+" for end) (treat "*" as center).
 * @returns The local position along this axis.
 */
function convertGridIndexToLocalPosition(
  index: number,
  span: number,
  cellSize: number,
  spacing: number,
  itemSize: number,
  alignment: string
): number {
  // Calculate the start position of the first cell
  const cellStart = index * (cellSize + spacing)

  // Calculate the total available space for the item (span cells + spacing between them)
  const availableSpace = span * cellSize + (span - 1) * spacing

  // Calculate offset within the available space based on alignment
  const offset = calculateCellAlignmentOffset(alignment, availableSpace, itemSize)

  return cellStart + offset
}

/**
 * Calculates the local position of a grid item based on its placement and grid metrics.
 *
 * @param placement - The item's grid placement (indices and spans).
 * @param itemSize - The item's size (width, height, depth).
 * @param alignment - The item's alignment per axis.
 * @param metrics - The grid configuration metrics (cell size, spacing, padding, anchor offsets).
 * @returns The calculated local position (vec3).
 */
export function calculateGridItemLocalPosition(
  placement: GridPlacement,
  itemSize: Size3D,
  alignment: {x: string; y: string; z: string},
  metrics: GridMetrics
): vec3 {
  return new vec3(
    convertGridIndexToLocalPosition(
      placement.col,
      placement.colSpan,
      metrics.cellSize.x,
      metrics.spacing.x,
      itemSize.width,
      alignment.x
    ) +
      metrics.paddingStart.x -
      metrics.anchorOffset.x,
    convertGridIndexToLocalPosition(
      placement.row,
      placement.rowSpan,
      metrics.cellSize.y,
      metrics.spacing.y,
      itemSize.height,
      alignment.y
    ) +
      metrics.paddingStart.y -
      metrics.anchorOffset.y,
    convertGridIndexToLocalPosition(
      placement.layer,
      placement.layerSpan,
      metrics.cellSize.z,
      metrics.spacing.z,
      itemSize.depth,
      alignment.z
    ) +
      metrics.paddingStart.z -
      metrics.anchorOffset.z
  )
}

/**
 * Gets the center coordinate of a placement along a specific axis.
 */
function getGridPlacementCenter(placement: GridPlacement, axis: Axis): number {
  switch (axis) {
    case Axis.X:
      return placement.col + placement.colSpan / 2
    case Axis.Y:
      return placement.row + placement.rowSpan / 2
    case Axis.Z:
      return placement.layer + placement.layerSpan / 2
  }
  return 0
}

// ═══════════════════════════════════════════════════════════════════════════
// COORDINATE CONVERSION (PLACEMENT FROM WORLD)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Converts an item's center position to its starting cell index.
 * Calculates where the item's starting edge (left/bottom/back) falls in grid coordinates.
 *
 * @param position - The item's center position along this axis (adjusted for padding).
 * @param cellSize - The size of each cell along this axis.
 * @param spacing - The spacing between cells along this axis.
 * @param itemSize - The size of the item along this axis.
 * @param span - The number of cells the item spans.
 * @param alignment - The alignment setting.
 * @returns The starting cell index (floating point).
 */
function convertLocalPositionToGridIndex(
  position: number,
  cellSize: number,
  spacing: number,
  itemSize: number,
  span: number,
  alignment: string
): number {
  const cellPlusSpacing = cellSize + spacing
  if (cellPlusSpacing <= 0) return 0

  // Calculate available space for alignment offset
  const availableSpace = span * cellSize + (span - 1) * spacing

  const offset = calculateCellAlignmentOffset(alignment, availableSpace, itemSize)

  // index = (position - offset) / stride
  return (position - offset) / cellPlusSpacing
}

/**
 * Calculates a single axis grid index using the provided metrics.
 * Automatically selects the correct dimension (x/y/z) based on the axis parameter.
 *
 * @param axis - The axis to calculate for (X, Y, or Z).
 * @param localPosOnAxis - The local position value along the specified axis.
 * @param metrics - The grid configuration metrics.
 * @param itemSizeOnAxis - The size of the item along the specified axis.
 * @param span - The number of cells the item spans along the specified axis.
 * @param alignment - The alignment setting for the specified axis.
 * @returns The calculated grid index (floating point).
 */
function calculateAxisGridIndex(
  axis: Axis,
  localPosOnAxis: number,
  metrics: GridMetrics,
  itemSizeOnAxis: number,
  span: number,
  alignment: string
): number {
  let cellSize: number, spacing: number, padding: number, anchorOffset: number

  switch (axis) {
    case Axis.X:
      cellSize = metrics.cellSize.x
      spacing = metrics.spacing.x
      padding = metrics.paddingStart.x
      anchorOffset = metrics.anchorOffset.x
      break
    case Axis.Y:
      cellSize = metrics.cellSize.y
      spacing = metrics.spacing.y
      padding = metrics.paddingStart.y
      anchorOffset = metrics.anchorOffset.y
      break
    case Axis.Z:
      cellSize = metrics.cellSize.z
      spacing = metrics.spacing.z
      padding = metrics.paddingStart.z
      anchorOffset = metrics.anchorOffset.z
      break
  }

  const pos = localPosOnAxis - padding + anchorOffset
  return convertLocalPositionToGridIndex(pos, cellSize, spacing, itemSizeOnAxis, span, alignment)
}

/**
 * Calculates a grid placement (indices and spans) from a local position and item size.
 * This is the inverse of calculateGridItemLocalPosition.
 *
 * @param localPos - The local position of the item.
 * @param itemSize - The size of the item.
 * @param alignment - The alignment settings for the item.
 * @param metrics - The grid configuration metrics.
 * @returns The calculated GridPlacement.
 */
function calculateGridPlacementFromLocalPosition(
  localPos: vec3,
  itemSize: Size3D,
  alignment: {x: string; y: string; z: string},
  metrics: GridMetrics
): GridPlacement {
  // Calculate spans
  const {colSpan, rowSpan, layerSpan} = calculateItemSpans(itemSize, metrics)

  return {
    col: calculateAxisGridIndex(Axis.X, localPos.x, metrics, itemSize.width, colSpan, alignment.x),
    row: calculateAxisGridIndex(Axis.Y, localPos.y, metrics, itemSize.height, rowSpan, alignment.y),
    layer: calculateAxisGridIndex(Axis.Z, localPos.z, metrics, itemSize.depth, layerSpan, alignment.z),
    colSpan,
    rowSpan,
    layerSpan
  }
}

/**
 * Calculates grid placement from a world position.
 * Convenience wrapper that handles world-to-local transformation.
 *
 * @param worldPos - The world position of the item.
 * @param gridInverseTransform - The inverse world transform of the grid.
 * @param itemSize - The size of the item.
 * @param alignment - The alignment settings for the item.
 * @param metrics - The grid configuration metrics.
 * @returns The calculated GridPlacement.
 */
export function calculatePlacementFromWorldPosition(
  worldPos: vec3,
  gridInverseTransform: mat4,
  itemSize: Size3D,
  alignment: {x: string; y: string; z: string},
  metrics: GridMetrics
): GridPlacement {
  const localPos = gridInverseTransform.multiplyPoint(worldPos)

  return calculateGridPlacementFromLocalPosition(localPos, itemSize, alignment, metrics)
}

// ═══════════════════════════════════════════════════════════════════════════
// BFS SEARCH
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Helper to pick the best placement from a list of BFS candidates based on fill order.
 * Candidates array is expected to be flat: [col, row, layer, col, row, layer, ...]
 */
function pickBestBFSPlacement(
  candidates: number[],
  colSpan: number,
  rowSpan: number,
  layerSpan: number
): GridPlacement | undefined {
  if (candidates.length === 0) return undefined

  let bestCol = candidates[0]
  let bestRow = candidates[1]
  let bestLayer = candidates[2]

  // Iterate through remaining candidates (stride of 3)
  for (let i = 3; i < candidates.length; i += 3) {
    const c = candidates[i]
    const r = candidates[i + 1]
    const l = candidates[i + 2]

    // Compare fill order: col, then row, then layer (lexicographic sort)
    let better = false
    if (c !== bestCol) better = c < bestCol
    else if (r !== bestRow) better = r < bestRow
    else better = l < bestLayer

    if (better) {
      bestCol = c
      bestRow = r
      bestLayer = l
    }
  }

  return {
    col: bestCol,
    row: bestRow,
    layer: bestLayer,
    colSpan,
    rowSpan,
    layerSpan
  }
}

/**
 * Finds the closest available placement using BFS.
 */
export function findClosestAvailableGridPlacement<T>(
  startCol: number,
  startRow: number,
  startLayer: number,
  colSpan: number,
  rowSpan: number,
  layerSpan: number,
  placements: Map<T, GridPlacement>,
  gridCells: Map<number, T>,
  constraints: GridBoundsConstraints,
  maxIterations: number,
  context?: GridSearchContext
): GridPlacement | undefined {
  // Determine start cell
  let startCellCol = Math.round(startCol)
  let startCellRow = Math.round(startRow)
  let startCellLayer = Math.round(startLayer)

  // Ensure start cell is at least 0 if fixed
  if (constraints.fixedColumns) startCellCol = Math.max(0, startCellCol)
  if (constraints.fixedRows) startCellRow = Math.max(0, startCellRow)
  if (constraints.fixedLayers) startCellLayer = Math.max(0, startCellLayer)

  // If fixed, clamp to max valid index
  if (constraints.fixedColumns) {
    const maxValidCol = Math.max(0, constraints.maxColumns - colSpan)
    startCellCol = Math.min(maxValidCol, startCellCol)
  }
  if (constraints.fixedRows) {
    const maxValidRow = Math.max(0, constraints.maxRows - rowSpan)
    startCellRow = Math.min(maxValidRow, startCellRow)
  }
  if (constraints.fixedLayers) {
    const maxValidLayer = Math.max(0, constraints.maxLayers - layerSpan)
    startCellLayer = Math.min(maxValidLayer, startCellLayer)
  }

  // Setup buffers
  const visited = context?.visited ?? new Set<number>()
  if (context) context.visited.clear()

  visited.add(getCellKey(startCellCol, startCellRow, startCellLayer))

  const stride = 4
  const requiredSize = maxIterations * stride
  let queueData: Int32Array

  if (context) {
    queueData = context.ensureQueueSize(requiredSize)
  } else {
    queueData = new Int32Array(requiredSize)
  }

  const candidates = context?.candidates ?? []
  candidates.length = 0

  let head = 0
  let tail = 0

  // Push start
  queueData[tail++] = startCellCol
  queueData[tail++] = startCellRow
  queueData[tail++] = startCellLayer
  queueData[tail++] = 0

  let currentDistance = 0
  let iterations = 0

  while (head < tail) {
    if (iterations++ > maxIterations) {
      break
    }

    const col = queueData[head++]
    const row = queueData[head++]
    const layer = queueData[head++]
    const distance = queueData[head++]

    // If we've moved to a new distance level, check if we have candidates from the previous level
    if (distance > currentDistance) {
      const bestPlacement = pickBestBFSPlacement(candidates, colSpan, rowSpan, layerSpan)
      if (bestPlacement) {
        return bestPlacement
      }
      currentDistance = distance
      candidates.length = 0
    }

    // Check if this position is within bounds and available
    if (checkGridRegionAvailability(col, row, layer, colSpan, rowSpan, layerSpan, placements, gridCells, constraints)) {
      candidates.push(col, row, layer)
    }

    // Add neighbors to the queue
    for (const {x, y, z} of BFS_DIRECTIONS_ORDER) {
      const newCol = col + x
      const newRow = row + y
      const newLayer = layer + z

      // Skip if out of bounds
      if (!isCellWithinGridBounds(newCol, newRow, newLayer, constraints)) continue

      const key = getCellKey(newCol, newRow, newLayer)

      // Skip if already visited
      if (visited.has(key)) continue
      visited.add(key)

      if (tail + stride <= queueData.length) {
        queueData[tail++] = newCol
        queueData[tail++] = newRow
        queueData[tail++] = newLayer
        queueData[tail++] = distance + 1
      }
    }
  }

  // Check any remaining candidates after BFS completes
  return pickBestBFSPlacement(candidates, colSpan, rowSpan, layerSpan)
}

// ═══════════════════════════════════════════════════════════════════════════
// REBUILD / REPACK
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Helper to check if two placements are different.
 */
export function haveGridPlacementsChanged(a: GridPlacement, b: GridPlacement): boolean {
  return (
    a.col !== b.col ||
    a.row !== b.row ||
    a.layer !== b.layer ||
    a.colSpan !== b.colSpan ||
    a.rowSpan !== b.rowSpan ||
    a.layerSpan !== b.layerSpan
  )
}

/**
 * Calculates repacked placements for a list of items.
 * Used during grid structure rebuilding (reflow).
 *
 * @param items - The items to repack.
 * @param oldPlacements - The previous placements of the items (if any).
 * @param metrics - The current grid metrics.
 * @param constraints - The grid bounds constraints.
 * @param addOrder - The order to add items (e.g. LargestFirst).
 * @param maxIterations - Maximum iterations for BFS search.
 * @param getPreferredPlacement - Callback to get the preferred placement for an item (usually calculated from its transform).
 * @returns A new map of item placements.
 */
export function calculateRepackedPlacements<T extends Size3D>(
  items: T[],
  oldPlacements: Map<T, GridPlacement>,
  metrics: GridMetrics,
  constraints: GridBoundsConstraints,
  addOrder: AddOrder,
  maxIterations: number,
  getPreferredPlacement: (item: T) => GridPlacement
): Map<T, GridPlacement> {
  const newPlacements = new Map<T, GridPlacement>()
  const gridCells = new Map<number, T>()

  // Sort items
  const sortedItems = [...items]
  if (addOrder !== AddOrder.AsIs) {
    sortedItems.sort((a, b) => compareVolumes(a, b, addOrder))
  }

  const itemsWithoutPlacement: T[] = []

  for (const item of sortedItems) {
    const oldPlacement = oldPlacements.get(item)
    let placed = false

    // 1. Try to preserve old placement if exists
    if (oldPlacement) {
      const {colSpan, rowSpan, layerSpan} = calculateItemSpans(item, metrics)

      if (
        checkGridRegionAvailability(
          oldPlacement.col,
          oldPlacement.row,
          oldPlacement.layer,
          colSpan,
          rowSpan,
          layerSpan,
          newPlacements,
          gridCells,
          constraints
        )
      ) {
        const placement = {
          col: oldPlacement.col,
          row: oldPlacement.row,
          layer: oldPlacement.layer,
          colSpan,
          rowSpan,
          layerSpan
        }
        newPlacements.set(item, placement)
        setPlacementOccupancyInMap(placement, item, gridCells)
        placed = true
      }
    }

    // 2. Try preferred placement (calculated from item's transform)
    if (!placed) {
      const preferred = getPreferredPlacement(item)
      const floored = floorGridPlacement(preferred)
      if (
        checkGridRegionAvailability(
          floored.col,
          floored.row,
          floored.layer,
          floored.colSpan,
          floored.rowSpan,
          floored.layerSpan,
          newPlacements,
          gridCells,
          constraints
        )
      ) {
        newPlacements.set(item, floored)
        setPlacementOccupancyInMap(floored, item, gridCells)
        placed = true
      }
    }

    if (!placed) {
      itemsWithoutPlacement.push(item)
    }
  }

  // 3. Find closest available for remaining items
  const searchContext = new GridSearchContext()
  for (const item of itemsWithoutPlacement) {
    const oldPlacement = oldPlacements.get(item)
    // If we had an old placement, try to find closest to THAT.
    // If not, try to find closest to preferred/calculated placement.
    const startPlacement = oldPlacement || getPreferredPlacement(item)

    // Recalculate spans for current config
    const {colSpan, rowSpan, layerSpan} = calculateItemSpans(item, metrics)

    const bestPlacement = findClosestAvailableGridPlacement(
      startPlacement.col,
      startPlacement.row,
      startPlacement.layer,
      colSpan,
      rowSpan,
      layerSpan,
      newPlacements,
      gridCells,
      constraints,
      maxIterations,
      searchContext
    )

    if (bestPlacement) {
      newPlacements.set(item, bestPlacement)
      setPlacementOccupancyInMap(bestPlacement, item, gridCells)
    }
  }

  return newPlacements
}

// ═══════════════════════════════════════════════════════════════════════════
// ANCHOR OFFSETS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Calculates the position offset based on the anchor setting.
 * Only applies when the corresponding axis is fixed.
 */
function calculateGridAnchorOffset(
  isFixed: boolean,
  maxCells: number,
  cellSize: number,
  spacing: number,
  paddingStart: number,
  paddingEnd: number,
  anchor: Anchor | string
): number {
  if (!isFixed) return 0
  if (anchor === Anchor.Start) return 0

  const totalSize = calculateTotalGridSizeAlongAxis(maxCells, cellSize, spacing, paddingStart, paddingEnd)

  if (anchor === Anchor.Center) return totalSize / 2
  if (anchor === Anchor.End) return totalSize

  return 0
}

/**
 * Calculates the comprehensive anchor offset for a grid axis, including
 * the offset derived from the start index of the effective grid content.
 *
 * @param isFixed - Whether the axis is fixed size in the grid config.
 * @param maxCells - The maximum number of cells allowed (if fixed).
 * @param occupiedMin - The minimum occupied index on this axis.
 * @param occupiedMax - The maximum occupied index on this axis.
 * @param cellSize - The size of cells on this axis.
 * @param spacing - The spacing between cells on this axis.
 * @param paddingStart - The start padding on this axis.
 * @param paddingEnd - The end padding on this axis.
 * @param anchor - The anchor setting for this axis.
 * @returns The total offset value to apply to item positions on this axis.
 */
export function calculateAxisAnchorOffset(
  isFixed: boolean,
  maxCells: number,
  occupiedMin: number,
  occupiedMax: number,
  cellSize: number,
  spacing: number,
  paddingStart: number,
  paddingEnd: number,
  anchor: Anchor | string
): number {
  const dim = calculateEffectiveGridAxisDimension(isFixed, maxCells, occupiedMin, occupiedMax)

  const anchorOffset = calculateGridAnchorOffset(
    true, // Always treat as fixed for the purpose of calculating alignment within the effective bounds
    dim.count,
    cellSize,
    spacing,
    paddingStart,
    paddingEnd,
    anchor
  )

  // Add the offset from the start index
  return anchorOffset + dim.start * (cellSize + spacing)
}
