import { LSTween } from "../../LSTween";
import { ReplayableTweens } from "../../../Scripts/ReplayableTweens";
import Easing from "../../TweenJS/Easing";

@component
export class ScaleDownToZero extends BaseScriptComponent {
  @input targetObject: SceneObject;

  private replay: ReplayableTweens;

  // Plays again when switched back on (Replay); see ReplayableTweens
  onAwake() {
    this.replay = new ReplayableTweens(this, () => this.play());
    this.replay.start();
  }

  private play() {
    if (!this.targetObject) {
      print("Error: No targetObject assigned.");
      return;
    }

    const transform = this.targetObject.getTransform();

    const scaleDown = this.replay.track(LSTween.scaleToLocal(transform, vec3.zero(), 2000))
      .easing(Easing.Cubic.InOut);

    scaleDown.start();
  }
}
