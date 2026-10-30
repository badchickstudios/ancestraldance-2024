import { LSTween } from "../../LSTween";
import { ReplayableTweens } from "../../../Scripts/ReplayableTweens";
import Easing from "../../TweenJS/Easing";
import { RotationInterpolationType } from "../../RotationInterpolationType";
import { crossfadeEarths } from "../../../Scripts/EarthHealFade";

@component
export class EarthScaleAndRotate extends BaseScriptComponent {
  @input
  @hint("Local scale the Earth grows to")
  targetLocalScale: vec3 = vec3.one();

  private replay: ReplayableTweens;
  private healthyEarth: Transform = null;
  private restoreMaterials: () => void = null;

  // Plays again when switched back on (Replay); see ReplayableTweens
  onAwake() {
    // GameManager calls this when it turns the Earth on
    (global as any).growEarth = () => this.grow();
    (global as any).fadeToHealthyEarth = (unhealthy: SceneObject, healthy: SceneObject) =>
      this.fadeToHealthy(unhealthy, healthy);

    // The healthy Earth turns with this one, so the two line up and the spin carries on
    this.createEvent("LateUpdateEvent").bind(() => {
      if (this.healthyEarth) this.healthyEarth.setLocalRotation(this.getTransform().getLocalRotation());
    });

    this.replay = new ReplayableTweens(this, () => this.play());
    this.replay.start();
  }

  private play() {
    // The Earth is hidden until the story turns it on, so the grow waits for that
    this.getTransform().setLocalScale(vec3.zero());

    // Already on: this player placed the Earth after the story reached it
    if ((global as any).earthShown) this.grow();
  }

  private grow() {
    this.replay.stop();
    this.healthyEarth = null;
    if (this.restoreMaterials) this.restoreMaterials();
    this.restoreMaterials = null;

    const transform = this.getTransform();

    // Start scaled down. Local scale, not world: under the rotated colocated world
    // (and the spinning parent Earth) a world-scale tween shears the mesh.
    transform.setLocalScale(vec3.zero());

    // Scale up from 0 → target over 13 sec
    const scaleTween = this.replay.track(LSTween.scaleToLocal(transform, this.targetLocalScale, 13000))
      .easing(Easing.Quadratic.InOut)
      .onComplete(() => {
        // Start continuous rotation after scaling finishes
        this.startRotationLoop(transform);
      });

    scaleTween.start();
  }

  private fadeToHealthy(unhealthy: SceneObject, healthy: SceneObject) {
    this.healthyEarth = healthy.getTransform();
    healthy.enabled = true;
    this.restoreMaterials = crossfadeEarths(unhealthy, healthy, this.replay);
  }

  private startRotationLoop(transform: Transform) {
    const rotationStep = quat.angleAxis(MathUtils.DegToRad * 45, vec3.up());

    const rotateOnce = () => {
      this.replay.track(LSTween.rotateOffset(
        transform,
        rotationStep,
        5000,
        RotationInterpolationType.LERP
      ))
        .onComplete(() => {
          rotateOnce(); // Recursively trigger next rotation
        })
        .start();
    };

    rotateOnce();
  }
}
