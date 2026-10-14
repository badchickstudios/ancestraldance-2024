import {isEqual} from "../../Utility/UIKitUtilities"
import {BaseTextInputComponent} from "../TextInput/BaseTextInputComponent"
import {
  DEFAULT_FONT_SIZE,
  INSET_FACTOR_MULTI_LINE,
  OverflowMode,
  RESIZE_THRESHOLD,
  TextAlignment
} from "../TextInput/TextInputConsts"

/**
 * A multiline text input component for Spectacles that wraps text and supports
 * configurable overflow behavior.
 *
 * TextInputArea extends {@link BaseTextInputComponent} with multiline-specific features:
 * - **Overflow modes**: Choose how text that exceeds the visible area is handled
 *   - `Scroll` — vertically scrolls to keep the latest text visible, with a masking component
 *   - `Truncate` — clips text that overflows both horizontally and vertically
 *   - `AutoSize` — automatically expands the component height to fit all text content
 * - **Text alignment**: Configure left or right horizontal alignment
 *
 * @example
 * ```typescript
 * const textArea = sceneObject.getComponent(TextInputArea.getTypeName());
 * textArea.overflowMode = OverflowMode.AutoSize;
 * textArea.horizontalTextAlignment = TextAlignment.Left;
 * textArea.placeholderText = "Enter your message...";
 *
 * textArea.onTextChanged.add((text) => {
 *   print("User typed: " + text);
 * });
 * ```
 *
 * @see {@link BaseTextInputComponent} - The abstract base class providing shared text input behavior
 * @see {@link TextInputField} - Single-line text input variant
 */
@component
export class TextInputArea extends BaseTextInputComponent {
  @input
  @widget(new TextAreaWidget())
  @hint("Text that is displayed before any text is entered")
  protected _placeholderText: string = ""

  @input("string", "left")
  @widget(
    new ComboBoxWidget([
      new ComboBoxItem("Left", "left"),
      new ComboBoxItem("Center", "center"),
      new ComboBoxItem("Right", "right")
    ])
  )
  @hint("Horizontal text alignment")
  protected _horizontalTextAlignment: TextAlignment = TextAlignment.Left

  @input("string", "scroll")
  @widget(
    new ComboBoxWidget([
      new ComboBoxItem("Scroll", "scroll"),
      new ComboBoxItem("Truncate", "truncate"),
      new ComboBoxItem("Auto Size Height", "autoSize")
    ])
  )
  @hint("How text overflow is handled: scroll vertically, truncate, or auto-expand height")
  protected _overflowMode: OverflowMode = OverflowMode.Scroll

  @input
  private _paddingLeft: number = 0
  @input
  private _paddingRight: number = 0
  @input
  private _paddingTop: number = 0
  @input
  private _paddingBottom: number = 0

  private maskingComponent: Component | null = null
  private _overflowModeDirty: boolean = false
  private _overflowDirty: boolean = false
  private _alignmentDirty: boolean = false

  private LINE_SCROLL_COOLDOWN_SEC: number = 0.15
  private lastScrollTime: number = 0

  /**
   * Gets the current overflow mode that controls how text exceeding the visible area is handled.
   * @returns The current overflow mode.
   */
  public get overflowMode(): OverflowMode {
    return this._overflowMode
  }

  /**
   * Sets the overflow mode that controls how text exceeding the visible area is handled.
   * Triggers a batched update that reconfigures overflow settings, masking, and text overflow
   * at the end of the frame.
   * @param value - The desired overflow mode.
   */
  public set overflowMode(value: OverflowMode) {
    if (value === undefined || isEqual(value, this._overflowMode)) return
    this._overflowMode = value
    this.markOverflowModeDirty()
  }

  /**
   * Gets the horizontal text alignment within the input area.
   * @returns The current horizontal text alignment.
   */
  public get horizontalTextAlignment(): TextAlignment {
    return this._horizontalTextAlignment
  }

  /**
   * Sets the horizontal text alignment within the input area.
   * Triggers a batched update that applies the alignment at the end of the frame.
   * @param value - The desired horizontal text alignment.
   */
  public set horizontalTextAlignment(value: TextAlignment) {
    if (value === undefined || isEqual(value, this._horizontalTextAlignment)) return
    this._horizontalTextAlignment = value
    this.markAlignmentDirty()
  }

  public get paddingLeft(): number {
    return this._paddingLeft
  }

  public set paddingLeft(value: number) {
    if (value === undefined || isEqual(value, this._paddingLeft)) return
    this._paddingLeft = value
    this.markSizeDirty()
  }

  public get paddingRight(): number {
    return this._paddingRight
  }

  public set paddingRight(value: number) {
    if (value === undefined || isEqual(value, this._paddingRight)) return
    this._paddingRight = value
    this.markSizeDirty()
  }

  public get paddingTop(): number {
    return this._paddingTop
  }

  public set paddingTop(value: number) {
    if (value === undefined || isEqual(value, this._paddingTop)) return
    this._paddingTop = value
    this.markSizeDirty()
  }

  public get paddingBottom(): number {
    return this._paddingBottom
  }

  public set paddingBottom(value: number) {
    if (value === undefined || isEqual(value, this._paddingBottom)) return
    this._paddingBottom = value
    this.markSizeDirty()
  }

  public initialize(): void {
    super.initialize()
    this.textObjectScreenTransform.offsets.left = 1
    this.textObjectScreenTransform.offsets.right = -1
    this.updateMaskingComponent()
    this.textManipulationModule.onCaretIndexChanged.add(() => {
      this.onCaretIndexUpdated()
    })
    this.textManipulationModule.onCaretDragged.add(() => {
      this.onCaretIndexUpdated()
    })
    this.textManipulationModule.onHighlightHandleDragged.add((params) => {
      const handleIndex = params.index
      this.onHandleDragged(handleIndex)
    })
  }

  protected initializeKeyboard(): void {
    this.keyboardOptions.keyboardType = TextInputSystem.KeyboardType.Text
    this.keyboardOptions.returnKeyType = TextInputSystem.ReturnKeyType.Next
  }

  protected initializeTextComponent(): void {
    this.textComponent.verticalAlignment = VerticalAlignment.Top
    switch (this._horizontalTextAlignment) {
      case TextAlignment.Left:
        this.textComponent.horizontalAlignment = HorizontalAlignment.Left
        break
      case TextAlignment.Center:
        this.textComponent.horizontalAlignment = HorizontalAlignment.Center
        break
      case TextAlignment.Right:
        this.textComponent.horizontalAlignment = HorizontalAlignment.Right
        break
    }
    this.applyOverflow()
  }

  protected updateVisibleText(text: string): void {
    this.textComponent.text = text
  }

  protected onTextUpdated(): void {
    super.onTextUpdated()
    this.markOverflowDirty()
  }

  private onCaretIndexUpdated(): void {
    this.scrollToIndex(this.textManipulationModule.caretIndex)
  }

  private onHandleDragged(handleIndex: number): void {
    this.scrollToIndex(handleIndex)
  }

  private scrollToIndex(targetIndex: number): void {
    const now = getTime()
    if (now - this.lastScrollTime < this.LINE_SCROLL_COOLDOWN_SEC) return
    if (this.updateScrollOffset(targetIndex)) {
      this.lastScrollTime = now
    }
  }

  protected computeInset(): number {
    const baseHeight = this._originalSize ? this._originalSize.y : this._size.y
    return baseHeight * INSET_FACTOR_MULTI_LINE
  }

  protected computeFontSize(): number {
    if (this._fontSize > 0) {
      return this._fontSize
    }
    return DEFAULT_FONT_SIZE
  }

  private applyOverflow() {
    switch (this._overflowMode) {
      case OverflowMode.Scroll:
      case OverflowMode.AutoSize:
        this.textComponent.verticalOverflow = VerticalOverflow.Overflow
        this.textComponent.horizontalOverflow = HorizontalOverflow.Wrap
        break
      case OverflowMode.Truncate:
        this.textComponent.verticalOverflow = VerticalOverflow.Truncate
        this.textComponent.horizontalOverflow = HorizontalOverflow.Wrap
        break
    }
  }

  private handleOverflow() {
    if (this._overflowMode === OverflowMode.Truncate) {
      this.textObjectScreenTransform.offsets.top = 0
      return
    }

    const textBounds = this.textManipulationModule.boundingBox.getSize()
    const anchorHeight = this.textParentScreenTransform.anchors.getSize().y

    if (this._overflowMode === OverflowMode.Scroll) {
      if (textBounds.y > anchorHeight) {
        const overflow = textBounds.y - anchorHeight
        const currentOffset = this.textObjectScreenTransform.offsets.top
        this.textObjectScreenTransform.offsets.top = Math.min(currentOffset, overflow)
        this.textManipulationModule.updateCursorPositions()
      } else {
        this.textObjectScreenTransform.offsets.top = 0
      }
    } else if (this._overflowMode === OverflowMode.AutoSize) {
      this.textObjectScreenTransform.offsets.top = 0
      if (anchorHeight < RESIZE_THRESHOLD) return
      const verticalInset = this.visual.borderSize * 2 + this._paddingTop + this._paddingBottom
      const targetHeight = Math.max(this._originalSize.y, textBounds.y + verticalInset)
      if (Math.abs(targetHeight - this._size.y) > RESIZE_THRESHOLD) {
        super.size = new vec3(this._size.x, targetHeight, this._size.z)
        this.textManipulationModule.updateCursorPositions()
      }
    }
  }

  private updateScrollOffset(targetIndex: number): boolean {
    if (!this.isEditing || this._overflowMode !== OverflowMode.Scroll) return false

    const cursorPositionData = this.textManipulationModule.cursorPositions?.[targetIndex]
    if (!cursorPositionData) return false

    const anchors = this.textParentScreenTransform.anchors
    const areaTop = anchors.top
    const areaBottom = anchors.bottom
    const currentOffset = this.textObjectScreenTransform.offsets.top
    const caretPosition = cursorPositionData.position.y

    const textBounds = this.textManipulationModule.boundingBox.getSize()
    const anchorHeight = anchors.getSize().y
    const maxOffset = Math.max(0, textBounds.y - anchorHeight)
    const lineHeight = this.textManipulationModule.lineHeight
    const halfLine = lineHeight / 2

    // Cursor Y is the center of the glyph; the rendered line extends
    // halfLine above and below it, so pad the bounds check accordingly.
    let newOffset = currentOffset
    if (caretPosition + halfLine > areaTop) {
      newOffset = currentOffset - lineHeight
    } else if (caretPosition - halfLine < areaBottom) {
      newOffset = currentOffset + lineHeight
    } else {
      return false
    }

    this.textObjectScreenTransform.offsets.top = Math.max(0, Math.min(maxOffset, newOffset))
    this.textManipulationModule.updateCursorPositions()
    return true
  }

  protected flushBatchedUpdates(): void {
    super.flushBatchedUpdates()
    const overflowModeDirty = this._overflowModeDirty
    const overflowDirty = this._overflowDirty
    const alignmentDirty = this._alignmentDirty
    this._overflowModeDirty = false
    this._overflowDirty = false
    this._alignmentDirty = false

    if (overflowModeDirty) {
      this.applyOverflow()
      this.updateMaskingComponent()
    }
    if (overflowModeDirty || overflowDirty) {
      this.handleOverflow()
    }
    if (alignmentDirty) {
      switch (this._horizontalTextAlignment) {
        case TextAlignment.Left:
          this.textComponent.horizontalAlignment = HorizontalAlignment.Left
          break
        case TextAlignment.Center:
          this.textComponent.horizontalAlignment = HorizontalAlignment.Center
          break
        case TextAlignment.Right:
          this.textComponent.horizontalAlignment = HorizontalAlignment.Right
          break
      }
    }
  }

  protected markSizeDirty(): void {
    super.markSizeDirty()
    this.markOverflowDirty()
  }

  protected markTextDirty(): void {
    super.markTextDirty()
    this.markOverflowDirty()
  }

  private markOverflowModeDirty(): void {
    if (!this._initialized) return
    this._overflowModeDirty = true
    this.batchUpdate()
  }

  private markOverflowDirty(): void {
    if (!this._initialized) return
    this._overflowDirty = true
    this.batchUpdate()
  }

  private markAlignmentDirty(): void {
    if (!this._initialized) return
    this._alignmentDirty = true
    this.batchUpdate()
  }

  protected updateSize() {
    this.textComponent.size = this.computeFontSize()
    this.textParentScreenTransform.anchors.top = this._size.y * 0.5 - this.visual.borderSize - this._paddingTop
    this.textParentScreenTransform.anchors.bottom = this._size.y * -0.5 + this.visual.borderSize + this._paddingBottom
    this.textParentScreenTransform.anchors.left = this._size.x * -0.5 + this.visual.borderSize + this._paddingLeft
    this.textParentScreenTransform.anchors.right = this._size.x * 0.5 - this.visual.borderSize - this._paddingRight

    if (this.textManipulationModule) {
      this.textManipulationModule.updateBoundingBox()
      this.textManipulationModule.updateCursorPositions()
    }
  }

  private updateMaskingComponent(): void {
    if (this._overflowMode === OverflowMode.Scroll && !this.maskingComponent) {
      this.maskingComponent = this.textParent.createComponent("MaskingComponent")
      this.managedComponents.add(this.maskingComponent)
    } else if (this._overflowMode !== OverflowMode.Scroll && this.maskingComponent) {
      this.managedComponents.delete(this.maskingComponent)
      this.maskingComponent.destroy()
      this.maskingComponent = null
    }
  }
}
