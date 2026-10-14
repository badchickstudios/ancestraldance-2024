// ═══════════════════════════════════════════════════════════════════════════
// GridLayout.ts — Thin orchestrator component for CSS Grid layout.
//
// Attach to a container SceneObject. Discovers child GridItems, calls the
// pure Grid2D engine, and applies results back to children.
//
// Layout is batched: property changes mark dirty → LateUpdateEvent runs
// the layout pass once per frame.
// ═══════════════════════════════════════════════════════════════════════════

import Event from "SpectaclesInteractionKit.lspkg/Utils/Event"
import ReplayEvent from "SpectaclesInteractionKit.lspkg/Utils/ReplayEvent"
import {drawWorldBox} from "../../../Utility/LayoutDebugDrawer"
import {ContentHorizontalAlignment, ContentVerticalAlignment} from "../LayoutTypes"
import {computeGridLayout} from "./Grid2D"
import {GridItem} from "./GridItem"
import {
  GridAlign,
  GridAutoFlow,
  GridContainerInput,
  GridLayoutResult,
} from "./GridTypes"

/**
 * CSS Grid layout container for the Layout2D system.
 *
 * Attach to a SceneObject and add {@link GridItem} components to its direct children.
 * The container discovers children automatically, runs the pure {@link computeGridLayout}
 * engine, and applies positions/sizes back to each child via its resolved handler.
 *
 * Supports explicit column/row templates, named areas, auto-flow placement,
 * fr/cm/auto/minmax track sizing, and per-item alignment overrides.
 *
 * Layout is batched: property changes call {@link markDirty} and the layout pass runs
 * once per frame in LateUpdate.
 */
@component
export class GridLayout extends BaseScriptComponent {
  // ─── Container Size ──────────────────────────────────────────────────

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Container Size</span>')
  @ui.label('<span style="color: #94A3B8; font-size: 11px;">Dimensions of the grid container in local space</span>')
  @input
  @label("Width")
  @hint("Container width in cm. -1 = auto (shrink-to-fit content).")
  private _width: number = 20

  @input
  @label("Height")
  @hint("Container height in cm. -1 = auto (shrink-to-fit content).")
  private _height: number = 20

  // ─── Template ────────────────────────────────────────────────────────

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Template</span>')
  @ui.label('<span style="color: #94A3B8; font-size: 11px;">Track definitions, auto sizing, and named grid areas</span>')
  @input
  @label("Template Columns")
  @hint("Column track definitions. E.g. '1fr 1fr', '3cm 1fr 2fr auto', 'repeat(3, 1fr)'")
  private _templateColumns: string = "1fr 1fr"

  @input
  @label("Template Rows")
  @hint("Row track definitions. E.g. '1fr', '2cm auto 1fr', 'repeat(2, 1fr)'")
  private _templateRows: string = "1fr"

  @input
  @label("Auto Rows")
  @hint("Sizing for implicitly created row tracks. E.g. '1fr', 'auto', '2cm'")
  private _autoRows: string = "1fr"

  @input
  @label("Auto Columns")
  @hint("Sizing for implicitly created column tracks. E.g. '1fr', 'auto', '2cm'")
  private _autoColumns: string = "1fr"

  @input
  @label("Template Areas")
  @widget(new TextAreaWidget())
  @hint("Named grid areas. Rows separated by '/'. E.g. 'header header / sidebar content / footer footer'")
  private _templateAreas: string = ""

  // ─── Flow ────────────────────────────────────────────────────────────

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Auto Flow</span>')
  @ui.label('<span style="color: #94A3B8; font-size: 11px;">How auto-placed items fill empty grid cells</span>')
  @input
  @label("Auto Flow")
  @widget(
    new ComboBoxWidget([
      new ComboBoxItem("Row", "row"),
      new ComboBoxItem("Column", "column"),
      new ComboBoxItem("Row Dense", "rowDense"),
      new ComboBoxItem("Column Dense", "columnDense"),
    ])
  )
  @hint("How auto-placed items fill the grid.")
  private _autoFlow: string = "row"

  // ─── Gap ─────────────────────────────────────────────────────────────

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Gap</span>')
  @ui.label('<span style="color: #94A3B8; font-size: 11px;">Spacing between rows and columns</span>')
  @input
  @label("Column Gap")
  @hint("Gap between columns in cm.")
  private _columnGap: number = 0

  @input
  @label("Row Gap")
  @hint("Gap between rows in cm.")
  private _rowGap: number = 0

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

  // ─── Alignment ───────────────────────────────────────────────────────

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Alignment</span>')
  @ui.label('<span style="color: #94A3B8; font-size: 11px;">Default alignment for all items within their grid cells</span>')
  @input
  @label("Justify Items")
  @widget(
    new ComboBoxWidget([
      new ComboBoxItem("Start", "start"),
      new ComboBoxItem("Center", "center"),
      new ComboBoxItem("End", "end"),
      new ComboBoxItem("Stretch", "stretch"),
    ])
  )
  @hint("Default horizontal alignment for all items in their cells.")
  private _justifyItems: string = "stretch"

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
  @hint("Default vertical alignment for all items in their cells.")
  private _alignItems: string = "stretch"

  // ─── Content Alignment ──────────────────────────────────────────────

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Content Alignment</span>')
  @ui.label('<span style="color: #94A3B8; font-size: 11px;">Position of the grid content relative to the SceneObject center</span>')
  @input
  @label("Horizontal")
  @hint("Horizontal alignment of the grid content relative to the SceneObject center.")
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
  @hint("Vertical alignment of the grid content relative to the SceneObject center.")
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

  private _items: GridItem[] = []
  private _cachedChildCount: number = 0
  private _dirty: boolean = true
  private _isPerformingLayout: boolean = false
  private _initialized: boolean = false
  private _computedWidth: number = 0
  private _computedHeight: number = 0

  /** Settle frames: re-run layout for a few frames after init to handle deferred child setup. */
  private _settleFramesRemaining: number = 0

  /** Cached sibling GridItem (for dirty propagation to parent layout) */
  private _siblingGridItem: GridItem | null = null

  private lateUpdateEvent: SceneEvent
  private debugUpdateEvent: SceneEvent

  // ─── Events ──────────────────────────────────────────────────────────

  private readonly onInitializedEvent = new ReplayEvent<void>()
  /** Fires once after the first child discovery and layout pass. Replays for late subscribers. */
  public readonly onInitialized = this.onInitializedEvent.publicApi()

  private readonly onLayoutCompleteEvent = new Event<GridLayoutResult>()
  /** Fires after every layout pass with the full {@link GridLayoutResult}. */
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

  /**
   * Column track definitions as a string.
   * Supports `Ncm`, `Nfr`, `auto`, `minmax(min, max)`, and `repeat(N, pattern)`.
   * @example "1fr 1fr" // two equal columns
   * @example "3cm 1fr 2fr auto" // mixed fixed, fractional, and auto
   * @example "repeat(3, 1fr)" // three equal columns
   */
  public get templateColumns(): string {
    return this._templateColumns
  }
  public set templateColumns(value: string) {
    if (this._templateColumns === value) return
    this._templateColumns = value
    this.markDirty()
  }

  /**
   * Row track definitions as a string.
   * Same syntax as {@link templateColumns}.
   * @example "1fr" // single flexible row
   * @example "2cm auto 1fr" // mixed track types
   */
  public get templateRows(): string {
    return this._templateRows
  }
  public set templateRows(value: string) {
    if (this._templateRows === value) return
    this._templateRows = value
    this.markDirty()
  }

  /** Sizing for implicitly created row tracks (e.g. `"1fr"`, `"auto"`, `"2cm"`). */
  public get autoRows(): string {
    return this._autoRows
  }
  public set autoRows(value: string) {
    if (this._autoRows === value) return
    this._autoRows = value
    this.markDirty()
  }

  /** Sizing for implicitly created column tracks (e.g. `"1fr"`, `"auto"`, `"2cm"`). */
  public get autoColumns(): string {
    return this._autoColumns
  }
  public set autoColumns(value: string) {
    if (this._autoColumns === value) return
    this._autoColumns = value
    this.markDirty()
  }

  /**
   * Named grid areas. Rows separated by `"/"`, columns by spaces within each row.
   * Use `"."` for empty cells.
   * @example "header header / sidebar content / footer footer"
   */
  public get templateAreas(): string {
    return this._templateAreas
  }
  public set templateAreas(value: string) {
    if (this._templateAreas === value) return
    this._templateAreas = value
    this.markDirty()
  }

  /** How auto-placed items fill the grid (row, column, or dense variants). */
  public get autoFlow(): GridAutoFlow {
    return this._autoFlow as GridAutoFlow
  }
  public set autoFlow(value: GridAutoFlow) {
    if (this._autoFlow === value) return
    this._autoFlow = value
    this.markDirty()
  }

  /** Gap between columns in cm. */
  public get columnGap(): number {
    return this._columnGap
  }
  public set columnGap(value: number) {
    if (this._columnGap === value) return
    this._columnGap = Math.max(0, value)
    this.markDirty()
  }

  /** Gap between rows in cm. */
  public get rowGap(): number {
    return this._rowGap
  }
  public set rowGap(value: number) {
    if (this._rowGap === value) return
    this._rowGap = Math.max(0, value)
    this.markDirty()
  }

  /** Sets both columnGap and rowGap to the same value (in cm). */
  public set gap(value: number) {
    this._columnGap = Math.max(0, value)
    this._rowGap = Math.max(0, value)
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

  /** Default horizontal alignment for all items in their grid cells. */
  public get justifyItems(): GridAlign {
    return this._justifyItems as GridAlign
  }
  public set justifyItems(value: GridAlign) {
    if (this._justifyItems === value) return
    this._justifyItems = value
    this.markDirty()
  }

  /** Default vertical alignment for all items in their grid cells. */
  public get alignItems(): GridAlign {
    return this._alignItems as GridAlign
  }
  public set alignItems(value: GridAlign) {
    if (this._alignItems === value) return
    this._alignItems = value
    this.markDirty()
  }

  /** Horizontal alignment of the grid content relative to the SceneObject center. */
  public get horizontalAlignment(): ContentHorizontalAlignment {
    return this._horizontalAlignment as ContentHorizontalAlignment
  }
  public set horizontalAlignment(value: ContentHorizontalAlignment) {
    if (this._horizontalAlignment === value) return
    this._horizontalAlignment = value
    this.markDirty()
  }

  /** Vertical alignment of the grid content relative to the SceneObject center. */
  public get verticalAlignment(): ContentVerticalAlignment {
    return this._verticalAlignment as ContentVerticalAlignment
  }
  public set verticalAlignment(value: ContentVerticalAlignment) {
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

  /** Number of discovered GridItem children currently managed by this layout. */
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
      // Cache sibling GridItem for dirty propagation to parent layout
      const siblingGridItem = this.sceneObject.getComponent(
        GridItem.getTypeName()
      )
      if (siblingGridItem) {
        this._siblingGridItem = siblingGridItem as GridItem
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
    // notify the parent via the sibling GridItem on the same SceneObject.
    if (this._siblingGridItem) {
      this._siblingGridItem["_parentLayout"]?.markDirty()
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
   * Compute the intrinsic (max-content) size of this grid container.
   * Runs the grid algorithm with auto sizing (width=-1, height=-1).
   * Used by LayoutContainerHandler for nesting layouts inside other layouts.
   */
  public computeContentSize(): {width: number; height: number} {
    if (this._items.length === 0) {
      return {width: 0, height: 0}
    }

    const containerInput: GridContainerInput = {
      width: -1,
      height: -1,
      templateColumns: this._templateColumns,
      templateRows: this._templateRows,
      templateAreas: this._templateAreas,
      autoRows: this._autoRows,
      autoColumns: this._autoColumns,
      autoFlow: this._autoFlow as GridAutoFlow,
      columnGap: this._columnGap,
      rowGap: this._rowGap,
      padding: {
        top: this._paddingTop,
        right: this._paddingRight,
        bottom: this._paddingBottom,
        left: this._paddingLeft,
      },
      justifyItems: this._justifyItems as GridAlign,
      alignItems: this._alignItems as GridAlign,
    }

    const itemInputs = this._items.map((item, i) => item.toInput(i))
    const result = computeGridLayout(containerInput, itemInputs)
    return {width: result.containerWidth, height: result.containerHeight}
  }

  /**
   * Programmatically adds GridItem children to this layout.
   * Duplicates are ignored. Triggers a layout recalculation.
   * @param items - GridItem components to add.
   */
  public addItems(items: GridItem[]): void {
    for (const item of items) {
      if (this._items.indexOf(item) === -1) {
        this._items.push(item)
        item.setParentLayout(this)
      }
    }
    this.markDirty()
  }

  /**
   * Programmatically removes GridItem children from this layout.
   * Items not currently managed are ignored. Triggers a layout recalculation.
   * @param items - GridItem components to remove.
   */
  public removeItems(items: GridItem[]): void {
    for (const item of items) {
      const idx = this._items.indexOf(item)
      if (idx !== -1) {
        this._items.splice(idx, 1)
        item.setParentLayout(null)
      }
    }
    this.markDirty()
  }

  /**
   * Sets explicit placement for a GridItem, disabling auto-placement.
   * Only provided fields are updated; others remain unchanged.
   * @param item - The GridItem to place.
   * @param placement - Placement options (row, col, rowSpan, colSpan). All fields are optional.
   */
  public setItemPlacement(
    item: GridItem,
    placement: {row?: number; col?: number; rowSpan?: number; colSpan?: number}
  ): void {
    item.autoPlacement = false
    if (placement.row !== undefined) item.gridRow = placement.row
    if (placement.col !== undefined) item.gridColumn = placement.col
    if (placement.rowSpan !== undefined) item.gridRowSpan = placement.rowSpan
    if (placement.colSpan !== undefined) item.gridColumnSpan = placement.colSpan
  }

  /**
   * Clears explicit placement for a GridItem, reverting it to auto-placement
   * with default span of 1x1 and no named area.
   * @param item - The GridItem to reset.
   */
  public clearItemPlacement(item: GridItem): void {
    item.autoPlacement = true
    item.gridRow = 0
    item.gridColumn = 0
    item.gridRowSpan = 1
    item.gridColumnSpan = 1
    item.gridArea = ""
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

    // Scan for GridItem components on direct children
    for (let i = 0; i < childCount; i++) {
      const child = parent.getChild(i)
      if (!child.enabled) continue
      const gridItem = child.getComponent(GridItem.getTypeName())
      if (gridItem) {
        this._items.push(gridItem as GridItem)
        ;(gridItem as GridItem).setParentLayout(this)
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
    const containerInput: GridContainerInput = {
      width: this._width,
      height: this._height,
      templateColumns: this._templateColumns,
      templateRows: this._templateRows,
      templateAreas: this._templateAreas,
      autoRows: this._autoRows,
      autoColumns: this._autoColumns,
      autoFlow: this._autoFlow as GridAutoFlow,
      columnGap: this._columnGap,
      rowGap: this._rowGap,
      padding: {
        top: this._paddingTop,
        right: this._paddingRight,
        bottom: this._paddingBottom,
        left: this._paddingLeft,
      },
      justifyItems: this._justifyItems as GridAlign,
      alignItems: this._alignItems as GridAlign,
    }

    const itemInputs = this._items.map((item, i) => item.toInput(i))

    // Run pure layout engine
    const result = computeGridLayout(containerInput, itemInputs)

    // Compute content alignment offsets
    // Engine outputs top-left positions; we convert to Lens Studio center-based coords.
    const hAlign = this._horizontalAlignment as ContentHorizontalAlignment
    const hOffset =
      hAlign === ContentHorizontalAlignment.Left
        ? 0
        : hAlign === ContentHorizontalAlignment.Right
          ? -result.containerWidth
          : -result.containerWidth * 0.5

    const vAlign = this._verticalAlignment as ContentVerticalAlignment
    const vOffset =
      vAlign === ContentVerticalAlignment.Top
        ? 0
        : vAlign === ContentVerticalAlignment.Bottom
          ? result.containerHeight
          : result.containerHeight * 0.5

    // Apply results
    for (let i = 0; i < this._items.length; i++) {
      const output = result.items[i]
      if (output) {
        // Convert from top-left origin to center-based coordinates
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

    const hAlign = this._horizontalAlignment as ContentHorizontalAlignment
    const localCenterX =
      hAlign === ContentHorizontalAlignment.Left
        ? containerW * 0.5
        : hAlign === ContentHorizontalAlignment.Right
          ? -containerW * 0.5
          : 0

    const vAlign = this._verticalAlignment as ContentVerticalAlignment
    const localCenterY =
      vAlign === ContentVerticalAlignment.Top
        ? -containerH * 0.5
        : vAlign === ContentVerticalAlignment.Bottom
          ? containerH * 0.5
          : 0

    const containerCenter = worldPos.add(
      worldRot.multiplyVec3(new vec3(localCenterX * worldScale.x, localCenterY * worldScale.y, 0))
    )

    // Container bounds (yellow box)
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

    // Item bounds (green)
    // Sizes are in the container's local coordinate space, so use container's world transform
    const iColor = new vec4(0, 1, 0.5, 1)
    for (const item of this._items) {
      const itemPos = item.sceneObject.getTransform().getWorldPosition()
      const size = item.allocatedSize()
      drawWorldBox(itemPos, size.width, size.height, worldRot, worldScale, iColor)
    }
  }
}
