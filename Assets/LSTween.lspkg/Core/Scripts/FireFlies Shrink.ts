import { LSTween } from "../../LSTween";
import Easing from "../../TweenJS/Easing";
import { RotationInterpolationType } from "../../RotationInterpolationType";

@component
export class FireflyController extends BaseScriptComponent {
  @input ff1: SceneObject;
  @input ff2: SceneObject;
  @input ff3: SceneObject;


  onAwake() {
    const ff1Transform = this.ff1.getTransform();
    const ff2Transform = this.ff2.getTransform();
    const ff3Transform = this.ff3.getTransform();
 
    
       const ffTargetScale = new vec3(0, 0, 0);


    // Staggered scale-in animations
    const scaleFF1 = LSTween.scaleToLocal(ff1Transform, ffTargetScale, 1000)
      .easing(Easing.Circular.InOut)
      .delay(0);

    const scaleFF2 = LSTween.scaleToLocal(ff2Transform, ffTargetScale, 1000)
      .easing(Easing.Circular.InOut)
      .delay(500);

    const scaleFF3 = LSTween.scaleToLocal(ff3Transform, ffTargetScale, 1000)
      .easing(Easing.Circular.InOut)
      .delay(1000);

    scaleFF1.start();
    scaleFF2.start();
    scaleFF3.start();


  }
}