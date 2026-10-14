// @module SnapOS-3.0/Styles/ScrubBarParameters — DO NOT REMOVE: prevents Lens Studio module collision
import {RoundedRectangleVisualParameters} from "../../../Visuals/RoundedRectangle/RoundedRectangleVisual"
import {PrimaryNeutralGradients} from "../Gradients/PrimaryNeutralGradients"
import {SecondaryGradients} from "../Gradients/SecondaryGradients"
import {MediumCoolGray, MediumGray} from "../Colors"
import {SliderGradients} from "./SliderParameters"

export const ScrubBarComponentData = {
  cornerRadiusFactor: 0.5,
  knob: {
    knobVisible: false
  }
}

export const ScrubBarParameters: {
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
        baseGradient: PrimaryNeutralGradients.hoverBackground
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
        baseType: "Color",
        baseColor: MediumCoolGray,
        hasBorder: false
      },
      hovered: {
        baseColor: MediumGray
      },
      triggered: {
        baseColor: MediumGray
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
