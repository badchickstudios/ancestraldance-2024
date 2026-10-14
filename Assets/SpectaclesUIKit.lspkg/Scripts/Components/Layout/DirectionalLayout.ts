import Event from "SpectaclesInteractionKit.lspkg/Utils/Event"
import NativeLogger from "SpectaclesInteractionKit.lspkg/Utils/NativeLogger"
import ReplayEvent from "SpectaclesInteractionKit.lspkg/Utils/ReplayEvent"
import {
  addPaddingToVec3,
  ALL_AXES,
  applyDirectionalAxisSettings,
  applyDirectionalSizeToAxis,
  AxisDirtyFlags,
  buildDirectionalAxisSettings,
  createPaddingVec3,
  DIRECTIONAL_ALIGNMENT_MAPPING,
  filterPendingRemovals,
  getThreeAxisIntersection,
  mapWrappedDimensionsTo3DSize,
  trackPendingItems,
  updateAllCachedAxisSizes,
  updateItemConfirmations
} from "../../Utility/DirectionalLayoutUtilities"
import {renderDirectionalLayoutDebug} from "../../Utility/LayoutDebugDrawer"
import {
  calculateTotalLength,
  getSizeForAxis,
  SIZE_CHANGE_EPSILON,
  WRAP_DIRECTION_INFO
} from "../../Utility/LayoutUtilities"
import {
  validateAnchor,
  validateAxisStretchConfiguration,
  validateDirectionalWrapSettings,
  validateNonNegative,
  validateNormalizedChildSizes
} from "../../Utility/LayoutValidation"
import {vec3ApproximatelyEqual} from "../../Utility/UIKitUtilities"
import {
  AlignmentConstants,
  Anchor,
  Axis,
  AxisLayoutConfig,
  DepthAlignment,
  HorizontalAlignment,
  Overflow,
  SpacingDistribution,
  StretchMode,
  VerticalAlignment,
  WrapDirection
} from "./LayoutConfigurationTypes"
import {LayoutItem} from "./LayoutItem"
import {NestableLayout} from "./NestableLayout"
import {SingleAxisLayout} from "./SingleAxisLayout"

const log = new NativeLogger("DirectionalLayout")

/**
 * Configuration for DirectionalLayout axis-specific property keys.
 * Maps axis enum values to their corresponding internal property names.
 */
const DIRECTIONAL_AXIS_CONFIG: Record<Axis, AxisLayoutConfig> = {
  [Axis.X]: {
    layoutKey: "_layoutX",
    alignmentKey: "_childAlignmentX",
    stretchModeKey: "_stretchModeX",
    anchorKey: "_anchorX",
    spacingDistributionKey: "_spacingDistributionX",
    fixedSizeKey: "_fixedWidth",
    sizeKey: "_width",
    paddingStartKey: "_paddingLeft",
    paddingEndKey: "_paddingRight"
  },
  [Axis.Y]: {
    layoutKey: "_layoutY",
    alignmentKey: "_childAlignmentY",
    stretchModeKey: "_stretchModeY",
    anchorKey: "_anchorY",
    spacingDistributionKey: "_spacingDistributionY",
    fixedSizeKey: "_fixedHeight",
    sizeKey: "_height",
    paddingStartKey: "_paddingBottom",
    paddingEndKey: "_paddingTop"
  },
  [Axis.Z]: {
    layoutKey: "_layoutZ",
    alignmentKey: "_childAlignmentZ",
    stretchModeKey: "_stretchModeZ",
    anchorKey: "_anchorZ",
    spacingDistributionKey: "_spacingDistributionZ",
    fixedSizeKey: "_fixedDepth",
    sizeKey: "_depth",
    paddingStartKey: "_paddingBack",
    paddingEndKey: "_paddingFront"
  }
}

/**
 * A flexible 3D layout component that arranges child elements along a primary axis (X, Y, or Z),
 * with optional wrapping to secondary and tertiary axes.
 *
 * DirectionalLayout provides a high-level API for positioning children in 3D space with support for:
 * - **Primary Direction**: Arrange items horizontally (X), vertically (Y), or in depth (Z)
 * - **Wrapping**: Automatically wrap items to a secondary (and optionally tertiary) axis when they exceed the fixed size
 * - **Alignment**: Control how children are aligned along each axis
 * - **Padding**: Add spacing around the layout bounds on each side
 * - **Spacing**: Define gaps between consecutive children along each axis
 * - **Child sizing**: Optionally enforce uniform width, height, or depth for all children
 * - **Reverse ordering**: Reverse the arrangement order of children
 *
 * Internally, DirectionalLayout manages three {@link SingleAxisLayout} components (one per axis) that work together
 * to position children. All three layouts share the same children, allowing simultaneous positioning
 * along multiple axes (e.g. for wrapping).
 *
 * @example
 * ```typescript
 * // Create a horizontal layout with items aligned to the left
 * const directionalLayout = sceneObject.getComponent(DirectionalLayout.getTypeName());
 * directionalLayout.primaryDirection = Axis.X;
 * directionalLayout.childAlignmentX = HorizontalAlignment.Left;
 * directionalLayout.primarySpacing = 1.5;
 * directionalLayout.paddingLeft = 0.5;
 * directionalLayout.paddingRight = 0.5;
 *
 * // Add children to the layout
 * directionalLayout.addLayoutItems(myLayoutItems);
 * ```
 *
 * @remarks
 * - Wait for the {@link onInitialized} event before adding layout items or modifying properties
 * - Child elements must be wrapped in {@link LayoutItem} components
 *
 * @see {@link SingleAxisLayout} - The underlying layout engine for each axis
 * @see {@link LayoutItem} - The wrapper component for layout children
 */
@component
export class DirectionalLayout extends BaseScriptComponent implements NestableLayout {
  @ui.group_start("Primary Axis")
  @input
  @label("Direction")
  @widget(
    new ComboBoxWidget([
      new ComboBoxItem("Horizontal", "x"),
      new ComboBoxItem("Vertical", "y"),
      new ComboBoxItem("Depth", "z")
    ])
  )
  private _primaryDirection: string = Axis.X

  @input
  @label("Fixed Size")
  private _primarySizeFixed: boolean = false

  @input
  @label("Size")
  @showIf("_primarySizeFixed", true)
  private _primarySize: number = 3

  @input
  @label("Spacing")
  private _primarySpacing: number = 0

  @input
  @showIf("_primarySizeFixed", true)
  private _wrapToSecondaryAxis: boolean = false

  @ui.group_end
  @ui.group_start("Secondary Axis")
  @input
  @label("Secondary Direction (Must be perpendicular to the primary direction)")
  @showIf("_wrapToSecondaryAxis")
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
  @showIf("_wrapToSecondaryAxis", true)
  private _secondaryFixedSize: boolean = false

  @input
  @showIf("_secondaryFixedSize", true)
  private _secondarySize: number = 3

  @input
  @showIf("_wrapToSecondaryAxis")
  private _secondarySpacing: number = 1

  @input
  @showIf("_secondaryFixedSize", true)
  private _wrapToTertiaryAxis: boolean = false
  @ui.group_end
  @ui.group_start("Tertiary Axis")
  @input
  @label("Tertiary Direction (Must be perpendicular to both the primary and secondary directions)")
  @showIf("_wrapToTertiaryAxis")
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
  @showIf("_wrapToTertiaryAxis", true)
  private _tertiaryFixedSize: boolean = false

  @input
  @showIf("_tertiaryFixedSize", true)
  private _tertiarySize: number = 3

  @input
  @showIf("_wrapToTertiaryAxis")
  private _tertiarySpacing: number = 1
  @ui.group_end
  @ui.group_start("Padding")
  @input
  @label("Left")
  @showIf("_primaryDirection", "x")
  private _paddingLeft: number = 0
  @input
  @label("Right")
  @showIf("_primaryDirection", "x")
  private _paddingRight: number = 0
  @input
  @label("Bottom")
  @showIf("_primaryDirection", "y")
  private _paddingBottom: number = 0
  @input
  @label("Top")
  @showIf("_primaryDirection", "y")
  private _paddingTop: number = 0
  @input
  @label("Back")
  @showIf("_primaryDirection", "z")
  private _paddingBack: number = 0
  @input
  @label("Front")
  @showIf("_primaryDirection", "z")
  private _paddingFront: number = 0
  @ui.group_end
  @ui.group_start("Anchor")
  @hint("Anchor only applicable when primary size is fixed")
  @input
  @showIf("_primaryDirection", "x")
  @widget(
    new ComboBoxWidget([
      new ComboBoxItem("Left", "start"),
      new ComboBoxItem("Center", "center"),
      new ComboBoxItem("Right", "end")
    ])
  )
  private _anchorX: string = Anchor.Center
  @input
  @showIf("_primaryDirection", "y")
  @widget(
    new ComboBoxWidget([
      new ComboBoxItem("Bottom", "start"),
      new ComboBoxItem("Center", "center"),
      new ComboBoxItem("Top", "end")
    ])
  )
  private _anchorY: string = Anchor.Center
  @input
  @showIf("_primaryDirection", "z")
  @widget(
    new ComboBoxWidget([
      new ComboBoxItem("Back", "start"),
      new ComboBoxItem("Center", "center"),
      new ComboBoxItem("Front", "end")
    ])
  )
  private _anchorZ: string = Anchor.Center
  @ui.group_end
  @ui.group_start("Child Alignment")
  @input
  @hint("Horizontal alignment of children (X-axis).")
  @widget(
    new ComboBoxWidget([
      new ComboBoxItem("Left", "-"),
      new ComboBoxItem("Center", ""),
      new ComboBoxItem("Right", "+"),
      new ComboBoxItem("Stretch", "*")
    ])
  )
  @showIf("_primaryDirection", "x")
  private _childAlignmentX: string = HorizontalAlignment.Left

  @input
  @hint("Vertical alignment of children (Y-axis).")
  @widget(
    new ComboBoxWidget([
      new ComboBoxItem("Bottom", "-"),
      new ComboBoxItem("Center", ""),
      new ComboBoxItem("Top", "+"),
      new ComboBoxItem("Stretch", "*")
    ])
  )
  @showIf("_primaryDirection", "y")
  private _childAlignmentY: string = VerticalAlignment.Center

  @input
  @hint("Depth alignment of children (Z-axis).")
  @widget(
    new ComboBoxWidget([
      new ComboBoxItem("Back", "-"),
      new ComboBoxItem("Center", ""),
      new ComboBoxItem("Front", "+"),
      new ComboBoxItem("Stretch", "*")
    ])
  )
  @showIf("_primaryDirection", "z")
  private _childAlignmentZ: string = DepthAlignment.Center
  @ui.group_end
  @input
  @showIf("_childAlignmentX", "*")
  @hint("Stretch mode: Content stretches children to fill, Spacing distributes extra space between children.")
  @widget(new ComboBoxWidget([new ComboBoxItem("Content", "content"), new ComboBoxItem("Spacing", "spacing")]))
  private _stretchModeX: string = StretchMode.Content
  @input
  @showIf("_childAlignmentY", "*")
  @hint("Stretch mode: Content stretches children to fill, Spacing distributes extra space between children.")
  @widget(new ComboBoxWidget([new ComboBoxItem("Content", "content"), new ComboBoxItem("Spacing", "spacing")]))
  private _stretchModeY: string = StretchMode.Content
  @input
  @showIf("_childAlignmentZ", "*")
  @hint("Stretch mode: Content stretches children to fill, Spacing distributes extra space between children.")
  @widget(new ComboBoxWidget([new ComboBoxItem("Content", "content"), new ComboBoxItem("Spacing", "spacing")]))
  private _stretchModeZ: string = StretchMode.Content
  @input
  @showIf("_stretchModeX", "spacing")
  @hint("How to distribute extra space when using Stretch Spacing mode (X-axis).")
  @widget(
    new ComboBoxWidget([
      new ComboBoxItem("Space Between", "spaceBetween"),
      new ComboBoxItem("Space Evenly", "spaceEvenly"),
      new ComboBoxItem("Space Around", "spaceAround")
    ])
  )
  private _spacingDistributionX: string = SpacingDistribution.SpaceBetween
  @input
  @showIf("_stretchModeY", "spacing")
  @hint("How to distribute extra space when using Stretch Spacing mode (Y-axis).")
  @widget(
    new ComboBoxWidget([
      new ComboBoxItem("Space Between", "spaceBetween"),
      new ComboBoxItem("Space Evenly", "spaceEvenly"),
      new ComboBoxItem("Space Around", "spaceAround")
    ])
  )
  private _spacingDistributionY: string = SpacingDistribution.SpaceBetween
  @input
  @showIf("_stretchModeZ", "spacing")
  @hint("How to distribute extra space when using Stretch Spacing mode (Z-axis).")
  @widget(
    new ComboBoxWidget([
      new ComboBoxItem("Space Between", "spaceBetween"),
      new ComboBoxItem("Space Evenly", "spaceEvenly"),
      new ComboBoxItem("Space Around", "spaceAround")
    ])
  )
  private _spacingDistributionZ: string = SpacingDistribution.SpaceBetween

  @input
  @label("Reverse Children Items Order")
  private _reverse: boolean = false

  @ui.group_start("Child Size")
  @input
  @hint(
    "When enabled, child sizes are interpreted as fractions (0-1) of the layout size. Requires Fixed Width, Fixed Height, and Fixed Depth to all be enabled."
  )
  private _normalizedChildSize: boolean = false
  @input
  @label("Width")
  private _childWidth: number = 1
  @input
  @label("Height")
  private _childHeight: number = 1
  @input
  @label("Depth")
  private _childDepth: number = 1
  @ui.group_end

  // Underlying SingleAxisLayout components for each axis (created in onAwake)
  private _layoutX: SingleAxisLayout
  private _layoutY: SingleAxisLayout
  private _layoutZ: SingleAxisLayout

  // Initialization state
  private _initialized: boolean = false
  private _underlyingLayoutsInitialized: number = 0

  // Pending operations cache for pre-initialization calls
  private _pendingAdditions: {items: LayoutItem[]; startIndex?: number}[] | null = []
  private _pendingRemovals: LayoutItem[] | null = []

  // Tracks pending items and which layouts have confirmed each (fires event when all 3 axes confirm)
  private _pendingItemConfirmations: Map<LayoutItem, Set<Axis>> = new Map()

  // Item size change subscriptions (for firing onTotalItemsSizeChanged)
  private itemSizeSubscriptions: Map<LayoutItem, () => void> = new Map()

  // Cache of item sizes to optimize updates
  private readonly _itemSizes = new Map<LayoutItem, vec3>()

  // Deferred validation - LateUpdate event for end-of-frame validation
  // This allows temporary invalid states during property configuration
  private validationLateUpdateEvent: SceneEvent

  // Events
  private readonly onInitializedEvent = new ReplayEvent<void>()
  /**
   * Event fired when the DirectionalLayout has finished initialization.
   * Safe to access all properties and methods after this event fires.
   */
  public readonly onInitialized = this.onInitializedEvent.publicApi()

  private readonly onLayoutItemAddedEvent = new Event<LayoutItem[]>()
  public readonly onLayoutItemAdded = this.onLayoutItemAddedEvent.publicApi()
  private readonly onLayoutItemRemovedEvent = new Event<LayoutItem[]>()
  public readonly onLayoutItemRemoved = this.onLayoutItemRemovedEvent.publicApi()

  private readonly onDirectionChangedEvent = new Event<Axis>()
  public readonly onDirectionChanged = this.onDirectionChangedEvent.publicApi()

  private readonly onSizeChangedEvent = new Event<vec3>()
  /**
   * Event fired when the layout size (width, height, or depth) changes.
   * The event payload is a vec3(width, height, depth).
   */
  public readonly onSizeChanged = this.onSizeChangedEvent.publicApi()

  private readonly onTotalItemsSizeChangedEvent = new Event<vec3>()
  /**
   * Event fired when the total items size changes.
   * The event payload is a vec3 representing the total items size along each axis (x, y, z).
   * This includes the sizes of all layout items and spacing between them.
   */
  public readonly onTotalItemsSizeChanged = this.onTotalItemsSizeChangedEvent.publicApi()

  private _debug: boolean = false
  // Debug visualization
  private debugUpdateEvent: SceneEvent

  // Debounced items size update
  private _totalItemsSizeDirty: boolean = false
  private _totalItemsSizeUpdateEvent: SceneEvent

  private _lastFiredItemsSize: vec3 = vec3.zero()

  // Cached item sizes for optimization
  private _cachedItemsSizeNoPadding: vec3 = vec3.zero()
  private _itemsSizeDirty: AxisDirtyFlags = {x: true, y: true, z: true}

  // ═══════════════════════════════════════════════════════════════════════════
  // LAYOUT SIZE PROPERTIES
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Gets whether the horizontal layout has a fixed width.
   * True if X is the primary direction with fixed size, or if X is a wrapping axis with fixed size enabled.
   * @returns True if the layout has a fixed width, false otherwise.
   */
  public get fixedWidth(): boolean {
    return this.isFixedSizeForAxis(Axis.X)
  }

  /**
   * Sets whether the horizontal layout has a fixed width.
   * Effective if X is the primary direction or a wrapping axis.
   * @param value - True to use a fixed layout width, false for flexible sizing.
   */
  public set fixedWidth(value: boolean) {
    if (this._primaryDirection === Axis.X) {
      this.primarySizeFixed = value
    } else if (this.getSecondaryAxis() === Axis.X) {
      this.secondaryFixedSize = value
    } else if (this.getTertiaryAxis() === Axis.X) {
      this.tertiaryFixedSize = value
    }
  }

  /**
   * Gets whether the vertical layout has a fixed height.
   * True if Y is the primary direction with fixed size, or if Y is a wrapping axis with fixed size enabled.
   * @returns True if the layout has a fixed height, false otherwise.
   */
  public get fixedHeight(): boolean {
    return this.isFixedSizeForAxis(Axis.Y)
  }

  /**
   * Sets whether the vertical layout has a fixed height.
   * Effective if Y is the primary direction or a wrapping axis.
   * @param value - True to use a fixed layout height, false for flexible sizing.
   */
  public set fixedHeight(value: boolean) {
    if (this._primaryDirection === Axis.Y) {
      this.primarySizeFixed = value
    } else if (this.getSecondaryAxis() === Axis.Y) {
      this.secondaryFixedSize = value
    } else if (this.getTertiaryAxis() === Axis.Y) {
      this.tertiaryFixedSize = value
    }
  }

  /**
   * Gets whether the depth layout has a fixed depth.
   * True if Z is the primary direction with fixed size, or if Z is a wrapping axis with fixed size enabled.
   * @returns True if the layout has a fixed depth, false otherwise.
   */
  public get fixedDepth(): boolean {
    return this.isFixedSizeForAxis(Axis.Z)
  }

  /**
   * Sets whether the depth layout has a fixed depth.
   * Effective if Z is the primary direction or a wrapping axis.
   * @param value - True to use a fixed layout depth, false for flexible sizing.
   */
  public set fixedDepth(value: boolean) {
    if (this._primaryDirection === Axis.Z) {
      this.primarySizeFixed = value
    } else if (this.getSecondaryAxis() === Axis.Z) {
      this.secondaryFixedSize = value
    } else if (this.getTertiaryAxis() === Axis.Z) {
      this.tertiaryFixedSize = value
    }
  }

  /**
   * Gets the layout width (X-axis size).
   * Relevant when X is the primary direction or a wrapping axis with fixed size enabled.
   * @returns The layout width in local space centimeters.
   */
  public get width(): number {
    return this.getSizeForAxis(Axis.X)
  }

  /**
   * Sets the layout width (X-axis size).
   * Effective if X is the primary direction or a wrapping axis.
   * @param value - The layout width in local space centimeters (must be >= 0).
   * @throws Error if value is negative.
   */
  public set width(value: number) {
    if (this._primaryDirection === Axis.X) {
      this.primarySize = value
    } else if (this.getSecondaryAxis() === Axis.X) {
      this.secondarySize = value
    } else if (this.getTertiaryAxis() === Axis.X) {
      this.tertiarySize = value
    }
  }

  /**
   * Gets the layout height (Y-axis size).
   * Relevant when Y is the primary direction or a wrapping axis with fixed size enabled.
   * @returns The layout height in local space centimeters.
   */
  public get height(): number {
    return this.getSizeForAxis(Axis.Y)
  }

  /**
   * Sets the layout height (Y-axis size).
   * Effective if Y is the primary direction or a wrapping axis.
   * @param value - The layout height in local space centimeters (must be >= 0).
   * @throws Error if value is negative.
   */
  public set height(value: number) {
    if (this._primaryDirection === Axis.Y) {
      this.primarySize = value
    } else if (this.getSecondaryAxis() === Axis.Y) {
      this.secondarySize = value
    } else if (this.getTertiaryAxis() === Axis.Y) {
      this.tertiarySize = value
    }
  }

  /**
   * Gets the layout depth (Z-axis size).
   * Relevant when Z is the primary direction or a wrapping axis with fixed size enabled.
   * @returns The layout depth in local space centimeters.
   */
  public get depth(): number {
    return this.getSizeForAxis(Axis.Z)
  }

  /**
   * Sets the layout depth (Z-axis size).
   * Effective if Z is the primary direction or a wrapping axis.
   * @param value - The layout depth in local space centimeters (must be >= 0).
   * @throws Error if value is negative.
   */
  public set depth(value: number) {
    if (this._primaryDirection === Axis.Z) {
      this.primarySize = value
    } else if (this.getSecondaryAxis() === Axis.Z) {
      this.secondarySize = value
    } else if (this.getTertiaryAxis() === Axis.Z) {
      this.tertiarySize = value
    }
  }

  /**
   * Gets the layout size as a vec3 (width, height, depth).
   * @returns The layout size in local space centimeters.
   */
  public get layoutSize(): vec3 {
    const itemsSize = this.getTotalItemsSize(true)
    return new vec3(
      this.isFixedSizeForAxis(Axis.X) ? this.getSizeForAxis(Axis.X) : itemsSize.x,
      this.isFixedSizeForAxis(Axis.Y) ? this.getSizeForAxis(Axis.Y) : itemsSize.y,
      this.isFixedSizeForAxis(Axis.Z) ? this.getSizeForAxis(Axis.Z) : itemsSize.z
    )
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIMARY DIRECTION PROPERTIES
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Gets the current layout direction.
   * @returns The layout direction (Horizontal, Vertical, or Depth).
   */
  public get primaryDirection(): Axis {
    return this._primaryDirection as Axis
  }

  /**
   * Sets the layout direction.
   * Enables the specified direction and disables others.
   * @param value - The new layout direction.
   */
  public set primaryDirection(value: Axis) {
    if (this._primaryDirection === value) return
    const oldDirection = this._primaryDirection as Axis
    this._primaryDirection = value

    if (this._initialized) {
      // Update all axes based on new direction
      const oldLayout = this.getLayoutForAxis(oldDirection)
      oldLayout.autoAlignment = false

      const newLayout = this.getLayoutForAxis(value)
      newLayout.autoAlignment = true
      applyDirectionalAxisSettings(newLayout, this.getDirectionalAxisSettings(value))

      // Re-apply size configuration to all axes
      // The new primary axis will pick up the size settings, others will reset to flexible
      applyDirectionalSizeToAxis(
        this.getLayoutForAxis(oldDirection),
        this.isFixedSizeForAxis(oldDirection),
        this.getSizeForAxis(oldDirection)
      )
      applyDirectionalSizeToAxis(
        this.getLayoutForAxis(value),
        this.isFixedSizeForAxis(value),
        this.getSizeForAxis(value)
      )

      // Reconfigure wrap when direction changes
      if (this._wrapToSecondaryAxis) {
        this.applyWrapConfiguration()
      }
      this.markValidationDirty()
      this.markTotalItemsSizeDirty()

      this.onDirectionChangedEvent.invoke(value)
    }
  }

  /**
   * Gets whether the layout has a fixed size along its primary axis.
   * @returns True if the primary size is fixed, false otherwise.
   */
  public get primarySizeFixed(): boolean {
    return this._primarySizeFixed
  }

  /**
   * Sets whether the layout has a fixed size along its primary axis.
   * @param value - True to use a fixed size, false for flexible sizing.
   */
  public set primarySizeFixed(value: boolean) {
    if (this._primarySizeFixed === value) return
    this._primarySizeFixed = value
    if (this._initialized) {
      this.applyFixedSizeChangeForAxis(this._primaryDirection as Axis)
    }
  }

  /**
   * Gets the layout size along the primary axis.
   * @returns The layout size in local space centimeters.
   */
  public get primarySize(): number {
    return this._primarySize
  }

  /**
   * Sets the layout size along the primary axis.
   * @param value - The layout size in local space centimeters (must be >= 0).
   * @throws Error if value is negative.
   */
  public set primarySize(value: number) {
    validateNonNegative(value, "Primary size")
    if (this._primarySize === value) return
    this._primarySize = value
    if (this._initialized) {
      this.applyLayoutSizeChangeForAxis(this._primaryDirection as Axis)
    }
  }

  /**
   * Gets the spacing between children along the primary axis.
   * @returns The spacing in local space centimeters.
   */
  public get primarySpacing(): number {
    return this._primarySpacing
  }

  /**
   * Sets the spacing between children along the primary axis.
   * @param value - The spacing in local space centimeters (must be >= 0).
   * @throws Error if value is negative.
   */
  public set primarySpacing(value: number) {
    validateNonNegative(value, "Primary spacing")
    const axis = this._primaryDirection as Axis
    const layout = this[DIRECTIONAL_AXIS_CONFIG[axis].layoutKey] as SingleAxisLayout
    const alignment = this[DIRECTIONAL_AXIS_CONFIG[axis].alignmentKey as keyof this] as string
    const stretchMode = this[DIRECTIONAL_AXIS_CONFIG[axis].stretchModeKey as keyof this] as string
    if (alignment === AlignmentConstants.Stretch && stretchMode === StretchMode.Spacing) {
      log.w(
        "Spacing value has no effect when alignment is set to 'Stretch Spacing'. Spacing is dynamically calculated based on spacingDistribution."
      )
    }
    // Apply to current primary axis
    if (this._primarySpacing === value) return
    this._primarySpacing = value

    if (this._initialized) {
      layout.spacing = value
      // If NOT (alignment is Stretch AND mode is Stretch Spacing), mark dirty
      if (alignment !== AlignmentConstants.Stretch || stretchMode !== StretchMode.Spacing) {
        this.markTotalItemsSizeDirty(axis)
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // WRAP PROPERTIES (SECONDARY AXIS)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Gets whether wrapping is enabled.
   * When enabled, items that exceed the layout size wrap to new lines.
   * @returns True if wrapping is enabled, false otherwise.
   */
  public get wrapToSecondaryAxis(): boolean {
    return this._wrapToSecondaryAxis
  }

  /**
   * Sets whether wrapping is enabled.
   * When enabled, items that exceed the layout size wrap to new lines
   * in the specified wrap direction.
   * Requires a fixed layout size on the primary axis.
   * @param value - True to enable wrapping, false to disable.
   */
  public set wrapToSecondaryAxis(value: boolean) {
    if (this._wrapToSecondaryAxis === value) return
    this._wrapToSecondaryAxis = value

    if (this._initialized) {
      this.applyWrapConfiguration()
      this.markValidationDirty()
      this.markTotalItemsSizeDirty()
    }
  }

  /**
   * Gets the secondary (wrap) direction.
   * Specifies the direction in which items wrap to new lines.
   * @returns The secondary direction (e.g., WrapDirection.Down, WrapDirection.Right).
   */
  public get secondaryDirection(): WrapDirection {
    return this._secondaryDirection as WrapDirection
  }

  /**
   * Sets the secondary (wrap) direction.
   * Specifies the direction in which items wrap to new lines.
   * @param value - The secondary direction to use.
   */
  public set secondaryDirection(value: WrapDirection) {
    if (this._secondaryDirection === value) return
    this._secondaryDirection = value as string

    if (this._initialized && this._wrapToSecondaryAxis) {
      this.applyWrapConfiguration()
      this.markValidationDirty()
      this.markTotalItemsSizeDirty()
    }
  }

  /**
   * Gets whether the layout has a fixed size along its secondary (wrap) axis.
   * @returns True if the secondary size is fixed, false otherwise.
   */
  public get secondaryFixedSize(): boolean {
    return this._secondaryFixedSize
  }

  /**
   * Sets whether the layout has a fixed size along its secondary (wrap) axis.
   * @param value - True to use a fixed size, false for flexible sizing.
   */
  public set secondaryFixedSize(value: boolean) {
    if (this._secondaryFixedSize === value) return
    this._secondaryFixedSize = value

    const secondaryAxis = this.getSecondaryAxis()
    if (this._initialized && secondaryAxis !== undefined) {
      this.applyFixedSizeChangeForAxis(secondaryAxis)
    }
  }

  /**
   * Gets the layout size along the secondary (wrap) axis.
   * @returns The layout size in local space centimeters.
   */
  public get secondarySize(): number {
    return this._secondarySize
  }

  /**
   * Sets the layout size along the secondary (wrap) axis.
   * @param value - The layout size in local space centimeters (must be >= 0).
   * @throws Error if value is negative.
   */
  public set secondarySize(value: number) {
    validateNonNegative(value, "Secondary size")
    if (this._secondarySize === value) return
    this._secondarySize = value

    const secondaryAxis = this.getSecondaryAxis()
    if (this._initialized && secondaryAxis !== undefined) {
      this.applyLayoutSizeChangeForAxis(secondaryAxis)
    }
  }

  /**
   * Gets the spacing between wrapped lines (secondary axis).
   * @returns The secondary spacing in local space centimeters.
   */
  public get secondarySpacing(): number {
    return this._secondarySpacing
  }

  /**
   * Sets the spacing between wrapped lines (secondary axis).
   * Only applies when wrapping is enabled.
   * @param value - The secondary spacing in local space centimeters (must be >= 0).
   * @throws Error if value is negative.
   */
  public set secondarySpacing(value: number) {
    validateNonNegative(value, "Secondary spacing")
    if (this._secondarySpacing === value) return
    this._secondarySpacing = value

    if (this._initialized && this._wrapToSecondaryAxis) {
      this.applyWrapConfiguration()
      this.markTotalItemsSizeDirty()
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // WRAP PROPERTIES (TERTIARY AXIS)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Gets whether wrapping to the tertiary axis is enabled.
   * @returns True if tertiary wrapping is enabled, false otherwise.
   */
  public get wrapToTertiaryAxis(): boolean {
    return this._wrapToTertiaryAxis
  }

  /**
   * Sets whether wrapping to the tertiary axis is enabled.
   * @param value - True to enable tertiary wrapping, false to disable.
   */
  public set wrapToTertiaryAxis(value: boolean) {
    if (this._wrapToTertiaryAxis === value) return
    this._wrapToTertiaryAxis = value

    if (this._initialized) {
      this.applyWrapConfiguration()
      this.markValidationDirty()
      this.markTotalItemsSizeDirty()
    }
  }

  /**
   * Gets the tertiary direction.
   * Specifies the direction in which items wrap to new layers.
   * @returns The tertiary direction.
   */
  public get tertiaryDirection(): WrapDirection {
    return this._tertiaryDirection as WrapDirection
  }

  /**
   * Sets the tertiary direction.
   * @param value - The tertiary direction to use.
   */
  public set tertiaryDirection(value: WrapDirection) {
    if (this._tertiaryDirection === value) return
    this._tertiaryDirection = value as string

    if (this._initialized && this._wrapToTertiaryAxis) {
      this.applyWrapConfiguration()
      this.markValidationDirty()
      this.markTotalItemsSizeDirty()
    }
  }

  /**
   * Gets whether the layout has a fixed size along its tertiary axis.
   * @returns True if the tertiary size is fixed, false otherwise.
   */
  public get tertiaryFixedSize(): boolean {
    return this._tertiaryFixedSize
  }

  /**
   * Sets whether the layout has a fixed size along its tertiary axis.
   * @param value - True to use a fixed size, false for flexible sizing.
   */
  public set tertiaryFixedSize(value: boolean) {
    if (this._tertiaryFixedSize === value) return
    this._tertiaryFixedSize = value

    const tertiaryAxis = this.getTertiaryAxis()
    if (this._initialized && tertiaryAxis !== undefined) {
      this.applyFixedSizeChangeForAxis(tertiaryAxis)
    }
  }

  /**
   * Gets the layout size along the tertiary axis.
   * @returns The layout size in local space centimeters.
   */
  public get tertiarySize(): number {
    return this._tertiarySize
  }

  /**
   * Sets the layout size along the tertiary axis.
   * @param value - The layout size in local space centimeters (must be >= 0).
   * @throws Error if value is negative.
   */
  public set tertiarySize(value: number) {
    validateNonNegative(value, "Tertiary size")
    if (this._tertiarySize === value) return
    this._tertiarySize = value

    const tertiaryAxis = this.getTertiaryAxis()
    if (this._initialized && tertiaryAxis !== undefined) {
      this.applyLayoutSizeChangeForAxis(tertiaryAxis)
    }
  }

  /**
   * Gets the spacing between wrapped layers (tertiary axis).
   * @returns The tertiary spacing in local space centimeters.
   */
  public get tertiarySpacing(): number {
    return this._tertiarySpacing
  }

  /**
   * Sets the spacing between wrapped layers (tertiary axis).
   * Only applies when tertiary wrapping is enabled.
   * @param value - The tertiary spacing in local space centimeters (must be >= 0).
   * @throws Error if value is negative.
   */
  public set tertiarySpacing(value: number) {
    validateNonNegative(value, "Tertiary spacing")
    if (this._tertiarySpacing === value) return
    this._tertiarySpacing = value

    if (this._initialized && this._wrapToTertiaryAxis) {
      this.applyWrapConfiguration()
      this.markTotalItemsSizeDirty()
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PADDING PROPERTIES
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Gets the left padding (X-axis start padding).
   * @returns The padding in local space centimeters.
   */
  public get paddingLeft(): number {
    return this._paddingLeft
  }

  /**
   * Sets the left padding (X-axis start padding).
   * Propagates to the underlying layout when the primary direction is Horizontal.
   * @param value - The padding in local space centimeters (must be >= 0).
   * @throws Error if value is negative.
   */
  public set paddingLeft(value: number) {
    validateNonNegative(value, "Padding left")
    if (this._paddingLeft === value) return
    this._paddingLeft = value

    if (this._initialized && this._primaryDirection === Axis.X) {
      this._layoutX.paddingStart = value
      if (this.isFixedSizeForAxis(Axis.X) && this._childAlignmentX === AlignmentConstants.Stretch) {
        this.markTotalItemsSizeDirty(Axis.X)
      }
    }
  }

  /**
   * Gets the right padding (X-axis end padding).
   * @returns The padding in local space centimeters.
   */
  public get paddingRight(): number {
    return this._paddingRight
  }

  /**
   * Sets the right padding (X-axis end padding).
   * Propagates to the underlying layout when the primary direction is Horizontal.
   * @param value - The padding in local space centimeters (must be >= 0).
   * @throws Error if value is negative.
   */
  public set paddingRight(value: number) {
    validateNonNegative(value, "Padding right")
    if (this._paddingRight === value) return
    this._paddingRight = value

    if (this._initialized && this._primaryDirection === Axis.X) {
      this._layoutX.paddingEnd = value
      if (this.isFixedSizeForAxis(Axis.X) && this._childAlignmentX === AlignmentConstants.Stretch) {
        this.markTotalItemsSizeDirty(Axis.X)
      }
    }
  }

  /**
   * Gets the bottom padding (Y-axis start padding).
   * @returns The padding in local space centimeters.
   */
  public get paddingBottom(): number {
    return this._paddingBottom
  }

  /**
   * Sets the bottom padding (Y-axis start padding).
   * Propagates to the underlying layout when the primary direction is Vertical.
   * @param value - The padding in local space centimeters (must be >= 0).
   * @throws Error if value is negative.
   */
  public set paddingBottom(value: number) {
    validateNonNegative(value, "Padding bottom")
    if (this._paddingBottom === value) return
    this._paddingBottom = value

    if (this._initialized && this._primaryDirection === Axis.Y) {
      this._layoutY.paddingStart = value
      if (this.isFixedSizeForAxis(Axis.Y) && this._childAlignmentY === AlignmentConstants.Stretch) {
        this.markTotalItemsSizeDirty(Axis.Y)
      }
    }
  }

  /**
   * Gets the top padding (Y-axis end padding).
   * @returns The padding in local space centimeters.
   */
  public get paddingTop(): number {
    return this._paddingTop
  }

  /**
   * Sets the top padding (Y-axis end padding).
   * Propagates to the underlying layout when the primary direction is Vertical.
   * @param value - The padding in local space centimeters (must be >= 0).
   * @throws Error if value is negative.
   */
  public set paddingTop(value: number) {
    validateNonNegative(value, "Padding top")
    if (this._paddingTop === value) return
    this._paddingTop = value

    if (this._initialized && this._primaryDirection === Axis.Y) {
      this._layoutY.paddingEnd = value
      if (this.isFixedSizeForAxis(Axis.Y) && this._childAlignmentY === AlignmentConstants.Stretch) {
        this.markTotalItemsSizeDirty(Axis.Y)
      }
    }
  }

  /**
   * Gets the back padding (Z-axis start padding).
   * @returns The padding in local space centimeters.
   */
  public get paddingBack(): number {
    return this._paddingBack
  }

  /**
   * Sets the back padding (Z-axis start padding).
   * Propagates to the underlying layout when the primary direction is Depth.
   * @param value - The padding in local space centimeters (must be >= 0).
   * @throws Error if value is negative.
   */
  public set paddingBack(value: number) {
    validateNonNegative(value, "Padding back")
    if (this._paddingBack === value) return
    this._paddingBack = value

    if (this._initialized && this._primaryDirection === Axis.Z) {
      this._layoutZ.paddingStart = value
      if (this.isFixedSizeForAxis(Axis.Z) && this._childAlignmentZ === AlignmentConstants.Stretch) {
        this.markTotalItemsSizeDirty(Axis.Z)
      }
    }
  }

  /**
   * Gets the front padding (Z-axis end padding).
   * @returns The padding in local space centimeters.
   */
  public get paddingFront(): number {
    return this._paddingFront
  }

  /**
   * Sets the front padding (Z-axis end padding).
   * Propagates to the underlying layout when the primary direction is Depth.
   * @param value - The padding in local space centimeters (must be >= 0).
   * @throws Error if value is negative.
   */
  public set paddingFront(value: number) {
    validateNonNegative(value, "Padding front")
    if (this._paddingFront === value) return
    this._paddingFront = value

    if (this._initialized && this._primaryDirection === Axis.Z) {
      this._layoutZ.paddingEnd = value
      if (this.isFixedSizeForAxis(Axis.Z) && this._childAlignmentZ === AlignmentConstants.Stretch) {
        this.markTotalItemsSizeDirty(Axis.Z)
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ANCHOR PROPERTIES
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Gets the horizontal anchor position (X-axis).
   * Controls where items are anchored within the fixed-size layout.
   * Only has effect when the primary size is fixed.
   * @returns The anchor position (Start, Center, or End).
   */
  public get anchorX(): Anchor {
    return this._anchorX as Anchor
  }

  /**
   * Sets the horizontal anchor position (X-axis).
   * Determines where items are positioned within the fixed-size layout.
   * Only has effect when the primary size is fixed.
   * @param value - The anchor position to use.
   * @throws Error if value is not a valid Anchor.
   */
  public set anchorX(value: Anchor) {
    validateAnchor(value, "Anchor X")
    if (this._anchorX === value) return
    this._anchorX = value

    if (!this._primarySizeFixed) {
      log.w("Anchor X has no effect when primary size is not fixed.")
    }

    if (this._initialized) {
      this._layoutX.anchor = value
      this.markValidationDirty()
    }
  }

  /**
   * Gets the vertical anchor position (Y-axis).
   * Controls where items are anchored within the fixed-size layout.
   * Only has effect when the primary size is fixed.
   * @returns The anchor position (Start, Center, or End).
   */
  public get anchorY(): Anchor {
    return this._anchorY as Anchor
  }

  /**
   * Sets the vertical anchor position (Y-axis).
   * Determines where items are positioned within the fixed-size layout.
   * Only has effect when the primary size is fixed.
   * @param value - The anchor position to use.
   * @throws Error if value is not a valid Anchor.
   */
  public set anchorY(value: Anchor) {
    validateAnchor(value, "Anchor Y")
    if (this._anchorY === value) return
    this._anchorY = value

    if (!this._primarySizeFixed) {
      log.w("Anchor Y has no effect when primary size is not fixed.")
    }

    if (this._initialized) {
      this._layoutY.anchor = value
      this.markValidationDirty()
    }
  }

  /**
   * Gets the depth anchor position (Z-axis).
   * Controls where items are anchored within the fixed-size layout.
   * Only has effect when the primary size is fixed.
   * @returns The anchor position (Start, Center, or End).
   */
  public get anchorZ(): Anchor {
    return this._anchorZ as Anchor
  }

  /**
   * Sets the depth anchor position (Z-axis).
   * Determines where items are positioned within the fixed-size layout.
   * Only has effect when the primary size is fixed.
   * @param value - The anchor position to use.
   * @throws Error if value is not a valid Anchor.
   */
  public set anchorZ(value: Anchor) {
    validateAnchor(value, "Anchor Z")
    if (this._anchorZ === value) return
    this._anchorZ = value

    if (!this._primarySizeFixed) {
      log.w("Anchor Z has no effect when primary size is not fixed.")
    }

    if (this._initialized) {
      this._layoutZ.anchor = value
      this.markValidationDirty()
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CHILD ALIGNMENT PROPERTIES
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Gets the horizontal alignment of children (X-axis).
   * @returns The horizontal alignment (Left, Center, Right, or Stretch).
   */
  public get childAlignmentX(): HorizontalAlignment {
    return this._childAlignmentX as HorizontalAlignment
  }

  /**
   * Sets the horizontal alignment of children (X-axis).
   * Only takes effect when the primary direction is Horizontal.
   * @param value - The horizontal alignment to use.
   */
  public set childAlignmentX(value: HorizontalAlignment) {
    if (this._childAlignmentX === value) return
    const oldValue = this._childAlignmentX
    this._childAlignmentX = value
    if (this._initialized) {
      this.applyAlignmentChangeForAxis(Axis.X, value, oldValue)
    }
  }

  /**
   * Gets the vertical alignment of children (Y-axis).
   * @returns The vertical alignment (Bottom, Center, Top, or Stretch).
   */
  public get childAlignmentY(): VerticalAlignment {
    return this._childAlignmentY as VerticalAlignment
  }

  /**
   * Sets the vertical alignment of children (Y-axis).
   * Only takes effect when the primary direction is Vertical.
   * @param value - The vertical alignment to use.
   */
  public set childAlignmentY(value: VerticalAlignment) {
    if (this._childAlignmentY === value) return
    const oldValue = this._childAlignmentY
    this._childAlignmentY = value
    if (this._initialized) {
      this.applyAlignmentChangeForAxis(Axis.Y, value, oldValue)
    }
  }

  /**
   * Gets the depth alignment of children (Z-axis).
   * @returns The depth alignment (Back, Center, Front, or Stretch).
   */
  public get childAlignmentZ(): DepthAlignment {
    return this._childAlignmentZ as DepthAlignment
  }

  /**
   * Sets the depth alignment of children (Z-axis).
   * Only takes effect when the primary direction is Depth.
   * @param value - The depth alignment to use.
   */
  public set childAlignmentZ(value: DepthAlignment) {
    if (this._childAlignmentZ === value) return
    const oldValue = this._childAlignmentZ
    this._childAlignmentZ = value
    if (this._initialized) {
      this.applyAlignmentChangeForAxis(Axis.Z, value, oldValue)
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STRETCH MODE PROPERTIES
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Gets the stretch mode for the X-axis.
   * Only applies when horizontal alignment is set to Stretch.
   * @returns The stretch mode (Content or Spacing).
   */
  public get stretchModeX(): StretchMode {
    return this._stretchModeX as StretchMode
  }

  /**
   * Sets the stretch mode for the X-axis.
   * - Content: Stretches children to fill the layout size
   * - Spacing: Distributes extra space between children
   * @param value - The stretch mode to use.
   */
  public set stretchModeX(value: StretchMode) {
    if (this._stretchModeX === value) return
    this._stretchModeX = value

    if (
      this._initialized &&
      this._childAlignmentX === AlignmentConstants.Stretch &&
      this._primaryDirection === Axis.X
    ) {
      applyDirectionalAxisSettings(this._layoutX, this.getDirectionalAxisSettings(Axis.X))
      this.markValidationDirty()
      this.markTotalItemsSizeDirty(Axis.X)
    }
  }

  /**
   * Gets the stretch mode for the Y-axis.
   * Only applies when vertical alignment is set to Stretch.
   * @returns The stretch mode (Content or Spacing).
   */
  public get stretchModeY(): StretchMode {
    return this._stretchModeY as StretchMode
  }

  /**
   * Sets the stretch mode for the Y-axis.
   * - Content: Stretches children to fill the layout size
   * - Spacing: Distributes extra space between children
   * @param value - The stretch mode to use.
   */
  public set stretchModeY(value: StretchMode) {
    if (this._stretchModeY === value) return
    this._stretchModeY = value

    if (
      this._initialized &&
      this._childAlignmentY === AlignmentConstants.Stretch &&
      this._primaryDirection === Axis.Y
    ) {
      applyDirectionalAxisSettings(this._layoutY, this.getDirectionalAxisSettings(Axis.Y))
      this.markValidationDirty()
      this.markTotalItemsSizeDirty(Axis.Y)
    }
  }

  /**
   * Gets the stretch mode for the Z-axis.
   * Only applies when depth alignment is set to Stretch.
   * @returns The stretch mode (Content or Spacing).
   */
  public get stretchModeZ(): StretchMode {
    return this._stretchModeZ as StretchMode
  }

  /**
   * Sets the stretch mode for the Z-axis.
   * - Content: Stretches children to fill the layout size
   * - Spacing: Distributes extra space between children
   * @param value - The stretch mode to use.
   */
  public set stretchModeZ(value: StretchMode) {
    if (this._stretchModeZ === value) return
    this._stretchModeZ = value

    if (
      this._initialized &&
      this._childAlignmentZ === AlignmentConstants.Stretch &&
      this._primaryDirection === Axis.Z
    ) {
      applyDirectionalAxisSettings(this._layoutZ, this.getDirectionalAxisSettings(Axis.Z))
      this.markValidationDirty()
      this.markTotalItemsSizeDirty(Axis.Z)
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SPACING DISTRIBUTION PROPERTIES (for Stretch Spacing mode)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Gets the spacing distribution mode for the X-axis.
   * Only applies when horizontal alignment is Stretch and stretch mode is Spacing.
   * @returns The spacing distribution mode.
   */
  public get spacingDistributionX(): SpacingDistribution {
    return this._spacingDistributionX as SpacingDistribution
  }

  /**
   * Sets the spacing distribution mode for the X-axis.
   * Determines how extra space is distributed when stretch mode is Spacing.
   * - "spaceBetween": First and last items at edges, equal space between items
   * - "spaceEvenly": Equal space everywhere, including before first and after last item
   * - "spaceAround": Half space at edges, full space between items
   * @param value - The spacing distribution mode to use.
   */
  public set spacingDistributionX(value: SpacingDistribution) {
    if (this._spacingDistributionX === value) return
    this._spacingDistributionX = value

    if (
      this._initialized &&
      this._childAlignmentX === AlignmentConstants.Stretch &&
      this._stretchModeX === StretchMode.Spacing
    ) {
      this._layoutX.spacingDistribution = value
      this.markValidationDirty()
    }
  }

  /**
   * Gets the spacing distribution mode for the Y-axis.
   * Only applies when vertical alignment is Stretch and stretch mode is Spacing.
   * @returns The spacing distribution mode.
   */
  public get spacingDistributionY(): SpacingDistribution {
    return this._spacingDistributionY as SpacingDistribution
  }

  /**
   * Sets the spacing distribution mode for the Y-axis.
   * Determines how extra space is distributed when stretch mode is Spacing.
   * - "spaceBetween": First and last items at edges, equal space between items
   * - "spaceEvenly": Equal space everywhere, including before first and after last item
   * - "spaceAround": Half space at edges, full space between items
   * @param value - The spacing distribution mode to use.
   */
  public set spacingDistributionY(value: SpacingDistribution) {
    if (this._spacingDistributionY === value) return
    this._spacingDistributionY = value

    if (
      this._initialized &&
      this._childAlignmentY === AlignmentConstants.Stretch &&
      this._stretchModeY === StretchMode.Spacing
    ) {
      this._layoutY.spacingDistribution = value
      this.markValidationDirty()
    }
  }

  /**
   * Gets the spacing distribution mode for the Z-axis.
   * Only applies when depth alignment is Stretch and stretch mode is Spacing.
   * @returns The spacing distribution mode.
   */
  public get spacingDistributionZ(): SpacingDistribution {
    return this._spacingDistributionZ as SpacingDistribution
  }

  /**
   * Sets the spacing distribution mode for the Z-axis.
   * Determines how extra space is distributed when stretch mode is Spacing.
   * - "spaceBetween": First and last items at edges, equal space between items
   * - "spaceEvenly": Equal space everywhere, including before first and after last item
   * - "spaceAround": Half space at edges, full space between items
   * @param value - The spacing distribution mode to use.
   */
  public set spacingDistributionZ(value: SpacingDistribution) {
    if (this._spacingDistributionZ === value) return
    this._spacingDistributionZ = value

    if (
      this._initialized &&
      this._childAlignmentZ === AlignmentConstants.Stretch &&
      this._stretchModeZ === StretchMode.Spacing
    ) {
      this._layoutZ.spacingDistribution = value
      this.markValidationDirty()
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // REVERSE PROPERTY
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Gets whether the layout order is reversed.
   * When enabled, children are arranged in reverse order along enabled axes.
   * @returns True if layout order is reversed, false for normal order.
   */
  public get reverse(): boolean {
    return this._reverse
  }

  /**
   * Sets whether the layout order is reversed.
   * When enabled, children are arranged in reverse order along enabled axes.
   * @param value - True to reverse layout order, false for normal order.
   */
  public set reverse(value: boolean) {
    if (this._reverse === value) return
    this._reverse = value

    if (this._initialized) {
      if (this._primaryDirection === Axis.X) {
        this._layoutX.reverse = DIRECTIONAL_ALIGNMENT_MAPPING[this._childAlignmentX].defaultReverse !== value
      }
      if (this._primaryDirection === Axis.Y) {
        this._layoutY.reverse = DIRECTIONAL_ALIGNMENT_MAPPING[this._childAlignmentY].defaultReverse !== value
      }
      if (this._primaryDirection === Axis.Z) {
        this._layoutZ.reverse = DIRECTIONAL_ALIGNMENT_MAPPING[this._childAlignmentZ].defaultReverse !== value
      }
      if (this._wrapToSecondaryAxis) {
        this.markTotalItemsSizeDirty()
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CHILD SIZE PROPERTIES
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Gets whether normalized child sizing is enabled.
   * @returns True if child sizes are interpreted as fractions (0-1) of layout sizes.
   */
  public get normalizedChildSize(): boolean {
    return this._normalizedChildSize
  }

  /**
   * Sets whether normalized child sizing is enabled.
   * When enabled, childWidth/childHeight/childDepth are interpreted as fractions (0-1).
   * Requires all three fixed sizes (fixedWidth, fixedHeight, fixedDepth) to be enabled.
   * @param value - True for normalized sizing, false for absolute sizing.
   */
  public set normalizedChildSize(value: boolean) {
    if (this._normalizedChildSize === value) return
    this._normalizedChildSize = value

    if (this._initialized) {
      this._layoutX.normalizedChildSize = value
      this._layoutY.normalizedChildSize = value
      this._layoutZ.normalizedChildSize = value
      this.markValidationDirty()
      this.markTotalItemsSizeDirty()
    }
  }

  /**
   * Gets the width (X-axis size) to apply to children.
   * @returns The width in local space centimeters.
   */
  public get childWidth(): number {
    return this._childWidth
  }

  /**
   * Sets the width (X-axis size) to apply to children.
   * @param value - The width in local space centimeters (must be >= 0).
   * @throws Error if value is negative.
   */
  public set childWidth(value: number) {
    validateNonNegative(value, "Child width")
    if (this._childWidth === value) return
    this._childWidth = value

    if (this._initialized) {
      this._layoutX.childSize = value
      // Only need validation when normalizedChildSize is enabled (validates child sizes <= 1)
      if (this._normalizedChildSize) {
        this.markValidationDirty()
      }
    }
  }

  /**
   * Gets the height (Y-axis size) to apply to children.
   * @returns The height in local space centimeters.
   */
  public get childHeight(): number {
    return this._childHeight
  }

  /**
   * Sets the height (Y-axis size) to apply to children.
   * @param value - The height in local space centimeters (must be >= 0).
   * @throws Error if value is negative.
   */
  public set childHeight(value: number) {
    validateNonNegative(value, "Child height")
    if (this._childHeight === value) return
    this._childHeight = value

    if (this._initialized) {
      this._layoutY.childSize = value
      // Only need validation when normalizedChildSize is enabled (validates child sizes <= 1)
      if (this._normalizedChildSize) {
        this.markValidationDirty()
      }
    }
  }

  /**
   * Gets the depth (Z-axis size) to apply to children.
   * @returns The depth in local space centimeters.
   */
  public get childDepth(): number {
    return this._childDepth
  }

  /**
   * Sets the depth (Z-axis size) to apply to children.
   * @param value - The depth in local space centimeters (must be >= 0).
   * @throws Error if value is negative.
   */
  public set childDepth(value: number) {
    validateNonNegative(value, "Child depth")
    if (this._childDepth === value) return
    this._childDepth = value

    if (this._initialized) {
      this._layoutZ.childSize = value
      // Only need validation when normalizedChildSize is enabled (validates child sizes <= 1)
      if (this._normalizedChildSize) {
        this.markValidationDirty()
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // READ-ONLY PROPERTIES
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Gets whether the DirectionalLayout has been initialized.
   * Layout items and properties can be safely modified after initialization.
   * @returns True if the DirectionalLayout has been initialized, false otherwise.
   */
  public get initialized(): boolean {
    return this._initialized
  }

  /**
   * Gets whether debug visualization is enabled.
   * When enabled, draws a sphere at the origin and direction lines for each enabled axis.
   * @returns True if debug mode is enabled, false otherwise.
   */
  public get debug(): boolean {
    return this._debug
  }

  /**
   * Sets whether debug visualization is enabled.
   * When enabled, renders debug bounds and direction indicators via the LayoutDebugDrawer utility.
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
  // PUBLIC METHODS
  // ═══════════════════════════════════════════════════════════════════════════
  /**
   * Adds multiple LayoutItems to the layout.
   * The items will be reparented to the layout and managed by all enabled axis layouts.
   *
   * If called before initialization, items that are not already children of the DirectionalLayout
   * will be cached and added during initialization. Items that are already children will
   * be found automatically by the underlying SingleAxisLayout.
   *
   * @param layoutItems - The array of LayoutItems to add.
   * @param startIndex - Optional index at which to start inserting the items.
   * @returns The list of items that were successfully added or queued for addition.
   *          Returns an empty array if all items are duplicates.
   *          When called before initialization, returns items queued for addition (excluding existing children).
   */
  public addLayoutItems(layoutItems: LayoutItem[], startIndex?: number): LayoutItem[] {
    if (!this._initialized) {
      // Filter out items that are already children of this object
      // (they will be found automatically by SingleAxisLayout during initialization)
      const nonChildLayoutItems = layoutItems.filter((item) => item.sceneObject.getParent() !== this.sceneObject)
      if (nonChildLayoutItems.length > 0) {
        this._pendingAdditions.push({items: nonChildLayoutItems, startIndex: startIndex})
      }
      return nonChildLayoutItems
    }

    // Add to all three layouts - they share the same children
    // parentToLayout is idempotent, so calling it multiple times is safe
    const addedX = this._layoutX.addLayoutItems(layoutItems, startIndex)
    const addedY = this._layoutY.addLayoutItems(layoutItems, startIndex)
    const addedZ = this._layoutZ.addLayoutItems(layoutItems, startIndex)

    // Calculate intersection of items successfully added to all three layouts
    const addedItems = getThreeAxisIntersection(addedX, addedY, addedZ)

    // Subscribe to size changes for each item
    for (const item of addedItems) {
      this.subscribeToItemSizeChange(item)
    }

    // Queue items for notification after layout operations complete
    trackPendingItems(addedItems, this._pendingItemConfirmations)
    this.markTotalItemsSizeDirty()

    return addedItems
  }

  /**
   * Removes multiple LayoutItems from the layout.
   * The items will be unregistered and restored to their original parents.
   *
   * If called before initialization, items will be cached and removed during initialization.
   *
   * @param layoutItems - The array of LayoutItems to remove.
   * @returns An array of successfully removed LayoutItems. Returns empty array if called before initialization.
   */
  public removeLayoutItems(layoutItems: LayoutItem[]): LayoutItem[] {
    if (!this._initialized) {
      // Cache items for removal during initialization
      this._pendingRemovals.push(...layoutItems)
      return [] // Nothing removed yet, return empty array
    }

    this._layoutZ.removeLayoutItems(layoutItems)
    this._layoutY.removeLayoutItems(layoutItems)
    const removed = this._layoutX.removeLayoutItems(layoutItems)

    if (removed.length > 0) {
      // Unsubscribe from size changes for removed items
      for (const item of removed) {
        this.unsubscribeFromItemSizeChange(item)
      }

      // Filter out items that were pending add - they shouldn't fire removed event since added never fired
      const itemsToNotifyRemoved = filterPendingRemovals(removed, this._pendingItemConfirmations)

      if (itemsToNotifyRemoved.length > 0) {
        this.onLayoutItemRemovedEvent.invoke(itemsToNotifyRemoved)
      }
      this.markTotalItemsSizeDirty()
    }
    return removed
  }

  /**
   * Gets the layout items managed by this DirectionalLayout.
   * Returns the layout items from the X-axis layout (which is the source of truth,
   * as all three axis layouts share the same children).
   * @returns The layout items.
   */
  public getLayoutItems(): LayoutItem[] {
    return this._initialized ? [...this._layoutX.layoutItems] : []
  }

  /**
   * Gets the number of layout items in the DirectionalLayout.
   * @returns The number of layout items.
   */
  public getLayoutItemCount(): number {
    return this._initialized ? this._layoutX.layoutItems.length : 0
  }

  /**
   * Gets the total size of all items along each axis.
   * This includes the sizes of all layout items and the spacing between them.
   *
   * @remarks
   * For the primary direction (stacking axis), returns sum of children sizes + spacing.
   * For non-primary axes (alignment only), returns max of children sizes.
   * When wrapping is enabled, calculates the wrapped dimensions across all axes.
   *
   * @param includePadding - Whether to include padding in the calculation. Defaults to false.
   * @returns A vec3 with total items size for each axis (x, y, z) in local space centimeters.
   */
  public getTotalItemsSize(includePadding: boolean = false): vec3 {
    // Optimization: Access _layoutX directly to avoid creating a copy via the public getter
    // _layoutX is the source of truth for items since all axes share them
    const items = this._layoutX.layoutItems
    if (items.length === 0) {
      return includePadding ? this.getPaddingVec3() : vec3.zero()
    }

    // Handle wrapping if enabled
    if (this._wrapToSecondaryAxis) {
      // Wrap is always valid as we enforce single layout direction
      if (this._itemsSizeDirty.x || this._itemsSizeDirty.y || this._itemsSizeDirty.z) {
        // Recalculate wrapped size
        this._cachedItemsSizeNoPadding = this.calculateWrappedTotalSize(items, false)!
        this._itemsSizeDirty.x = false
        this._itemsSizeDirty.y = false
        this._itemsSizeDirty.z = false
      }

      // Return cached value with padding if requested
      const result = new vec3(
        this._cachedItemsSizeNoPadding.x,
        this._cachedItemsSizeNoPadding.y,
        this._cachedItemsSizeNoPadding.z
      )
      if (includePadding) {
        this.addPaddingToResult(result)
      }
      return result
    }

    // Update all dirty axis caches using the utility function
    updateAllCachedAxisSizes(
      items,
      getSizeForAxis,
      (key: string) => this.getVirtualProperty(key),
      this._itemsSizeDirty,
      this._cachedItemsSizeNoPadding,
      DIRECTIONAL_AXIS_CONFIG,
      (axis: Axis) => this._primaryDirection === axis
    )

    const result = new vec3(
      this._cachedItemsSizeNoPadding.x,
      this._cachedItemsSizeNoPadding.y,
      this._cachedItemsSizeNoPadding.z
    )
    if (includePadding) {
      this.addPaddingToResult(result)
    }
    return result
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LIFECYCLE METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  public onAwake() {
    // Create the SingleAxisLayout components and immediately set their axes
    // This must happen in onAwake (not field initializers) to ensure axes are set
    // before SingleAxisLayout's onAwake registers them with the manager
    this._layoutX = this.sceneObject.createComponent(SingleAxisLayout.getTypeName()) as SingleAxisLayout
    this._layoutX.axis = Axis.X

    this._layoutY = this.sceneObject.createComponent(SingleAxisLayout.getTypeName()) as SingleAxisLayout
    this._layoutY.axis = Axis.Y

    this._layoutZ = this.sceneObject.createComponent(SingleAxisLayout.getTypeName()) as SingleAxisLayout
    this._layoutZ.axis = Axis.Z

    // Create the debug update event once, starts enabled/disabled based on _debug
    this.debugUpdateEvent = this.createEvent("UpdateEvent")
    this.debugUpdateEvent.enabled = this._debug
    this.debugUpdateEvent.bind(this.renderDebugBounds)

    // Create the validation late update event once, starts disabled
    // This allows batch property updates without order-dependent warnings
    this.validationLateUpdateEvent = this.createEvent("LateUpdateEvent")
    this.validationLateUpdateEvent.enabled = false
    this.validationLateUpdateEvent.bind(this.onValidationLateUpdate)

    // Create the total items size update event once, starts disabled
    this._totalItemsSizeUpdateEvent = this.createEvent("LateUpdateEvent")
    this._totalItemsSizeUpdateEvent.enabled = false
    this._totalItemsSizeUpdateEvent.bind(this.fireTotalItemsSizeChanged)

    this.createEvent("OnStartEvent").bind(this.onStart.bind(this))
    this.createEvent("OnDestroyEvent").bind(this.onDestroy.bind(this))
    this.createEvent("OnEnableEvent").bind(this.onEnabled.bind(this))
    this.createEvent("OnDisableEvent").bind(this.onDisabled.bind(this))
  }

  private onStart() {
    // Validate all inputs
    validateNonNegative(this._primarySize, "Primary size")
    validateNonNegative(this._primarySpacing, "Spacing")
    validateNonNegative(this._secondarySize, "Secondary size")
    validateNonNegative(this._secondarySpacing, "Secondary spacing")
    validateNonNegative(this._tertiarySize, "Tertiary size")
    validateNonNegative(this._tertiarySpacing, "Tertiary spacing")
    validateNonNegative(this._paddingLeft, "Padding left")
    validateNonNegative(this._paddingRight, "Padding right")
    validateNonNegative(this._paddingBottom, "Padding bottom")
    validateNonNegative(this._paddingTop, "Padding top")
    validateNonNegative(this._paddingBack, "Padding back")
    validateNonNegative(this._paddingFront, "Padding front")
    validateNonNegative(this._childWidth, "Child width")
    validateNonNegative(this._childHeight, "Child height")
    validateNonNegative(this._childDepth, "Child depth")

    // Set up direction (autoAlignment)
    this.restoreAutoAlignmentSettings()

    // Apply size configuration unconditionally for all axes
    for (const axis of ALL_AXES) {
      applyDirectionalSizeToAxis(this.getLayoutForAxis(axis), this.isFixedSizeForAxis(axis), this.getSizeForAxis(axis))
    }

    // Set up alignment, anchor, and reverse for each enabled axis
    const primaryAxis = this._primaryDirection as Axis
    applyDirectionalAxisSettings(this.getLayoutForAxis(primaryAxis), this.getDirectionalAxisSettings(primaryAxis))

    // Set up child size
    this._layoutX.childSize = this._childWidth
    this._layoutY.childSize = this._childHeight
    this._layoutZ.childSize = this._childDepth

    // Set up normalized child size
    this._layoutX.normalizedChildSize = this._normalizedChildSize
    this._layoutY.normalizedChildSize = this._normalizedChildSize
    this._layoutZ.normalizedChildSize = this._normalizedChildSize

    // Apply wrap configuration if enabled
    if (this._wrapToSecondaryAxis) {
      this.applyWrapConfiguration()
    }

    // Wait for all underlying SingleAxisLayouts to be initialized before completing DirectionalLayout initialization.
    // This ensures items can be safely added in onInitialized callbacks without timing conflicts.
    this._layoutX.onInitialized.add(() => this.onUnderlyingLayoutInitialized())
    this._layoutY.onInitialized.add(() => this.onUnderlyingLayoutInitialized())
    this._layoutZ.onInitialized.add(() => this.onUnderlyingLayoutInitialized())

    // Subscribe to underlying layouts' onLayoutItemAdded events to forward them after layout is complete.
    // We subscribe to all three and wait for all enabled layouts to complete before firing our event.
    this._layoutX.onLayoutItemAdded.add((items) => this.onUnderlyingLayoutItemAdded(items, Axis.X))
    this._layoutY.onLayoutItemAdded.add((items) => this.onUnderlyingLayoutItemAdded(items, Axis.Y))
    this._layoutZ.onLayoutItemAdded.add((items) => this.onUnderlyingLayoutItemAdded(items, Axis.Z))
  }

  /**
   * Called when each underlying SingleAxisLayout is initialized.
   * Once all three are ready, completes DirectionalLayout initialization.
   */
  private onUnderlyingLayoutInitialized(): void {
    this._underlyingLayoutsInitialized++

    // Wait for all three underlying layouts to be initialized
    if (this._underlyingLayoutsInitialized < 3) {
      return
    }

    this._lastFiredItemsSize = this.getTotalItemsSize()

    // Mark as initialized
    this._initialized = true

    // Validate configuration - throws errors for invalid configurations
    this.validateNormalizedChildSizeConfiguration()
    this.validateStretchConfiguration()
    this.validateWrapConfiguration()

    // Fire initialized event
    this.onInitializedEvent.invoke()

    const hasPending =
      (this._pendingAdditions && this._pendingAdditions.length > 0) ||
      (this._pendingRemovals && this._pendingRemovals.length > 0)
    // Process pending additions (items that were not already children)
    if (this._pendingAdditions && this._pendingAdditions.length > 0) {
      for (const pending of this._pendingAdditions) {
        const addedX = this._layoutX.addLayoutItems(pending.items, pending.startIndex)
        const addedY = this._layoutY.addLayoutItems(pending.items, pending.startIndex)
        const addedZ = this._layoutZ.addLayoutItems(pending.items, pending.startIndex)

        // Calculate intersection of items successfully added to all three layouts
        const addedItems = getThreeAxisIntersection(addedX, addedY, addedZ)

        // Queue items for notification after layout operations complete
        trackPendingItems(addedItems, this._pendingItemConfirmations)
      }
    }
    this._pendingAdditions = null

    // Process pending removals
    if (this._pendingRemovals && this._pendingRemovals.length > 0) {
      this._layoutX.removeLayoutItems(this._pendingRemovals)
      this._layoutY.removeLayoutItems(this._pendingRemovals)
      this._layoutZ.removeLayoutItems(this._pendingRemovals)
      this.onLayoutItemRemovedEvent.invoke(this._pendingRemovals)
    }
    this._pendingRemovals = null

    // Subscribe to size changes for any children discovered by the underlying layouts
    for (const item of this._layoutX.layoutItems) {
      this.subscribeToItemSizeChange(item)
    }
    if (hasPending) {
      this.markTotalItemsSizeDirty()
    }
  }

  /**
   * Called when an underlying SingleAxisLayout fires onLayoutItemAdded.
   * Tracks which layouts have confirmed each item and only fires our event
   * when all three layouts have completed their layout refresh.
   */
  private onUnderlyingLayoutItemAdded(items: LayoutItem[], axis: Axis): void {
    const fullyConfirmedItems = updateItemConfirmations(items, axis, this._pendingItemConfirmations, 3)

    if (fullyConfirmedItems.length > 0) {
      this.onLayoutItemAddedEvent.invoke(fullyConfirmedItems)
    }
  }

  private onDestroy() {
    this.unsubscribeFromAllItemSizeChanges()
    if (this._layoutX) {
      this._layoutX.destroy()
    }
    if (this._layoutY) {
      this._layoutY.destroy()
    }
    if (this._layoutZ) {
      this._layoutZ.destroy()
    }
  }

  private onEnabled() {
    if (this._layoutX) this._layoutX.enabled = true
    if (this._layoutY) this._layoutY.enabled = true
    if (this._layoutZ) this._layoutZ.enabled = true
  }

  private onDisabled() {
    if (this._layoutX) this._layoutX.enabled = false
    if (this._layoutY) this._layoutY.enabled = false
    if (this._layoutZ) this._layoutZ.enabled = false
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Calculates the total size when wrapping is enabled.
   */
  private calculateWrappedTotalSize(items: LayoutItem[], includePadding: boolean): vec3 {
    const itemAxis = this._primaryDirection as Axis

    const layout = this[DIRECTIONAL_AXIS_CONFIG[itemAxis].layoutKey] as SingleAxisLayout
    const wrappedDims = layout.calculateWrappedDimensions(includePadding)
    const secondaryWrapInfo = WRAP_DIRECTION_INFO[this._secondaryDirection as WrapDirection]
    const tertiaryWrapInfo = this._wrapToTertiaryAxis
      ? WRAP_DIRECTION_INFO[this._tertiaryDirection as WrapDirection]
      : null

    return mapWrappedDimensionsTo3DSize(
      itemAxis,
      secondaryWrapInfo.axis,
      wrappedDims,
      {
        x: this._paddingLeft + this._paddingRight,
        y: this._paddingBottom + this._paddingTop,
        z: this._paddingBack + this._paddingFront
      },
      items,
      includePadding,
      tertiaryWrapInfo?.axis
    )
  }

  /**
   * Helper to get property values including virtual properties for fixed size/dimension.
   */
  private getVirtualProperty(key: string): unknown {
    if (key === "_fixedWidth") return this.isFixedSizeForAxis(Axis.X)
    if (key === "_fixedHeight") return this.isFixedSizeForAxis(Axis.Y)
    if (key === "_fixedDepth") return this.isFixedSizeForAxis(Axis.Z)
    if (key === "_width") return this.getSizeForAxis(Axis.X)
    if (key === "_height") return this.getSizeForAxis(Axis.Y)
    if (key === "_depth") return this.getSizeForAxis(Axis.Z)
    return this[key as keyof this]
  }

  /**
   * Gets the direction settings for a specific axis.
   * This is a helper that builds the settings from current property values.
   */
  private getDirectionalAxisSettings(axis: Axis) {
    return buildDirectionalAxisSettings(
      DIRECTIONAL_AXIS_CONFIG[axis],
      (key: string) => this.getVirtualProperty(key),
      this._primaryDirection === axis
    )
  }

  /**
   * Gets the underlying SingleAxisLayout for a specific axis.
   * @param axis - The axis to get the layout for.
   * @returns The SingleAxisLayout for the specified axis.
   */
  private getLayoutForAxis(axis: Axis): SingleAxisLayout {
    return this[DIRECTIONAL_AXIS_CONFIG[axis].layoutKey as keyof this] as SingleAxisLayout
  }

  /**
   * Gets the child alignment for a specific axis.
   * @param axis - The axis to get alignment for.
   * @returns The alignment string for the axis.
   */
  private getChildAlignmentForAxis(axis: Axis): string {
    return this[DIRECTIONAL_AXIS_CONFIG[axis].alignmentKey as keyof this] as string
  }

  /**
   * Gets the axis that the secondary wrap direction maps to.
   * @returns The secondary axis, or undefined if wrapping to secondary is disabled.
   */
  private getSecondaryAxis(): Axis | undefined {
    return this._wrapToSecondaryAxis ? WRAP_DIRECTION_INFO[this._secondaryDirection as WrapDirection].axis : undefined
  }

  /**
   * Gets the axis that the tertiary wrap direction maps to.
   * Tertiary wrapping is only active when secondary wrapping is also enabled.
   * @returns The tertiary axis, or undefined if tertiary or secondary wrapping is disabled.
   */
  private getTertiaryAxis(): Axis | undefined {
    return this._wrapToSecondaryAxis && this._wrapToTertiaryAxis
      ? WRAP_DIRECTION_INFO[this._tertiaryDirection as WrapDirection].axis
      : undefined
  }

  /**
   * Creates a vec3 representing the current padding values.
   * @returns A vec3 with combined padding for each axis.
   */
  private getPaddingVec3(): vec3 {
    return createPaddingVec3(
      this._paddingLeft,
      this._paddingRight,
      this._paddingBottom,
      this._paddingTop,
      this._paddingBack,
      this._paddingFront
    )
  }

  /**
   * Adds the current padding values to a vec3 result in place.
   * @param result - The vec3 to add padding to.
   */
  private addPaddingToResult(result: vec3): void {
    addPaddingToVec3(
      result,
      this._paddingLeft,
      this._paddingRight,
      this._paddingBottom,
      this._paddingTop,
      this._paddingBack,
      this._paddingFront
    )
  }

  /**
   * Gets whether a specific axis has a fixed size.
   * @param axis - The axis to check.
   * @returns True if the axis has a fixed size.
   */
  private isFixedSizeForAxis(axis: Axis): boolean {
    if (this._primaryDirection === axis) return this._primarySizeFixed
    const secondaryAxis = this.getSecondaryAxis()
    if (secondaryAxis === axis) return this._secondaryFixedSize
    const tertiaryAxis = this.getTertiaryAxis()
    if (tertiaryAxis === axis) return this._tertiaryFixedSize
    return false
  }

  /**
   * Gets the size value for a specific axis.
   * @param axis - The axis to get size for.
   * @returns The size value for the axis.
   */
  private getSizeForAxis(axis: Axis): number {
    if (this._primaryDirection === axis) return this._primarySize
    const secondaryAxis = this.getSecondaryAxis()
    if (secondaryAxis === axis) return this._secondarySize
    const tertiaryAxis = this.getTertiaryAxis()
    if (tertiaryAxis === axis) return this._tertiarySize
    return 0
  }

  /**
   * Applies alignment change for a specific axis when initialized.
   * Handles the common logic from childAlignmentX/Y/Z setters.
   *
   * @param axis - The axis to apply alignment change for.
   * @param newValue - The new alignment value.
   * @param oldValue - The previous alignment value.
   */
  private applyAlignmentChangeForAxis(axis: Axis, newValue: string, oldValue: string): void {
    if (!this._initialized) return

    if (this._primaryDirection === axis) {
      const config = this.getDirectionalAxisSettings(axis)
      // Override with new alignment value since property might not be updated yet or we want to be explicit
      config.alignment = newValue as AlignmentConstants

      applyDirectionalAxisSettings(this.getLayoutForAxis(axis), config)
    }
    this.markValidationDirty()
    if (oldValue === AlignmentConstants.Stretch || newValue === AlignmentConstants.Stretch) {
      this.markTotalItemsSizeDirty(axis)
    }
  }

  /**
   * Applies fixed size change for a specific axis when initialized.
   * Handles the common logic from fixedWidth/fixedHeight/fixedDepth setters.
   *
   * @param axis - The axis to apply fixed size change for.
   */
  private applyFixedSizeChangeForAxis(axis: Axis): void {
    if (!this._initialized) return

    const layout = this.getLayoutForAxis(axis)
    const isFixed = this.isFixedSizeForAxis(axis)
    const size = this.getSizeForAxis(axis)

    applyDirectionalSizeToAxis(layout, isFixed, size)

    if (this._primaryDirection === axis) {
      applyDirectionalAxisSettings(layout, this.getDirectionalAxisSettings(axis))
    }

    // Reconfigure wrap when fixed size changes (wrap requires fixed size)
    if (this._wrapToSecondaryAxis) {
      this.applyWrapConfiguration()
    }

    this.markValidationDirty()
    this.onSizeChangedEvent.invoke(this.layoutSize)

    const alignment = this.getChildAlignmentForAxis(axis)
    if (
      this._wrapToSecondaryAxis ||
      (this._primaryDirection === axis && alignment === AlignmentConstants.Stretch) ||
      this._normalizedChildSize
    ) {
      if (this._normalizedChildSize) {
        this.markTotalItemsSizeDirty()
      } else {
        this.markTotalItemsSizeDirty(axis)
      }
    }
  }

  /**
   * Applies layout size change for a specific axis when initialized.
   * Handles the common logic from width/height/depth setters.
   * Note: Validation should be done by the caller before invoking this method.
   *
   * @param axis - The axis to apply size change for.
   */
  private applyLayoutSizeChangeForAxis(axis: Axis): void {
    if (!this._initialized) return

    const size = this.getSizeForAxis(axis)
    this.getLayoutForAxis(axis).size = size

    // Reconfigure wrap when size changes (wrap limit might depend on size)
    if (this._wrapToSecondaryAxis) {
      this.applyWrapConfiguration()
    }

    this.markValidationDirty()
    this.onSizeChangedEvent.invoke(this.layoutSize)

    const isFixed = this.isFixedSizeForAxis(axis)
    const alignment = this.getChildAlignmentForAxis(axis)

    if (
      this._wrapToSecondaryAxis ||
      (isFixed &&
        ((this._primaryDirection === axis && alignment === AlignmentConstants.Stretch) || this._normalizedChildSize))
    ) {
      if (this._normalizedChildSize) {
        this.markTotalItemsSizeDirty()
      } else {
        this.markTotalItemsSizeDirty(axis)
      }
    }
  }

  /**
   * Subscribes to size change events for a LayoutItem.
   * When item size changes, fires onTotalItemsSizeChanged.
   */
  private subscribeToItemSizeChange(item: LayoutItem): void {
    if (this.itemSizeSubscriptions.has(item)) {
      return
    }

    // Initialize cache
    this._itemSizes.set(item, item.size)

    const unsubscribe = item.onSizeUpdated.add((newSize) => {
      const oldSize = this._itemSizes.get(item)
      if (oldSize && vec3ApproximatelyEqual(newSize, oldSize)) {
        return
      }
      this._itemSizes.set(item, newSize)

      if (!oldSize) {
        this.markTotalItemsSizeDirty()
      } else {
        if (Math.abs(newSize.x - oldSize.x) > SIZE_CHANGE_EPSILON) this.markTotalItemsSizeDirty(Axis.X)
        if (Math.abs(newSize.y - oldSize.y) > SIZE_CHANGE_EPSILON) this.markTotalItemsSizeDirty(Axis.Y)
        if (Math.abs(newSize.z - oldSize.z) > SIZE_CHANGE_EPSILON) this.markTotalItemsSizeDirty(Axis.Z)
      }
    })

    this.itemSizeSubscriptions.set(item, unsubscribe)
  }

  /**
   * Unsubscribes from size change events for a LayoutItem.
   */
  private unsubscribeFromItemSizeChange(item: LayoutItem): void {
    const unsubscribe = this.itemSizeSubscriptions.get(item)
    if (unsubscribe) {
      unsubscribe()
      this.itemSizeSubscriptions.delete(item)
    }
    this._itemSizes.delete(item)
  }

  /**
   * Unsubscribes from all items' size change events. Called during cleanup.
   */
  private unsubscribeFromAllItemSizeChanges(): void {
    for (const unsubscribe of this.itemSizeSubscriptions.values()) {
      unsubscribe()
    }
    this.itemSizeSubscriptions.clear()
    this._itemSizes.clear()
  }

  /**
   * Marks the total items size as dirty and schedules an update event.
   * @param axis - Optional axis to mark dirty. If not provided, all axes are marked dirty.
   */
  private markTotalItemsSizeDirty(axis?: Axis): void {
    if (axis === undefined || this._wrapToSecondaryAxis || this._wrapToTertiaryAxis) {
      this._itemsSizeDirty.x = true
      this._itemsSizeDirty.y = true
      this._itemsSizeDirty.z = true
    } else {
      this._itemsSizeDirty[axis] = true
    }

    if (this._totalItemsSizeDirty || !this._totalItemsSizeUpdateEvent) return
    this._totalItemsSizeDirty = true
    this._totalItemsSizeUpdateEvent.enabled = true
  }

  /**
   * Fires the total items size changed event.
   * Called by the late update event.
   */
  private fireTotalItemsSizeChanged = (): void => {
    this._totalItemsSizeDirty = false
    this._totalItemsSizeUpdateEvent.enabled = false

    const currentSize = this.getTotalItemsSize()

    if (!vec3ApproximatelyEqual(currentSize, this._lastFiredItemsSize)) {
      this._lastFiredItemsSize = currentSize
      this.onTotalItemsSizeChangedEvent.invoke(currentSize)
    }
  }

  /**
   * Marks the validation as dirty, scheduling deferred validation at end of frame.
   * This allows batch property updates without order-dependent warnings.
   */
  private markValidationDirty(): void {
    if (!this._initialized) return
    this.validationLateUpdateEvent.enabled = true
  }

  /**
   * Callback for the LateUpdateEvent. Handles deferred validation at end of frame.
   * Disables itself after firing to avoid repeated validation.
   */
  private onValidationLateUpdate = (): void => {
    this.validationLateUpdateEvent.enabled = false
    this.validateNormalizedChildSizeConfiguration()
    this.validateStretchConfiguration()
    this.validateWrapConfiguration()
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE VALIDATION METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Validates that Stretch alignment on the primary axis has Fixed Size enabled.
   *
   * This is called via deferred validation at end of frame (LateUpdateEvent), allowing
   * developers to temporarily be in an invalid state while configuring multiple properties.
   * Once all properties are set, validation runs and throws if the final state is invalid.
   *
   * @throws Error if Stretch alignment is enabled without Fixed Size.
   */
  private validateStretchConfiguration(): void {
    if (!this._initialized) return

    const alignment = this.getChildAlignmentForAxis(this._primaryDirection as Axis)
    validateAxisStretchConfiguration(alignment, this._primarySizeFixed)
  }

  /**
   * Validates the normalized child size configuration.
   * normalizedChildSize requires the primary axis Fixed Size to be enabled.
   * When normalized, primary axis child size must be <= 1.
   *
   * @throws Error if normalizedChildSize is enabled without primary axis Fixed Size.
   * @throws Error if primary axis child size exceeds 1 when normalizedChildSize is enabled.
   */
  private validateNormalizedChildSizeConfiguration(): void {
    if (!this._initialized) return

    validateNormalizedChildSizes(
      this._normalizedChildSize,
      this._primarySizeFixed,
      this._primaryDirection,
      this._childWidth,
      this._childHeight,
      this._childDepth
    )
  }

  /**
   * Validates the wrap configuration.
   * Checks:
   * 1. Wrap direction must be perpendicular to the primary direction
   * 2. Primary axis has fixed size (determines wrap boundary)
   * 3. If tertiary wrapping is enabled, secondary axis must have fixed size
   *
   * @throws Error if wrap configuration is invalid.
   */
  private validateWrapConfiguration(): void {
    if (!this._initialized) return

    validateDirectionalWrapSettings(
      this._primaryDirection as Axis,
      this._primarySizeFixed,
      this._wrapToSecondaryAxis,
      this._secondaryDirection as WrapDirection,
      this._secondaryFixedSize,
      this._wrapToTertiaryAxis,
      this._tertiaryDirection as WrapDirection
    )
  }

  /**
   * Applies wrap configuration to the internal SingleAxisLayouts.
   *
   * For SingleAxisLayout's wrap to work, the wrap direction must be perpendicular
   * to the primary axis. Configures the primary axis layout with wrap settings
   * including secondary/tertiary direction, spacing, and size limits.
   *
   * Prerequisites (enforced by validateWrapConfiguration when wrap is enabled):
   * - Wrap direction is perpendicular to the primary direction
   * - Primary axis has fixed size
   *
   * Called from:
   * - Property setters: wrapToSecondaryAxis, secondaryDirection, secondarySpacing, tertiaryDirection, tertiarySpacing
   * - primaryDirection setter when wrap is active
   * - Fixed size and layout size setters when wrap is active
   * - onStart initialization
   */
  private applyWrapConfiguration(): void {
    // Always restore base state (no wrap) first.
    // This ensures that if we are transitioning to an invalid state or disabling wrap,
    // we don't leave any internal layouts in Overflow.Wrap mode.
    this._layoutX.overflow = Overflow.Overflow
    this._layoutY.overflow = Overflow.Overflow
    this._layoutZ.overflow = Overflow.Overflow
    this.restoreAutoAlignmentSettings()

    if (!this._wrapToSecondaryAxis) {
      return
    }

    // Get the single item axis layout
    const itemAxis = this._primaryDirection as Axis
    const itemLayout = this[DIRECTIONAL_AXIS_CONFIG[itemAxis].layoutKey]

    // Configure the item layout with wrap
    const secondaryDirection = this._secondaryDirection as WrapDirection
    const tertiaryDirection = this._tertiaryDirection as WrapDirection
    itemLayout.overflow = Overflow.Wrap
    itemLayout.secondaryDirection = secondaryDirection
    itemLayout.secondarySpacing = this._secondarySpacing
    itemLayout.secondarySize = this._secondaryFixedSize && this._wrapToTertiaryAxis ? this._secondarySize : Infinity
    itemLayout.tertiaryDirection = tertiaryDirection
    itemLayout.tertiarySpacing = this._tertiarySpacing

    log.d(`Wrap configured: ${itemAxis} layout handles wrap in ${secondaryDirection} direction`)
  }

  /**
   * Restores auto-alignment settings based on the current primary direction.
   * Sets autoAlignment to true for the primary axis and false for others.
   * Called during wrap configuration (to reset before re-applying) and during onStart initialization.
   */
  private restoreAutoAlignmentSettings(): void {
    this._layoutX.autoAlignment = this._primaryDirection === Axis.X
    this._layoutY.autoAlignment = this._primaryDirection === Axis.Y
    this._layoutZ.autoAlignment = this._primaryDirection === Axis.Z
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE DEBUG METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Renders debug visualization for the DirectionalLayout.
   * Delegates to LayoutDebugDrawer utility.
   */
  private renderDebugBounds = (): void => {
    // Get children data for wrapped layouts
    const itemAxis = this._primaryDirection as Axis
    const children = (this[DIRECTIONAL_AXIS_CONFIG[itemAxis].layoutKey] as SingleAxisLayout).layoutItems.map((c) => ({
      position: c.position,
      size: c.size
    }))

    renderDirectionalLayoutDebug({
      transform: this.sceneObject.getTransform(),
      primaryDirection: this.primaryDirection,
      childAlignmentX: this._childAlignmentX,
      childAlignmentY: this._childAlignmentY,
      childAlignmentZ: this._childAlignmentZ,
      fixedWidth: this.isFixedSizeForAxis(Axis.X),
      fixedHeight: this.isFixedSizeForAxis(Axis.Y),
      fixedDepth: this.isFixedSizeForAxis(Axis.Z),
      width: this.getSizeForAxis(Axis.X),
      height: this.getSizeForAxis(Axis.Y),
      depth: this.getSizeForAxis(Axis.Z),
      anchorX: this._anchorX as Anchor,
      anchorY: this._anchorY as Anchor,
      anchorZ: this._anchorZ as Anchor,
      wrapToSecondaryAxis: this._wrapToSecondaryAxis,
      secondaryDirection: this._secondaryDirection as WrapDirection,
      axisLayoutData: {
        x: {
          itemsLength: calculateTotalLength(
            this._layoutX.layoutItems,
            (item) => getSizeForAxis(item, this._layoutX.axis),
            this._layoutX.spacing,
            this._layoutX.paddingStart,
            this._layoutX.paddingEnd,
            false
          ),
          paddingStart: this._layoutX.paddingStart,
          paddingEnd: this._layoutX.paddingEnd
        },
        y: {
          itemsLength: calculateTotalLength(
            this._layoutY.layoutItems,
            (item) => getSizeForAxis(item, this._layoutY.axis),
            this._layoutY.spacing,
            this._layoutY.paddingStart,
            this._layoutY.paddingEnd,
            false
          ),
          paddingStart: this._layoutY.paddingStart,
          paddingEnd: this._layoutY.paddingEnd
        },
        z: {
          itemsLength: calculateTotalLength(
            this._layoutZ.layoutItems,
            (item) => getSizeForAxis(item, this._layoutZ.axis),
            this._layoutZ.spacing,
            this._layoutZ.paddingStart,
            this._layoutZ.paddingEnd,
            false
          ),
          paddingStart: this._layoutZ.paddingStart,
          paddingEnd: this._layoutZ.paddingEnd
        }
      },
      children
    })
  }
}
