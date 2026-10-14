import { LSTween } from "../../LSTween";
import Easing from "../../TweenJS/Easing";
import { RotationInterpolationType } from "../../RotationInterpolationType";

@component
export class EarthScaleAndRotate extends BaseScriptComponent {
  onAwake() {
    const transform = this.getTransform();

    // Start scaled down
    transform.setWorldScale(vec3.zero());

    // Scale up from 0 → 1 over 13 sec, after 9 sec delay
    const scaleTween = LSTween.scaleToWorld(transform, vec3.one(), 13000)
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
