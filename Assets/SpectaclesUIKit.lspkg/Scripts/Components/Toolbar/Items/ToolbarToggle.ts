import {Switch} from "../../Switch/Switch"
import {ToolbarDirections, ToolbarItemSizeMode, ToolbarToggleConfig} from "../Types/ToolbarSchema"
import {ToolbarSliderBase} from "./ToolbarSliderBase"

/**
 * Toolbar item that wraps a Switch component. Obtain via {@link Toolbar.getItem} or {@link Toolbar.allItems}.
 */
@component
export class ToolbarToggle extends ToolbarSliderBase {
  /** Underlying Switch component. */
  public get switchComponent(): Switch {
    return this.sliderComponent as Switch
  }

  /** Called by the toolbar when the item is created. Not intended for external callers. */
  public initializeWithConfig(config: ToolbarToggleConfig) {
    this._config = config

    this.createSwitch(config)

    const size = this.intrinsicSize
    this._size = new vec3(size.x, size.y, 0)

    super.initializeWithConfig(config)
  }

  /** In vertical toolbars, fill-mode toggles need their width set to the full content space width. */
  public getFinalLayoutSize(layoutSize: vec2, contentSpace: vec2): vec2 {
    if (this.getSizeMode() === ToolbarItemSizeMode.FILL && this.getToolbarDirection() === ToolbarDirections.VERTICAL) {
      const crossAxisSize = layoutSize.x > 0 ? layoutSize.x : 3.0
      return new vec2(contentSpace.x, crossAxisSize)
    }
    return layoutSize
  }

  protected updateSliderLayout() {
    if (!this.sliderComponent) return

    const actualSize = this.computedSize
    if (actualSize.x <= 0 || actualSize.y <= 0) return

    const newSize = new vec3(actualSize.x, actualSize.y, 0)
    const currentValue = this.sliderComponent.currentValue
    this.sliderComponent.size = newSize

    const visual = this.sliderComponent.visual as {cornerRadius?: number} | undefined
    if (visual && typeof visual.cornerRadius !== "undefined") {
      visual.cornerRadius = newSize.y * 0.5
    }

    if (!this.sliderComponent.customKnobSize) {
      const newKnobSize = new vec2(newSize.y, newSize.y)
      this.sliderComponent.knobSize = newKnobSize
    }
    const sliderWithUpdate = this.sliderComponent as unknown as {updateKnobPositionFromValue?: () => void}
    if (typeof sliderWithUpdate.updateKnobPositionFromValue === "function") {
      sliderWithUpdate.updateKnobPositionFromValue()
    }
    this.sliderComponent.currentValue = currentValue
  }

  private createSwitch(config: ToolbarToggleConfig) {
    this.sliderComponent = this.sceneObject.createComponent(Switch.getTypeName()) as Switch
    this.managedComponents.add(this.sliderComponent)
    this.sliderComponent.initialize()

    const switchComponent = this.sliderComponent as Switch
    if (config.isOn !== undefined) {
      switchComponent.isOn = config.isOn
    }

    if (config.onToggled) {
      switchComponent.onValueChange.add((value: number) => {
        const isOn = value > 0
        config.onToggled?.(isOn)
      })
    }

    if (this.sliderComponent.visual && this.sliderComponent.visual.renderMeshVisual) {
      this.sliderComponent.visual.renderMeshVisual.mainMaterial.mainPass.blendMode = BlendMode.PremultipliedAlphaAuto
    }
  }
}
