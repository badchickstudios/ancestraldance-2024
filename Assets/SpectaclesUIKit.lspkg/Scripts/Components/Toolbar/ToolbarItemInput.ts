import {
  AxisSizeMode,
  generateToolbarItemId,
  getToolbarDirectionFromSceneObject,
  ToolbarAlignment,
  ToolbarAttachmentPosition,
  ToolbarButtonConfig,
  ToolbarButtonType,
  ToolbarCustomItemConfig,
  ToolbarDirection,
  ToolbarDirections,
  ToolbarHorizontalAlignment,
  ToolbarIconSizeMode,
  ToolbarItemConfig,
  ToolbarItemSizeMode,
  ToolbarItemType,
  ToolbarSeparatorConfig,
  ToolbarSliderConfig,
  ToolbarTextFieldConfig,
  ToolbarToggleConfig
} from "./Types/ToolbarSchema"

const DEFAULT_MANUAL_SIZES = {
  BUTTON: new vec2(3, 3),
  TEXTFIELD: new vec2(12, 3),
  SLIDER: new vec2(12, 3),
  TOGGLE: new vec2(6, 3),
  SEPARATOR: new vec2(0.1, 3),
  CUSTOM: new vec2(3, 3)
}

@component
export class ToolbarItemInput extends BaseScriptComponent {
  @input
  @widget(
    new ComboBoxWidget([
      new ComboBoxItem("Button", "button"),
      new ComboBoxItem("Separator", "separator"),
      new ComboBoxItem("Text Field", "textfield"),
      new ComboBoxItem("Slider", "slider"),
      new ComboBoxItem("Toggle", "toggle"),
      new ComboBoxItem("Custom", "custom")
    ])
  )
  @hint("Type of toolbar item.")
  public itemType: string = "button"

  @input
  @hint("Unique identifier for this item. Auto-generated if empty.")
  public id: string = ""

  @input
  @widget(
    new ComboBoxWidget([
      new ComboBoxItem("Left", "left"),
      new ComboBoxItem("Center", "center"),
      new ComboBoxItem("Right", "right")
    ])
  )
  @hint(
    "Alignment along the toolbar's main axis. For horizontal toolbars: Left/Right. For vertical toolbars: Left = Bottom, Right = Top."
  )
  public alignment: string = ToolbarAlignment.LEFT

  @ui.group_start("Toolbar Item Settings")
  @input
  @allowUndefined
  @showIf("itemType", "custom")
  @hint(
    "SceneObject to attach as custom toolbar item. Create the SceneObject and any components you need, then attach it here. The toolbar sets the size on this SceneObject's transform directly, ensure any child objects are positioned relative to its origin."
  )
  public customObject: SceneObject | null = null

  @input
  @widget(new ComboBoxWidget([new ComboBoxItem("Rectangle", "rectangle"), new ComboBoxItem("Capsule", "capsule")]))
  @showIf("itemType", "button")
  @hint("Shape/style of the button.")
  public buttonType: string = "rectangle"

  @input
  @allowUndefined
  @showIf("itemType", "button")
  @hint("Icon texture for the button. Optional.")
  public icon: Texture | null = null

  @input
  @widget(new ComboBoxWidget([new ComboBoxItem("Fixed", "fixed"), new ComboBoxItem("Fill", "fill")]))
  @showIf("itemType", "button")
  @hint("Icon size mode: Fixed uses standard icon size, Fill makes icon fill the entire button.")
  public iconSizeMode: string = ToolbarIconSizeMode.FIXED

  @input
  @showIf("itemType", "button")
  @hint("Text label for the button. Optional.")
  public text: string = ""

  @input
  @widget(new ComboBoxWidget([new ComboBoxItem("Left", "left"), new ComboBoxItem("Right", "right")]))
  @showIf("itemType", "button")
  @hint("Alignment of the icon relative to the text. Icon is centered when there is no text.")
  public iconAlignment: string = ToolbarHorizontalAlignment.LEFT

  @input
  @widget(
    new ComboBoxWidget([
      new ComboBoxItem("Left", "left"),
      new ComboBoxItem("Center", "center"),
      new ComboBoxItem("Right", "right")
    ])
  )
  @showIf("itemType", "button")
  @hint("Alignment of the text within the button.")
  public textAlignment: string = ToolbarAlignment.CENTER

  @input
  @showIf("itemType", "button")
  @hint("Hide text when button is too small to fit both icon and text. Only applies when an icon is set.")
  public hideTextWhenTooSmall: boolean = false

  @input
  @widget(new ComboBoxWidget([new ComboBoxItem("Fill Available Space", "fill"), new ComboBoxItem("Manual", "manual")]))
  @showIf("itemType", "button")
  @hint("How the button sizes itself.")
  public buttonSizeMode: string = ToolbarItemSizeMode.FILL

  @input("vec2", "{3,3}")
  @showIf("itemType", "button")
  @hint("Manual size in centimeters. Only used when Size Mode is set to Manual.")
  public buttonManualSize: vec2 | null = null

  @input("number", "3")
  @showIf("itemType", "button")
  @hint(
    "Fixed size for the cross-axis in centimeters when Size Mode is Fill (height for horizontal toolbar, width for vertical toolbar)."
  )
  public buttonCrossAxisSize: number = 3

  @input
  @widget(new ComboBoxWidget([new ComboBoxItem("Fill Available Space", "fill"), new ComboBoxItem("Manual", "manual")]))
  @showIf("itemType", "custom")
  @hint("How the custom item sizes itself.")
  public customSizeMode: string = ToolbarItemSizeMode.FILL

  @input("vec2", "{3,3}")
  @showIf("itemType", "custom")
  @hint("Manual size in centimeters. Only used when Size Mode is set to Manual.")
  public customManualSize: vec2 | null = null

  @input("number", "3")
  @showIf("itemType", "custom")
  @hint(
    "Fixed size for the cross-axis in centimeters when Size Mode is Fill (height for horizontal toolbar, width for vertical toolbar)."
  )
  public customCrossAxisSize: number = 3

  @input("number", "0.1")
  @showIf("itemType", "separator")
  @hint("Thickness of the separator in centimeters.")
  public thickness: number = 0.1

  @input("number", "3.0")
  @showIf("itemType", "separator")
  @hint("Height of the separator in centimeters.")
  public height: number = 3.0

  @input("vec4", "{0.5,0.5,0.5,0.5}")
  @showIf("itemType", "separator")
  @hint("Color of the separator (RGBA, 0-1 range).")
  public color: vec4 = new vec4(0.5, 0.5, 0.5, 0.5)

  @input
  @showIf("itemType", "textfield")
  @hint("Text that is displayed before any text is entered")
  public placeholder: string = ""

  @input
  @widget(
    new ComboBoxWidget([
      new ComboBoxItem("Left", "left"),
      new ComboBoxItem("Center", "center"),
      new ComboBoxItem("Right", "right")
    ])
  )
  @showIf("itemType", "textfield")
  @hint("Alignment of the text within the text field.")
  public textFieldTextAlignment: string = ToolbarAlignment.LEFT

  @input
  @allowUndefined
  @showIf("itemType", "textfield")
  @hint("Icon texture for the text field. Optional.")
  public textFieldIcon: Texture | null = null

  @input
  @widget(new ComboBoxWidget([new ComboBoxItem("Left", "left"), new ComboBoxItem("Right", "right")]))
  @showIf("itemType", "textfield")
  @hint("Side of the text field to display the icon.")
  public iconSide: string = ToolbarHorizontalAlignment.LEFT

  @input("number", "0")
  @showIf("itemType", "slider")
  @hint("Minimum slider value.")
  public min: number = 0

  @input("number", "100")
  @showIf("itemType", "slider")
  @hint("Maximum slider value.")
  public max: number = 100

  @input("number", "50")
  @showIf("itemType", "slider")
  @hint("Initial slider value.")
  public value: number = 50

  @input("number", "1")
  @showIf("itemType", "slider")
  @hint("Step size for slider increments.")
  public step: number = 1

  @input
  @showIf("itemType", "slider")
  @hint("Make the slider segmented with discrete steps (like SegmentedSliderTest).")
  public segmented: boolean = false

  @input("number", "2")
  @showIf("itemType", "slider")
  @hint("Number of segments when Segmented is enabled (at least 2).")
  public numberOfSegments: number = 2

  @input
  @showIf("itemType", "toggle")
  @hint("Initial toggle state (on/off).")
  public isOn: boolean = false

  @input
  @widget(new ComboBoxWidget([new ComboBoxItem("Fill Available Space", "fill"), new ComboBoxItem("Manual", "manual")]))
  @showIf("itemType", "textfield")
  @hint("How the item sizes itself.")
  public textFieldSizeMode: string = ToolbarItemSizeMode.FILL

  @input("vec2", "{12,3}")
  @showIf("itemType", "textfield")
  @hint("Manual size in centimeters. Only used when Size Mode is set to Manual.")
  public textFieldManualSize: vec2 | null = null

  @input("number", "3")
  @showIf("itemType", "textfield")
  @hint("Fixed height in centimeters when Size Mode is Fill.")
  public textFieldCrossAxisSize: number = 3

  @input
  @widget(new ComboBoxWidget([new ComboBoxItem("Fill Available Space", "fill"), new ComboBoxItem("Manual", "manual")]))
  @showIf("itemType", "slider")
  @hint("How the item sizes itself.")
  public sliderSizeMode: string = ToolbarItemSizeMode.FILL

  @input("vec2", "{12,3}")
  @showIf("itemType", "slider")
  @hint("Manual size in centimeters. Only used when Size Mode is set to Manual.")
  public sliderManualSize: vec2 | null = null

  @input("number", "3")
  @showIf("itemType", "slider")
  @hint("Fixed height in centimeters when Size Mode is Fill.")
  public sliderCrossAxisSize: number = 3

  @input
  @widget(new ComboBoxWidget([new ComboBoxItem("Fill Available Space", "fill"), new ComboBoxItem("Manual", "manual")]))
  @showIf("itemType", "toggle")
  @hint("How the item sizes itself.")
  public toggleSizeMode: string = ToolbarItemSizeMode.FILL

  @input("vec2", "{6,3}")
  @showIf("itemType", "toggle")
  @hint("Manual size in centimeters. Only used when Size Mode is set to Manual.")
  public toggleManualSize: vec2 | null = null

  @input("number", "3")
  @showIf("itemType", "toggle")
  @hint("Fixed height in centimeters when Size Mode is Fill.")
  public toggleCrossAxisSize: number = 3
  @ui.group_end
  @ui.group_start("Attachment Settings")
  @input
  @hint("Enable this to attach this item to another toolbar item.")
  public isAttachedComponent: boolean = false

  @input
  @allowUndefined
  @showIf("isAttachedComponent")
  @hint("Reference to another ToolbarItemInput component to attach this item to.")
  public attachTo: ToolbarItemInput | null = null

  @input
  @widget(
    new ComboBoxWidget([
      new ComboBoxItem("Left", "left"),
      new ComboBoxItem("Right", "right"),
      new ComboBoxItem("Top", "top"),
      new ComboBoxItem("Bottom", "bottom"),
      new ComboBoxItem("Center", "center")
    ])
  )
  @showIf("isAttachedComponent")
  @hint("Position of this item relative to the attached item.")
  public attachmentPosition: string = ToolbarAttachmentPosition.RIGHT

  @input("vec2", "{0,0}")
  @showIf("isAttachedComponent")
  @hint("Fine-tuning offset from attachment position (x, y in centimeters).")
  public attachmentOffset: vec2 = new vec2(0, 0)
  @ui.group_end
  @input
  @hint("Initial disabled state. When disabled, item is visible but not interactive.")
  public inactive: boolean = false

  public toConfig():
    | ToolbarButtonConfig
    | ToolbarSeparatorConfig
    | ToolbarTextFieldConfig
    | ToolbarSliderConfig
    | ToolbarToggleConfig
    | ToolbarCustomItemConfig
    | null {
    let id = this.id.trim() || ""
    if (!id) {
      id = generateToolbarItemId(this.sceneObject.name || "item")
      this.id = id
    }

    const alignment = this.alignment as ToolbarAlignment

    switch (this.itemType) {
      case ToolbarItemType.BUTTON:
        return this.buildButtonConfig(id, alignment)
      case ToolbarItemType.SEPARATOR:
        return this.buildSeparatorConfig(id, alignment)
      case ToolbarItemType.TEXTFIELD:
        return this.buildTextFieldConfig(id, alignment)
      case ToolbarItemType.SLIDER:
        return this.buildSliderConfig(id, alignment)
      case ToolbarItemType.TOGGLE:
        return this.buildToggleConfig(id, alignment)
      case ToolbarItemType.CUSTOM:
        return this.buildCustomItemConfig(id, alignment)
      default:
        throw new Error(`Unknown item type: ${this.itemType}`)
    }
  }

  private buildButtonConfig(itemId: string, alignment: ToolbarAlignment): ToolbarButtonConfig {
    const size = this.calculateItemSize(
      this.buttonSizeMode,
      this.buttonManualSize,
      this.buttonCrossAxisSize,
      DEFAULT_MANUAL_SIZES.BUTTON
    )

    const config: ToolbarButtonConfig = {
      id: itemId,
      type: ToolbarItemType.BUTTON,
      alignment: alignment,
      inactive: this.inactive,
      size: size,
      buttonType: this.buttonType as ToolbarButtonType,
      iconAlignment: this.iconAlignment as ToolbarHorizontalAlignment,
      textAlignment: this.textAlignment as ToolbarAlignment,
      hideTextWhenTooSmall: this.hideTextWhenTooSmall
    }

    if (this.icon) {
      config.icon = this.icon
    }

    config.iconSizeMode = this.iconSizeMode as ToolbarIconSizeMode

    if (this.text && this.text.trim() !== "") {
      config.text = this.text
    }

    this.applyAttachmentToConfig(config)
    return config
  }

  private buildSeparatorConfig(itemId: string, alignment: ToolbarAlignment): ToolbarSeparatorConfig {
    const thickness = this.thickness
    const height = this.height
    const color = this.color

    const config: ToolbarSeparatorConfig = {
      id: itemId,
      type: ToolbarItemType.SEPARATOR,
      alignment: alignment,
      inactive: this.inactive,
      thickness: thickness,
      height: height,
      color: color
    }

    this.applyAttachmentToConfig(config)
    return config
  }

  private buildTextFieldConfig(itemId: string, alignment: ToolbarAlignment): ToolbarTextFieldConfig {
    const size = this.calculateItemSize(
      this.textFieldSizeMode,
      this.textFieldManualSize,
      this.textFieldCrossAxisSize,
      DEFAULT_MANUAL_SIZES.TEXTFIELD
    )

    const config: ToolbarTextFieldConfig = {
      id: itemId,
      type: ToolbarItemType.TEXTFIELD,
      alignment: alignment,
      inactive: this.inactive,
      size: size,
      placeholder: this.placeholder
    }

    config.textAlignment = this.textFieldTextAlignment as ToolbarAlignment

    if (this.textFieldIcon) {
      config.icon = this.textFieldIcon
      config.iconSide = this.iconSide as ToolbarHorizontalAlignment
    }

    this.applyAttachmentToConfig(config)
    return config
  }

  private buildSliderConfig(itemId: string, alignment: ToolbarAlignment): ToolbarSliderConfig {
    const size = this.calculateItemSize(
      this.sliderSizeMode,
      this.sliderManualSize,
      this.sliderCrossAxisSize,
      DEFAULT_MANUAL_SIZES.SLIDER
    )

    const config: ToolbarSliderConfig = {
      id: itemId,
      type: ToolbarItemType.SLIDER,
      alignment: alignment,
      inactive: this.inactive,
      size: size,
      min: this.min,
      max: this.max
    }

    config.value = MathUtils.clamp(this.value, this.min, this.max)

    if (this.step > 0) {
      config.step = this.step
    }

    if (this.segmented) {
      config.segmented = true
      config.numberOfSegments = Math.max(2, this.numberOfSegments)
    }

    this.applyAttachmentToConfig(config)
    return config
  }

  private buildToggleConfig(itemId: string, alignment: ToolbarAlignment): ToolbarToggleConfig {
    const size = this.calculateItemSize(
      this.toggleSizeMode,
      this.toggleManualSize,
      this.toggleCrossAxisSize,
      DEFAULT_MANUAL_SIZES.TOGGLE
    )

    const config: ToolbarToggleConfig = {
      id: itemId,
      type: ToolbarItemType.TOGGLE,
      alignment: alignment,
      inactive: this.inactive,
      size: size,
      isOn: this.isOn
    }

    this.applyAttachmentToConfig(config)
    return config
  }

  private buildCustomItemConfig(itemId: string, alignment: ToolbarAlignment): ToolbarCustomItemConfig | null {
    if (!this.customObject) {
      return null
    }

    const size = this.calculateItemSize(
      this.customSizeMode,
      this.customManualSize,
      this.customCrossAxisSize,
      DEFAULT_MANUAL_SIZES.CUSTOM
    )

    const config: ToolbarCustomItemConfig = {
      id: itemId,
      type: ToolbarItemType.CUSTOM,
      alignment: alignment,
      inactive: this.inactive,
      size: size,
      customObject: this.customObject
    }

    this.applyAttachmentToConfig(config)
    return config
  }

  private applyAttachmentToConfig(config: ToolbarItemConfig): void {
    if (!this.isAttachedComponent || !this.attachTo) return
    let attachToId = this.attachTo.id.trim() || ""
    if (!attachToId) {
      attachToId = generateToolbarItemId(this.attachTo.sceneObject.name || "item")
      this.attachTo.id = attachToId
    }
    config.attachTo = attachToId
    config.attachmentPosition = this.attachmentPosition as ToolbarAttachmentPosition
    config.attachmentOffset = new vec2(this.attachmentOffset.x, this.attachmentOffset.y)
  }

  private _cachedDirection: ToolbarDirection | null = null

  private getToolbarDirection(): ToolbarDirection {
    if (this._cachedDirection === null) {
      this._cachedDirection = getToolbarDirectionFromSceneObject(this.sceneObject)
    }
    return this._cachedDirection
  }

  private calculateItemSize(
    sizeMode: string,
    manualSize: vec2 | null,
    crossAxisSize: number,
    defaultManualSize: vec2
  ): vec2 | {x: AxisSizeMode; y: AxisSizeMode} {
    if (sizeMode === ToolbarItemSizeMode.MANUAL) {
      return manualSize ?? defaultManualSize
    } else {
      const effectiveCrossAxisSize = crossAxisSize > 0 ? crossAxisSize : 3
      const direction = this.getToolbarDirection()
      const isHorizontal = direction === ToolbarDirections.HORIZONTAL
      if (isHorizontal) {
        return {x: ToolbarItemSizeMode.FILL, y: effectiveCrossAxisSize}
      } else {
        return {x: effectiveCrossAxisSize, y: ToolbarItemSizeMode.FILL}
      }
    }
  }
}
