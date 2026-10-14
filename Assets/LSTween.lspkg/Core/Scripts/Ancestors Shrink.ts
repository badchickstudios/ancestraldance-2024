import { LSTween } from "../../LSTween";
import Easing from "../../TweenJS/Easing";

@component
export class Ancestors extends BaseScriptComponent {
  @input ancestor1: SceneObject;
  @input ancestor2: SceneObject;
  @input ancestor3: SceneObject;

  onAwake() {
    const a1 = this.ancestor1.getTransform();
    const a2 = this.ancestor2.getTransform();
    const a3 = this.ancestor3.getTransform();

    const targetScale = new vec3(0, 0, 0);

    // Staggered scale tweens
    const tween1 = LSTween.scaleToLocal(a1, targetScale, 13000)
      .easing(Easing.Quadratic.InOut)
      .delay(5000);

    const tween2 = LSTween.scaleToLocal(a2, targetScale, 13000)
      .easing(Easing.Quadratic.InOut)
      .delay(5200);

    const tween3 = LSTween.scaleToLocal(a3, targetScale, 13000)
      .easing(Easing.Quadratic.InOut)
      .delay(5300);

    tween1.start();
    tween2.start();
    tween3.start();
  }
}