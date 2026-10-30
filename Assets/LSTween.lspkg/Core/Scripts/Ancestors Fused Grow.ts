import { LSTween } from "../../LSTween";
import { ReplayableTweens } from "../../../Scripts/ReplayableTweens";
import { pulseHaloLines } from "../../../Scripts/HaloLinesPulse";
import Easing from "../../TweenJS/Easing";

@component
export class Ancestors extends BaseScriptComponent {
  @input ancestorFused: SceneObject;

  private replay: ReplayableTweens;

  // Plays again when switched back on (Replay); see ReplayableTweens
  onAwake() {
    this.replay = new ReplayableTweens(this, () => this.play());
    this.replay.start();
  }

  private play() {
    const a1 = this.ancestorFused.getTransform();

    const targetScale = new vec3(70, 70, 70);

    // Start at scale 0
    a1.setLocalScale(vec3.zero());


    // Staggered scale tweens
    const tween1 = this.replay.track(LSTween.scaleToLocal(a1, targetScale, 9000))
      .easing(Easing.Quadratic.InOut)
      .delay(0);

    tween1.start();

    pulseHaloLines(this.ancestorFused, this.replay);

  }
}