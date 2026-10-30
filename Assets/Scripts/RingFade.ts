import { LSTween } from "../LSTween.lspkg/LSTween"
import Easing from "../LSTween.lspkg/TweenJS/Easing"
import { ReplayableTweens } from "./ReplayableTweens"

/**
 * Fades the UI rings on and off. A ring's own script fades it on and later off, and the
 * story can fade it off sooner, so each new fade stops whatever that ring was doing.
 * keepRingOn is for rings that stay until the story hides them (registered as
 * global.keepRingOn by StartMenuBridge).
 *
 * The ring materials are Screen blended, so dimming the color to black fades them out.
 */
const FADE_MS = 2000

type RingState = { pass: any; full: vec4; amount: number; tweens: any[]; keepOn: boolean }

const rings: { [id: string]: RingState } = {}

function findVisual(root: SceneObject): RenderMeshVisual {
  const visual = root.getComponent("Component.RenderMeshVisual")
  if (visual) return visual
  for (const child of root.children) {
    const found = findVisual(child)
    if (found) return found
  }
  return null
}

function stateOf(ring: SceneObject): RingState {
  const visual = findVisual(ring)
  const id = visual.getSceneObject().uniqueIdentifier
  if (!rings[id]) {
    rings[id] = { pass: visual.mainPass, full: visual.mainPass.baseColor, amount: 1, tweens: [], keepOn: false }
  }
  return rings[id]
}

function stopFades(state: RingState) {
  state.tweens.forEach((tween) => tween.stop())
  state.tweens = []
}

function setAmount(state: RingState, amount: number) {
  state.amount = amount
  state.pass.baseColor = state.full.uniformScale(amount)
}

function fade(state: RingState, from: number, to: number, replay: ReplayableTweens) {
  const tween = replay.track(LSTween.rawTween(FADE_MS))
    .easing(Easing.Sinusoidal.InOut)
    .onUpdate((value) => setAmount(state, MathUtils.lerp(from, to, value.t)))
  state.tweens.push(tween)
  return tween
}

/** Call before switching the ring on: it then stays until fadeRingOff */
export function keepRingOn(ring: SceneObject) {
  stateOf(ring).keepOn = true
}

/** Fades the ring on, holds it, then fades it off */
export function fadeRingOnThenOff(ring: SceneObject, holdMs: number, replay: ReplayableTweens) {
  const state = stateOf(ring)
  stopFades(state)
  setAmount(state, 0)
  const fadeOn = fade(state, 0, 1, replay)
  if (!state.keepOn) fadeOn.chain(fade(state, 1, 0, replay).delay(holdMs))
  fadeOn.start()
}

/** Fades the ring off from wherever it is now */
export function fadeRingOff(ring: SceneObject, replay: ReplayableTweens) {
  const state = stateOf(ring)
  stopFades(state)
  fade(state, state.amount, 0, replay).start()
}
