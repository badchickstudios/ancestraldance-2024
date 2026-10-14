import { LSTween } from "../../LSTween";
import Easing from "../../TweenJS/Easing";

@component
export class ScaleDownToZero extends BaseScriptComponent {
  @input targetObject: SceneObject;

  onAwake() {
    if (!this.targetObject) {
      print("Error: No targetObject assigned.");
      return;
    }

    const transform = this.targetObject.getTransform();

    const scaleDown = LSTween.scaleToLocal(transform, vec3.zero(), 2000)
      .easing(Easing.Cubic.InOut);

    scaleDown.start();
  }
}
