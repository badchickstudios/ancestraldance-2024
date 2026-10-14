// @module SnapOS-3.0/Styles/TextInputFieldParameters — DO NOT REMOVE: prevents Lens Studio module collision
import {Style} from "../../Style"
import {
  BrightCoolBlue,
  DarkerBlue,
  DarkerGray,
  DarkerLessGray,
  DarkBlue,
  MediumDarkGray,
  TriggeredBorderCyan
} from "../Colors"

export const TextInputFieldParameters: {style: {default: Style}} = {
  style: {
    default: {
      default: {
        baseType: "Gradient",
        baseGradient: {
          enabled: true,
          type: "Linear",
          stop0: {enabled: true, percent: 0, color: DarkerGray},
          stop1: {enabled: true, percent: 0.5, color: DarkerGray}
        },
        hasBorder: true,
        borderSize: 0.125,
        borderType: "Gradient",
        shouldPosition: true,
        borderGradient: {
          enabled: true,
          type: "Linear",
          start: new vec2(-1.125, 0.7),
          end: new vec2(1.35, -0.7),
          stop0: {enabled: true, percent: 0, color: MediumDarkGray},
          stop1: {enabled: true, percent: 0.5, color: DarkerLessGray},
          stop2: {enabled: true, percent: 1, color: MediumDarkGray}
        }
      },
      hovered: {
        localPosition: new vec3(0, 0, 1),
        borderGradient: {
          enabled: true,
          start: new vec2(-1.125, 0.7),
          end: new vec2(1.35, -0.7),
          type: "Linear",
          stop0: {enabled: true, percent: 0, color: BrightCoolBlue},
          stop1: {enabled: true, percent: 0.5, color: DarkerBlue},
          stop2: {enabled: true, percent: 1, color: BrightCoolBlue}
        }
      },
      triggered: {
        localPosition: new vec3(0, 0, 0.5),
        baseGradient: {
          enabled: true,
          type: "Linear",
          stop0: {enabled: true, percent: 0, color: DarkerGray},
          stop1: {enabled: true, percent: 0.5, color: DarkerGray}
        },
        borderGradient: {
          enabled: true,
          start: new vec2(-1.125, 0.7),
          end: new vec2(1.35, -0.7),
          type: "Linear",
          stop0: {enabled: true, percent: 0, color: TriggeredBorderCyan},
          stop1: {enabled: true, percent: 0.5, color: DarkBlue},
          stop2: {enabled: true, percent: 1, color: TriggeredBorderCyan}
        }
      },
      toggledDefault: {
        localPosition: new vec3(0, 0, 0.5),
        baseGradient: {
          enabled: true,
          type: "Linear",
          stop0: {enabled: true, percent: 0, color: DarkerGray},
          stop1: {enabled: true, percent: 0.5, color: DarkerGray}
        },
        borderGradient: {
          enabled: true,
          start: new vec2(-1.125, 0.7),
          end: new vec2(1.35, -0.7),
          type: "Linear",
          stop0: {enabled: true, percent: 0, color: BrightCoolBlue},
          stop1: {enabled: true, percent: 0.5, color: DarkerBlue},
          stop2: {enabled: true, percent: 1, color: BrightCoolBlue}
        }
      },
      toggledHovered: {
        localPosition: new vec3(0, 0, 0.5),
        baseGradient: {
          enabled: true,
          type: "Linear",
          stop0: {enabled: true, percent: 0, color: DarkerGray},
          stop1: {enabled: true, percent: 0.5, color: DarkerGray}
        },
        borderGradient: {
          enabled: true,
          start: new vec2(-1.125, 0.7),
          end: new vec2(1.35, -0.7),
          type: "Linear",
          stop0: {enabled: true, percent: 0, color: TriggeredBorderCyan},
          stop1: {enabled: true, percent: 0.5, color: DarkBlue},
          stop2: {enabled: true, percent: 1, color: TriggeredBorderCyan}
        }
      }
    }
  }
}
