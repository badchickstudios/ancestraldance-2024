import {
  Alignment,
  AlignmentConstants,
  AlignmentMappingEntry,
  Anchor,
  Axis,
  AxisLayoutConfig,
  ConfigurableSingleAxisLayout,
  Size3D,
  SpacingDistribution,
  StretchMode
} from "../Components/Layout/LayoutConfigurationTypes"
import {calculateTotalLength, getSizeForAxis} from "./LayoutUtilities"

// ═══════════════════════════════════════════════════════════════════════════
// PADDING UTILITIES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Creates a vec3 containing the total padding for each axis.
 *
 * @param paddingLeft - Left padding (X-axis start).
 * @param paddingRight - Right padding (X-axis end).
 * @param paddingBottom - Bottom padding (Y-axis start).
 * @param paddingTop - Top padding (Y-axis end).
 * @param paddingBack - Back padding (Z-axis start).
 * @param paddingFront - Front padding (Z-axis end).
 * @returns A vec3 with total padding per axis (x: left+right, y: bottom+top, z: back+front).
 */
export function createPaddingVec3(
  paddingLeft: number,
  paddingRight: number,
  paddingBottom: number,
  paddingTop: number,
  paddingBack: number,
  paddingFront: number
): vec3 {
  return new vec3(paddingLeft + paddingRight, paddingBottom + paddingTop, paddingBack + paddingFront)
}

/**
 * Adds padding values to an existing vec3 in place.
 *
 * @param result - The vec3 to modify.
 * @param paddingLeft - Left padding (X-axis start).
 * @param paddingRight - Right padding (X-axis end).
 * @param paddingBottom - Bottom padding (Y-axis start).
 * @param paddingTop - Top padding (Y-axis end).
 * @param paddingBack - Back padding (Z-axis start).
 * @param paddingFront - Front padding (Z-axis end).
 */
export function addPaddingToVec3(
  result: vec3,
  paddingLeft: number,
  paddingRight: number,
  paddingBottom: number,
  paddingTop: number,
  paddingBack: number,
  paddingFront: number
): void {
  result.x += paddingLeft + paddingRight
  result.y += paddingBottom + paddingTop
  result.z += paddingBack + paddingFront
}

// ═══════════════════════════════════════════════════════════════════════════
// MAX SIZE UTILITIES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Gets the maximum size from an array of items using a callback to retrieve the size.
 * @param items - Array of items.
 * @param getSize - Function to get the size value from an item.
 * @returns The maximum size value, or 0 if the array is empty.
 */
function getMaxSizeWithCallback<T>(items: T[], getSize: (item: T) => number): number {
  if (items.length === 0) return 0
  let max = 0
  for (const item of items) {
    const val = getSize(item)
    if (val > max) max = val
  }
  return max
}

// ═══════════════════════════════════════════════════════════════════════════
// AXIS CONFIGURATION UTILITIES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Maps DirectionalLayout alignment signs to their corresponding layout configuration.
 * - '-' (Left/Bottom/Back): Start alignment, items flow in positive direction
 * - '+' (Right/Top/Front): End alignment, items flow in negative direction
 * - '*' (Stretch): Stretch alignment, centered
 * - '' (Center): Center alignment, centered
 */
export const DIRECTIONAL_ALIGNMENT_MAPPING: Record<AlignmentConstants, AlignmentMappingEntry> = {
  [AlignmentConstants.Negative]: {
    alignment: Alignment.Start,
    anchor: Anchor.Start,
    defaultReverse: false,
    directionMultiplier: 1
  },
  [AlignmentConstants.Positive]: {
    alignment: Alignment.End,
    anchor: Anchor.End,
    defaultReverse: true,
    directionMultiplier: -1
  },
  [AlignmentConstants.Stretch]: {
    alignment: Alignment.Stretch,
    anchor: Anchor.Center,
    defaultReverse: false,
    directionMultiplier: 1
  },
  [AlignmentConstants.Center]: {
    alignment: Alignment.Center,
    anchor: Anchor.Center,
    defaultReverse: false,
    directionMultiplier: 1
  }
}

/**
 * Computes the composite total size for an axis, handling both primary (stacked) and non-primary (aligned/max) states.
 * When the axis is the primary direction, items are stacked (sum of sizes + spacing).
 * When it is not the primary direction, uses the max item size.
 *
 * @param axis - The axis to calculate size for.
 * @param items - Array of items.
 * @param getSize - Function to get the size of an item along the axis.
 * @param config - Axis settings containing layout properties.
 * @param includePadding - Whether to include padding in the result.
 * @returns The calculated total size for the axis.
 */
function calculateCompositeAxisSize<T>(
  axis: Axis,
  items: T[],
  getSize: (item: T, axis: Axis) => number,
  config: DirectionalAxisSettings,
  includePadding: boolean
): number {
  if (config.enabled) {
    const totalLength = calculateTotalLength(
      items,
      (item) => getSize(item, axis),
      config.spacing,
      config.paddingStart,
      config.paddingEnd,
      includePadding
    )

    // If using Stretch Spacing with fixed size, the total size is the layout size
    if (
      config.alignment === AlignmentConstants.Stretch &&
      config.stretchMode === StretchMode.Spacing &&
      config.isFixed
    ) {
      const padding = config.paddingStart + config.paddingEnd
      return includePadding ? config.fixedSize : Math.max(0, config.fixedSize - padding)
    }

    return totalLength
  } else {
    const max = getMaxSizeWithCallback(items, (item) => getSize(item, axis))
    return max + (includePadding ? config.paddingStart + config.paddingEnd : 0)
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// CACHED AXIS SIZE UTILITIES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Represents the dirty state for each axis in a DirectionalLayout.
 */
export type AxisDirtyFlags = {
  x: boolean
  y: boolean
  z: boolean
}

/**
 * Configuration for applying settings to a layout axis.
 * Unifies alignment, size, and other axis-specific settings.
 */
export interface DirectionalAxisSettings {
  enabled: boolean
  alignment: AlignmentConstants
  reverse: boolean
  anchor: Anchor
  stretchMode: StretchMode
  spacingDistribution: SpacingDistribution
  paddingStart: number
  paddingEnd: number
  spacing: number
  isFixed: boolean
  fixedSize: number
}

/**
 * Builds a DirectionalAxisSettings object from DirectionalLayout properties using the axis config.
 *
 * @param axisConfig - The axis configuration object.
 * @param getProperty - Function to get a property value by key.
 * @param enabled - Whether this axis is enabled (primary direction).
 * @returns The DirectionalAxisSettings for the axis.
 */
export function buildDirectionalAxisSettings(
  axisConfig: AxisLayoutConfig,
  getProperty: (key: string) => unknown,
  enabled: boolean
): DirectionalAxisSettings {
  return {
    enabled: enabled,
    alignment: getProperty(axisConfig.alignmentKey) as AlignmentConstants,
    reverse: getProperty("_reverse") as boolean,
    anchor: getProperty(axisConfig.anchorKey) as Anchor,
    stretchMode: getProperty(axisConfig.stretchModeKey) as StretchMode,
    spacingDistribution: getProperty(axisConfig.spacingDistributionKey) as SpacingDistribution,
    paddingStart: getProperty(axisConfig.paddingStartKey) as number,
    paddingEnd: getProperty(axisConfig.paddingEndKey) as number,
    spacing: getProperty("_primarySpacing") as number,
    isFixed: getProperty(axisConfig.fixedSizeKey) as boolean,
    fixedSize: getProperty(axisConfig.sizeKey) as number
  }
}

/**
 * The list of all axes for iteration.
 */
export const ALL_AXES: readonly Axis[] = [Axis.X, Axis.Y, Axis.Z] as const

/**
 * Updates all dirty axis caches in a single pass.
 * Skips non-dirty axes to avoid unnecessary config object allocation and size calculation.
 *
 * @param items - Array of layout items.
 * @param getSize - Function to get the size of an item along an axis.
 * @param getProperty - Function to get a property value from the layout by key.
 * @param dirtyFlags - The dirty state flags for all axes.
 * @param cachedSize - The cached size vec3 to update.
 * @param axisConfigMap - Map of axis configurations.
 * @param isAxisEnabled - Function that returns whether a given axis is the primary direction.
 */
export function updateAllCachedAxisSizes<T>(
  items: T[],
  getSize: (item: T, axis: Axis) => number,
  getProperty: (key: string) => unknown,
  dirtyFlags: AxisDirtyFlags,
  cachedSize: vec3,
  axisConfigMap: Record<Axis, AxisLayoutConfig>,
  isAxisEnabled: (axis: Axis) => boolean
): void {
  for (const axis of ALL_AXES) {
    if (!dirtyFlags[axis]) continue

    const config = buildDirectionalAxisSettings(axisConfigMap[axis], getProperty, isAxisEnabled(axis))
    cachedSize[axis] = calculateCompositeAxisSize(axis, items, getSize, config, false)
    dirtyFlags[axis] = false
  }
}

/**
 * Applies settings (alignment, spacing, padding, etc.) to a layout axis.
 * Consolidates configuration application from DirectionalAxisSettings.
 *
 * @param layout - The layout to configure.
 * @param config - Configuration settings.
 */
export function applyDirectionalAxisSettings(
  layout: ConfigurableSingleAxisLayout & {paddingStart: number; paddingEnd: number; spacing: number},
  config: DirectionalAxisSettings
): void {
  const mapping = DIRECTIONAL_ALIGNMENT_MAPPING[config.alignment]
  layout.reverse = mapping.defaultReverse !== config.reverse

  // Configure alignment
  if (config.alignment === AlignmentConstants.Stretch) {
    layout.anchor = config.anchor

    // Determine alignment based on stretch mode
    if (config.stretchMode === StretchMode.Spacing) {
      layout.alignment = Alignment.StretchSpacing
      layout.spacingDistribution = config.spacingDistribution
    } else {
      layout.alignment = Alignment.Stretch
    }
  } else {
    layout.alignment = mapping.alignment

    // If fixed size is enabled, allow explicit anchor override
    // Otherwise, force the anchor implied by the alignment
    if (config.isFixed) {
      layout.anchor = config.anchor
    } else {
      layout.anchor = mapping.anchor
    }
  }

  layout.paddingStart = config.paddingStart
  layout.paddingEnd = config.paddingEnd
  layout.spacing = config.spacing
}

/**
 * Applies size configuration to a specific axis layout.
 * This sets the flexible size mode and layout size independently of alignment settings.
 *
 * @param layout - The ConfigurableSingleAxisLayout to configure.
 * @param isFixedSize - Whether the layout has a fixed size.
 * @param layoutSize - The fixed layout size to use when fixed size is enabled.
 */
export function applyDirectionalSizeToAxis(
  layout: ConfigurableSingleAxisLayout,
  isFixedSize: boolean,
  layoutSize: number
): void {
  layout.flexibleSize = !isFixedSize
  if (isFixedSize) {
    layout.size = layoutSize
  }
}

/**
 * Maps wrapped layout dimensions (main/secondary/tertiary) to 3D axes (x/y/z).
 * Assigns the main axis size from wrappedDims.mainAxis, the secondary axis size from wrappedDims.secondaryAxis,
 * the tertiary axis size from wrappedDims.tertiaryAxis (if present), and falls back to max item size
 * for any remaining axis.
 */
export function mapWrappedDimensionsTo3DSize(
  itemAxis: Axis,
  secondaryAxis: Axis,
  wrappedDims: {mainAxis: number; secondaryAxis: number; tertiaryAxis?: number},
  padding: {x: number; y: number; z: number},
  items: Size3D[],
  includePadding: boolean,
  tertiaryAxis?: Axis
): vec3 {
  const getPadding = (axis: Axis) => {
    return axis === Axis.X ? padding.x : axis === Axis.Y ? padding.y : padding.z
  }

  const getSize = (axis: Axis) => {
    if (axis === itemAxis) {
      return wrappedDims.mainAxis
    } else if (axis === secondaryAxis) {
      // Cross axis does not include padding in wrappedDims unless manually added
      return wrappedDims.secondaryAxis + (includePadding ? getPadding(axis) : 0)
    } else if (axis === tertiaryAxis) {
      // Tertiary axis logic similar to cross axis
      return (wrappedDims.tertiaryAxis ?? 0) + (includePadding ? getPadding(axis) : 0)
    } else {
      // For the remaining axis, use the max size of items (plus padding if requested)
      const maxSize = getMaxSizeWithCallback(items, (item) => getSizeForAxis(item, axis))
      return maxSize + (includePadding ? getPadding(axis) : 0)
    }
  }

  return new vec3(getSize(Axis.X), getSize(Axis.Y), getSize(Axis.Z))
}

// ═══════════════════════════════════════════════════════════════════════════
// ITEM CONFIRMATION UTILITIES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Returns the intersection of items present in three arrays.
 * Useful for determining which items were successfully added to all three axis layouts.
 *
 * @param itemsX - Items added to X layout.
 * @param itemsY - Items added to Y layout.
 * @param itemsZ - Items added to Z layout.
 * @returns Array of items present in all three input arrays.
 */
export function getThreeAxisIntersection<T>(itemsX: T[], itemsY: T[], itemsZ: T[]): T[] {
  const setY = new Set(itemsY)
  const setZ = new Set(itemsZ)
  return itemsX.filter((item) => setY.has(item) && setZ.has(item))
}

/**
 * Updates item confirmations for a multi-axis layout system.
 * Used to track when an item has been processed by all required axes.
 *
 * @param items - The items that have been processed by the current axis.
 * @param axis - The axis that has just processed the items.
 * @param pendingConfirmations - Map tracking which axes have confirmed each item.
 * @param requiredCount - The number of confirmations required (e.g., 3 for X, Y, Z).
 * @returns Array of items that have received all required confirmations.
 */
export function updateItemConfirmations<T>(
  items: T[],
  axis: Axis,
  pendingConfirmations: Map<T, Set<Axis>>,
  requiredCount: number
): T[] {
  if (pendingConfirmations.size === 0) {
    return []
  }

  // Find items that are in our pending list and mark them as confirmed by this axis
  const pendingItems = items.filter((item) => pendingConfirmations.has(item))
  for (const item of pendingItems) {
    pendingConfirmations.get(item)!.add(axis)
  }

  // Check which items have been confirmed by all required layouts
  const fullyConfirmedItems = pendingItems.filter((item) => pendingConfirmations.get(item)!.size === requiredCount)

  // Remove fully confirmed items from pending
  for (const item of fullyConfirmedItems) {
    pendingConfirmations.delete(item)
  }

  return fullyConfirmedItems
}

/**
 * Initializes tracking for new items in the pending confirmations map.
 *
 * @param items - The items to begin tracking.
 * @param pendingConfirmations - Map tracking which axes have confirmed each item.
 */
export function trackPendingItems<T>(items: T[], pendingConfirmations: Map<T, Set<Axis>>): void {
  for (const item of items) {
    pendingConfirmations.set(item, new Set())
  }
}

/**
 * Filters out items that were pending confirmation from the removal list,
 * and cleans them up from the pending map.
 *
 * Items that were pending (waiting for add event) should not fire a remove event
 * since their add event was never fired.
 */
export function filterPendingRemovals<T>(removedItems: T[], pendingConfirmations: Map<T, Set<Axis>>): T[] {
  if (pendingConfirmations.size === 0) {
    return removedItems
  }

  // Filter out items that are currently pending
  const itemsToNotifyRemoved = removedItems.filter((item) => !pendingConfirmations.has(item))

  // Clean up the pending map
  for (const item of removedItems) {
    pendingConfirmations.delete(item)
  }

  return itemsToNotifyRemoved
}
