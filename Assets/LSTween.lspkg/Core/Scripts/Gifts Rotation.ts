import { LSTween } from "../../LSTween";
import { RotationInterpolationType } from "../../RotationInterpolationType";

@component
export class GiftsAdditiveRotation extends BaseScriptComponent {
  @input gifts: SceneObject;

  onAwake() {
    if (!this.gifts) {
      print("Error: Gifts SceneObject not assigned.");
      return;
    }

    const transform = this.gifts.getTransform();
    this.startRotationLoop(transform);
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
          rotateOnce(); // Recursively rotate again
        })
        .start();
    };

    rotateOnce();
  }
}
