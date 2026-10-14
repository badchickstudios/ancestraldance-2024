import { LSTween } from "../../LSTween";
import Easing from "../../TweenJS/Easing";

@component
export class HaloLinesScale extends BaseScriptComponent {
  @input haloLines: SceneObject;
  

  onAwake() {
    if (!this.haloLines) {
      print("Error: HaloLines SceneObject not assigned.");
      return;
    }

    const transform = this.haloLines.getTransform();
    const fullScale = new vec3(10, 10, 10);
    const zeroScale = vec3.zero();

    // Start at scale 0
    transform.setLocalScale(zeroScale);

    const scaleUp = LSTween.scaleToLocal(transform, fullScale, 1000)
      .easing(Easing.Quadratic.InOut);

    const scaleDown = LSTween.scaleToLocal(transform, zeroScale, 1000)
      .easing(Easing.Quadratic.InOut)
      .delay(3000); // Wait 3 seconds before shrinking

    scaleUp.chain(scaleDown).start();
  }
}
