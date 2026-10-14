require("LensStudio:TextInputModule") // eslint-disable-line @typescript-eslint/no-require-imports

import {InteractorEvent} from "SpectaclesInteractionKit.lspkg/Core/Interactor/InteractorEvent"
import animate, {CancelSet} from "SpectaclesInteractionKit.lspkg/Utils/animate"
import Event from "SpectaclesInteractionKit.lspkg/Utils/Event"
import {CancelToken, clearTimeout, setTimeout} from "SpectaclesInteractionKit.lspkg/Utils/FunctionTimingUtils"
import NativeLogger from "SpectaclesInteractionKit.lspkg/Utils/NativeLogger"
import {Callback, createCallbacks} from "../../Utility/SceneUtilities"
import {isEqual} from "../../Utility/UIKitUtilities"
import {
  RoundedRectangleVisual,
  RoundedRectangleVisualParameters
} from "../../Visuals/RoundedRectangle/RoundedRectangleVisual"
import {StateName} from "../Element"
import {VisualElement} from "../VisualElement"
import {TextInputComponentManager} from "./TextInputComponentManager"
import {
  BACKGROUND_GRADIENT_PARAMETERS,
  BORDER_GRADIENT_PARAMETERS,
  CORNER_RADIUS,
  createTextInputStateMap,
  DEBUG_RENDER,
  DEFAULT_BEHAVIOR,
  DEFAULT_TEXT_COLOR,
  HOVER_SCALE_FACTOR,
  INSET_FACTOR_SINGLE_LINE,
  KEYBOARD_DELAY_DEFAULT,
  KEYBOARD_DELAY_DESELECT,
  PLACEHOLDER_TEXT_COLOR,
  STATE_ANIMATION_DURATION,
  TextInputStateType,
  TEXT_PARENT_Z_OFFSET
} from "./TextInputConsts"
import {TextManipulationModule} from "./TextManipulation/TextManipulationModule"

const log = new NativeLogger("BaseTextInputComponent")

export const CARET_MATERIAL_ASSET: Material = requireAsset("../../../Materials/CaretMat.mat") as Material
export const CARET_DRAG_MATERIAL_ASSET: Material = requireAsset("../../../Materials/CaretDragMat.mat") as Material
export const HIGHLIGHT_MATERIAL_ASSET: Material = requireAsset("../../../Materials/HighlightMat.mat") as Material
/**
 * Abstract base class for text input components that provides shared state management,
 * keyboard integration, visual styling, and lifecycle hooks.
 *
 * BaseTextInputComponent handles the common behavior for all text input variants:
 * - **Keyboard management**: Opens/dismisses the system keyboard and routes text changes
 * - **State animation**: Animates size transitions on hover, trigger, and toggle states
 * - **Batched updates**: Coalesces text and size changes into a single end-of-frame flush
 * - **Placeholder text**: Displays configurable placeholder text when the input is empty
 * - **Visual styling**: Creates a default {@link RoundedRectangleVisual} with gradient borders
 *
 * Subclasses must implement the following hooks:
 * - {@link initializeKeyboard} — configure keyboard type and return key behavior
 * - {@link initializeTextComponent} — configure text alignment and overflow modes
 * - {@link updateVisibleText} — render the current text string to the text component
 *
 * @remarks
 * - This class is abstract and should not be instantiated directly
 * - Use {@link TextInputField} for single-line input or {@link TextInputArea} for multiline input
 *
 * @see {@link TextInputField} - Single-line text input implementation
 * @see {@link TextInputArea} - Multiline text input implementation
 * @see {@link TextInputComponentManager} - Manages focus across all text input instances
 * @see {@link TextInputUtilities} - Shared constants and types for text input styling and behavior
 */
export abstract class BaseTextInputComponent extends VisualElement {
  /**
   *  add per-theme styles, add @input fields like:
   *
   * @input
   * @showIf("_themeOverride", "SnapOS3")
   * @label("Style")
   * @widget(new ComboBoxWidget([
   *   new ComboBoxItem("StyleName", "StyleName"),
   * ]))
   * protected _styleSnapOS3: string = "StyleName"
   */

  @input("int")
  @hint("Custom font size. If not set, it will automatically scale from size.y")
  protected _fontSize: number = 0

  @input
  @hint("Font Family")
  @allowUndefined
  protected _fontFamily: Font

  @input
  @hint("Enable this to add functions from another script to this component's callbacks")
  protected addCallbacks: boolean = false
  @input
  @showIf("addCallbacks")
  @label("On Text Changed Callbacks")
  protected onTextChangedCallbacks: Callback[] = []
  @input
  @showIf("addCallbacks")
  @label("On Keyboard State Changed Callbacks")
  protected onKeyboardStateChangedCallbacks: Callback[] = []

  @input
  @hint("Text that is displayed before any text is entered")
  protected _placeholderText: string = ""

  public scaleOnHover: boolean = false
  public textComponent: Text

  protected textParent: SceneObject
  protected textParentScreenTransform: ScreenTransform
  protected textObject: SceneObject
  protected textObjectScreenTransform: ScreenTransform

  protected _visual: RoundedRectangleVisual
  protected _originalSize: vec3 = this._size
  protected _text: string = ""
  protected isPlaceholder: boolean = true
  protected isEditing: boolean = false
  protected keyboardOptions = new TextInputSystem.KeyboardOptions()
  protected keyboardTimeoutCancelToken: CancelToken
  protected stateCancelSet = new CancelSet()

  private _textDirty: boolean = false
  private _sizeDirty: boolean = false
  private _batchUpdateEvent: SceneEvent

  protected textManipulationModule: TextManipulationModule

  protected readonly _states: Map<StateName, TextInputStateType> = createTextInputStateMap(
    () => this._originalSize,
    () => this.calculateHoverScale()
  )

  protected typingEvent = new Event()
  /**
   * Event fired on each keystroke while the user is typing.
   */
  public readonly onTyping = this.typingEvent.publicApi()

  protected onTextChangedEvent = new Event<string>()
  /**
   * Event fired when the text content changes.
   * The event payload is the new text string.
   */
  public readonly onTextChanged = this.onTextChangedEvent.publicApi()

  protected returnKeyPressed = new Event<string>()
  /**
   * Event fired when the return/done key is pressed on the keyboard.
   * The event payload is the current text string.
   */
  public readonly onReturnKeyPressed = this.returnKeyPressed.publicApi()

  protected keyboardStateChanged = new Event<boolean>()
  /**
   * Event fired when the system keyboard opens or closes.
   * The event payload is `true` when the keyboard is open, `false` when closed.
   */
  public readonly onKeyboardStateChanged = this.keyboardStateChanged.publicApi()

  protected editModeEvent = new Event<boolean>()
  /**
   * Event fired when the component enters or exits edit mode.
   * The event payload is `true` when entering edit mode, `false` when exiting.
   */
  public readonly onEditMode = this.editModeEvent.publicApi()

  private _textInputComponentManager: TextInputComponentManager | null = null

  private onCaretIndexChangedEvent: Event<number> = new Event<number>()
  public readonly onCaretIndexChanged = this.onCaretIndexChangedEvent.publicApi()
  private onHighlightUpdatedEvent: Event<string> = new Event<string>()
  public readonly onHighlightUpdated = this.onHighlightUpdatedEvent.publicApi()

  /**
   * Gets the current size of the text input component.
   * @returns The size as a vec3 (width, height, depth).
   */
  public get size(): vec3 {
    return this._size
  }

  /**
   * Sets the size of the text input component.
   * Triggers a batched size update that recalculates the visual, font size, and text parent anchors.
   * @param size - The new size as a vec3 (width, height, depth).
   */
  public set size(size: vec3) {
    if (size === undefined || isEqual(size, this._size)) return
    super.size = size
    this.markSizeDirty()
  }

  /**
   * Gets the original (baseline) size of the text input component.
   * Used as the reference size for hover scale calculations and font size scaling.
   * @returns The original size as a vec3.
   */
  public get originalSize(): vec3 {
    return this._originalSize
  }

  /**
   * Sets the original (baseline) size of the text input component.
   * Also updates the current size to match.
   * @param originalSize - The new original size as a vec3.
   */
  public set originalSize(originalSize: vec3) {
    if (originalSize === undefined || isEqual(originalSize, this._originalSize)) return
    this._originalSize = originalSize
    this.size = originalSize
  }

  /**
   * Gets the current text content of the input.
   * @returns The current text string, or an empty string if only placeholder text is shown.
   */
  public get text() {
    return this._text
  }

  /**
   * Sets the text content of the input.
   * Triggers a batched text update and fires the {@link onTextChanged} event when initialized.
   * @param text - The new text string.
   */
  public set text(text: string) {
    if (text === undefined || isEqual(text, this._text)) return
    this._text = text
    if (this._initialized) {
      this.markTextDirty()
    }
  }

  /**
   * Gets the placeholder text displayed when the input is empty and not in edit mode.
   * @returns The placeholder text string.
   */
  public get placeholderText(): string {
    return this._placeholderText
  }

  /**
   * Sets the placeholder text displayed when the input is empty and not in edit mode.
   * @param value - The new placeholder text string.
   */
  public set placeholderText(value: string) {
    if (value === undefined || isEqual(value, this._placeholderText)) return
    this._placeholderText = value
    this.markTextDirty()
  }

  /**
   * Gets the custom font size.
   * A value of 0 means the font size is automatically derived from the component height.
   * @returns The font size, or 0 for automatic sizing.
   */
  public get fontSize(): number {
    return this._fontSize
  }

  /**
   * Sets the custom font size.
   * Set to 0 to use automatic font sizing based on the component height.
   * @param value - The new font size, or 0 for automatic sizing.
   */
  public set fontSize(value: number) {
    if (value === undefined || isEqual(value, this._fontSize)) return
    this._fontSize = value
    this.markSizeDirty()
  }

  /**
   * Gets the font family used for text rendering.
   * @returns The current Font asset, or undefined if using the default font.
   */
  public get fontFamily(): Font {
    return this._fontFamily
  }

  /**
   * Sets the font family used for text rendering.
   * Triggers a size recalculation since different fonts may have different metrics.
   * @param value - The Font asset to use.
   */
  public set fontFamily(value: Font) {
    if (value === undefined || isEqual(value, this._fontFamily)) return
    this._fontFamily = value
    if (this._initialized) {
      this.textComponent.font = this._fontFamily
      this.markSizeDirty()
    }
  }

  /**
   * Sets the render order for the visual and text layers.
   * The text component renders at `value + 1` to appear above the background visual.
   * @param value - The base render order value.
   */
  public set renderOrder(value: number) {
    if (value === undefined || isEqual(value, this._renderOrder)) return
    this._renderOrder = value
    if (this._initialized) {
      this.updateRenderOrder(value)
    }
  }

  public get isDraggable() {
    return true
  }

  public get caretIndex(): number {
    if (!this._initialized || !this.textManipulationModule) return 0
    return this.textManipulationModule.caretCharIndex
  }

  public get highlightedText(): string {
    if (!this._initialized || !this.textManipulationModule) return ""
    return this.textManipulationModule.getHighlightedText()
  }

  public removeHighlightedText(): boolean {
    if (!this._initialized || !this.textManipulationModule) return false
    return this.textManipulationModule.removeHighlightedText()
  }

  public replaceHighlightedText(text: string): boolean {
    if (!this._initialized || !this.textManipulationModule) return false
    return this.textManipulationModule.replaceHighlightedText(text)
  }

  /**
   * Enters or exits edit mode, managing keyboard visibility and input state.
   *
   * When entering edit mode: toggles the interactable state, clears placeholder text if present,
   * sets the initial keyboard text, requests the system keyboard, and registers this field as active.
   *
   * When exiting edit mode: untoggle the interactable state, dismisses the keyboard,
   * deregisters this field, updates the displayed text, and cancels any pending keyboard requests.
   *
   * @param editing - `true` to enter edit mode, `false` to exit.
   */
  public editMode(editing: boolean) {
    if (editing === this.isEditing) return
    this.editModeEvent.invoke(editing)
    if (DEFAULT_BEHAVIOR) {
      if (editing) {
        this._interactableStateMachine.toggle = true
        this.textComponent.textFill.color = DEFAULT_TEXT_COLOR
        if (this.isPlaceholder) {
          this.isPlaceholder = false
          this.keyboardOptions.initialText = ""
          this._text = ""
          this.updateVisibleText("")
          this.onTextUpdated()
        } else {
          this.keyboardOptions.initialText = this.text
        }
        global.textInputSystem.requestKeyboard(this.keyboardOptions)
        this.isEditing = true
        this.textInputFieldManager.registerActive(this)
      } else {
        this._interactableStateMachine.toggle = false
        this.isEditing = false
        this.textInputFieldManager.deregisterActive(this)
        global.textInputSystem.dismissKeyboard()
        this.updateText()
        this.cancelRequestKeyboard()
      }
    }
  }

  /**
   * Transitions the component to the specified interaction state.
   * Animates the component size toward the target state's size when {@link scaleOnHover} is enabled.
   * @param stateName - The target interaction state.
   */
  public setState(stateName: StateName) {
    super.setState(stateName)
    const state = this._states.get(stateName)
    this.stateCancelSet()
    if (this.scaleOnHover) {
      animate({
        cancelSet: this.stateCancelSet,
        duration: STATE_ANIMATION_DURATION,
        easing: "ease-in-quart",
        update: (t) => {
          const newSize = state.size ? state.size() : this._originalSize
          this.size = vec3.lerp(this._size, newSize, t)
        }
      })
    }
  }

  /**
   * Initializes the text input component after scene objects are created.
   * Sets up the text hierarchy, configures keyboard callbacks, applies the initial
   * font, size, and text state, and invokes the subclass hooks
   * {@link initializeTextComponent} and {@link initializeKeyboard}.
   */
  public initialize() {
    super.initialize()

    this.interactable.enableInstantDrag = false

    this.textParent.setParent(this.sceneObject)
    this.textObject.setParent(this.textParent)
    this.textParentScreenTransform.position = new vec3(0, 0, TEXT_PARENT_Z_OFFSET)

    this.textComponent.depthTest = true
    this.textComponent.horizontalAlignment = HorizontalAlignment.Left
    this.textObjectScreenTransform.offsets = Rect.create(0, 0, 0, 0)
    this.textObjectScreenTransform.enableDebugRendering = DEBUG_RENDER
    this.textParentScreenTransform.enableDebugRendering = DEBUG_RENDER

    this.initializeTextComponent()
    this.initializeKeyboard()

    this.keyboardOptions.enablePreview = false
    this.keyboardOptions.onTextChanged = (text) => {
      this.isEditing = true
      this.text = text
      this.typingEvent.invoke()
    }

    this.keyboardOptions.onKeyboardStateChanged = (isOpen: boolean) => {
      this.keyboardStateChanged.invoke(isOpen)
      if (DEFAULT_BEHAVIOR) {
        if (!isOpen) {
          this._hasError = false
          this.editMode(false)
        }
      }
    }

    this.keyboardOptions.onReturnKeyPressed = () => {
      this.returnKeyPressed.invoke(this.text)
    }

    this._interactableStateMachine.untoggleOnClick = false

    this.updateRenderOrder(this._renderOrder)
    if (this._fontFamily) this.textComponent.font = this._fontFamily
    this.updateSize()

    this.textManipulationModule = new TextManipulationModule(
      this.textComponent,
      this.interactable,
      CARET_MATERIAL_ASSET,
      CARET_DRAG_MATERIAL_ASSET,
      HIGHLIGHT_MATERIAL_ASSET,
      this.onEditMode,
      this.onTextChanged,
      this.createEvent("UpdateEvent"),
      this.createEvent("LateUpdateEvent")
    )

    this.textManipulationModule.onCaretIndexChanged.add(() => {
      this.onCaretIndexChangedEvent.invoke(this.textManipulationModule.caretCharIndex)
    })
    this.textManipulationModule.onHighlightUpdated.add((text) => {
      this.onHighlightUpdatedEvent.invoke(text)
    })

    this.updateText()
  }

  /**
   * Called when the component is first created.
   * Creates the text parent and text child scene objects, sets up the batched update event,
   * and registers this field with the {@link TextInputComponentManager}.
   */
  public onAwake(): void {
    this._batchUpdateEvent = this.createEvent("LateUpdateEvent")
    this._batchUpdateEvent.enabled = false
    this._batchUpdateEvent.bind(() => this.flushBatchedUpdates())

    this.textParent = global.scene.createSceneObject("textParent")
    this.managedSceneObjects.add(this.textParent)
    this.textParent.layer = this.sceneObject.layer
    this.textParentScreenTransform = this.textParent.createComponent("ScreenTransform")

    this.textObject = global.scene.createSceneObject("textObject")
    this.textObject.layer = this.sceneObject.layer
    this.textObjectScreenTransform = this.textObject.createComponent("ScreenTransform")
    this.textComponent = this.textObject.getComponent("Text") || this.textObject.createComponent("Text")
    this.managedComponents.add(this.textComponent)

    this.textInputFieldManager.addField(this)
    super.onAwake()
  }

  protected get isToggle(): boolean {
    return true
  }

  protected get textInputFieldManager() {
    if (!this._textInputComponentManager) {
      this._textInputComponentManager = TextInputComponentManager.getInstance()
    }
    return this._textInputComponentManager
  }

  /** Subclass hook to configure text alignment and overflow modes. */
  protected abstract initializeTextComponent(): void

  /** Subclass hook to render text to the text component. */
  protected abstract updateVisibleText(text: string): void

  /** Subclass hook to compute the font size */
  protected abstract computeFontSize(): number

  protected initializeKeyboard(): void {
    this.keyboardOptions.returnKeyType = TextInputSystem.ReturnKeyType.Done
  }

  protected createDefaultVisual(): void {
    if (!this._visual) {
      const theme = this.resolveTheme()
      const themedStyle = theme.styles["TextInputField"]?.["default"]
      const parameters: Partial<RoundedRectangleVisualParameters> = themedStyle ?? {
        default: {
          baseType: "Gradient",
          baseGradient: BACKGROUND_GRADIENT_PARAMETERS.default,
          hasBorder: true,
          borderSize: 0.125,
          borderType: "Gradient",
          shouldPosition: true,
          borderGradient: BORDER_GRADIENT_PARAMETERS.default
        },
        hovered: {
          localPosition: new vec3(0, 0, 1),
          borderGradient: BORDER_GRADIENT_PARAMETERS.toggledHovered
        },
        triggered: {
          localPosition: new vec3(0, 0, 0.5),
          baseGradient: BACKGROUND_GRADIENT_PARAMETERS.toggled,
          borderGradient: BORDER_GRADIENT_PARAMETERS.toggled
        },
        toggledDefault: {
          localPosition: new vec3(0, 0, 0.5),
          baseGradient: BACKGROUND_GRADIENT_PARAMETERS.toggled,
          borderGradient: BORDER_GRADIENT_PARAMETERS.toggledHovered
        },
        toggledHovered: {
          localPosition: new vec3(0, 0, 0.5),
          baseGradient: BACKGROUND_GRADIENT_PARAMETERS.toggled,
          borderGradient: BORDER_GRADIENT_PARAMETERS.toggled
        },
        toggledTriggered: {
          localPosition: new vec3(0, 0, 0.5),
          baseGradient: BACKGROUND_GRADIENT_PARAMETERS.toggled,
          borderGradient: BORDER_GRADIENT_PARAMETERS.toggled
        }
      }
      const defaultVisual: RoundedRectangleVisual = new RoundedRectangleVisual({
        sceneObject: this.sceneObject,
        style: parameters
      })
      defaultVisual.cornerRadius = CORNER_RADIUS
      this._visual = defaultVisual
    }
  }

  protected setUpEventCallbacks(): void {
    if (this.addCallbacks) {
      this.onTextChanged.add(createCallbacks(this.onTextChangedCallbacks))
      this.onKeyboardStateChanged.add(createCallbacks(this.onKeyboardStateChangedCallbacks))
    }
    super.setUpEventCallbacks()
  }

  protected calculateHoverScale(): vec3 {
    return this._originalSize.uniformScale(HOVER_SCALE_FACTOR)
  }

  protected onTriggerUpHandler(event: InteractorEvent): void {
    if (event.target !== this.interactable) return
    if (!this.isEditing) {
      if (this.textInputFieldManager.active.size > 0 || this.textInputFieldManager.recentlyClosed) {
        this.textInputFieldManager.deselectAll().then(() => {
          this.cancelRequestKeyboard()
          this.keyboardTimeoutCancelToken = setTimeout(() => {
            this.editMode(true)
          }, KEYBOARD_DELAY_DESELECT)
        })
      } else {
        this.cancelRequestKeyboard()
        this.keyboardTimeoutCancelToken = setTimeout(() => {
          this.editMode(true)
        }, KEYBOARD_DELAY_DEFAULT)
      }
    }
  }

  protected updateRenderOrder(value: number) {
    this._visual.renderMeshVisual.renderOrder = value
    this.textComponent.renderOrder = value + 1
  }

  protected updateText(): void {
    this.isPlaceholder = !this.isEditing && this._text === ""
    this.updateVisibleText(this.isPlaceholder ? this._placeholderText : this._text)
    this.onTextUpdated()
  }

  protected onTextUpdated(): void {
    this.textComponent.textFill.color = this.isPlaceholder ? PLACEHOLDER_TEXT_COLOR : DEFAULT_TEXT_COLOR

    this.textManipulationModule.updateBoundingBox()
    this.textManipulationModule.updateCursorPositions()

    this.onTextChangedEvent.invoke(this._text)
  }

  protected updateSize() {
    const inset = this.computeInset()
    this.textComponent.size = this.computeFontSize()
    this.textParentScreenTransform.anchors.top = this._size.y * 0.5
    this.textParentScreenTransform.anchors.bottom = this._size.y * -0.5
    this.textParentScreenTransform.anchors.left = this._size.x * -0.5 + inset
    this.textParentScreenTransform.anchors.right = this._size.x * 0.5 - inset
  }

  protected markTextDirty(): void {
    if (!this._initialized) return
    this._textDirty = true
    this.batchUpdate()
  }

  protected markSizeDirty(): void {
    if (!this._initialized) return
    this._sizeDirty = true
    this.batchUpdate()
  }

  protected batchUpdate(): void {
    this._batchUpdateEvent.enabled = true
  }

  protected flushBatchedUpdates(): void {
    this._batchUpdateEvent.enabled = false
    const sizeDirty = this._sizeDirty
    const textDirty = this._textDirty
    this._sizeDirty = false
    this._textDirty = false

    if (sizeDirty) {
      this.updateSize()
    }
    if (textDirty) {
      this.updateText()
    }
  }

  protected cancelRequestKeyboard = () => {
    log.d(`cancelling timeout ${this.sceneObject.name}`)
    clearTimeout(this.keyboardTimeoutCancelToken)
  }

  protected computeInset(): number {
    return this._size.y * INSET_FACTOR_SINGLE_LINE
  }

  protected release() {
    this.cancelRequestKeyboard()
    this.textManipulationModule?.destroy()
    this.stateCancelSet()
    this.textInputFieldManager.removeField(this)
    super.release()
  }
}
