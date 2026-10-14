// ═══════════════════════════════════════════════════════════════════════════
// LayoutItem2D.ts — Abstract base class for per-item layout components.
//
// Shared between FlexItem and GridItem. Handles:
// - Handler resolution via ItemHandlerRegistry.resolve() on OnStart
// - Parent layout reference and dirty propagation
// - Allocated size tracking
// - measure() / applyLayout() delegation to handler
// ═══════════════════════════════════════════════════════════════════════════

import {ItemHandler, ItemHandlerRegistry} from "./ItemHandlerRegistry"

/**
 * Abstract base class for per-item layout components (FlexItem, GridItem).
 * Handles handler resolution via {@link ItemHandlerRegistry}, parent layout
 * dirty propagation, allocated size tracking, and measure/apply delegation.
 */
export abstract class LayoutItem2D extends BaseScriptComponent {
  // ─── Internal State ──────────────────────────────────────────────────

  private _handler: ItemHandler | null = null
  protected _parentLayout: {markDirty(): void} | null = null
  private _initialized: boolean = false

  /** Last allocated size from the layout pass (for debug visualization). */
  private _allocatedWidth: number = -1
  private _allocatedHeight: number = -1

  // ─── Size Override & Constraints (shared fields) ────────────────────
  // Inspector decorators are in subclasses (FlexItem, GridItem) to control
  // visual ordering. The base class holds the fields, getters/setters, and logic.

  protected _overrideWidth: number = 0
  protected _overrideHeight: number = 0
  protected _minWidth: number = 0
  protected _maxWidth: number = 0
  protected _minHeight: number = 0
  protected _maxHeight: number = 0

  // ─── Public Accessors ─────────────────────────────────────────────────

  /** Whether this item's handler has been resolved (after OnStart). */
  public get initialized(): boolean {
    return this._initialized
  }

  /** The resolved content-type handler, or null if not yet initialized. */
  public get handler(): ItemHandler | null {
    return this._handler
  }

  /** Explicit intrinsic width override in cm. 0 = auto-detect from content handler. */
  public get overrideWidth(): number {
    return this._overrideWidth
  }
  public set overrideWidth(value: number) {
    if (this._overrideWidth === value) return
    this._overrideWidth = Math.max(0, value)
    this._parentLayout?.markDirty()
  }

  /** Explicit intrinsic height override in cm. 0 = auto-detect from content handler. */
  public get overrideHeight(): number {
    return this._overrideHeight
  }
  public set overrideHeight(value: number) {
    if (this._overrideHeight === value) return
    this._overrideHeight = Math.max(0, value)
    this._parentLayout?.markDirty()
  }

  /** Minimum width constraint in cm. 0 means no minimum. */
  public get minWidth(): number {
    return this._minWidth
  }
  public set minWidth(value: number) {
    if (this._minWidth === value) return
    this._minWidth = Math.max(0, value)
    this._parentLayout?.markDirty()
  }

  /** Maximum width constraint in cm. 0 means no maximum. */
  public get maxWidth(): number {
    return this._maxWidth
  }
  public set maxWidth(value: number) {
    if (this._maxWidth === value) return
    this._maxWidth = Math.max(0, value)
    this._parentLayout?.markDirty()
  }

  /** Minimum height constraint in cm. 0 means no minimum. */
  public get minHeight(): number {
    return this._minHeight
  }
  public set minHeight(value: number) {
    if (this._minHeight === value) return
    this._minHeight = Math.max(0, value)
    this._parentLayout?.markDirty()
  }

  /** Maximum height constraint in cm. 0 means no maximum. */
  public get maxHeight(): number {
    return this._maxHeight
  }
  public set maxHeight(value: number) {
    if (this._maxHeight === value) return
    this._maxHeight = Math.max(0, value)
    this._parentLayout?.markDirty()
  }

  // ─── Lifecycle ───────────────────────────────────────────────────────

  public onAwake(): void {
    this.createEvent("OnStartEvent").bind(() => {
      this._handler = ItemHandlerRegistry.resolve(this.sceneObject)
      this._initialized = true
    })
  }

  // ─── Public Methods ─────────────────────────────────────────────────

  /**
   * Associates this item with a parent layout for dirty propagation.
   * Called automatically by the layout container during child discovery.
   * @param layout - The parent layout (must have a `markDirty()` method), or null to detach.
   */
  public setParentLayout(layout: {markDirty(): void} | null): void {
    this._parentLayout = layout
  }

  /**
   * Measures the intrinsic size of the underlying content.
   * Override width/height take precedence per-axis. Falls back to the resolved
   * handler, then to 1×1 if neither is available.
   * @returns The intrinsic width and height in cm.
   */
  public measure(): {width: number; height: number} {
    const hasOverrideW = this._overrideWidth > 0
    const hasOverrideH = this._overrideHeight > 0

    // Both axes overridden — skip handler entirely
    if (hasOverrideW && hasOverrideH) {
      return {width: this._overrideWidth, height: this._overrideHeight}
    }

    // Partial override — merge with handler measurement
    const handlerSize = this._handler
      ? this._handler.measure(this.sceneObject)
      : {width: 1, height: 1}

    return {
      width: hasOverrideW ? this._overrideWidth : handlerSize.width,
      height: hasOverrideH ? this._overrideHeight : handlerSize.height,
    }
  }

  /**
   * Applies the computed layout position and size to the underlying SceneObject.
   * Called by the parent layout container after running the layout algorithm.
   *
   * When a handler is resolved, delegates to it. Otherwise falls back to
   * positioning + proportional scaling based on the override size.
   * @param x - Center X position in parent-local coordinates (cm).
   * @param y - Center Y position in parent-local coordinates (cm).
   * @param width - Allocated width (cm).
   * @param height - Allocated height (cm).
   */
  public applyLayout(x: number, y: number, width: number, height: number): void {
    this._allocatedWidth = width
    this._allocatedHeight = height
    if (this._handler) {
      this._handler.apply(this.sceneObject, x, y, width, height)
    } else {
      // Fallback: position the object and scale proportionally.
      // Override size represents the "natural" size at scale (1,1,1).
      const transform = this.sceneObject.getTransform()
      const current = transform.getLocalPosition()
      transform.setLocalPosition(new vec3(x, y, current.z))

      const declaredW = this._overrideWidth > 0 ? this._overrideWidth : 1
      const declaredH = this._overrideHeight > 0 ? this._overrideHeight : 1
      const currentScale = transform.getLocalScale()
      transform.setLocalScale(
        new vec3(width / declaredW, height / declaredH, currentScale.z)
      )
    }
  }

  /**
   * Returns the size allocated by the last layout pass.
   * Falls back to measure() if no layout has run yet.
   */
  public allocatedSize(): {width: number; height: number} {
    if (this._allocatedWidth >= 0 && this._allocatedHeight >= 0) {
      return {width: this._allocatedWidth, height: this._allocatedHeight}
    }
    return this.measure()
  }
}
