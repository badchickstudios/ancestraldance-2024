// @module SnapOS-3.0/Styles/SnapOS3ContentColorParameters — DO NOT REMOVE: prevents Lens Studio module collision
import {ContentStyle} from "../../../Components/Content/ContentStyle"
import {
  ContentAccentBlue,
  ContentAccentBlueDim,
  ContentIdleGray,
  ContentInactiveWhite,
  ContentPressedGray,
  ContentWhite
} from "../Colors"
import {SnapOS3Styles} from "../SnapOS3"

const standardLight: ContentStyle = {
  default: {textColor: ContentIdleGray, iconTint: ContentIdleGray},
  hovered: {textColor: ContentWhite, iconTint: ContentWhite},
  triggered: {textColor: ContentPressedGray, iconTint: ContentPressedGray},
  toggledDefault: {textColor: ContentWhite, iconTint: ContentWhite},
  toggledHovered: {textColor: ContentWhite, iconTint: ContentWhite},
  toggledTriggered: {textColor: ContentPressedGray, iconTint: ContentPressedGray},
  inactive: {textColor: ContentInactiveWhite, iconTint: ContentInactiveWhite}
}

const transparentStyle: ContentStyle = {
  default: {textColor: ContentAccentBlue, iconTint: ContentAccentBlue},
  hovered: {textColor: ContentWhite, iconTint: ContentWhite},
  triggered: {textColor: ContentPressedGray, iconTint: ContentPressedGray},
  toggledDefault: {textColor: ContentAccentBlue, iconTint: ContentAccentBlue},
  toggledHovered: {textColor: ContentWhite, iconTint: ContentWhite},
  toggledTriggered: {textColor: ContentPressedGray, iconTint: ContentPressedGray},
  inactive: {textColor: ContentAccentBlueDim, iconTint: ContentAccentBlueDim}
}

export const SnapOS3ContentColorParameters: Record<string, Partial<Record<SnapOS3Styles, ContentStyle>>> = {
  Button: {
    Neutral: standardLight,
    Accent: standardLight,
    Subtle: standardLight,
    Alert: standardLight,
    Transparent: transparentStyle
  },
  RectangleButton: {
    Neutral: standardLight,
    Accent: standardLight,
    Subtle: standardLight,
    Alert: standardLight,
    Transparent: transparentStyle
  },
  RoundButton: {
    Neutral: standardLight,
    Accent: standardLight,
    Subtle: standardLight,
    Alert: standardLight,
    Transparent: transparentStyle
  },
  CapsuleButton: {
    Neutral: standardLight,
    Accent: standardLight,
    Subtle: standardLight,
    Alert: standardLight,
    Transparent: transparentStyle
  },
  Checkbox: {
    Neutral: standardLight
  },
  RadioButton: {
    Neutral: standardLight
  },
  Slider: {
    Neutral: standardLight
  },
  Switch: {
    Neutral: standardLight
  },
  Frame: {
    Neutral: standardLight
  }
}
