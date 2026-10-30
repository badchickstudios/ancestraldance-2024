import { ReplayableTweens } from "../../../Scripts/ReplayableTweens";
import { fadeRingOff } from "../../../Scripts/RingFade";

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

    fadeRingOff(this.targetObject, this.replay);
  }
}
