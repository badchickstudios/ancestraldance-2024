import WorldCameraFinderProvider from "SpectaclesInteractionKit.lspkg/Providers/CameraProvider/WorldCameraFinderProvider"

/**
 * Shows the Hand Hints "palm touch" animation beside the Earth while players are asked
 * to touch it, and hides it on the first touch (HandEarthGlow calls global.onEarthTouched).
 *
 * Not synced: each player sees their own copy, placed on the side of the Earth facing them
 * and turned toward them (yaw only), so it's always in a convenient spot.
 * Put this on an empty object and parent the Spectacles3DHandHints object under it.
 */
@component
export class EarthHandHint extends BaseScriptComponent {
  @input
  @hint("Centre of the Earth")
  earth: SceneObject

  @input
  @hint("The Spectacles3DHandHints InteractionHintController (set its Auto Play off)")
  hintController: ScriptComponent

  @input
  @hint("Animation to play (Hand Hints clip name)")
  clipName: string = "palm_touch_near"

  @input
  @widget(new ComboBoxWidget([new ComboBoxItem("Left", 0), new ComboBoxItem("Right", 1), new ComboBoxItem("Both", 2)]))
  handMode: number = 1

  @input
  @hint("Gap between the Earth's surface and the hint (cm); the Earth's size is measured at runtime")
  surfaceGap: number = 8

  @input
  @hint("Fallback distance from the Earth's centre if its size can't be measured (cm)")
  towardViewer: number = 50

  @input
  @hint("Height above the Earth's centre (cm)")
  height: number = 0

  @input
  @hint("Never closer than this to the viewer's eyes (cm), even when standing near the Earth")
  minDistanceFromViewer: number = 45

  @input
  @hint("Extra offset for the hint (+Z is toward the viewer, Y up)")
  hintOffset: vec3 = new vec3(0, 0, 0)

  @input
  animationSpeed: number = 1

  @input
  @allowUndefined
  @hint("Extra material layered on the hint hands (e.g. the players' Hologram 1)")
  handMaterial: Material

  @input
  @hint("Show the hint right away to tune its position (turn off before publishing)")
  previewOnStart: boolean = false

  private camera: Transform = null
  private active = false
  private playPending = false

  onAwake() {
    ;(global as any).showEarthHandHint = () => this.show()
    ;(global as any).onEarthTouched = () => this.hide()
    this.setHintVisible(false)
    this.createEvent("OnStartEvent").bind(() => {
      this.camera = WorldCameraFinderProvider.getInstance().getTransform()
      if (this.previewOnStart) this.show()
    })
    this.createEvent("UpdateEvent").bind(() => this.onUpdate())
  }

  show() {
    if (this.active) return
    this.active = true
    this.setHintVisible(true)
    this.place()
    // The controller wakes up when its object is first enabled; start playing next frame
    this.playPending = true
  }

  hide() {
    if (!this.active) return
    this.active = false
    this.playPending = false
    this.setHintVisible(false)
  }

  private setHintVisible(visible: boolean) {
    if (this.hintController) this.hintController.getSceneObject().enabled = visible
  }

  private materialAdded = false

  // The controller rebuilds its hand materials when it wakes, so layer ours on afterwards
  private addHandMaterial(controller: any) {
    if (this.materialAdded || !this.handMaterial) return
    for (const hand of [controller.leftHandMesh, controller.rightHandMesh]) {
      const visual = hand ? hand.getComponent("RenderMeshVisual") : null
      if (visual) visual.addMaterial(this.handMaterial)
    }
    this.materialAdded = true
  }

  private play() {
    const controller = this.hintController as any
    if (!controller || !controller.playHintAnimationSequence) return
    this.addHandMaterial(controller)
    controller.animationSpeed = this.animationSpeed
    // Keep looping until someone touches the Earth. The controller drops its end event
    // after the last loop, so give it a fresh one each time.
    if (!controller.animationEndEvent) controller.animationEndEvent = controller.createEvent("DelayedCallbackEvent")
    controller.animationEndEvent.bind(() => {
      if (this.active) this.playPending = true
    })
    controller.playHintAnimationSequence([{handMode: this.handMode, clipName: this.clipName, position: this.hintOffset}], 10)
  }

  private onUpdate() {
    if (!this.active) return
    this.place()
    if (this.playPending) {
      this.playPending = false
      this.play()
    }
  }

  // Centre and horizontal radius of the visible Earth, from its meshes' world bounds
  private earthBounds(): {center: vec3; radius: number} | null {
    let min: vec3 = null
    let max: vec3 = null
    const visit = (obj: SceneObject) => {
      if (!obj.isEnabledInHierarchy) return
      for (const visual of obj.getComponents("Component.RenderMeshVisual") as RenderMeshVisual[]) {
        const a = visual.worldAabbMin()
        const b = visual.worldAabbMax()
        min = min ? new vec3(Math.min(min.x, a.x), Math.min(min.y, a.y), Math.min(min.z, a.z)) : a
        max = max ? new vec3(Math.max(max.x, b.x), Math.max(max.y, b.y), Math.max(max.z, b.z)) : b
      }
      for (let i = 0; i < obj.getChildrenCount(); i++) visit(obj.getChild(i))
    }
    visit(this.earth)
    if (!min || !max) return null
    return {center: min.add(max).uniformScale(0.5), radius: Math.max(max.x - min.x, max.z - min.z) / 2}
  }

  // Beside the Earth on this viewer's side, turned to face them (yaw only)
  private place() {
    if (!this.earth || !this.camera) return
    const bounds = this.earthBounds()
    const earthPos = bounds ? bounds.center : this.earth.getTransform().getWorldPosition()
    const camPos = this.camera.getWorldPosition()
    let toViewer = new vec3(camPos.x - earthPos.x, 0, camPos.z - earthPos.z)
    const viewerDistance = toViewer.length
    if (viewerDistance < 0.001) toViewer = new vec3(0, 0, 1)
    toViewer = toViewer.normalize()

    // Just outside the Earth's surface, but pulled back toward it if the viewer is standing close
    const wanted = bounds && bounds.radius > 0 ? bounds.radius + this.surfaceGap : this.towardViewer
    const along = Math.max(0, Math.min(wanted, viewerDistance - this.minDistanceFromViewer))

    const t = this.getSceneObject().getTransform()
    t.setWorldPosition(earthPos.add(toViewer.uniformScale(along)).add(new vec3(0, this.height, 0)))
    // The clips face +Z toward their viewer, so point +Z at this viewer
    t.setWorldRotation(quat.lookAt(toViewer, vec3.up()))
  }
}
