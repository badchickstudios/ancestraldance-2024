import {ToolbarItem} from "../Items/ToolbarItem"

/** How an item gets its size: fill available space or manual (explicit size). Use when building config or setting ToolbarItemInput size mode. */
export const ToolbarItemSizeMode = {
  FILL: "fill" as const,
  MANUAL: "manual" as const
}
export type ToolbarItemSizeMode = (typeof ToolbarItemSizeMode)[keyof typeof ToolbarItemSizeMode]

export type AxisSizeMode = typeof ToolbarItemSizeMode.FILL | number

/**
 * @example
 * ```ts
 * size: new vec2(10, 5)                           // Manual: explicit size
 * size: { x: ToolbarItemSizeMode.FILL, y: 5 }     // Per-axis: fill width, fixed height
 * ```
 */
export type ToolbarItemSize = vec2 | {x: AxisSizeMode; y: AxisSizeMode}

/** Item type for toolbar items (use in config.type and ToolbarItemInput). */
export const ToolbarItemType = {
  BUTTON: "button" as const,
  TEXTFIELD: "textfield" as const,
  SLIDER: "slider" as const,
  TOGGLE: "toggle" as const,
  SEPARATOR: "separator" as const,
  CUSTOM: "custom" as const
}
export type ToolbarItemType = (typeof ToolbarItemType)[keyof typeof ToolbarItemType]

/** Button shape for button items (ToolbarButtonConfig.buttonType). */
export const ToolbarButtonType = {
  RECTANGLE: "rectangle" as const,
  CAPSULE: "capsule" as const
}
export type ToolbarButtonType = (typeof ToolbarButtonType)[keyof typeof ToolbarButtonType]

/** How icon size is determined on button/textfield (fixed size vs fill). */
export const ToolbarIconSizeMode = {
  FIXED: "fixed" as const,
  FILL: "fill" as const
}
export type ToolbarIconSizeMode = (typeof ToolbarIconSizeMode)[keyof typeof ToolbarIconSizeMode]

export interface ToolbarItemConfig {
  type: ToolbarItemType
  alignment: ToolbarAlignment
  id?: string
  size?: ToolbarItemSize
  minSize?: vec2
  maxSize?: vec2
  inactive?: boolean
  alpha?: number
  renderOrder?: number
  attachTo?: string
  attachmentPosition?: ToolbarAttachmentPosition
  attachmentOffset?: vec2
  onTriggerUp?: () => void
  onTriggerDown?: () => void
  onHoverEnter?: () => void
  onHoverExit?: () => void
  onCreated?: (item: ToolbarItem) => void
}

const ID_RADIX = 36
const ID_SUFFIX_START = 2
const ID_SUFFIX_LENGTH = 9

/**
 * Generates a unique id for a toolbar item (e.g. for use in addItem config).
 * @param baseName - Prefix for the id (default "item").
 */
export function generateToolbarItemId(baseName: string = "item"): string {
  const s = Math.random().toString(ID_RADIX)
  const suffix = s.slice(ID_SUFFIX_START, ID_SUFFIX_START + ID_SUFFIX_LENGTH)
  return `${baseName}_${suffix}`
}

export interface ToolbarButtonConfig extends ToolbarItemConfig {
  type: "button"
  buttonType?: ToolbarButtonType
  icon?: Texture
  iconSizeMode?: ToolbarIconSizeMode
  text?: string
  iconAlignment?: ToolbarHorizontalAlignment
  textAlignment?: ToolbarAlignment
  hideTextWhenTooSmall?: boolean
}

export interface ToolbarTextFieldConfig extends ToolbarItemConfig {
  type: "textfield"
  placeholder?: string
  initialText?: string
  textAlignment?: ToolbarAlignment
  icon?: Texture
  iconSide?: ToolbarHorizontalAlignment
  onSubmit?: (text: string) => void
  onTextChanged?: (text: string) => void
  onFocusGained?: () => void
  onFocusLost?: () => void
}

export interface ToolbarSliderConfig extends ToolbarItemConfig {
  type: "slider"
  min: number
  max: number
  value?: number
  step?: number
  segmented?: boolean
  numberOfSegments?: number
  onValueChanged?: (value: number) => void
}

export interface ToolbarToggleConfig extends ToolbarItemConfig {
  type: "toggle"
  isOn?: boolean
  onToggled?: (isOn: boolean) => void
}

export interface ToolbarSeparatorConfig extends ToolbarItemConfig {
  type: "separator"
  thickness?: number
  height?: number
  color?: vec4
}

export interface ToolbarCustomItemConfig extends ToolbarItemConfig {
  type: "custom"
  customObject?: SceneObject
  /** Optional callback invoked instead of the default recursive material walk when alpha changes. Use this when the custom object contains components that manage their own visual state. */
  onSetAlpha?: (alpha: number) => void
  /** Optional callback invoked instead of the default disabled visuals update. Use this when the custom object contains components that manage their own disabled state. */
  onUpdateDisabledVisuals?: (inactive: boolean) => void
}

export type AnyToolbarItemConfig =
  | ToolbarButtonConfig
  | ToolbarTextFieldConfig
  | ToolbarSliderConfig
  | ToolbarToggleConfig
  | ToolbarSeparatorConfig
  | ToolbarCustomItemConfig

export type ToolbarSizingMode = "fixed" | "frame-fit"
export type ToolbarFramePosition = "top" | "bottom" | "left" | "right"
export type ToolbarDirection = "horizontal" | "vertical"

/** Toolbar layout direction (Toolbar.direction, ToolbarConfig.direction). */
export const ToolbarDirections = {
  HORIZONTAL: "horizontal" as const,
  VERTICAL: "vertical" as const
}

/** Position of an attached item relative to its attachTo item (attachmentPosition). */
export const ToolbarAttachmentPosition = {
  LEFT: "left" as const,
  RIGHT: "right" as const,
  TOP: "top" as const,
  BOTTOM: "bottom" as const,
  CENTER: "center" as const
} as const

export type ToolbarAttachmentPosition = (typeof ToolbarAttachmentPosition)[keyof typeof ToolbarAttachmentPosition]

/** Toolbar position relative to Frame (Toolbar.framePosition when frame is set). */
export const ToolbarFramePositionEnum = {
  TOP: "top" as const,
  BOTTOM: "bottom" as const,
  LEFT: "left" as const,
  RIGHT: "right" as const
} as const

export type ToolbarFramePositionEnum = (typeof ToolbarFramePositionEnum)[keyof typeof ToolbarFramePositionEnum]

/** Vertical or horizontal alignment of item content (e.g. alignment, textAlignment). */
export const ToolbarAlignment = {
  LEFT: "left" as const,
  CENTER: "center" as const,
  RIGHT: "right" as const
} as const

export type ToolbarAlignment = (typeof ToolbarAlignment)[keyof typeof ToolbarAlignment]

/** Left/right alignment (e.g. iconAlignment, iconSide). */
export const ToolbarHorizontalAlignment = {
  LEFT: "left" as const,
  RIGHT: "right" as const
} as const

export type ToolbarHorizontalAlignment = (typeof ToolbarHorizontalAlignment)[keyof typeof ToolbarHorizontalAlignment]

export interface ToolbarPadding {
  left?: number
  right?: number
  top?: number
  bottom?: number
}

export interface ToolbarBackgroundConfig {
  cornerRadius?: number
  /** Background color (RGBA). When alpha is also set, alpha overrides color.w in the visual. */
  color?: vec4
  /** Opacity 0–1. When set, overrides the alpha channel of color. */
  alpha?: number
  enabled?: boolean
}

export interface ToolbarConfig {
  sizingMode: ToolbarSizingMode
  size?: vec2
  direction: ToolbarDirection
  padding?: ToolbarPadding
  spacing?: number
  background?: ToolbarBackgroundConfig
  framePosition?: ToolbarFramePosition
  frameGap?: number
  isToolbarInsideFrame?: boolean
}

export function isVec2Size(size: ToolbarItemSize): size is vec2 {
  return size instanceof vec2
}

export function isPerAxisSize(size: ToolbarItemSize): size is {x: AxisSizeMode; y: AxisSizeMode} {
  return typeof size === "object" && size !== null && !(size instanceof vec2) && "x" in size && "y" in size
}

export function isNumericAxisSize(size: AxisSizeMode): size is number {
  return typeof size === "number"
}

export function getSizeModeFromSize(size?: ToolbarItemSize): ToolbarItemSizeMode {
  if (!size) return ToolbarItemSizeMode.FILL
  if (size instanceof vec2) return ToolbarItemSizeMode.MANUAL
  if (size.x === ToolbarItemSizeMode.FILL || size.y === ToolbarItemSizeMode.FILL) return ToolbarItemSizeMode.FILL
  return ToolbarItemSizeMode.MANUAL
}

export function getToolbarDirectionFromSceneObject(sceneObject: SceneObject): ToolbarDirection {
  let parent = sceneObject.getParent()
  while (parent) {
    const scripts = parent.getComponents("ScriptComponent")
    for (let i = 0; i < scripts.length; i++) {
      const direction = (scripts[i] as {direction?: string}).direction
      if (direction === ToolbarDirections.HORIZONTAL || direction === ToolbarDirections.VERTICAL) {
        return direction as ToolbarDirection
      }
    }
    parent = parent.getParent()
  }
  return ToolbarDirections.HORIZONTAL
}

export function getDefaultPadding(): Required<ToolbarPadding> {
  return {left: 1, right: 1, top: 0.5, bottom: 0.5}
}

export function mergePadding(padding?: ToolbarPadding): Required<ToolbarPadding> {
  const defaults = getDefaultPadding()
  if (!padding) return defaults

  return {
    left: padding.left ?? defaults.left,
    right: padding.right ?? defaults.right,
    top: padding.top ?? defaults.top,
    bottom: padding.bottom ?? defaults.bottom
  }
}

export function getDefaultBackgroundConfig(): Required<ToolbarBackgroundConfig> {
  const alpha = 0.9
  return {
    cornerRadius: 1.25,
    color: new vec4(0.173, 0.173, 0.173, alpha),
    alpha,
    enabled: true
  }
}

export function validateToolbarConfig(config: ToolbarConfig): void {
  if (config.sizingMode === "fixed" && !config.size) {
    throw new Error("Toolbar: 'size' is required when sizingMode is 'fixed'")
  }

  if (config.size && (config.size.x <= 0 || config.size.y <= 0)) {
    throw new Error("Toolbar: 'size' must have positive dimensions")
  }

  if (config.spacing !== undefined && config.spacing < 0) {
    throw new Error("Toolbar: 'spacing' must be non-negative")
  }

  if (config.frameGap !== undefined && config.frameGap < 0) {
    throw new Error("Toolbar: 'frameGap' must be non-negative")
  }
}

export function validateItemConfig(config: AnyToolbarItemConfig): void {
  if (!config.id || config.id.trim() === "") {
    config.id = generateToolbarItemId("item")
  }

  if (config.minSize) {
    if (config.minSize.x < 0 || config.minSize.y < 0) {
      throw new Error(`Toolbar item '${config.id}': 'minSize' must be non-negative`)
    }
  }

  if (config.maxSize) {
    if (config.maxSize.x < 0 || config.maxSize.y < 0) {
      throw new Error(`Toolbar item '${config.id}': 'maxSize' must be non-negative`)
    }
  }

  if (config.minSize && config.maxSize) {
    if (config.minSize.x > config.maxSize.x || config.minSize.y > config.maxSize.y) {
      throw new Error(`Toolbar item '${config.id}': 'minSize' cannot be greater than 'maxSize'`)
    }
  }
}
