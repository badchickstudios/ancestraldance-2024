import {Singleton} from "SpectaclesInteractionKit.lspkg/Decorators/Singleton"
import NativeLogger from "SpectaclesInteractionKit.lspkg/Utils/NativeLogger"
import {getSizeForAxis} from "../../Utility/LayoutUtilities"
import {Mask3D} from "../../Utility/Mask3D"
import {Mask3DManager} from "../../Utility/Mask3DManager"
import {
  AXIS_TO_INDEX,
  computeTruncationMaskBounds,
  getPositionForAxis,
  isItemTruncated
} from "../../Utility/SingleAxisLayoutUtilities"
import {combineBounds} from "../../Utility/UIKitUtilities"
import {Axis, LayoutMaskConfig, Overflow} from "./LayoutConfigurationTypes"
import {LayoutItem} from "./LayoutItem"
import {SingleAxisLayout} from "./SingleAxisLayout"

const log = new NativeLogger("SingleAxisLayoutManager")

/**
 * Manages the registration and lifecycle of SingleAxisLayout instances across SceneObjects.
 *
 * Responsibilities:
 * - Ensures only one SingleAxisLayout controls each axis per SceneObject
 * - Manages truncation masks for layouts with fixed sizes
 * - Coordinates mask bounds when multiple layouts share a mask
 *
 * @remarks
 * This is a singleton class. Use `SingleAxisLayoutManager.getInstance()` to access it.
 */
@Singleton
export class SingleAxisLayoutManager {
  public static getInstance: () => SingleAxisLayoutManager

  // Tuple type: [X axis layout, Y axis layout, Z axis layout]
  // Updated after successful validation to provide efficient axis-based lookup
  private readonly sceneObjectToLayouts: WeakMap<
    SceneObject,
    [SingleAxisLayout | null, SingleAxisLayout | null, SingleAxisLayout | null]
  > = new WeakMap()

  private readonly sceneObjectToMask: WeakMap<SceneObject, Mask3D> = new WeakMap()
  private readonly maskToLayouts: WeakMap<Mask3D, Set<SingleAxisLayout>> = new WeakMap()

  // Track event subscriptions to prevent memory leaks
  private readonly layoutSubscriptions: WeakMap<SingleAxisLayout, () => void> = new WeakMap()

  // Deferred axis validation - tracks layouts pending validation
  private readonly pendingAxisValidation: Set<SingleAxisLayout> = new Set()
  private readonly validationEvents = new WeakMap<SingleAxisLayout, SceneEvent>()

  // ═══════════════════════════════════════════════════════════════════════════
  // PUBLIC CLASS METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Registers a SingleAxisLayout with the manager.
   * Validates that no two SingleAxisLayouts on the same SceneObject control the same axis.
   * Validation is deferred to end of frame, allowing developers to update axes of
   * multiple layouts before validation occurs.
   *
   * @param layout - The SingleAxisLayout to register.
   * @throws Error (deferred) if axis already in use by another layout on the same SceneObject.
   */
  public registerLayout(layout: SingleAxisLayout): void {
    const sceneObject = layout.sceneObject
    const axisIndex = AXIS_TO_INDEX[layout.axis]

    let layouts = this.sceneObjectToLayouts.get(sceneObject)
    if (!layouts) {
      // First layout on this SceneObject
      layouts = [null, null, null]
      this.sceneObjectToLayouts.set(sceneObject, layouts)
    }

    // If another layout occupies this slot, mark it for validation before overwriting
    const existingLayout = layouts[axisIndex]
    if (existingLayout !== null && existingLayout !== layout) {
      this.markAxisValidationDirty(existingLayout)
    }

    layouts[axisIndex] = layout
    this.markAxisValidationDirty(layout)

    if (!this.layoutSubscriptions.has(layout)) {
      const unsubscribe = layout.onAxisChanged.add(() => {
        this.handleAxisChange(layout, layout.axis)
      })
      this.layoutSubscriptions.set(layout, unsubscribe)
    }

    log.d(`Registered SingleAxisLayout on "${sceneObject.name}" for axis "${layout.axis}"`)
  }

  /**
   * Unregisters a SingleAxisLayout from the manager.
   *
   * @param layout - The SingleAxisLayout to unregister.
   */
  public unregisterLayout(layout: SingleAxisLayout): void {
    // Remove from pending validation if present
    this.pendingAxisValidation.delete(layout)

    // Disable the validation event if it exists
    const validationEvent = this.validationEvents.get(layout)
    if (validationEvent) {
      validationEvent.enabled = false
    }

    // Remove from the axis-indexed tuple
    const sceneObject = layout.sceneObject
    const layouts = this.sceneObjectToLayouts.get(sceneObject)
    if (!layouts) {
      return
    }

    // Remove the layout from the tuple
    const axis = layout.axis
    const axisIndex = AXIS_TO_INDEX[axis]
    layouts[axisIndex] = null
    log.d(`Unregistered SingleAxisLayout from "${sceneObject.name}" for axis ${axis}`)

    // Clean up the map entry if no layouts remain
    if (layouts.every((l) => l === null)) {
      this.sceneObjectToLayouts.delete(sceneObject)
      log.d(`Removed SceneObject "${sceneObject.name}" from layout tracking`)
    }

    if (!layout.flexibleSize && layout.overflow === Overflow.Truncate) {
      this.removeLayoutFromTruncationMask(layout)
    }

    // Clean up event subscription
    const unsubscribe = this.layoutSubscriptions.get(layout)
    if (unsubscribe) {
      unsubscribe()
      this.layoutSubscriptions.delete(layout)
    }
  }

  public addLayoutToTruncationMask(layout: SingleAxisLayout): Mask3D | null {
    if (layout.flexibleSize || layout.overflow !== Overflow.Truncate) {
      return null
    }
    const maskManager = Mask3DManager.getInstance()
    let mask = this.sceneObjectToMask.get(layout.sceneObject)

    if (!mask) {
      mask = maskManager.createMask()
      mask.sceneObject.setParent(layout.sceneObject)
      this.sceneObjectToMask.set(layout.sceneObject, mask)
    }

    let layouts = this.maskToLayouts.get(mask)
    if (!layouts) {
      layouts = new Set()
      this.maskToLayouts.set(mask, layouts)
    }

    layouts.add(layout)

    // Update mask center and size based on all the layouts affected by this mask
    this.updateMaskBounds(mask)

    // Register all items with mask manager for stencil testing
    for (const layoutItem of layout.layoutItems) {
      maskManager.registerMaskedContentsByLayer(mask.layerSet, [layoutItem.sceneObject], layoutItem.materials)
    }

    return mask
  }

  public removeLayoutFromTruncationMask(layout: SingleAxisLayout): void {
    const mask = this.sceneObjectToMask.get(layout.sceneObject)
    if (mask) {
      const maskDestroyed = this.removeLayoutFromMaskInternal(mask, layout)
      if (!maskDestroyed) {
        this.updateMaskBounds(mask)
      }
    }
  }

  public removeLayoutItemsFromTruncationMask(layoutItems: LayoutItem[]): void {
    const maskManager = Mask3DManager.getInstance()
    // Unregister all items and restore their original states
    for (const item of layoutItems) {
      maskManager.unregisterMaskedContents([item.sceneObject], item.materials)
    }
  }

  /**
   * Updates the mask for the given layout.
   * Useful when layout enabled state changes.
   * Note if all layouts are disabled, the mask will be disabled.
   * @param layout - The SingleAxisLayout to update the mask for.
   */
  public updateMask(layout: SingleAxisLayout): void {
    const mask = this.sceneObjectToMask.get(layout.sceneObject)
    if (!mask) return

    const layouts = this.maskToLayouts.get(mask)
    if (!layouts) return

    let hasEnabledLayout = false
    for (const l of layouts) {
      if (l.enabled) {
        hasEnabledLayout = true
        break // Early exit
      }
    }

    mask.sceneObject.enabled = hasEnabledLayout
    if (hasEnabledLayout) {
      this.updateMaskBounds(mask)
    } else {
      for (const l of layouts) {
        for (const layoutItem of l.layoutItems) {
          layoutItem.isVisible = true
        }
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Handles axis change for a registered SingleAxisLayout.
   * Schedules deferred validation to check for axis conflicts.
   * Called when the axis property changes on a SingleAxisLayout.
   *
   * @param layout - The SingleAxisLayout changing its axis.
   * @param newAxis - The new axis to use.
   * @throws Error if the layout is not registered with the manager.
   * @throws Error (deferred) if the new axis is already in use by another layout on the same SceneObject.
   */
  private handleAxisChange(layout: SingleAxisLayout, newAxis: Axis): void {
    const sceneObject = layout.sceneObject
    const layouts = this.sceneObjectToLayouts.get(sceneObject)

    if (!layouts) {
      throw new Error(`Cannot handle axis change for SingleAxisLayout on "${sceneObject.name}": Layout not registered.`)
    }

    log.d(`Axis change requested for SingleAxisLayout on "${sceneObject.name}" to axis "${newAxis}"`)

    // Schedule deferred validation - existing layouts at the new axis are still
    // in the tuple and will be found during validation
    this.markAxisValidationDirty(layout)
  }

  /**
   * Marks a layout for deferred axis validation.
   * The validation will occur at the end of the frame via LateUpdateEvent.
   *
   * @param layout - The layout to validate.
   */
  private markAxisValidationDirty(layout: SingleAxisLayout): void {
    this.pendingAxisValidation.add(layout)

    let validationEvent = this.validationEvents.get(layout)
    if (!validationEvent) {
      validationEvent = layout.createEvent("LateUpdateEvent")
      validationEvent.bind(() => {
        if (validationEvent) {
          validationEvent.enabled = false
        }
        this.performDeferredAxisValidation()
      })
      this.validationEvents.set(layout, validationEvent)
    }
    validationEvent.enabled = true
  }

  /**
   * Performs deferred axis validation for all pending layouts.
   * Called at the end of the frame via LateUpdateEvent.
   */
  private performDeferredAxisValidation = (): void => {
    // Group pending layouts by SceneObject
    const sceneObjectToPendingLayouts = new Map<SceneObject, Set<SingleAxisLayout>>()
    for (const layout of this.pendingAxisValidation) {
      const sceneObject = layout.sceneObject
      if (!sceneObjectToPendingLayouts.has(sceneObject)) {
        sceneObjectToPendingLayouts.set(sceneObject, new Set())
      }
      sceneObjectToPendingLayouts.get(sceneObject)!.add(layout)
    }

    for (const [sceneObject, layouts] of sceneObjectToPendingLayouts) {
      this.validateSceneObjectAxes(sceneObject, layouts)
    }
    this.pendingAxisValidation.clear()
  }

  /**
   * Updates the mask's size and center based on all layouts that share this mask.
   * For each axis that has a layout, uses that layout's visible size and center.
   * For axes without a layout, uses the combined item bounds from all layouts.
   *
   * @param mask - The mask to update
   */
  private updateMaskBounds(mask: Mask3D): void {
    const layouts = this.maskToLayouts.get(mask)
    if (!layouts || layouts.size === 0) {
      return
    }

    // Collect all layout items across all layouts sharing this mask, as well as all invalid layouts.
    const allItems: LayoutItem[] = []
    const invalidLayoutsForMask: SingleAxisLayout[] = []
    const layoutConfigs: LayoutMaskConfig[] = []

    for (const layout of layouts) {
      if (layout.flexibleSize || layout.overflow !== Overflow.Truncate) {
        invalidLayoutsForMask.push(layout)
      } else if (layout.enabled) {
        allItems.push(...layout.layoutItems)
        layoutConfigs.push({
          axis: layout.axis,
          size: layout.size,
          anchor: layout.anchor,
          paddingStart: layout.paddingStart,
          paddingEnd: layout.paddingEnd
        })
      }
    }

    // Remove invalid layouts from the mask
    for (const layout of invalidLayoutsForMask) {
      const maskDestroyed = this.removeLayoutFromMaskInternal(mask, layout)
      if (maskDestroyed) {
        return
      }
    }

    // Calculate combined item bounds for non-controlled axes
    const itemBounds = combineBounds(allItems.map((c) => c.bounds))

    // Use shared utility
    const {size, center} = computeTruncationMaskBounds(itemBounds, layoutConfigs)

    // Apply the computed bounds to the mask
    mask.localScale = size
    mask.localPosition = center

    log.d(`Updated mask bounds - size: ${size}, center: ${center}`)

    // Update item visibility whenever mask bounds change
    const containerObject = mask.sceneObject.getParent()
    if (containerObject) {
      this.updateItemVisibility(containerObject)
    }
  }

  /**
   * Updates the visibility of all items managed by layouts on the given SceneObject.
   * An item is visible only if it is within the visible bounds of ALL truncating layouts.
   *
   * @param sceneObject - The SceneObject containing the layouts.
   */
  private updateItemVisibility(sceneObject: SceneObject): void {
    const layouts = this.sceneObjectToLayouts.get(sceneObject)
    if (!layouts) {
      return
    }

    // First pass: collect truncating layouts (typically 0-3 items, very fast)
    const truncatingLayouts: SingleAxisLayout[] = []
    for (const layout of layouts) {
      if (layout && layout.enabled && !layout.flexibleSize && layout.overflow === Overflow.Truncate) {
        truncatingLayouts.push(layout)
      }
    }

    // Early exit: if no truncating layouts, make all items visible and return
    if (truncatingLayouts.length === 0) {
      for (const layout of layouts) {
        if (layout?.enabled) {
          for (const item of layout.layoutItems) {
            item.isVisible = true
          }
        }
      }
      return
    }

    // Process items with truncation checking
    // Use Set to avoid processing the same item multiple times when shared across layouts
    const processedItems = new Set<LayoutItem>()

    for (const layout of layouts) {
      if (!layout?.enabled) continue

      for (const layoutItem of layout.layoutItems) {
        // Skip if already processed
        if (processedItems.has(layoutItem)) continue
        processedItems.add(layoutItem)

        // Check visibility against all truncating layouts
        // Item is visible only if NOT truncated by ANY layout
        let isVisible = true
        for (const truncLayout of truncatingLayouts) {
          if (this.isItemCompletelyTruncated(truncLayout, layoutItem)) {
            isVisible = false
            break // Early exit on first truncation
          }
        }

        layoutItem.isVisible = isVisible
      }
    }
  }

  /**
   * Checks if a specific item is completely truncated by a specific layout.
   */
  private isItemCompletelyTruncated(layout: SingleAxisLayout, item: LayoutItem): boolean {
    // Get the item position and size along the axis
    const itemPosition = getPositionForAxis(item.position, layout.axis)
    const itemSize = getSizeForAxis(item, layout.axis)

    return isItemTruncated(itemPosition, itemSize, layout.size, layout.anchor, layout.paddingStart, layout.paddingEnd)
  }

  /**
   * Internal helper to remove a layout from a mask and clean up if empty.
   * @returns True if the mask was destroyed (no layouts left), false otherwise.
   */
  private removeLayoutFromMaskInternal(mask: Mask3D, layout: SingleAxisLayout): boolean {
    const layouts = this.maskToLayouts.get(mask)
    if (!layouts) {
      return false
    }

    // Remove the layout from the set
    layouts.delete(layout)

    // Clean up if no layouts remain
    if (layouts.size === 0) {
      this.removeLayoutItemsFromTruncationMask(layout.layoutItems)
      this.sceneObjectToMask.delete(layout.sceneObject)
      this.maskToLayouts.delete(mask)
      mask.sceneObject.destroy()
      return true
    }

    return false
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE VALIDATION METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Validates that no two layouts on the same SceneObject control the same axis.
   * After successful validation, updates the axis-indexed tuple for efficient lookups.
   * @param sceneObject - The SceneObject to validate.
   * @param pendingLayouts - Set of layouts pending validation for this SceneObject.
   * @throws Error if multiple layouts are controlling the same axis.
   */
  private validateSceneObjectAxes(sceneObject: SceneObject, pendingLayouts: Set<SingleAxisLayout>): void {
    const layoutsTuple = this.sceneObjectToLayouts.get(sceneObject)
    if (!layoutsTuple) return

    // Collect all layouts: from tuple + pending (using Set to deduplicate)
    const allLayouts = new Set<SingleAxisLayout>()
    for (const layout of layoutsTuple) {
      if (layout) {
        allLayouts.add(layout)
      }
    }
    for (const layout of pendingLayouts) {
      allLayouts.add(layout)
    }

    if (allLayouts.size === 0) return

    // Group layouts by their current axis property
    const axisToLayouts: Map<Axis, SingleAxisLayout[]> = new Map()

    for (const layout of allLayouts) {
      const axis = layout.axis
      if (!axisToLayouts.has(axis)) {
        axisToLayouts.set(axis, [])
      }
      axisToLayouts.get(axis)!.push(layout)
    }

    // Check for conflicts
    for (const [axis, layoutsForAxis] of axisToLayouts) {
      if (layoutsForAxis.length > 1) {
        throw new Error(
          `Axis "${axis}" is controlled by multiple SingleAxisLayouts on SceneObject "${sceneObject.name}". ` +
            `Each axis can only be controlled by one SingleAxisLayout.`
        )
      }
    }

    // Validation passed - rebuild the tuple based on current axes
    layoutsTuple[0] = null
    layoutsTuple[1] = null
    layoutsTuple[2] = null

    for (const layout of allLayouts) {
      const axisIndex = AXIS_TO_INDEX[layout.axis]
      layoutsTuple[axisIndex] = layout
    }
  }
}
