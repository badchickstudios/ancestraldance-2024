/**
 * Makes a one-shot tween script replayable (for the Replay button).
 *
 * The story's grow/shrink scripts play their tweens once, in onAwake. LSTween tweens run
 * globally, so they keep going even after their object is switched off, and onAwake never
 * runs again. With this helper a script plays as before, stops its tweens when its object
 * is switched off, and plays fresh when the object is switched on again.
 *
 *   private replay = new ReplayableTweens(this, () => this.play())
 *   onAwake() { this.replay.start() }
 *   private play() { this.replay.track(LSTween.scaleToLocal(...)).start() }
 */
export class ReplayableTweens {
  private tweens: any[] = []
  private awakeTime = -1

  constructor(owner: BaseScriptComponent, private play: () => void) {
    owner.createEvent("OnEnableEvent").bind(() => {
      // Switching on the first time also wakes the script, which already played
      if (getTime() === this.awakeTime) return
      this.stop()
      this.play()
    })
    owner.createEvent("OnDisableEvent").bind(() => this.stop())
  }

  /** Call from onAwake */
  start() {
    this.awakeTime = getTime()
    this.play()
  }

  /** Remember a tween so it can be stopped; returns it for chaining */
  track<T>(tween: T): T {
    this.tweens.push(tween)
    return tween
  }

  stop() {
    for (const tween of this.tweens) {
      try {
        tween.stop()
      } catch (e) {}
    }
    this.tweens = []
  }
}
