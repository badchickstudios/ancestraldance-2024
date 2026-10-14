import {PublicApi} from "SpectaclesInteractionKit.lspkg/Utils/Event"
import {
  getCursorIndexFromUtf16Index,
  getUtf16IndexFromCursorIndex,
  isSeparator
} from "../../../../Scripts/Utility/TextManipulationUtils"

/**
 * Manages text highlight state and word detection for text input fields.
 * Handles highlight ranges, word boundary detection, and highlight clearing.
 */
export class TextHighlightTracker {
  private _isHighlighted: boolean = false
  private highlightStartIndex: number = -1
  private highlightEndIndex: number = -1

  private cursorPositions: CursorPosition[] | null = null

  private unsubscribes: (() => void)[] = []

  public constructor(
    private readonly textComponent: Text,
    onCursorPositionsUpdated: PublicApi<CursorPosition[]> | null = null
  ) {
    if (onCursorPositionsUpdated) {
      this.unsubscribes.push(
        onCursorPositionsUpdated.add((cursorPositions: CursorPosition[]) => {
          this.cursorPositions = cursorPositions
        })
      )
    }
  }

  public destroy() {
    this.unsubscribes.forEach((unsub) => unsub())
    this.unsubscribes = []
  }

  /**
   * Gets the word boundaries at the given index without modifying highlight state.
   * @param cursorIndex - Cursor position index to find word at
   * @returns Word range {cursorStart, cursorEnd} of the cursor positions or null if index is on a separator
   */
  public getWordAt(cursorIndex: number): {cursorStart: number; cursorEnd: number} | null {
    const text = this.textComponent.text
    const cursorPositions = this.cursorPositions
    if (!text || text.length === 0 || !cursorPositions || cursorPositions.length === 0) return null

    const utf16Index = getUtf16IndexFromCursorIndex(cursorIndex, cursorPositions, text)

    if (utf16Index === undefined) return null

    const charIndex = utf16Index - 1 // The character preceding the caret

    if (charIndex < -1 || charIndex >= text.length) return null

    // The caret sits between text[charIndex] and text[charIndex + 1].
    // Anchor to whichever adjacent character is a word character,
    // preferring the left side (the character just typed).
    // If the cursor is at the start of a visual line wrap, we prefer the right side.
    const preferRight = cursorPositions[cursorIndex].index === 0
    let anchorIndex: number

    if (preferRight) {
      if (charIndex + 1 < text.length && !isSeparator(text[charIndex + 1])) {
        anchorIndex = charIndex + 1
      } else if (charIndex >= 0 && !isSeparator(text[charIndex])) {
        anchorIndex = charIndex
      } else {
        return null
      }
    } else {
      if (charIndex >= 0 && !isSeparator(text[charIndex])) {
        anchorIndex = charIndex
      } else if (charIndex + 1 < text.length && !isSeparator(text[charIndex + 1])) {
        anchorIndex = charIndex + 1
      } else {
        return null
      }
    }

    // Find word boundaries in char-index space
    let start = anchorIndex
    while (start > 0 && !isSeparator(text[start - 1])) start--

    let end = anchorIndex
    while (end < text.length - 1 && !isSeparator(text[end + 1])) end++

    const cursorForStart = getCursorIndexFromUtf16Index(start, cursorPositions, text, true)
    const cursorForEnd = getCursorIndexFromUtf16Index(end + 1, cursorPositions, text, false)
    if (cursorForStart === undefined || cursorForEnd === undefined) return null

    return {cursorStart: cursorForStart, cursorEnd: cursorForEnd}
  }

  /**
   * Highlights the word at the given index.
   * @param cursorIndex - Cursor position index to find word at
   */
  public updateHighlightByCursorIndex(cursorIndex: number): void {
    const wordRange = this.getWordAt(cursorIndex)
    if (!wordRange) return

    this._isHighlighted = true
    this.highlightStartIndex = wordRange.cursorStart
    this.highlightEndIndex = wordRange.cursorEnd
  }

  /**
   * Updates the highlight range.
   * @param start - Start index of highlight
   * @param end - End index of highlight
   */
  public updateHighlightByRange(start: number, end: number): void {
    this._isHighlighted = true
    this.highlightStartIndex = start
    this.highlightEndIndex = end
  }

  /**
   * Clears the current highlight.
   */
  public clearHighlight(): void {
    this._isHighlighted = false
    this.highlightStartIndex = -1
    this.highlightEndIndex = -1
  }

  /**
   * Gets the current highlight range.
   * @returns Highlight range {start, end} or null if no highlight
   */
  public getHighlight(): {cursorStart: number; cursorEnd: number} | null {
    if (!this._isHighlighted || this.highlightStartIndex === -1) {
      return null
    }
    return {
      cursorStart: this.highlightStartIndex,
      cursorEnd: this.highlightEndIndex
    }
  }

  /**
   * Gets whether there is currently a highlight.
   */
  public get isHighlighted(): boolean {
    return this._isHighlighted
  }

  /**
   * Gets the start index of the highlight.
   */
  public get startCursorIndex(): number {
    return this.highlightStartIndex
  }

  /**
   * Gets the end index of the highlight.
   */
  public get endCursorIndex(): number {
    return this.highlightEndIndex
  }
}
