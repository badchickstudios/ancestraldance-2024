import {SurfacePlacementController} from "SurfacePlacement.lspkg/Scripts/SurfacePlacementController"

/**
 * Restyles Surface Placement's runtime UI to match the project: the project font on its
 * texts ("Look below to place" etc.) and an extra material (the players' Hologram) on its
 * hand hints. The package builds these from its own prefabs at runtime, so this applies the
 * style as they appear instead of editing the package.
 */
@component
export class SurfacePlacementStyle extends BaseScriptComponent {
  @input
  @allowUndefined
  @hint("Font for Surface Placement's texts (the project font)")
  font: Font

  @input
  @allowUndefined
  @hint("Extra material layered on Surface Placement's hand hints (e.g. Hologram 1)")
  handMaterial: Material

  @input
  @hint("Text to resize (KARNIBLA is wider than the package font, so this one wraps)")
  confirmText: string = "Pinch to Confirm"

  @input
  @hint("Font size for that text (the package uses 250)")
  confirmTextSize: number = 190

  @input
  @hint("Names of the hand hint meshes to restyle")
  handMeshNames: string[] = ["RightHandGeo", "LeftHandGeo"]

  private frame = 0

  onAwake() {
    this.createEvent("UpdateEvent").bind(() => {
      // Cheap enough, but no need to walk the tree every frame
      if (this.frame++ % 10 === 0) this.apply()
    })
  }

  private apply() {
    const controller = SurfacePlacementController.getInstance() as any
    const root: SceneObject = controller ? controller.sceneObject : null
    if (root) this.walk(root)
  }

  private walk(obj: SceneObject) {
    for (const text of obj.getComponents("Component.Text") as Text[]) {
      if (this.font && (!text.font || !text.font.isSame(this.font))) text.font = this.font
      if (this.confirmText && text.text.trim().toLowerCase() === this.confirmText.trim().toLowerCase()) {
        if (text.size !== this.confirmTextSize) text.size = this.confirmTextSize
      }
    }
    if (this.handMaterial && this.handMeshNames.indexOf(obj.name) >= 0) {
      const visual = obj.getComponent("Component.RenderMeshVisual")
      if (visual && !this.hasMaterial(visual)) visual.addMaterial(this.handMaterial)
    }
    for (let i = 0; i < obj.getChildrenCount(); i++) this.walk(obj.getChild(i))
  }

  private hasMaterial(visual: RenderMeshVisual): boolean {
    for (let i = 0; i < visual.getMaterialsCount(); i++) {
      if (visual.getMaterial(i).isSame(this.handMaterial)) return true
    }
    return false
  }
}
