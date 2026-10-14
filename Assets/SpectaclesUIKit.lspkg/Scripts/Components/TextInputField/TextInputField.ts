import {Interactable} from "SpectaclesInteractionKit.lspkg/Components/Interaction/Interactable/Interactable"
import {TargetingMode} from "SpectaclesInteractionKit.lspkg/Core/Interactor/Interactor"
import {IMAGE_MATERIAL_ASSET, StateName} from "../Element"
import {BaseTextInputComponent} from "../TextInput/BaseTextInputComponent"
import {DEBUG_RENDER, FONT_SIZE_SCALE, IconState} from "../TextInput/TextInputConsts"

const UNIT_PLANE: RenderMesh = requireAsset("../../../Meshes/Unit Plane.mesh") as RenderMesh

const EYE_ICON: Texture = requireAsset("../../../Textures/eye-icon.png") as Texture
const EYE_OFF_ICON: Texture = requireAsset("../../../Textures/eye-off-icon.png") as Texture

const OVERFLOW_WIDTH = 2.1

export type TextInputType = "default" | "numeric" | "password" | "format" | "pin"
export type IconSide = "left" | "right"

/**
 * TextInputField
 * Single-line text input component for Spectacles.
 * Supports password masking and configurable icons.
 */
@component
export class TextInputField extends BaseTextInputComponent {
  @input("string", "default")
  @widget(
    new ComboBoxWidget([
      new ComboBoxItem("Default", "default"),
      new ComboBoxItem("Numeric", "numeric"),
      new ComboBoxItem("Password", "password"),
      new ComboBoxItem("Pin", "pin")
    ])
  )
  public inputType: TextInputType = "default"

  @input
  @showIf("inputType", "format")
  @widget(
    new ComboBoxWidget([
      new ComboBoxItem("Date", "date"),
      new ComboBoxItem("Email", "email"),
      new ComboBoxItem("URL", "url")
    ])
  )
  public formatType: string = "date"

  @input
  @hint("Use an icon?")
  public useIcon: boolean = false
  @input
  @showIf("useIcon", true)
  @allowUndefined
  @hint("Icon Texture")
  public icon: Texture

  @input
  @hint("Throw error if unfocused with no input")
  public contentRequiredOnDeactivate: boolean = false

  @input
  @showIf("useIcon")
  @hint("Switch to a different icon on focus")
  public changeIconOnFocus: boolean = false
  @input
  @showIf("changeIconOnFocus", true)
  @hint("Alternate icon used on focus")
  public alternateIcon: Texture

  private leftIconObject: SceneObject = null
  private leftIconScreenTransform: ScreenTransform = null
  private _leftIconRMV: RenderMeshVisual = null

  private rightIconObject: SceneObject = null
  private rightIconScreenTransform: ScreenTransform = null
  private rightIconRMV: RenderMeshVisual = null
  private rightIconInteractable: Interactable = null
  private rightIconCollider: ColliderComponent = null
  private rightIconColliderShape: BoxShape = null

  private passwordSide: IconSide = "right"
  private iconSide: IconSide = "left"

  private hidePassword: boolean = true

  private _textOffset: vec2 = null

  public get leftIconRMV(): RenderMeshVisual {
    return this._leftIconRMV
  }

  public get textOffset(): vec2 {
    return this._textOffset
  }

  public set textOffset(offset: vec2) {
    if (offset === undefined) {
      return
    }
    this._textOffset = offset
    this.updateTextOffset()
  }

  public setInputType = (type: TextInputType) => {
    this.inputType = type
    this.setUsePassword(this.inputType === "password")
    this.updateVisibleText(this._text)
  }

  public setIconSide = (side: IconSide) => {
    if (side === "left") {
      this.iconSide = "left"
      this.passwordSide = "right"
    } else {
      this.iconSide = "right"
      this.passwordSide = "left"
    }

    this.setUseIcon(this.useIcon)
    this.setInputType(this.inputType)
  }

  public setUseIcon = (useIcon: boolean) => {
    this.useIcon = useIcon

    if (this.useIcon) {
      if (!this.leftIconObject) {
        this.leftIconObject = global.scene.createSceneObject("LeftIcon")
        this.managedSceneObjects.add(this.leftIconObject)
        this.leftIconObject.layer = this.sceneObject.layer
        this.leftIconObject.setParent(this.textParent)
        this.leftIconScreenTransform = this.leftIconObject.createComponent("ScreenTransform")
        this.leftIconScreenTransform.offsets = Rect.create(-0, this._size.y * 0.5, -0, 0)
        this.leftIconScreenTransform.anchors = Rect.create(-1, -1, -0.5, 0.5)
        this._leftIconRMV = this.leftIconObject.createComponent("RenderMeshVisual")
        this.managedComponents.add(this._leftIconRMV)
        this._leftIconRMV.mesh = UNIT_PLANE
        this._leftIconRMV.mainMaterial = IMAGE_MATERIAL_ASSET.clone()
        this._leftIconRMV.mainMaterial.mainPass.baseTex = this.icon
        this._leftIconRMV.mainMaterial.mainPass.depthTest = true
      }
      this.leftIconObject.enabled = true
      this.leftIconScreenTransform.enableDebugRendering = DEBUG_RENDER
      const inset = this._size.y * 0.15
      this.textObjectScreenTransform.offsets[this.iconSide] =
        this.iconSide === "right" ? this._size.y * -0.5 - inset : this._size.y * 0.5 + inset
      if (this.iconSide === "right") {
        this.leftIconScreenTransform.offsets["left"] = this._size.y * -0.5
        this.leftIconScreenTransform.offsets["right"] = 0
      }
      if (this.iconSide === "left") {
        this.leftIconScreenTransform.offsets["right"] = this._size.y * 0.5
        this.leftIconScreenTransform.offsets["left"] = 0
      }
      this.leftIconScreenTransform.anchors =
        this.iconSide === "right" ? Rect.create(1, 1, -0.5, 0.5) : Rect.create(-1, -1, -0.5, 0.5)
    } else {
      if (this.leftIconObject) {
        this.leftIconObject.enabled = false
        this.leftIconScreenTransform.enableDebugRendering = false
        this.textObjectScreenTransform.offsets[this.iconSide] = 0
      }
    }
    if (this.textOffset) this.updateTextOffset()
  }

  public getIcon = () => this.leftIconObject

  public getPasswordIcon = () => this.rightIconObject

  public setState(stateName: StateName) {
    super.setState(stateName)
    const state = this._states.get(stateName)
    if (this._leftIconRMV) {
      if (state.icon === IconState.alternate && this.changeIconOnFocus) {
        this._leftIconRMV.mainMaterial.mainPass.baseTex = this.alternateIcon
      } else if (this.icon && this.useIcon) {
        if (this._leftIconRMV.mainMaterial.mainPass.baseTex !== this.icon) {
          this._leftIconRMV.mainMaterial.mainPass.baseTex = this.icon
        }
      }
    }
  }

  protected initializeKeyboard(): void {
    let keyboardType = TextInputSystem.KeyboardType.Text
    switch (this.inputType) {
      case "numeric":
        keyboardType = TextInputSystem.KeyboardType.Num
        break
      case "password":
        keyboardType = TextInputSystem.KeyboardType.Password
        break
      case "pin":
        keyboardType = TextInputSystem.KeyboardType.Pin
        break
    }
    this.keyboardOptions.keyboardType = keyboardType
    this.keyboardOptions.returnKeyType = TextInputSystem.ReturnKeyType.Done
  }

  protected initializeTextComponent(): void {
    this.setUseIcon(this.useIcon)
    this.setUsePassword(this.inputType === "password")
  }

  protected updateVisibleText(text: string): void {
    this.textComponent.text =
      this.inputType === "password" && !this.isPlaceholder && this.hidePassword ? "*".repeat(text.length) : text

    this.textComponent.horizontalAlignment = HorizontalAlignment.Left
    this.textComponent.horizontalOverflow = HorizontalOverflow.Overflow
    const width =
      (this.textComponent.getBoundingBox().getSize().x / this.textParentScreenTransform.anchors.getSize().x) * 2
    if (width > OVERFLOW_WIDTH) {
      this.textComponent.horizontalAlignment = HorizontalAlignment.Right
      this.textComponent.horizontalOverflow = HorizontalOverflow.TruncateFront
    } else {
      this.textComponent.horizontalAlignment = HorizontalAlignment.Left
      this.textComponent.horizontalOverflow = HorizontalOverflow.Truncate
    }
  }

  protected onTextUpdated(): void {
    super.onTextUpdated()
    if (this._text === "" && this.contentRequiredOnDeactivate) {
      this._hasError = true
    }
  }

  protected updateRenderOrder(value: number) {
    super.updateRenderOrder(value)
    if (this._leftIconRMV) this._leftIconRMV.renderOrder = value + 1
  }

  private updateTextOffset = () => {
    if (this.textOffset) {
      this.textObjectScreenTransform.offsets.left = this.textOffset.x
      this.textObjectScreenTransform.offsets.right = this.textOffset.y
    } else {
      // reset according to icon position
      this.setUseIcon(this.useIcon)
      this.setUsePassword(this.inputType === "password")
    }
  }

  private setUsePassword = (isPassword: boolean) => {
    if (isPassword) {
      if (!this.rightIconObject) {
        this.rightIconObject = global.scene.createSceneObject("RightIcon")
        this.managedSceneObjects.add(this.rightIconObject)
        this.rightIconObject.layer = this.sceneObject.layer
        this.rightIconObject.setParent(this.textParent)
        this.rightIconScreenTransform = this.rightIconObject.createComponent("ScreenTransform")
        this.rightIconScreenTransform.offsets = Rect.create(this._size.y * -0.5, 0, -0, 0)
        this.rightIconScreenTransform.anchors = Rect.create(1, 1, -0.5, 0.5)
        this.rightIconRMV = this.rightIconObject.createComponent("RenderMeshVisual")
        this.managedComponents.add(this.rightIconRMV)
        this.rightIconRMV.mesh = UNIT_PLANE
        this.rightIconRMV.mainMaterial = IMAGE_MATERIAL_ASSET.clone()
        this.rightIconRMV.mainMaterial.mainPass.baseTex = EYE_OFF_ICON
        this.rightIconRMV.mainMaterial.mainPass.depthTest = true
        this.rightIconCollider = this.rightIconObject.createComponent("ColliderComponent")
        this.managedComponents.add(this.rightIconCollider)
        this.rightIconColliderShape = Shape.createBoxShape()
        this.rightIconCollider.fitVisual = false
        this.rightIconColliderShape.size = new vec3(this._size.y * 0.5, this._size.y * 0.5, 1)
        this.rightIconCollider.shape = this.rightIconColliderShape
        this.rightIconInteractable = this.rightIconObject.createComponent(Interactable.getTypeName())
        this.managedComponents.add(this.rightIconInteractable)
        this.rightIconInteractable.targetingMode = TargetingMode.All
        this.rightIconInteractable.onTriggerEnd.add(() => {
          this.hidePassword = !this.hidePassword
          if (this.hidePassword) {
            this.rightIconRMV.mainMaterial.mainPass.baseTex = EYE_OFF_ICON
          } else {
            this.rightIconRMV.mainMaterial.mainPass.baseTex = EYE_ICON
          }
          this.updateVisibleText(this._text)
        })
      }
      this.rightIconObject.enabled = true
      this.rightIconCollider.debugDrawEnabled = DEBUG_RENDER
      this.rightIconScreenTransform.enableDebugRendering = DEBUG_RENDER
      const inset = this._size.y * 0.15
      this.textObjectScreenTransform.offsets[this.passwordSide] =
        this.passwordSide === "right" ? this._size.y * -0.5 - inset : this._size.y * 0.5 + inset
      if (this.passwordSide === "right") {
        this.rightIconScreenTransform.offsets["left"] = this._size.y * -0.5
        this.rightIconScreenTransform.offsets["right"] = 0
      }
      if (this.passwordSide === "left") {
        this.rightIconScreenTransform.offsets["right"] = this._size.y * 0.5
        this.rightIconScreenTransform.offsets["left"] = 0
      }
      this.rightIconScreenTransform.anchors =
        this.passwordSide === "right" ? Rect.create(1, 1, -0.5, 0.5) : Rect.create(-1, -1, -0.5, 0.5)
    } else {
      this.textObjectScreenTransform.offsets[this.passwordSide] = 0
      if (this.rightIconObject) {
        this.rightIconCollider.debugDrawEnabled = false
        this.rightIconScreenTransform.enableDebugRendering = false
        this.rightIconObject.enabled = false
      }
    }
    if (this.textOffset) this.updateTextOffset()
  }

  protected computeFontSize(): number {
    if (this._fontSize > 0) {
      return this._fontSize * (this._size.y / this._originalSize.y)
    }
    return this._size.y * FONT_SIZE_SCALE
  }
}
