import NativeLogger from "SpectaclesInteractionKit.lspkg/Utils/NativeLogger"
import {InitializableItem} from "../Components/Layout/LayoutConfigurationTypes"

const log = new NativeLogger("LayoutItemInitializationTracker")

/**
 * A utility class that tracks the initialization status of a collection of items.
 *
 * This class is designed to help layout components wait for all their children to be initialized
 * (e.g., waiting for screen transforms or bounding boxes to be ready) before calculating their positions.
 *
 * @remarks
 * The tracker maintains a set of pending items and subscriptions to their initialization events.
 * When all tracked items report as initialized, the tracker invokes the provided `onReady` callback.
 *
 * Key features:
 * - **Automatic Filtering**: Ignores items that are already initialized when added.
 * - **Deduplication**: Prevents tracking the same item multiple times.
 * - **Dynamic Updates**: Supports adding or removing items while waiting.
 * - **Auto-Cleanup**: Automatically unsubscribes from items as they initialize.
 *
 * @example
 * ```typescript
 * const tracker = new LayoutItemInitializationTracker(() => {
 *   print("All items ready!");
 *   myLayout.calculatePositions();
 * });
 *
 * // Add items to track
 * tracker.addItems(children);
 *
 * // If items are removed from the scene before initialization completes
 * tracker.removeItems(removedChildren);
 *
 * // Cleanup when the parent component is destroyed
 * tracker.dispose();
 * ```
 */
export class LayoutItemInitializationTracker<T extends InitializableItem> {
  private _subscriptions: Map<T, () => void> = new Map()
  private _pendingItems: Set<T> = new Set()

  /**
   * Creates a new initialization tracker.
   *
   * @param onReady - The callback function to invoke when all tracked items are initialized.
   */
  public constructor(private readonly onReady: () => void) {}

  /**
   * Adds items to the tracker.
   *
   * @remarks
   * - Items that are already initialized are ignored.
   * - Items that are already being tracked are ignored.
   * - If the list contains uninitialized items, the tracker enters a "pending" state.
   * - If no uninitialized items are added (or all added items are already initialized),
   *   and there were no previously pending items, the `onReady` callback may be invoked immediately.
   *
   * @param items - The array of items to track.
   */
  public addItems(items: T[]): void {
    const uninitialized = items.filter((item) => !item.initialized)

    // If no uninitialized items were added, we might still be ready (or already waiting)
    if (uninitialized.length === 0) {
      this.checkReadiness()
      return
    }

    for (const item of uninitialized) {
      if (this._pendingItems.has(item)) continue

      this._pendingItems.add(item)

      const unsubscribe = item.onInitialized.add(() => {
        this.onItemInitialized(item)
      })
      if (this._pendingItems.has(item)) {
        this._subscriptions.set(item, unsubscribe)
      } else {
        // It fired synchronously and removed itself from pending
        unsubscribe()
      }
    }

    log.d(`Added new uninitialized items. Now waiting for ${this._pendingItems.size} items.`)
  }

  /**
   * Removes items from tracking.
   *
   * @remarks
   * Use this when items are removed from the layout or destroyed while the tracker is still waiting.
   * Removing pending items will decrement the pending count. If the count reaches zero,
   * the `onReady` callback will be invoked.
   *
   * @param items - The array of items to stop tracking.
   */
  public removeItems(items: T[]): void {
    for (const item of items) {
      if (this._pendingItems.has(item)) {
        this.unsubscribeItem(item)
        this._pendingItems.delete(item)
      }
    }
    // Check if removing these items made us ready
    this.checkReadiness()
  }

  /**
   * Gets whether the tracker is currently waiting for items.
   *
   * @returns `true` if all tracked items are initialized (or no items are being tracked), `false` otherwise.
   */
  public get isReady(): boolean {
    return this._pendingItems.size === 0
  }

  /**
   * Disposes of the tracker.
   *
   * @remarks
   * Unsubscribes from all pending item events and clears internal state.
   * Should be called when the owner component is destroyed to prevent memory leaks.
   */
  public dispose(): void {
    this._subscriptions.forEach((unsubscribe) => unsubscribe())
    this._subscriptions.clear()
    this._pendingItems.clear()
  }

  /**
   * Handles individual item initialization events.
   */
  private onItemInitialized(item: T): void {
    this.unsubscribeItem(item)
    this._pendingItems.delete(item)

    this.checkReadiness()
  }

  /**
   * Helper to unsubscribe from a specific item.
   */
  private unsubscribeItem(item: T): void {
    const unsubscribe = this._subscriptions.get(item)
    if (unsubscribe) {
      unsubscribe()
      this._subscriptions.delete(item)
    }
  }

  /**
   * Checks if all items are initialized and invokes onReady if so.
   */
  private checkReadiness(): void {
    // Only fire onReady if we are actually at 0 and not just starting up (though 0 usually means ready)
    // The consumer is responsible for not calling this class if they have 0 items total to begin with if that logic differs.
    if (this._pendingItems.size === 0) {
      // Defer slightly? No, usually immediate is fine as the consumer handles scheduling.
      this.onReady()
    }
  }
}
