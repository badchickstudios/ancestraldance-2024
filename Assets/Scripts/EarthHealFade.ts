import { LSTween } from "../LSTween.lspkg/LSTween"
import Easing from "../LSTween.lspkg/TweenJS/Easing"
import { ReplayableTweens } from "./ReplayableTweens"

/**
 * Crossfades the unhealthy Earth into the healthy one.
 *
 * The healthy globe draws both Earth materials during the fade: one mesh with two
 * materials has identical depth, while two meshes in the same place flicker. The materials
 * are Screen blended, so dimming a color to black fades it out. The fires go out one at a
 * time, by scale because the flame shader has no opacity control.
 *
 * There's only ever one dodecahedron: two on the same surface shimmer. The healthy one
 * takes on the fire shader and morphs, with the glitch easing out as the colors change.
 *
 * Returns a function that puts the materials back (Replay restores the transforms).
 */
const FADE_MS = 4000
const FIRE_OUT_PORTION = 0.4 // How much of the fade each fire takes to shrink
const HEALTHY_THICK_LINES = new vec4(0.1, 0.6, 1, 1)
const HEALTHY_THIN_LINES = new vec4(0.05, 0.9, 0.55, 1)
const HEALTHY_RIM = new vec4(0.5, 0.9, 1, 1)

function find(root: SceneObject, name: string): SceneObject {
  if (root.name === name) return root
  for (const child of root.children) {
    const found = find(child, name)
    if (found) return found
  }
  return null
}

function findVisual(root: SceneObject): RenderMeshVisual {
  if (!root.enabled) return null
  const visual = root.getComponent("Component.RenderMeshVisual")
  if (visual) return visual
  for (const child of root.children) {
    const found = findVisual(child)
    if (found) return found
  }
  return null
}

// Sets a color to a fraction of the value it has now
function fader(pass: any, property: string) {
  const full = pass[property]
  return (amount: number) => {
    pass[property] = full.uniformScale(amount)
  }
}

export function crossfadeEarths(unhealthy: SceneObject, healthy: SceneObject, replay: ReplayableTweens) {
  const unhealthyGlobe = findVisual(find(unhealthy, "earth-hologram2"))
  const healthyGlobe = findVisual(find(healthy, "earth-hologram2"))
  const unhealthyMaterial = unhealthyGlobe.mainMaterial
  const healthyGlobeMaterial = healthyGlobe.mainMaterial
  const fadeGlobeOut = fader(unhealthyGlobe.mainPass, "baseColorFactor")
  const fadeGlobeIn = fader(healthyGlobe.mainPass, "baseColorFactor")

  // Keep just the one globe, drawing both materials
  healthyGlobe.addMaterial(unhealthyMaterial)
  unhealthyGlobe.getSceneObject().enabled = false

  // Each fire gets its own turn, in a random order so they don't go around the ring
  const fireObjects = find(unhealthy, "Fire Comp").children
  const fireTurns = fireObjects.map((_, index) => (index / (fireObjects.length - 1)) * (1 - FIRE_OUT_PORTION))
  fireTurns.sort(() => Math.random() - 0.5)
  const fires = fireObjects.map((fire, index) => ({
    transform: fire.getTransform(),
    scale: fire.getTransform().getLocalScale(),
    turn: fireTurns[index],
  }))

  // Hand the fire dodecahedron's look to the healthy one, then keep just that one
  const unhealthyDodec = find(unhealthy, "dodecahedron3")
  const healthyDodec = find(healthy, "dodecahedron3")
  const dodecVisual = findVisual(healthyDodec)
  const healthyMaterial = dodecVisual.mainMaterial
  dodecVisual.mainMaterial = findVisual(unhealthyDodec).mainMaterial.clone()
  unhealthyDodec.enabled = false

  const pass: any = dodecVisual.mainPass
  const thickFrom = pass.thicklinesColor
  const thinFrom = pass.thinlinesColor
  const rimFrom = pass.rimTint
  const glitchFrom = pass.glitchIntensity

  // The two dodecahedrons sit at different heights
  const dodec = healthyDodec.getTransform()
  const dodecFrom = unhealthyDodec.getTransform().getLocalPosition()
  const dodecTo = dodec.getLocalPosition()

  const setProgress = (progress: number) => {
    fadeGlobeOut(1 - progress)
    fadeGlobeIn(progress)
    fires.forEach((fire) => {
      const out = MathUtils.clamp((progress - fire.turn) / FIRE_OUT_PORTION, 0, 1)
      fire.transform.setLocalScale(fire.scale.uniformScale(1 - out))
    })
    dodec.setLocalPosition(vec3.lerp(dodecFrom, dodecTo, progress))
    pass.thicklinesColor = vec4.lerp(thickFrom, HEALTHY_THICK_LINES, progress)
    pass.thinlinesColor = vec4.lerp(thinFrom, HEALTHY_THIN_LINES, progress)
    pass.rimTint = vec4.lerp(rimFrom, HEALTHY_RIM, progress)
    pass.glitchIntensity = MathUtils.lerp(glitchFrom, 0, progress)
  }

  const restoreGlobes = () => {
    healthyGlobe.clearMaterials()
    healthyGlobe.addMaterial(healthyGlobeMaterial)
    fadeGlobeOut(1)
    fadeGlobeIn(1)
  }

  setProgress(0)

  replay.track(LSTween.rawTween(FADE_MS))
    .easing(Easing.Quadratic.InOut)
    .onUpdate((value) => setProgress(value.t))
    .onComplete(() => {
      unhealthy.enabled = false
      restoreGlobes()
    })
    .start()

  return () => {
    restoreGlobes()
    dodecVisual.mainMaterial = healthyMaterial
  }
}
