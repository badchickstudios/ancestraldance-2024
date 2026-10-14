// @module SnapOS-3.0/Styles/SliderParameters — DO NOT REMOVE: prevents Lens Studio module collision
import {RoundedRectangleVisualParameters} from "../../../Visuals/RoundedRectangle/RoundedRectangleVisual"
import {GhostGradients} from "../Gradients/GhostGradients"
import {PrimaryNeutralGradients} from "../Gradients/PrimaryNeutralGradients"
import {SecondaryGradients} from "../Gradients/SecondaryGradients"
import {GradientParameters} from "../../../Visuals/RoundedRectangle/RoundedRectangle"
import {SliderHoverFillGrayBlue, SliderHoverFillPurple, SliderHoverFillCyan} from "../Colors"

export const SliderGradients: Record<string, GradientParameters> = {
  hoverBackground: {
    type: "Linear",
    start: new vec2(-1, 0.1),
    end: new vec2(1, -0.1),
    stop0: {
      percent: 0,
      color: SliderHoverFillPurple
    },
    stop1: {
      percent: 0.31,
      color: SliderHoverFillGrayBlue
    },
    stop2: {
      percent: 1,
      color: SliderHoverFillCyan
    }
  }
}

export const SliderComponentData = {
  cornerRadiusFactor: 0.1667,
  knob: {
    knobVisible: false
  }
}

export const SliderParameters: {
  track: Record<string, Partial<RoundedRectangleVisualParameters>>
  knob: Record<string, Partial<RoundedRectangleVisualParameters>>
  fill: Record<string, Partial<RoundedRectangleVisualParameters>>
} = {
  track: {
    default: {
      default: {
        baseType: "Gradient",
        baseGradient: PrimaryNeutralGradients.defaultBackground,
        hasBorder: false
      },
      hovered: {
        baseGradient: PrimaryNeutralGradients.hoverBackground,
      },
      triggered: {
        baseGradient: PrimaryNeutralGradients.triggeredBackground,
        borderGradient: PrimaryNeutralGradients.triggeredBorder
      }
    }
  },
  knob: {
    default: {
      default: {
        baseType: "Gradient",
        baseGradient: GhostGradients.defaultBackground,
        hasBorder: false
      }
    }
  },
  fill: {
    default: {
      default: {
        baseType: "Gradient",
        baseGradient: SecondaryGradients.defaultBackground,
        hasBorder: false
      },
      hovered: {
        baseGradient: SliderGradients.hoverBackground
      },
      triggered: {
        baseGradient: SliderGradients.hoverBackground
      }
    }
  }
}