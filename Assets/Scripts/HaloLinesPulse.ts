import { LSTween } from "../LSTween.lspkg/LSTween"
import Easing from "../LSTween.lspkg/TweenJS/Easing"
import { ReplayableTweens } from "./ReplayableTweens"

/**
 * Grows and shrinks the ancestors' halo lines by scaling the texture's UVs.
 *
 * The lines are part of the skinned ancestor meshes, so they can't be scaled through a
 * transform. All four meshes share the "halo lines" material, so one pulse drives them all.
 *
 *   private play() { pulseHaloLines(this.ancestor1, this.replay) }
 */
const MATERIAL_NAME = "halo lines"
const PULSE_MS = 2000
const SMALLEST_SIZE = 0.26 // Fraction of the full size
const FULL_SIZE_UV_SCALE = 0.72 // lines18.png has empty margins, this crops them

function findPass(root: SceneObject): any {
  for (const visual of root.getComponents("Component.RenderMeshVisual")) {
    if (visual.mainMaterial && visual.mainMaterial.name === MATERIAL_NAME) return visual.mainPass
  }
  for (const child of root.children) {
    const pass = findPass(child)
    if (pass) return pass
  }
  return null
}

export function pulseHaloLines(root: SceneObject, replay: ReplayableTweens) {
  const pass = findPass(root)
  if (!pass) {
    print("Error: no " + MATERIAL_NAME + " material under " + root.name)
    return
  }

  const setSize = (size: number) => {
    const scale = FULL_SIZE_UV_SCALE / size
    const offset = 0.5 * (1 - scale) // Keeps the star centred
    pass.baseColorTexture_scale = new vec2(scale, scale)
    pass.baseColorTexture_offset = new vec2(offset, offset)
  }

  setSize(SMALLEST_SIZE)

  const grow = replay.track(LSTween.rawTween(PULSE_MS))
    .easing(Easing.Sinusoidal.Out)
    .onUpdate((value) => setSize(MathUtils.lerp(SMALLEST_SIZE, 1, value.t)))

  const shrink = replay.track(LSTween.rawTween(PULSE_MS))
    .easing(Easing.Sinusoidal.In)
    .onUpdate((value) => setSize(MathUtils.lerp(1, SMALLEST_SIZE, value.t)))

  grow.chain(shrink)
  shrink.chain(grow)
  grow.start()
}
