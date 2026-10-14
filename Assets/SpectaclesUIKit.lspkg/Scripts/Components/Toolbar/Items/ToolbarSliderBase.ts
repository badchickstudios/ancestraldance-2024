import {DegToRad} from "SpectaclesInteractionKit.lspkg/Utils/mathUtils"
import {Slider} from "../../Slider/Slider"
import {Visual} from "../../../Visuals/Visual"
import {RoundedRectangleVisual} from "../../../Visuals/RoundedRectangle/RoundedRectangleVisual"
import {getSizeModeFromSize, ToolbarDirections, ToolbarItemConfig, ToolbarItemSizeMode} from "../Types/ToolbarSchema"
import {ToolbarItem} from "./ToolbarItem"

/**
 * Base for toolbar slider and toggle items. Obtain via {@link Toolbar.getItem} or {@link Toolbar.allItems}.
 */
export abstract class ToolbarSliderBase extends ToolbarItem {
  protected readonly DEFAULT_HEIGHT = 3.0
  private _sliderComponent: Slider

  /** Underlying Slider component (or Switch for toggle). */
  public get sliderComponent(): Slider {
    return this._sliderComponent
  }

  protected set sliderComponent(value: Slider) {
    this._sliderComponent = value
  }

  /** Overrides base to update slider disabled visuals. */
  public get inactive(): boolean {
    return super.inactive
  }

  public set inactive(value: boolean) {
    super.inactive = value
    if (this.sliderComponent) {
      this.sliderComponent.inactive = value
    }
    this.updateDisabledVisuals(value)
  }

  /** Intrinsic size from config or slider component size. */
  public get intrinsicSize(): vec2 {
    const componentSize = this.sliderComponent.size
    const sizeConfig = this.config?.size
    if (typeof sizeConfig === "object" && !(sizeConfig instanceof vec2)) {
      const x = typeof sizeConfig.x === "number" ? sizeConfig.x : componentSize.x
      const y = typeof sizeConfig.y === "number" ? sizeConfig.y : componentSize.y
      return new vec2(x, y)
    }
    return new vec2(componentSize.x, componentSize.y)
  }

  /** Called by the toolbar when the item is created. Not intended for external callers. */
  public initializeWithConfig(config: ToolbarItemConfig) {
    super.initializeWithConfig(config)
    this._sliderComponent.renderOrder = this._renderOrder || this.TOOLBAR_ITEM_RENDER_ORDER

    this._sliderComponent.onHoverEnter.add((e) => this.invokeOnHoverEnter(e))
    this._sliderComponent.onHoverExit.add((e) => this.invokeOnHoverExit(e))
    this._sliderComponent.onTriggerUp.add((e) => this.invokeOnTriggerUp(e))
    this._sliderComponent.onTriggerDown.add((e) => this.invokeOnTriggerDown(e))
  }

  /** Called when the toolbar applies scale to this item. */
  public onLayoutScaleApplied() {
    this.updateSliderLayout()
  }

  /** Size mode: fill or manual from config.size. */
  public getSizeMode(): ToolbarItemSizeMode {
    return getSizeModeFromSize(this.config.size)
  }

  protected updateSliderLayout() {
    if (!this.sliderComponent) return

    const actualSize = this.computedSize
    if (actualSize.x <= 0 || actualSize.y <= 0) return

    const direction = this.getToolbarDirection()
    const isVertical = direction === ToolbarDirections.VERTICAL

    let newSize: vec3
    if (isVertical) {
      newSize = new vec3(actualSize.y, actualSize.x, 0)
      this.transform.setLocalRotation(quat.fromEulerVec(new vec3(0, 0, 90 * DegToRad)))
    } else {
      newSize = new vec3(actualSize.x, actualSize.y, 0)
    }

    const currentValue = this.sliderComponent.currentValue
    this.sliderComponent.size = newSize

    const trackVisual = this.sliderComponent.visual as {cornerRadius?: number} | undefined
    if (trackVisual && typeof trackVisual.cornerRadius !== "undefined") {
      trackVisual.cornerRadius = Math.min(newSize.x, newSize.y) * 0.5
    }

    if (!this.sliderComponent.customKnobSize) {
      const newKnobSize = new vec2(newSize.y, newSize.y)
      this.sliderComponent.knobSize = newKnobSize
    }
    const sliderWithUpdate = this.sliderComponent as any
    if (typeof sliderWithUpdate.updateKnobPositionFromValue === "function") {
      sliderWithUpdate.updateKnobPositionFromValue()
    }
    if (typeof sliderWithUpdate.updateFillSize === "function") {
      sliderWithUpdate.updateFillSize()
    }
    this.sliderComponent.currentValue = currentValue
  }

  protected setVisualAlpha(alpha: number): void {
    const effectiveAlpha = this.inactive ? alpha * this.DISABLED_ALPHA : alpha
    this.setSliderVisualOpacity(effectiveAlpha)
  }

  protected updateDisabledVisuals(inactive: boolean) {
    const targetAlpha = inactive ? this.DISABLED_ALPHA : (this.config.alpha ?? 1.0)
    this.setSliderVisualOpacity(targetAlpha)
  }

  private setSliderVisualOpacity(alpha: number): void {
    this.setVisualOpacity(this.sliderComponent?.visual, alpha)
    this.setVisualOpacity(this.sliderComponent?.knobVisual, alpha)
    this.setVisualOpacity(this.sliderComponent?.trackFillVisual, alpha)
  }

  private setVisualOpacity(visual: Visual | undefined, alpha: number): void {
    if (!visual) return
    const rmv = visual.renderMeshVisual
    if (rmv) {
      rmv.enabled = true
      if (rmv.mainMaterial?.mainPass) {
        rmv.mainMaterial.mainPass.blendMode = BlendMode.PremultipliedAlphaAuto
      }
    }
    ;(visual as RoundedRectangleVisual).opacity = alpha
  }
}
