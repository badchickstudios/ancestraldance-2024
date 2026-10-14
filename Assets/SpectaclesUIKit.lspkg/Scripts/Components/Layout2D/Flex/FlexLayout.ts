// ═══════════════════════════════════════════════════════════════════════════
// FlexLayout.ts — Thin orchestrator component.
//
// Attach to a container SceneObject. Discovers child FlexItems, calls the
// pure Flexbox2D engine, and applies results back to children.
//
// Layout is batched: property changes mark dirty → LateUpdateEvent runs
// the layout pass once per frame.
// ═══════════════════════════════════════════════════════════════════════════

import Event from "SpectaclesInteractionKit.lspkg/Utils/Event"
import ReplayEvent from "SpectaclesInteractionKit.lspkg/Utils/ReplayEvent"
import {drawWorldBox} from "../../../Utility/LayoutDebugDrawer"
import {computeFlexLayout} from "./Flexbox2D"
import {FlexItem} from "./FlexItem"
import {
  FlexAlign,
  FlexAlignContent,
  FlexContainerInput,
  FlexContentHorizontalAlignment,
  FlexContentVerticalAlignment,
  FlexDirection,
  FlexJustify,
  FlexLayoutResult,
  FlexWrap,
} from "./FlexTypes"

// Note: Enum values are used as string literals in @widget decorators (Lens Studio requirement)
// but the engine still uses the enum types internally via casts.

/**
 * CSS Flexbox layout container for the Layout2D system.
 *
 * Attach to a SceneObject and add {@link FlexItem} components to its direct children.
 * The container discovers children automatically, runs the pure {@link computeFlexLayout}
 * engine, and applies positions/sizes back to each child via its resolved handler.
 *
 * Layout is batched: property changes call {@link markDirty} and the layout pass runs
 * once per frame in LateUpdate.
 */
@component
export class FlexLayout extends BaseScriptComponent {
  // ─── Container Size ──────────────────────────────────────────────────

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Container Size</span>')
  @ui.label('<span style="color: #94A3B8; font-size: 11px;">Dimensions of the flex container in local space</span>')
  @input
  @label("Width")
  @hint("Container width in cm. -1 = auto (shrink-to-fit content).")
  private _width: number = 20

  @input
  @label("Height")
  @hint("Container height in cm. -1 = auto (shrink-to-fit content).")
  private _height: number = 20

  // ─── Flex Properties ─────────────────────────────────────────────────

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Flex Properties</span>')
  @ui.label('<span style="color: #94A3B8; font-size: 11px;">Main axis direction, wrapping, and alignment behavior</span>')
  @input
  @label("Direction")
  @widget(
    new ComboBoxWidget([
      new ComboBoxItem("Row", "row"),
      new ComboBoxItem("Row Reverse", "rowReverse"),
      new ComboBoxItem("Column", "column"),
      new ComboBoxItem("Column Reverse", "columnReverse"),
    ])
  )
  @hint("Main axis direction for laying out items.")
  private _direction: string = "row"

  @input
  @label("Wrap")
  @widget(
    new ComboBoxWidget([
      new ComboBoxItem("No Wrap", "nowrap"),
      new ComboBoxItem("Wrap", "wrap"),
      new ComboBoxItem("Wrap Reverse", "wrapReverse"),
    ])
  )
  @hint("Whether items wrap to new lines when they overflow.")
  private _wrap: string = "nowrap"

  @input
  @label("Justify Content")
  @widget(
    new ComboBoxWidget([
      new ComboBoxItem("Start", "start"),
      new ComboBoxItem("Center", "center"),
      new ComboBoxItem("End", "end"),
      new ComboBoxItem("Space Between", "spaceBetween"),
      new ComboBoxItem("Space Around", "spaceAround"),
      new ComboBoxItem("Space Evenly", "spaceEvenly"),
    ])
  )
  @hint("Distribution of items along the main axis.")
  private _justifyContent: string = "start"

  @input
  @label("Align Items")
  @widget(
    new ComboBoxWidget([
      new ComboBoxItem("Start", "start"),
      new ComboBoxItem("Center", "center"),
      new ComboBoxItem("End", "end"),
      new ComboBoxItem("Stretch", "stretch"),
    ])
  )
  @hint("Alignment of items along the cross axis.")
  private _alignItems: string = "start"

  @input
  @label("Align Content")
  @widget(
    new ComboBoxWidget([
      new ComboBoxItem("Start", "start"),
      new ComboBoxItem("Center", "center"),
      new ComboBoxItem("End", "end"),
      new ComboBoxItem("Space Between", "spaceBetween"),
      new ComboBoxItem("Space Around", "spaceAround"),
      new ComboBoxItem("Space Evenly", "spaceEvenly"),
      new ComboBoxItem("Stretch", "stretch"),
    ])
  )
  @hint("Distribution of wrapped lines along the cross axis (only applies when wrapping).")
  private _alignContent: string = "start"

  // ─── Gap ─────────────────────────────────────────────────────────────

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Gap</span>')
  @ui.label('<span style="color: #94A3B8; font-size: 11px;">Spacing between rows and columns</span>')
  @input
  @label("Row Gap")
  @hint("Gap between rows in cm. Always separates horizontal rows of items — cross-axis gap when direction=Row, main-axis gap when direction=Column.")
  private _rowGap: number = 0

  @input
  @label("Column Gap")
  @hint("Gap between columns in cm. Always separates vertical columns of items — main-axis gap when direction=Row, cross-axis gap when direction=Column.")
  private _columnGap: number = 0

  // ─── Padding ─────────────────────────────────────────────────────────

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Padding</span>')
  @ui.label('<span style="color: #94A3B8; font-size: 11px;">Inner spacing between container edges and content</span>')
  @input
  @label("Top")
  @hint("Top padding in cm.")
  private _paddingTop: number = 0

  @input
  @label("Right")
  @hint("Right padding in cm.")
  private _paddingRight: number = 0

  @input
  @label("Bottom")
  @hint("Bottom padding in cm.")
  private _paddingBottom: number = 0

  @input
  @label("Left")
  @hint("Left padding in cm.")
  private _paddingLeft: number = 0

  // ─── Content Alignment ──────────────────────────────────────────────

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Content Alignment</span>')
  @ui.label('<span style="color: #94A3B8; font-size: 11px;">Position of the layout content relative to the SceneObject center</span>')
  @input
  @label("Horizontal")
  @hint(
    "Horizontal alignment of the layout content relative to the SceneObject center."
  )
  @widget(
    new ComboBoxWidget([
      new ComboBoxItem("Left", "left"),
      new ComboBoxItem("Center", "center"),
      new ComboBoxItem("Right", "right"),
    ])
  )
  private _horizontalAlignment: string = "center"

  @input
  @label("Vertical")
  @hint(
    "Vertical alignment of the layout content relative to the SceneObject center."
  )
  @widget(
    new ComboBoxWidget([
      new ComboBoxItem("Top", "top"),
      new ComboBoxItem("Center", "center"),
      new ComboBoxItem("Bottom", "bottom"),
    ])
  )
  private _verticalAlignment: string = "center"

  // ─── Debug ───────────────────────────────────────────────────────────

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Debug</span>')
  @ui.label('<span style="color: #94A3B8; font-size: 11px;">Visual debugging tools for layout inspection</span>')
  @input
  @label("Debug Visualization")
  @hint("Enable debug visualization (container and item bounds).")
  private _debug: boolean = false

  // ─── Internal State ──────────────────────────────────────────────────

  private _items: FlexItem[] = []
  private _cachedChildCount: number = 0
  private _dirty: boolean = true
  private _isPerformingLayout: boolean = false
  private _initialized: boolean = false
  private _computedWidth: number = 0
  private _computedHeight: number = 0

  /** Settle frames: re-run layout for a few frames after init to handle deferred child setup. */
  private _settleFramesRemaining: number = 0

  /** Cached sibling FlexItem (for dirty propagation to parent layout) */
  private _siblingFlexItem: FlexItem | null = null

  private lateUpdateEvent: SceneEvent
  private debugUpdateEvent: SceneEvent

  // ─── Events ──────────────────────────────────────────────────────────

  private readonly onInitializedEvent = new ReplayEvent<void>()
  /** Fires once after the first child discovery and layout pass. Replays for late subscribers. */
  public readonly onInitialized = this.onInitializedEvent.publicApi()

  private readonly onLayoutCompleteEvent = new Event<FlexLayoutResult>()
  /** Fires after every layout pass with the full {@link FlexLayoutResult}. */
  public readonly onLayoutComplete = this.onLayoutCompleteEvent.publicApi()

  // ─── Public Getters / Setters ────────────────────────────────────────

  /** Container width in cm. Set to -1 for auto (shrink-to-fit content). */
  public get width(): number {
    return this._width
  }
  public set width(value: number) {
    if (this._width === value) return
    this._width = value
    this.markDirty()
  }

  /** Container height in cm. Set to -1 for auto (shrink-to-fit content). */
  public get height(): number {
    return this._height
  }
  public set height(value: number) {
    if (this._height === value) return
    this._height = value
    this.markDirty()
  }

  /** Main axis direction for laying out items. */
  public get direction(): FlexDirection {
    return this._direction as FlexDirection
  }
  public set direction(value: FlexDirection) {
    if (this._direction === value) return
    this._direction = value
    this.markDirty()
  }

  /** Whether items wrap onto multiple lines when they overflow the main axis. */
  public get wrap(): FlexWrap {
    return this._wrap as FlexWrap
  }
  public set wrap(value: FlexWrap) {
    if (this._wrap === value) return
    this._wrap = value
    this.markDirty()
  }

  /** Distribution of items along the main axis. */
  public get justifyContent(): FlexJustify {
    return this._justifyContent as FlexJustify
  }
  public set justifyContent(value: FlexJustify) {
    if (this._justifyContent === value) return
    this._justifyContent = value
    this.markDirty()
  }

  /** Default cross-axis alignment for all items. */
  public get alignItems(): FlexAlign {
    return this._alignItems as FlexAlign
  }
  public set alignItems(value: FlexAlign) {
    if (this._alignItems === value) return
    this._alignItems = value
    this.markDirty()
  }

  /** Distribution of wrapped lines along the cross axis. Only applies when wrapping is enabled. */
  public get alignContent(): FlexAlignContent {
    return this._alignContent as FlexAlignContent
  }
  public set alignContent(value: FlexAlignContent) {
    if (this._alignContent === value) return
    this._alignContent = value
    this.markDirty()
  }

  /** Gap between rows in cm. Cross-axis gap when direction=Row, main-axis gap when direction=Column. */
  public get rowGap(): number {
    return this._rowGap
  }
  public set rowGap(value: number) {
    if (this._rowGap === value) return
    this._rowGap = Math.max(0, value)
    this.markDirty()
  }

  /** Gap between columns in cm. Main-axis gap when direction=Row, cross-axis gap when direction=Column. */
  public get columnGap(): number {
    return this._columnGap
  }
  public set columnGap(value: number) {
    if (this._columnGap === value) return
    this._columnGap = Math.max(0, value)
    this.markDirty()
  }

  /** Sets both rowGap and columnGap to the same value (in cm). */
  public set gap(value: number) {
    this._rowGap = Math.max(0, value)
    this._columnGap = Math.max(0, value)
    this.markDirty()
  }

  /** Top padding in cm. */
  public get paddingTop(): number {
    return this._paddingTop
  }
  public set paddingTop(value: number) {
    if (this._paddingTop === value) return
    this._paddingTop = value
    this.markDirty()
  }

  /** Right padding in cm. */
  public get paddingRight(): number {
    return this._paddingRight
  }
  public set paddingRight(value: number) {
    if (this._paddingRight === value) return
    this._paddingRight = value
    this.markDirty()
  }

  /** Bottom padding in cm. */
  public get paddingBottom(): number {
    return this._paddingBottom
  }
  public set paddingBottom(value: number) {
    if (this._paddingBottom === value) return
    this._paddingBottom = value
    this.markDirty()
  }

  /** Left padding in cm. */
  public get paddingLeft(): number {
    return this._paddingLeft
  }
  public set paddingLeft(value: number) {
    if (this._paddingLeft === value) return
    this._paddingLeft = value
    this.markDirty()
  }

  /** Horizontal alignment of the layout content relative to the SceneObject center. */
  public get horizontalAlignment(): FlexContentHorizontalAlignment {
    return this._horizontalAlignment as FlexContentHorizontalAlignment
  }
  public set horizontalAlignment(value: FlexContentHorizontalAlignment) {
    if (this._horizontalAlignment === value) return
    this._horizontalAlignment = value
    this.markDirty()
  }

  /** Vertical alignment of the layout content relative to the SceneObject center. */
  public get verticalAlignment(): FlexContentVerticalAlignment {
    return this._verticalAlignment as FlexContentVerticalAlignment
  }
  public set verticalAlignment(value: FlexContentVerticalAlignment) {
    if (this._verticalAlignment === value) return
    this._verticalAlignment = value
    this.markDirty()
  }

  /** Enables debug visualization (container and item bounds drawn each frame). */
  public get debug(): boolean {
    return this._debug
  }
  public set debug(value: boolean) {
    if (this._debug === value) return
    this._debug = value
    if (this.debugUpdateEvent) {
      this.debugUpdateEvent.enabled = value
    }
  }

  /** Number of discovered FlexItem children currently managed by this layout. */
  public get itemCount(): number {
    return this._items.length
  }

  // ─── Lifecycle ───────────────────────────────────────────────────────

  public onAwake(): void {
    // LateUpdate for deferred layout — starts disabled
    this.lateUpdateEvent = this.createEvent("LateUpdateEvent")
    this.lateUpdateEvent.enabled = false
    this.lateUpdateEvent.bind(() => {
      if (this._dirty) {
        this.performLayout()
      }
      this.lateUpdateEvent.enabled = false
    })

    // UpdateEvent for child detection and settle-frame re-layout
    this.createEvent("UpdateEvent").bind(() => {
      if (this._initialized) {
        this.checkForChildChanges()
        // Re-run layout during settle period to handle deferred child init
        if (this._settleFramesRemaining > 0) {
          this._settleFramesRemaining--
          this.markDirty()
        }
      }
    })

    // Debug visualization event — starts disabled
    this.debugUpdateEvent = this.createEvent("UpdateEvent")
    this.debugUpdateEvent.enabled = this._debug
    this.debugUpdateEvent.bind(() => {
      this.renderDebug()
    })

    // OnStart: discover children and run first layout
    this.createEvent("OnStartEvent").bind(() => {
      // Cache sibling FlexItem for dirty propagation to parent layout
      const siblingFlexItem = this.sceneObject.getComponent(
        FlexItem.getTypeName()
      )
      if (siblingFlexItem) {
        this._siblingFlexItem = siblingFlexItem as FlexItem
      }

      this.discoverChildren()
      this._initialized = true
      this.onInitializedEvent.invoke()
      this._settleFramesRemaining = 3
      this.markDirty()
    })
  }

  // ─── Public Methods ──────────────────────────────────────────────────

  /**
   * Marks the layout as dirty so it will be recalculated on the next LateUpdate.
   * Automatically bubbles upward when this layout is nested inside another layout.
   * No-op if a layout pass is currently in progress.
   */
  public markDirty(): void {
    if (this._isPerformingLayout) return
    this._dirty = true
    if (this.lateUpdateEvent) {
      this.lateUpdateEvent.enabled = true
    }
    // Bubble dirty upward: if this layout is nested inside another layout,
    // notify the parent via the sibling FlexItem on the same SceneObject.
    if (this._siblingFlexItem) {
      this._siblingFlexItem["_parentLayout"]?.markDirty()
    }
  }

  /**
   * Immediately runs the layout pass synchronously, bypassing the LateUpdate batch.
   * Useful when you need layout results within the same frame.
   */
  public forceLayout(): void {
    if (this._isPerformingLayout) return
    this._dirty = true
    this.performLayout()
  }

  /**
   * Compute the intrinsic (max-content) size of this layout container.
   * Runs the flex algorithm with auto sizing (width=-1, height=-1) to
   * determine the natural size needed to fit all children.
   * Used by LayoutContainerHandler for nesting layouts inside other layouts.
   */
  public computeContentSize(): {width: number; height: number} {
    if (this._items.length === 0) {
      return {width: 0, height: 0}
    }

    const containerInput: FlexContainerInput = {
      width: -1,
      height: -1,
      direction: this._direction as FlexDirection,
      wrap: this._wrap as FlexWrap,
      justifyContent: this._justifyContent as FlexJustify,
      alignItems: this._alignItems as FlexAlign,
      alignContent: this._alignContent as FlexAlignContent,
      padding: {
        top: this._paddingTop,
        right: this._paddingRight,
        bottom: this._paddingBottom,
        left: this._paddingLeft,
      },
      rowGap: this._rowGap,
      columnGap: this._columnGap,
    }

    const itemInputs = this._items.map((item) => item.toInput())
    const result = computeFlexLayout(containerInput, itemInputs)
    return {width: result.containerWidth, height: result.containerHeight}
  }

  /**
   * Programmatically adds FlexItem children to this layout.
   * Duplicates are ignored. Triggers a layout recalculation.
   * @param items - FlexItem components to add.
   */
  public addItems(items: FlexItem[]): void {
    for (const item of items) {
      if (this._items.indexOf(item) === -1) {
        this._items.push(item)
        item.setParentLayout(this)
      }
    }
    this.markDirty()
  }

  /**
   * Programmatically removes FlexItem children from this layout.
   * Items not currently managed are ignored. Triggers a layout recalculation.
   * @param items - FlexItem components to remove.
   */
  public removeItems(items: FlexItem[]): void {
    for (const item of items) {
      const idx = this._items.indexOf(item)
      if (idx !== -1) {
        this._items.splice(idx, 1)
        item.setParentLayout(null)
      }
    }
    this.markDirty()
  }

  // ─── Child Discovery ─────────────────────────────────────────────────

  private discoverChildren(): void {
    const parent = this.sceneObject
    const childCount = parent.getChildrenCount()
    this._cachedChildCount = childCount

    // Unregister old items
    for (const item of this._items) {
      item.setParentLayout(null)
    }
    this._items = []

    // Scan for FlexItem components on direct children
    for (let i = 0; i < childCount; i++) {
      const child = parent.getChild(i)
      if (!child.enabled) continue
      const flexItem = child.getComponent(FlexItem.getTypeName())
      if (flexItem) {
        this._items.push(flexItem as FlexItem)
        ;(flexItem as FlexItem).setParentLayout(this)
      }
    }
  }

  private checkForChildChanges(): void {
    const currentCount = this.sceneObject.getChildrenCount()
    if (currentCount !== this._cachedChildCount) {
      this.discoverChildren()
      this.markDirty()
    }
  }

  // ─── Layout Pass ─────────────────────────────────────────────────────

  private performLayout(): void {
    if (this._items.length === 0) {
      this._dirty = false
      return
    }

    this._isPerformingLayout = true

    // Build engine inputs
    const containerInput: FlexContainerInput = {
      width: this._width,
      height: this._height,
      direction: this._direction as FlexDirection,
      wrap: this._wrap as FlexWrap,
      justifyContent: this._justifyContent as FlexJustify,
      alignItems: this._alignItems as FlexAlign,
      alignContent: this._alignContent as FlexAlignContent,
      padding: {
        top: this._paddingTop,
        right: this._paddingRight,
        bottom: this._paddingBottom,
        left: this._paddingLeft,
      },
      rowGap: this._rowGap,
      columnGap: this._columnGap,
    }

    const itemInputs = this._items.map((item) => item.toInput())

    // Run pure layout engine
    const result = computeFlexLayout(containerInput, itemInputs)

    // Compute content alignment offsets
    // Engine outputs top-left positions; we convert to Lens Studio center-based coords.
    // Horizontal: left = left edge at origin, center = centered, right = right edge at origin
    // Vertical: top = top edge at origin, center = centered, bottom = bottom edge at origin
    const hAlign = this._horizontalAlignment as FlexContentHorizontalAlignment
    const hOffset =
      hAlign === FlexContentHorizontalAlignment.Left
        ? 0
        : hAlign === FlexContentHorizontalAlignment.Right
          ? -result.containerWidth
          : -result.containerWidth * 0.5

    const vAlign = this._verticalAlignment as FlexContentVerticalAlignment
    const vOffset =
      vAlign === FlexContentVerticalAlignment.Top
        ? 0
        : vAlign === FlexContentVerticalAlignment.Bottom
          ? result.containerHeight
          : result.containerHeight * 0.5

    // Apply results
    for (let i = 0; i < this._items.length; i++) {
      const output = result.items[i]
      if (output) {
        // Convert from top-left origin to center-based coordinates
        // Engine outputs x,y as top-left positions.
        // In Lens Studio, Y+ is up and objects are positioned by center.
        const centerX = output.x + output.width * 0.5 + hOffset
        const centerY = vOffset - (output.y + output.height * 0.5)

        this._items[i].applyLayout(
          centerX,
          centerY,
          output.width,
          output.height
        )
      }
    }

    this._computedWidth = result.containerWidth
    this._computedHeight = result.containerHeight
    this._dirty = false
    this._isPerformingLayout = false

    this.onLayoutCompleteEvent.invoke(result)
  }

  // ─── Debug Visualization ─────────────────────────────────────────────

  private renderDebug(): void {
    if (!this._debug || !this._initialized) return

    const containerW = this._width < 0 ? this._computedWidth : this._width
    const containerH = this._height < 0 ? this._computedHeight : this._height
    const transform = this.sceneObject.getTransform()
    const worldPos = transform.getWorldPosition()
    const worldRot = transform.getWorldRotation()
    const worldScale = transform.getWorldScale()

    // Compute container center offset based on content alignment
    const hAlign = this._horizontalAlignment as FlexContentHorizontalAlignment
    const localCenterX =
      hAlign === FlexContentHorizontalAlignment.Left
        ? containerW * 0.5
        : hAlign === FlexContentHorizontalAlignment.Right
          ? -containerW * 0.5
          : 0

    const vAlign = this._verticalAlignment as FlexContentVerticalAlignment
    const localCenterY =
      vAlign === FlexContentVerticalAlignment.Top
        ? -containerH * 0.5
        : vAlign === FlexContentVerticalAlignment.Bottom
          ? containerH * 0.5
          : 0

    const containerCenter = worldPos.add(
      worldRot.multiplyVec3(new vec3(localCenterX * worldScale.x, localCenterY * worldScale.y, 0))
    )

    // Container bounds (yellow box) at alignment-adjusted position
    const cColor = new vec4(1, 1, 0, 1)
    drawWorldBox(containerCenter, containerW, containerH, worldRot, worldScale, cColor)

    // Origin marker (red diamond)
    const dSize = 0.3
    const dTop = worldPos.add(worldRot.multiplyVec3(new vec3(0, dSize, 0)))
    const dRight = worldPos.add(worldRot.multiplyVec3(new vec3(dSize, 0, 0)))
    const dBottom = worldPos.add(worldRot.multiplyVec3(new vec3(0, -dSize, 0)))
    const dLeft = worldPos.add(worldRot.multiplyVec3(new vec3(-dSize, 0, 0)))
    const dColor = new vec4(1, 0.2, 0.2, 1)
    global.debugRenderSystem.drawSolidTriangle(dTop, dLeft, dBottom, dColor)
    global.debugRenderSystem.drawSolidTriangle(dTop, dBottom, dRight, dColor)

    // Item bounds (cyan) — use allocated size from layout, not intrinsic measure
    // Sizes are in the container's local coordinate space, so use container's world transform
    const iColor = new vec4(0, 1, 1, 1)
    for (const item of this._items) {
      const itemPos = item.sceneObject.getTransform().getWorldPosition()
      const size = item.allocatedSize()
      drawWorldBox(itemPos, size.width, size.height, worldRot, worldScale, iColor)
    }
  }
}
