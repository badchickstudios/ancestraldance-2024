import {OpacityControllable} from "../../Interfaces/OpacityControllable"
import {RoundedRectangleVisual} from "../../Visuals/RoundedRectangle/RoundedRectangleVisual"
import {BaseButton} from "./BaseButton"

/**
 * Main Button component for UIKit
 * Select Theme, Shape and Style
 */
@component
export class Button extends BaseButton implements OpacityControllable {
  @input
  @showIf("_themeOverride", "SnapOS2")
  @label("Shape")
  @widget(
    new ComboBoxWidget([
      new ComboBoxItem("Rectangle", "Rectangle"),
      new ComboBoxItem("Capsule", "Capsule"),
      new ComboBoxItem("Round", "Round")
    ])
  )
  protected _shapeSnapOS2: string = "Rectangle"

  @input
  @showIf("_themeOverride", "SnapOS3")
  @label("Shape")
  @widget(
    new ComboBoxWidget([
      new ComboBoxItem("Rectangle", "Rectangle"),
      new ComboBoxItem("Capsule", "Capsule"),
      new ComboBoxItem("Round", "Round")
    ])
  )
  protected _shapeSnapOS3: string = "Rectangle"

  @input
  @showIf("_themeOverride", "SnapOS2")
  @label("Style")
  @widget(
    new ComboBoxWidget([
      new ComboBoxItem("PrimaryNeutral", "PrimaryNeutral"),
      new ComboBoxItem("Primary", "Primary"),
      new ComboBoxItem("Secondary", "Secondary"),
      new ComboBoxItem("Special", "Special"),
      new ComboBoxItem("Ghost", "Ghost")
    ])
  )
  protected _styleSnapOS2: string = "PrimaryNeutral"

  @input
  @showIf("_themeOverride", "SnapOS3")
  @label("Style")
  @widget(
    new ComboBoxWidget([
      new ComboBoxItem("Neutral", "Neutral"),
      new ComboBoxItem("Accent", "Accent"),
      new ComboBoxItem("Subtle", "Subtle"),
      new ComboBoxItem("Alert", "Alert"),
      new ComboBoxItem("Transparent", "Transparent")
    ])
  )
  protected _styleSnapOS3: string = "Neutral"

  protected get effectiveStyle(): string {
    switch (this.normalizedThemeOverride) {
      case "SnapOS2":
        return this._styleSnapOS2
      case "SnapOS3":
        return this._styleSnapOS3
      default:
        return this.resolveTheme().defaultStyleName
    }
  }

  protected get effectiveShape(): string {
    switch (this.normalizedThemeOverride) {
      case "SnapOS2":
        return this._shapeSnapOS2
      case "SnapOS3":
        return this._shapeSnapOS3
      default:
        return this.resolveTheme().defaultShapeName ?? "Rectangle"
    }
  }

  @input
  @widget(new SliderWidget(0, 1))
  protected _opacity: number = 1.0

  public get opacity(): number {
    const visual = this.getVisualAsRoundedRectVisual()
    return visual ? visual.opacity : this._opacity
  }

  public set opacity(opacity: number) {
    this._opacity = opacity
    const visual = this.getVisualAsRoundedRectVisual()
    if (!visual) {
      return
    }
    if (!this.isAlwaysTransparent) {
      visual.transparencyEnabled = opacity < 1.0
    }
    visual.opacity = opacity
  }

  public get size(): vec3 {
    return this._size
  }

  public set size(size: vec3) {
    if (size === undefined) {
      return
    }
    const shape = this.effectiveShape
    if (shape === "Round") {
      size = new vec3(size.x, size.x, size.z)
    }
    super.size = size
    if (this._initialized) {
      const visual = this.getVisualAsRoundedRectVisual()
      if (visual) {
        visual.size = size
        visual.cornerRadius = this.getCornerRadius()
      }
    }
  }

  protected createDefaultVisual(): void {
    if (this._visual) {
      return
    }

    const shape = this.effectiveShape
    if (shape === "Round") {
      this._size = new vec3(this._size.x, this._size.x, 1)
    }

    const alwaysTransparent = this.isAlwaysTransparent
    const defaultVisual: RoundedRectangleVisual = new RoundedRectangleVisual({
      sceneObject: this.sceneObject,
      style: {
        visualElementType: "Button",
        style: this.effectiveStyle,
        themeName: this.normalizedThemeOverride !== "Inherited" ? this.normalizedThemeOverride : undefined
      },
      transparent: alwaysTransparent || this._opacity < 1.0
    })
    defaultVisual.cornerRadius = this.getCornerRadius()
    defaultVisual.opacity = this._opacity
    this._visual = defaultVisual
  }

  protected get isAlwaysTransparent(): boolean {
    const style = this.effectiveStyle
    return style === "Ghost" || style === "Transparent"
  }

  private getCornerRadius(): number {
    const shape = this.effectiveShape
    switch (shape) {
      case "Capsule":
        return Math.min(this._size.x, this._size.y) * 0.5
      case "Round":
        return this._size.x * 0.5
      default:
        return 0.5
    }
  }

  private getVisualAsRoundedRectVisual(): RoundedRectangleVisual | undefined {
    if (!this._visual) {
      return undefined
    }
    if (!(this._visual instanceof RoundedRectangleVisual)) {
      return undefined
    }
    return this._visual as RoundedRectangleVisual
  }
}
