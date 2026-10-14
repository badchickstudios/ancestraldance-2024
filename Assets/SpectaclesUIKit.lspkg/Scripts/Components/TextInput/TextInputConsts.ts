import {
  BrightWarmYellow,
  DarkerGray,
  DarkerLessGray,
  DarkerYellow,
  DarkYellow,
  MediumDarkGray,
  TriggeredBorderYellow
} from "../../Themes/SnapOS-2.0/Colors"
import {GradientParameters} from "../../Visuals/RoundedRectangle/RoundedRectangle"
import {StateName} from "../Element"

export const PLACEHOLDER_TEXT_COLOR = new vec4(0.6, 0.6, 0.6, 1)
export const DEFAULT_TEXT_COLOR = new vec4(217 / 255, 216 / 255, 201 / 255, 1)
export const CORNER_RADIUS = 0.5
export const DEFAULT_BEHAVIOR = true
export const DEBUG_RENDER = false

export const INSET_FACTOR_SINGLE_LINE = 0.3
export const INSET_FACTOR_MULTI_LINE = 0.15
export const FONT_SIZE_SCALE = 16
export const DEFAULT_FONT_SIZE = 96
export const HOVER_SCALE_FACTOR = 1.05
export const STATE_ANIMATION_DURATION = 0.333
export const TEXT_PARENT_Z_OFFSET = 0.01
export const RESIZE_THRESHOLD = 0.001
export const KEYBOARD_DELAY_DESELECT = 750
export const KEYBOARD_DELAY_DEFAULT = 16

export enum IconState {
  default,
  alternate
}

export type TextInputStateType = {
  textColor: vec4
  icon: IconState
  size?: () => vec3
}

export enum TextAlignment {
  Left = "left",
  Center = "center",
  Right = "right"
}

export enum OverflowMode {
  Scroll = "scroll",
  Truncate = "truncate",
  AutoSize = "autoSize"
}

export const BORDER_GRADIENT_PARAMETERS: {[key: string]: GradientParameters} = {
  default: {
    enabled: true,
    type: "Linear",
    start: new vec2(-1.125, 0.7),
    end: new vec2(1.35, -0.7),
    stop0: {enabled: true, percent: 0, color: MediumDarkGray},
    stop1: {enabled: true, percent: 0.5, color: DarkerLessGray},
    stop2: {enabled: true, percent: 1, color: MediumDarkGray}
  },
  toggled: {
    enabled: true,
    start: new vec2(-1.125, 0.7),
    end: new vec2(1.35, -0.7),
    type: "Linear",
    stop0: {enabled: true, percent: 0, color: TriggeredBorderYellow},
    stop1: {enabled: true, percent: 0.5, color: DarkYellow},
    stop2: {enabled: true, percent: 1, color: TriggeredBorderYellow}
  },
  toggledHovered: {
    enabled: true,
    start: new vec2(-1.125, 0.7),
    end: new vec2(1.35, -0.7),
    type: "Linear",
    stop0: {enabled: true, percent: 0, color: BrightWarmYellow},
    stop1: {enabled: true, percent: 0.5, color: DarkerYellow},
    stop2: {enabled: true, percent: 1, color: BrightWarmYellow}
  }
}

export const BACKGROUND_GRADIENT_PARAMETERS: {[key: string]: GradientParameters} = {
  toggled: {
    enabled: true,
    type: "Linear",
    stop0: {enabled: true, percent: 0, color: DarkerGray},
    stop1: {enabled: true, percent: 0.5, color: DarkerGray}
  },
  default: {
    enabled: true,
    type: "Linear",
    stop0: {enabled: true, percent: 0, color: DarkerGray},
    stop1: {enabled: true, percent: 0.5, color: DarkerGray}
  }
}

export function createTextInputStateMap(
  getOriginalSize: () => vec3,
  calculateHoverScale: () => vec3
): Map<StateName, TextInputStateType> {
  return new Map([
    [StateName.default, {textColor: DEFAULT_TEXT_COLOR, icon: IconState.default, size: getOriginalSize}],
    [StateName.hovered, {textColor: DEFAULT_TEXT_COLOR, icon: IconState.default, size: calculateHoverScale}],
    [StateName.triggered, {textColor: DEFAULT_TEXT_COLOR, icon: IconState.default, size: calculateHoverScale}],
    [StateName.toggledDefault, {textColor: DEFAULT_TEXT_COLOR, icon: IconState.alternate}],
    [StateName.toggledHovered, {textColor: DEFAULT_TEXT_COLOR, icon: IconState.alternate, size: calculateHoverScale}],
    [StateName.error, {textColor: DEFAULT_TEXT_COLOR, icon: IconState.default}],
    [StateName.errorHovered, {textColor: DEFAULT_TEXT_COLOR, icon: IconState.default, size: calculateHoverScale}],
    [StateName.inactive, {textColor: DEFAULT_TEXT_COLOR, icon: IconState.default}]
  ])
}
