import {DegToRad} from "SpectaclesInteractionKit.lspkg/Utils/mathUtils"
import {TextInputField} from "../../TextInputField/TextInputField"
import {
  getSizeModeFromSize,
  ToolbarAlignment,
  ToolbarDirections,
  ToolbarItemSizeMode,
  ToolbarTextFieldConfig
} from "../Types/ToolbarSchema"
import {ToolbarItem} from "./ToolbarItem"

/**
 * Toolbar text field item. Obtain via {@link Toolbar.getItem} or {@link Toolbar.allItems}.
 */
@component
export class ToolbarTextField extends ToolbarItem {
  private readonly DEFAULT_WIDTH = 10.0
  private readonly DEFAULT_HEIGHT = 3.0
  private textField: TextInputField
  private textFieldConfig: ToolbarTextFieldConfig
  private lastAppliedSize: vec3 | null = null
  private userIsEditing: boolean = false

  /** Overrides base to update text field disabled visuals. */
  public get inactive(): boolean {
    return super.inactive
  }

  public set inactive(value: boolean) {
    super.inactive = value
    if (this.textField) {
      this.textField.inactive = value
    }
    this.updateDisabledVisuals(value)
  }

  /** Underlying text input field component. */
  public get textFieldComponent(): TextInputField {
    return this.textField
  }

  /** Intrinsic size from config or defaults. */
  public get intrinsicSize(): vec2 {
    if (!this.textFieldConfig) {
      return new vec2(this.DEFAULT_WIDTH, this.DEFAULT_HEIGHT)
    }

    const sizeConfig = this.textFieldConfig.size
    if (sizeConfig instanceof vec2) {
      return new vec2(sizeConfig.x, sizeConfig.y)
    }

    if (typeof sizeConfig === "object") {
      const x = typeof sizeConfig.x === "number" ? sizeConfig.x : this.DEFAULT_WIDTH
      const y = typeof sizeConfig.y === "number" ? sizeConfig.y : this.DEFAULT_HEIGHT
      return new vec2(x, y)
    }

    return new vec2(this.DEFAULT_WIDTH, this.DEFAULT_HEIGHT)
  }

  /** Called by the toolbar when the item is created. Not intended for external callers. */
  public initializeWithConfig(config: ToolbarTextFieldConfig) {
    this.textFieldConfig = config
    if (config.renderOrder !== undefined) {
      this._renderOrder = config.renderOrder
    }

    const size = this.intrinsicSize
    this._size = new vec3(size.x, size.y, 0)

    this.createTextField(config)

    super.initializeWithConfig(config)
  }

  /** Called when the toolbar applies scale to this item (e.g. fill or manual size). */
  public onLayoutScaleApplied() {
    this.applyComputedSize(true)
  }

  /** Called when the toolbar has finished positioning this item. */
  public onLayoutApplied() {
    this.applyComputedSize(false)
  }

  /** Size mode: fill or manual from config.size. */
  public getSizeMode(): ToolbarItemSizeMode {
    return getSizeModeFromSize(this.textFieldConfig.size)
  }

  protected setVisualAlpha(alpha: number): void {
    const effectiveAlpha = this.inactive ? alpha * this.DISABLED_ALPHA : alpha

    if (this.textField?.visual?.renderMeshVisual?.mainMaterial?.mainPass) {
      this.textField.visual.renderMeshVisual.mainMaterial.mainPass.opacityFactor = effectiveAlpha
      this.textField.visual.renderMeshVisual.enabled = true
    }

    if (this.textField?.textComponent) {
      const currentColor = this.textField.textComponent.textFill.color
      this.textField.textComponent.textFill.color = new vec4(
        currentColor.r,
        currentColor.g,
        currentColor.b,
        effectiveAlpha
      )
    }

    if (this.textField?.leftIconRMV?.mainMaterial?.mainPass) {
      const mainPass = this.textField.leftIconRMV.mainMaterial.mainPass
      const currentColor = mainPass.baseColor
      mainPass.baseColor = new vec4(currentColor.r, currentColor.g, currentColor.b, effectiveAlpha)
      this.textField.leftIconRMV.enabled = true
    }

    if (this.textField?.shadowVisual?.renderMeshVisual?.mainMaterial?.mainPass) {
      this.textField.shadowVisual.renderMeshVisual.mainMaterial.mainPass.opacityFactor = effectiveAlpha
      this.textField.shadowVisual.renderMeshVisual.enabled = true
    }
  }

  protected updateDisabledVisuals(inactive: boolean) {
    const targetAlpha = inactive ? this.DISABLED_ALPHA : (this.textFieldConfig.alpha ?? 1.0)

    if (this.textField?.visual?.renderMeshVisual?.mainMaterial?.mainPass) {
      this.textField.visual.renderMeshVisual.mainMaterial.mainPass.opacityFactor = targetAlpha
    }

    if (this.textField?.textComponent) {
      const currentColor = this.textField.textComponent.textFill.color
      this.textField.textComponent.textFill.color = new vec4(
        currentColor.r,
        currentColor.g,
        currentColor.b,
        targetAlpha
      )
    }

    if (this.textField?.leftIconRMV?.mainMaterial?.mainPass) {
      const mainPass = this.textField.leftIconRMV.mainMaterial.mainPass
      const currentColor = mainPass.baseColor
      mainPass.baseColor = new vec4(currentColor.r, currentColor.g, currentColor.b, targetAlpha)
    }

    if (this.textField?.shadowVisual?.renderMeshVisual?.mainMaterial?.mainPass) {
      this.textField.shadowVisual.renderMeshVisual.mainMaterial.mainPass.opacityFactor = targetAlpha
    }
  }

  /**
   * Computes new size from direction and applies it to the text field.
   * @param useSetSize - When true (onLayoutScaleApplied), uses setSize(false) if available and always
   *   updates text/alignment. When false (onLayoutApplied), uses direct size assignment and only
   *   updates text/alignment when the size has changed since last apply.
   */
  private applyComputedSize(useSetSize: boolean): void {
    const actualSize = this.computedSize
    if (!this.textField || actualSize.x <= 0 || actualSize.y <= 0) return

    const direction = this.getToolbarDirection()
    const isVertical = direction === ToolbarDirections.VERTICAL

    let newSize: vec3
    if (isVertical) {
      newSize = new vec3(actualSize.y, actualSize.x, 0)
      this.transform.setLocalRotation(quat.fromEulerVec(new vec3(0, 0, 90 * DegToRad)))
    } else {
      newSize = new vec3(actualSize.x, actualSize.y, 0)
      this.transform.setLocalRotation(quat.fromEulerVec(new vec3(0, 0, 0)))
    }

    const textFieldWithSetSize = this.textField as TextInputField & {
      setSize?: (size: vec3, setBaseSize?: boolean) => void
    }
    if (useSetSize && typeof textFieldWithSetSize.setSize === "function") {
      textFieldWithSetSize.setSize(newSize, false)
    } else {
      this.textField.size = newSize
    }

    const sizeChanged = useSetSize || this.lastAppliedSize === null || !this.lastAppliedSize.equal(newSize)
    if (sizeChanged) {
      this.lastAppliedSize = new vec3(newSize.x, newSize.y, newSize.z)
      const currentText = this.textField.text || ""
      if (currentText) {
        this.textField.setVisibleText(currentText)
      }
      if (this.textFieldConfig.textAlignment) {
        this.applyTextAlignment()
      }
    }
  }

  private createTextField(config: ToolbarTextFieldConfig) {
    this.textField = this.sceneObject.createComponent(TextInputField.getTypeName()) as TextInputField
    this.managedComponents.add(this.textField)

    const intrinsicSize = this.intrinsicSize
    this.textField.size = new vec3(intrinsicSize.x, intrinsicSize.y, 0)

    if (config.icon) {
      this.textField.icon = config.icon
    }

    this.textField.placeholderText = config.placeholder ?? ""

    this.textField.initialize()

    if (config.initialText) {
      this.textField.text = config.initialText
    }

    this.textField.onHoverEnter.add((e) => this.invokeOnHoverEnter(e))
    this.textField.onHoverExit.add((e) => this.invokeOnHoverExit(e))
    this.textField.onTriggerUp.add((e) => this.invokeOnTriggerUp(e))
    this.textField.onTriggerDown.add((e) => this.invokeOnTriggerDown(e))

    const renderOrder = this._renderOrder || this.TOOLBAR_ITEM_RENDER_ORDER
    this.textField.renderOrder = renderOrder
    if (this.textField.shadowVisual?.renderMeshVisual) {
      this.textField.shadowVisual.renderMeshVisual.renderOrder = renderOrder - 1
    }

    if (config.icon) {
      if (config.iconSide) {
        this.textField.setIconSide(config.iconSide)
      }
      this.textField.setUseIcon(true)

      const iconObject = this.textField.getIcon()
      if (iconObject) {
        const iconScreenTransform = iconObject.getComponent("ScreenTransform") as ScreenTransform
        if (iconScreenTransform) {
          const currentPos = iconScreenTransform.position
          iconScreenTransform.position = new vec3(currentPos.x, currentPos.y, 0.1)
        }
      }

      if (this.textField.leftIconRMV) {
        const textFieldRenderOrder = this._renderOrder || this.TOOLBAR_ITEM_RENDER_ORDER
        this.textField.leftIconRMV.renderOrder = textFieldRenderOrder + 1
        this.textField.leftIconRMV.mainMaterial.mainPass.depthTest = false
        this.textField.leftIconRMV.mainMaterial.mainPass.depthWrite = false
      }
    }

    if (config.textAlignment) {
      this.applyTextAlignment()
    }

    const textChangedHandler = (text: string) => {
      if (config.onTextChanged) {
        config.onTextChanged(text)
      }
      if (this.textFieldConfig.textAlignment) {
        this.applyTextAlignment()
      }
    }

    this.textField.onTextChanged.add(textChangedHandler)

    if (config.onSubmit) {
      this.textField.onReturnKeyPressed.add((text: string) => {
        config.onSubmit?.(text)
      })
    }

    if (config.onFocusGained) {
      this.textField.onEditMode.add((isEditing: boolean) => {
        this.userIsEditing = isEditing
        if (isEditing) {
          config.onFocusGained?.()
        }
        if (this.textFieldConfig.textAlignment) {
          this.applyTextAlignment()
        }
      })
    } else if (this.textFieldConfig.textAlignment) {
      this.textField.onEditMode.add((isEditing: boolean) => {
        this.userIsEditing = isEditing
        this.applyTextAlignment()
      })
    }

    if (config.onFocusLost) {
      this.textField.onKeyboardStateChanged.add((isOpen: boolean) => {
        if (!isOpen) {
          config.onFocusLost?.()
        }
      })
    }

    if (this.textField.visual && this.textField.visual.renderMeshVisual) {
      this.textField.visual.renderMeshVisual.mainMaterial.mainPass.blendMode = BlendMode.PremultipliedAlphaAuto
    }
  }

  private applyTextAlignment() {
    if (!this.textField?.textComponent) {
      return
    }
    const currentText = this.textField.text?.trim() ?? ""
    const isPlaceholderOrEmpty = !this.userIsEditing && currentText === ""

    if (this.textFieldConfig.textAlignment && isPlaceholderOrEmpty) {
      const alignment = this.textFieldConfig.textAlignment
      if (alignment === ToolbarAlignment.LEFT) {
        this.textField.textComponent.horizontalAlignment = HorizontalAlignment.Left
        this.textField.textComponent.horizontalOverflow = HorizontalOverflow.Truncate
        this.textField.textOffset = undefined
      } else if (alignment === ToolbarAlignment.RIGHT) {
        this.textField.textComponent.horizontalAlignment = HorizontalAlignment.Right
        this.textField.textComponent.horizontalOverflow = HorizontalOverflow.TruncateFront
        this.textField.textOffset = undefined
      } else {
        this.textField.textComponent.horizontalAlignment = HorizontalAlignment.Center
        this.textField.textComponent.horizontalOverflow = HorizontalOverflow.Truncate
        this.textField.textOffset = undefined
      }
    } else {
      this.textField.textComponent.horizontalAlignment = HorizontalAlignment.Left
      this.textField.textComponent.horizontalOverflow = HorizontalOverflow.Truncate
      this.textField.textOffset = undefined
    }
  }
}
