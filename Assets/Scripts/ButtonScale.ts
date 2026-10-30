import { LSTween } from "../LSTween.lspkg/LSTween"
import Easing from "../LSTween.lspkg/TweenJS/Easing"

/**
 * Scales buttons on and off instead of switching them. Registered as global.scaleButton
 * by StartMenuBridge, so the JS scripts can use it too.
 *
 * Safe to call every frame or repeatedly: it only acts when the button needs to change.
 * A button switched on while its parent is hidden waits at scale 0, and scales on the next
 * time it's shown, so the animation is never spent where nobody can see it.
 */
const SCALE_ON_MS = 350
const SCALE_OFF_MS = 250

type ButtonState = { full: vec3; shown: boolean; tween: any }

const states: { [id: string]: ButtonState } = {}

function stateOf(button: SceneObject): ButtonState {
  const id = button.uniqueIdentifier
  if (!states[id]) states[id] = { full: button.getTransform().getLocalScale(), shown: false, tween: null }
  return states[id]
}

export function scaleButton(button: SceneObject, show: boolean) {
  const state = stateOf(button)
  const transform = button.getTransform()

  const settled = show ? state.shown && button.enabled : !state.shown && (state.tween || !button.enabled)
  if (settled) return

  if (state.tween) state.tween.stop()
  state.tween = null

  if (!show && !button.isEnabledInHierarchy) {
    button.enabled = false
    transform.setLocalScale(state.full)
    return
  }

  if (show) {
    if (!button.isEnabledInHierarchy) transform.setLocalScale(vec3.zero())
    button.enabled = true
    if (!button.isEnabledInHierarchy) return
  }

  state.shown = show
  state.tween = LSTween.scaleFromToLocal(
    transform,
    transform.getLocalScale(),
    show ? state.full : vec3.zero(),
    show ? SCALE_ON_MS : SCALE_OFF_MS
  )
    .easing(show ? Easing.Cubic.Out : Easing.Cubic.In)
    .onComplete(() => {
      state.tween = null
      if (show) return
      button.enabled = false
      transform.setLocalScale(state.full)
    })
  state.tween.start()
}

/** For objects something else switches on, like the kit's start menu */
export function scaleOnFromZero(button: SceneObject) {
  const state = stateOf(button)
  state.shown = false
  button.getTransform().setLocalScale(vec3.zero())
  scaleButton(button, true)
}
