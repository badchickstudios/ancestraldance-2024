/**
 * Shared layout type definitions.
 * This file contains enums used by SingleAxisLayout, DirectionalLayout, and LayoutItem.
 * Extracted to a separate file to avoid circular dependencies.
 */

export enum Axis {
  X = "x",
  Y = "y",
  Z = "z"
}

export enum Overflow {
  Overflow = "overflow",
  Truncate = "truncate",
  Wrap = "wrap"
}

export enum WrapDirection {
  Left = "-x",
  Right = "+x",
  Down = "-y",
  Up = "+y",
  Back = "-z",
  Front = "+z"
}

export enum Alignment {
  Start = "start",
  Center = "center",
  End = "end",
  Stretch = "stretch",
  StretchSpacing = "stretchSpacing"
}

export enum SpacingDistribution {
  SpaceBetween = "spaceBetween",
  SpaceEvenly = "spaceEvenly",
  SpaceAround = "spaceAround"
}

export enum StretchMode {
  Content = "content",
  Spacing = "spacing"
}

export enum Anchor {
  Start = "start",
  Center = "center",
  End = "end"
}

// ═══════════════════════════════════════════════════════════════════════════
// LayoutItem Types
// ═══════════════════════════════════════════════════════════════════════════

export enum SizeDriver {
  Component = "component",
  LayoutItem = "layoutItem",
  LayoutAndLayoutItem = "layoutAndLayoutItem"
}

@typedef
export class SizeDriverInput {
  @input
  @widget(
    new ComboBoxWidget([
      new ComboBoxItem("Component", "component"),
      new ComboBoxItem("LayoutItem", "layoutItem"),
      new ComboBoxItem("Layout (Fallback to LayoutItem)", "layoutAndLayoutItem")
    ])
  )
  public sizeDriver: string = SizeDriver.LayoutAndLayoutItem
  @input
  public size: number = 2
}

// ═══════════════════════════════════════════════════════════════════════════
// DirectionalLayout Types
// ═══════════════════════════════════════════════════════════════════════════

export enum AlignmentConstants {
  Negative = "-",
  Center = "",
  Positive = "+",
  Stretch = "*"
}

export enum HorizontalAlignment {
  Left = AlignmentConstants.Negative,
  Center = AlignmentConstants.Center,
  Right = AlignmentConstants.Positive,
  Stretch = AlignmentConstants.Stretch
}

export enum VerticalAlignment {
  Bottom = AlignmentConstants.Negative,
  Center = AlignmentConstants.Center,
  Top = AlignmentConstants.Positive,
  Stretch = AlignmentConstants.Stretch
}

export enum DepthAlignment {
  Back = AlignmentConstants.Negative,
  Center = AlignmentConstants.Center,
  Front = AlignmentConstants.Positive,
  Stretch = AlignmentConstants.Stretch
}

// ═══════════════════════════════════════════════════════════════════════════
// GridLayout Types
// ═══════════════════════════════════════════════════════════════════════════

export enum AddOrder {
  AsIs = "asIs",
  LargestFirst = "largestFirst",
  SmallestFirst = "smallestFirst"
}

export enum AddLayoutItemFallbackStrategy {
  None = "none", // No fallback strategy (not added to grid)
  ClosestAvailable = "closestAvailable", // Add to closest available cell
  Push = "push" // Push other items to make space
}

/**
 * Represents a coordinate in the grid (col, row, layer).
 */
export interface GridCoordinate {
  /** Column index (X-axis) */
  col: number
  /** Row index (Y-axis) */
  row: number
  /** Layer index (Z-axis) */
  layer: number
}

/**
 * Represents the placement of an item within a GridLayout.
 * Includes the cell coordinates and how many cells the item spans.
 */
export interface GridPlacement extends GridCoordinate {
  /** Number of columns the item spans (default: 1, or auto-calculated from item width) */
  colSpan: number
  /** Number of rows the item spans (default: 1, or auto-calculated from item height) */
  rowSpan: number
  /** Number of layers the item spans (default: 1, or auto-calculated from item depth) */
  layerSpan: number
}

// ═══════════════════════════════════════════════════════════════════════════
// Layout Utility Interfaces
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Represents a 3D size with width, height, and depth.
 * Used as an interface to avoid circular dependencies with LayoutItem.
 */
export interface Size3D {
  width: number
  height: number
  depth: number
}

/**
 * Represents an object with mutable width, height, and depth properties.
 * Used for setting size values on objects like LayoutItem.
 */
export interface MutableSize3D {
  width: number
  height: number
  depth: number
}

/**
 * Represents an object with a mutable position property.
 * Used for setting position values on objects like LayoutItem.
 */
export interface MutablePosition3D {
  position: vec3
}

/**
 * Represents 3D axis-aligned bounding box with min/max corners, size, and center.
 */
export type Bounds3D = {
  /** Minimum corner of the bounding box */
  min: vec3
  /** Maximum corner of the bounding box */
  max: vec3
  /** Size of the bounding box (max - min) */
  size: vec3
  /** Center point of the bounding box */
  center: vec3
}

/**
 * Represents a range with start and end values.
 */
export type Range1D = {
  start: number
  end: number
}

/**
 * Configuration for a layout axis used in mask calculation.
 */
export type LayoutMaskConfig = {
  axis: Axis
  size: number
  anchor: Anchor
  paddingStart: number
  paddingEnd: number
}

/**
 * Configuration for wrapped item positioning calculation.
 */
export type WrapPositioningConfig = {
  /** The main axis along which items are laid out */
  mainAxis: Axis
  /** The axis along which wrapping occurs (secondary axis) */
  secondaryAxis: Axis
  /** Sign of secondary direction: +1 for positive, -1 for negative */
  secondarySign: -1 | 1
  /** Axis for tertiary wrapping */
  tertiaryAxis?: Axis
  /** Sign of tertiary direction: +1 for positive, -1 for negative */
  tertiarySign?: -1 | 1
  /** Size of the layout along the main axis */
  layoutSize: number
  /** Anchor point for alignment */
  anchor: Anchor
  /** Alignment mode */
  alignment: string
  /** Spacing between items on main axis */
  spacing: number
  /** Spacing between wrapped rows (secondary spacing) */
  secondarySpacing: number
  /** Limit for the secondary axis before wrapping to tertiary */
  secondarySize?: number
  /** Tertiary wrap direction */
  tertiaryDirection?: WrapDirection
  /** Tertiary wrap spacing */
  tertiarySpacing?: number
  /** Start padding along main axis */
  paddingStart: number
  /** End padding along main axis */
  paddingEnd: number
}

/**
 * Result of wrap positioning calculation for a single item.
 */
export type WrapPositionResult<T> = {
  /** The original item */
  item: T
  /** Position along the main axis */
  mainAxisPosition: number
  /** Position along the wrap axis */
  wrapAxisPosition: number
  /** Position along the tertiary wrap axis */
  tertiaryAxisPosition?: number
}

/**
 * Configuration mapping for DirectionalLayout alignment signs to layout properties.
 * Maps alignment sign strings ('+', '-', '*', '') to their corresponding layout configuration.
 */
export type AlignmentMappingEntry = {
  /** The alignment mode for SingleAxisLayout */
  alignment: Alignment
  /** The anchor point for the layout */
  anchor: Anchor
  /** Whether to reverse the layout by default for this alignment */
  defaultReverse: boolean
  /** Direction multiplier: +1 for positive direction, -1 for negative */
  directionMultiplier: number
}

/**
 * Configuration for DirectionalLayout axis-specific property keys.
 * Maps axis enum values to their corresponding internal property names.
 */
export type AxisLayoutConfig = {
  /** Property key for the SingleAxisLayout instance */
  layoutKey: "_layoutX" | "_layoutY" | "_layoutZ"
  /** Property key for child alignment */
  alignmentKey: "_childAlignmentX" | "_childAlignmentY" | "_childAlignmentZ"
  /** Property key for stretch mode */
  stretchModeKey: "_stretchModeX" | "_stretchModeY" | "_stretchModeZ"
  /** Property key for anchor */
  anchorKey: "_anchorX" | "_anchorY" | "_anchorZ"
  /** Property key for spacing distribution */
  spacingDistributionKey: "_spacingDistributionX" | "_spacingDistributionY" | "_spacingDistributionZ"
  /** Property key for whether this axis has fixed size */
  fixedSizeKey: "_fixedWidth" | "_fixedHeight" | "_fixedDepth"
  /** Property key for the fixed size value */
  sizeKey: "_width" | "_height" | "_depth"
  /** Property key for padding at the start of this axis */
  paddingStartKey: "_paddingLeft" | "_paddingBottom" | "_paddingBack"
  /** Property key for padding at the end of this axis */
  paddingEndKey: "_paddingRight" | "_paddingTop" | "_paddingFront"
}

/**
 * Interface for a layout that can be configured by DirectionalLayout.
 * Matches SingleAxisLayout properties.
 */
export interface ConfigurableSingleAxisLayout {
  autoAlignment: boolean
  reverse: boolean
  anchor: Anchor
  alignment: Alignment
  spacingDistribution: SpacingDistribution
  flexibleSize: boolean
  size: number
}

/**
 * Cached original Layoutable settings for restoration when overrideLayoutSizing changes.
 */
export type LayoutableOriginalSettings = {
  layoutWidth?: number
  layoutHeight?: number
  layoutDepth?: number
  fixedLayoutWidth?: boolean
  fixedLayoutHeight?: boolean
  fixedLayoutDepth?: boolean
}

/**
 * Interface for items that report initialization status.
 * Used for waiting on child items to initialize before layout calculation.
 */
export interface InitializableItem {
  readonly initialized: boolean
  readonly onInitialized: {
    add(callback: () => void): () => void
  }
}

/**
 * Interface defining the constraints for grid boundaries.
 */
export interface GridBoundsConstraints {
  /** Whether columns are fixed */
  fixedColumns: boolean
  /** Maximum columns if fixed */
  maxColumns: number
  /** Whether rows are fixed */
  fixedRows: boolean
  /** Maximum rows if fixed */
  maxRows: number
  /** Whether layers are fixed */
  fixedLayers: boolean
  /** Maximum layers if fixed */
  maxLayers: number
}

/**
 * Metrics used for calculating grid item positions.
 * Aggregates cell size, spacing, padding, and anchor offsets.
 */
export interface GridMetrics {
  /** Size of each cell (width, height, depth) */
  cellSize: vec3
  /** Spacing between cells (x, y, z) */
  spacing: vec3
  /** Padding at the start of each axis (left, bottom, back) */
  paddingStart: vec3
  /** Anchor offset for each axis */
  anchorOffset: vec3
}
