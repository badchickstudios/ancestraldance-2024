import {Interactable} from "SpectaclesInteractionKit.lspkg/Components/Interaction/Interactable/Interactable"
import {getSizeModeFromSize, ToolbarCustomItemConfig, ToolbarItemSizeMode} from "../Types/ToolbarSchema"
import {ToolbarItem} from "./ToolbarItem"

/**
 * Toolbar item that wraps a custom scene object. Obtain via {@link Toolbar.getItem} or {@link Toolbar.allItems}.
 */
@component
export class ToolbarCustomItem extends ToolbarItem {
  private customObject: SceneObject | null = null
  private customObjectTransform: Transform | null = null
  private cachedRenderMeshVisuals: RenderMeshVisual[] = []
  private cachedTextComponents: Text[] = []
  private cachedImageComponents: Image[] = []
  private cachedInteractables: Interactable[] = []

  /** Overrides base to update custom object disabled visuals. */
  public get inactive(): boolean {
    return super.inactive
  }

  public set inactive(value: boolean) {
    super.inactive = value
    this.updateDisabledVisuals(value)
  }

  /** The custom scene object attached to this item. */
  public get customObjectRef(): SceneObject | null {
    return this.customObject
  }

  /** Intrinsic size from config or custom object scale. */
  public get intrinsicSize(): vec2 {
    if (!this._config) {
      if (this.customObject) {
        const transform = this.customObjectTransform
        const scale = transform.getLocalScale()
        return new vec2(scale.x, scale.y)
      }
      return vec2.zero()
    }

    const sizeConfig = this._config.size
    if (sizeConfig instanceof vec2) {
      return new vec2(sizeConfig.x, sizeConfig.y)
    }

    if (typeof sizeConfig === "object") {
      if (this.customObject) {
        const transform = this.customObjectTransform
        const scale = transform.getLocalScale()
        const x = typeof sizeConfig.x === "number" ? sizeConfig.x : scale.x
        const y = typeof sizeConfig.y === "number" ? sizeConfig.y : scale.y
        return new vec2(x, y)
      }
      const x = typeof sizeConfig.x === "number" ? sizeConfig.x : 0
      const y = typeof sizeConfig.y === "number" ? sizeConfig.y : 0
      return new vec2(x, y)
    }

    if (this.customObject) {
      const transform = this.customObjectTransform
      const scale = transform.getLocalScale()
      return new vec2(scale.x, scale.y)
    }

    return vec2.zero()
  }

  /** Called by the toolbar when the item is created. Not intended for external callers. */
  public initializeWithConfig(config: ToolbarCustomItemConfig) {
    this._config = config

    const size = this.intrinsicSize
    this._size = new vec3(size.x, size.y, 0)

    this.createCustomObject(config)
    this.cacheComponents(this.customObject)

    super.initializeWithConfig(config)

    const baseRenderOrder = this._renderOrder || 0
    this.setupCustomObjectRenderProperties(this.customObject, baseRenderOrder)
  }

  /** Size mode: fill or manual from config.size. */
  public getSizeMode(): ToolbarItemSizeMode {
    return getSizeModeFromSize(this._config.size)
  }

  /** Called when the toolbar applies scale to this item. */
  public onLayoutScaleApplied() {
    this.applyComputedScale()
  }

  /** Called when the toolbar has finished positioning this item. */
  public onLayoutApplied() {
    this.applyComputedScale()
  }

  protected setVisualAlpha(alpha: number): void {
    const effectiveAlpha = this.inactive ? alpha * this.DISABLED_ALPHA : alpha
    const customConfig = this._config as ToolbarCustomItemConfig
    if (customConfig.onSetAlpha) {
      customConfig.onSetAlpha(effectiveAlpha)
    } else if (this.customObject) {
      this.setAlphaOnSceneObject(this.customObject, effectiveAlpha)
    }
  }

  protected updateDisabledVisuals(inactive: boolean) {
    const customConfig = this._config as ToolbarCustomItemConfig
    if (customConfig.onUpdateDisabledVisuals) {
      customConfig.onUpdateDisabledVisuals(inactive)
      return
    }

    const targetAlpha = inactive ? this.DISABLED_ALPHA : (this._config.alpha ?? 1.0)

    for (const mesh of this.cachedRenderMeshVisuals) {
      if (mesh?.mainMaterial?.mainPass) {
        mesh.mainMaterial.mainPass.opacityFactor = targetAlpha
      }
    }

    for (const text of this.cachedTextComponents) {
      const currentColor = text.textFill.color
      text.textFill.color = new vec4(currentColor.r, currentColor.g, currentColor.b, targetAlpha)
    }

    for (const image of this.cachedImageComponents) {
      const currentColor = image.mainPass.baseColor
      image.mainPass.baseColor = new vec4(currentColor.r, currentColor.g, currentColor.b, targetAlpha)
    }

    for (const interactable of this.cachedInteractables) {
      interactable.enabled = !inactive
    }
  }

  private applyComputedScale() {
    const actualSize = this.computedSize
    if (this.customObject && actualSize.x > 0 && actualSize.y > 0) {
      const transform = this.customObjectTransform
      const currentScale = transform.getLocalScale()
      transform.setLocalScale(new vec3(actualSize.x, actualSize.y, currentScale.z))
    }
  }

  private applyAlphaToPass(pass: Pass, alpha: number): void {
    if (!pass) return
    const baseColor = pass.baseColor
    if (baseColor) {
      baseColor.a = alpha
      pass.baseColor = baseColor
    }
    if (pass.alpha !== undefined) pass.alpha = alpha
    if (pass.opacity !== undefined) pass.opacity = alpha
    pass.opacityFactor = alpha
  }

  private setAlphaOnSceneObject(sceneObject: SceneObject, alpha: number): void {
    if (!sceneObject) return

    sceneObject.getComponents("Component.RenderMeshVisual").forEach((mesh: RenderMeshVisual) => {
      const materialCount = mesh.getMaterialsCount?.() ?? 0
      if (materialCount > 0) {
        for (let i = 0; i < materialCount; i++) {
          const material = mesh.getMaterial(i)
          if (material?.mainPass) this.applyAlphaToPass(material.mainPass, alpha)
        }
      } else if (mesh.mainMaterial?.mainPass) {
        this.applyAlphaToPass(mesh.mainMaterial.mainPass, alpha)
      }
      mesh.enabled = alpha > 0
    })

    sceneObject.getComponents("Component.Image").forEach((image: Image) => {
      if (image.mainMaterial?.mainPass) this.applyAlphaToPass(image.mainMaterial.mainPass, alpha)
    })

    sceneObject.getComponents("Component.Text").forEach((text: Text) => {
      const baseColor = text.textFill.color
      baseColor.a = alpha
      text.textFill.color = baseColor
    })

    for (let i = 0; i < sceneObject.getChildrenCount(); i++) {
      this.setAlphaOnSceneObject(sceneObject.getChild(i), alpha)
    }
  }

  private cacheComponents(sceneObject: SceneObject | null) {
    if (!sceneObject) return

    const mesh = sceneObject.getComponent("RenderMeshVisual") as RenderMeshVisual
    if (mesh) this.cachedRenderMeshVisuals.push(mesh)

    const text = sceneObject.getComponent("Component.Text") as Text
    if (text) this.cachedTextComponents.push(text)

    const image = sceneObject.getComponent("Component.Image") as Image
    if (image) this.cachedImageComponents.push(image)

    const interactable = sceneObject.getComponent(Interactable.getTypeName()) as Interactable
    if (interactable) this.cachedInteractables.push(interactable)

    const childCount = sceneObject.getChildrenCount()
    for (let i = 0; i < childCount; i++) {
      this.cacheComponents(sceneObject.getChild(i))
    }
  }

  private createCustomObject(config: ToolbarCustomItemConfig) {
    if (!config.customObject) {
      throw new Error("ToolbarCustomItem: customObject is required")
    }

    this.customObject = config.customObject
    this.customObject.setParent(this.sceneObject)
    this.managedSceneObjects.add(this.customObject)

    this.customObjectTransform = this.customObject.getTransform()
    const transform = this.customObjectTransform
    const currentPos = transform.getLocalPosition()
    transform.setLocalPosition(new vec3(currentPos.x, currentPos.y, 0.1))

    const screenTransform = this.customObject.getComponent("ScreenTransform") as ScreenTransform
    if (screenTransform) {
      const screenPos = screenTransform.position
      screenTransform.position = new vec3(screenPos.x, screenPos.y, 0.1)
    }
  }

  private setupCustomObjectRenderProperties(sceneObject: SceneObject, baseRenderOrder: number) {
    if (!sceneObject) return

    const renderMeshVisual = sceneObject.getComponent("RenderMeshVisual") as RenderMeshVisual
    if (renderMeshVisual) {
      renderMeshVisual.renderOrder = baseRenderOrder + 1
      if (renderMeshVisual.mainMaterial?.mainPass) {
        renderMeshVisual.mainMaterial.mainPass.depthTest = false
        renderMeshVisual.mainMaterial.mainPass.depthWrite = false
      }
    }

    const textComponent = sceneObject.getComponent("Component.Text") as Text
    if (textComponent) {
      textComponent.renderOrder = baseRenderOrder + 1
    }

    const imageComponent = sceneObject.getComponent("Component.Image") as Image
    if (imageComponent) {
      imageComponent.renderOrder = baseRenderOrder + 1
    }

    const childCount = sceneObject.getChildrenCount()
    for (let i = 0; i < childCount; i++) {
      const child = sceneObject.getChild(i)
      this.setupCustomObjectRenderProperties(child, baseRenderOrder)
    }
  }
}
