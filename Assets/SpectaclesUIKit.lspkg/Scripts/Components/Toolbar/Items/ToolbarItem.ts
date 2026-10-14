import {InteractorEvent} from "SpectaclesInteractionKit.lspkg/Core/Interactor/InteractorEvent"
import Event, {PublicApi} from "SpectaclesInteractionKit.lspkg/Utils/Event"
import ReplayEvent from "SpectaclesInteractionKit.lspkg/Utils/ReplayEvent"
import {
  getToolbarDirectionFromSceneObject,
  ToolbarDirection,
  ToolbarDirections,
  ToolbarItemConfig,
  ToolbarItemSizeMode
} from "../Types/ToolbarSchema"

/**
 * Base class for toolbar items (button, text field, slider, toggle, separator, custom).
 * Obtained via {@link Toolbar.getItem} or {@link Toolbar.allItems}. Subclasses are created by the toolbar factory.
 */
export abstract class ToolbarItem extends BaseScriptComponent {
  protected _config: ToolbarItemConfig
  protected _computedSize: vec2 = vec2.zero()
  protected readonly TOOLBAR_ITEM_RENDER_ORDER = 2
  protected readonly DISABLED_ALPHA = 0.2
  protected _renderOrder: number = 0
  protected _size: vec3 = new vec3(6, 3, 3)
  protected _inactive: boolean = false
  protected managedSceneObjects: Set<SceneObject> = new Set<SceneObject>()
  protected managedComponents: Set<Component> = new Set<Component>()

  private _transform: Transform = this.sceneObject.getTransform()
  private _cachedDirection: ToolbarDirection = ToolbarDirections.HORIZONTAL

  private onTriggerUpEvent: Event<InteractorEvent> = new Event<InteractorEvent>()
  /** Fires when the user completes a trigger interaction on this item. */
  public readonly onTriggerUp: PublicApi<InteractorEvent> = this.onTriggerUpEvent.publicApi()

  private onTriggerDownEvent: Event<InteractorEvent> = new Event<InteractorEvent>()
  /** Fires when the user begins a trigger interaction on this item. */
  public readonly onTriggerDown: PublicApi<InteractorEvent> = this.onTriggerDownEvent.publicApi()

  private onHoverEnterEvent: Event<InteractorEvent> = new Event<InteractorEvent>()
  /** Fires when the user's hand or pointer enters this item. */
  public readonly onHoverEnter: PublicApi<InteractorEvent> = this.onHoverEnterEvent.publicApi()

  private onHoverExitEvent: Event<InteractorEvent> = new Event<InteractorEvent>()
  /** Fires when the user's hand or pointer exits this item. */
  public readonly onHoverExit: PublicApi<InteractorEvent> = this.onHoverExitEvent.publicApi()

  private onInitializedEvent: ReplayEvent = new ReplayEvent()
  /** Fires once when the item has been fully initialized via initializeWithConfig. */
  public readonly onInitialized: PublicApi<void> = this.onInitializedEvent.publicApi()

  private onSizeChangedEvent: Event<vec3> = new Event<vec3>()
  /** Fires when the item's computed size changes. */
  public readonly onSizeChanged: PublicApi<vec3> = this.onSizeChangedEvent.publicApi()

  // --- ToolbarItem API ---

  /** Unique id of this item (from config or generated). */
  public get id(): string {
    return this._config.id!
  }

  /** Config used to create this item. */
  public get config(): ToolbarItemConfig {
    return this._config
  }

  /** Size assigned by layout in centimeters (width, height). */
  public get computedSize(): vec2 {
    return this._computedSize
  }

  public set computedSize(size: vec2) {
    this._computedSize = size
    this._size = new vec3(size.x, size.y, this._size.z)
    this.onSizeChangedEvent.invoke(this._size)
  }

  /** Transform of this item's scene object. */
  public get transform(): Transform {
    return this._transform
  }

  /** Current size of this item. */
  public get size(): vec3 {
    return this._size
  }

  /** When true, the item is visible but not interactive. */
  public get inactive(): boolean {
    return this._inactive
  }

  public set inactive(value: boolean) {
    this._inactive = value
    this._config.inactive = value
  }

  /** Intrinsic size of the item in centimeters before layout. */
  public abstract get intrinsicSize(): vec2

  /** Size mode: fill (takes available space) or manual (explicit size). */
  public abstract getSizeMode(): ToolbarItemSizeMode

  /**
   * Called by the toolbar when the item is created. Not intended for external callers.
   */
  public initializeWithConfig(config: ToolbarItemConfig) {
    this._config = config
    this._cachedDirection = getToolbarDirectionFromSceneObject(this.sceneObject)

    if (config.alpha !== undefined) {
      this.setAlpha(config.alpha)
    }

    if (config.renderOrder !== undefined) {
      this._renderOrder = config.renderOrder
    }

    this.setupCallbacks()
    this.initialize()

    if (config.inactive !== undefined) {
      this.inactive = config.inactive
      if (this.updateDisabledVisuals) {
        this.updateDisabledVisuals(config.inactive)
      }
    }

    this.onInitializedEvent.invoke()
  }

  /** Optional: called when the toolbar applies scale to this item (e.g. fill mode). */
  public onLayoutScaleApplied?(): void

  /** Optional: called when the toolbar has finished positioning this item. */
  public onLayoutApplied?(): void

  /**
   * Called by the toolbar to determine the final layout size before positioning.
   * Override in subclasses to apply type-specific size corrections.
   */
  public getFinalLayoutSize(layoutSize: vec2, _contentSpace: vec2): vec2 {
    return layoutSize
  }

  /** Applies visual alpha to this item. Called by Toolbar when toolbar-level opacity changes. */
  public applyAlpha(alpha: number): void {
    this.setVisualAlpha(alpha)
  }

  /** Returns the direction (horizontal or vertical) of the parent toolbar. */
  public getToolbarDirection(): ToolbarDirection {
    return this._cachedDirection
  }

  public onAwake() {
    this.createEvent("OnDestroyEvent").bind(() => this.release())
  }

  protected initialize(): void {}

  protected release(): void {
    this.managedComponents.forEach((component) => {
      if (!isNull(component) && component) {
        component.destroy()
      }
    })
    this.managedComponents.clear()
    this.managedSceneObjects.forEach((sceneObject) => {
      if (!isNull(sceneObject) && sceneObject) {
        sceneObject.destroy()
      }
    })
    this.managedSceneObjects.clear()
  }

  protected setupCallbacks() {
    if (this._config.onTriggerUp) {
      this.onTriggerUp.add(this._config.onTriggerUp)
    }

    if (this._config.onTriggerDown) {
      this.onTriggerDown.add(this._config.onTriggerDown)
    }

    if (this._config.onHoverEnter) {
      this.onHoverEnter.add(this._config.onHoverEnter)
    }

    if (this._config.onHoverExit) {
      this.onHoverExit.add(this._config.onHoverExit)
    }
  }

  protected setAlpha(alpha: number) {
    this._config.alpha = alpha
    this.setVisualAlpha(alpha)
  }

  protected abstract setVisualAlpha(alpha: number): void

  protected updateDisabledVisuals?(inactive: boolean): void

  /** Forwards the inner component's trigger-up event to this item's subscribers. */
  protected invokeOnTriggerUp(event: InteractorEvent): void {
    this.onTriggerUpEvent.invoke(event)
  }

  /** Forwards the inner component's trigger-down event to this item's subscribers. */
  protected invokeOnTriggerDown(event: InteractorEvent): void {
    this.onTriggerDownEvent.invoke(event)
  }

  /** Forwards the inner component's hover-enter event to this item's subscribers. */
  protected invokeOnHoverEnter(event: InteractorEvent): void {
    this.onHoverEnterEvent.invoke(event)
  }

  /** Forwards the inner component's hover-exit event to this item's subscribers. */
  protected invokeOnHoverExit(event: InteractorEvent): void {
    this.onHoverExitEvent.invoke(event)
  }
}
