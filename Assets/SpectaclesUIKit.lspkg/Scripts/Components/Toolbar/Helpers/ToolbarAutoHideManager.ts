import {Interactable} from "SpectaclesInteractionKit.lspkg/Components/Interaction/Interactable/Interactable"
import animate, {CancelSet} from "SpectaclesInteractionKit.lspkg/Utils/animate"

export class ToolbarAutoHideManager {
  private readonly OPACITY_TWEEN_DURATION = 0.4
  private readonly AUTO_HIDE_ALPHA = 0
  private readonly AUTO_SHOW_ALPHA = 1

  private _currentAlpha: number = 1
  private _alphaCancel: CancelSet = new CancelSet()

  public constructor(
    private _hoverTarget: SceneObject,
    private setAlpha: (alpha: number) => void
  ) {}

  public setup(): void {
    const interactable = this._hoverTarget.getComponent(Interactable.getTypeName()) as Interactable
    if (!interactable) {
      return
    }

    interactable.onHoverEnter.add(() => {
      this.tweenAlpha(this._currentAlpha, this.AUTO_SHOW_ALPHA)
    })

    interactable.onHoverExit.add(() => {
      this.tweenAlpha(this._currentAlpha, this.AUTO_HIDE_ALPHA)
    })
  }

  public getInitialAlpha(): number {
    return this.AUTO_HIDE_ALPHA
  }

  private tweenAlpha(fromAlpha: number, toAlpha: number): void {
    this._alphaCancel.cancel()

    const duration = this.OPACITY_TWEEN_DURATION * Math.abs(toAlpha - fromAlpha)

    animate({
      duration: duration,
      update: (t: number) => {
        this._currentAlpha = fromAlpha + (toAlpha - fromAlpha) * t
        this.setAlpha(this._currentAlpha)
      },
      ended: () => {
        this._currentAlpha = toAlpha
        this.setAlpha(this._currentAlpha)
      },
      cancelSet: this._alphaCancel
    })
  }

  public cancel(): void {
    this._alphaCancel.cancel()
  }
}
