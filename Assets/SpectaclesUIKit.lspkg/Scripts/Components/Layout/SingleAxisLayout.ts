import Event from "SpectaclesInteractionKit.lspkg/Utils/Event"
import NativeLogger from "SpectaclesInteractionKit.lspkg/Utils/NativeLogger"
import ReplayEvent from "SpectaclesInteractionKit.lspkg/Utils/ReplayEvent"
import {findAllComponentsInChildren} from "SpectaclesInteractionKit.lspkg/Utils/SceneObjectUtils"
import {renderSingleAxisLayoutDebug} from "../../Utility/LayoutDebugDrawer"
import {LayoutItemInitializationTracker} from "../../Utility/LayoutItemInitializationTracker"
import {getLayoutItemSizeDriver} from "../../Utility/LayoutItemUtilities"
import {
  calculateTotalLength,
  getSizeForAxis,
  PendingLayoutItemTracker,
  SIZE_CHANGE_EPSILON,
  WRAP_DIRECTION_INFO
} from "../../Utility/LayoutUtilities"
import {validateNonNegative, validateSingleAxisConfiguration} from "../../Utility/LayoutValidation"
import {Mask3D} from "../../Utility/Mask3D"
import {
  buildPositionForAxes,
  calculateSingleAxisLayoutPositions,
  calculateTargetChildSize,
  calculateWrappedItemPositions,
  calculateWrappedTotalSize,
  filterDuplicateItems,
  getPositionForAxis,
  setPositionForAxisMutable,
  setSizeForAxisMutable
} from "../../Utility/SingleAxisLayoutUtilities"
import {
  Alignment,
  Anchor,
  Axis,
  Overflow,
  SizeDriver,
  SpacingDistribution,
  WrapDirection
} from "./LayoutConfigurationTypes"
import {LayoutItem} from "./LayoutItem"
import {SingleAxisLayoutManager} from "./SingleAxisLayoutManager"

const log = new NativeLogger("SingleAxisLayout")

/**
 * A low-level 1D layout component that arranges child {@link LayoutItem} elements along a single axis.
 *
 * @remarks
 * ## Internal Component - Use DirectionalLayout Instead
 *
 * `SingleAxisLayout` is designed as a low-level building block for {@link DirectionalLayout} and is not intended
 * for direct use. For most layout needs, use **{@link DirectionalLayout}** which provides a simpler, more intuitive
 * API for arranging children along one or more axes with features like multi-axis support, named alignment options
 * (Left/Center/Right, Top/Bottom, Front/Back), and stretch modes.
 *
 * Only use `SingleAxisLayout` directly if you have very specific requirements that `DirectionalLayout` cannot fulfill.
 *
 * @see {@link DirectionalLayout} - The recommended layout component for most use cases.
 * @see {@link LayoutItem} - The component required on child elements.
 */
@component
export class SingleAxisLayout extends BaseScriptComponent {
  @input
  private _autoAlignment: boolean = true

  @input
  @showIf("_autoAlignment")
  @hint(
    "Alignment of the layout. If size is flexible, alignment must match the anchor (e.g., start anchor requires start alignment)."
  )
  @widget(
    new ComboBoxWidget([
      new ComboBoxItem("Start", "start"),
      new ComboBoxItem("Center", "center"),
      new ComboBoxItem("End", "end"),
      new ComboBoxItem("Stretch", "stretch"),
      new ComboBoxItem("Stretch Spacing", "stretchSpacing")
    ])
  )
  private _alignment: string = "start"

  @input
  @showIf("_alignment", "stretchSpacing")
  @hint("How to distribute extra space when using Stretch Spacing alignment.")
  @widget(
    new ComboBoxWidget([
      new ComboBoxItem("Space Between", "spaceBetween"),
      new ComboBoxItem("Space Evenly", "spaceEvenly"),
      new ComboBoxItem("Space Around", "spaceAround")
    ])
  )
  private _spacingDistribution: string = SpacingDistribution.SpaceBetween

  @ui.group_start("Primary Axis")
  @input
  @widget(new ComboBoxWidget([new ComboBoxItem("x", "x"), new ComboBoxItem("y", "y"), new ComboBoxItem("z", "z")]))
  private _axis: string = Axis.X

  @input
  @hint(
    "Anchor determines item position relative to origin. Start: item starts at origin, extends positive. End: item ends at origin, extends negative. Center: item centered on origin (alignment ignored)."
  )
  @widget(
    new ComboBoxWidget([
      new ComboBoxItem("Start", "start"),
      new ComboBoxItem("Center", "center"),
      new ComboBoxItem("End", "end")
    ])
  )
  private _anchor: string = Anchor.Start

  @input
  @hint("Enable flexible size. If enabled, the layout will not have bounds.")
  private _flexibleSize: boolean = false

  @input
  @showIf("_flexibleSize", false)
  @hint("Size of the layout in local space centimeters.")
  private _size: number = 10

  @input
  @showIf("_autoAlignment")
  private _spacing: number = 1

  @input
  @showIf("_flexibleSize", false)
  @widget(
    new ComboBoxWidget([
      new ComboBoxItem("Overflow", "overflow"),
      new ComboBoxItem("Truncate", "truncate"),
      new ComboBoxItem("Wrap", "wrap")
    ])
  )
  private _overflow: string = Overflow.Overflow
  @ui.group_end
  @ui.group_start("Secondary Axis")
  @input
  @showIf("_overflow", "wrap")
  @widget(
    new ComboBoxWidget([
      new ComboBoxItem("Left", "-x"),
      new ComboBoxItem("Right", "+x"),
      new ComboBoxItem("Down", "-y"),
      new ComboBoxItem("Up", "+y"),
      new ComboBoxItem("Back", "-z"),
      new ComboBoxItem("Front", "+z")
    ])
  )
  private _secondaryDirection: string = WrapDirection.Down

  @input
  @showIf("_overflow", "wrap")
  @hint("Spacing between wrapped rows in local space centimeters.")
  private _secondarySpacing: number = 1

  @input
  @showIf("_overflow", "wrap")
  @hint("Limit for the secondary (wrap) axis before wrapping to tertiary (0 = no tertiary wrap).")
  private _secondarySize: number = 0
  @ui.group_end
  @ui.group_start("Tertiary Axis")
  @input
  @showIf("_overflow", "wrap")
  @widget(
    new ComboBoxWidget([
      new ComboBoxItem("Left", "-x"),
      new ComboBoxItem("Right", "+x"),
      new ComboBoxItem("Down", "-y"),
      new ComboBoxItem("Up", "+y"),
      new ComboBoxItem("Back", "-z"),
      new ComboBoxItem("Front", "+z")
    ])
  )
  private _tertiaryDirection: string = WrapDirection.Back

  @input
  @showIf("_overflow", "wrap")
  @hint("Spacing between tertiary wrapped layers in local space centimeters.")
  private _tertiarySpacing: number = 1
  @ui.group_end
  @ui.group_start("Padding")
  @input
  @label("Start")
  private _paddingStart: number = 2

  @input
  @label("End")
  private _paddingEnd: number = 2
  @ui.group_end
  @input
  @label("Reverse children order")
  @hint("Reverse the layout. When enabled, the order of layout items is reversed.")
  private _reverse: boolean = false

  @ui.group_start("Child Size")
  @input
  @showIf("_flexibleSize", false)
  private _normalizedChildSize: boolean = false

  @input
  @hint(
    "Child size along the layout axis. When normalized, represents a fraction of the total layout size (e.g., 0.5 = half). Otherwise, size in centimeters."
  )
  private _childSize: number = 1

  @ui.group_end
  private readonly singleAxisLayoutManager: SingleAxisLayoutManager = SingleAxisLayoutManager.getInstance()

  private _layoutItems: LayoutItem[] = []
  private _initialized: boolean = false
  private mask: Mask3D | null = null

  // Pending operations cache for pre-initialization calls
  private _pendingAdditions: {items: LayoutItem[]; startIndex?: number}[] = []
  private _pendingRemovals: LayoutItem[] = []

  // Initialization tracking
  private _initializationTracker: LayoutItemInitializationTracker<LayoutItem>

  // Dirty flags for deferred layout updates
  private _resizeDirty: boolean = false
  private _positionDirty: boolean = false
  private _truncationDirty: boolean = false
  private _initializationPending: boolean = false
  // Guard flag to prevent circular updates when layout is setting item positions/sizes
  private _isUpdatingLayout: boolean = false
  // Created once in onAwake, enabled/disabled to schedule deferred updates
  private refreshOnLateUpdateEvent: SceneEvent
  // Items that have been added and are pending layout update notification
  private _pendingAddedTracker = new PendingLayoutItemTracker<LayoutItem>()

  // Map to store event subscriptions for each LayoutItem so we can unsubscribe later
  private readonly itemEventSubscriptions: Map<
    LayoutItem,
    {
      sizeUnsubscribe: () => void
      positionUnsubscribe: () => void
    }
  > = new Map()

  // Cache of item sizes to optimize updates
  private readonly _itemSizes = new Map<LayoutItem, vec3>()

  private readonly onInitializedEvent = new ReplayEvent<void>()
  public readonly onInitialized = this.onInitializedEvent.publicApi()
  private readonly onLayoutItemAddedEvent = new Event<LayoutItem[]>()
  public readonly onLayoutItemAdded = this.onLayoutItemAddedEvent.publicApi()
  private readonly onLayoutItemRemovedEvent = new Event<LayoutItem[]>()
  public readonly onLayoutItemRemoved = this.onLayoutItemRemovedEvent.publicApi()

  private readonly onAxisChangedEvent = new Event<Axis>()
  public readonly onAxisChanged = this.onAxisChangedEvent.publicApi()

  private _debug: boolean = false
  // Debug rendering update event, created once and enabled/disabled as needed
  private debugUpdateEvent: SceneEvent

  // ═══════════════════════════════════════════════════════════════════════════
  // PUBLIC GETTERS/SETTERS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Gets the layout axis.
   * @returns The current axis ("x", "y", or "z") along which children are arranged.
   */
  public get axis(): Axis {
    return this._axis as Axis
  }

  /**
   * Sets the layout axis.
   * Changing this will re-arrange all children along the new axis.
   * @param value - The axis to use ("x", "y", or "z").
   * @throws Error if the new axis is already in use by another SingleAxisLayout on the same SceneObject.
   */
  public set axis(value: Axis) {
    if (this._axis === value) return

    this._axis = value as string
    this.markDirty({resize: true, position: true, truncation: true})
    this.onAxisChangedEvent.invoke(value)
  }

  /**
   * Gets the anchor point for the layout.
   * @returns The current anchor ("start", "center", or "end").
   */
  public get anchor(): Anchor {
    return this._anchor as Anchor
  }

  /**
   * Sets the anchor point for the layout.
   * Anchor determines where the item group is positioned relative to the origin.
   * Items are always ordered the same way (first to last in positive direction).
   * - "start": Item starts at origin and extends in positive direction (e.g., for X axis: first item at origin, last item to the right).
   * - "end": Item ends at origin and extends in negative direction (e.g., for X axis: first item to the left, last item at origin).
   * - "center": Item is centered on origin (alignment setting is ignored).
   * @param value - The anchor to use ("start", "center", or "end").
   */
  public set anchor(value: Anchor) {
    if (this._anchor === value) return
    this._anchor = value as string
    this.markDirty({position: true, truncation: true})
  }

  /**
   * Gets whether the layout order is reversed.
   * @returns True if the layout item order is reversed, false otherwise.
   */
  public get reverse(): boolean {
    return this._reverse
  }

  /**
   * Sets whether the layout order is reversed.
   * When enabled, the order of layout items is reversed (last item appears first).
   * @param value - True to reverse the item order, false for normal order.
   */
  public set reverse(value: boolean) {
    if (this._reverse === value) return
    this._reverse = value
    this.markDirty({position: true, truncation: true})
  }

  /**
   * Gets whether flexible sizing is enabled.
   * @returns True if the layout resizes to fit items, false if using fixed size.
   */
  public get flexibleSize(): boolean {
    return this._flexibleSize
  }

  /**
   * Sets whether flexible sizing is enabled.
   * When enabled, the layout will resize to fit the items.
   * When disabled, the layout uses the fixed size property.
   * @param value - True to enable flexible sizing, false for fixed size.
   */
  public set flexibleSize(value: boolean) {
    if (this._flexibleSize === value) return
    this._flexibleSize = value
    this.markDirty({resize: true, position: true, truncation: true})
  }

  /**
   * Gets the fixed size of the layout.
   * @returns The size in local space centimeters.
   */
  public get size(): number {
    return this._size
  }

  /**
   * Sets the fixed size of the layout.
   * Only applies when flexibleSize is disabled.
   * @param value - The size in local space centimeters (must be >= 0).
   * @throws Error if value is negative.
   */
  public set size(value: number) {
    validateNonNegative(value, "Size")
    if (this._size === value) return
    this._size = value
    this.markDirty({resize: true, position: true, truncation: true})
  }

  /**
   * Gets the overflow behavior for the layout.
   * @returns The current overflow mode (overflow, truncate, or wrap).
   */
  public get overflow(): Overflow {
    return this._overflow as Overflow
  }

  /**
   * Sets the overflow behavior for the layout.
   * Only applies when flexibleSize is disabled.
   * @param value - The overflow mode to use.
   */
  public set overflow(value: Overflow) {
    if (this._overflow === value) return
    const oldValue = this._overflow
    this._overflow = value

    // Only mark position dirty when wrap mode is involved (transitioning to or from wrap)
    const positionDirty = oldValue === Overflow.Wrap || value === Overflow.Wrap
    // Only mark truncation dirty when truncate mode is involved (transitioning to or from truncate)
    const truncationDirty = oldValue === Overflow.Truncate || value === Overflow.Truncate

    this.markDirty({position: positionDirty, truncation: truncationDirty})
  }

  /**
   * Gets the wrap direction for the layout.
   * Only applies when overflow is set to "wrap".
   * @returns The current wrap direction.
   */
  public get secondaryDirection(): WrapDirection {
    return this._secondaryDirection as WrapDirection
  }

  /**
   * Sets the wrap direction for the layout.
   * The wrap direction must be perpendicular to the layout axis (e.g., if axis is X, wrap direction can only be +/-Y or +/-Z).
   * Only applies when overflow is set to "wrap".
   * @param value - The wrap direction to use.
   * @throws Error if wrap direction is parallel to the layout axis.
   */
  public set secondaryDirection(value: WrapDirection) {
    if (this._secondaryDirection === value) return
    this._secondaryDirection = value as string
    this.markDirty({position: true})
  }

  /**
   * Gets the spacing between wrapped rows.
   * Only applies when overflow is set to "wrap".
   * @returns The wrap spacing in local space centimeters.
   */
  public get secondarySpacing(): number {
    return this._secondarySpacing
  }

  /**
   * Sets the spacing between wrapped rows.
   * Only applies when overflow is set to "wrap".
   * @param value - The wrap spacing in local space centimeters (must be >= 0).
   * @throws Error if value is negative.
   */
  public set secondarySpacing(value: number) {
    validateNonNegative(value, "Wrap spacing")
    if (this._secondarySpacing === value) return
    this._secondarySpacing = value
    this.markDirty({position: true})
  }

  /**
   * Gets the limit for the secondary wrap axis.
   * Only applies when overflow is set to "wrap".
   * @returns The size limit in local space centimeters, or 0 for no limit (no tertiary wrapping).
   */
  public get secondarySize(): number {
    return this._secondarySize
  }

  /**
   * Sets the limit for the secondary wrap axis.
   * When set to a positive value, items will wrap to a tertiary axis after exceeding this limit.
   * When set to 0, tertiary wrapping is disabled.
   * Only applies when overflow is set to "wrap".
   * @param value - The size limit in local space centimeters (must be >= 0, 0 = no limit).
   * @throws Error if value is negative.
   */
  public set secondarySize(value: number) {
    validateNonNegative(value, "Secondary wrap limit")
    if (this._secondarySize === value) return
    this._secondarySize = value
    this.markDirty({position: true})
  }

  /**
   * Gets the tertiary wrap direction for 3D wrapping.
   * Only applies when overflow is set to "wrap" and secondarySize is greater than 0.
   * @returns The current tertiary wrap direction.
   */
  public get tertiaryDirection(): WrapDirection {
    return this._tertiaryDirection as WrapDirection
  }

  /**
   * Sets the tertiary wrap direction for 3D wrapping.
   * The tertiary direction must be perpendicular to both the layout axis and secondary direction.
   * Only applies when overflow is set to "wrap" and secondarySize is greater than 0.
   * @param value - The tertiary wrap direction to use.
   * @throws Error if tertiary direction is parallel to the layout axis or secondary direction.
   */
  public set tertiaryDirection(value: WrapDirection) {
    if (this._tertiaryDirection === value) return
    this._tertiaryDirection = value as string
    this.markDirty({position: true})
  }

  /**
   * Gets the spacing between tertiary wrapped layers.
   * Only applies when overflow is set to "wrap" and secondarySize is greater than 0.
   * @returns The tertiary spacing in local space centimeters.
   */
  public get tertiarySpacing(): number {
    return this._tertiarySpacing
  }

  /**
   * Sets the spacing between tertiary wrapped layers.
   * Only applies when overflow is set to "wrap" and secondarySize is greater than 0.
   * @param value - The tertiary spacing in local space centimeters (must be >= 0).
   * @throws Error if value is negative.
   */
  public set tertiarySpacing(value: number) {
    validateNonNegative(value, "Tertiary wrap spacing")
    if (this._tertiarySpacing === value) return
    this._tertiarySpacing = value
    this.markDirty({position: true})
  }

  /**
   * Gets whether auto alignment is enabled.
   * @returns True if the layout automatically positions children.
   */
  public get autoAlignment(): boolean {
    return this._autoAlignment
  }

  /**
   * Sets whether auto alignment is enabled.
   * When enabled, children are automatically positioned based on alignment settings.
   * When disabled, children maintain their manual positions.
   * @param value - True to enable auto alignment, false for manual positioning.
   */
  public set autoAlignment(value: boolean) {
    if (this._autoAlignment === value) return
    this._autoAlignment = value
    this.markDirty({resize: true, position: true, truncation: true})
  }

  /**
   * Gets the alignment mode.
   * @returns The current alignment ("start", "center", "end", "stretch", or "stretchSpacing").
   */
  public get alignment(): Alignment {
    return this._alignment as Alignment
  }

  /**
   * Sets the alignment mode.
   * Determines how children are positioned within the layout.
   * - "start": Align to the start with padding
   * - "center": Center within the layout
   * - "end": Align to the end with padding
   * - "stretch": Stretch children to fill available space
   * - "stretchSpacing": Keep child sizes fixed, distribute extra space as spacing
   * @param value - The alignment mode to use.
   */
  public set alignment(value: Alignment) {
    if (this._alignment === value) return
    this._alignment = value as string
    this.markDirty({resize: true, position: true, truncation: true})
  }

  /**
   * Gets the spacing distribution mode.
   * Only applies when alignment is set to "stretchSpacing".
   * @returns The current spacing distribution ("spaceBetween", "spaceEvenly", or "spaceAround").
   */
  public get spacingDistribution(): SpacingDistribution {
    return this._spacingDistribution as SpacingDistribution
  }

  /**
   * Sets the spacing distribution mode.
   * Determines how extra space is distributed when alignment is "stretchSpacing".
   * - "spaceBetween": First and last items at edges, equal space between items
   * - "spaceEvenly": Equal space everywhere, including before first and after last item
   * - "spaceAround": Half space at edges, full space between items
   * @param value - The spacing distribution mode to use.
   */
  public set spacingDistribution(value: SpacingDistribution) {
    if (this._spacingDistribution === value) return
    this._spacingDistribution = value as string
    if (this._alignment === Alignment.StretchSpacing) {
      this.markDirty({position: true, truncation: true})
    }
  }

  /**
   * Gets the spacing between children.
   * @returns The spacing in local space centimeters.
   */
  public get spacing(): number {
    return this._spacing
  }

  /**
   * Sets the spacing between children.
   * Only applies when autoAlignment is enabled.
   * @param value - The spacing in local space centimeters (must be >= 0).
   * @throws Error if value is negative.
   */
  public set spacing(value: number) {
    validateNonNegative(value, "Spacing")
    if (this._spacing === value) return
    this._spacing = value
    if (this._alignment === Alignment.StretchSpacing) {
      log.w(
        "Spacing value has no effect when alignment is set to 'Stretch Spacing'. Spacing is dynamically calculated based on spacingDistribution."
      )
    }
    this.markDirty({resize: true, position: true, truncation: true})
  }

  /**
   * Gets the start padding.
   * @returns The padding at the start of the layout in local space centimeters.
   */
  public get paddingStart(): number {
    return this._paddingStart
  }

  /**
   * Sets the start padding.
   * Adds space before the first child element.
   * @param value - The padding in local space centimeters (must be >= 0).
   * @throws Error if value is negative.
   */
  public set paddingStart(value: number) {
    validateNonNegative(value, "Padding start")
    if (this._paddingStart === value) return
    this._paddingStart = value
    this.markDirty({resize: true, position: true, truncation: true})
  }

  /**
   * Gets the end padding.
   * @returns The padding at the end of the layout in local space centimeters.
   */
  public get paddingEnd(): number {
    return this._paddingEnd
  }

  /**
   * Sets the end padding.
   * Adds space after the last child element.
   * @param value - The padding in local space centimeters (must be >= 0).
   * @throws Error if value is negative.
   */
  public set paddingEnd(value: number) {
    validateNonNegative(value, "Padding end")
    if (this._paddingEnd === value) return
    this._paddingEnd = value
    this.markDirty({resize: true, position: true, truncation: true})
  }

  /**
   * Gets whether normalized child sizing is enabled.
   * @returns True if child size is interpreted as a fraction of total layout size.
   */
  public get normalizedChildSize(): boolean {
    return this._normalizedChildSize
  }

  /**
   * Sets whether normalized child sizing is enabled.
   * When enabled, childSize is interpreted as a fraction (0-1) of the total layout size.
   * When disabled, childSize is in absolute centimeters.
   * Only applies when flexibleSize is disabled.
   * @param value - True for normalized sizing, false for absolute sizing.
   */
  public set normalizedChildSize(value: boolean) {
    if (this._normalizedChildSize === value) return
    this._normalizedChildSize = value
    this.markDirty({resize: true, position: true, truncation: true})
  }

  /**
   * Gets the child size.
   * @returns The size of children along the layout axis.
   */
  public get childSize(): number {
    return this._childSize
  }

  /**
   * Sets the child size along the layout axis.
   * When normalizedChildSize is true, this is a fraction (0-1) of the layout size.
   * When normalizedChildSize is false, this is in centimeters.
   * @param value - The child size (must be >= 0, and <= 1 when normalized).
   * @throws Error if value is negative.
   */
  public set childSize(value: number) {
    validateNonNegative(value, "Child size")
    if (this._childSize === value) return
    this._childSize = value
    this.markDirty({resize: true, position: true, truncation: true})
  }

  /**
   * Gets the layout items.
   * @returns The layout items.
   */
  public get layoutItems(): LayoutItem[] {
    return this._layoutItems
  }

  /**
   * Gets whether the layout is initialized.
   * @returns True if the layout is initialized, false otherwise.
   */
  public get initialized(): boolean {
    return this._initialized
  }

  /**
   * Gets whether debug visualization is enabled.
   * When enabled, draws a wireframe box showing the layout bounds along its axis.
   *
   * @returns True if debug mode is enabled, false otherwise.
   */
  public get debug(): boolean {
    return this._debug
  }

  /**
   * Sets whether debug visualization is enabled.
   * When enabled, draws a wireframe box showing the layout bounds using DebugRender.
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

  // ═══════════════════════════════════════════════════════════════════════════
  // PUBLIC CLASS METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Adds multiple LayoutItems to the layout in a single operation.
   * The items will be reparented to the layout, resized, positioned, and included in truncation masking if enabled.
   *
   * @param layoutItems - The array of LayoutItems to add.
   * @param startIndex - Optional index at which to start inserting the items. If not provided, appends to the end.
   * @returns The list of items that were successfully added or queued for addition.
   *          Returns an empty array if startIndex is invalid or if all items are duplicates.
   *          When called before initialization, returns items queued for addition (excluding existing children).
   */
  public addLayoutItems(layoutItems: LayoutItem[], startIndex?: number): LayoutItem[] {
    if (layoutItems.length === 0) return []

    if (!this._initialized && !this._initializationPending) {
      // Filter out items that are already children of this object
      // (they will be found automatically by SingleAxisLayout during initialization)
      const nonChildLayoutItems = layoutItems.filter((item) => item.sceneObject.getParent() !== this.sceneObject)
      if (nonChildLayoutItems.length > 0) {
        this._pendingAdditions.push({items: nonChildLayoutItems, startIndex: startIndex})
      }
      return nonChildLayoutItems
    }

    if (startIndex !== undefined && (startIndex < 0 || startIndex > this._layoutItems.length)) {
      log.w(`Start index must be between 0 and ${this._layoutItems.length}`)
      return []
    }

    // Filter out duplicate items first
    const itemsToAdd = filterDuplicateItems(layoutItems, this._layoutItems, (item) =>
      log.w(`LayoutItem "${item.sceneObject.name}" is already in this layout.`)
    )

    if (itemsToAdd.length === 0) {
      return []
    }

    // Reparent items to the layout for consistent positioning and masking
    for (const layoutItem of itemsToAdd) {
      layoutItem.parentToLayout(this)
      log.d(`Added LayoutItem "${layoutItem.sceneObject.name}" to layout ${this.sceneObject.name}`)
    }

    // Maintain hierarchy order.
    // The loop iterates over the items that should appear AFTER the new items in the hierarchy.
    // By re-parenting them to the same parent, they move to the end of the child list,
    // effectively placing the new items (which are already at the end) before them.
    if (startIndex !== undefined && startIndex >= 0) {
      // Iterate through the rest of the array
      for (let i = startIndex; i < this._layoutItems.length; i++) {
        // Re-parenting to the same parent moves it to the end of the child list
        this._layoutItems[i].sceneObject.setParent(this.sceneObject)
      }
    }

    // Insert all items and subscribe to their events
    if (startIndex !== undefined && startIndex >= 0 && startIndex < this._layoutItems.length) {
      this._layoutItems.splice(startIndex, 0, ...itemsToAdd)
    } else {
      this._layoutItems.push(...itemsToAdd)
    }

    // Subscribe to events for all added items
    for (const layoutItem of itemsToAdd) {
      this.subscribeToItemEvents(layoutItem)
    }

    if (this._initializationPending) {
      // Use tracker to wait for these items
      // If we add items, tracker will update readiness. If they are not ready, it will block.
      // If they are ready, it might call callback, but since we are in pending state, that's fine.
      // We need to ensure we disable the late update event if we are now waiting.

      const uninitializedNewItems = itemsToAdd.filter((item) => !item.initialized)
      if (uninitializedNewItems.length > 0) {
        this.refreshOnLateUpdateEvent.enabled = false
        this._initializationTracker.addItems(uninitializedNewItems)
      }
    } else if (this._initialized) {
      // Schedule deferred layout update
      this.markDirty({resize: true, position: true, truncation: true})
    }

    // Queue items for notification after layout operations complete
    this._pendingAddedTracker.addItems(itemsToAdd)

    return itemsToAdd
  }

  /**
   * Removes multiple LayoutItems from the layout in a single operation.
   * More efficient than calling removeLayoutItem multiple times as it only triggers one layout refresh.
   * The items will be unregistered from truncation masking and restored to their original parents.
   *
   * If called before initialization, items will be cached and removed during initialization.
   *
   * @param layoutItems - The array of LayoutItems to remove.
   * @returns An array of successfully removed LayoutItems. Returns empty array if called before initialization.
   */
  public removeLayoutItems(layoutItems: LayoutItem[]): LayoutItem[] {
    if (layoutItems.length === 0) return []

    if (!this._initialized && !this._initializationPending) {
      // Cache items for removal during initialization
      this._pendingRemovals.push(...layoutItems)
      return [] // Nothing removed yet, return empty array
    }

    this.singleAxisLayoutManager.removeLayoutItemsFromTruncationMask(layoutItems)

    // Optimization: Use a Set for O(1) lookups
    const itemsToRemove = new Set(layoutItems)

    const keptItems: LayoutItem[] = []
    const removedItems: LayoutItem[] = []

    // Single pass through existing items (O(N))
    // This preserves the order of kept items and avoids repeated .splice() calls
    for (const item of this._layoutItems) {
      if (itemsToRemove.has(item)) {
        if (this.mask) {
          item.isVisible = true
        }
        // Unsubscribe from item events
        this.unsubscribeFromItemEvents(item)

        item.unparentFromLayout()
        removedItems.push(item)
        log.d(`Removed LayoutItem "${item.sceneObject.name}" from layout`)
      } else {
        keptItems.push(item)
      }
    }

    // Only update state if items were actually removed
    if (removedItems.length > 0) {
      this._layoutItems = keptItems

      // Filter out items that were pending add - they shouldn't fire removed event since added never fired
      const itemsToNotifyRemoved = this._pendingAddedTracker.resolveDeferredRemovals(removedItems)

      // Check if any removed items were ones we were waiting for
      if (this._initializationPending) {
        this._initializationTracker.removeItems(removedItems)

        // If removing items made us ready (tracker handles this but we need to ensure event is enabled)
        if (this._initializationTracker.isReady) {
          this.refreshOnLateUpdateEvent.enabled = true
        }
      }

      // Resize needed for stretch alignment, position and truncation always needed
      this.markDirty({resize: true, position: true, truncation: true})

      if (itemsToNotifyRemoved.length > 0) {
        this.onLayoutItemRemovedEvent.invoke(itemsToNotifyRemoved)
      }
    }

    return removedItems
  }

  /**
   * Gets the total length of all items along the layout axis.
   * This includes the sizes of all layout items and the spacing between them.
   *
   * @param includePadding - Whether to include start and end padding in the calculation. Defaults to false.
   * @returns The total items length in local space centimeters.
   */
  public getTotalItemsLength(includePadding: boolean = false): number {
    return calculateTotalLength(
      this._layoutItems,
      (item) => getSizeForAxis(item, this._axis as Axis),
      this._spacing,
      this._paddingStart,
      this._paddingEnd,
      includePadding
    )
  }

  /**
   * Calculates the dimensions of the wrapped layout items.
   * Used by DirectionalLayout to determine total items size when wrapping is enabled.
   *
   * @param includePadding - Whether to include padding in the calculation.
   * @returns An object containing the size along the main axis and the cross axis (wrap axis).
   */
  public calculateWrappedDimensions(includePadding: boolean): {
    mainAxis: number
    secondaryAxis: number
    tertiaryAxis?: number
  } {
    if (this._overflow !== Overflow.Wrap || this._flexibleSize) {
      return {
        mainAxis: this.getTotalItemsLength(includePadding),
        secondaryAxis: 0,
        tertiaryAxis: 0
      }
    }

    const wrapToTertiary = this._secondarySize !== Infinity && this._secondarySize > 0
    const result = calculateWrappedTotalSize(
      this._layoutItems,
      {
        axis: this._axis as Axis,
        size: this._size,
        spacing: this._spacing,
        paddingStart: this._paddingStart,
        paddingEnd: this._paddingEnd,
        reverse: this._reverse,
        secondaryDirection: this._secondaryDirection as WrapDirection,
        secondarySpacing: this._secondarySpacing,
        secondarySize: this._secondarySize,
        tertiaryDirection: wrapToTertiary ? (this._tertiaryDirection as WrapDirection) : undefined,
        tertiarySpacing: this._tertiarySpacing
      },
      getSizeForAxis
    )

    if (!includePadding) {
      result.mainAxis -= this._paddingStart + this._paddingEnd
    }

    return result
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PUBLIC BASESCRIPTCOMPONENT METHOD
  // ═══════════════════════════════════════════════════════════════════════════

  public onAwake() {
    this.validateInputs()

    // Initialize tracker
    this._initializationTracker = new LayoutItemInitializationTracker(() => {
      log.d(`All children initialized. Proceeding with SingleAxisLayout initialization for ${this.sceneObject.name}`)
      this.refreshOnLateUpdateEvent.enabled = true
    })

    // Register with the manager (validates max layouts and axis uniqueness)
    this.singleAxisLayoutManager.registerLayout(this)

    // Create the late update event once, starts disabled
    this.refreshOnLateUpdateEvent = this.createEvent("LateUpdateEvent")
    this.refreshOnLateUpdateEvent.enabled = false
    this.refreshOnLateUpdateEvent.bind(this.refreshOnLateUpdate)

    // Create the debug update event once, starts disabled
    this.debugUpdateEvent = this.createEvent("UpdateEvent")
    this.debugUpdateEvent.enabled = this._debug
    this.debugUpdateEvent.bind(this.renderDebugBounds)

    this.createEvent("OnStartEvent").bind(() => {
      this.findLayoutItemsInChildren()
      this._initializationPending = true
      this.processPendingAdditionsAndRemovals()

      this.checkInitializationReadiness()
    })
    this.createEvent("OnDestroyEvent").bind(() => {
      this.unsubscribeFromAllItemEvents()
      this._initializationTracker.dispose()

      // Unregister from the manager - this also cleans up truncation
      this.singleAxisLayoutManager.unregisterLayout(this)
    })

    this.createEvent("OnEnableEvent").bind(() => {
      if (!this._initialized) return

      // Re-enable the mask if truncation is active
      if (this.mask) {
        this.singleAxisLayoutManager.updateMask(this)
      }

      // Refresh layout in case items changed while disabled
      this.markDirty({resize: true, position: true, truncation: true})
      log.d("SingleAxisLayout enabled, scheduling layout refresh")
    })

    this.createEvent("OnDisableEvent").bind(() => {
      if (!this._initialized) return

      // Update mask state via manager (might disable it if no other layouts need it)
      if (this.mask) {
        this.singleAxisLayoutManager.updateMask(this)
      }

      log.d("SingleAxisLayout disabled, all items made visible")
    })
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  private checkInitializationReadiness(): void {
    // Identify uninitialized children
    const uninitializedChildren = this._layoutItems.filter((item) => !item.initialized)

    // Add to tracker
    this._initializationTracker.addItems(uninitializedChildren)
  }

  private findLayoutItemsInChildren(): void {
    this._layoutItems = findAllComponentsInChildren(this.sceneObject, LayoutItem.getTypeName(), 1)
    log.d(`Found ${this._layoutItems.length} layout items in children`)

    // Subscribe to events for all found items
    for (const item of this._layoutItems) {
      this.subscribeToItemEvents(item)
    }
  }

  private processPendingAdditionsAndRemovals(): void {
    // Process pending additions (items that were not already children)
    if (this._pendingAdditions.length > 0) {
      for (const pending of this._pendingAdditions) {
        this.addLayoutItems(pending.items, pending.startIndex)
      }
    }
    this._pendingAdditions = []

    // Process pending removals
    if (this._pendingRemovals.length > 0) {
      this.removeLayoutItems(this._pendingRemovals)
    }
    this._pendingRemovals = []
  }

  /**
   * Subscribes to size and position change events for a LayoutItem.
   * When item size changes, positions need to be recalculated.
   * When item position changes externally, truncation visibility may need updating.
   */
  private subscribeToItemEvents(item: LayoutItem): void {
    // Skip if already subscribed
    if (this.itemEventSubscriptions.has(item)) {
      return
    }

    // Initialize cache
    this._itemSizes.set(item, item.size)

    const sizeUnsubscribe = item.onSizeUpdated.add((newSize: vec3) => {
      // Skip if we're the ones updating to avoid circular updates
      if (this._isUpdatingLayout) {
        this._itemSizes.set(item, newSize)
        return
      }

      // Optimization: Check if relevant axes actually changed
      const oldSize = this._itemSizes.get(item)
      let shouldUpdate = true

      if (oldSize) {
        // Check Main Axis
        const mainAxisChanged =
          Math.abs(getPositionForAxis(newSize, this.axis) - getPositionForAxis(oldSize, this.axis)) >
          SIZE_CHANGE_EPSILON

        // Check Cross Axis (only if wrapping)
        let secondaryAxisChanged = false
        let tertiaryAxisChanged = false
        if (this._overflow === Overflow.Wrap) {
          const secondaryWrapInfo = WRAP_DIRECTION_INFO[this.secondaryDirection]
          secondaryAxisChanged =
            Math.abs(
              getPositionForAxis(newSize, secondaryWrapInfo.axis) - getPositionForAxis(oldSize, secondaryWrapInfo.axis)
            ) > SIZE_CHANGE_EPSILON

          if (this._secondarySize !== Infinity && this._secondarySize > 0) {
            const tertiaryWrapInfo = WRAP_DIRECTION_INFO[this.tertiaryDirection]
            tertiaryAxisChanged =
              Math.abs(
                getPositionForAxis(newSize, tertiaryWrapInfo.axis) - getPositionForAxis(oldSize, tertiaryWrapInfo.axis)
              ) > SIZE_CHANGE_EPSILON
          }
        }

        // If neither changed, we can skip the layout update
        if (!mainAxisChanged && !secondaryAxisChanged && !tertiaryAxisChanged) {
          shouldUpdate = false
        }
      }

      this._itemSizes.set(item, newSize)

      if (shouldUpdate) {
        this.markDirty({position: true, resize: true, truncation: true})
      }
    })

    const positionUnsubscribe = item.onPositionUpdated.add(() => {
      // Skip if layout is disabled or we're the ones updating to avoid circular updates
      if (this._isUpdatingLayout) {
        return
      }
      // Item position changed externally, need to update truncation visibility
      this.markDirty({position: true, truncation: true})
    })

    this.itemEventSubscriptions.set(item, {sizeUnsubscribe, positionUnsubscribe})
  }

  /**
   * Unsubscribes from all items' events. Called during cleanup.
   */
  private unsubscribeFromAllItemEvents(): void {
    for (const item of this.itemEventSubscriptions.keys()) {
      this.unsubscribeFromItemEvents(item)
    }
  }

  /**
   * Unsubscribes from size and position change events for a LayoutItem.
   */
  private unsubscribeFromItemEvents(item: LayoutItem): void {
    const subscriptions = this.itemEventSubscriptions.get(item)
    if (subscriptions) {
      subscriptions.sizeUnsubscribe()
      subscriptions.positionUnsubscribe()
      this.itemEventSubscriptions.delete(item)
    }
    this._itemSizes.delete(item)
  }

  /**
   * Marks specific layout operations as dirty and schedules a deferred refresh.
   * Multiple calls within the same frame will be batched into a single refresh.
   *
   * @param options - Object specifying which operations are needed.
   * @param options.resize - Whether resize operation is needed.
   * @param options.position - Whether position operation is needed.
   * @param options.truncation - Whether truncation operation is needed.
   */
  private markDirty({
    resize = false,
    position = false,
    truncation = false
  }: {
    resize?: boolean
    position?: boolean
    truncation?: boolean
  }): void {
    if (!this._initialized) return

    this._resizeDirty = this._resizeDirty || resize
    this._positionDirty = this._positionDirty || position
    this._truncationDirty = this._truncationDirty || truncation

    this.refreshOnLateUpdateEvent.enabled = true
  }

  /**
   * Callback for the LateUpdateEvent. Handles initialization on first frame
   * and deferred property updates on subsequent frames.
   */
  private refreshOnLateUpdate = (): void => {
    // Disable event after firing (keep reference for reuse)
    this.refreshOnLateUpdateEvent.enabled = false

    // Handle initialization (runs once at end of first frame)
    if (this._initializationPending) {
      this._initializationPending = false

      // Validate complete configuration before first execution
      this.validateConfiguration()

      this._isUpdatingLayout = true
      try {
        this.resizeLayoutItems()
        this.positionLayoutItems()
        this.updateTruncation()
      } finally {
        this._isUpdatingLayout = false
      }
      this._initialized = true
      this.onInitializedEvent.invoke()

      this.notifyPendingAddedItems()
      return
    }

    // Handle deferred property updates
    this.refreshLayout()
  }

  /**
   * Refreshes the layout by performing only the operations marked as dirty.
   * Clears all dirty flags after execution.
   */
  private refreshLayout(): void {
    if (!this._initialized) return

    // Validate complete configuration before executing layout
    this.validateConfiguration()

    this._isUpdatingLayout = true
    try {
      if (this._resizeDirty) {
        this.resizeLayoutItems()
      }
      if (this._positionDirty) {
        this.positionLayoutItems()
      }
      if (this._truncationDirty) {
        this.updateTruncation()
      }
    } finally {
      this._isUpdatingLayout = false
    }

    // Clear dirty flags
    this._resizeDirty = false
    this._positionDirty = false
    this._truncationDirty = false

    this.notifyPendingAddedItems()
  }

  private notifyPendingAddedItems(): void {
    // Fire pending item added notification after layout is complete
    this._pendingAddedTracker.flush((items) => this.onLayoutItemAddedEvent.invoke(items))
  }

  private resizeLayoutItems(layoutItems: LayoutItem[] = this._layoutItems): void {
    if (layoutItems.length === 0) return

    const axis = this._axis as Axis

    const resizableItems: LayoutItem[] = []
    for (const item of layoutItems) {
      if (getLayoutItemSizeDriver(item, axis) === SizeDriver.LayoutAndLayoutItem) {
        resizableItems.push(item)
      }
    }

    // Early exit if no items are driven by this layout on this axis
    if (resizableItems.length === 0) return

    const sizeAlongAxis = calculateTargetChildSize(
      layoutItems,
      (item) => getSizeForAxis(item, axis),
      (item) => getLayoutItemSizeDriver(item, axis) !== SizeDriver.LayoutAndLayoutItem,
      {
        autoAlignment: this._autoAlignment,
        flexibleSize: this._flexibleSize,
        alignment: this._alignment,
        normalizedChildSize: this._normalizedChildSize,
        layoutSize: this._size,
        childSize: this._childSize,
        paddingTotal: this._paddingStart + this._paddingEnd,
        spacing: this._spacing
      }
    )

    for (const layoutItem of resizableItems) {
      setSizeForAxisMutable(layoutItem, axis, sizeAlongAxis)
    }
  }

  private positionLayoutItems(): void {
    const itemCount = this._layoutItems.length
    if (itemCount === 0) return

    if (!this._autoAlignment) {
      log.d("Auto alignment disabled, keeping manual positions")
      return
    }

    // Handle wrap overflow mode
    if (!this._flexibleSize && this._overflow === Overflow.Wrap) {
      this.positionWithWrapping()
      return
    }

    const positions = calculateSingleAxisLayoutPositions(
      this._layoutItems.map((item) => getSizeForAxis(item, this._axis as Axis)),
      {
        flexibleSize: this._flexibleSize,
        alignment: this._alignment,
        anchor: this._anchor as Anchor,
        size: this._size,
        paddingStart: this._paddingStart,
        paddingEnd: this._paddingEnd,
        spacing: this._spacing,
        reverse: this._reverse,
        spacingDistribution: this._spacingDistribution
      }
    )

    for (let i = 0; i < this._layoutItems.length; i++) {
      const layoutItem = this._layoutItems[i]
      const position = positions[i]

      this.applyPosition(layoutItem, position)
    }
  }

  /**
   * Positions layout items with wrapping.
   * Items that exceed the layout size are wrapped to new rows in the wrap direction.
   * The first row is centered at the origin (matching non-wrap behavior),
   * and subsequent rows are offset in the wrap direction.
   */
  private positionWithWrapping(): void {
    const items = this._reverse ? [...this._layoutItems].reverse() : this._layoutItems
    const secondaryWrapInfo = WRAP_DIRECTION_INFO[this._secondaryDirection as WrapDirection]
    const wrapToTertiary = this._secondarySize !== Infinity && this._secondarySize > 0
    const tertiaryWrapInfo = wrapToTertiary ? WRAP_DIRECTION_INFO[this._tertiaryDirection as WrapDirection] : null

    // Use the consolidated helper function for wrap positioning
    const positionResults = calculateWrappedItemPositions<LayoutItem>(
      items,
      {
        mainAxis: this._axis as Axis,
        secondaryAxis: secondaryWrapInfo.axis,
        secondarySign: secondaryWrapInfo.sign,
        tertiaryAxis: tertiaryWrapInfo?.axis,
        tertiarySign: tertiaryWrapInfo?.sign,
        layoutSize: this._size,
        anchor: this._anchor as Anchor,
        alignment: this._alignment,
        spacing: this._spacing,
        secondarySpacing: this._secondarySpacing,
        tertiaryDirection: wrapToTertiary ? (this._tertiaryDirection as WrapDirection) : undefined,
        tertiarySpacing: this._tertiarySpacing,
        secondarySize: this._secondarySize,
        paddingStart: this._paddingStart,
        paddingEnd: this._paddingEnd
      },
      getSizeForAxis
    )

    // Apply positions to layout items
    for (const result of positionResults) {
      const currentPos = result.item.position
      const axesToSet = [
        {axis: this._axis as "x" | "y" | "z", value: result.mainAxisPosition},
        {axis: secondaryWrapInfo.axis, value: result.wrapAxisPosition}
      ]

      if (tertiaryWrapInfo && result.tertiaryAxisPosition !== undefined) {
        axesToSet.push({axis: tertiaryWrapInfo.axis, value: result.tertiaryAxisPosition})
      }

      const newPos = buildPositionForAxes(currentPos, axesToSet)
      result.item.position = newPos
    }
  }

  private applyPosition(layoutItem: LayoutItem, offset: number): void {
    log.d(`Positioning ${layoutItem.sceneObject.name} to ${offset} on axis ${this._axis}`)
    setPositionForAxisMutable(layoutItem, this._axis as Axis, offset)
  }

  private updateTruncation(): void {
    if (this._flexibleSize || this._overflow !== Overflow.Truncate) {
      // Clean up existing mask when truncation is disabled
      this.cleanupTruncation()
      return
    }

    // Register this layout with the manager for truncation masking
    // The manager handles computing the combined mask bounds from all layouts
    this.mask = this.singleAxisLayoutManager.addLayoutToTruncationMask(this)

    log.d(`Truncation enabled for axis ${this._axis}`)
  }

  private cleanupTruncation(): void {
    if (!this.mask) {
      return
    }

    for (const item of this._layoutItems) {
      // Restore visibility for all items
      item.isVisible = true
    }

    this.singleAxisLayoutManager.removeLayoutFromTruncationMask(this)
    this.mask = null

    log.d("Truncation cleanup completed")
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE VALIDATION METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  private validateInputs(): void {
    validateNonNegative(this._size, "Size")
    validateNonNegative(this._spacing, "Spacing")
    validateNonNegative(this._secondarySize, "Secondary size")
    validateNonNegative(this._secondarySpacing, "Secondary spacing")
    validateNonNegative(this._tertiarySpacing, "Tertiary spacing")
    validateNonNegative(this._paddingStart, "Padding start")
    validateNonNegative(this._paddingEnd, "Padding end")
    validateNonNegative(this._childSize, "Child size")
  }

  /**
   * Validates the complete configuration before layout execution.
   * This method performs cross-property validations that depend on multiple settings.
   * Called at the start of layout execution to allow batch property updates without
   * order-dependent errors.
   */
  private validateConfiguration(): void {
    validateSingleAxisConfiguration(
      this._flexibleSize,
      this._normalizedChildSize,
      this._overflow as Overflow,
      this._alignment as Alignment,
      this._autoAlignment,
      this._childSize,
      this._secondaryDirection as WrapDirection,
      this._axis as Axis,
      this._secondarySize,
      this._tertiaryDirection as WrapDirection
    )
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE DEBUG METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Renders debug visualization for the layout.
   * - Draws a tiny sphere at the origin
   * - For fixed size: draws a line showing the direction and size based on anchor
   */
  private renderDebugBounds = () => {
    renderSingleAxisLayoutDebug(
      this.sceneObject.getTransform(),
      this._axis as Axis,
      this._anchor as Anchor,
      this._size,
      this._flexibleSize
    )
  }
}
