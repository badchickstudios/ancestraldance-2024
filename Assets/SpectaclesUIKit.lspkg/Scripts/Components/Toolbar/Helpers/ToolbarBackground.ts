import {RoundedRectangle, RoundedRectBlendMode} from "../../../Visuals/RoundedRectangle/RoundedRectangle"
import {getDefaultBackgroundConfig, ToolbarConfig} from "../Types/ToolbarSchema"

@component
export class ToolbarBackground extends BaseScriptComponent {
  private _roundedRectangle: RoundedRectangle
  private _initialized: boolean = false

  public get roundedRectangle(): RoundedRectangle {
    return this._roundedRectangle
  }

  public initialize(config: ToolbarConfig) {
    if (this._initialized) {
      return
    }

    this._roundedRectangle = this.sceneObject.createComponent(RoundedRectangle.getTypeName())

    const bgConfig = config.background
    if (bgConfig?.enabled === false) {
      this._roundedRectangle.sceneObject.enabled = false
      this._initialized = true
      return
    }

    this._roundedRectangle.gradient = false
    this._roundedRectangle.border = false
    this._roundedRectangle.blendMode = RoundedRectBlendMode.Normal
    this._roundedRectangle.renderOrder = 1

    const defaults = getDefaultBackgroundConfig()

    this._roundedRectangle.cornerRadius = bgConfig?.cornerRadius ?? defaults.cornerRadius
    this._roundedRectangle.backgroundColor = bgConfig?.color ?? defaults.color

    this._initialized = true
  }

  public setSize(size: vec2) {
    this._roundedRectangle.size = size
  }

  public setAlpha(alpha: number) {
    if (this._roundedRectangle.renderMeshVisual) {
      this._roundedRectangle.renderMeshVisual.mainMaterial.mainPass.opacityFactor = alpha
      this._roundedRectangle.renderMeshVisual.enabled = true
    }
  }

  public setCornerRadius(radius: number) {
    this._roundedRectangle.cornerRadius = radius
  }
}
