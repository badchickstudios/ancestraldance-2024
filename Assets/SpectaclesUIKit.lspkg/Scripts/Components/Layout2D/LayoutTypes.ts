// ═══════════════════════════════════════════════════════════════════════════
// LayoutTypes.ts — Shared vocabulary for the Layout2D system.
// Zero Lens Studio imports. Used by both Flex and Grid orchestrators.
// ═══════════════════════════════════════════════════════════════════════════

// ─── Content Alignment (shared by Flex and Grid orchestrators) ──────────

/** Horizontal alignment of layout content relative to the SceneObject origin. */
export enum ContentHorizontalAlignment {
  Left = "left",
  Center = "center",
  Right = "right",
}

/** Vertical alignment of layout content relative to the SceneObject origin. */
export enum ContentVerticalAlignment {
  Top = "top",
  Center = "center",
  Bottom = "bottom",
}

// ─── Shared Output Interface ────────────────────────────────────────────

/** Computed position and size for a single layout item, as returned by the layout engine. */
export interface LayoutItemOutput {
  /** Original index of this item in the input array. */
  readonly index: number
  /** X position relative to the container origin (top-left). */
  readonly x: number
  /** Y position relative to the container origin (top-left). */
  readonly y: number
  /** Computed width after layout. */
  readonly width: number
  /** Computed height after layout. */
  readonly height: number
}
