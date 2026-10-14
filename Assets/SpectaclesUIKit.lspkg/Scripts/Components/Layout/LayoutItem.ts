import Event, {unsubscribe} from "SpectaclesInteractionKit.lspkg/Utils/Event"
import NativeLogger from "SpectaclesInteractionKit.lspkg/Utils/NativeLogger"
import ReplayEvent from "SpectaclesInteractionKit.lspkg/Utils/ReplayEvent"
import {renderLayoutItemDebug} from "../../Utility/LayoutDebugDrawer"
import {
  applyLocalPosition,
  applySizeToScreenTransformOffsets,
  applySizeToVisualComponents,
  applyUnifiedScale,
  cacheLayoutableSettings,
  cloneVisualMaterials,
  collectVisualComponents,
  computeBounds,
  computeLocalPosition,
  configureScreenTransformToFill,
  extractUIKitComponentMaterial,
  getAxisMask,
  getLayoutable,
  getTextMaterial,
  isAnyAxisComponentDriven,
  isAnyAxisLayoutDriven,
  isLayoutable,
  isNestableLayout,
  measureVisualComponents,
  resizeTextsToFit,
  restoreLayoutableSettings,
  restoreNestableLayoutSettings,
  SCREEN_TRANSFORM_CENTER_ANCHOR,
  syncLayoutableSize,
  updateLayoutableAxisSettings,
  updateNestableLayoutAxisSettings
} from "../../Utility/LayoutItemUtilities"
import {vec3ApproximatelyEqual} from "../../Utility/UIKitUtilities"
import {Layoutable} from "./Layoutable"
import {
  Bounds3D,
  DepthAlignment,
  HorizontalAlignment,
  LayoutableOriginalSettings,
  SizeDriver,
  SizeDriverInput,
  VerticalAlignment
} from "./LayoutConfigurationTypes"
import {NestableLayout} from "./NestableLayout"

const log = new NativeLogger("LayoutItem")

/**
 * LayoutItem manages the sizing and positioning of various item types within a scene object.
 *
 * This component automatically detects and applies dimensions to:
 * - Layoutable components (Element, Shape, Frame, ScrollWindow, SpatialLayout)
 * - Lens Studio components (RenderMeshVisual, Image, Text, ScreenTransform)
 *
 * ## Sizing Drivers
 *
 * Each axis (width, height, depth) has an independent `SizeDriver` that controls the source of its size:
 *
 * ### `SizeDriver.Component`
 * The underlying component controls the size (size flows upward).
 * - LayoutItem reads size from the component (e.g. text bounds, mesh size)
 * - Useful for items that determine their own size (Text, dynamic layouts)
 *
 * ### `SizeDriver.LayoutItem`
 * The LayoutItem manual input controls the size (size flows downward).
 * - Uses the manually set `width`/`height`/`depth` properties
 * - Overrides any parent layout or component size
 *
 * ### `SizeDriver.LayoutAndLayoutItem` (default)
 * The parent Layout controls the size (size flows downward).
 * - Size comes from the parent layout system (e.g. `layoutWidth` assigned by a SpatialLayout)
 * - If no parent layout is present, falls back to `LayoutItem` behavior
 *
 */
@component
export class LayoutItem extends BaseScriptComponent {
  @input
  @label("Width")
  private widthInput: SizeDriverInput = new SizeDriverInput()

  @input
  @label("Height")
  private heightInput: SizeDriverInput = new SizeDriverInput()

  @input
  @label("Depth")
  private depthInput: SizeDriverInput = new SizeDriverInput()

  @ui.group_start("Alignment (within grid cells)")
  @input
  @hint("Horizontal alignment of the item within grid cells.")
  @widget(
    new ComboBoxWidget([new ComboBoxItem("Left", "-"), new ComboBoxItem("Center", ""), new ComboBoxItem("Right", "+")])
  )
  private _alignmentX: string = HorizontalAlignment.Center

  @input
  @hint("Vertical alignment of the item within grid cells.")
  @widget(
    new ComboBoxWidget([new ComboBoxItem("Bottom", "-"), new ComboBoxItem("Center", ""), new ComboBoxItem("Top", "+")])
  )
  private _alignmentY: string = VerticalAlignment.Center

  @input
  @hint("Depth alignment of the item within grid cells.")
  @widget(
    new ComboBoxWidget([new ComboBoxItem("Back", "-"), new ComboBoxItem("Center", ""), new ComboBoxItem("Front", "+")])
  )
  private _alignmentZ: string = DepthAlignment.Center
  @ui.group_end
  private _layoutWidth: number = this.widthInput.size
  private _layoutHeight: number = this.heightInput.size
  private _layoutDepth: number = this.depthInput.size

  private _position: vec3 = vec3.zero()

  private readonly transform: Transform = this.sceneObject.getTransform()
  private screenTransform: ScreenTransform | undefined = this.sceneObject.getComponent("Component.ScreenTransform")

  private readonly _itemComponents: Component[] = []
  private readonly _materials: Material[] = []

  // Cached component lists to avoid frequent getComponents calls
  private readonly _renderMeshVisuals: RenderMeshVisual[] = []
  private readonly _images: Image[] = []
  private readonly _texts: Text[] = []

  private readonly _areComponentsEnabled: Map<Component, boolean> = new Map()

  private readonly positionUpdateHandlers: (() => void)[] = []
  private readonly sizeUpdateHandlers: (() => void)[] = []

  private _isVisible: boolean = true
  private _initialized: boolean = false

  // Created once in onAwake, enabled/disabled to schedule deferred size updates
  private updateSizeOnLateUpdateEvent: SceneEvent

  // Cached original parent for layout management
  private _originalParent: SceneObject | null = null

  // Layoutable component reference for dynamic size driver switching
  private _layoutable: Layoutable | null = null
  private _originalLayoutableSettings: LayoutableOriginalSettings | null = null
  // Component-driven size: cached at initialization and updated by onSizeChanged events when size driver is Component
  private _componentDrivenSize: vec3 | null = null

  // Unsubscribe callbacks for event subscriptions (component size changes, direction events, etc.)
  private _unsubscribeCallbacks: unsubscribe[] = []

  // Subscription for pending initialization of underlying Layoutable component
  private _pendingInitUnsubscribe: unsubscribe | null = null

  private readonly onInitializedEvent = new ReplayEvent<void>()
  public readonly onInitialized = this.onInitializedEvent.publicApi()
  private readonly onPositionUpdatedEvent = new Event<vec3>()
  public readonly onPositionUpdated = this.onPositionUpdatedEvent.publicApi()
  private readonly onSizeUpdatedEvent = new Event<vec3>()
  public readonly onSizeUpdated = this.onSizeUpdatedEvent.publicApi()

  private readonly onAlignmentUpdatedEvent = new Event<void>()
  public readonly onAlignmentUpdated = this.onAlignmentUpdatedEvent.publicApi()

  private _debug: boolean = false
  // Debug rendering update event, created once and enabled/disabled as needed
  private debugUpdateEvent: SceneEvent

  // ═══════════════════════════════════════════════════════════════════════════
  // PUBLIC GETTERS/SETTERS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Gets the current position of the item in local space centimeters.
   *
   * @returns The position in local space centimeters.
   */
  public get position(): vec3 {
    return this._position
  }

  /**
   * Sets the position of the item in local space centimeters.
   *
   * @param value - The position in local space centimeters.
   */
  public set position(value: vec3) {
    if (vec3ApproximatelyEqual(this._position, value)) {
      return
    }
    this._position = value
    if (this._initialized) {
      this.updatePosition()
    }
  }

  /**
   * Gets the size driver for the width axis.
   * @returns The size driver for the width axis.
   * - `SizeDriver.Component`: Size is determined by the underlying component (e.g. Text, Mesh).
   * - `SizeDriver.LayoutItem`: Size is set manually via the `width` property.
   * - `SizeDriver.LayoutAndLayoutItem`: Size is determined by the parent Layout, or manual `width` if no parent Layout exists.
   */
  public get widthSizeDriver(): SizeDriver {
    return this.widthInput.sizeDriver as SizeDriver
  }

  /**
   * Sets the size driver for the width axis.
   * @param value - The new size driver for the width axis.
   * - `SizeDriver.Component`: Size is determined by the underlying component (e.g. Text, Mesh).
   * - `SizeDriver.LayoutItem`: Size is set manually via the `width` property.
   * - `SizeDriver.LayoutAndLayoutItem`: Size is determined by the parent Layout, or manual `width` if no parent Layout exists.
   */
  public set widthSizeDriver(value: SizeDriver) {
    if (this.widthInput.sizeDriver === value) return
    this.widthInput.sizeDriver = value
    if (this._initialized) {
      this.updateMode()
    }
  }

  /**
   * Gets the size driver for the height axis.
   * @returns The size driver for the height axis.
   * - `SizeDriver.Component`: Size is determined by the underlying component (e.g. Text, Mesh).
   * - `SizeDriver.LayoutItem`: Size is set manually via the `height` property.
   * - `SizeDriver.LayoutAndLayoutItem`: Size is determined by the parent Layout, or manual `height` if no parent Layout exists.
   */
  public get heightSizeDriver(): SizeDriver {
    return this.heightInput.sizeDriver as SizeDriver
  }

  /**
   * Sets the size driver for the height axis.
   * @param value - The new size driver for the height axis.
   * - `SizeDriver.Component`: Size is determined by the underlying component (e.g. Text, Mesh).
   * - `SizeDriver.LayoutItem`: Size is set manually via the `height` property.
   * - `SizeDriver.LayoutAndLayoutItem`: Size is determined by the parent Layout, or manual `height` if no parent Layout exists.
   */
  public set heightSizeDriver(value: SizeDriver) {
    if (this.heightInput.sizeDriver === value) return
    this.heightInput.sizeDriver = value
    if (this._initialized) {
      this.updateMode()
    }
  }

  /**
   * Gets the size driver for the depth axis.
   * @returns The size driver for the depth axis.
   * - `SizeDriver.Component`: Size is determined by the underlying component (e.g. Text, Mesh).
   * - `SizeDriver.LayoutItem`: Size is set manually via the `depth` property.
   * - `SizeDriver.LayoutAndLayoutItem`: Size is determined by the parent Layout, or manual `depth` if no parent Layout exists.
   */
  public get depthSizeDriver(): SizeDriver {
    return this.depthInput.sizeDriver as SizeDriver
  }

  /**
   * Sets the size driver for the depth axis.
   * @param value - The new size driver for the depth axis.
   * - `SizeDriver.Component`: Size is determined by the underlying component (e.g. Text, Mesh).
   * - `SizeDriver.LayoutItem`: Size is set manually via the `depth` property.
   * - `SizeDriver.LayoutAndLayoutItem`: Size is determined by the parent Layout, or manual `depth` if no parent Layout exists.
   */
  public set depthSizeDriver(value: SizeDriver) {
    if (this.depthInput.sizeDriver === value) return
    this.depthInput.sizeDriver = value
    if (this._initialized) {
      this.updateMode()
    }
  }

  /**
   * Gets the current width of the item in centimeters.
   * @returns The width in centimeters.
   */
  public get width(): number {
    switch (this.widthInput.sizeDriver) {
      case SizeDriver.Component:
        return this._componentDrivenSize?.x ?? 0
      case SizeDriver.LayoutItem:
        return this.widthInput.size
      case SizeDriver.LayoutAndLayoutItem:
      default:
        return this._layoutWidth
    }
  }

  /**
   * Sets the width of the item in centimeters.
   * @param value - The new width in centimeters.
   */
  public set width(value: number) {
    if (this.widthInput.sizeDriver === SizeDriver.Component) {
      log.w("width has no effect: sizeDriver is Component.")
      return
    }
    let changed = false
    if (this.widthInput.sizeDriver === SizeDriver.LayoutItem) {
      if (this.widthInput.size !== value) {
        this.widthInput.size = value
        changed = true
      }
    } else {
      if (this._layoutWidth !== value) {
        this._layoutWidth = value
        changed = true
      }
    }

    if (changed && this._initialized) {
      this.updateSizeOnLateUpdateEvent.enabled = true
    }
  }

  /**
   * Gets the current height of the item in centimeters.
   * @returns The height in centimeters.
   */
  public get height(): number {
    switch (this.heightInput.sizeDriver) {
      case SizeDriver.Component:
        return this._componentDrivenSize?.y ?? 0
      case SizeDriver.LayoutItem:
        return this.heightInput.size
      case SizeDriver.LayoutAndLayoutItem:
      default:
        return this._layoutHeight
    }
  }

  /**
   * Sets the height of the item in centimeters.
   * @param value - The new height in centimeters.
   */
  public set height(value: number) {
    if (this.heightInput.sizeDriver === SizeDriver.Component) {
      log.w("height has no effect: sizeDriver is Component.")
      return
    }
    let changed = false
    if (this.heightInput.sizeDriver === SizeDriver.LayoutItem) {
      if (this.heightInput.size !== value) {
        this.heightInput.size = value
        changed = true
      }
    } else {
      if (this._layoutHeight !== value) {
        this._layoutHeight = value
        changed = true
      }
    }

    if (changed && this._initialized) {
      this.updateSizeOnLateUpdateEvent.enabled = true
    }
  }

  /**
   * Gets the current depth of the item in centimeters.
   * @returns The depth in centimeters.
   */
  public get depth(): number {
    switch (this.depthInput.sizeDriver) {
      case SizeDriver.Component:
        return this._componentDrivenSize?.z ?? 0
      case SizeDriver.LayoutItem:
        return this.depthInput.size
      case SizeDriver.LayoutAndLayoutItem:
      default:
        return this._layoutDepth
    }
  }

  /**
   * Sets the depth of the item in centimeters.
   * @param value - The new depth in centimeters.
   */
  public set depth(value: number) {
    if (this.depthInput.sizeDriver === SizeDriver.Component) {
      log.w("depth has no effect: sizeDriver is Component.")
      return
    }
    let changed = false
    if (this.depthInput.sizeDriver === SizeDriver.LayoutItem) {
      if (this.depthInput.size !== value) {
        this.depthInput.size = value
        changed = true
      }
    } else {
      if (this._layoutDepth !== value) {
        this._layoutDepth = value
        changed = true
      }
    }

    if (changed && this._initialized) {
      this.updateSizeOnLateUpdateEvent.enabled = true
    }
  }

  /**
   * Gets the current size of the item as a vec3 (width, height, depth) in centimeters.
   * @returns The size vector in centimeters.
   */
  public get size(): vec3 {
    return new vec3(this.width, this.height, this.depth)
  }

  /**
   * Sets the size of the item as a vec3 (width, height, depth) in centimeters.
   * @param value - The new size vector in centimeters.
   */
  public set size(value: vec3) {
    let changed = false

    // Update Width
    if (this.widthInput.sizeDriver !== SizeDriver.Component) {
      if (this.widthInput.sizeDriver === SizeDriver.LayoutItem) {
        if (this.widthInput.size !== value.x) {
          this.widthInput.size = value.x
          changed = true
        }
      } else {
        if (this._layoutWidth !== value.x) {
          this._layoutWidth = value.x
          changed = true
        }
      }
    }

    // Update Height
    if (this.heightInput.sizeDriver !== SizeDriver.Component) {
      if (this.heightInput.sizeDriver === SizeDriver.LayoutItem) {
        if (this.heightInput.size !== value.y) {
          this.heightInput.size = value.y
          changed = true
        }
      } else {
        if (this._layoutHeight !== value.y) {
          this._layoutHeight = value.y
          changed = true
        }
      }
    }

    // Update Depth
    if (this.depthInput.sizeDriver !== SizeDriver.Component) {
      if (this.depthInput.sizeDriver === SizeDriver.LayoutItem) {
        if (this.depthInput.size !== value.z) {
          this.depthInput.size = value.z
          changed = true
        }
      } else {
        if (this._layoutDepth !== value.z) {
          this._layoutDepth = value.z
          changed = true
        }
      }
    }

    if (changed && this._initialized) {
      this.updateSizeOnLateUpdateEvent.enabled = true
    }
  }

  /**
   * Gets the 3D bounding box of the item.
   * Returns an axis-aligned bounding box based on the current position and dimensions.
   *
   * @returns The bounds containing min, max, size, and center vectors.
   */
  public get bounds(): Bounds3D {
    return computeBounds(this._position, this.size)
  }

  /**
   * Gets the materials of the item.
   * @returns The materials of the item.
   */
  public get materials(): Material[] {
    return this._materials
  }

  /**
   * Gets whether the item is visible.
   * @returns True if the item is visible, false otherwise.
   */
  public get isVisible(): boolean {
    return this._isVisible
  }

  /**
   * Sets whether the item is visible.
   * @param value - True to make the item visible, false to hide it.
   */
  public set isVisible(value: boolean) {
    if (this._isVisible === value) {
      return
    }
    this._isVisible = value
    if (this._initialized) {
      this.updateVisibility()
    }
  }

  /**
   * Gets whether the item is initialized.
   * @returns True if the item is initialized, false otherwise.
   */
  public get initialized(): boolean {
    return this._initialized
  }

  /**
   * Gets whether debug visualization is enabled.
   * When enabled, draws a wireframe box showing the item bounds.
   *
   * @returns True if debug mode is enabled, false otherwise.
   */
  public get debug(): boolean {
    return this._debug
  }

  /**
   * Sets whether debug visualization is enabled.
   * When enabled, draws a wireframe box showing the item bounds using DebugRender.
   *
   * @param value - True to enable debug visualization, false to disable.
   */
  public set debug(value: boolean) {
    if (this._debug === value) {
      return
    }
    this._debug = value
    if (this.debugUpdateEvent) {
      this.debugUpdateEvent.enabled = value
    }
  }

  // Alignment
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Gets the horizontal alignment of the item within grid cells.
   * @returns The horizontal alignment.
   */
  public get alignmentX(): HorizontalAlignment {
    return this._alignmentX as HorizontalAlignment
  }

  /**
   * Sets the horizontal alignment of the item within grid cells.
   * @param value - The new horizontal alignment.
   */
  public set alignmentX(value: HorizontalAlignment) {
    if (this._alignmentX === value) return
    this._alignmentX = value
    this.onAlignmentUpdatedEvent.invoke()
  }

  /**
   * Gets the vertical alignment of the item within grid cells.
   * @returns The vertical alignment.
   */
  public get alignmentY(): VerticalAlignment {
    return this._alignmentY as VerticalAlignment
  }

  /**
   * Sets the vertical alignment of the item within grid cells.
   * @param value - The new vertical alignment.
   */
  public set alignmentY(value: VerticalAlignment) {
    if (this._alignmentY === value) return
    this._alignmentY = value
    this.onAlignmentUpdatedEvent.invoke()
  }

  /**
   * Gets the depth alignment of the item within grid cells.
   * @returns The depth alignment.
   */
  public get alignmentZ(): DepthAlignment {
    return this._alignmentZ as DepthAlignment
  }

  /**
   * Sets the depth alignment of the item within grid cells.
   * @param value - The new depth alignment.
   */
  public set alignmentZ(value: DepthAlignment) {
    if (this._alignmentZ === value) return
    this._alignmentZ = value
    this.onAlignmentUpdatedEvent.invoke()
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PUBLIC CLASS METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Parents this item to a layout.
   * Caches the original parent for later restoration.
   * World position and scale are preserved during reparenting.
   * This method is idempotent - if already parented to the layout, it does nothing.
   *
   * @param layout - The layout to parent to (SingleAxisLayout or SpatialLayout).
   */
  public parentToLayout(layout: {sceneObject: SceneObject}): void {
    // Only save and reparent if not already parented to this layout
    if (this.sceneObject.getParent() === layout.sceneObject) {
      return
    }
    this._originalParent = this.sceneObject.getParent()
    this.sceneObject.setParent(layout.sceneObject)
  }

  /**
   * Unparents this item from the layout and restores the original parent.
   * World position and scale are preserved during reparenting.
   * The internal position is synced to match the new local position after reparenting.
   *
   * @returns The original parent that was restored, or null if there wasn't one.
   */
  public unparentFromLayout(): SceneObject | null {
    this.sceneObject.setParent(this._originalParent)
    // Sync the stored position to match the actual local position after reparenting
    this._position = computeLocalPosition(this.transform, this.screenTransform)

    return this._originalParent
  }

  /**
   * Refreshes the LayoutItem's size by re-reading from the underlying component.
   *
   * This method is for non-Layoutable components (RenderMeshVisual, Image, Text) that don't
   * automatically report size changes. Call this after manually modifying the component's size
   * to update LayoutItem and trigger parent layout recalculation.
   *
   * @remarks
   * - Requires size driver = Component (size must be component-driven)
   * - Only applies to non-Layoutable components (has no effect for Element, Shape, Frame, ScrollWindow, SpatialLayout)
   * - Layoutable components already track size changes automatically via `onSizeChanged`
   * - Fires `onSizeUpdated` event if the size changed, which notifies parent layouts to refresh
   *
   * @example
   * ```typescript
   * // After manually changing a RenderMeshVisual's mesh or transform scale
   * layoutItem.refreshSize();
   * ```
   */
  public refreshSize(): void {
    if (!this._initialized) {
      log.w("refreshSize called before initialization")
      return
    }

    const mask = this.axisMask

    if (!isAnyAxisComponentDriven(mask)) {
      log.w("refreshSize has no effect: size driver is not Component (no axis is component driven).")
      return
    }
    if (this._layoutable) {
      log.w("refreshSize has no effect on Layoutable components.")
      return
    }
    // Re-read size from component
    const newSize = this.computeCombinedComponentSize()
    if (newSize === null) {
      return
    }

    // Check if size actually changed
    const oldSize = this._componentDrivenSize
    if (oldSize && vec3ApproximatelyEqual(oldSize, newSize)) {
      return
    }

    this._componentDrivenSize = newSize
    this.onSizeUpdatedEvent.invoke(this.size)
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PUBLIC BASESCRIPTCOMPONENT METHOD
  // ═══════════════════════════════════════════════════════════════════════════

  public onAwake() {
    // Initialize position using the helper method
    this._position = computeLocalPosition(this.transform, this.screenTransform)

    // Create the late update event once, starts disabled
    this.updateSizeOnLateUpdateEvent = this.createEvent("LateUpdateEvent")
    this.updateSizeOnLateUpdateEvent.enabled = false
    this.updateSizeOnLateUpdateEvent.bind(this.updateSizeOnLateUpdate)

    // Create the debug update event once, starts disabled
    this.debugUpdateEvent = this.createEvent("UpdateEvent")
    this.debugUpdateEvent.enabled = this._debug
    this.debugUpdateEvent.bind(this.renderDebugBounds)

    this.createEvent("OnStartEvent").bind(() => {
      const completeInitialization = () => {
        if (!this.screenTransform) this.screenTransform = this.sceneObject.getComponent("Component.ScreenTransform")
        if (this._itemComponents.length > 0) {
          this._itemComponents.forEach((component) => {
            this._areComponentsEnabled.set(component, component.enabled)
          })
          this.updatePosition()
          this.updateSize()
        } else {
          log.e(`No suitable component found on ${this.sceneObject.name}`)
        }
        this._initialized = true
        this.onInitializedEvent.invoke()
      }

      this.initializeItem(completeInitialization)
    })

    this.createEvent("OnDestroyEvent").bind(() => {
      this.updateSizeOnLateUpdateEvent.enabled = false
      this.restoreLayoutableOriginalConfig()
      this.unsubscribeAll()
      if (this._pendingInitUnsubscribe) {
        this._pendingInitUnsubscribe()
        this._pendingInitUnsubscribe = null
      }
    })
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE GETTERS/SETTERS
  // ═══════════════════════════════════════════════════════════════════════════

  private get isComponentLayoutable(): boolean {
    return isLayoutable(this._layoutable)
  }

  private get axisMask() {
    return getAxisMask(
      this.widthInput.sizeDriver as SizeDriver,
      this.heightInput.sizeDriver as SizeDriver,
      this.depthInput.sizeDriver as SizeDriver
    )
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Updates the mode (Component vs Layout driven) for all axes based on current inputs.
   */
  private updateMode(): void {
    // Unsubscribe previous handlers
    this.unsubscribeAll()

    // Restore original config to clean slate
    this.restoreLayoutableOriginalConfig()
    this._originalLayoutableSettings = null

    const mask = this.axisMask
    const isComponentDriven = isAnyAxisComponentDriven(mask)
    const isLayoutDriven = isAnyAxisLayoutDriven(mask)

    if (this._layoutable && this.isComponentLayoutable) {
      if (isComponentDriven) {
        this.subscribeToLayoutableSizeChangedEvent()
      }

      if (this._layoutable.initialized && isLayoutDriven) {
        // Cache settings for Layout driven axes
        this._originalLayoutableSettings = cacheLayoutableSettings(
          this._layoutable,
          this._originalLayoutableSettings,
          mask
        )
        if (isNestableLayout(this._layoutable)) {
          this._originalLayoutableSettings = updateNestableLayoutAxisSettings(
            this._layoutable as NestableLayout,
            this._originalLayoutableSettings,
            mask
          )
        }
      }
    } else {
      // Non-Layoutable
      if (isComponentDriven) {
        this.readSizeFromNonLayoutable()
      }
    }

    this.updateSize()
  }

  private updatePosition(): void {
    this.positionUpdateHandlers.forEach((positionUpdateHandler) => positionUpdateHandler())
    this.onPositionUpdatedEvent.invoke(this._position)
  }

  private updateSize(): void {
    this.sizeUpdateHandlers.forEach((sizeUpdateHandler) => sizeUpdateHandler())
    this.onSizeUpdatedEvent.invoke(this.size)
  }

  /**
   * Callback for the LateUpdateEvent. Performs the deferred size update.
   */
  private updateSizeOnLateUpdate = (): void => {
    this.updateSizeOnLateUpdateEvent.enabled = false
    this.updateSize()
  }

  private updateVisibility(): void {
    this._itemComponents.forEach(
      (component) => (component.enabled = this._isVisible ? this._areComponentsEnabled.get(component) : false)
    )
  }

  private initializeItem(onComplete: () => void): void {
    if (this.tryInitializeLayoutable(onComplete)) {
      return
    }

    // Set up shared position handler for all non-Layoutable components
    this.setupPositionUpdateHandler()
    this.setupSizeUpdateHandler()

    // Initialize all visual components using the centralized collector
    const {renderMeshVisuals, images, texts} = collectVisualComponents(this.sceneObject)

    // Process RenderMeshVisuals
    if (renderMeshVisuals.length > 0) {
      renderMeshVisuals.forEach((visual) => {
        this._itemComponents.push(visual)
        this._renderMeshVisuals.push(visual)
        this.cloneAndStoreMaterials(visual)
      })
    }

    // Process Images
    if (images.length > 0) {
      images.forEach((image) => {
        this._itemComponents.push(image)
        this._images.push(image)
        this.cloneAndStoreMaterials(image)
      })
    }

    // Process Texts
    if (texts.length > 0) {
      texts.forEach((text) => {
        this._itemComponents.push(text)
        this._texts.push(text)
        const material = getTextMaterial(text)
        if (material) {
          this._materials.push(material)
        }
      })
      this.setupTextsSizeHandler()
    }

    this._componentDrivenSize = this.computeCombinedComponentSize()
    onComplete()
  }

  /**
   * Attempts to initialize Layoutable components (Element, Shape, or Layout).
   * @returns true if a Layoutable component was found and initialized, false otherwise.
   */
  private tryInitializeLayoutable(onComplete: () => void): boolean {
    const layoutable = getLayoutable(this.sceneObject)
    if (layoutable) {
      this.initializeLayoutable(layoutable, onComplete)
      return true
    }
    return false
  }

  /**
   * Sets up the position update handler for the item.
   * This is used by all component types since they all use the same positioning logic.
   */
  private setupPositionUpdateHandler(): void {
    this.positionUpdateHandlers.push(() => {
      applyLocalPosition(this._position, this.transform, this.screenTransform)
    })
  }

  /**
   * Initializes a Layoutable component with position and size handlers.
   * Enables nested layouts to be controlled by parent layouts.
   */
  private initializeLayoutable(layoutable: Layoutable, onComplete: () => void): void {
    this._itemComponents.push(layoutable as unknown as Component)
    this._layoutable = layoutable
    if (this.screenTransform) {
      configureScreenTransformToFill(this.screenTransform, this.transform)
    }
    this.setupPositionUpdateHandler()

    // Component drives LayoutItem size
    const mask = this.axisMask

    if (isAnyAxisComponentDriven(mask)) {
      this.subscribeToLayoutableSizeChangedEvent()
    }

    this.sizeUpdateHandlers.push(() => {
      if (layoutable.initialized) {
        syncLayoutableSize(layoutable, {width: this.width, height: this.height, depth: this.depth}, this.axisMask)
      }
    })

    // Wait for Layoutable to be initialized before configuring
    const completeLayoutableInit = () => {
      this._pendingInitUnsubscribe = null
      // Cache the component size for component-driven mode
      this._componentDrivenSize = layoutable.layoutSize

      // Re-check mask as it might have changed during async init (unlikely but safe)
      const currentMask = this.axisMask

      if (isAnyAxisLayoutDriven(currentMask)) {
        if (isNestableLayout(layoutable)) {
          this._originalLayoutableSettings = updateNestableLayoutAxisSettings(
            layoutable as NestableLayout,
            this._originalLayoutableSettings,
            currentMask
          )
        }
        this._originalLayoutableSettings = updateLayoutableAxisSettings(
          layoutable,
          this._originalLayoutableSettings,
          {width: this.width, height: this.height, depth: this.depth},
          currentMask
        )
      }

      // Handle VisualElement/Shape material caching if applicable
      const material = extractUIKitComponentMaterial(layoutable)
      if (material) {
        this._materials.push(material)
      }

      onComplete()
    }

    if (layoutable.initialized) {
      completeLayoutableInit()
    } else {
      this._pendingInitUnsubscribe = layoutable.onInitialized.add(completeLayoutableInit)
    }
  }

  private subscribeToLayoutableSizeChangedEvent(): void {
    if (!this._layoutable) return
    this._unsubscribeCallbacks.push(
      this._layoutable.onSizeChanged.add((newSize: vec3) => {
        this._componentDrivenSize = newSize
        this.onSizeUpdatedEvent.invoke(this.size)
      })
    )
  }

  private unsubscribeAll(): void {
    this._unsubscribeCallbacks.forEach((unsubscribe) => unsubscribe())
    this._unsubscribeCallbacks = []
  }

  /**
   * Reads size from non-Layoutable components (RenderMeshVisual, Image, Text).
   * Called when component size driver is enabled dynamically for non-Layoutable components.
   * Uses cached size if available and restores the component to that size.
   */
  private readSizeFromNonLayoutable(): void {
    // Use cached size if available
    if (this._componentDrivenSize) {
      // Restore the components to the cached size
      applySizeToVisualComponents(
        this._componentDrivenSize,
        this.transform,
        this.sceneObject.getParent(),
        this.screenTransform,
        this._renderMeshVisuals,
        this._images,
        this._texts
      )
      return
    }

    // Fallback: read current size from all components (only if no cached size)
    const combinedSize = this.computeCombinedComponentSize()
    if (combinedSize) {
      this._componentDrivenSize = combinedSize
    }
  }

  /**
   * Computes the combined size of all non-Layoutable components (RenderMeshVisual, Image, Text).
   * Uses the union of bounding boxes across all component types.
   * @returns The combined component size, or null if no valid components found.
   */
  private computeCombinedComponentSize(): vec3 | null {
    return measureVisualComponents(
      this.transform.getLocalScale(),
      this.transform.getInvertedWorldTransform(),
      this.screenTransform,
      this._renderMeshVisuals,
      this._images,
      this._texts,
      {width: this.width, height: this.height}
    )
  }

  /**
   * Restores the original Layoutable settings that were cached during initialization.
   * Called only when LayoutItem is destroyed to ensure the nested Layoutable
   * returns to its original configuration.
   */
  private restoreLayoutableOriginalConfig(): void {
    // Check both JS null/undefined AND destroyed component (isNull checks if ScriptComponent was destroyed)
    if (isNull(this._layoutable) || !this.isComponentLayoutable || !this._originalLayoutableSettings) {
      return
    }
    restoreLayoutableSettings(this._layoutable, this._originalLayoutableSettings)
    if (isNestableLayout(this._layoutable)) {
      restoreNestableLayoutSettings(this._layoutable as NestableLayout, this._originalLayoutableSettings)
    }
  }

  /**
   * Sets up size handlers.
   * Position handling is done by the shared setupPositionUpdateHandler.
   */
  private setupSizeUpdateHandler(): void {
    if (this.screenTransform) {
      // Only modify anchors if LayoutItem is controlling size (at least one axis)
      const mask = this.axisMask
      if (mask.horizontal || mask.vertical) {
        this.screenTransform.anchors = SCREEN_TRANSFORM_CENTER_ANCHOR
      }
      this.sizeUpdateHandlers.push(() => {
        const currentMask = this.axisMask
        if (this.screenTransform && (currentMask.horizontal || currentMask.vertical)) {
          applySizeToScreenTransformOffsets(this.screenTransform, this.width, this.height)
        }
      })
    }

    // Add unified scale handler for visuals
    this.sizeUpdateHandlers.push(this.updateUnifiedScale)
  }

  private setupTextsSizeHandler(): void {
    if (!this.screenTransform) {
      this.sizeUpdateHandlers.push(this.updateTextsSize)
    }
  }

  /**
   * Clones materials from a visual component and stores them.
   * This allows for independent material manipulation per instance.
   */
  private cloneAndStoreMaterials(visual: RenderMeshVisual | Image): void {
    const clonedMaterials = cloneVisualMaterials(visual)
    clonedMaterials.forEach((material) => this._materials.push(material))
  }

  private updateUnifiedScale = () => {
    const mask = this.axisMask
    if (!mask.horizontal && !mask.vertical && !mask.depth) {
      return
    }

    applyUnifiedScale(
      this.transform,
      this.size,
      this._renderMeshVisuals,
      this._images,
      this.transform.getInvertedWorldTransform(),
      !!this.screenTransform
    )
  }

  private updateTextsSize = () => {
    const mask = this.axisMask
    if (mask.horizontal || mask.vertical) {
      resizeTextsToFit(this._texts, this.size, this.sceneObject.getParent())
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE DEBUG METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Renders a debug wireframe box showing the item bounds.
   * Uses the global debug render system to draw a box at the item's world position.
   */
  private renderDebugBounds = () => {
    renderLayoutItemDebug(this.transform, this.width, this.height, this.depth)
  }
}
