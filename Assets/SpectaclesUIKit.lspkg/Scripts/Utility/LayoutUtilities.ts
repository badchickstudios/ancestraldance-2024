import {Axis, Size3D, WrapDirection} from "../Components/Layout/LayoutConfigurationTypes"

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Epsilon threshold used for size-change comparisons in layouts.
 * Changes smaller than this are treated as insignificant.
 */
export const SIZE_CHANGE_EPSILON = 1e-4

// ═══════════════════════════════════════════════════════════════════════════
// CORE AXIS/SIZE UTILITIES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Gets the size value for a specific axis from a Size3D object.
 * @param size - The size object with width, height, and depth.
 * @param axis - The axis to get the size for.
 * @returns The size value along the specified axis.
 */
export function getSizeForAxis(size: Size3D, axis: Axis): number {
  switch (axis) {
    case Axis.X:
      return size.width
    case Axis.Y:
      return size.height
    case Axis.Z:
      return size.depth
    default:
      return 0
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// CONFIG MAPS & ENUMS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Maps WrapDirection enum values to their axis and sign components.
 * Sign is +1 for positive direction, -1 for negative direction.
 */
export const WRAP_DIRECTION_INFO: Record<WrapDirection, {axis: Axis; sign: -1 | 1}> = {
  [WrapDirection.Left]: {axis: Axis.X, sign: -1},
  [WrapDirection.Right]: {axis: Axis.X, sign: 1},
  [WrapDirection.Down]: {axis: Axis.Y, sign: -1},
  [WrapDirection.Up]: {axis: Axis.Y, sign: 1},
  [WrapDirection.Back]: {axis: Axis.Z, sign: -1},
  [WrapDirection.Front]: {axis: Axis.Z, sign: 1}
}

/**
 * Checks if a wrap direction is perpendicular to the given axis.
 * @param wrapDirection - The wrap direction to check.
 * @param axis - The axis to check perpendicularity against.
 * @returns True if the wrap direction is perpendicular to the axis.
 */
export function isWrapDirectionPerpendicularToAxis(wrapDirection: WrapDirection, axis: Axis): boolean {
  const wrapAxis = WRAP_DIRECTION_INFO[wrapDirection].axis
  return axis !== wrapAxis
}

/**
 * Gets a human-readable string of allowed wrap directions for a given axis.
 * @param axis - The layout axis.
 * @returns A string describing allowed perpendicular wrap directions.
 */
export function getAllowedWrapDirectionsForAxis(axis: Axis): string {
  return axis === Axis.X ? "+/-Y or +/-Z" : axis === Axis.Y ? "+/-X or +/-Z" : "+/-X or +/-Y"
}

// ═══════════════════════════════════════════════════════════════════════════
// GENERAL CALCULATION HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Calculates the total length of a list of items including spacing and optionally padding.
 * @param items - Array of items.
 * @param getSize - Function to get the size of an item.
 * @param spacing - Spacing between items.
 * @param paddingStart - Start padding.
 * @param paddingEnd - End padding.
 * @param includePadding - Whether to include padding in the result.
 * @returns The total length.
 */
export function calculateTotalLength<T>(
  items: T[],
  getSize: (item: T) => number,
  spacing: number,
  paddingStart: number,
  paddingEnd: number,
  includePadding: boolean
): number {
  const count = items.length
  if (count === 0) {
    return includePadding ? paddingStart + paddingEnd : 0
  }

  let totalSize = 0
  for (const item of items) {
    totalSize += getSize(item)
  }

  const totalSpacing = spacing * (count - 1)
  let totalLength = totalSize + totalSpacing

  if (includePadding) {
    totalLength += paddingStart + paddingEnd
  }

  return totalLength
}

// ═══════════════════════════════════════════════════════════════════════════
// PENDING ITEMS TRACKER
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Tracks items that have been added to a layout but are waiting for a reflow/update
 * before firing their "Added" event.
 * Handles suppression of intermediate events and cancels "Added" events if the item is removed before the update.
 */
export class PendingLayoutItemTracker<T> {
  private pendingItems = new Set<T>()

  public add(item: T): void {
    this.pendingItems.add(item)
  }

  public addItems(items: T[]): void {
    for (const item of items) {
      this.pendingItems.add(item)
    }
  }

  public has(item: T): boolean {
    return this.pendingItems.has(item)
  }

  public clear(): void {
    this.pendingItems.clear()
  }

  /**
   * Resolves removals against pending additions.
   * If an item is pending add, we cancel the add and suppress the remove event
   * (since the outside world never knew the item existed).
   * @returns Array of items that should fire a 'Removed' event.
   */
  public resolveDeferredRemovals(itemsToRemove: T[]): T[] {
    const itemsToNotify: T[] = []
    for (const item of itemsToRemove) {
      if (this.pendingItems.has(item)) {
        this.pendingItems.delete(item)
      } else {
        itemsToNotify.push(item)
      }
    }
    return itemsToNotify
  }

  /**
   * Flushes all pending added events.
   * @param callback Function to handle the batch of items to notify.
   */
  public flush(callback: (items: T[]) => void): void {
    if (this.pendingItems.size === 0) return

    // Create array from set for the callback
    const itemsToNotify = Array.from(this.pendingItems)
    this.pendingItems.clear()

    callback(itemsToNotify)
  }
}
