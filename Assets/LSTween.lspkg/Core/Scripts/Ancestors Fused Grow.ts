import { LSTween } from "../../LSTween";
import Easing from "../../TweenJS/Easing";

@component
export class Ancestors extends BaseScriptComponent {
  @input ancestorFused: SceneObject;

  onAwake() {
    const a1 = this.ancestorFused.getTransform();

    const targetScale = new vec3(70, 70, 70);

    // Start at scale 0
    a1.setLocalScale(vec3.zero());


    // Staggered scale tweens
    const tween1 = LSTween.scaleToLocal(a1, targetScale, 9000)
      .easing(Easing.Quadratic.InOut)
      .delay(0);

    tween1.start();

  }
}