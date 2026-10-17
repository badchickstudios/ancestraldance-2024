import {SIK} from "SpectaclesInteractionKit.lspkg/SIK"

/**
 * Lights up each hand as it gets close to the Earth, and fully on contact.
 *
 * Distance is measured from SIK's tracked palm centre (the hand model's root object
 * doesn't follow the hand in SIK 2.0). A glowing outline material is appended to the
 * hand meshes; it fades in between glowStartDistance and contactDistance, then pulses
 * at full brightness while touching. On first contact it also sends the existing
 * 'earthtouched' Behavior trigger so EarthHealingManager counts the touch.
 *
 * Put this on the object that is enabled for the touch-the-Earth step.
 */
@component
export class HandEarthGlow extends BaseScriptComponent {
  @input
  @hint("Centre of the Earth the players reach for")
  earth: SceneObject

  @input
  @hint("Outline material to draw the glow (SIK TargetOutlineMaterial)")
  glowMaterial: Material

  @input
  @hint("Left hand meshes (SIK LeftHandMeshFull / LeftHandMeshIndexThumb)")
  leftHandMeshes: RenderMeshVisual[]

  @input
  @hint("Right hand meshes (SIK RightHandMeshFull / RightHandMeshIndexThumb)")
  rightHandMeshes: RenderMeshVisual[]

  @input
  @hint("Distance (cm) from the Earth's centre where the glow starts to appear")
  glowStartDistance: number = 60

  @input
  @hint("Distance (cm) that counts as touching the Earth")
  contactDistance: number = 40

  @input
  @widget(new ColorWidget())
  glowColor: vec4 = new vec4(0.55, 1.0, 0.65, 1.0)

  @input
  @hint("Outline thickness at full glow (SIK uses negative values for outward)")
  maxLineWeight: number = -0.6

  @input
  @hint("Also send the 'earthtouched' trigger on first contact")
  sendTouchTrigger: boolean = true

  private hands: {side: "left" | "right"; material: Material; meshes: RenderMeshVisual[]; touched: boolean}[] = []
  private time = 0

  onAwake() {
    this.createEvent("OnStartEvent").bind(() => this.setUp())
    this.createEvent("UpdateEvent").bind(() => this.update())
    this.createEvent("OnDisableEvent").bind(() => this.removeGlow())
    this.createEvent("OnEnableEvent").bind(() => this.addGlow())
  }

  private setUp() {
    this.hands = [
      {side: "left", material: this.glowMaterial.clone(), meshes: this.leftHandMeshes || [], touched: false},
      {side: "right", material: this.glowMaterial.clone(), meshes: this.rightHandMeshes || [], touched: false}
    ]
    for (const hand of this.hands) this.setGlow(hand.material, 0)
    this.addGlow()
  }

  private update() {
    if (this.hands.length === 0 || !this.earth) return
    this.time += getDeltaTime()
    const earthPos = this.earth.getTransform().getWorldPosition()

    for (const hand of this.hands) {
      const tracked = SIK.HandInputData.getHand(hand.side)
      const palm = tracked && tracked.isTracked() ? tracked.getPalmCenter() : null
      if (!palm) {
        this.setGlow(hand.material, 0)
        continue
      }

      const distance = palm.distance(earthPos)
      const range = Math.max(0.001, this.glowStartDistance - this.contactDistance)
      let amount = MathUtils.clamp((this.glowStartDistance - distance) / range, 0, 1)

      if (distance <= this.contactDistance) {
        // Full glow with a gentle pulse while touching
        amount = 0.85 + 0.15 * Math.sin(this.time * 6)
        if (!hand.touched) {
          hand.touched = true
          this.onContact()
        }
      }
      this.setGlow(hand.material, amount)
    }
  }

  private onContact() {
    // EarthHandHint hides its palm-touch hint on the first touch
    ;(global as any).onEarthTouched?.()
    const behaviors = (global as any).behaviorSystem
    if (this.sendTouchTrigger && behaviors) {
      behaviors.sendCustomTrigger("earthtouched")
    }
  }

  private setGlow(material: Material, amount: number) {
    const c = this.glowColor
    material.mainPass.lineColor = new vec4(c.x, c.y, c.z, c.w * amount)
    material.mainPass.lineWeight = this.maxLineWeight * amount
  }

  // Appended (not prepended) so SIK HandVisual, which swaps the first material, leaves it alone
  private addGlow() {
    for (const hand of this.hands) {
      for (const mesh of hand.meshes) {
        if (!mesh) continue
        let present = false
        for (let i = 0; i < mesh.getMaterialsCount(); i++) {
          if (mesh.getMaterial(i).isSame(hand.material)) present = true
        }
        if (!present) mesh.addMaterial(hand.material)
      }
    }
  }

  private removeGlow() {
    for (const hand of this.hands) {
      for (const mesh of hand.meshes) {
        if (!mesh) continue
        const keep: Material[] = []
        for (let i = 0; i < mesh.getMaterialsCount(); i++) {
          const m = mesh.getMaterial(i)
          if (!m.isSame(hand.material)) keep.push(m)
        }
        mesh.clearMaterials()
        for (const m of keep) mesh.addMaterial(m)
      }
    }
  }
}
