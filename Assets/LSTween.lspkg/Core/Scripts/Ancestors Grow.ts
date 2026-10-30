import { LSTween } from "../../LSTween";
import { ReplayableTweens } from "../../../Scripts/ReplayableTweens";
import { pulseHaloLines } from "../../../Scripts/HaloLinesPulse";
import Easing from "../../TweenJS/Easing";

@component
export class Ancestors extends BaseScriptComponent {
  @input ancestor1: SceneObject;
  @input ancestor2: SceneObject;
  @input ancestor3: SceneObject;
  @input ancestorGifts: SceneObject;


  private replay: ReplayableTweens;

  // Plays again when switched back on (Replay); see ReplayableTweens
  onAwake() {
    this.replay = new ReplayableTweens(this, () => this.play());
    this.replay.start();
  }

  private play() {
    const a1 = this.ancestor1.getTransform();
    const a2 = this.ancestor2.getTransform();
    const a3 = this.ancestor3.getTransform();
    const gifts = this.ancestorGifts.getTransform();


    const ancestorTargetScale = new vec3(70, 70, 70);
    const giftTargetScale = new vec3(1, 1, 1);

    // Start at scale 0
    a1.setLocalScale(vec3.zero());
    a2.setLocalScale(vec3.zero());
    a3.setLocalScale(vec3.zero());
    gifts.setLocalScale(vec3.zero());

    // Staggered scale tweens
    const tween1 = this.replay.track(LSTween.scaleToLocal(a1, ancestorTargetScale, 9000))
      .easing(Easing.Quadratic.InOut)
      .delay(0);

    const tween2 = this.replay.track(LSTween.scaleToLocal(a2, ancestorTargetScale, 9000))
      .easing(Easing.Quadratic.InOut)
      .delay(2000);

    const tween3 = this.replay.track(LSTween.scaleToLocal(a3, ancestorTargetScale, 9000))
      .easing(Easing.Quadratic.InOut)
      .delay(4000);

    const tweenGifts = this.replay.track(LSTween.scaleToLocal(gifts, giftTargetScale, 9000))
      .easing(Easing.Quadratic.InOut)
      .delay(9500);

    tween1.start();
    tween2.start();
    tween3.start();
    tweenGifts.start();

    pulseHaloLines(this.ancestor1, this.replay);
  }
}