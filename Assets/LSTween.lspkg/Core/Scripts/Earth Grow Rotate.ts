import { LSTween } from "../../LSTween";
import Easing from "../../TweenJS/Easing";
import { RotationInterpolationType } from "../../RotationInterpolationType";

@component
export class EarthScaleAndRotate extends BaseScriptComponent {
  @input
  @hint("Local scale the Earth grows to")
  targetLocalScale: vec3 = vec3.one();

  onAwake() {
    const transform = this.getTransform();

    // Start scaled down. Local scale, not world: under the rotated colocated world
    // (and the spinning parent Earth) a world-scale tween shears the mesh.
    transform.setLocalScale(vec3.zero());

    // Scale up from 0 → target over 13 sec, after 9 sec delay
    const scaleTween = LSTween.scaleToLocal(transform, this.targetLocalScale, 13000)
      .easing(Easing.Quadratic.InOut)
      .delay(9000)
      .onComplete(() => {
        // Start continuous rotation after scaling finishes
        this.startRotationLoop(transform);
      });

    scaleTween.start();
  }

  private startRotationLoop(transform: Transform) {
    const rotationStep = quat.angleAxis(MathUtils.DegToRad * 45, vec3.up());

    const rotateOnce = () => {
      LSTween.rotateOffset(
        transform,
        rotationStep,
        5000,
        RotationInterpolationType.LERP
      )
        .onComplete(() => {
          rotateOnce(); // Recursively trigger next rotation
        })
        .start();
    };

    rotateOnce();
  }
}
