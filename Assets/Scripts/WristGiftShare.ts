import {SyncEntity} from "SpectaclesSyncKit.lspkg/Core/SyncEntity"
import {SIK} from "SpectaclesInteractionKit.lspkg/SIK"

/**
 * Lets every player see everyone else's wrist gift (Collective).
 *
 * Each device keeps showing its own gift on its own hand rig as before (no delay), and
 * about `sendsPerSecond` times a second tells the others which gift it picked, where its
 * wrists are (relative to the shared colocated space), which hands are tracked, and
 * whether its end-of-story plant particles are on. Other devices build a copy of that
 * player's gift from their own wrist gift groups (GiftManager) and smoothly move it to
 * the received wrist poses. A copy is removed when its player leaves.
 */
@component
export class WristGiftShare extends BaseScriptComponent {
  @input
  @hint("Shared colocated space the wrist poses are measured in (ColocatedWorld/EnableOnReady)")
  colocatedRoot: SceneObject

  @input
  @hint("This device's left wrist joint (SIK LeftHandVisual rig)")
  leftWrist: SceneObject

  @input
  @hint("This device's right wrist joint (SIK RightHandVisual rig)")
  rightWrist: SceneObject

  @input
  sendsPerSecond: number = 10

  @input
  @hint("How quickly remote gifts catch up to the latest pose (higher = snappier)")
  followSpeed: number = 14

  @input
  @hint("Also show other players' plant particle trails at the end")
  shareParticles: boolean = true

  @input
  @hint("Hide a remote player's gifts if nothing arrives for this long (s)")
  staleSeconds: number = 5

  private syncEntity: SyncEntity
  private ready = false
  private sendTimer = 0
  private remotes: {[id: string]: RemoteGifts} = {}

  onAwake() {
    this.syncEntity = new SyncEntity(this, null, false)
    this.syncEntity.notifyOnReady(() => {
      this.ready = true
      this.syncEntity.onEventReceived.add("wristGift", (message) => this.onReceive(message))
      const session = (global as any).sessionController
      if (session && session.onUserLeftSession) {
        session.onUserLeftSession.add((_s: any, userInfo: any) => {
          if (userInfo && userInfo.connectionId) this.removeRemote(userInfo.connectionId)
        })
      }
    })
    this.createEvent("UpdateEvent").bind(() => this.onUpdate())
  }

  private isCollective(): boolean {
    const solo = (global as any).isSinglePlayerMode
    return !!solo && solo() === false
  }

  private onUpdate() {
    const dt = getDeltaTime()
    if (this.ready && this.isCollective()) {
      this.sendTimer -= dt
      if (this.sendTimer <= 0) {
        this.sendTimer = 1 / Math.max(1, this.sendsPerSecond)
        this.sendLocal()
      }
    }
    const now = getTime()
    for (const id in this.remotes) this.remotes[id].update(dt, now, this.followSpeed, this.staleSeconds)
  }

  // ---- sending ----

  private sendLocal() {
    const gift = (global as any).localGiftIndex
    if (gift === undefined || gift === null || gift < 0) return
    const particles = (global as any).plantParticles
    const message = {
      g: gift,
      l: this.handPose("left", this.leftWrist),
      r: this.handPose("right", this.rightWrist),
      p: !!(this.shareParticles && particles && particles.left && particles.left.enabled),
    }
    this.syncEntity.sendEvent("wristGift", message, true)
  }

  // [px, py, pz, qx, qy, qz, qw] relative to the colocated root, or null when untracked
  private handPose(side: "left" | "right", wrist: SceneObject): number[] | null {
    const hand = SIK.HandInputData.getHand(side)
    if (!wrist || !hand || !hand.isTracked()) return null
    const root = this.colocatedRoot.getTransform()
    const t = wrist.getTransform()
    const p = root.getInvertedWorldTransform().multiplyPoint(t.getWorldPosition())
    const q = root.getWorldRotation().invert().multiply(t.getWorldRotation())
    return [p.x, p.y, p.z, q.x, q.y, q.z, q.w]
  }

  // ---- receiving ----

  private onReceive(message: any) {
    const id = message.senderConnectionId
    const data = message.data
    if (!id || !data) return
    let remote = this.remotes[id]
    if (!remote) {
      remote = new RemoteGifts(this, id)
      this.remotes[id] = remote
    }
    remote.receive(data, getTime())
  }

  private removeRemote(id: string) {
    const remote = this.remotes[id]
    if (!remote) return
    remote.destroy()
    delete this.remotes[id]
  }

  /** Copies of this device's own wrist gift groups / particles, used to build remote gifts */
  localGroup(side: "left" | "right", gift: number): SceneObject | null {
    const groups = (global as any).localWristGifts
    const list = groups ? groups[side] : null
    return list && list[gift] ? list[gift] : null
  }

  localParticles(side: "left" | "right"): SceneObject | null {
    const particles = (global as any).plantParticles
    return particles ? particles[side] : null
  }

  localWristScale(side: "left" | "right"): vec3 {
    const wrist = side === "left" ? this.leftWrist : this.rightWrist
    return wrist ? wrist.getTransform().getWorldScale() : vec3.one()
  }
}

/** One remote player's gifts on both wrists */
class RemoteGifts {
  private root: SceneObject
  private hands: {[side: string]: RemoteHand} = {}
  private gift = -1
  private lastHeard = 0

  constructor(private owner: WristGiftShare, id: string) {
    this.root = global.scene.createSceneObject("RemoteWristGifts_" + id)
    this.root.setParent(owner.colocatedRoot)
    this.hands.left = new RemoteHand(this.root, "left")
    this.hands.right = new RemoteHand(this.root, "right")
  }

  receive(data: any, now: number) {
    this.lastHeard = now
    if (data.g !== this.gift) {
      // Our GiftManager may not be awake yet (its stage starts slightly later here); retry next message
      const left = this.owner.localGroup("left", data.g)
      const right = this.owner.localGroup("right", data.g)
      if (left || right) {
        this.gift = data.g
        this.hands.left.setGift(left, this.owner.localParticles("left"))
        this.hands.right.setGift(right, this.owner.localParticles("right"))
      }
    }
    for (const side of ["left", "right"] as const) {
      const pose = side === "left" ? data.l : data.r
      this.hands[side].setTarget(pose, this.owner.localWristScale(side))
      this.hands[side].setParticles(!!data.p)
    }
  }

  update(dt: number, now: number, speed: number, staleSeconds: number) {
    this.root.enabled = now - this.lastHeard < staleSeconds
    if (!this.root.enabled) return
    this.hands.left.update(dt, speed)
    this.hands.right.update(dt, speed)
  }

  destroy() {
    this.root.destroy()
  }
}

/** One remote wrist: follows the received pose, shows the copied gift group */
class RemoteHand {
  private anchor: SceneObject
  private group: SceneObject = null
  private particles: SceneObject = null
  private targetPos: vec3 = null
  private targetRot: quat = null
  private snapped = false

  constructor(parent: SceneObject, side: string) {
    this.anchor = global.scene.createSceneObject(side + "Wrist")
    this.anchor.setParent(parent)
  }

  setGift(source: SceneObject, particleSource: SceneObject) {
    if (this.group) this.group.destroy()
    this.group = source ? copyVisualOnly(this.anchor, source) : null
    if (!this.particles && particleSource) {
      this.particles = copyVisualOnly(this.anchor, particleSource)
      this.particles.enabled = false
    }
  }

  setParticles(on: boolean) {
    if (this.particles && this.particles.enabled !== on) this.particles.enabled = on
  }

  setTarget(pose: number[] | null, scale: vec3) {
    if (!pose) {
      this.anchor.enabled = false
      this.snapped = false
      return
    }
    this.targetPos = new vec3(pose[0], pose[1], pose[2])
    this.targetRot = new quat(pose[6], pose[3], pose[4], pose[5])
    this.anchor.getTransform().setWorldScale(scale)
    this.anchor.enabled = true
  }

  update(dt: number, speed: number) {
    if (!this.targetPos || !this.anchor.enabled) return
    const t = this.anchor.getTransform()
    if (!this.snapped) {
      t.setLocalPosition(this.targetPos)
      t.setLocalRotation(this.targetRot)
      this.snapped = true
      return
    }
    const k = 1 - Math.exp(-speed * dt)
    t.setLocalPosition(vec3.lerp(t.getLocalPosition(), this.targetPos, k))
    t.setLocalRotation(quat.slerp(t.getLocalRotation(), this.targetRot, k))
  }
}

// Copy a local visual under `parent`, enabled, with its interaction parts switched off so
// other players' gifts can't be hovered or pinched
function copyVisualOnly(parent: SceneObject, source: SceneObject): SceneObject {
  const copy = parent.copyWholeHierarchy(source)
  copy.enabled = true
  disableInteraction(copy)
  return copy
}

function disableInteraction(obj: SceneObject) {
  for (const collider of obj.getComponents("Physics.ColliderComponent")) collider.enabled = false
  for (const script of obj.getComponents("Component.ScriptComponent")) script.enabled = false
  for (let i = 0; i < obj.getChildrenCount(); i++) disableInteraction(obj.getChild(i))
}
