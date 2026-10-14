import { LSTween } from "../../LSTween";
import Easing from "../../TweenJS/Easing";
import { RotationInterpolationType } from "../../RotationInterpolationType";

@component
export class EarthScaleAndRotate extends BaseScriptComponent {
  onAwake() {
    const transform = this.getTransform();
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
