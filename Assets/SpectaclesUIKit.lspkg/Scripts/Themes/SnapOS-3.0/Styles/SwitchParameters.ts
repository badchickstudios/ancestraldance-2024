// @module SnapOS-3.0/Styles/SwitchParameters — DO NOT REMOVE: prevents Lens Studio module collision
import {RoundedRectangleVisualParameters} from "../../../Visuals/RoundedRectangle/RoundedRectangleVisual"
import {
  DarkerLessGray,
  DarkCoolGray,
  DarkestGray,
  DarkGray,
  MediumCoolGray,
  MediumDarkGray,
  SwitchBorderCyanBright,
  SwitchBorderCyanBrighter,
  SwitchBorderCyanLight,
  SwitchBorderCyanMedium,
  SwitchCyanBright,
  SwitchCyanBrightestHover,
  SwitchCyanBrightHover,
  SwitchCyanDark,
  SwitchHoverBlue,
  SwitchHoverCyan,
  SwitchKnobBorderCyan,
  SwitchKnobBorderCyanBright,
  SwitchKnobBorderCyanHover,
  SwitchKnobBorderCyanMedium,
  SwitchKnobBorderGray,
  SwitchKnobBorderTransparent,
  SwitchKnobBorderTransparentHover,
  SwitchKnobGray,
  SwitchTrackBorderGray,
  SwitchTrackBorderTransparent,
  SwitchTrackCyanDark,
  SwitchTrackCyanMedium,
  SwitchTrackFillGray,
  SwitchTrackGray,
  TriggeredBorderCyan
} from "../Colors"

export const SwitchParameters: {
  track: Record<string, Partial<RoundedRectangleVisualParameters>>
  knob: Record<string, Partial<RoundedRectangleVisualParameters>>
  fill: Record<string, Partial<RoundedRectangleVisualParameters>>
} = {
  track: {
    default: {
      default: {
        baseGradient: {
          type: "Linear",
          start: new vec2(-1, 0),
          end: new vec2(1, 0),
          stop0: {percent: 0, color: SwitchTrackGray},
          stop1: {percent: 0.5, color: SwitchTrackGray},
          stop2: {percent: 1, color: SwitchTrackGray}
        },
        baseType: "Gradient",
        hasBorder: true,
        borderSize: 0.1,
        borderType: "Gradient",
        borderGradient: {
          start: new vec2(-0.8, 1),
          end: new vec2(0.8, -1),
          stop0: {percent: 0, color: SwitchTrackBorderGray},
          stop1: {percent: 0.5, color: SwitchTrackBorderTransparent},
          stop2: {percent: 1, color: SwitchTrackBorderGray}
        }
      },
      hovered: {
        baseGradient: {
          start: new vec2(0, 1.8),
          end: new vec2(0, -1.8),
          stop0: {percent: 0, color: DarkGray},
          stop1: {percent: 0.5, color: DarkGray},
          stop2: {percent: 1, color: MediumDarkGray}
        }
      },
      triggered: {
        baseGradient: {
          start: new vec2(-1, 0),
          end: new vec2(1, 0),
          stop0: {percent: 0, color: SwitchTrackGray},
          stop1: {percent: 0.5, color: SwitchTrackGray},
          stop2: {percent: 1, color: SwitchTrackGray}
        }
      },
      toggledDefault: {
        borderGradient: {
          type: "Linear",
          start: new vec2(-0.9, 1),
          end: new vec2(0.9, -1),
          stop0: {percent: 0, color: SwitchBorderCyanLight},
          stop1: {percent: 0.55, color: SwitchBorderCyanMedium},
          stop2: {percent: 1, color: SwitchBorderCyanLight}
        }
      },
      toggledHovered: {
        borderGradient: {
          type: "Linear",
          start: new vec2(-0.9, 1),
          end: new vec2(0.9, -1),
          stop0: {percent: 0, color: SwitchBorderCyanBright},
          stop1: {percent: 0.55, color: SwitchBorderCyanBrighter},
          stop2: {percent: 1, color: SwitchBorderCyanBright}
        }
      },
      toggledTriggered: {
        borderGradient: {
          type: "Linear",
          start: new vec2(-0.9, 1),
          end: new vec2(0.9, -1),
          stop0: {percent: 0, color: SwitchBorderCyanLight},
          stop1: {percent: 0.55, color: SwitchBorderCyanMedium},
          stop2: {percent: 1, color: SwitchBorderCyanLight}
        }
      }
    }
  },
  knob: {
    default: {
      default: {
        baseGradient: {
          enabled: true,
          type: "Linear",
          start: new vec2(-1, 1),
          end: new vec2(1, -1),
          stop0: {percent: 0, color: DarkestGray},
          stop1: {percent: 1, color: DarkCoolGray}
        },
        baseType: "Gradient",
        hasBorder: true,
        borderSize: 0.05,
        borderType: "Gradient",
        borderGradient: {
          start: new vec2(-0.8, 1),
          end: new vec2(0.8, -1),
          stop0: {percent: 0, color: SwitchKnobBorderGray},
          stop1: {percent: 1, color: SwitchKnobBorderTransparent}
        }
      },
      hovered: {
        baseGradient: {
          enabled: true,
          type: "Linear",
          start: new vec2(-1, 1),
          end: new vec2(1, -1),
          stop0: {percent: 0, color: DarkerLessGray},
          stop1: {percent: 1, color: SwitchKnobGray}
        },
        borderGradient: {
          start: new vec2(-0.8, 1),
          end: new vec2(0.8, -1),
          stop0: {percent: 0, color: MediumCoolGray},
          stop1: {percent: 1, color: SwitchKnobBorderTransparentHover}
        }
      },
      triggered: {
        baseGradient: {
          enabled: true,
          type: "Linear",
          stop0: {percent: 0, color: SwitchCyanDark},
          stop1: {percent: 1, color: SwitchCyanBright}
        }
      },
      toggledDefault: {
        baseGradient: {
          enabled: true,
          type: "Linear",
          stop0: {percent: 0, color: SwitchCyanDark},
          stop1: {percent: 1, color: SwitchCyanBright}
        },
        borderGradient: {
          type: "Linear",
          start: new vec2(-0.8, 1),
          end: new vec2(0.8, -1),
          stop0: {percent: 0, color: SwitchKnobBorderCyan},
          stop1: {percent: 0.55, color: SwitchKnobBorderCyanMedium},
          stop2: {percent: 1, color: SwitchKnobBorderCyanBright}
        }
      },
      toggledHovered: {
        baseGradient: {
          enabled: true,
          type: "Linear",
          stop0: {percent: 0, color: SwitchCyanBrightHover},
          stop1: {percent: 1, color: SwitchCyanBrightestHover}
        },
        borderGradient: {
          type: "Linear",
          start: new vec2(-0.8, 1),
          end: new vec2(0.8, -1),
          stop0: {percent: 0, color: TriggeredBorderCyan},
          stop1: {percent: 0.55, color: SwitchKnobBorderCyanHover},
          stop2: {percent: 1, color: TriggeredBorderCyan}
        }
      },
      toggledTriggered: {
        baseGradient: {
          enabled: true,
          type: "Linear",
          stop0: {percent: 0, color: SwitchCyanDark},
          stop1: {percent: 1, color: SwitchCyanBright}
        },
        borderGradient: {
          type: "Linear",
          start: new vec2(-0.8, 1),
          end: new vec2(0.8, -1),
          stop0: {percent: 0, color: SwitchKnobBorderCyan},
          stop1: {percent: 0.55, color: SwitchKnobBorderCyanMedium},
          stop2: {percent: 1, color: SwitchKnobBorderCyanBright}
        }
      }
    }
  },
  fill: {
    default: {
      default: {
        baseGradient: {
          type: "Linear",
          start: new vec2(-1, 0),
          end: new vec2(1, 0),
          stop0: {percent: 0, color: SwitchTrackFillGray},
          stop1: {percent: 1, color: SwitchTrackFillGray}
        },
        baseType: "Gradient"
      },
      hovered: {
        baseGradient: {
          type: "Linear",
          start: new vec2(-1, 0),
          end: new vec2(1, 0),
          stop0: {percent: 0, color: SwitchHoverBlue},
          stop1: {percent: 1, color: SwitchHoverCyan}
        }
      },
      toggledDefault: {
        baseGradient: {
          type: "Linear",
          start: new vec2(-1, 0),
          end: new vec2(1, 0),
          stop0: {percent: 0, color: SwitchTrackCyanDark},
          stop1: {percent: 1, color: SwitchTrackCyanDark}
        }
      },
      toggledHovered: {
        baseGradient: {
          type: "Linear",
          start: new vec2(-1, 0),
          end: new vec2(1, 0),
          stop0: {percent: 0, color: SwitchTrackCyanMedium},
          stop1: {percent: 1, color: SwitchTrackCyanMedium}
        }
      },
      toggledTriggered: {
        baseGradient: {
          type: "Linear",
          start: new vec2(-1, 0),
          end: new vec2(1, 0),
          stop0: {percent: 0, color: SwitchTrackCyanDark},
          stop1: {percent: 1, color: SwitchTrackCyanDark}
        }
      }
    }
  }
}
