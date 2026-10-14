import {Anchor, Axis, WrapDirection} from "../Components/Layout/LayoutConfigurationTypes"
import {DIRECTIONAL_ALIGNMENT_MAPPING} from "./DirectionalLayoutUtilities"
import {getCellKey} from "./GridLayoutUtilities"
import {WRAP_DIRECTION_INFO} from "./LayoutUtilities"
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
  /** White - DirectionalLayout origin sphere */
  origin: new vec4(1, 1, 1, 1),
  /** Red - X-axis (horizontal) direction */
  axisX: new vec4(1, 0.2, 0.2, 1),
  /** Green - Y-axis (vertical) direction */
  axisY: new vec4(0.2, 1, 0.2, 1),
  /** Blue - Z-axis (depth) direction */
  axisZ: new vec4(0.2, 0.5, 1, 1),
  /** Yellow/Gold - combined direction line */
  combined: new vec4(1, 0.8, 0, 1),
  /** Magenta/Pink - wrap direction line */
  wrap: new vec4(1, 0.4, 1, 1),
  /** Green - GridLayout empty cell */
  gridEmptyCell: new vec4(0.2, 0.8, 0.4, 1),
  /** Yellow/Gold - GridLayout occupied cell */
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

/**
 * Zero vector constant.
 */
const VEC3_ZERO = new vec3(0, 0, 0)

/**
 * Maps Axis enum to vec3 property name for indexed access.
 */
const AXIS_TO_PROPERTY: Readonly<Record<Axis, "x" | "y" | "z">> = {
  [Axis.X]: "x",
  [Axis.Y]: "y",
  [Axis.Z]: "z"
}

// ═══════════════════════════════════════════════════════════════════════════
// ALIGNMENT MAP (used for direction multiplier and anchor lookup)
// ═══════════════════════════════════════════════════════════════════════════

// Using shared mapping from LayoutUtilities
const ALIGNMENT_MAP = DIRECTIONAL_ALIGNMENT_MAPPING

// ═══════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Axis bounds with start and end positions.
 */
type AxisBounds = {start: number; end: number}

/**
 * Row information for wrapped layouts.
 */
type RowInfo = {
  mainAxisMin: number
  mainAxisMax: number
  wrapAxisPosition: number
}

/**
 * Child data for deriving row information.
 */
type ChildData = {
  position: vec3
  size: vec3
}

/**
 * Axis layout data for calculating item bounds.
 */
type AxisLayoutData = {
  itemsLength: number
  paddingStart: number
  paddingEnd: number
}

/**
 * Configuration for DirectionalLayout debug rendering.
 */
type DirectionalLayoutDebugConfig = {
  transform: Transform
  primaryDirection: Axis
  childAlignmentX: string
  childAlignmentY: string
  childAlignmentZ: string
  fixedWidth: boolean
  fixedHeight: boolean
  fixedDepth: boolean
  width: number
  height: number
  depth: number
  anchorX: Anchor
  anchorY: Anchor
  anchorZ: Anchor
  wrapToSecondaryAxis: boolean
  secondaryDirection: WrapDirection
  /** Layout data for each axis (for calculating item bounds) */
  axisLayoutData: {
    x: AxisLayoutData
    y: AxisLayoutData
    z: AxisLayoutData
  }
  /** Children data for wrapped layouts (position and size) */
  children: ChildData[]
}

/**
 * Configuration for GridLayout debug rendering.
 */
type GridLayoutDebugConfig = {
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
// GRIDLAYOUT DEBUG RENDERING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Renders debug visualization for GridLayout.
 * - Draws a white sphere at the grid origin
 * - Draws wireframe boxes for each cell in the grid
 * - Empty cells are drawn in green, occupied cells in yellow/gold
 *
 * @param config - The configuration for grid debug rendering.
 */
export function renderGridLayoutDebug(config: GridLayoutDebugConfig): void {
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

// ═══════════════════════════════════════════════════════════════════════════
// DIRECTIONALLAYOUT DEBUG RENDERING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Renders debug visualization for DirectionalLayout.
 * - Draws a white sphere at the origin
 * - Draws colored lines for each enabled axis direction showing alignment
 * - Draws a yellow/gold line for the combined direction
 * - Draws wrap direction lines when wrapping is enabled
 *
 * @param config - The configuration for debug rendering.
 */
export function renderDirectionalLayoutDebug(config: DirectionalLayoutDebugConfig): void {
  const worldPosition = config.transform.getWorldPosition()
  const worldRotation = config.transform.getWorldRotation()

  // Draw a sphere at the origin
  global.debugRenderSystem.drawSphere(worldPosition, DebugSizes.sphereRadius, DebugColors.origin)

  // Draw individual axis lines for enabled directions, showing alignment
  if (config.primaryDirection === Axis.X) {
    drawAxisAlignmentLine(
      worldPosition,
      worldRotation,
      AXIS_VECTORS[Axis.X],
      config.childAlignmentX,
      config.fixedWidth ? config.width : DebugSizes.lineLength,
      DebugColors.axisX,
      config.fixedWidth,
      config.anchorX
    )
  }

  if (config.primaryDirection === Axis.Y) {
    drawAxisAlignmentLine(
      worldPosition,
      worldRotation,
      AXIS_VECTORS[Axis.Y],
      config.childAlignmentY,
      config.fixedHeight ? config.height : DebugSizes.lineLength,
      DebugColors.axisY,
      config.fixedHeight,
      config.anchorY
    )
  }

  if (config.primaryDirection === Axis.Z) {
    drawAxisAlignmentLine(
      worldPosition,
      worldRotation,
      AXIS_VECTORS[Axis.Z],
      config.childAlignmentZ,
      config.fixedDepth ? config.depth : DebugSizes.lineLength,
      DebugColors.axisZ,
      config.fixedDepth,
      config.anchorZ
    )
  }

  // Draw combined direction line
  drawCombinedDirectionLine(config, worldPosition, worldRotation)
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Gets the single enabled item axis.
 * @returns The item axis, or null if none or multiple are enabled.
 */
function getItemAxis(config: DirectionalLayoutDebugConfig): Axis | null {
  switch (config.primaryDirection) {
    case Axis.X:
      return Axis.X
    case Axis.Y:
      return Axis.Y
    case Axis.Z:
      return Axis.Z
    default:
      return null
  }
}

/**
 * Derives row information from child positions.
 * Groups children by their wrap axis position and calculates bounds for each row.
 */
function deriveRowsFromChildren(children: ChildData[], mainAxis: Axis, wrapAxis: Axis): RowInfo[] {
  if (children.length === 0) return []

  // Group children by wrap axis position using tolerance-based bucketing
  const tolerance = DebugSizes.tolerance
  const rowMap = new Map<number, ChildData[]>()

  for (const child of children) {
    const wrapPos = child.position[AXIS_TO_PROPERTY[wrapAxis]]
    // Round to tolerance bucket for O(1) lookup
    const bucketKey = Math.round(wrapPos / tolerance) * tolerance

    const existing = rowMap.get(bucketKey)
    if (existing !== undefined) {
      existing.push(child)
    } else {
      rowMap.set(bucketKey, [child])
    }
  }

  // Convert to array and calculate bounds for each row
  const rows: RowInfo[] = []

  for (const [wrapAxisPosition, rowChildren] of rowMap) {
    let mainAxisMin = Infinity
    let mainAxisMax = -Infinity

    for (const child of rowChildren) {
      const mainPos = child.position[AXIS_TO_PROPERTY[mainAxis]]
      const mainSize = child.size[AXIS_TO_PROPERTY[mainAxis]]
      const halfSize = mainSize / 2

      mainAxisMin = Math.min(mainAxisMin, mainPos - halfSize)
      mainAxisMax = Math.max(mainAxisMax, mainPos + halfSize)
    }

    rows.push({mainAxisMin, mainAxisMax, wrapAxisPosition})
  }

  // Sort rows by wrap axis position
  rows.sort((a, b) => a.wrapAxisPosition - b.wrapAxisPosition)

  return rows
}

/**
 * Calculates the start and end positions of items along an axis.
 *
 * @param layoutData - The layout data for this axis.
 * @param alignmentSign - The alignment sign ("-", "+", "", or "*").
 * @param isFixedSize - Whether the layout has a fixed size.
 * @param layoutSize - The fixed layout size (used when isFixedSize is true).
 * @param anchor - The anchor position (used for stretch alignment).
 * @returns Object with start and end positions along the axis.
 */
function calculateAxisItemBounds(
  layoutData: AxisLayoutData,
  alignmentSign: string,
  isFixedSize: boolean,
  layoutSize: number,
  anchor: Anchor
): AxisBounds {
  const {itemsLength, paddingStart, paddingEnd} = layoutData

  // For Stretch alignment with fixed size
  if (alignmentSign === "*" && isFixedSize) {
    const layoutStart = calculateFlexibleStartOffset(anchor, layoutSize, 0, 0)
    const itemStart = layoutStart + paddingStart
    const itemEnd = itemStart + itemsLength
    return {start: itemStart, end: itemEnd}
  }

  // For fixed-size non-stretch layouts
  if (isFixedSize) {
    const layoutStart = calculateFlexibleStartOffset(anchor, layoutSize, 0, 0)

    switch (alignmentSign) {
      case "-": {
        const start = layoutStart + paddingStart
        const end = start + itemsLength
        return {start, end}
      }
      case "+": {
        const end = layoutStart + layoutSize - paddingEnd
        const start = end - itemsLength
        return {start, end}
      }
      case "":
      default: {
        const layoutCenter = layoutStart + layoutSize / 2
        const halfItems = itemsLength / 2
        return {start: layoutCenter - halfItems, end: layoutCenter + halfItems}
      }
    }
  }

  // For flexible-size layouts
  switch (alignmentSign) {
    case "-": {
      const start = paddingStart
      const end = paddingStart + itemsLength
      return {start, end}
    }
    case "+": {
      const end = -paddingEnd
      const start = -paddingEnd - itemsLength
      return {start, end}
    }
    case "":
    default: {
      const halfItems = itemsLength / 2
      return {start: -halfItems, end: halfItems}
    }
  }
}

/**
 * Checks if the alignment sign represents center or stretch alignment.
 */
function isCenterOrStretch(alignmentSign: string): boolean {
  return alignmentSign === "" || alignmentSign === "*"
}

/**
 * Draws alignment visualization line for a single axis.
 * - For start alignment ("-"): Single line in positive direction
 * - For end alignment ("+"): Single line in negative direction
 * - For center/stretch alignment ("" or "*"): Lines in both directions from origin
 */
function drawAxisAlignmentLine(
  worldPosition: vec3,
  worldRotation: quat,
  axisVector: vec3,
  alignmentSign: string,
  lineLength: number,
  color: vec4,
  isFixed: boolean = false,
  anchor: Anchor = Anchor.Start
): void {
  if (isFixed) {
    let startOffset = 0
    let endOffset = 0

    if (anchor === Anchor.Center) {
      startOffset = -lineLength / 2
      endOffset = lineLength / 2
    } else if (anchor === Anchor.End) {
      startOffset = -lineLength
      endOffset = 0
    } else {
      startOffset = 0
      endOffset = lineLength
    }

    const startPos = worldPosition.add(worldRotation.multiplyVec3(axisVector.uniformScale(startOffset)))
    const endPos = worldPosition.add(worldRotation.multiplyVec3(axisVector.uniformScale(endOffset)))
    global.debugRenderSystem.drawLine(startPos, endPos, color)
    return
  }

  if (isCenterOrStretch(alignmentSign)) {
    // Center/Stretch alignment: draw lines in both directions
    const posEndPos = worldPosition.add(worldRotation.multiplyVec3(axisVector.uniformScale(lineLength)))
    const negEndPos = worldPosition.add(worldRotation.multiplyVec3(axisVector.uniformScale(-lineLength)))
    global.debugRenderSystem.drawLine(negEndPos, posEndPos, color)
  } else {
    // Start or End alignment: single line in flow direction
    const direction = ALIGNMENT_MAP[alignmentSign].directionMultiplier
    const endPos = worldPosition.add(worldRotation.multiplyVec3(axisVector.uniformScale(lineLength * direction)))
    global.debugRenderSystem.drawLine(worldPosition, endPos, color)
  }
}

/**
 * Draws the combined direction line when multiple axes are enabled.
 * Shows the actual item bounds considering alignment, anchor, and padding.
 * When wrapping is enabled, draws separate lines for each row.
 */
function drawCombinedDirectionLine(
  config: DirectionalLayoutDebugConfig,
  worldPosition: vec3,
  worldRotation: quat
): void {
  // Handle wrapped layout with per-row lines
  if (config.wrapToSecondaryAxis) {
    drawWrappedDirectionLines(config, worldPosition, worldRotation)
    return
  }

  // Axis configuration for iteration
  const axisConfigs = [
    {
      axis: Axis.X,
      enabled: config.primaryDirection === Axis.X,
      layoutData: config.axisLayoutData.x,
      alignment: config.childAlignmentX,
      isFixedSize: config.fixedWidth,
      layoutSize: config.width,
      anchor: config.anchorX
    },
    {
      axis: Axis.Y,
      enabled: config.primaryDirection === Axis.Y,
      layoutData: config.axisLayoutData.y,
      alignment: config.childAlignmentY,
      isFixedSize: config.fixedHeight,
      layoutSize: config.height,
      anchor: config.anchorY
    },
    {
      axis: Axis.Z,
      enabled: config.primaryDirection === Axis.Z,
      layoutData: config.axisLayoutData.z,
      alignment: config.childAlignmentZ,
      isFixedSize: config.fixedDepth,
      layoutSize: config.depth,
      anchor: config.anchorZ
    }
  ]

  // Calculate start and end offsets for each enabled axis
  let startOffset = VEC3_ZERO
  let endOffset = VEC3_ZERO

  for (const axisConfig of axisConfigs) {
    if (!axisConfig.enabled) continue

    const bounds = calculateAxisItemBounds(
      axisConfig.layoutData,
      axisConfig.alignment,
      axisConfig.isFixedSize,
      axisConfig.layoutSize,
      axisConfig.anchor
    )
    const directionMultiplier = ALIGNMENT_MAP[axisConfig.alignment].directionMultiplier
    const boundsStart = directionMultiplier < 0 ? bounds.end : bounds.start
    const boundsEnd = directionMultiplier < 0 ? bounds.start : bounds.end

    startOffset = startOffset.add(AXIS_VECTORS[axisConfig.axis].uniformScale(boundsStart))
    endOffset = endOffset.add(AXIS_VECTORS[axisConfig.axis].uniformScale(boundsEnd))
  }

  // Draw the line from start to end of items
  const startPos = worldPosition.add(worldRotation.multiplyVec3(startOffset))
  const endPos = worldPosition.add(worldRotation.multiplyVec3(endOffset))

  // Only draw if there's a meaningful line (start != end)
  if (startOffset.distance(endOffset) > DebugSizes.tolerance) {
    global.debugRenderSystem.drawLine(startPos, endPos, DebugColors.combined)
  }
}

/**
 * Draws per-row direction lines when wrapping is enabled.
 * Each row gets its own line showing the item bounds along the main axis.
 */
function drawWrappedDirectionLines(
  config: DirectionalLayoutDebugConfig,
  worldPosition: vec3,
  worldRotation: quat
): void {
  const itemAxis = getItemAxis(config)
  if (itemAxis === null) return

  // Get wrap direction info
  const wrapInfo = WRAP_DIRECTION_INFO[config.secondaryDirection]
  if (wrapInfo === undefined) return

  // Derive row information from child positions
  const rows = deriveRowsFromChildren(config.children, itemAxis, wrapInfo.axis)
  if (rows.length === 0) return

  // Get alignment configuration for direction multiplier
  const alignmentByAxis: Record<Axis, string> = {
    [Axis.X]: config.childAlignmentX,
    [Axis.Y]: config.childAlignmentY,
    [Axis.Z]: config.childAlignmentZ
  }
  const alignmentSign = alignmentByAxis[itemAxis]
  const directionMultiplier = ALIGNMENT_MAP[alignmentSign].directionMultiplier

  // Draw a line for each row
  for (const row of rows) {
    // Set main axis bounds (swap based on direction multiplier)
    const mainStart = directionMultiplier < 0 ? row.mainAxisMax : row.mainAxisMin
    const mainEnd = directionMultiplier < 0 ? row.mainAxisMin : row.mainAxisMax

    // Build offsets using helper
    const wrapOffset = AXIS_VECTORS[wrapInfo.axis].uniformScale(row.wrapAxisPosition)
    const startOffset = AXIS_VECTORS[itemAxis].uniformScale(mainStart).add(wrapOffset)
    const endOffset = AXIS_VECTORS[itemAxis].uniformScale(mainEnd).add(wrapOffset)

    // Draw the line for this row
    const startPos = worldPosition.add(worldRotation.multiplyVec3(startOffset))
    const endPos = worldPosition.add(worldRotation.multiplyVec3(endOffset))

    if (startOffset.distance(endOffset) > DebugSizes.tolerance) {
      global.debugRenderSystem.drawLine(startPos, endPos, DebugColors.combined)
    }
  }

  // Draw the wrap direction line showing how far items extend along the wrap axis
  if (rows.length > 1) {
    const wrapStartOffset = AXIS_VECTORS[wrapInfo.axis].uniformScale(rows[0].wrapAxisPosition)
    const wrapEndOffset = AXIS_VECTORS[wrapInfo.axis].uniformScale(rows[rows.length - 1].wrapAxisPosition)

    const wrapStartPos = worldPosition.add(worldRotation.multiplyVec3(wrapStartOffset))
    const wrapEndPos = worldPosition.add(worldRotation.multiplyVec3(wrapEndOffset))

    if (wrapStartOffset.distance(wrapEndOffset) > DebugSizes.tolerance) {
      global.debugRenderSystem.drawLine(wrapStartPos, wrapEndPos, DebugColors.wrap)
    }
  }
}
