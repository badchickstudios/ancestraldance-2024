import { ReplayableTweens } from "../../../Scripts/ReplayableTweens";
import { fadeRingOnThenOff } from "../../../Scripts/RingFade";

@component
export class UiRingScale extends BaseScriptComponent {
  private replay: ReplayableTweens;

  // Plays again when switched back on (Replay); see ReplayableTweens
  onAwake() {
    this.replay = new ReplayableTweens(this, () => this.play());
    this.replay.start();
  }

  private play() {
    // The rings are placed at scale 0 in the scene; they fade now rather than grow
    this.getTransform().setLocalScale(vec3.one());

    // Fade off after 10 seconds
    fadeRingOnThenOff(this.getSceneObject(), 10000, this.replay);
  }
}
