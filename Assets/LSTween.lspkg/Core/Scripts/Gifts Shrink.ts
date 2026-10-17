import { LSTween } from "../../LSTween";
import { ReplayableTweens } from "../../../Scripts/ReplayableTweens";
import Easing from "../../TweenJS/Easing";

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

    const shrinkTween = this.replay.track(LSTween.scaleFromToLocal(
      transform,
      currentScale,
      vec3.zero(),
      2000
    )).easing(Easing.Circular.InOut);

    shrinkTween.start();
  }
}
