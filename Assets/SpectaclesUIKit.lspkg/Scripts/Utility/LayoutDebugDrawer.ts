import {Anchor, Axis} from "../Components/Layout/LayoutConfigurationTypes"
import {getCellKey} from "./SpatialLayoutUtilities"
import {calculateFlexibleStartOffset} from "./SingleAxisLayoutUtilities"

// ═══════════════════════════════════════════════════════════════════════════
// DEBUG CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Debug visualization colors for layout components.
 */
const DebugColors = {
  /** Cyan - LayoutItem bounds */
  item: new vec4(0, 1, 1, 1),
  /** Magenta - SingleAxisLayout bounds */
  singleAxis: new vec4(1, 0, 1, 1),
  /** White - Origin sphere */
  origin: new vec4(1, 1, 1, 1),
  /** Red - X-axis (horizontal) direction */
  axisX: new vec4(1, 0.2, 0.2, 1),
  /** Green - Y-axis (vertical) direction */
  axisY: new vec4(0.2, 1, 0.2, 1),
  /** Blue - Z-axis (depth) direction */
  axisZ: new vec4(0.2, 0.5, 1, 1),
  /** Green - SpatialLayout empty cell */
  gridEmptyCell: new vec4(0.2, 0.8, 0.4, 1),
  /** Yellow/Gold - SpatialLayout occupied cell */
  gridOccupiedCell: new vec4(1, 0.8, 0.2, 1)
} as const

/**
 * Debug visualization sizing constants.
 */
const DebugSizes = {
  /** Default length for debug direction lines */
  lineLength: 5,
  /** Default radius for debug origin spheres */
  sphereRadius: 0.3,
  /** Tolerance for position comparisons */
  tolerance: 0.001
} as const

/**
 * Pre-computed unit vectors for each axis.
 */
const AXIS_VECTORS: Readonly<Record<Axis, vec3>> = {
  [Axis.X]: new vec3(1, 0, 0),
  [Axis.Y]: new vec3(0, 1, 0),
  [Axis.Z]: new vec3(0, 0, 1)
}

// ═══════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Configuration for SpatialLayout debug rendering.
 */
type SpatialLayoutDebugConfig = {
  transform: Transform
  /** Width of each cell (X dimension) */
  cellWidth: number
  /** Height of each cell (Y dimension) */
  cellHeight: number
  /** Depth of each cell (Z dimension) */
  cellDepth: number
  /** Spacing between columns (X-axis) */
  spacingX: number
  /** Spacing between rows (Y-axis) */
  spacingY: number
  /** Spacing between layers (Z-axis) */
  spacingZ: number

  /** Whether columns are fixed */
  fixedColumns: boolean
  /** Whether rows are fixed */
  fixedRows: boolean
  /** Whether layers are fixed */
  fixedLayers: boolean

  /** Maximum number of columns */
  maxColumns: number
  /** Maximum number of rows */
  maxRows: number
  /** Maximum number of layers */
  maxLayers: number

  /** Minimum occupied coordinate */
  occupiedMin: {col: number; row: number; layer: number}
  /** Maximum occupied coordinate */
  occupiedMax: {col: number; row: number; layer: number}

  /** Padding on left side (X-axis, start) */
  paddingLeft: number
  /** Padding on right side (X-axis, end) */
  paddingRight: number
  /** Padding on bottom side (Y-axis, start) */
  paddingBottom: number
  /** Padding on top side (Y-axis, end) */
  paddingTop: number
  /** Padding on back side (Z-axis, start) */
  paddingBack: number
  /** Padding on front side (Z-axis, end) */
  paddingFront: number
  /** Map of occupied cell keys */
  gridCells: Map<number, any>
}

// ═══════════════════════════════════════════════════════════════════════════
// WORLD-SPACE BOX (rotation + scale aware)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Draws a wireframe rectangle in world space using 4 lines.
 * Unlike drawBox (which is axis-aligned), this correctly handles
 * rotation and scale from the transform hierarchy.
 */
export function drawWorldBox(
  center: vec3,
  width: number,
  height: number,
  rot: quat,
  scale: vec3,
  color: vec4
): void {
  const hw = (width * scale.x) * 0.5
  const hh = (height * scale.y) * 0.5
  const right = rot.multiplyVec3(new vec3(hw, 0, 0))
  const up = rot.multiplyVec3(new vec3(0, hh, 0))
  const tl = center.add(up).sub(right)
  const tr = center.add(up).add(right)
  const br = center.sub(up).add(right)
  const bl = center.sub(up).sub(right)
  global.debugRenderSystem.drawLine(tl, tr, color)
  global.debugRenderSystem.drawLine(tr, br, color)
  global.debugRenderSystem.drawLine(br, bl, color)
  global.debugRenderSystem.drawLine(bl, tl, color)
}

// ═══════════════════════════════════════════════════════════════════════════
// LAYOUTITEM DEBUG RENDERING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Renders a debug wireframe box showing the LayoutItem bounds.
 *
 * @param transform - The transform of the item.
 * @param width - The width of the item.
 * @param height - The height of the item.
 * @param depth - The depth of the item.
 */
export function renderLayoutItemDebug(transform: Transform, width: number, height: number, depth: number): void {
  const worldPosition = transform.getWorldPosition()
  global.debugRenderSystem.drawBox(worldPosition, width, height, depth, DebugColors.item)
}

// ═══════════════════════════════════════════════════════════════════════════
// SPATIALLAYOUT DEBUG RENDERING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Renders debug visualization for SpatialLayout.
 * - Draws a white sphere at the grid origin
 * - Draws wireframe boxes for each cell in the grid
 * - Empty cells are drawn in green, occupied cells in yellow/gold
 *
 * @param config - The configuration for grid debug rendering.
 */
export function renderSpatialLayoutDebug(config: SpatialLayoutDebugConfig): void {
  const worldPosition = config.transform.getWorldPosition()
  const worldRotation = config.transform.getWorldRotation()

  // Draw a sphere at the grid origin
  global.debugRenderSystem.drawSphere(worldPosition, DebugSizes.sphereRadius, DebugColors.origin)

  // Calculate render bounds
  // If fixed, use 0 to max. If unbound, use occupied min/max.
  const minCol = config.fixedColumns ? 0 : config.occupiedMin.col === Infinity ? 0 : config.occupiedMin.col
  const minRow = config.fixedRows ? 0 : config.occupiedMin.row === Infinity ? 0 : config.occupiedMin.row
  const minLayer = config.fixedLayers ? 0 : config.occupiedMin.layer === Infinity ? 0 : config.occupiedMin.layer

  const maxCol = config.fixedColumns
    ? config.maxColumns
    : config.occupiedMax.col === -Infinity
      ? 0
      : Math.max(0, config.occupiedMax.col + 1)

  const maxRow = config.fixedRows
    ? config.maxRows
    : config.occupiedMax.row === -Infinity
      ? 0
      : Math.max(0, config.occupiedMax.row + 1)

  const maxLayer = config.fixedLayers
    ? config.maxLayers
    : config.occupiedMax.layer === -Infinity
      ? 0
      : Math.max(0, config.occupiedMax.layer + 1)

  // Draw the overall grid bounds including padding on all sides.
  const strideX = config.cellWidth + config.spacingX
  const strideY = config.cellHeight + config.spacingY
  const strideZ = config.cellDepth + config.spacingZ

  const minX = config.paddingLeft + minCol * strideX
  const maxX = config.paddingLeft + maxCol * strideX - config.spacingX + config.paddingRight

  const minY = config.paddingBottom + minRow * strideY
  const maxY = config.paddingBottom + maxRow * strideY - config.spacingY + config.paddingTop

  const minZ = config.paddingBack + minLayer * strideZ
  const maxZ = config.paddingBack + maxLayer * strideZ - config.spacingZ + config.paddingFront

  const totalWidth = maxX - minX
  const totalHeight = maxY - minY
  const totalDepth = maxZ - minZ

  const localBoundsCenter = new vec3((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2)
  const worldBoundsCenter = worldPosition.add(worldRotation.multiplyVec3(localBoundsCenter))
  global.debugRenderSystem.drawBox(worldBoundsCenter, totalWidth, totalHeight, totalDepth, DebugColors.origin)

  // Iterate through all cells in the grid
  for (let col = minCol; col < maxCol; col++) {
    for (let row = minRow; row < maxRow; row++) {
      for (let layer = minLayer; layer < maxLayer; layer++) {
        // Calculate cell center position in local space (including padding offset)
        const localCellCenter = new vec3(
          config.paddingLeft + col * strideX + config.cellWidth / 2,
          config.paddingBottom + row * strideY + config.cellHeight / 2,
          config.paddingBack + layer * strideZ + config.cellDepth / 2
        )

        // Transform to world space
        const worldCellCenter = worldPosition.add(worldRotation.multiplyVec3(localCellCenter))

        // Check if cell is occupied
        const isOccupied = config.gridCells.has(getCellKey(col, row, layer))

        // Select color based on occupancy
        const color = isOccupied ? DebugColors.gridOccupiedCell : DebugColors.gridEmptyCell

        // Draw the cell as a wireframe box
        global.debugRenderSystem.drawBox(worldCellCenter, config.cellWidth, config.cellHeight, config.cellDepth, color)
      }
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SINGLEAXISLAYOUT DEBUG RENDERING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Renders debug visualization for SingleAxisLayout.
 * - Draws a sphere at the origin
 * - For fixed size: draws a line showing the direction and size based on anchor
 *
 * @param transform - The transform of the layout.
 * @param axis - The axis of the layout (X, Y, or Z).
 * @param anchor - The anchor position (Start, Center, or End).
 * @param size - The size of the layout along the axis.
 * @param flexibleSize - Whether the layout has flexible size.
 */
export function renderSingleAxisLayoutDebug(
  transform: Transform,
  axis: Axis,
  anchor: Anchor,
  size: number,
  flexibleSize: boolean
): void {
  const worldPosition = transform.getWorldPosition()
  const worldRotation = transform.getWorldRotation()

  // Draw a sphere at the origin
  global.debugRenderSystem.drawSphere(worldPosition, DebugSizes.sphereRadius, DebugColors.singleAxis)

  if (!flexibleSize) {
    // Draw a line representing the direction and size for fixed size layouts
    const axisVector = AXIS_VECTORS[axis]
    if (anchor === Anchor.Center) {
      // For center anchor, draw lines in both directions from origin
      const halfSize = size / 2
      const negEndPos = worldPosition.add(worldRotation.multiplyVec3(axisVector.uniformScale(-halfSize)))
      const posEndPos = worldPosition.add(worldRotation.multiplyVec3(axisVector.uniformScale(halfSize)))
      global.debugRenderSystem.drawLine(negEndPos, posEndPos, DebugColors.singleAxis)
    } else {
      // For start/end anchor, draw single line in direction
      const direction = anchor === Anchor.End ? -1 : 1
      const sizeWithDirection = size * direction
      const endPos = worldPosition.add(worldRotation.multiplyVec3(axisVector.uniformScale(sizeWithDirection)))
      global.debugRenderSystem.drawLine(worldPosition, endPos, DebugColors.singleAxis)
    }
  }
}
