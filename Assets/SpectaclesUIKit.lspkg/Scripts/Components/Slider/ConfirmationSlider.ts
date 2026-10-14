import {DragInteractorEvent} from "SpectaclesInteractionKit.lspkg/Core/Interactor/InteractorEvent"
import animate, {CancelSet} from "SpectaclesInteractionKit.lspkg/Utils/animate"
import Event from "SpectaclesInteractionKit.lspkg/Utils/Event"
import NativeLogger from "SpectaclesInteractionKit.lspkg/Utils/NativeLogger"
import {
  ConfirmationSliderFillDarkYellow,
  ConfirmationSliderFillLightGray,
  ConfirmationSliderFillMediumYellow,
  ConfirmationSliderKnobBorderBottom,
  ConfirmationSliderKnobBorderTop,
  ConfirmationSliderKnobBright,
  ConfirmationSliderKnobDark,
  ConfirmationSliderKnobHoverBorderBottom,
  ConfirmationSliderKnobHoverBorderTop,
  ConfirmationSliderKnobHoverBright,
  ConfirmationSliderKnobHoverDark,
  ConfirmationSliderKnobTriggeredBorderMid,
  ConfirmationSliderKnobTriggeredBorderYellow,
  ConfirmationSliderKnobTriggeredBright,
  ConfirmationSliderKnobTriggeredDark,
  ConfirmationSliderShineColor,
  ConfirmationSliderTrackBorderGray,
  ConfirmationSliderTrackBorderLight,
  ConfirmationSliderTrackBorderTransparent,
  ConfirmationSliderTrackDarkGray,
  ConfirmationSliderTrackGray
} from "../../Themes/SnapOS-2.0/Colors"
import {Callback, createCallbacks} from "../../Utility/SceneUtilities"
import {GradientParameters, RoundedRectangle} from "../../Visuals/RoundedRectangle/RoundedRectangle"
import {
  RoundedRectangleVisual,
  RoundedRectangleVisualParameters
} from "../../Visuals/RoundedRectangle/RoundedRectangleVisual"
import {StateName} from "../Element"
import {Slider} from "./Slider"

const log = new NativeLogger("ConfirmationSlider")

const TRACKFILL_Z_OFFSET: number = 0.01

type FillGradientColors = Record<string, vec4>

const FillGradient: FillGradientColors = {
  stop0Color0: ConfirmationSliderFillLightGray,
  stop0Color1: ConfirmationSliderFillDarkYellow,
  stop1Color0: ConfirmationSliderFillMediumYellow,
  stop1Color1: ConfirmationSliderFillMediumYellow
}

const DefaultShineColor: vec3 = ConfirmationSliderShineColor

interface ConfirmationSliderThemeData {
  fill?: FillGradientColors | StatefulFillGradient
  shineColor?: vec3
}

type StatefulFillGradient = Record<string, FillGradientColors>

const DefaultStatefulFillGradient: StatefulFillGradient = {
  default: FillGradient,
  hovered: FillGradient,
  triggered: FillGradient
}

function isStatefulFill(fill: unknown): fill is StatefulFillGradient {
  return fill !== null && typeof fill === "object" && "default" in (fill as object)
}

function normalizeStatefulFill(fill: FillGradientColors | StatefulFillGradient): StatefulFillGradient {
  if (isStatefulFill(fill)) {
    return fill
  }
  return { default: fill, hovered: fill, triggered: fill }
}

const FillParameters: Partial<GradientParameters> = {
  start: new vec2(-1, 0),
  end: new vec2(1, 0)
}

const SliderVisualParameters: Partial<RoundedRectangleVisualParameters> = {
  default: {
    baseType: "Gradient",
    baseGradient: {
      start: new vec2(0, 1),
      end: new vec2(0, -1),
      stop0: {
        percent: 0,
        color: ConfirmationSliderTrackDarkGray
      },
      stop1: {
        percent: 1,
        color: ConfirmationSliderTrackGray
      }
    },
    hasBorder: true,
    borderSize: 0.1,
    borderType: "Gradient",
    borderGradient: {
      start: new vec2(-0.9, 1),
      end: new vec2(0.9, -1),
      stop0: {
        percent: 0,
        color: ConfirmationSliderTrackBorderLight
      },
      stop1: {
        percent: 0.5,
        color: ConfirmationSliderTrackBorderTransparent
      },
      stop2: {
        percent: 1,
        color: ConfirmationSliderTrackBorderGray
      }
    }
  }
}

const KnobVisualParameters: Partial<RoundedRectangleVisualParameters> = {
  default: {
    baseType: "Gradient",
    baseGradient: {
      start: new vec2(-0.8, 1),
      end: new vec2(0.8, -1),
      stop0: {
        percent: 0,
        color: ConfirmationSliderKnobDark
      },
      stop1: {
        percent: 1,
        color: ConfirmationSliderKnobBright
      }
    },
    hasBorder: true,
    borderType: "Gradient",
    borderGradient: {
      start: new vec2(-0.8, 1),
      end: new vec2(0.8, -1),
      stop0: {
        percent: 0,
        color: ConfirmationSliderKnobBorderTop
      },
      stop1: {
        percent: 1,
        color: ConfirmationSliderKnobBorderBottom
      }
    }
  },
  hovered: {
    baseGradient: {
      start: new vec2(-0.8, 1),
      end: new vec2(0.8, -1),
      stop0: {
        percent: 0,
        color: ConfirmationSliderKnobHoverDark
      },
      stop1: {
        percent: 1,
        color: ConfirmationSliderKnobHoverBright
      }
    },
    borderGradient: {
      start: new vec2(-0.8, 1),
      end: new vec2(0.8, -1),
      stop0: {
        percent: 0,
        color: ConfirmationSliderKnobHoverBorderTop
      },
      stop1: {
        percent: 1,
        color: ConfirmationSliderKnobHoverBorderBottom
      }
    }
  },
  triggered: {
    baseGradient: {
      start: new vec2(-0.8, 1),
      end: new vec2(0.8, -1),
      stop0: {
        percent: 0,
        color: ConfirmationSliderKnobTriggeredDark
      },
      stop1: {
        percent: 1,
        color: ConfirmationSliderKnobTriggeredBright
      }
    },
    borderGradient: {
      start: new vec2(-0.8, 1),
      end: new vec2(0.8, -1),
      stop0: {
        percent: 0,
        color: ConfirmationSliderKnobTriggeredBorderYellow
      },
      stop1: {
        percent: 0.5,
        color: ConfirmationSliderKnobTriggeredBorderMid
      },
      stop2: {
        percent: 1,
        color: ConfirmationSliderKnobTriggeredBorderYellow
      }
    }
  }
}

/**
 * Component for a confirmation slider that allows users to slide to confirm an action.
 * It provides visual feedback and triggers an event when the confirmation is successful.
 */
@component
export class ConfirmationSlider extends Slider {
  @input
  @showIf("addCallbacks")
  @label("On Confirmation Callbacks")
  private onConfirmationCallbacks: Callback[] = []

  @input
  @showIf("addCallbacks")
  @label("On Reset Callbacks")
  private onResetCallbacks: Callback[] = []

  @input("number", "0.9")
  private _confirmationThreshold: number = 0.9

  private onConfirmationEvent = new Event<void>()
  /**
   * Event that is triggered when the slider is successfully confirmed.
   */
  public readonly onConfirmation = this.onConfirmationEvent.publicApi()

  private onResetEvent = new Event<void>()
  /**
   * Event that is triggered when the slider is reset to its initial state.
   */
  public readonly onReset = this.onResetEvent.publicApi()

  private customFillObject: SceneObject
  private customTrackFill: RoundedRectangle
  private _fillColors: StatefulFillGradient = DefaultStatefulFillGradient
  private _shineColor: vec3 = DefaultShineColor

  public readonly hasTrackVisual: boolean = true
  protected override _knobSize: vec2 = new vec2(3, 3)
  public readonly customKnobSize: boolean = false

  private shineCancel: CancelSet

  /**
   * Sets the value that the slider must reach on finished to trigger a confirmation.
   * @param value - A number between 0 and 1 representing the threshold.
   */
  public set confirmationThreshold(value: number) {
    if (value === undefined) {
      return
    }
    if (value < 0 || value > 1) {
      log.w("Confirmation threshold must be between 0 and 1.")
      return
    }
    this._confirmationThreshold = value
  }

  /**
   * Gets the current confirmation threshold.
   * @returns The confirmation threshold value (0 to 1).
   */
  public get confirmationThreshold(): number {
    return this._confirmationThreshold
  }

  public onAwake(): void {
    super.onAwake()
  }

  protected createDefaultVisual(): void {
    const theme = this.resolveTheme()
    const themeData = theme.componentData?.["ConfirmationSlider"] as ConfirmationSliderThemeData | undefined
    const themedTrack = theme.styles?.["ConfirmationSliderTrack"]?.["default"] ?? SliderVisualParameters
    const themedKnob = theme.styles?.["ConfirmationSliderKnob"]?.["default"] ?? KnobVisualParameters
    const themedFill = normalizeStatefulFill(themeData?.fill ?? FillGradient)
    this._shineColor = themeData?.shineColor ?? DefaultShineColor

    if (!this._visual) {
      const defaultVisual: RoundedRectangleVisual = new RoundedRectangleVisual({
        sceneObject: this.sceneObject,
        style: themedTrack
      })
      defaultVisual.renderMeshVisual.mainMaterial = requireAsset(
        "../../../Materials/ConfirmationSlider.mat"
      ) as Material
      defaultVisual.cornerRadius = this.size.y * this.cornerRadiusFactor
      defaultVisual.renderMeshVisual.mainPass.shineColor = this._shineColor
      this._visual = defaultVisual
    }

    if (!this._knobVisual) {
      const knobObject = global.scene.createSceneObject("SliderKnob")
      this.managedSceneObjects.add(knobObject)
      const defaultKnobVisual: RoundedRectangleVisual = new RoundedRectangleVisual({
        sceneObject: knobObject,
        style: themedKnob
      })

      defaultKnobVisual.cornerRadius = (this.size.y - defaultKnobVisual.borderSize * 2) * this.cornerRadiusFactor
      this._knobVisual = defaultKnobVisual
      this._knobVisual.renderMeshVisual.mainPass.blendMode = BlendMode.PremultipliedAlphaAuto
      this._knobSize = new vec2(this.size.y * 1.5, this.size.y)
      knobObject.setParent(this.sceneObject)

      const knobThemeData = theme.componentData?.["ConfirmationSliderKnob"] as {knobVisible?: boolean} | undefined
      if (knobThemeData?.knobVisible === false) {
        defaultKnobVisual.renderMeshVisual.enabled = false
      }
    }

    this._fillColors = themedFill
    this.customFillObject = global.scene.createSceneObject("ConfirmationSliderFill")
    this.managedSceneObjects.add(this.customFillObject)
    this.customFillObject.layer = this.sceneObject.layer
    this.customFillObject.setParent(this.sceneObject)
    this.customTrackFill = this.customFillObject.createComponent(RoundedRectangle.getTypeName())
    this.managedComponents.add(this.customTrackFill)
    this.customTrackFill.initialize()
    this.customTrackFill.gradient = true
    this.updateCustomFillSize()
    this.onKnobMoved.add(this.updateCustomFillSize.bind(this))
  }

  protected setUpEventCallbacks(): void {
    if (this.addCallbacks) {
      this.onConfirmation.add(createCallbacks(this.onConfirmationCallbacks))
      this.onReset.add(createCallbacks(this.onResetCallbacks))
    }
    super.setUpEventCallbacks()
  }

  protected setState(stateName: StateName) {
    super.setState(stateName)
    if (this.customTrackFill) {
      this.updateCustomFillSize()
    }
  }

  private getFillColorsForState(): FillGradientColors {
    const stateKey =
      this.stateName === StateName.hovered ? "hovered"
      : this.stateName === StateName.triggered ? "triggered"
      : "default"
    return this._fillColors[stateKey] ?? this._fillColors.default
  }

  private updateCustomFillSize() {
    const borderSize = (this._visual as RoundedRectangleVisual).borderSize
    const fillSize = this.customTrackFill.size.uniformScale(1)
    fillSize.y = this.size.y - borderSize * 2
    fillSize.x = MathUtils.lerp(fillSize.y, this.size.x - borderSize * 2, this.knobValue)
    const xPos = MathUtils.lerp((this.size.x - borderSize * 2) * -0.5 + fillSize.y * 0.5, 0, this.knobValue)
    this.customFillObject.getTransform().setLocalPosition(new vec3(xPos, 0, TRACKFILL_Z_OFFSET))
    this.customTrackFill.cornerRadius = fillSize.y * this.cornerRadiusFactor
    this.customTrackFill.size = fillSize
    const colors = this.getFillColorsForState()
    this.customTrackFill.setBackgroundGradient({
      ...FillParameters,
      stop0: {
        percent: 0,
        color: vec4.lerp(colors.stop0Color0, colors.stop0Color1, this.knobValue)
      },
      stop1: {
        percent: 1,
        color: vec4.lerp(colors.stop1Color0, colors.stop1Color1, this.knobValue)
      }
    })
  }

  protected onInteractableDragEnd(dragEvent: DragInteractorEvent): void {
    super.onInteractableDragEnd(dragEvent)
    const shineFactor = this.visual.renderMeshVisual.mainPass.shineFactor
    this.shineCancel?.cancel()
    animate({
      cancelSet: this.shineCancel,
      duration: 0.2 * Math.abs(shineFactor - 1),
      update: (t) => {
        this.visual.renderMeshVisual.mainPass.shineFactor = MathUtils.lerp(shineFactor, 1, t)
      }
    })
    if (this.currentValue < this._confirmationThreshold) {
      this.updateCurrentValue(0, true)
      this.setState(StateName.default)
    } else {
      this.interactable.enabled = false
      animate({
        duration: 0.3 * Math.abs(1 - this._knobVisual.renderMeshVisual.mainPass.opacityFactor),
        update: (t) => {
          this._knobVisual.renderMeshVisual.mainPass.opacityFactor = 1 - t
        },
        ended: () => {
          this._knobVisual.sceneObject.enabled = false
        }
      })
      this.updateCurrentValue(1, true)
      this.onConfirmationEvent.invoke()
      this.setState(StateName.toggledDefault)
    }
  }

  protected onInteractableDragStart(dragEvent: DragInteractorEvent): void {
    super.onInteractableDragStart(dragEvent)
    const shineFactor = this.visual.renderMeshVisual.mainPass.shineFactor
    this.shineCancel?.cancel()
    animate({
      cancelSet: this.shineCancel,
      duration: 0.2 * Math.abs(shineFactor),
      update: (t) => {
        this.visual.renderMeshVisual.mainPass.shineFactor = MathUtils.lerp(shineFactor, 0, t)
      }
    })
  }

  /**
   * Reset the confirmation slider to its initial state.
   */
  public reset() {
    if (this._initialized) {
      this.interactable.enabled = true
      this._knobVisual.sceneObject.enabled = true
      this._knobVisual.renderMeshVisual.mainPass.opacityFactor = 1
    }
    this.updateCurrentValue(0, false)
    this.onResetEvent.invoke()
  }

  protected enableManagedComponents() {
    this.managedComponents.forEach((component) => {
      if (!isNull(component) && component) {
        if (component === this.interactable) {
          component.enabled = !this.inactive && this.currentValue < this._confirmationThreshold
        } else if (component === this.collider) {
          component.enabled = !this.inactive
        } else {
          component.enabled = true
        }
      }
    })
  }
}
