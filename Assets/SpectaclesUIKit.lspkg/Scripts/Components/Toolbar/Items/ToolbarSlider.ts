import {Slider} from "../../Slider/Slider"
import {ToolbarSliderConfig} from "../Types/ToolbarSchema"
import {ToolbarSliderBase} from "./ToolbarSliderBase"

/**
 * Toolbar slider item. Obtain via {@link Toolbar.getItem} or {@link Toolbar.allItems}.
 */
@component
export class ToolbarSlider extends ToolbarSliderBase {
  /** Called by the toolbar when the item is created. Not intended for external callers. */
  public initializeWithConfig(config: ToolbarSliderConfig) {
    this._config = config

    this.createSlider(config)

    const intrinsicSize = this.intrinsicSize
    this._size = new vec3(intrinsicSize.x, intrinsicSize.y, 0)

    super.initializeWithConfig(config)
  }

  private createSlider(config: ToolbarSliderConfig) {
    this.sliderComponent = this.sceneObject.createComponent(Slider.getTypeName()) as Slider
    this.managedComponents.add(this.sliderComponent)
    this.sliderComponent.initialize()

    if (config.segmented) {
      this.sliderComponent.segmented = true
      const n = config.numberOfSegments ?? 2
      this.sliderComponent.numberOfSegments = Math.max(2, n)
    }

    let initialValue = config.value ?? config.min
    if (config.step !== undefined && config.step > 0) {
      initialValue = config.min + Math.round((initialValue - config.min) / config.step) * config.step
      initialValue = MathUtils.clamp(initialValue, config.min, config.max)
    }
    const normalizedValue = this.normalizeValue(initialValue, config.min, config.max)
    this.sliderComponent.currentValue = normalizedValue

    if (config.onValueChanged) {
      this.sliderComponent.onValueChange.add((normalizedValue: number) => {
        const actualValue = this.denormalizeValue(normalizedValue, config.min, config.max, config.step)
        config.onValueChanged?.(actualValue)
      })
    }

    if (this.sliderComponent.visual && this.sliderComponent.visual.renderMeshVisual) {
      this.sliderComponent.visual.renderMeshVisual.mainMaterial.mainPass.blendMode = BlendMode.PremultipliedAlphaAuto
    }
  }

  private normalizeValue(value: number, min: number, max: number): number {
    if (max === min) return 0
    return MathUtils.clamp((value - min) / (max - min), 0, 1)
  }

  private denormalizeValue(normalized: number, min: number, max: number, step?: number): number {
    let value = min + normalized * (max - min)
    if (step !== undefined && step > 0) {
      value = min + Math.round((value - min) / step) * step
    }
    return MathUtils.clamp(value, min, max)
  }
}
