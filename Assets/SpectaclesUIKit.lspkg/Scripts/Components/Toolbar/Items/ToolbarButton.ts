import animate, {CancelSet} from "SpectaclesInteractionKit.lspkg/Utils/animate"
import {BaseRoundedRectButton} from "../../Button/BaseRoundedRectButton"
import {CapsuleButton} from "../../Button/CapsuleButton"
import {RectangleButton} from "../../Button/RectangleButton"
import {
  getSizeModeFromSize,
  ToolbarAlignment,
  ToolbarButtonConfig,
  ToolbarButtonType,
  ToolbarHorizontalAlignment,
  ToolbarIconSizeMode,
  ToolbarItemSizeMode
} from "../Types/ToolbarSchema"
import {ToolbarItem} from "./ToolbarItem"

const imageMaterial: Material = requireAsset("../../../../Materials/Image.mat") as Material

/**
 * Toolbar button item (rectangle or capsule, with optional icon and text). Obtain via {@link Toolbar.getItem} or {@link Toolbar.allItems}.
 */
@component
export class ToolbarButton extends ToolbarItem {
  private button: BaseRoundedRectButton
  private iconImage: Image | null = null
  private iconObject: SceneObject | null = null
  private iconTransform: Transform | null = null
  private textComponent: Text | null = null
  private textObject: SceneObject | null = null
  private textTransform: Transform | null = null
  private hasIcon: boolean = false
  private hasText: boolean = false
  private textHiddenDueToSize: boolean = false
  private iconPositionTween: CancelSet = new CancelSet()
  private isIconAnimating: boolean = false

  private readonly ICON_SIZE = 1.1
  private readonly MIN_BUTTON_SIZE = 3.0
  private readonly TEXT_SIZE = 30
  private readonly TEXT_PADDING = 1
  private readonly ICON_TEXT_SPACING = 0.6
  private readonly HIDE_TEXT_PADDING = 0.3
  private readonly ICON_Z_POSITION = new vec3(0, 0, 0.1)
  private readonly TEXT_Z_POSITION = new vec3(0, 0, 0.01)
  private readonly MIN_BUTTON_SIZE_VEC2 = new vec2(this.MIN_BUTTON_SIZE, this.MIN_BUTTON_SIZE)

  /** Underlying button component. */
  public get buttonComponent(): BaseRoundedRectButton {
    return this.button
  }

  /** Button label text. */
  public get text(): string {
    return this.buttonConfig.text ?? this.textComponent?.text ?? ""
  }

  public set text(value: string) {
    const config = this.buttonConfig
    config.text = value

    if (!this.textComponent && value) {
      this.hasText = true
      this.textObject = global.scene.createSceneObject("Text")
      this.textObject.setParent(this.sceneObject)
      this.managedSceneObjects.add(this.textObject)
      this.textTransform = this.textObject.getTransform()

      const buttonRenderOrder = this._config?.renderOrder || this.TOOLBAR_ITEM_RENDER_ORDER
      this.button.renderOrder = buttonRenderOrder

      this.textComponent = this.textObject.createComponent("Component.Text") as Text
      this.textComponent.size = this.TEXT_SIZE
      this.textComponent.renderOrder = buttonRenderOrder + 2
      this.textComponent.verticalAlignment = VerticalAlignment.Center
      this.textComponent.horizontalAlignment = HorizontalAlignment.Center

      const textWidth = 10
      const textHeight = 3
      this.textComponent.worldSpaceRect = Rect.create(-textWidth / 2, textWidth / 2, -textHeight / 2, textHeight / 2)

      this.textTransform.setLocalPosition(this.TEXT_Z_POSITION)
    }

    if (this.textComponent) {
      this.textComponent.text = value
      this.updateLayout()
    }
  }

  /** Button icon texture. */
  public get icon(): Texture | undefined {
    return this.buttonConfig.icon
  }

  public set icon(value: Texture | undefined) {
    if (!value) return
    const config = this.buttonConfig
    config.icon = value
    const iconSizeMode = config.iconSizeMode || ToolbarIconSizeMode.FIXED

    if (this.iconImage) {
      this.iconImage.mainPass.baseTex = value
      if (iconSizeMode === ToolbarIconSizeMode.FILL) {
        const buttonSize = this.button.size
        this.iconTransform.setLocalScale(new vec3(buttonSize.x, buttonSize.y, 1))
      }
    } else {
      this.hasIcon = true
      this.iconObject = global.scene.createSceneObject("Icon")
      this.iconObject.setParent(this.sceneObject)
      this.managedSceneObjects.add(this.iconObject)

      const buttonRenderOrder = this.button.visual?.renderMeshVisual?.getRenderOrder() ?? this.TOOLBAR_ITEM_RENDER_ORDER

      this.iconImage = this.iconObject.createComponent("Component.Image") as Image
      this.iconImage.mainMaterial = imageMaterial.clone()
      this.iconImage.mainPass.baseTex = value
      this.iconImage.stretchMode = StretchMode.Stretch
      this.iconImage.verticalAlignment = VerticalAlignment.Center
      this.iconImage.horizontalAlignment = HorizontalAlignment.Center
      this.iconImage.renderOrder = buttonRenderOrder + 1

      this.iconTransform = this.iconObject.getTransform()
      if (iconSizeMode === ToolbarIconSizeMode.FILL) {
        const buttonSize = this.button.size
        this.iconTransform.setLocalScale(new vec3(buttonSize.x, buttonSize.y, 1))
      } else {
        this.iconTransform.setLocalScale(new vec3(this.ICON_SIZE, this.ICON_SIZE, 1))
      }
      this.iconTransform.setLocalPosition(this.ICON_Z_POSITION)

      this.updateLayout()
    }
  }

  /** Overrides base to update button disabled visuals. */
  public get inactive(): boolean {
    return super.inactive
  }

  public set inactive(value: boolean) {
    super.inactive = value
    if (this.button) {
      this.button.inactive = value
    }
    this.updateDisabledVisuals(value)
  }

  /** Intrinsic size from config or calculated from icon/text. */
  public get intrinsicSize(): vec2 {
    const config = this.buttonConfig
    if (config.size instanceof vec2) {
      return config.size
    }
    return this.calculateIntrinsicSize(config)
  }

  /** Called by the toolbar when the item is created. Not intended for external callers. */
  public initializeWithConfig(config: ToolbarButtonConfig) {
    this._config = config

    this.hasIcon = !!config.icon
    const iconSizeMode = config.iconSizeMode || ToolbarIconSizeMode.FIXED
    this.hasText = iconSizeMode === ToolbarIconSizeMode.FILL ? false : !!config.text
    const size = this.calculateIntrinsicSize(config)
    this._size = new vec3(size.x, size.y, 0)

    this.createButton(config)

    super.initializeWithConfig(config)
  }

  /** Size mode: fill or manual from config.size. */
  public getSizeMode(): ToolbarItemSizeMode {
    return getSizeModeFromSize((this.buttonConfig).size)
  }

  /** Called when the toolbar applies scale to this item (e.g. fill or manual size). */
  public onLayoutScaleApplied() {
    const config = this.buttonConfig

    if (config.hideTextWhenTooSmall && this.hasIcon && this.hasText && this.textObject && this.iconObject) {
      const actualButtonWidth = this.button.size.x
      const textWidth = this.getActualTextWidth() + this.HIDE_TEXT_PADDING * 2
      const minWidthForBoth = this.ICON_SIZE + this.ICON_TEXT_SPACING + textWidth + this.TEXT_PADDING * 2
      const hideThreshold = minWidthForBoth * 0.85

      if (actualButtonWidth < hideThreshold) {
        if (!this.textHiddenDueToSize) {
          this.textObject.enabled = false
          this.textHiddenDueToSize = true

          const currentPos = this.iconTransform.getLocalPosition()
          const targetPos = this.ICON_Z_POSITION

          this.iconPositionTween.cancel()
          this.isIconAnimating = true

          animate({
            duration: 0.2,
            update: (t: number) => {
              const pos = new vec3(
                currentPos.x + (targetPos.x - currentPos.x) * t,
                currentPos.y + (targetPos.y - currentPos.y) * t,
                currentPos.z + (targetPos.z - currentPos.z) * t
              )
              this.iconTransform.setLocalPosition(pos)
            },
            ended: () => {
              this.iconTransform.setLocalPosition(targetPos)
              this.isIconAnimating = false
            },
            cancelSet: this.iconPositionTween
          })
        }
      } else {
        if (this.textHiddenDueToSize) {
          this.textObject.enabled = true
          this.textHiddenDueToSize = false

          this.iconPositionTween.cancel()
          this.isIconAnimating = true

          const iconAlignment = config.iconAlignment || ToolbarHorizontalAlignment.LEFT
          const currentPos = this.iconTransform.getLocalPosition()
          const actualButtonSize = this.button.size
          const targetPos = this.calculateIconPositionForFillMode(actualButtonSize, iconAlignment)

          animate({
            duration: 0.2,
            update: (t: number) => {
              const pos = new vec3(
                currentPos.x + (targetPos.x - currentPos.x) * t,
                currentPos.y + (targetPos.y - currentPos.y) * t,
                currentPos.z + (targetPos.z - currentPos.z) * t
              )
              this.iconTransform.setLocalPosition(pos)
            },
            ended: () => {
              this.iconTransform.setLocalPosition(targetPos)
              this.isIconAnimating = false
              this.updateLayout()
            },
            cancelSet: this.iconPositionTween
          })
        }
      }
    }

    this.applyCounterScale()
    this.updateLayout()
  }

  /** Re-applies layout scale and icon/text position (e.g. after changing size at runtime). */
  public forceLayoutUpdate() {
    this.onLayoutScaleApplied()
  }

  protected setVisualAlpha(alpha: number): void {
    if (this.button) {
      this.button.opacity = alpha
    }

    const effectiveAlpha = (this.config.inactive ?? false) ? alpha * this.DISABLED_ALPHA : alpha

    if (this.hasIcon && this.iconImage) {
      const currentColor = this.iconImage.mainPass.baseColor
      this.iconImage.mainPass.baseColor = new vec4(currentColor.r, currentColor.g, currentColor.b, effectiveAlpha)
    }

    if (this.hasText && this.textComponent) {
      const currentColor = this.textComponent.textFill.color
      this.textComponent.textFill.color = new vec4(currentColor.r, currentColor.g, currentColor.b, effectiveAlpha)
    }
  }

  protected updateDisabledVisuals(inactive: boolean): void {
    const config = this.buttonConfig
    const baseAlpha = config.alpha !== undefined ? config.alpha : 1.0
    const targetAlpha = inactive ? this.DISABLED_ALPHA : baseAlpha

    if (this.button?.visual?.renderMeshVisual) {
      this.button.visual.renderMeshVisual.mainMaterial.mainPass.opacityFactor = targetAlpha
    }

    if (this.hasIcon && this.iconImage) {
      const currentColor = this.iconImage.mainPass.baseColor
      this.iconImage.mainPass.baseColor = new vec4(currentColor.r, currentColor.g, currentColor.b, targetAlpha)
    }

    if (this.hasText && this.textComponent) {
      const currentColor = this.textComponent.textFill.color
      this.textComponent.textFill.color = new vec4(currentColor.r, currentColor.g, currentColor.b, targetAlpha)
    }
  }

  private get buttonConfig(): ToolbarButtonConfig {
    return this._config as ToolbarButtonConfig
  }

  private calculateIconPositionForFillMode(buttonSize: vec3, iconAlignment: ToolbarHorizontalAlignment): vec3 {
    const buttonHalfWidth = buttonSize.x / 2
    const padding = this.TEXT_PADDING

    if (iconAlignment === ToolbarHorizontalAlignment.RIGHT) {
      const iconRightEdge = buttonHalfWidth - padding
      return new vec3(iconRightEdge - this.ICON_SIZE / 2, 0, 0.1)
    } else {
      return new vec3(-buttonHalfWidth + padding + this.ICON_SIZE / 2, 0, 0.1)
    }
  }

  private calculateIntrinsicSize(config: ToolbarButtonConfig): vec2 {
    if (this.hasIcon && this.hasText) {
      const textWidth = this.estimateTextWidthFromStringWithSize(config.text || "", this.TEXT_SIZE)
      const totalWidth = this.ICON_SIZE + this.ICON_TEXT_SPACING + textWidth + this.TEXT_PADDING * 2
      return new vec2(Math.max(totalWidth, this.MIN_BUTTON_SIZE), this.MIN_BUTTON_SIZE)
    } else if (this.hasIcon) {
      return this.MIN_BUTTON_SIZE_VEC2
    } else if (this.hasText) {
      const rawTextWidth = this.estimateTextWidthFromStringWithSize(config.text || "", this.TEXT_SIZE)
      const textWidth = rawTextWidth + this.TEXT_PADDING * 2
      return new vec2(Math.max(textWidth, this.MIN_BUTTON_SIZE), this.MIN_BUTTON_SIZE)
    }

    return this.MIN_BUTTON_SIZE_VEC2
  }

  private getActualTextWidth(): number {
    if (!this.textComponent || !this.textComponent.text) return 0

    try {
      const boundingBox = this.textComponent.getBoundingBox()
      const worldPos = this.textTransform.getWorldPosition()
      const worldToLocal = this.textTransform.getInvertedWorldTransform()

      const worldMin = new vec3(boundingBox.left, boundingBox.bottom, worldPos.z)
      const worldMax = new vec3(boundingBox.right, boundingBox.top, worldPos.z)

      const localMin = worldToLocal.multiplyPoint(worldMin)
      const localMax = worldToLocal.multiplyPoint(worldMax)

      const localWidth = Math.abs(localMax.x - localMin.x)

      if (localWidth > 0 && localWidth < 1000) {
        return localWidth
      }

      const textSize = this.textComponent.size || this.TEXT_SIZE
      return this.estimateTextWidthFromStringWithSize(this.textComponent.text, textSize)
    } catch {
      return this.estimateTextWidthFromStringWithSize(this.textComponent.text, this.TEXT_SIZE)
    }
  }

  private estimateTextWidthFromStringWithSize(text: string, fontSize: number): number {
    if (!text) return 0

    const lines = text.split(/\r?\n/).filter((line) => line.length > 0)
    const measureLines = lines.length > 0 ? lines : [text]
    let maxLineWidth = 0

    const charWidthMultiplier = fontSize * 0.015

    for (const line of measureLines) {
      let lineWidth: number
      if (line.length === 1) {
        lineWidth = fontSize * 0.05
      } else if (line.length === 2) {
        lineWidth = line.length * fontSize * 0.035
      } else if (line.length <= 5) {
        lineWidth = line.length * fontSize * 0.025
      } else {
        lineWidth = line.length * charWidthMultiplier
      }
      if (lineWidth > maxLineWidth) {
        maxLineWidth = lineWidth
      }
    }

    return Math.max(maxLineWidth, fontSize * 0.05)
  }

  private createButton(config: ToolbarButtonConfig) {
    const buttonType = config.buttonType || ToolbarButtonType.RECTANGLE

    if (buttonType === ToolbarButtonType.CAPSULE) {
      this.button = this.sceneObject.createComponent(CapsuleButton.getTypeName()) as CapsuleButton
    } else {
      this.button = this.sceneObject.createComponent(RectangleButton.getTypeName()) as RectangleButton
    }

    this.managedComponents.add(this.button)
    this.button.initialize()
    this.button.renderOrder = this._config?.renderOrder ?? this.TOOLBAR_ITEM_RENDER_ORDER

    this.button.onTriggerUp.add((e) => this.invokeOnTriggerUp(e))
    this.button.onTriggerDown.add((e) => this.invokeOnTriggerDown(e))
    this.button.onHoverEnter.add((e) => this.invokeOnHoverEnter(e))
    this.button.onHoverExit.add((e) => this.invokeOnHoverExit(e))

    if (this.button.visual && this.button.visual.renderMeshVisual) {
      this.button.visual.renderMeshVisual.mainMaterial.mainPass.blendMode = BlendMode.PremultipliedAlphaAuto
    }

    const buttonRenderOrder = this.button.visual?.renderMeshVisual?.getRenderOrder() || this.TOOLBAR_ITEM_RENDER_ORDER
    const iconSizeMode = config.iconSizeMode || ToolbarIconSizeMode.FIXED

    if (config.icon) {
      this.iconObject = global.scene.createSceneObject("Icon")
      this.iconObject.setParent(this.sceneObject)
      this.managedSceneObjects.add(this.iconObject)
      this.iconTransform = this.iconObject.getTransform()

      this.iconImage = this.iconObject.createComponent("Component.Image") as Image
      this.iconImage.mainMaterial = imageMaterial.clone()
      this.iconImage.mainPass.baseTex = config.icon
      this.iconImage.stretchMode = StretchMode.Stretch
      this.iconImage.verticalAlignment = VerticalAlignment.Center
      this.iconImage.horizontalAlignment = HorizontalAlignment.Center
      this.iconImage.renderOrder = buttonRenderOrder + 1

      if (iconSizeMode === ToolbarIconSizeMode.FILL) {
        const buttonSize = this.button.size
        this.iconTransform.setLocalScale(new vec3(buttonSize.x, buttonSize.y, 1))
      } else {
        this.iconTransform.setLocalScale(new vec3(this.ICON_SIZE, this.ICON_SIZE, 1))
      }
      this.iconTransform.setLocalPosition(this.ICON_Z_POSITION)
    }

    if (config.text && iconSizeMode !== ToolbarIconSizeMode.FILL) {
      this.textObject = global.scene.createSceneObject("Text")
      this.textObject.setParent(this.sceneObject)
      this.managedSceneObjects.add(this.textObject)
      this.textTransform = this.textObject.getTransform()

      this.textComponent = this.textObject.createComponent("Component.Text") as Text
      this.textComponent.text = config.text
      this.textComponent.size = this.TEXT_SIZE
      this.textComponent.renderOrder = buttonRenderOrder + 2
      this.textComponent.verticalAlignment = VerticalAlignment.Center
      this.textComponent.horizontalAlignment = HorizontalAlignment.Center

      this.textTransform.setLocalScale(new vec3(1, 1, 1))
      this.textTransform.setLocalPosition(new vec3(0, 0, 0.2))
    }
  }

  private updateLayout() {
    if (!this.button) {
      return
    }

    const config = this.buttonConfig
    const actualButtonSize = this.button.size
    const iconSizeMode = config.iconSizeMode || ToolbarIconSizeMode.FIXED
    const iconAlignment = config.iconAlignment || ToolbarHorizontalAlignment.LEFT
    const textAlignment = config.textAlignment || ToolbarAlignment.CENTER

    if (this.hasIcon && iconSizeMode === ToolbarIconSizeMode.FILL && this.iconObject) {
      this.iconTransform.setLocalScale(new vec3(actualButtonSize.x, actualButtonSize.y, 1))
      this.iconTransform.setLocalPosition(this.ICON_Z_POSITION)
      this.enableComponents()
      this.setRenderOrders()
    } else if (this.hasIcon && this.hasText) {
      if (this.textHiddenDueToSize) {
        this.handleTextHiddenState()
        this.enableComponents()
        this.setRenderOrders()
        return
      }
      if (!this.iconObject || !this.textObject) {
        return
      }
      const textWidth = this.getActualTextWidth()
      this.positionIconAndText(actualButtonSize, iconAlignment, textAlignment, textWidth)
    } else if (this.hasIcon) {
      if (!this.isIconAnimating) {
        this.iconTransform.setLocalPosition(this.ICON_Z_POSITION)
      }
      this.enableComponents()
      this.setRenderOrders()
    } else if (this.hasText) {
      this.positionTextOnly(actualButtonSize, textAlignment)
      this.enableComponents()
      this.setRenderOrders()
    }

    this.applyCounterScale()
  }

  private handleTextHiddenState() {
    if (this.iconObject) {
      if (!this.isIconAnimating) {
        this.iconTransform.setLocalPosition(this.ICON_Z_POSITION)
      }
      if (!this.iconObject.enabled) {
        this.iconObject.enabled = true
      }
      if (this.iconImage && !this.iconImage.enabled) {
        this.iconImage.enabled = true
      }
    }
    if (this.textObject && this.textObject.enabled) {
      this.textObject.enabled = false
    }
  }

  private positionIconAndText(
    buttonSize: vec3,
    iconAlignment: ToolbarHorizontalAlignment,
    textAlignment: ToolbarAlignment,
    textWidth: number
  ) {
    const buttonHalfWidth = buttonSize.x / 2
    const padding = this.TEXT_PADDING

    let iconPos: vec3
    let textLeftEdge: number
    let textRightEdge: number

    if (iconAlignment === ToolbarHorizontalAlignment.RIGHT) {
      const iconRightEdge = buttonHalfWidth - padding
      iconPos = new vec3(iconRightEdge - this.ICON_SIZE / 2, 0, 0.1)
      textLeftEdge = -buttonHalfWidth + padding
      textRightEdge = iconRightEdge - this.ICON_SIZE - this.ICON_TEXT_SPACING
    } else {
      iconPos = new vec3(-buttonHalfWidth + padding + this.ICON_SIZE / 2, 0, 0.1)
      const iconRightEdge = -buttonHalfWidth + padding + this.ICON_SIZE
      textLeftEdge = iconRightEdge + this.ICON_TEXT_SPACING
      textRightEdge = buttonHalfWidth - padding
    }

    const textPos = this.calculateTextPosition(textLeftEdge, textRightEdge, textAlignment, textWidth)

    if (!this.isIconAnimating) {
      this.iconTransform.setLocalPosition(iconPos)
    }

    this.setRenderOrders()
    this.enableComponents()

    if (!this.textHiddenDueToSize) {
      this.textTransform.setLocalPosition(textPos)
    } else if (this.textObject && this.textObject.enabled) {
      this.textObject.enabled = false
    }
  }

  private calculateTextPosition(
    textLeftEdge: number,
    textRightEdge: number,
    textAlignment: ToolbarAlignment,
    textWidth: number
  ): vec3 {
    let textPos: vec3
    if (textAlignment === ToolbarAlignment.LEFT) {
      textPos = new vec3(textLeftEdge, 0, 0.2)
      this.textComponent.horizontalAlignment = HorizontalAlignment.Left
      this.textComponent.worldSpaceRect = Rect.create(0, textWidth, -this.MIN_BUTTON_SIZE / 2, this.MIN_BUTTON_SIZE / 2)
    } else if (textAlignment === ToolbarAlignment.RIGHT) {
      textPos = new vec3(textRightEdge, 0, 0.2)
      this.textComponent.horizontalAlignment = HorizontalAlignment.Right
      this.textComponent.worldSpaceRect = Rect.create(
        -textWidth,
        0,
        -this.MIN_BUTTON_SIZE / 2,
        this.MIN_BUTTON_SIZE / 2
      )
    } else {
      const textCenter = (textLeftEdge + textRightEdge) / 2
      textPos = new vec3(textCenter, 0, 0.2)
      this.textComponent.horizontalAlignment = HorizontalAlignment.Center
      this.textComponent.worldSpaceRect = Rect.create(
        -textWidth / 2,
        textWidth / 2,
        -this.MIN_BUTTON_SIZE / 2,
        this.MIN_BUTTON_SIZE / 2
      )
    }
    return textPos
  }

  private positionTextOnly(buttonSize: vec3, textAlignment: ToolbarAlignment) {
    const textWidth = this.getActualTextWidth()
    const buttonHalfWidth = buttonSize.x / 2
    const padding = this.TEXT_PADDING
    const textLeftEdge = -buttonHalfWidth + padding
    const textRightEdge = buttonHalfWidth - padding

    const textPos = this.calculateTextPosition(textLeftEdge, textRightEdge, textAlignment, textWidth)

    if (!this.textHiddenDueToSize) {
      this.textTransform.setLocalPosition(textPos)
    }
  }

  private setRenderOrders() {
    const buttonRenderOrder = this.button.visual?.renderMeshVisual?.getRenderOrder() ?? this.TOOLBAR_ITEM_RENDER_ORDER
    if (this.iconImage) {
      this.iconImage.renderOrder = buttonRenderOrder + 1
    }
    if (this.textComponent && !this.textHiddenDueToSize) {
      this.textComponent.renderOrder = buttonRenderOrder + 2
    }
  }

  private enableComponents() {
    if (this.iconObject && !this.iconObject.enabled) {
      this.iconObject.enabled = true
    }
    if (this.iconImage && !this.iconImage.enabled) {
      this.iconImage.enabled = true
    }
    if (this.textObject && !this.textObject.enabled && !this.textHiddenDueToSize) {
      this.textObject.enabled = true
    }
    if (this.textComponent && !this.textComponent.enabled && !this.textHiddenDueToSize) {
      this.textComponent.enabled = true
    }
  }

  private applyCounterScale() {
    const config = this.buttonConfig
    const iconSizeMode = config.iconSizeMode || ToolbarIconSizeMode.FIXED

    if (this.iconObject) {
      if (iconSizeMode === ToolbarIconSizeMode.FILL) {
        const buttonSize = this.button.size
        this.iconTransform.setLocalScale(new vec3(buttonSize.x, buttonSize.y, 1))
      } else {
        this.iconTransform.setLocalScale(new vec3(this.ICON_SIZE, this.ICON_SIZE, 1))
      }
    }
    if (this.textObject) {
      this.textTransform.setLocalScale(new vec3(1, 1, 1))
    }
  }
}
