import Event from "SpectaclesInteractionKit.lspkg/Utils/Event"
import NativeLogger from "SpectaclesInteractionKit.lspkg/Utils/NativeLogger"
import ReplayEvent from "SpectaclesInteractionKit.lspkg/Utils/ReplayEvent"
import {findAllComponentsInChildren} from "SpectaclesInteractionKit.lspkg/Utils/SceneObjectUtils"
import {vec3ApproximatelyEqual} from "../../../Scripts/Utility/UIKitUtilities"
import {
  calculateAxisAnchorOffset,
  calculateSpatialItemLocalPosition,
  calculateSpatialSize,
  calculateItemSpans,
  calculateOccupiedBoundsFromPlacements,
  calculatePlacementFromWorldPosition,
  calculatePusherSpatialCenter,
  calculateRepackedPlacements,
  checkSpatialRegionAvailability,
  clampSpatialPlacement,
  compareVolumes,
  findClosestAvailableSpatialPlacement,
  floorSpatialPlacement,
  getCellKey,
  SpatialSearchContext,
  haveSpatialPlacementsChanged,
  setPlacementOccupancyInMap,
  simulateOmniSpatialPush,
  updateOccupiedBounds,
  waitForItemsInitialized
} from "../../Utility/SpatialLayoutUtilities"
import {renderSpatialLayoutDebug} from "../../Utility/LayoutDebugDrawer"
import {PendingLayoutItemTracker} from "../../Utility/LayoutUtilities"
import {
  isCellWithinSpatialBounds,
  isPlacementWithinSpatialBounds,
  isValidSpatialCoordinate,
  validateSpatialConfiguration,
  validateInteger,
  validateNonNegative,
  validatePositive
} from "../../Utility/LayoutValidation"
import {
  AddLayoutItemFallbackStrategy,
  AddOrder,
  Anchor,
  Axis,
  SpatialBoundsConstraints,
  SpatialCoordinate,
  SpatialMetrics,
  SpatialPlacement
} from "./LayoutConfigurationTypes"
import {LayoutItem} from "./LayoutItem"
import {NestableLayout} from "./NestableLayout"

const log = new NativeLogger("SpatialLayout")

/**
 * A flexible 3D grid layout component that arranges child elements in a structured grid along X, Y, and Z axes.
 *
 * SpatialLayout provides a powerful system for positioning children in cells with support for:
 * - **3D Grid Structure**: Organize items into Rows (Y), Columns (X), and Layers (Z)
 * - **Constraints**: Configure fixed or flexible limits for grid dimensions via Max Columns/Rows/Layers
 * - **Anchoring**: Control how the grid is positioned relative to its origin (e.g., Center, Top-Left)
 * - **Cell Sizing**: Define precise dimensions for grid cells
 * - **Spacing & Padding**: Customize gaps between cells and padding around the grid boundaries
 * - **Child Alignment**: Align children within their respective cells (e.g., Center, Top-Left)
 * - **Placement Strategies**: Specialized logic for adding items (e.g., Closest Available, Push neighbors)
 * - **Sorting**: Automatically sort items by size when adding (Largest/Smallest First)
 *
 * @example
 * ```typescript
 * // Create a 3x3 grid centered at the origin
 * const gridLayout = sceneObject.getComponent(SpatialLayout.getTypeName());
 * gridLayout.fixedColumns = true;
 * gridLayout.maxColumns = 3;
 * gridLayout.cellWidth = 10;
 * gridLayout.cellHeight = 10;
 * gridLayout.spacingX = 1;
 * gridLayout.spacingY = 1;
 *
 * // Add items
 * gridLayout.addLayoutItem(myLayoutItem);
 * ```
 *
 * @remarks
 * - Wait for the {@link onInitialized} event before adding layout items or modifying properties programmatically
 * - Child elements must be wrapped in {@link LayoutItem} components
 * - Supports complex operations like moving items to specific coordinates and pushing existing items out of the way
 *
 * @see {@link LayoutItem} - The wrapper component for layout children
 */
@component
export class SpatialLayout extends BaseScriptComponent implements NestableLayout {
  // ═══════════════════════════════════════════════════════════════════════════
  // INPUT PROPERTIES
  // ═══════════════════════════════════════════════════════════════════════════

  @ui.group_start("Placement Constraints")
  @input
  @hint("Whether the number of columns is fixed.")
  private _fixedColumns: boolean = true

  @input("int")
  @showIf("_fixedColumns", true)
  @hint("Maximum columns in the grid.")
  @label("Max Columns")
  private _maxColumns: number = 3

  @input
  @hint("Whether the number of rows is fixed.")
  private _fixedRows: boolean = true

  @input("int")
  @showIf("_fixedRows", true)
  @hint("Maximum rows in the grid.")
  @label("Max Rows")
  private _maxRows: number = 3

  @input
  @hint("Whether the number of layers (depth) is fixed.")
  private _fixedLayers: boolean = true

  @input("int")
  @showIf("_fixedLayers", true)
  @hint("Maximum layers in the grid.")
  @label("Max Layers")
  private _maxLayers: number = 3
  @ui.group_end
  @ui.group_start("Anchors")
  @input
  @showIf("_fixedColumns", true)
  @hint("Anchor position for columns along the X-axis.")
  @widget(
    new ComboBoxWidget([
      new ComboBoxItem("Left", "start"),
      new ComboBoxItem("Center", "center"),
      new ComboBoxItem("Right", "end")
    ])
  )
  private _anchorX: string = Anchor.Center
  @input
  @showIf("_fixedRows", true)
  @hint("Anchor position for rows along the Y-axis.")
  @widget(
    new ComboBoxWidget([
      new ComboBoxItem("Bottom", "start"),
      new ComboBoxItem("Center", "center"),
      new ComboBoxItem("Top", "end")
    ])
  )
  private _anchorY: string = Anchor.Center
  @input
  @showIf("_fixedLayers", true)
  @hint("Anchor position for layers along the Z-axis.")
  @widget(
    new ComboBoxWidget([
      new ComboBoxItem("Back", "start"),
      new ComboBoxItem("Center", "center"),
      new ComboBoxItem("Front", "end")
    ])
  )
  private _anchorZ: string = Anchor.Center
  @ui.group_end
  @ui.group_start("Cell Size")
  @input
  @hint("Width of each cell (X dimension) in centimeters.")
  @label("Width")
  private _cellWidth: number = 1

  @input
  @hint("Height of each cell (Y dimension) in centimeters.")
  @label("Height")
  private _cellHeight: number = 1

  @input
  @hint("Depth of each cell (Z dimension) in centimeters.")
  @label("Depth")
  private _cellDepth: number = 1
  @ui.group_end
  @ui.group_start("Spacing")
  @input
  @hint("Spacing between columns (X-axis).")
  @label("X (Columns)")
  private _spacingX: number = 0

  @input
  @hint("Spacing between rows (Y-axis).")
  @label("Y (Rows)")
  private _spacingY: number = 0

  @input
  @hint("Spacing between layers (Z-axis).")
  @label("Z (Layers)")
  private _spacingZ: number = 0
  @ui.group_end
  @ui.group_start("Padding")
  @input
  @hint("Padding on the left side (X-axis start).")
  @label("Left")
  private _paddingLeft: number = 0

  @input
  @hint("Padding on the right side (X-axis end).")
  @label("Right")
  private _paddingRight: number = 0

  @input
  @hint("Padding on the bottom side (Y-axis start).")
  @label("Bottom")
  private _paddingBottom: number = 0

  @input
  @hint("Padding on the top side (Y-axis end).")
  @label("Top")
  private _paddingTop: number = 0

  @input
  @hint("Padding on the back side (Z-axis start).")
  @label("Back")
  private _paddingBack: number = 0

  @input
  @hint("Padding on the front side (Z-axis end).")
  @label("Front")
  private _paddingFront: number = 0
  @ui.group_end
  private readonly _addOrder: AddOrder = AddOrder.AsIs

  // ═══════════════════════════════════════════════════════════════════════════
  // INTERNAL STATE
  // ═══════════════════════════════════════════════════════════════════════════

  // Map of grid cell key "col,row,layer" to LayoutItem
  private gridCells: Map<number, LayoutItem> = new Map()
  // Map of LayoutItem to its grid placement
  private itemPlacements: Map<LayoutItem, SpatialPlacement> = new Map()

  // Initialization state
  private _initialized: boolean = false

  // Track occupied bounds (inclusive)
  private _occupiedMin: SpatialCoordinate = {
    col: Infinity,
    row: Infinity,
    layer: Infinity
  }
  private _occupiedMax: SpatialCoordinate = {
    col: -Infinity,
    row: -Infinity,
    layer: -Infinity
  }

  // Dirty flag for lazy bounds recalculation
  private _boundsDirty: boolean = false

  // Pending operations cache for pre-initialization calls
  private _pendingAdditions:
    | {
        item: LayoutItem
        coordinate?: SpatialCoordinate
        fallbackStrategy?: AddLayoutItemFallbackStrategy
      }[]
    | null = []
  private _pendingRemovals: LayoutItem[] | null = []

  // Deferred reflow scheduling
  private reflowLateUpdateEvent: SceneEvent

  // Item size change subscriptions
  private itemSubscriptions: Map<LayoutItem, () => void> = new Map()

  // Cache of item sizes to optimize updates
  private readonly _itemSizes = new Map<LayoutItem, vec3>()

  // Guard flag to prevent circular updates
  private _isUpdatingLayout: boolean = false

  // Track pending initialization listeners to clean up on destroy
  private _pendingInitUnsubscribers: Map<LayoutItem, () => void> = new Map()
  // Items that have been added and are pending layout update notification
  private _pendingAddedTracker = new PendingLayoutItemTracker<LayoutItem>()
  // Clean up function for initial item waiting
  private _initialWaitDispose: (() => void) | null = null

  // Flag to indicate if grid structure needs rebuilding (spans/cells)
  private _structureDirty: boolean = false

  private _lastGridSize: vec3 = vec3.zero()

  // Events
  private readonly onInitializedEvent = new ReplayEvent<void>()
  /**
   * Event fired when the SpatialLayout has finished initialization.
   * Safe to access all properties and methods after this event fires.
   */
  public readonly onInitialized = this.onInitializedEvent.publicApi()

  private readonly onLayoutItemAddedEvent = new Event<LayoutItem>()
  /**
   * Event fired when LayoutItems are added to the grid.
   * The event payload is the added LayoutItem.
   */
  public readonly onLayoutItemAdded = this.onLayoutItemAddedEvent.publicApi()

  private readonly onLayoutItemRemovedEvent = new Event<LayoutItem>()
  /**
   * Event fired when LayoutItems are removed from the grid.
   * The event payload is the removed LayoutItem.
   */
  public readonly onLayoutItemRemoved = this.onLayoutItemRemovedEvent.publicApi()

  private readonly onItemPlacementChangedEvent = new Event<{item: LayoutItem; placement: SpatialPlacement}>()
  /**
   * Event fired when an item's placement changes.
   */
  public readonly onItemPlacementChanged = this.onItemPlacementChangedEvent.publicApi()

  private readonly onSizeChangedEvent = new Event<vec3>()
  /**
   * Event fired when the layout size changes.
   * The event payload is the new size as a vec3.
   */
  public readonly onSizeChanged = this.onSizeChangedEvent.publicApi()

  private _debug: boolean = false
  private debugUpdateEvent: SceneEvent

  // Reusable BFS buffers to reduce GC
  private _searchContext = new SpatialSearchContext()

  // Cache for anchor offsets
  private _cachedAnchorOffset: vec3 = new vec3(0, 0, 0)
  private _anchorsDirty: boolean = true

  // ═══════════════════════════════════════════════════════════════════════════
  // PUBLIC GETTERS & SETTERS
  // ═══════════════════════════════════════════════════════════════════════════

  // Grid Configuration
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Gets whether the number of columns is fixed.
   * @returns True if the number of columns is fixed, false otherwise.
   */
  public get fixedColumns(): boolean {
    return this._fixedColumns
  }

  /**
   * Sets whether the number of columns is fixed.
   * @param value - Whether to fix the number of columns.
   */
  public set fixedColumns(value: boolean) {
    if (this._fixedColumns === value) return
    this._fixedColumns = value
    this._anchorsDirty = true
    if (this._initialized) {
      this._structureDirty = true
      this.scheduleReflow()
    }
  }

  /**
   * Gets the maximum number of columns in the grid.
   * @returns The maximum number of columns.
   */
  public get maxColumns(): number {
    return this._maxColumns
  }

  /**
   * Sets the maximum number of columns in the grid.
   * @param value - The new maximum number of columns.
   */
  public set maxColumns(value: number) {
    validatePositive(value, "Max columns")
    validateInteger(value, "Max columns")
    if (this._maxColumns === value) return
    this._maxColumns = value
    this._anchorsDirty = true
    if (this._initialized) {
      this._structureDirty = true
      this.scheduleReflow()
    }
  }

  /**
   * Gets whether the number of rows is fixed.
   * @returns True if the number of rows is fixed, false otherwise.
   */
  public get fixedRows(): boolean {
    return this._fixedRows
  }

  /**
   * Sets whether the number of rows is fixed.
   * @param value - Whether to fix the number of rows.
   */
  public set fixedRows(value: boolean) {
    if (this._fixedRows === value) return
    this._fixedRows = value
    this._anchorsDirty = true
    if (this._initialized) {
      this._structureDirty = true
      this.scheduleReflow()
    }
  }

  /**
   * Gets the maximum number of rows in the grid.
   * @returns The maximum number of rows.
   */
  public get maxRows(): number {
    return this._maxRows
  }

  /**
   * Sets the maximum number of rows in the grid.
   * @param value - The new maximum number of rows.
   */
  public set maxRows(value: number) {
    validatePositive(value, "Max rows")
    validateInteger(value, "Max rows")
    if (this._maxRows === value) return
    this._maxRows = value
    this._anchorsDirty = true
    if (this._initialized) {
      this._structureDirty = true
      this.scheduleReflow()
    }
  }

  /**
   * Gets whether the number of layers is fixed.
   * @returns True if the number of layers is fixed, false otherwise.
   */
  public get fixedLayers(): boolean {
    return this._fixedLayers
  }

  /**
   * Sets whether the number of layers is fixed.
   * @param value - Whether to fix the number of layers.
   */
  public set fixedLayers(value: boolean) {
    if (this._fixedLayers === value) return
    this._fixedLayers = value
    this._anchorsDirty = true
    if (this._initialized) {
      this._structureDirty = true
      this.scheduleReflow()
    }
  }

  /**
   * Gets the maximum number of layers in the grid (Z-axis depth).
   * @returns The maximum number of layers.
   */
  public get maxLayers(): number {
    return this._maxLayers
  }

  /**
   * Sets the maximum number of layers in the grid (Z-axis depth).
   * @param value - The new maximum number of layers.
   */
  public set maxLayers(value: number) {
    validatePositive(value, "Max layers")
    validateInteger(value, "Max layers")
    if (this._maxLayers === value) return
    this._maxLayers = value
    this._anchorsDirty = true
    if (this._initialized) {
      this._structureDirty = true
      this.scheduleReflow()
    }
  }

  // Layoutable Implementation
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Gets the layout width.
   * @returns The width in local space centimeters.
   */
  public get width(): number {
    return this.gridSize.x
  }

  /**
   * Sets the layout width.
   * @param value - The width in local space centimeters.
   * @remarks Setting width directly is not supported in SpatialLayout as it is determined by cell size and column count.
   */
  public set width(value: number) {
    log.w("SpatialLayout width is determined by cell size and column count. Setting width directly is not supported.")
  }

  /**
   * Gets the layout height.
   * @returns The height in local space centimeters.
   */
  public get height(): number {
    return this.gridSize.y
  }

  /**
   * Sets the layout height.
   * @param value - The height in local space centimeters.
   * @remarks Setting height directly is not supported in SpatialLayout as it is determined by cell size and row count.
   */
  public set height(value: number) {
    log.w("SpatialLayout height is determined by cell size and row count. Setting height directly is not supported.")
  }

  /**
   * Gets the layout depth.
   * @returns The depth in local space centimeters.
   */
  public get depth(): number {
    return this.gridSize.z
  }

  /**
   * Sets the layout depth.
   * @param value - The depth in local space centimeters.
   * @remarks Setting depth directly is not supported in SpatialLayout as it is determined by cell size and layer count.
   */
  public set depth(value: number) {
    log.w("SpatialLayout depth is determined by cell size and layer count. Setting depth directly is not supported.")
  }

  /**
   * Gets whether the layout has a fixed width.
   * Maps to fixedColumns.
   */
  public get fixedWidth(): boolean {
    return this.fixedColumns
  }

  /**
   * Sets whether the layout has a fixed width.
   * Maps to fixedColumns.
   */
  public set fixedWidth(value: boolean) {
    this.fixedColumns = value
  }

  /**
   * Gets whether the layout has a fixed height.
   * Maps to fixedRows.
   */
  public get fixedHeight(): boolean {
    return this.fixedRows
  }

  /**
   * Sets whether the layout has a fixed height.
   * Maps to fixedRows.
   */
  public set fixedHeight(value: boolean) {
    this.fixedRows = value
  }

  /**
   * Gets whether the layout has a fixed depth.
   * Maps to fixedLayers.
   */
  public get fixedDepth(): boolean {
    return this.fixedLayers
  }

  /**
   * Sets whether the layout has a fixed depth.
   * Maps to fixedLayers.
   */
  public set fixedDepth(value: boolean) {
    this.fixedLayers = value
  }

  /**
   * Gets the current size of the layout.
   */
  public get layoutSize(): vec3 {
    return this.gridSize
  }

  // Anchors
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Gets the anchor for the columns (X-axis).
   * @returns The anchor position (Start, Center, or End).
   */
  public get anchorX(): Anchor {
    return this._anchorX as Anchor
  }

  /**
   * Sets the anchor for the columns (X-axis).
   * @param value - The new anchor position.
   */
  public set anchorX(value: Anchor) {
    if (this._anchorX === value) return
    this._anchorX = value
    this._anchorsDirty = true
    if (this._initialized) {
      this.scheduleReflow()
    }
  }

  /**
   * Gets the anchor for the rows (Y-axis).
   * @returns The anchor position (Start, Center, or End).
   */
  public get anchorY(): Anchor {
    return this._anchorY as Anchor
  }

  /**
   * Sets the anchor for the rows (Y-axis).
   * @param value - The new anchor position.
   */
  public set anchorY(value: Anchor) {
    if (this._anchorY === value) return
    this._anchorY = value
    this._anchorsDirty = true
    if (this._initialized) {
      this.scheduleReflow()
    }
  }

  /**
   * Gets the anchor for the layers (Z-axis).
   * @returns The anchor position (Start, Center, or End).
   */
  public get anchorZ(): Anchor {
    return this._anchorZ as Anchor
  }

  /**
   * Sets the anchor for the layers (Z-axis).
   * @param value - The new anchor position.
   */
  public set anchorZ(value: Anchor) {
    if (this._anchorZ === value) return
    this._anchorZ = value
    this._anchorsDirty = true
    if (this._initialized) {
      this.scheduleReflow()
    }
  }

  // Cell Dimensions
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Gets the cell width (X dimension).
   * @returns The width of each cell in centimeters.
   */
  public get cellWidth(): number {
    return this._cellWidth
  }

  /**
   * Sets the cell width (X dimension).
   * @param value - The new cell width in centimeters.
   */
  public set cellWidth(value: number) {
    validatePositive(value, "Cell width")
    if (this._cellWidth === value) return
    this._cellWidth = value
    this._anchorsDirty = true
    if (this._initialized) {
      this._structureDirty = true
      this.scheduleReflow()
    }
  }

  /**
   * Gets the cell height (Y dimension).
   * @returns The height of each cell in centimeters.
   */
  public get cellHeight(): number {
    return this._cellHeight
  }

  /**
   * Sets the cell height (Y dimension).
   * @param value - The new cell height in centimeters.
   */
  public set cellHeight(value: number) {
    validatePositive(value, "Cell height")
    if (this._cellHeight === value) return
    this._cellHeight = value
    this._anchorsDirty = true
    if (this._initialized) {
      this._structureDirty = true
      this.scheduleReflow()
    }
  }

  /**
   * Gets the cell depth (Z dimension).
   * @returns The depth of each cell in centimeters.
   */
  public get cellDepth(): number {
    return this._cellDepth
  }

  /**
   * Sets the cell depth (Z dimension).
   * @param value - The new cell depth in centimeters.
   */
  public set cellDepth(value: number) {
    validatePositive(value, "Cell depth")
    if (this._cellDepth === value) return
    this._cellDepth = value
    this._anchorsDirty = true
    if (this._initialized) {
      this._structureDirty = true
      this.scheduleReflow()
    }
  }

  // Spacing
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Gets the horizontal spacing between columns (X-axis).
   * @returns The horizontal spacing in centimeters.
   */
  public get spacingX(): number {
    return this._spacingX
  }

  /**
   * Sets the horizontal spacing between columns (X-axis).
   * @param value - The new horizontal spacing in centimeters.
   */
  public set spacingX(value: number) {
    validateNonNegative(value, "Spacing X")
    if (this._spacingX === value) return
    this._spacingX = value
    this._anchorsDirty = true
    if (this._initialized) {
      this._structureDirty = true
      this.scheduleReflow()
    }
  }

  /**
   * Gets the vertical spacing between rows (Y-axis).
   * @returns The vertical spacing in centimeters.
   */
  public get spacingY(): number {
    return this._spacingY
  }

  /**
   * Sets the vertical spacing between rows (Y-axis).
   * @param value - The new vertical spacing in centimeters.
   */
  public set spacingY(value: number) {
    validateNonNegative(value, "Spacing Y")
    if (this._spacingY === value) return
    this._spacingY = value
    this._anchorsDirty = true
    if (this._initialized) {
      this._structureDirty = true
      this.scheduleReflow()
    }
  }

  /**
   * Gets the depth spacing between layers (Z-axis).
   * @returns The depth spacing in centimeters.
   */
  public get spacingZ(): number {
    return this._spacingZ
  }

  /**
   * Sets the depth spacing between layers (Z-axis).
   * @param value - The new depth spacing in centimeters.
   */
  public set spacingZ(value: number) {
    validateNonNegative(value, "Spacing Z")
    if (this._spacingZ === value) return
    this._spacingZ = value
    this._anchorsDirty = true
    if (this._initialized) {
      this._structureDirty = true
      this.scheduleReflow()
    }
  }

  // Padding
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Gets the padding on the left side (X-axis start).
   * @returns The left padding in centimeters.
   */
  public get paddingLeft(): number {
    return this._paddingLeft
  }

  /**
   * Sets the padding on the left side (X-axis start).
   * @param value - The new left padding in centimeters.
   */
  public set paddingLeft(value: number) {
    validateNonNegative(value, "Padding left")
    if (this._paddingLeft === value) return
    this._paddingLeft = value
    this._anchorsDirty = true
    if (this._initialized) this.scheduleReflow()
  }

  /**
   * Gets the padding on the right side (X-axis end).
   * @returns The right padding in centimeters.
   */
  public get paddingRight(): number {
    return this._paddingRight
  }

  /**
   * Sets the padding on the right side (X-axis end).
   * @param value - The new right padding in centimeters.
   */
  public set paddingRight(value: number) {
    validateNonNegative(value, "Padding right")
    if (this._paddingRight === value) return
    this._paddingRight = value
    this._anchorsDirty = true
    if (this._initialized) this.scheduleReflow()
  }

  /**
   * Gets the padding on the bottom side (Y-axis start).
   * @returns The bottom padding in centimeters.
   */
  public get paddingBottom(): number {
    return this._paddingBottom
  }

  /**
   * Sets the padding on the bottom side (Y-axis start).
   * @param value - The new bottom padding in centimeters.
   */
  public set paddingBottom(value: number) {
    validateNonNegative(value, "Padding bottom")
    if (this._paddingBottom === value) return
    this._paddingBottom = value
    this._anchorsDirty = true
    if (this._initialized) this.scheduleReflow()
  }

  /**
   * Gets the padding on the top side (Y-axis end).
   * @returns The top padding in centimeters.
   */
  public get paddingTop(): number {
    return this._paddingTop
  }

  /**
   * Sets the padding on the top side (Y-axis end).
   * @param value - The new top padding in centimeters.
   */
  public set paddingTop(value: number) {
    validateNonNegative(value, "Padding top")
    if (this._paddingTop === value) return
    this._paddingTop = value
    this._anchorsDirty = true
    if (this._initialized) this.scheduleReflow()
  }

  /**
   * Gets the padding on the back side (Z-axis start).
   * @returns The back padding in centimeters.
   */
  public get paddingBack(): number {
    return this._paddingBack
  }

  /**
   * Sets the padding on the back side (Z-axis start).
   * @param value - The new back padding in centimeters.
   */
  public set paddingBack(value: number) {
    validateNonNegative(value, "Padding back")
    if (this._paddingBack === value) return
    this._paddingBack = value
    this._anchorsDirty = true
    if (this._initialized) this.scheduleReflow()
  }

  /**
   * Gets the padding on the front side (Z-axis end).
   * @returns The front padding in centimeters.
   */
  public get paddingFront(): number {
    return this._paddingFront
  }

  /**
   * Sets the padding on the front side (Z-axis end).
   * @param value - The new front padding in centimeters.
   */
  public set paddingFront(value: number) {
    validateNonNegative(value, "Padding front")
    if (this._paddingFront === value) return
    this._paddingFront = value
    this._anchorsDirty = true
    if (this._initialized) this.scheduleReflow()
  }

  // State & Read-Only
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Gets the grid size as a vec3 (width, height, depth).
   * Size is calculated from constraints.
   * @returns The total dimensions of the grid.
   */
  public get gridSize(): vec3 {
    if (!this.fixedColumns || !this.fixedRows || !this.fixedLayers) {
      this.ensureBoundsUpToDate()
    }

    return calculateSpatialSize(
      this.gridConstraints,
      this._occupiedMin,
      this._occupiedMax,
      {x: this._cellWidth, y: this._cellHeight, z: this._cellDepth},
      {x: this._spacingX, y: this._spacingY, z: this._spacingZ},
      {
        left: this._paddingLeft,
        right: this._paddingRight,
        bottom: this._paddingBottom,
        top: this._paddingTop,
        back: this._paddingBack,
        front: this._paddingFront
      }
    )
  }

  /**
   * Gets whether the SpatialLayout has been initialized.
   * @returns True if initialized, false otherwise.
   */
  public get initialized(): boolean {
    return this._initialized
  }

  /**
   * Gets the number of layout items in the SpatialLayout.
   * @returns The count of items currently in the grid.
   */
  public get layoutItemCount(): number {
    return this.itemPlacements.size
  }

  /**
   * Gets whether debug visualization is enabled.
   * @returns True if debug bounds are shown, false otherwise.
   */
  public get debug(): boolean {
    return this._debug
  }

  /**
   * Sets whether debug visualization is enabled.
   * @param value - Whether to enable debug visualization.
   */
  public set debug(value: boolean) {
    if (this._debug === value) return
    this._debug = value
    if (this.debugUpdateEvent) {
      this.debugUpdateEvent.enabled = value
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PUBLIC METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  // Lifecycle
  // ───────────────────────────────────────────────────────────────────────────

  public onAwake() {
    // Create the reflow late update event once, starts disabled
    this.reflowLateUpdateEvent = this.createEvent("LateUpdateEvent")
    this.reflowLateUpdateEvent.enabled = false
    this.reflowLateUpdateEvent.bind(this.onReflowLateUpdate)

    // Create the debug update event once, starts disabled
    this.debugUpdateEvent = this.createEvent("UpdateEvent")
    this.debugUpdateEvent.enabled = this._debug
    this.debugUpdateEvent.bind(this.renderDebugBounds)

    this.createEvent("OnStartEvent").bind(this.onStart.bind(this))
    this.createEvent("OnDestroyEvent").bind(this.onDestroy.bind(this))

    // Initialize last grid size
    this._lastGridSize = vec3.zero()
  }

  // Item Management
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Adds a LayoutItem to the grid.
   * @param item - The LayoutItem to add.
   * @param coordinate - Optional specific grid coordinate (col, row, layer) to place the item.
   * @param fallbackStrategy - Strategy to use if the preferred coordinate is occupied. Defaults to None.
   */
  public addLayoutItem(
    item: LayoutItem,
    coordinate?: SpatialCoordinate,
    fallbackStrategy: AddLayoutItemFallbackStrategy = AddLayoutItemFallbackStrategy.None
  ): boolean {
    if (coordinate) {
      if (!isValidSpatialCoordinate(coordinate.col, coordinate.row, coordinate.layer, "addLayoutItem")) {
        return false
      }
    }

    if (!this._initialized) {
      this._pendingAdditions!.push({item, coordinate, fallbackStrategy})
      return false
    }

    if (!item.initialized) {
      // If an item is already being tracked, unsubscribe old first
      if (this._pendingInitUnsubscribers.has(item)) {
        this._pendingInitUnsubscribers.get(item)!()
      }

      const unsubscribe = item.onInitialized.add(() => {
        this._pendingInitUnsubscribers.delete(item)
        if (this.addLayoutItemToGrid(item, coordinate, fallbackStrategy)) {
          this.scheduleReflow()
          this._pendingAddedTracker.add(item)
        }
      })
      this._pendingInitUnsubscribers.set(item, unsubscribe)
      return false
    }

    if (this.addLayoutItemToGrid(item, coordinate, fallbackStrategy)) {
      this.scheduleReflow()
      this._pendingAddedTracker.add(item)
      return true
    }
    return false
  }

  /**
   * Removes a single LayoutItem from the grid.
   *
   * @param item - The LayoutItem to remove.
   */
  public removeLayoutItem(item: LayoutItem): boolean {
    if (!this._initialized) {
      this._pendingRemovals!.push(item)
      return false
    }

    if (this.removeLayoutItemFromGrid(item)) {
      this.scheduleReflow()

      const itemsToNotify = this._pendingAddedTracker.resolveDeferredRemovals([item])
      if (itemsToNotify.length > 0) {
        this.onLayoutItemRemovedEvent.invoke(item)
      }
      return true
    }

    // Check if the item was waiting for initialization
    if (this._pendingInitUnsubscribers.has(item)) {
      const unsubscribe = this._pendingInitUnsubscribers.get(item)
      if (unsubscribe) {
        unsubscribe()
        this._pendingInitUnsubscribers.delete(item)
        return true
      }
    }

    return false
  }

  /**
   * Moves an existing LayoutItem to a new coordinate within the grid.
   * @param item - The LayoutItem to move.
   * @param coordinate - The target grid coordinate.
   * @param fallbackStrategy - Strategy to use if the target cell is occupied. Defaults to None.
   */
  public moveLayoutItemInGrid(
    item: LayoutItem,
    coordinate: SpatialCoordinate,
    fallbackStrategy: AddLayoutItemFallbackStrategy = AddLayoutItemFallbackStrategy.None
  ): boolean {
    if (!isValidSpatialCoordinate(coordinate.col, coordinate.row, coordinate.layer, "moveLayoutItemInGrid")) {
      return false
    }

    const oldPlacement = this.itemPlacements.get(item)
    if (!oldPlacement) {
      log.w(`moveLayoutItemInGrid: item ${item.sceneObject.name} not found in grid`)
      return false
    }

    // No-op if already at the target origin cell.
    if (
      oldPlacement.col === coordinate.col &&
      oldPlacement.row === coordinate.row &&
      oldPlacement.layer === coordinate.layer
    ) {
      return true
    }

    // Remove the item from occupancy so placement checks don't collide with itself.
    if (!this.clearCellsOccupied(oldPlacement)) {
      log.w(`moveLayoutItemInGrid: failed to clear old occupancy for item ${item.sceneObject.name}`)
      return false
    }

    const newPlacement = this.executePlacementStrategy(item, coordinate, fallbackStrategy)
    if (newPlacement === undefined) {
      log.w(
        `moveLayoutItemInGrid: could not move "${item.sceneObject.name}" to (${coordinate.col}, ${coordinate.row}, ${coordinate.layer}) with strategy ${fallbackStrategy}`
      )
      this.setCellsOccupied(item, oldPlacement)
      return false
    }

    this.scheduleReflow()

    const storedNewPlacement = this.itemPlacements.get(item)
    if (storedNewPlacement) {
      if (
        oldPlacement &&
        storedNewPlacement &&
        haveSpatialPlacementsChanged(oldPlacement, storedNewPlacement) &&
        !this._pendingAddedTracker.has(item)
      ) {
        // Defensive copy: listeners must not be able to mutate internal placement objects.
        this.onItemPlacementChangedEvent.invoke({item, placement: {...storedNewPlacement}})
      }
    }
    return true
  }

  // Queries
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Gets the placement for an item.
   *
   * @param item - The LayoutItem to get placement for.
   * @returns The SpatialPlacement, or undefined if item is not in grid.
   */
  public getPlacement(item: LayoutItem): SpatialPlacement | undefined {
    const placement = this.itemPlacements.get(item)
    return placement ? {...placement} : undefined
  }

  /**
   * Gets the item at a specific grid cell.
   *
   * @param col - Column index.
   * @param row - Row index.
   * @param layer - Layer index.
   * @returns The item at the specified cell, or undefined if no item is at that cell.
   */
  public getItemAtCell(col: number, row: number, layer: number): LayoutItem | undefined {
    if (!isValidSpatialCoordinate(col, row, layer, "getItemAtCell")) {
      return undefined
    }
    if (!isCellWithinSpatialBounds(col, row, layer, this)) {
      return undefined
    }
    return this.gridCells.get(getCellKey(col, row, layer))
  }

  // Operations
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Forces a reflow of the grid layout.
   *
   * @param immediate - If true, reflows immediately. If false, schedules for end of frame.
   */
  public forceReflow(immediate: boolean = false): void {
    if (!this._initialized) return
    if (immediate) {
      if (this.reflowLateUpdateEvent) {
        this.reflowLateUpdateEvent.enabled = false
      }
      this.reflow()
    } else {
      this.scheduleReflow()
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  // Lifecycle Handlers
  // ───────────────────────────────────────────────────────────────────────────

  private onStart(): void {
    // Validate inputs
    validateSpatialConfiguration({
      maxColumns: this._maxColumns,
      maxRows: this._maxRows,
      maxLayers: this._maxLayers,
      cellWidth: this._cellWidth,
      cellHeight: this._cellHeight,
      cellDepth: this._cellDepth,
      spacingX: this._spacingX,
      spacingY: this._spacingY,
      spacingZ: this._spacingZ,
      paddingLeft: this._paddingLeft,
      paddingRight: this._paddingRight,
      paddingTop: this._paddingTop,
      paddingBottom: this._paddingBottom,
      paddingBack: this._paddingBack,
      paddingFront: this._paddingFront
    })

    // Find existing LayoutItem children
    const items = this.findLayoutItemsInChildren()

    this._initialWaitDispose = waitForItemsInitialized(items, () => {
      this._initialWaitDispose = null

      this.assignInitialPlacements(items)

      this._initialized = true
      this._lastGridSize = this.gridSize
      this.onInitializedEvent.invoke()

      // Process pending additions
      if (this._pendingAdditions && this._pendingAdditions.length > 0) {
        if (this._addOrder !== AddOrder.AsIs) {
          this._pendingAdditions.sort((a, b) => compareVolumes(a.item, b.item, this._addOrder))
        }

        const processItem = (
          item: LayoutItem,
          coordinate?: SpatialCoordinate,
          fallbackStrategy?: AddLayoutItemFallbackStrategy
        ) => {
          if (this.addLayoutItemToGrid(item, coordinate, fallbackStrategy)) {
            this._pendingAddedTracker.add(item)
          }
        }

        for (const pending of this._pendingAdditions) {
          if (pending.item.initialized) {
            processItem(pending.item, pending.coordinate, pending.fallbackStrategy)
          } else {
            // If an item is already being tracked, unsubscribe old first
            if (this._pendingInitUnsubscribers.has(pending.item)) {
              this._pendingInitUnsubscribers.get(pending.item)!()
            }

            const unsubscribe = pending.item.onInitialized.add(() => {
              this._pendingInitUnsubscribers.delete(pending.item)
              processItem(pending.item, pending.coordinate, pending.fallbackStrategy)
              this.scheduleReflow()
            })
            this._pendingInitUnsubscribers.set(pending.item, unsubscribe)
          }
        }
      }
      this._pendingAdditions = null

      // Process pending removals
      const removed: LayoutItem[] = []
      if (this._pendingRemovals && this._pendingRemovals.length > 0) {
        for (const item of this._pendingRemovals) {
          if (this.removeLayoutItemFromGrid(item)) {
            removed.push(item)
          }
        }
        if (removed.length > 0) {
          // Filter out items that were pending add - they shouldn't fire removed event since added never fired
          const itemsToNotifyRemoved = this._pendingAddedTracker.resolveDeferredRemovals(removed)

          for (const item of itemsToNotifyRemoved) {
            this.onLayoutItemRemovedEvent.invoke(item)
          }
        }
      }
      this._pendingRemovals = null

      // Perform initial layout
      this.scheduleReflow()
    })
  }

  private onDestroy(): void {
    // Unsubscribe initial wait if still pending
    if (this._initialWaitDispose) {
      this._initialWaitDispose()
      this._initialWaitDispose = null
    }

    // Unsubscribe all pending init listeners
    this._pendingInitUnsubscribers.forEach((unsubscribe) => unsubscribe())
    this._pendingInitUnsubscribers.clear()

    // Unsubscribe from all item size changes
    for (const item of this.itemSubscriptions.keys()) {
      this.unsubscribeFromItemChanges(item)
    }
    this.itemSubscriptions.clear()
    this._itemSizes.clear()

    this._pendingAddedTracker.clear()

    // Disable events
    if (this.reflowLateUpdateEvent) {
      this.reflowLateUpdateEvent.enabled = false
    }
    if (this.debugUpdateEvent) {
      this.debugUpdateEvent.enabled = false
    }
  }

  // Private Getters
  // ───────────────────────────────────────────────────────────────────────────

  private get gridConstraints(): SpatialBoundsConstraints {
    return {
      maxColumns: this._maxColumns,
      maxRows: this._maxRows,
      maxLayers: this._maxLayers,
      fixedColumns: this._fixedColumns,
      fixedRows: this._fixedRows,
      fixedLayers: this._fixedLayers
    }
  }

  private get maxIterations(): number {
    const cellCount = this._maxColumns * this._maxRows * this._maxLayers
    return Math.max(1000, cellCount * 2, this.itemPlacements.size * 5)
  }

  private getSpatialMetrics(): SpatialMetrics {
    return {
      cellSize: new vec3(this._cellWidth, this._cellHeight, this._cellDepth),
      spacing: new vec3(this._spacingX, this._spacingY, this._spacingZ),
      paddingStart: new vec3(this._paddingLeft, this._paddingBottom, this._paddingBack),
      anchorOffset: new vec3(this.getAnchorOffset(Axis.X), this.getAnchorOffset(Axis.Y), this.getAnchorOffset(Axis.Z))
    }
  }

  // Initialization
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Finds all LayoutItem components in direct children of this SpatialLayout.
   */
  private findLayoutItemsInChildren(): LayoutItem[] {
    return findAllComponentsInChildren(this.sceneObject, LayoutItem.getTypeName(), 1) as LayoutItem[]
  }

  /**
   * Sorts items based on the configured add order strategy.
   */
  private sortItemsByOrder(items: LayoutItem[]): void {
    if (this._addOrder === AddOrder.AsIs) return

    items.sort((a, b) => compareVolumes(a, b, this._addOrder))
  }

  /**
   * Assigns initial placements for items found on start.
   */
  private assignInitialPlacements(items: LayoutItem[]): void {
    if (items.length > 0) {
      log.d(`Found ${items.length} LayoutItem children in SpatialLayout`)

      this.sortItemsByOrder(items)

      const itemsWithoutPlacement: LayoutItem[] = []
      // Assign placements to items that don't need to be moved
      for (const item of items) {
        if (!this.itemPlacements.has(item)) {
          if (this.addLayoutItemToCell(item) === undefined) {
            itemsWithoutPlacement.push(item)
          }
        }
      }

      // Assign placements to the rest of the items that need to find the closest available placement
      for (const item of itemsWithoutPlacement) {
        const placement = this.addLayoutItemToClosestAvailableCell(item)
        if (placement === undefined) {
          log.w(`Skipping item "${item.sceneObject.name}" - no available placement in grid`)
          continue
        }
      }
    }
  }

  // Core Logic (Add/Place/Remove)
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Helper to execute the placement strategy logic.
   */
  private executePlacementStrategy(
    item: LayoutItem,
    coordinate: SpatialCoordinate | undefined,
    fallbackStrategy: AddLayoutItemFallbackStrategy
  ): SpatialPlacement | undefined {
    // 1. Try direct placement
    const placement = this.addLayoutItemToCell(item, coordinate)
    if (placement) return placement

    // 2. Try fallback strategies
    switch (fallbackStrategy) {
      case AddLayoutItemFallbackStrategy.Push:
        return this.tryPushAndPlace(item, coordinate)
      case AddLayoutItemFallbackStrategy.ClosestAvailable:
        return this.addLayoutItemToClosestAvailableCell(item, coordinate)
      default:
        return undefined
    }
  }

  /**
   * Attempts to add an item to the grid with optional fallback strategies.
   */
  private addLayoutItemToGrid(
    item: LayoutItem,
    coordinate?: SpatialCoordinate,
    fallbackStrategy: AddLayoutItemFallbackStrategy = AddLayoutItemFallbackStrategy.None
  ): boolean {
    if (this.itemPlacements.has(item)) {
      log.w(`Item "${item.sceneObject.name}" is already in the grid`)
      return false
    }

    const placement = this.executePlacementStrategy(item, coordinate, fallbackStrategy)

    if (placement === undefined) {
      log.w(`No available placement in grid for item "${item.sceneObject.name}"`)
      return false
    }

    // Reparent to grid
    item.parentToLayout(this)
    return true
  }

  /**
   * Attempts to add an item to a specific cell (or automatically calculated one).
   */
  private addLayoutItemToCell(item: LayoutItem, coordinate?: SpatialCoordinate): SpatialPlacement | undefined {
    const placement = this.getPlacementFromItemOrCoord(item, coordinate)
    const flooredPlacement = floorSpatialPlacement(placement)
    if (
      checkSpatialRegionAvailability(
        flooredPlacement.col,
        flooredPlacement.row,
        flooredPlacement.layer,
        flooredPlacement.colSpan,
        flooredPlacement.rowSpan,
        flooredPlacement.layerSpan,
        this.itemPlacements,
        this.gridCells,
        this.gridConstraints
      )
    ) {
      this.placeItemInCell(item, flooredPlacement)
      // placement could be fractional (before flooring), so retrieve the stored (floored) placement instead
      const stored = this.itemPlacements.get(item)
      return stored ? {...stored} : undefined
    }
    return undefined
  }

  /**
   * Attempts to add an item to the closest available cell.
   */
  private addLayoutItemToClosestAvailableCell(
    item: LayoutItem,
    coordinate?: SpatialCoordinate
  ): SpatialPlacement | undefined {
    const placement = this.findClosestAvailablePlacement(item, coordinate)
    if (placement) {
      if (this.placeItemInCell(item, placement)) {
        return placement
      } else {
        log.w(
          `Failed to place item "${item.sceneObject.name}" in cell ${placement.col},${placement.row},${placement.layer}`
        )
      }
    }
    return undefined
  }

  /**
   * Tries to push other items to make space for the new item.
   */
  private tryPushAndPlace(item: LayoutItem, coordinate?: SpatialCoordinate): SpatialPlacement | undefined {
    const targetPlacement = this.getPlacementFromItemOrCoord(item, coordinate)
    let targetCellPlacement: SpatialPlacement

    if (coordinate) {
      targetCellPlacement = floorSpatialPlacement(targetPlacement)
    } else {
      targetCellPlacement = clampSpatialPlacement(targetPlacement, this.gridConstraints)
    }

    // Verify target bounds (min 0 check is only active if fixed)
    if (!isPlacementWithinSpatialBounds(targetCellPlacement, this)) {
      return undefined
    }

    // This allows items to be pushed in all 6 directions simultaneously based on their relative position.
    const omniMoves = this.simulateOmniPush(item, targetCellPlacement)
    if (omniMoves) {
      this.applyPushMoves(item, targetCellPlacement, omniMoves)
      return targetCellPlacement
    }

    return undefined
  }

  /**
   * Applies a set of calculated moves to the grid, then places the new item.
   */
  private applyPushMoves(
    itemToPlace: LayoutItem,
    targetPlacement: SpatialPlacement,
    moves: Map<LayoutItem, SpatialPlacement>
  ): void {
    log.d(`Pushing ${moves.size} items to place ${itemToPlace.sceneObject.name}`)
    // Capture + clear old placements for moved items, then apply new placements.
    // Emit placement-changed events for moved items (not for the item being placed) after the move.
    const movedItemsOldPlacements = new Map<LayoutItem, SpatialPlacement>()

    for (const [movedItem] of moves) {
      const oldPlacement = this.itemPlacements.get(movedItem)
      if (oldPlacement) {
        movedItemsOldPlacements.set(movedItem, {...oldPlacement})
        this.clearCellsOccupied(oldPlacement)
      }
    }

    for (const [movedItem, placement] of moves) {
      this.placeItemInCell(movedItem, placement)

      // Notify listeners when an existing item's placement was updated due to pushing.
      // Exclude the item being placed/resized to avoid double-firing (e.g. handleItemResize emits separately).
      if (movedItem !== itemToPlace) {
        const oldPlacement = movedItemsOldPlacements.get(movedItem)
        const newPlacement = this.itemPlacements.get(movedItem)
        if (
          oldPlacement &&
          newPlacement &&
          haveSpatialPlacementsChanged(oldPlacement, newPlacement) &&
          !this._pendingAddedTracker.has(movedItem)
        ) {
          // Defensive copy: listeners must not be able to mutate internal placement objects.
          this.onItemPlacementChangedEvent.invoke({item: movedItem, placement: {...newPlacement!}})
        }
      }
    }

    this.placeItemInCell(itemToPlace, targetPlacement)
  }

  /**
   * Simulates an "Omni-Directional" push where each item is pushed away from the target center
   * along its dominant axis of separation. This allows for simultaneous 6-way pushing.
   */
  private simulateOmniPush(
    itemToPlace: LayoutItem,
    targetPlacement: SpatialPlacement
  ): Map<LayoutItem, SpatialPlacement> | undefined {
    const gridTransform = this.sceneObject.getTransform()
    const pusherWorldPos = itemToPlace.sceneObject.getTransform().getWorldPosition()

    const metrics = this.getSpatialMetrics()

    // Calculate pusher center index (approximate relative to target)
    const pusherGridCenter = calculatePusherSpatialCenter(
      pusherWorldPos,
      gridTransform.getInvertedWorldTransform(),
      metrics,
      {width: itemToPlace.width, height: itemToPlace.height, depth: itemToPlace.depth},
      {x: itemToPlace.alignmentX, y: itemToPlace.alignmentY, z: itemToPlace.alignmentZ},
      targetPlacement
    )

    return simulateOmniSpatialPush(
      itemToPlace,
      targetPlacement,
      pusherGridCenter,
      this.itemPlacements,
      this.gridCells,
      this._occupiedMin,
      this._occupiedMax,
      this.gridConstraints,
      this.maxIterations
    )
  }

  /**
   * Records the item's placement in internal state maps.
   */
  private placeItemInCell(item: LayoutItem, placement: SpatialPlacement): boolean {
    const flooredPlacement = floorSpatialPlacement(placement)

    // Mark cells as occupied in the grid
    if (this.setCellsOccupied(item, flooredPlacement)) {
      this.itemPlacements.set(item, flooredPlacement)
      this.subscribeToItemChanges(item)
      return true
    }
    return false
  }

  /**
   * Removes an item from the internal state maps.
   */
  private removeLayoutItemFromGrid(item: LayoutItem): boolean {
    if (this.itemPlacements.has(item)) {
      const placement = this.itemPlacements.get(item)
      if (placement) {
        this.clearCellsOccupied(placement)
      }
      this.itemPlacements.delete(item)
      this.unsubscribeFromItemChanges(item)
      item.unparentFromLayout()
      return true
    }
    return false
  }

  // Placement Search
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Helper to determine placement either from an explicit coordinate or from the item's current position.
   */
  private getPlacementFromItemOrCoord(item: LayoutItem, coordinate?: SpatialCoordinate): SpatialPlacement {
    if (coordinate) {
      const spans = calculateItemSpans(
        {width: item.width, height: item.height, depth: item.depth},
        this.getSpatialMetrics()
      )
      return {
        col: coordinate.col,
        row: coordinate.row,
        layer: coordinate.layer,
        colSpan: spans.colSpan,
        rowSpan: spans.rowSpan,
        layerSpan: spans.layerSpan
      }
    }
    return this.calculatePlacementFromItem(item)
  }

  /**
   * Calculates placement grid coordinates from the item's world position.
   */
  private calculatePlacementFromItem(item: LayoutItem): SpatialPlacement {
    return calculatePlacementFromWorldPosition(
      item.sceneObject.getTransform().getWorldPosition(),
      this.sceneObject.getTransform().getInvertedWorldTransform(),
      {width: item.width, height: item.height, depth: item.depth},
      {x: item.alignmentX, y: item.alignmentY, z: item.alignmentZ},
      this.getSpatialMetrics()
    )
  }

  /**
   * Finds the closest available placement for an item.
   */
  private findClosestAvailablePlacement(item: LayoutItem, coordinate?: SpatialCoordinate): SpatialPlacement | undefined {
    const itemPlacement = this.getPlacementFromItemOrCoord(item, coordinate)

    const bestPlacement = this.findClosestAvailablePlacementBFS(
      itemPlacement.col,
      itemPlacement.row,
      itemPlacement.layer,
      itemPlacement.colSpan,
      itemPlacement.rowSpan,
      itemPlacement.layerSpan
    )

    if (bestPlacement === undefined) {
      log.w(
        `No available placement found for item "${item.sceneObject.name}" with span (${itemPlacement.colSpan}, ${itemPlacement.rowSpan}, ${itemPlacement.layerSpan})`
      )
    }

    return bestPlacement
  }

  /**
   * BFS search to find the closest available grid position from a starting point.
   * Uses Manhattan distance and fillOrder for tiebreaking.
   *
   * @param startCol - Starting column (floating point from item position)
   * @param startRow - Starting row (floating point from item position)
   * @param startLayer - Starting layer (floating point from item position)
   * @param colSpan - Number of columns the item spans
   * @param rowSpan - Number of rows the item spans
   * @param layerSpan - Number of layers the item spans
   * @returns SpatialPlacement if found, undefined otherwise
   */
  private findClosestAvailablePlacementBFS(
    startCol: number,
    startRow: number,
    startLayer: number,
    colSpan: number,
    rowSpan: number,
    layerSpan: number
  ): SpatialPlacement | undefined {
    const placement = findClosestAvailableSpatialPlacement(
      startCol,
      startRow,
      startLayer,
      colSpan,
      rowSpan,
      layerSpan,
      this.itemPlacements,
      this.gridCells,
      this.gridConstraints,
      this.maxIterations,
      this._searchContext
    )

    if (!placement && this._debug) {
      log.w("findClosestAvailablePlacementBFS hit max iterations. Grid might be too dense or something went wrong.")
    }

    return placement
  }

  // Reflow & Update
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Schedules a reflow for the end of the current frame.
   */
  private scheduleReflow(): void {
    if (this.reflowLateUpdateEvent) {
      this.reflowLateUpdateEvent.enabled = true
    }
  }

  /**
   * Callback for LateUpdateEvent. Performs deferred reflow.
   */
  private onReflowLateUpdate = (): void => {
    this.reflowLateUpdateEvent.enabled = false
    this.reflow()
    this.checkForSizeChange()

    // Fire pending item added notifications after layout is complete
    this._pendingAddedTracker.flush((items) => {
      for (const item of items) {
        this.onLayoutItemAddedEvent.invoke(item)
      }
    })
  }

  /**
   * Checks if the grid size has changed and fires the event if so.
   */
  private checkForSizeChange(): void {
    const currentSize = this.gridSize
    if (!vec3ApproximatelyEqual(currentSize, this._lastGridSize)) {
      this._lastGridSize = currentSize
      this.onSizeChangedEvent.invoke(currentSize)
    }
  }

  /**
   * Main reflow logic. Positions all items based on their placements.
   */
  private reflow(): void {
    if (this._structureDirty) {
      this.rebuildStructure()
      this._structureDirty = false
    }

    if (this.itemPlacements.size === 0) return

    this._isUpdatingLayout = true

    try {
      const metrics = this.getSpatialMetrics()

      for (const [item, placement] of this.itemPlacements) {
        const localPosition = calculateSpatialItemLocalPosition(
          placement,
          {width: item.width, height: item.height, depth: item.depth},
          {x: item.alignmentX, y: item.alignmentY, z: item.alignmentZ},
          metrics
        )
        item.position = localPosition
      }
    } finally {
      this._isUpdatingLayout = false
    }
  }

  /**
   * Rebuilds the internal grid structure (clears and re-adds all items).
   */
  private rebuildStructure(): void {
    const items = Array.from(this.itemPlacements.keys())
    // Store old placements to preserve logical positions
    const oldPlacements = new Map(this.itemPlacements)

    // Clear current grid state
    for (const item of items) {
      this.unsubscribeFromItemChanges(item)
    }
    this.itemPlacements.clear()
    this.gridCells.clear()
    this._occupiedMin = {col: Infinity, row: Infinity, layer: Infinity}
    this._occupiedMax = {col: -Infinity, row: -Infinity, layer: -Infinity}

    const metrics = this.getSpatialMetrics()
    const newPlacements = calculateRepackedPlacements(
      items,
      oldPlacements,
      metrics,
      this.gridConstraints,
      this._addOrder,
      this.maxIterations,
      (item) => this.calculatePlacementFromItem(item)
    )

    this.itemPlacements = newPlacements

    for (const [item, placement] of this.itemPlacements) {
      this.setCellsOccupied(item, placement)
      this.subscribeToItemChanges(item)

      const oldPlacement = oldPlacements.get(item)
      if (
        oldPlacement &&
        placement &&
        haveSpatialPlacementsChanged(oldPlacement, placement) &&
        !this._pendingAddedTracker.has(item)
      ) {
        // Defensive copy: listeners must not be able to mutate internal placement objects.
        this.onItemPlacementChangedEvent.invoke({item, placement: {...placement}})
      }
    }

    // Check for items that failed to be placed
    for (const item of items) {
      if (!this.itemPlacements.has(item)) {
        log.w(`Item "${item.sceneObject.name}" could not be placed during rebuild.`)
      }
    }
  }

  // Calculations & Conversions
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Calculates the position offset based on the anchor setting.
   * Only applies when the corresponding axis is fixed.
   */
  private getAnchorOffset(axis: Axis): number {
    if (this._anchorsDirty) {
      if (!this._fixedColumns || !this._fixedRows || !this._fixedLayers) {
        this.ensureBoundsUpToDate()
      }

      // X Axis
      this._cachedAnchorOffset.x = calculateAxisAnchorOffset(
        this._fixedColumns,
        this._maxColumns,
        this._occupiedMin.col,
        this._occupiedMax.col,
        this._cellWidth,
        this._spacingX,
        this._paddingLeft,
        this._paddingRight,
        this._anchorX
      )

      // Y Axis
      this._cachedAnchorOffset.y = calculateAxisAnchorOffset(
        this._fixedRows,
        this._maxRows,
        this._occupiedMin.row,
        this._occupiedMax.row,
        this._cellHeight,
        this._spacingY,
        this._paddingBottom,
        this._paddingTop,
        this._anchorY
      )

      // Z Axis
      this._cachedAnchorOffset.z = calculateAxisAnchorOffset(
        this._fixedLayers,
        this._maxLayers,
        this._occupiedMin.layer,
        this._occupiedMax.layer,
        this._cellDepth,
        this._spacingZ,
        this._paddingBack,
        this._paddingFront,
        this._anchorZ
      )

      this._anchorsDirty = false
    }

    switch (axis) {
      case Axis.X:
        return this._cachedAnchorOffset.x
      case Axis.Y:
        return this._cachedAnchorOffset.y
      case Axis.Z:
        return this._cachedAnchorOffset.z
      default:
        return 0
    }
  }

  // Grid Management Helpers
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Recalculates occupied bounds if marked dirty.
   * This handles shrinking bounds when items are removed or resized.
   */
  private ensureBoundsUpToDate(): void {
    if (!this._boundsDirty) return

    const bounds = calculateOccupiedBoundsFromPlacements(this.itemPlacements.values())
    this._occupiedMin = bounds.min
    this._occupiedMax = bounds.max

    this._boundsDirty = false
  }

  /**
   * Marks all cells covered by an item as occupied in gridCells.
   * @param item - The LayoutItem occupying the cells.
   * @param placement - The SpatialPlacement of the item.
   */
  private setCellsOccupied(item: LayoutItem, placement: SpatialPlacement): boolean {
    if (!isPlacementWithinSpatialBounds(placement, this)) {
      log.w(`setCellsOccupied out of bounds for "${item.sceneObject.name}"`)
      return false
    }

    // Update occupied bounds
    updateOccupiedBounds(this._occupiedMin, this._occupiedMax, placement)

    setPlacementOccupancyInMap(placement, item, this.gridCells)

    return true
  }

  private clearCellsOccupied(placement: SpatialPlacement): boolean {
    if (!isPlacementWithinSpatialBounds(placement, this)) {
      log.w("clearCellsOccupied out of bounds")
      return false
    }

    setPlacementOccupancyInMap(placement, null, this.gridCells)

    // Mark bounds as dirty so they are recalculated lazily when needed.
    // This avoids O(N) scans on every removal or resize.
    this._boundsDirty = true
    return true
  }

  // Event Handlers
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Subscribes to change events for a LayoutItem.
   */
  private subscribeToItemChanges(item: LayoutItem): void {
    if (this.itemSubscriptions.has(item)) return

    // Initialize cache
    this._itemSizes.set(item, item.size)

    const unsubscribeSize = item.onSizeUpdated.add((newSize) => {
      if (this._isUpdatingLayout) {
        this._itemSizes.set(item, newSize)
        return
      }

      // Optimization: Filter out negligible changes
      const oldSize = this._itemSizes.get(item)
      if (oldSize && vec3ApproximatelyEqual(newSize, oldSize)) {
        return
      }
      this._itemSizes.set(item, newSize)

      this.handleItemResize(item)
    })

    const unsubscribeAlignment = item.onAlignmentUpdated.add(() => {
      if (this._isUpdatingLayout) return
      this.scheduleReflow()
    })

    this.itemSubscriptions.set(item, () => {
      unsubscribeSize()
      unsubscribeAlignment()
    })
  }

  /**
   * Handles resizing of an item in the grid.
   * If the item grows, it attempts to push neighbors.
   */
  private handleItemResize(item: LayoutItem): void {
    const currentPlacement = this.itemPlacements.get(item)
    if (!currentPlacement) {
      // Item not in grid? Just schedule reflow in case it matters
      this.scheduleReflow()
      return
    }

    // Calculate new spans
    const spans = calculateItemSpans({width: item.width, height: item.height, depth: item.depth}, this.getSpatialMetrics())
    const newColSpan = spans.colSpan
    const newRowSpan = spans.rowSpan
    const newLayerSpan = spans.layerSpan

    // If spans haven't changed, we don't need to re-layout grid structure, just reflow positions
    if (
      newColSpan === currentPlacement.colSpan &&
      newRowSpan === currentPlacement.rowSpan &&
      newLayerSpan === currentPlacement.layerSpan
    ) {
      this.scheduleReflow()
      return
    }

    log.d(
      `Item ${item.sceneObject.name} resized. New span: ${newColSpan}x${newRowSpan}x${newLayerSpan}. Attempting to push neighbors.`
    )

    // Temporarily remove item from grid occupancy to check if new size fits
    this.clearCellsOccupied(currentPlacement)

    // Try to place item at same origin with new size, pushing others if needed
    const result = this.tryPushAndPlace(item, {
      col: currentPlacement.col,
      row: currentPlacement.row,
      layer: currentPlacement.layer
    })

    if (result) {
      // Success! Item placed with new size (and potentially neighbors moved)
      this.scheduleReflow()
      // Only fire placement changed event if the item is not pending an added event.
      if (
        currentPlacement &&
        result &&
        haveSpatialPlacementsChanged(currentPlacement, result) &&
        !this._pendingAddedTracker.has(item)
      ) {
        // Defensive copy: listeners must not be able to mutate internal placement objects.
        this.onItemPlacementChangedEvent.invoke({item, placement: {...result}})
      }
    } else {
      // Failed to resize/push (e.g. out of bounds). Revert to old placement.
      log.w(
        `Failed to resize item ${item.sceneObject.name} to ${newColSpan}x${newRowSpan}x${newLayerSpan}. Not enough space or out of bounds.`
      )
      this.setCellsOccupied(item, currentPlacement)
      this.scheduleReflow()
    }
  }

  /**
   * Unsubscribes from change events for a LayoutItem.
   */
  private unsubscribeFromItemChanges(item: LayoutItem): void {
    const unsubscribe = this.itemSubscriptions.get(item)
    if (unsubscribe) {
      unsubscribe()
      this.itemSubscriptions.delete(item)
    }
    this._itemSizes.delete(item)
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DEBUG METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Renders debug visualization for the grid.
   * Draws wireframe boxes for each cell, with different colors for empty vs occupied cells.
   */
  private renderDebugBounds = (): void => {
    this.ensureBoundsUpToDate()

    renderSpatialLayoutDebug({
      transform: this.sceneObject.getTransform(),
      cellWidth: this._cellWidth,
      cellHeight: this._cellHeight,
      cellDepth: this._cellDepth,
      spacingX: this._spacingX,
      spacingY: this._spacingY,
      spacingZ: this._spacingZ,
      fixedColumns: this._fixedColumns,
      fixedRows: this._fixedRows,
      fixedLayers: this._fixedLayers,
      maxColumns: this._maxColumns,
      maxRows: this._maxRows,
      maxLayers: this._maxLayers,
      occupiedMin: this._occupiedMin,
      occupiedMax: this._occupiedMax,
      paddingLeft: this._paddingLeft - this.getAnchorOffset(Axis.X),
      paddingRight: this._paddingRight,
      paddingBottom: this._paddingBottom - this.getAnchorOffset(Axis.Y),
      paddingTop: this._paddingTop,
      paddingBack: this._paddingBack - this.getAnchorOffset(Axis.Z),
      paddingFront: this._paddingFront,
      gridCells: this.gridCells
    })
  }
}
