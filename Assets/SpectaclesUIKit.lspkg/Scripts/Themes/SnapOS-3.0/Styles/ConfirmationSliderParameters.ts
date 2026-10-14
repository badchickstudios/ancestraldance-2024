// @module SnapOS-3.0/Styles/ConfirmationSliderParameters — DO NOT REMOVE: prevents Lens Studio module collision
import {RoundedRectangleVisualParameters} from "../../../Visuals/RoundedRectangle/RoundedRectangleVisual"
import {PrimaryNeutralGradients} from "../Gradients/PrimaryNeutralGradients"
import {
  SliderKnobPurple,
  SliderKnobCyan,
  SliderKnobBorderPurple,
  SliderKnobBorderCyan,
  SliderKnobHoverPurple,
  SliderKnobHoverCyan,
  SliderKnobHoverBorderPurple,
  SliderKnobHoverBorderCyan,
  SliderKnobTriggeredBorderMid,
  SliderFillPurple,
  SliderFillCyan,
  TriggeredBorderCyan,
  SliderHoverFillGrayBlue
} from "../Colors"

export const ConfirmationSliderComponentData = {
  fill: {
    default: {
      stop0Color0: SliderHoverFillGrayBlue,
      stop0Color1: SliderFillPurple,
      stop1Color0: SliderFillCyan,
      stop1Color1: SliderFillCyan
    },
    hovered: {
      stop0Color0: SliderHoverFillGrayBlue,
      stop0Color1: SliderFillPurple,
      stop1Color0: SliderFillCyan,
      stop1Color1: SliderFillCyan
    },
    triggered: {
      stop0Color0: SliderHoverFillGrayBlue,
      stop0Color1: SliderFillPurple,
      stop1Color0: SliderFillCyan,
      stop1Color1: SliderFillCyan
    }
  } as Record<string, Record<string, vec4>>,
  shineColor: new vec3(SliderFillCyan.r, SliderFillCyan.g, SliderFillCyan.b),
  knob: {
    knobVisible: true
  }
}

export const ConfirmationSliderParameters: {
  track: Record<string, Partial<RoundedRectangleVisualParameters>>
  knob: Record<string, Partial<RoundedRectangleVisualParameters>>
} = {
  track: {
    default: {
      default: {
        baseType: "Gradient",
        baseGradient: PrimaryNeutralGradients.defaultBackground,
        hasBorder: false,
      }
    }
  },
  knob: {
    default: {
      default: {
          baseType: "Gradient",
          baseGradient: {
            start: new vec2(-0.8, 1),
            end: new vec2(0.8, -1),
            stop0: {percent: 0, color: SliderKnobPurple},
            stop1: {percent: 1, color: SliderKnobCyan}
          },
          hasBorder: true,
          borderType: "Gradient",
          borderGradient: {
            start: new vec2(-0.8, 1),
            end: new vec2(0.8, -1),
            stop0: {percent: 0, color: SliderKnobBorderPurple},
            stop1: {percent: 1, color: SliderKnobBorderCyan}
          }
        },
        hovered: {
          baseGradient: {
            start: new vec2(-0.8, 1),
            end: new vec2(0.8, -1),
            stop0: {percent: 0, color: SliderKnobHoverPurple},
            stop1: {percent: 1, color: SliderKnobHoverCyan}
          },
          borderGradient: {
            start: new vec2(-0.8, 1),
            end: new vec2(0.8, -1),
            stop0: {percent: 0, color: SliderKnobHoverBorderPurple},
            stop1: {percent: 1, color: SliderKnobHoverBorderCyan}
          }
        },
        triggered: {
          baseGradient: {
            start: new vec2(-0.8, 1),
            end: new vec2(0.8, -1),
            stop0: {percent: 0, color: SliderKnobHoverCyan},
            stop1: {percent: 1, color: TriggeredBorderCyan}
          },
          borderGradient: {
            start: new vec2(-0.8, 1),
            end: new vec2(0.8, -1),
            stop0: {percent: 0, color: TriggeredBorderCyan},
            stop1: {percent: 0.5, color: SliderKnobTriggeredBorderMid},
            stop2: {percent: 1, color: TriggeredBorderCyan}
          }
        }
    }
  }
}
