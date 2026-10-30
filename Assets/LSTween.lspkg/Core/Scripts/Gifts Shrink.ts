import { LSTween } from "../../LSTween";
import { ReplayableTweens } from "../../../Scripts/ReplayableTweens";
import Easing from "../../TweenJS/Easing";

const CHOSEN_SHRINK_MS = 1000;

@component
export class ShrinkToZero extends BaseScriptComponent {
  @input targetObject: SceneObject;

  private replay: ReplayableTweens;

  // Plays again when switched back on (Replay); see ReplayableTweens
  onAwake() {
    this.replay = new ReplayableTweens(this, () => this.play());
    this.replay.start();
  }

  private play() {
    const transform = this.targetObject.getTransform();
    const currentScale = transform.getLocalScale();

    // The chosen gift goes first (GiftManager sets global.chosenGift), then the rest
    const chosen = this.chosenGift();
    if (chosen) {
      const chosenTransform = chosen.getTransform();
      this.replay.track(LSTween.scaleFromToLocal(
        chosenTransform,
        chosenTransform.getLocalScale(),
        vec3.zero(),
        CHOSEN_SHRINK_MS
      )).easing(Easing.Back.In).start();
    }

    const shrinkTween = this.replay.track(LSTween.scaleFromToLocal(
      transform,
      currentScale,
      vec3.zero(),
      2000
    )).easing(Easing.Circular.InOut).delay(chosen ? CHOSEN_SHRINK_MS : 0);

    shrinkTween.start();
  }

  // The object that gets pinched can be deep inside the gift, so find the whole gift
  private chosenGift(): SceneObject {
    let gift: SceneObject = (global as any).chosenGift;
    while (gift && gift.getParent() && !gift.getParent().isSame(this.targetObject)) {
      gift = gift.getParent();
    }
    return gift && gift.getParent() ? gift : null;
  }
}
