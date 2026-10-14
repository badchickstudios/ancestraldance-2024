import {InteractorEvent} from "SpectaclesInteractionKit.lspkg/Core/Interactor/InteractorEvent"
import {clamp} from "SpectaclesInteractionKit.lspkg/Utils/mathUtils"
import {
  RoundedRectangleVisual,
  RoundedRectangleVisualParameters
} from "../../Visuals/RoundedRectangle/RoundedRectangleVisual"
import {Slider} from "./Slider"

/**
 * A scrub bar component for media-style seeking.
 *
 * Visually presents a track with a fill indicator and no visible knob.
 * Tap anywhere on the track to seek, or drag to scrub.
 *
 * @extends Slider
 */
@component
export class ScrubBar extends Slider {
  public readonly hasTrackVisual: boolean = true

  protected override snapToTriggerPosition: boolean = true

  protected override get defaultTrackStyle(): Partial<RoundedRectangleVisualParameters> {
    const themed = this.resolveTheme()?.styles["ScrubBarTrack"]?.["default"]
    return themed ?? super.defaultTrackStyle
  }

  protected override get defaultKnobStyle(): Partial<RoundedRectangleVisualParameters> {
    const themed = this.resolveTheme()?.styles["ScrubBarKnob"]?.["default"]
    return themed ?? super.defaultKnobStyle
  }

  protected override get defaultTrackFillStyle(): Partial<RoundedRectangleVisualParameters> {
    const themed = this.resolveTheme()?.styles["ScrubBarFill"]?.["default"]
    return themed ?? super.defaultTrackFillStyle
  }

  protected override get cornerRadiusFactor(): number {
    const data = this.resolveTheme()?.componentData?.["ScrubBar"] as {cornerRadiusFactor?: number} | undefined
    return data?.cornerRadiusFactor ?? 0.5
  }

  protected override get knobObjectName(): string {
    return "ScrubBarKnob"
  }

  protected override get trackFillObjectName(): string {
    return "ScrubBarTrackFill"
  }

  protected override onTriggerRespond(event: InteractorEvent) {
    if (!this._isDragged) {
      if (this.snapToTriggerPosition) {
        const triggerValue = clamp(
          (this.transform.getInvertedWorldTransform().multiplyPoint(event.interactor.planecastPoint).x +
            this._size.x / 2) /
            this._size.x,
          0,
          1
        )
        this.updateCurrentValue(triggerValue, false)
      }
    }
  }

  protected override createDefaultVisual(): void {
    super.createDefaultVisual()

    if (this._knobVisual) {
      const knobData = this.resolveTheme()?.componentData?.["ScrubBarKnob"] as {knobVisible?: boolean} | undefined
      const knobVisible = knobData?.knobVisible ?? false
      ;(this._knobVisual as RoundedRectangleVisual).renderMeshVisual.enabled = knobVisible
    }
  }
}
