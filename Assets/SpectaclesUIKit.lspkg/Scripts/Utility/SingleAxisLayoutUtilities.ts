import {
  Anchor,
  Axis,
  Bounds3D,
  LayoutMaskConfig,
  MutablePosition3D,
  MutableSize3D,
  Range1D,
  SpacingDistribution,
  WrapDirection,
  WrapPositioningConfig,
  WrapPositionResult
} from "../Components/Layout/LayoutConfigurationTypes"
import {calculateTotalLength, WRAP_DIRECTION_INFO} from "./LayoutUtilities"

// ═══════════════════════════════════════════════════════════════════════════
// AXIS INDEX/POSITION UTILITIES
// ═══════════════════════════════════════════════════════════════════════════

/** Maps Axis enum values to tuple indices: x=0, y=1, z=2 */
export const AXIS_TO_INDEX: Record<Axis, number> = {
  [Axis.X]: 0,
  [Axis.Y]: 1,
  [Axis.Z]: 2
}

/**
 * Gets the position value for a specific axis from a vec3.
 * @param position - The position vector.
 * @param axis - The axis to get the position for.
 * @returns The position value along the specified axis.
 */
export function getPositionForAxis(position: vec3, axis: Axis): number {
  switch (axis) {
    case Axis.X:
      return position.x
    case Axis.Y:
      return position.y
    case Axis.Z:
      return position.z
    default:
      return 0
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// LAYOUT CONFIG TYPES
// ═══════════════════════════════════════════════════════════════════════════

type SingleAxisLayoutConfig = {
  flexibleSize: boolean
  alignment: string
  anchor: Anchor
  size: number
  paddingStart: number
  paddingEnd: number
  spacing: number
  reverse: boolean
  spacingDistribution: string
}

// ═══════════════════════════════════════════════════════════════════════════
// POSITION & SIZE SETTERS (Used in Apply/Resize)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Builds a new position vector by setting specific axis values.
 * @param basePosition - The starting position to modify.
 * @param axisValues - Array of axis/value pairs to set.
 * @returns A new vec3 with the specified axis values applied.
 */
export function buildPositionForAxes(basePosition: vec3, axisValues: {axis: "x" | "y" | "z"; value: number}[]): vec3 {
  let x = basePosition.x
  let y = basePosition.y
  let z = basePosition.z

  for (const {axis, value} of axisValues) {
    if (axis === "x") x = value
    else if (axis === "y") y = value
    else if (axis === "z") z = value
  }

  return new vec3(x, y, z)
}

/**
 * Sets the position value for a specific axis on a mutable object.
 * Triggers the position setter to ensure updates are propagated.
 *
 * @param target - The object to modify (must have position setter).
 * @param axis - The axis to set the position for.
 * @param value - The value to set.
 */
export function setPositionForAxisMutable(target: MutablePosition3D, axis: Axis, value: number): void {
  const current = target.position
  const newPos = buildPositionForAxes(current, [{axis: axis as "x" | "y" | "z", value}])
  target.position = newPos
}

/**
 * Sets the size value for a specific axis on a mutable Size3D object.
 * Mutates the object directly instead of returning a new object.
 *
 * @param target - The object to modify (must have width, height, depth setters).
 * @param axis - The axis to set the size for.
 * @param value - The value to set.
 */
export function setSizeForAxisMutable(target: MutableSize3D, axis: Axis, value: number): void {
  switch (axis) {
    case Axis.X:
      target.width = value
      break
    case Axis.Y:
      target.height = value
      break
    case Axis.Z:
      target.depth = value
      break
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// CHILD MANAGEMENT LOGIC
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Filters out duplicate items from a list of new items based on an existing list.
 * @param newItems - The list of new items to filter.
 * @param existingItems - The list of existing items to check against.
 * @param onDuplicate - Optional callback to run when a duplicate is found.
 * @returns The filtered list of unique items.
 */
export function filterDuplicateItems<T>(newItems: T[], existingItems: T[], onDuplicate?: (item: T) => void): T[] {
  const existingSet = new Set(existingItems)
  const uniqueItems: T[] = []

  for (const item of newItems) {
    if (existingSet.has(item)) {
      onDuplicate?.(item)
    } else {
      uniqueItems.push(item)
      existingSet.add(item)
    }
  }
  return uniqueItems
}

// ═══════════════════════════════════════════════════════════════════════════
// CHILD SIZING LOGIC
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Calculates the size for stretchable items in a layout.
 * @param items - Array of items.
 * @param getSize - Function to get the size of an item.
 * @param isFixed - Function to check if an item has a fixed size (not stretchable).
 * @param availableSize - The total size available for the layout.
 * @param totalPadding - The total padding (start + end).
 * @param spacing - The spacing between items.
 * @returns The calculated size for stretchable items.
 */
function calculateStretchedChildSize<T>(
  items: T[],
  getSize: (item: T) => number,
  isFixed: (item: T) => boolean,
  availableSize: number,
  totalPadding: number,
  spacing: number
): number {
  if (items.length === 0) return 0

  let stretchableCount = 0
  let fixedItemsSize = 0

  for (const item of items) {
    if (isFixed(item)) {
      fixedItemsSize += getSize(item)
    } else {
      stretchableCount++
    }
  }

  if (stretchableCount === 0) return 0

  const totalSpacing = spacing * (items.length - 1)
  const remainingSize = availableSize - totalSpacing - totalPadding - fixedItemsSize

  return Math.max(0, remainingSize / stretchableCount)
}

/**
 * Calculates the target size for children along an axis based on layout configuration.
 * Handles "Stretch", "Normalized", and "Absolute" sizing strategies.
 *
 * @param items - Array of items to size.
 * @param getSize - Function to get the current size of an item.
 * @param isOverride - Function to check if an item overrides layout sizing.
 * @param config - Configuration object containing sizing properties.
 * @returns The calculated target size for children.
 */
export function calculateTargetChildSize<T>(
  items: T[],
  getSize: (item: T) => number,
  isOverride: (item: T) => boolean,
  config: {
    autoAlignment: boolean
    flexibleSize: boolean
    alignment: string
    normalizedChildSize: boolean
    layoutSize: number
    childSize: number
    paddingTotal: number
    spacing: number
  }
): number {
  if (config.autoAlignment && !config.flexibleSize && config.alignment === "stretch") {
    // Calculate stretched size
    return calculateStretchedChildSize(
      items,
      getSize,
      isOverride,
      config.layoutSize,
      config.paddingTotal,
      config.spacing
    )
  } else if (!config.flexibleSize && config.normalizedChildSize) {
    // Normalized size (fraction of total)
    return config.layoutSize * config.childSize
  } else {
    // Absolute size
    return config.childSize
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// LAYOUT POSITIONING LOGIC
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Calculates the starting offset for a flexible size layout.
 */
export function calculateFlexibleStartOffset(
  anchor: Anchor,
  totalItemsSize: number,
  paddingStart: number,
  paddingEnd: number
): number {
  if (anchor === Anchor.Center) {
    return -totalItemsSize / 2
  } else if (anchor === Anchor.End) {
    return -totalItemsSize - paddingEnd
  } else {
    return paddingStart
  }
}

/**
 * Calculates the starting offset for a layout based on anchor and alignment.
 * @param containerSize - The total size of the container/layout.
 * @param itemsSize - The total size of the items.
 * @param anchor - The layout anchor point.
 * @param alignment - The item alignment.
 * @param paddingStart - The start padding.
 * @param paddingEnd - The end padding.
 * @returns The calculated starting offset.
 */
function calculateAlignmentOffset(
  containerSize: number,
  itemsSize: number,
  anchor: Anchor,
  alignment: string,
  paddingStart: number,
  paddingEnd: number
): number {
  if (anchor === Anchor.Center) {
    switch (alignment) {
      case "start":
      case "stretch":
      case "stretchSpacing":
        return -containerSize / 2 + paddingStart
      case "center":
        return -itemsSize / 2
      case "end":
        return containerSize / 2 - paddingEnd - itemsSize
      default:
        return -containerSize / 2 + paddingStart
    }
  } else if (anchor === Anchor.End) {
    switch (alignment) {
      case "start":
      case "stretch":
      case "stretchSpacing":
        return -containerSize + paddingStart
      case "center":
        return -(containerSize + itemsSize) / 2
      case "end":
        return -paddingEnd - itemsSize
      default:
        return -containerSize + paddingStart
    }
  } else {
    // Anchor.Start
    switch (alignment) {
      case "start":
      case "stretch":
      case "stretchSpacing":
        return paddingStart
      case "center":
        return (containerSize - itemsSize) / 2
      case "end":
        return containerSize - itemsSize - paddingEnd
      default:
        return paddingStart
    }
  }
}

/**
 * Calculates positions for items arranged sequentially.
 * @param itemSizes - Array of item sizes.
 * @param startOffset - The starting offset for the first item.
 * @param spacing - Spacing between items.
 * @param reverse - Whether to map positions in reverse order.
 * @returns Array of center positions.
 */
function calculateSequentialPositions(
  itemSizes: number[],
  startOffset: number,
  spacing: number,
  reverse: boolean
): number[] {
  const count = itemSizes.length
  const positions = new Array(count)
  let currentOffset = startOffset

  for (let i = 0; i < count; i++) {
    const size = itemSizes[i]
    const centerOffset = currentOffset + size / 2

    // When reversed, we map the calculated position (which is always first-to-last physically)
    // to the last item in the list
    const targetIndex = reverse ? count - 1 - i : i
    positions[targetIndex] = centerOffset

    currentOffset += size + spacing
  }
  return positions
}

/**
 * Calculates positions for items using standard alignment logic.
 * Combines total length calculation, alignment offset, and sequential positioning.
 */
function calculateAlignedSequentialPositions(
  itemSizes: number[],
  containerSize: number,
  anchor: Anchor,
  alignment: string,
  paddingStart: number,
  paddingEnd: number,
  spacing: number,
  reverse: boolean = false,
  itemsTotalLength?: number
): number[] {
  const length = itemsTotalLength ?? calculateTotalLength(itemSizes, (s) => s, spacing, 0, 0, false) // Padding usually excluded from content length for alignment calculation

  const startOffset = calculateAlignmentOffset(containerSize, length, anchor, alignment, paddingStart, paddingEnd)

  return calculateSequentialPositions(itemSizes, startOffset, spacing, reverse)
}

/**
 * Calculates positions for items using stretch spacing distribution.
 * Distributes extra space as dynamic spacing based on the spacingDistribution setting.
 *
 * @param itemSizes - Array of item sizes (should be in the order they appear in the layout).
 * @param layoutSize - Total size of the layout.
 * @param paddingStart - Padding at the start.
 * @param paddingEnd - Padding at the end.
 * @param spacing - Fallback spacing to use if available space is negative.
 * @param anchor - Layout anchor (Start, Center, End).
 * @param reverse - Whether the layout order is reversed (affects index mapping).
 * @param distribution - How to distribute the space (SpaceBetween, SpaceEvenly, SpaceAround).
 * @returns Array of center positions for each item.
 */
function calculateDistributedSpacingPositions(
  itemSizes: number[],
  layoutSize: number,
  paddingStart: number,
  paddingEnd: number,
  spacing: number,
  anchor: Anchor,
  reverse: boolean,
  distribution: SpacingDistribution
): number[] {
  const itemCount = itemSizes.length
  const positions: number[] = new Array(itemCount)

  // Calculate total items size
  const totalItemsSize = itemSizes.reduce((sum, size) => sum + size, 0)
  const totalPadding = paddingStart + paddingEnd

  // Calculate available space for distribution
  const availableSpace = layoutSize - totalItemsSize - totalPadding

  // Calculate layout start position based on anchor
  let layoutStart: number
  if (anchor === Anchor.Center) {
    layoutStart = -layoutSize / 2
  } else if (anchor === Anchor.End) {
    layoutStart = -layoutSize
  } else {
    layoutStart = 0
  }

  // Handle edge case: single item - center it regardless of distribution style
  if (itemCount === 1) {
    const centerPosition = layoutStart + paddingStart + itemSizes[0] / 2 + availableSpace / 2
    const targetIndex = 0
    positions[targetIndex] = centerPosition
    return positions
  }

  // Handle edge case: zero or negative available space - fall back to regular spacing
  if (availableSpace <= 0) {
    let currentOffset = layoutStart + paddingStart
    for (let i = 0; i < itemCount; i++) {
      const itemSize = itemSizes[i]
      const centerOffset = currentOffset + itemSize / 2
      const targetIndex = reverse ? itemCount - 1 - i : i
      positions[targetIndex] = centerOffset
      currentOffset += itemSize + spacing
    }
    return positions
  }

  // Calculate dynamic spacing based on distribution style
  let dynamicSpacing: number
  let edgeSpacing: number

  switch (distribution) {
    case SpacingDistribution.SpaceBetween:
      // First and last items at edges, equal space between items
      dynamicSpacing = availableSpace / (itemCount - 1)
      edgeSpacing = 0
      break
    case SpacingDistribution.SpaceEvenly:
      // Equal space everywhere, including before first and after last item
      dynamicSpacing = availableSpace / (itemCount + 1)
      edgeSpacing = dynamicSpacing
      break
    case SpacingDistribution.SpaceAround:
      // Half space at edges, full space between items
      dynamicSpacing = availableSpace / itemCount
      edgeSpacing = dynamicSpacing / 2
      break
    default:
      // Default to spaceBetween
      dynamicSpacing = availableSpace / (itemCount - 1)
      edgeSpacing = 0
  }

  // Position items
  let currentOffset = layoutStart + paddingStart + edgeSpacing
  for (let i = 0; i < itemCount; i++) {
    const itemSize = itemSizes[i]
    const centerOffset = currentOffset + itemSize / 2

    // When reversed, map position i to item (itemCount - 1 - i)
    const targetIndex = reverse ? itemCount - 1 - i : i
    positions[targetIndex] = centerOffset

    currentOffset += itemSize + dynamicSpacing
  }

  return positions
}

/**
 * Calculates positions for a standard 1D layout (SingleAxisLayout).
 * Consolidates the logic for flexible vs fixed size, stretch spacing, and reversing.
 */
export function calculateSingleAxisLayoutPositions(itemSizes: number[], config: SingleAxisLayoutConfig): number[] {
  // Handle reversing sizes internally
  const effectiveSizes = config.reverse ? [...itemSizes].reverse() : itemSizes

  // Branching logic for strategies
  if (!config.flexibleSize && config.alignment === "stretchSpacing") {
    return calculateDistributedSpacingPositions(
      effectiveSizes,
      config.size,
      config.paddingStart,
      config.paddingEnd,
      config.spacing,
      config.anchor,
      config.reverse,
      config.spacingDistribution as SpacingDistribution
    )
  }

  // Calculate total length
  const totalLength = calculateTotalLength(effectiveSizes, (s) => s, config.spacing, 0, 0, false)

  if (config.flexibleSize) {
    const startOffset = calculateFlexibleStartOffset(config.anchor, totalLength, config.paddingStart, config.paddingEnd)
    return calculateSequentialPositions(effectiveSizes, startOffset, config.spacing, config.reverse)
  } else {
    return calculateAlignedSequentialPositions(
      effectiveSizes,
      config.size,
      config.anchor,
      config.alignment,
      config.paddingStart,
      config.paddingEnd,
      config.spacing,
      config.reverse,
      totalLength
    )
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// WRAPPED LAYOUT LOGIC
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Groups items into rows based on available size (wrapping logic).
 * @param items - Array of items to group.
 * @param getSize - Function to get the size of an item.
 * @param maxSize - The maximum size of a row.
 * @param spacing - Spacing between items.
 * @param paddingTotal - Total padding (start + end) to account for in row size check.
 * @returns Array of rows, where each row has items and total width.
 */
function groupItemsIntoRows<T>(
  items: T[],
  getSize: (item: T) => number,
  maxSize: number,
  spacing: number,
  paddingTotal: number
): {items: T[]; width: number}[] {
  const rows: {items: T[]; width: number}[] = []
  let currentRow: T[] = []
  let currentRowSize = 0 // Items width + spacing

  for (const item of items) {
    const size = getSize(item)
    const spacingToAdd = currentRow.length > 0 ? spacing : 0
    const sizeToAdd = size + spacingToAdd
    const projectedTotalSize = currentRowSize + sizeToAdd + paddingTotal

    if (currentRow.length > 0 && projectedTotalSize > maxSize) {
      rows.push({items: currentRow, width: currentRowSize})
      currentRow = [item]
      currentRowSize = size
    } else {
      currentRow.push(item)
      currentRowSize += sizeToAdd
    }
  }

  if (currentRow.length > 0) {
    rows.push({items: currentRow, width: currentRowSize})
  }

  return rows
}

/**
 * Calculates the cross-axis positions (offsets) for each row in a wrapped layout.
 * The first row starts at 0, subsequent rows are offset based on row heights and spacing.
 *
 * @param rows - Array of rows, where each row contains a list of items.
 * @param secondaryAxis - The axis along which wrapping occurs (cross axis).
 * @param secondarySign - Direction multiplier (+1 or -1).
 * @param secondarySpacing - Spacing between rows.
 * @param getSize - Function to get the size of an item along an axis.
 * @returns Array of offsets, one for each row.
 */
function calculateWrapRowOffsets<T>(
  rows: T[][],
  secondaryAxis: Axis,
  secondarySign: number,
  secondarySpacing: number,
  getSize: (item: T, axis: Axis) => number
): number[] {
  const offsets: number[] = []
  let currentOffset = 0
  let prevRowHalfHeight = 0

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    // Find the maximum size of items in this row along the wrap axis
    let maxRowHeight = 0
    if (row.length > 0) {
      for (const item of row) {
        const val = getSize(item, secondaryAxis)
        if (val > maxRowHeight) maxRowHeight = val
      }
    }

    // For rows after the first, offset from the previous row's position
    if (i > 0) {
      currentOffset += (prevRowHalfHeight + secondarySpacing + maxRowHeight / 2) * secondarySign
    }

    offsets.push(currentOffset)
    prevRowHalfHeight = maxRowHeight / 2
  }

  return offsets
}

/**
 * Calculates the total dimensions of grouped wrapped rows.
 */
function calculateWrappedLayoutDimensions<T>(
  rows: {items: T[]; width: number}[],
  secondaryAxis: Axis,
  secondarySpacing: number,
  getSize: (item: T, axis: Axis) => number
): {mainAxisItemsSize: number; secondaryAxisSize: number} {
  let maxRowWidth = 0
  let totalSecondarySize = 0

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    if (row.width > maxRowWidth) maxRowWidth = row.width

    // Calculate max height in this row for the cross axis
    let maxRowHeight = 0
    for (const item of row.items) {
      const size = getSize(item, secondaryAxis)
      if (size > maxRowHeight) maxRowHeight = size
    }

    totalSecondarySize += maxRowHeight
    if (i < rows.length - 1) {
      totalSecondarySize += secondarySpacing
    }
  }

  return {mainAxisItemsSize: maxRowWidth, secondaryAxisSize: totalSecondarySize}
}

/**
 * Calculates the total dimensions of a wrapped layout, including padding and reversing logic.
 */
export function calculateWrappedTotalSize<T>(
  items: T[],
  config: {
    axis: Axis
    size: number
    spacing: number
    paddingStart: number
    paddingEnd: number
    reverse: boolean
    secondaryDirection: WrapDirection
    secondarySpacing: number
    secondarySize?: number
    tertiaryDirection?: WrapDirection
    tertiarySpacing?: number
  },
  getSize: (item: T, axis: Axis) => number
): {mainAxis: number; secondaryAxis: number; tertiaryAxis?: number} {
  // 1. Handle Reversing
  const effectiveItems = config.reverse ? [...items].reverse() : items

  // 2. Group into Rows
  const rows = groupItemsIntoRows(
    effectiveItems,
    (item) => getSize(item, config.axis),
    config.size,
    config.spacing,
    config.paddingStart + config.paddingEnd
  )

  if (rows.length === 0) {
    return {
      mainAxis: config.paddingStart + config.paddingEnd,
      secondaryAxis: 0,
      tertiaryAxis: 0
    }
  }

  // 3. Handle Tertiary Grouping (if enabled)
  let groups: {rows: typeof rows; secondaryAxisThickness: number}[] = []
  const wrapToTertiary =
    config.secondarySize !== undefined && config.secondarySize !== Infinity && config.tertiaryDirection

  const wrapInfo = WRAP_DIRECTION_INFO[config.secondaryDirection]
  if (wrapToTertiary) {
    // Group rows into layers based on secondary axis limit
    let currentGroup: typeof rows = []
    let currentGroupThickness = 0

    for (const row of rows) {
      // Calculate row thickness (max size of items in this row along wrap axis)
      let maxRowHeight = 0
      for (const item of row.items) {
        const val = getSize(item, wrapInfo.axis)
        if (val > maxRowHeight) maxRowHeight = val
      }

      const spacingToAdd = currentGroup.length > 0 ? config.secondarySpacing : 0
      const projectedThickness = currentGroupThickness + maxRowHeight + spacingToAdd

      if (currentGroup.length > 0 && projectedThickness > config.secondarySize!) {
        // New group
        groups.push({rows: currentGroup, secondaryAxisThickness: currentGroupThickness})
        currentGroup = [row]
        currentGroupThickness = maxRowHeight
      } else {
        currentGroup.push(row)
        currentGroupThickness += maxRowHeight + spacingToAdd
      }
    }
    if (currentGroup.length > 0) {
      groups.push({rows: currentGroup, secondaryAxisThickness: currentGroupThickness})
    }
  } else {
    // Single group containing all rows
    // Calculate total cross axis thickness for this single group
    const {secondaryAxisSize} = calculateWrappedLayoutDimensions(rows, wrapInfo.axis, config.secondarySpacing, getSize)
    groups = [{rows: rows, secondaryAxisThickness: secondaryAxisSize}]
  }

  // 4. Calculate Dimensions
  // Main Axis: Max width of any row across all groups
  // Cross Axis (Secondary): Max thickness of any group
  // Tertiary Axis: Sum of group thicknesses + tertiary spacing (only if tertiary enabled)

  let maxMainAxis = 0
  let maxSecondaryAxis = 0
  let totalTertiaryAxis = 0

  for (let i = 0; i < groups.length; i++) {
    const group = groups[i]
    // Calculate max width for this group
    const {mainAxisItemsSize} = calculateWrappedLayoutDimensions(
      group.rows,
      wrapInfo.axis,
      config.secondarySpacing,
      getSize
    )
    if (mainAxisItemsSize > maxMainAxis) maxMainAxis = mainAxisItemsSize

    if (group.secondaryAxisThickness > maxSecondaryAxis) maxSecondaryAxis = group.secondaryAxisThickness

    // Tertiary accumulation (max height of items in group along tertiary axis? No, groups are stacked along tertiary)
    // Wait, tertiary size depends on the items' size along tertiary axis?
    // Actually, if we stack "layers", the tertiary size is the sum of layer thicknesses.
    // Layer thickness is determined by the max size of items in that layer along the tertiary axis.

    if (wrapToTertiary) {
      const tertiaryInfo = WRAP_DIRECTION_INFO[config.tertiaryDirection!]
      // Calculate max item size in this group along tertiary axis
      let maxGroupTertiarySize = 0
      for (const row of group.rows) {
        for (const item of row.items) {
          const size = getSize(item, tertiaryInfo.axis)
          if (size > maxGroupTertiarySize) maxGroupTertiarySize = size
        }
      }
      totalTertiaryAxis += maxGroupTertiarySize
      if (i < groups.length - 1) {
        totalTertiaryAxis += config.tertiarySpacing || 0
      }
    }
  }

  // 5. Add Padding
  return {
    mainAxis: maxMainAxis + config.paddingStart + config.paddingEnd,
    secondaryAxis: maxSecondaryAxis,
    tertiaryAxis: totalTertiaryAxis
  }
}

/**
 * Calculates positions for items in a wrapped layout.
 * This consolidates the logic for grouping items into rows, calculating row offsets,
 * and determining individual item positions.
 *
 * @param items - Array of items to position (already in desired order, e.g., reversed if needed).
 * @param config - Configuration for the wrapped layout.
 * @param getSize - Function to get the size of an item along an axis.
 * @returns Array of position results for each item.
 */
export function calculateWrappedItemPositions<T>(
  items: T[],
  config: WrapPositioningConfig,
  getSize: (item: T, axis: Axis) => number
): WrapPositionResult<T>[] {
  const results: WrapPositionResult<T>[] = []

  // Group items into rows
  const rows = groupItemsIntoRows(
    items,
    (item) => getSize(item, config.mainAxis),
    config.layoutSize,
    config.spacing,
    config.paddingStart + config.paddingEnd
  )

  if (rows.length === 0) return results

  // Handle Tertiary Wrapping
  const wrapToTertiary =
    config.secondarySize !== undefined &&
    config.secondarySize !== Infinity &&
    config.tertiaryDirection &&
    config.tertiaryAxis

  let rowGroups: {rows: typeof rows; startIndex: number}[] = []

  if (wrapToTertiary) {
    let currentGroup: typeof rows = []
    let currentGroupThickness = 0
    let currentGroupStartIndex = 0

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      // Calculate row thickness
      let maxRowHeight = 0
      for (const item of row.items) {
        const val = getSize(item, config.secondaryAxis)
        if (val > maxRowHeight) maxRowHeight = val
      }

      const spacingToAdd = currentGroup.length > 0 ? config.secondarySpacing : 0
      const projectedThickness = currentGroupThickness + maxRowHeight + spacingToAdd

      if (currentGroup.length > 0 && projectedThickness > config.secondarySize!) {
        // New group
        rowGroups.push({rows: currentGroup, startIndex: currentGroupStartIndex})
        currentGroup = [row]
        currentGroupThickness = maxRowHeight
        currentGroupStartIndex = i
      } else {
        currentGroup.push(row)
        currentGroupThickness += maxRowHeight + spacingToAdd
      }
    }
    if (currentGroup.length > 0) {
      rowGroups.push({rows: currentGroup, startIndex: currentGroupStartIndex})
    }
  } else {
    rowGroups = [{rows: rows, startIndex: 0}]
  }

  // Calculate Tertiary Offsets
  let tertiaryOffsets: number[] = []
  if (wrapToTertiary) {
    // We need to calculate the offset for each GROUP of rows along the tertiary axis
    // This is similar to calculateWrapRowOffsets but for groups
    let currentTertiaryOffset = 0
    let prevGroupHalfDepth = 0

    for (let i = 0; i < rowGroups.length; i++) {
      const group = rowGroups[i]
      // Calculate max depth of this group
      let maxGroupDepth = 0
      for (const row of group.rows) {
        for (const item of row.items) {
          const val = getSize(item, config.tertiaryAxis!)
          if (val > maxGroupDepth) maxGroupDepth = val
        }
      }

      if (i > 0) {
        currentTertiaryOffset +=
          (prevGroupHalfDepth + (config.tertiarySpacing || 0) + maxGroupDepth / 2) * (config.tertiarySign || 1)
      }
      tertiaryOffsets.push(currentTertiaryOffset)
      prevGroupHalfDepth = maxGroupDepth / 2
    }
  } else {
    tertiaryOffsets = [0]
  }

  // Process each group
  for (let groupIndex = 0; groupIndex < rowGroups.length; groupIndex++) {
    const group = rowGroups[groupIndex]
    const tertiaryOffset = wrapToTertiary ? tertiaryOffsets[groupIndex] : 0

    const rowOffsets = calculateWrapRowOffsets(
      group.rows.map((r) => r.items),
      config.secondaryAxis,
      config.secondarySign,
      config.secondarySpacing,
      getSize
    )

    // Calculate positions
    for (let i = 0; i < group.rows.length; i++) {
      const rowIndex = i
      const {items: row, width: rowWidth} = group.rows[rowIndex]
      const wrapAxisPosition = rowOffsets[rowIndex]

      // Get sizes of items in this row for main axis positioning
      const itemSizes = row.map((item) => getSize(item, config.mainAxis))

      // Calculate main axis positions for this row
      const mainAxisPositions = calculateAlignedSequentialPositions(
        itemSizes,
        config.layoutSize,
        config.anchor,
        config.alignment,
        config.paddingStart,
        config.paddingEnd,
        config.spacing,
        false, // Don't reverse - items are already in correct order
        rowWidth
      )

      // Build results for this row
      for (let j = 0; j < row.length; j++) {
        results.push({
          item: row[j],
          mainAxisPosition: mainAxisPositions[j],
          wrapAxisPosition: wrapAxisPosition,
          tertiaryAxisPosition: tertiaryOffset
        })
      }
    }
  }

  return results
}

// ═══════════════════════════════════════════════════════════════════════════
// TRUNCATION LOGIC
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Calculates the visible range for a layout based on anchor, size, and padding.
 * Used for determining which items are within the visible area of a layout.
 *
 * @param anchor - The layout anchor point (Start, Center, or End).
 * @param size - The total size of the layout.
 * @param paddingStart - The padding at the start of the layout.
 * @param paddingEnd - The padding at the end of the layout.
 * @returns A Range1D with start and end values representing the visible area.
 */
function calculateVisibleRange(anchor: Anchor, size: number, paddingStart: number, paddingEnd: number): Range1D {
  if (anchor === Anchor.Center) {
    // Center anchor: layout extends from -size/2 to size/2
    return {
      start: -size / 2 + paddingStart,
      end: size / 2 - paddingEnd
    }
  } else if (anchor === Anchor.End) {
    // End anchor: layout extends from -size to 0
    return {
      start: -size + paddingStart,
      end: -paddingEnd
    }
  }
  // Start anchor: layout extends from 0 to size
  return {
    start: paddingStart,
    end: size - paddingEnd
  }
}

/**
 * Calculates the center of the visible area based on anchor, size, and padding.
 *
 * @param anchor - The layout anchor point.
 * @param size - The layout size.
 * @param paddingStart - The start padding.
 * @param paddingEnd - The end padding.
 * @returns The center coordinate of the visible area.
 */
function calculateVisibleCenter(anchor: Anchor, size: number, paddingStart: number, paddingEnd: number): number {
  if (anchor === Anchor.Center) {
    return (paddingStart - paddingEnd) / 2
  } else if (anchor === Anchor.End) {
    return (-size + paddingStart - paddingEnd) / 2
  } else {
    // Anchor.Start
    return (paddingStart + size - paddingEnd) / 2
  }
}

/**
 * Computes the bounds for a truncation mask.
 * Combines the bounding box of all items with the visible windows defined by layouts.
 *
 * @param itemBounds - The combined bounds of all items managed by the layouts.
 * @param layouts - Array of layout configurations defining visible windows.
 * @returns The computed bounds for the mask (size and center).
 */
export function computeTruncationMaskBounds(
  itemBounds: Bounds3D,
  layouts: LayoutMaskConfig[]
): {size: vec3; center: vec3} {
  // Initialize with item bounds (used for axes without a layout)
  const boundsSize = new vec3(itemBounds.size.x, itemBounds.size.y, itemBounds.size.z)
  const boundsCenter = new vec3(itemBounds.center.x, itemBounds.center.y, itemBounds.center.z)

  for (const layout of layouts) {
    const visibleSize = Math.max(0, layout.size - layout.paddingStart - layout.paddingEnd)
    const visibleCenter = calculateVisibleCenter(layout.anchor, layout.size, layout.paddingStart, layout.paddingEnd)

    switch (layout.axis) {
      case Axis.X:
        boundsSize.x = visibleSize
        boundsCenter.x = visibleCenter
        break
      case Axis.Y:
        boundsSize.y = visibleSize
        boundsCenter.y = visibleCenter
        break
      case Axis.Z:
        boundsSize.z = visibleSize
        boundsCenter.z = visibleCenter
        break
    }
  }

  return {size: boundsSize, center: boundsCenter}
}

/**
 * Checks if two ranges overlap.
 * @param a - First range.
 * @param b - Second range.
 * @returns True if the ranges overlap, false otherwise.
 */
function rangesOverlap(a: Range1D, b: Range1D): boolean {
  return a.start < b.end && b.start <= a.end
}

/**
 * Creates a Range1D from a center point and total size.
 * @param center - The center position.
 * @param size - The total size.
 * @returns A Range1D object {start, end}.
 */
function getRangeFromCenterSize(center: number, size: number): Range1D {
  const halfSize = size / 2
  return {
    start: center - halfSize,
    end: center + halfSize
  }
}

/**
 * Checks if an item is completely truncated (not visible) within a layout.
 * @param itemPosition - Center position of the item along the axis.
 * @param itemSize - Size of the item along the axis.
 * @param layoutSize - Total size of the layout.
 * @param anchor - Layout anchor.
 * @param paddingStart - Layout start padding.
 * @param paddingEnd - Layout end padding.
 * @returns True if the item is completely outside the visible area.
 */
export function isItemTruncated(
  itemPosition: number,
  itemSize: number,
  layoutSize: number,
  anchor: Anchor,
  paddingStart: number,
  paddingEnd: number
): boolean {
  const visibleRange = calculateVisibleRange(anchor, layoutSize, paddingStart, paddingEnd)
  const itemRange = getRangeFromCenterSize(itemPosition, itemSize)
  return !rangesOverlap(itemRange, visibleRange)
}
