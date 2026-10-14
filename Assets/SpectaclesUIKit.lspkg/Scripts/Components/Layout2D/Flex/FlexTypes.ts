// ═══════════════════════════════════════════════════════════════════════════
// FlexTypes.ts — Pure enums + data interfaces. Zero imports.
// Shared vocabulary for the standalone 2D Flex layout module.
// ═══════════════════════════════════════════════════════════════════════════

// Re-export shared types under flex-specific aliases for convenience
export {ContentHorizontalAlignment as FlexContentHorizontalAlignment} from "../LayoutTypes"
export {ContentVerticalAlignment as FlexContentVerticalAlignment} from "../LayoutTypes"

// ─── Enums ───────────────────────────────────────────────────────────────

/** Main axis direction for flex layout. Maps to CSS `flex-direction`. */
export enum FlexDirection {
  /** Items flow left-to-right (default). */
  Row = "row",
  /** Items flow right-to-left. */
  RowReverse = "rowReverse",
  /** Items flow top-to-bottom. */
  Column = "column",
  /** Items flow bottom-to-top. */
  ColumnReverse = "columnReverse",
}

/** Controls whether flex items wrap onto multiple lines. Maps to CSS `flex-wrap`. */
export enum FlexWrap {
  /** All items stay on a single line (may overflow). */
  NoWrap = "nowrap",
  /** Items wrap onto additional lines as needed. */
  Wrap = "wrap",
  /** Items wrap, but new lines are added above/before instead of below/after. */
  WrapReverse = "wrapReverse",
}

/** Distribution of items along the main axis. Maps to CSS `justify-content`. */
export enum FlexJustify {
  /** Items packed toward the start. */
  Start = "start",
  /** Items centered along the main axis. */
  Center = "center",
  /** Items packed toward the end. */
  End = "end",
  /** Equal space between items, no space at edges. */
  SpaceBetween = "spaceBetween",
  /** Equal space around each item (half-size spaces at edges). */
  SpaceAround = "spaceAround",
  /** Equal space between and around items. */
  SpaceEvenly = "spaceEvenly",
}

/** Cross-axis alignment for all items in a container. Maps to CSS `align-items`. */
export enum FlexAlign {
  /** Items aligned to the cross-axis start. */
  Start = "start",
  /** Items centered on the cross axis. */
  Center = "center",
  /** Items aligned to the cross-axis end. */
  End = "end",
  /** Items stretched to fill the cross-axis extent. */
  Stretch = "stretch",
}

/** Per-item cross-axis alignment override. Maps to CSS `align-self`. */
export enum FlexAlignSelf {
  /** Inherit alignment from the container's `alignItems`. */
  Auto = "auto",
  /** Align to the cross-axis start. */
  Start = "start",
  /** Center on the cross axis. */
  Center = "center",
  /** Align to the cross-axis end. */
  End = "end",
  /** Stretch to fill the cross-axis extent. */
  Stretch = "stretch",
}

/** Distribution of wrapped lines along the cross axis. Maps to CSS `align-content`. */
export enum FlexAlignContent {
  /** Lines packed toward the start. */
  Start = "start",
  /** Lines centered on the cross axis. */
  Center = "center",
  /** Lines packed toward the end. */
  End = "end",
  /** Equal space between lines, no space at edges. */
  SpaceBetween = "spaceBetween",
  /** Equal space around each line. */
  SpaceAround = "spaceAround",
  /** Equal space between and around lines. */
  SpaceEvenly = "spaceEvenly",
  /** Lines stretched to fill remaining cross-axis space. */
  Stretch = "stretch",
}

// ─── Data Interfaces ─────────────────────────────────────────────────────

/** Input data for a single flex item, passed to the pure layout engine. */
export interface FlexItemInput {
  /** Measured intrinsic width in cm. */
  readonly intrinsicWidth: number
  /** Measured intrinsic height in cm. */
  readonly intrinsicHeight: number
  /** Flex grow factor. 0 = don't grow. */
  readonly flexGrow: number
  /** Flex shrink factor. 0 = don't shrink. */
  readonly flexShrink: number
  /** Initial main-axis size in cm. -1 = use intrinsic main-axis size. */
  readonly flexBasis: number
  /** Visual ordering (lower values appear first). */
  readonly order: number
  /** Per-item cross-axis alignment override. */
  readonly alignSelf: FlexAlignSelf
  /** Minimum width in cm (0 = no minimum). */
  readonly minWidth: number
  /** Maximum width in cm (0 = no maximum). */
  readonly maxWidth: number
  /** Minimum height in cm (0 = no minimum). */
  readonly minHeight: number
  /** Maximum height in cm (0 = no maximum). */
  readonly maxHeight: number
  /** Top margin in cm (>= 0). */
  readonly marginTop: number
  /** Right margin in cm (>= 0). */
  readonly marginRight: number
  /** Bottom margin in cm (>= 0). */
  readonly marginBottom: number
  /** Left margin in cm (>= 0). */
  readonly marginLeft: number
}

/** Configuration for the flex container, passed to the pure layout engine. */
export interface FlexContainerInput {
  /** Container width in cm. -1 = auto (shrink-to-fit content). */
  readonly width: number
  /** Container height in cm. -1 = auto (shrink-to-fit content). */
  readonly height: number
  /** Main axis direction. */
  readonly direction: FlexDirection
  /** Whether items wrap onto multiple lines. */
  readonly wrap: FlexWrap
  /** Distribution of items along the main axis. */
  readonly justifyContent: FlexJustify
  /** Default cross-axis alignment for items. */
  readonly alignItems: FlexAlign
  /** Distribution of wrapped lines along the cross axis. */
  readonly alignContent: FlexAlignContent
  /** Container padding in cm (top, right, bottom, left). */
  readonly padding: {
    readonly top: number
    readonly right: number
    readonly bottom: number
    readonly left: number
  }
  /** Gap between rows in cm. */
  readonly rowGap: number
  /** Gap between columns in cm. */
  readonly columnGap: number
}

/** Computed position and size for a single flex item after layout. */
export interface FlexItemOutput {
  /** Original index of this item in the input array. */
  readonly index: number
  /** X position relative to container origin (top-left), in cm. */
  readonly x: number
  /** Y position relative to container origin (top-left), in cm. */
  readonly y: number
  /** Computed width in cm. */
  readonly width: number
  /** Computed height in cm. */
  readonly height: number
}

/** Complete result from the flex layout engine. */
export interface FlexLayoutResult {
  /** Computed position and size for each item, indexed by original input order. */
  readonly items: FlexItemOutput[]
  /** Resolved container width in cm (may differ from input when auto). */
  readonly containerWidth: number
  /** Resolved container height in cm (may differ from input when auto). */
  readonly containerHeight: number
}
