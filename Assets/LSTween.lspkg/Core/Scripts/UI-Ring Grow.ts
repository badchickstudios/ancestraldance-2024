import { LSTween } from "../../LSTween";
import { ReplayableTweens } from "../../../Scripts/ReplayableTweens";
import Easing from "../../TweenJS/Easing";

@component
export class UiRingScale extends BaseScriptComponent {
  private replay: ReplayableTweens;

  // Plays again when switched back on (Replay); see ReplayableTweens
  onAwake() {
    this.replay = new ReplayableTweens(this, () => this.play());
    this.replay.start();
  }

  private play() {
    const transform = this.getTransform();

    // Start at scale 0
    transform.setLocalScale(vec3.zero());

    // Target scale
    const targetScale = new vec3(1, 1, 1);

    // Scale up to 1 over 2 seconds
    const scaleUp = this.replay.track(LSTween.scaleToLocal(transform, targetScale, 2000))
      .easing(Easing.Circular.InOut);

    // Scale back down to 0 after 10 second delay
    const scaleDown = this.replay.track(LSTween.scaleToLocal(transform, vec3.zero(), 2000))
      .easing(Easing.Circular.InOut)
      .delay(10000);

    // Chain and start
    scaleUp.chain(scaleDown).start();
  }
}
