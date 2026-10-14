import {Interactable} from "SpectaclesInteractionKit.lspkg/Components/Interaction/Interactable/Interactable"
import {InteractorCursor} from "SpectaclesInteractionKit.lspkg/Components/Interaction/InteractorCursor/InteractorCursor"
import {Interactor} from "SpectaclesInteractionKit.lspkg/Core/Interactor/Interactor"
import {DragInteractorEvent, InteractorEvent} from "SpectaclesInteractionKit.lspkg/Core/Interactor/InteractorEvent"
import {CursorControllerProvider} from "SpectaclesInteractionKit.lspkg/Providers/CursorControllerProvider/CursorControllerProvider"
import Event, {PublicApi} from "SpectaclesInteractionKit.lspkg/Utils/Event"
import ReplayEvent from "SpectaclesInteractionKit.lspkg/Utils/ReplayEvent"
import {
  getCursorIndexFromUtf16Index,
  getUtf16IndexFromCursorIndex,
  isAtLineEnd,
  isAtLineStart,
  trimLinesWithCaretAdjustment
} from "../../../../Scripts/Utility/TextManipulationUtils"
import {TextGeometryResolver} from "./TextGeometryResolver"
import {TextHighlightTracker} from "./TextHighlightTracker"
import {CaretRenderer} from "./Visuals/CaretRenderer"
import {GrabHandle, HandleDragUpdateEvent} from "./Visuals/GrabHandle"
import {HighlightRenderer} from "./Visuals/HighlightRenderer"

export const ESTIMATED_HEIGHT_FACTOR = 0.03

type InteractorEventSubscription = {
  add(callback: (event: InteractorEvent) => void): () => void
}

type InteractableWithSecondaryTrigger = Interactable & {
  onSecondaryTriggerStart?: InteractorEventSubscription
}

export class TextManipulationModule {
  private readonly geometryResolver: TextGeometryResolver
  private readonly caretRenderer: CaretRenderer
  private readonly textHighlightTracker: TextHighlightTracker
  private readonly startHandle: GrabHandle
  private readonly endHandle: GrabHandle
  private readonly highlightRenderer: HighlightRenderer

  private _boundingBox: Rect | null = null
  private _cursorPositions: CursorPosition[] | null = null

  private isLineHeightDirty: boolean = true
  private _lineHeight: number = 0

  private dragStartPosition: vec3 | null = null
  private _caretIndex: number = 0

  private isEditing: boolean = false
  private isTouchingHighlight: boolean = false

  private currentInteractorCursor: InteractorCursor | null = null

  private readonly _batchUpdateEvent: SceneEvent
  private isFlushingBatchedUpdates: boolean = false
  private _caretDirty: boolean = false
  private _highlightDirty: boolean = false
  private _lastHighlightText: string = ""
  private _textDirty: boolean = false
  private _text: string = ""
  private _caretVisibilityDirty: boolean = false
  private _isCaretVisible: boolean = false
  private _caretCharIndex: number | null = null
  private lastKnownCaretCharIndex: number = 0
  private lastKnownHighlightStartCharIndex: number | null = null
  private lastKnownHighlightEndCharIndex: number | null = null

  private readonly CARET_DRAG_SENSITIVITY: vec2 = new vec2(1, 1.3)

  private unsubscribes: (() => void)[] = []

  private readonly onCursorPositionsUpdatedEvent: ReplayEvent<CursorPosition[]> = new ReplayEvent<CursorPosition[]>()
  public readonly onCursorPositionsUpdated = this.onCursorPositionsUpdatedEvent.publicApi()
  private readonly onTextBoundingBoxUpdatedEvent: ReplayEvent<Rect> = new ReplayEvent<Rect>()
  public readonly onTextBoundingBoxUpdated = this.onTextBoundingBoxUpdatedEvent.publicApi()

  private readonly onCaretIndexChangedEvent: Event<number> = new Event<number>()
  public readonly onCaretIndexChanged = this.onCaretIndexChangedEvent.publicApi()
  private readonly onHighlightUpdatedEvent: Event<string> = new Event<string>()
  public readonly onHighlightUpdated = this.onHighlightUpdatedEvent.publicApi()

  // Internal events
  private readonly onCaretDraggedEvent: Event<number> = new Event<number>()
  public readonly onCaretDragged = this.onCaretDraggedEvent.publicApi()
  private readonly dragEventPayload: {type: "start" | "end"; index: number} = {type: "start", index: 0}
  private readonly onHighlightHandleDraggedEvent: Event<{type: "start" | "end"; index: number}> = new Event<{
    type: "start" | "end"
    index: number
  }>()
  public readonly onHighlightHandleDragged = this.onHighlightHandleDraggedEvent.publicApi()

  // --- Constructor/Destructor ---

  public constructor(
    private readonly textComponent: Text,
    private readonly interactable: Interactable,
    caretMaterial: Material,
    caretDragMaterial: Material,
    highlightMaterial: Material,
    onEditModeChanged: PublicApi<boolean>,
    onTextChanged: PublicApi<string>,
    updateEvent: UpdateEvent,
    lateUpdateEvent: SceneEvent
  ) {
    this._batchUpdateEvent = lateUpdateEvent
    this._batchUpdateEvent.enabled = false
    this._batchUpdateEvent.bind(() => this.flushBatchedUpdates())
    this.geometryResolver = new TextGeometryResolver(this.textComponent, this.onCursorPositionsUpdated)
    this.caretRenderer = new CaretRenderer(
      this.textComponent,
      caretMaterial,
      caretDragMaterial,
      updateEvent,
      this.onCursorPositionsUpdated
    )
    this.textHighlightTracker = new TextHighlightTracker(this.textComponent, this.onCursorPositionsUpdated)

    const renderOrder = textComponent.getRenderOrder()
    const parent = textComponent.getSceneObject()
    const estimatedLineHeight = textComponent.size * ESTIMATED_HEIGHT_FACTOR

    this.startHandle = new GrabHandle(parent, highlightMaterial, renderOrder, estimatedLineHeight, "start")

    this.endHandle = new GrabHandle(parent, highlightMaterial, renderOrder, estimatedLineHeight, "end")

    this.highlightRenderer = new HighlightRenderer(this.textComponent, highlightMaterial, this.onCursorPositionsUpdated)

    this.unsubscribes.push(
      onEditModeChanged.add((isEditing: boolean) => {
        this.isEditing = isEditing
        if (isEditing) {
          this.caretIndex = this.cursorPositions ? this.cursorPositions.length - 1 : 0
          this.showCaret()
        } else {
          this.hideCaret()
          this.clearHighlight()
        }
      })
    )

    this.unsubscribes.push(
      onTextChanged.add((newText: string) => {
        const lenDelta = newText.length - this._text.length
        this._text = newText

        if (this.textHighlightTracker.isHighlighted) {
          let targetCharIndex: number
          if (this.lastKnownHighlightStartCharIndex !== null && this.lastKnownHighlightEndCharIndex !== null) {
            const removedLength = this.lastKnownHighlightEndCharIndex - this.lastKnownHighlightStartCharIndex
            const insertedLength = lenDelta + removedLength
            targetCharIndex = this.lastKnownHighlightStartCharIndex + insertedLength
          } else {
            targetCharIndex = Math.max(0, this.lastKnownCaretCharIndex + lenDelta)
          }

          this.clearHighlight()
          this.showCaret()
          this._caretCharIndex = targetCharIndex
          this.batchUpdate()
        } else {
          if (this.isEditing) {
            this._caretCharIndex = Math.max(0, this.lastKnownCaretCharIndex + lenDelta)
            this.batchUpdate()
          } else {
            this._caretCharIndex = newText.length
            this.batchUpdate()
          }
        }
      })
    )

    this.unsubscribes.push(
      this.interactable.onTriggerStart.add((event) => {
        if (event.target !== this.interactable) return
        if (this.isEditing) {
          this.handleTriggerDown(event)
        }
      })
    )
    this.unsubscribes.push(
      this.interactable.onDragStart.add((event) => {
        if (event.target !== this.interactable) return
        if (this.isEditing && !this.textHighlightTracker.isHighlighted) {
          this.hideInteractorCursor(event.interactor)
          this.handleDragStart(event)
        }
      })
    )
    this.unsubscribes.push(
      this.interactable.onDragUpdate.add((event) => {
        if (event.target !== this.interactable) return
        if (this.isEditing && !this.textHighlightTracker.isHighlighted) {
          this.handleDragUpdate(event)
        }
      })
    )
    this.unsubscribes.push(
      this.interactable.onDragEnd.add((event) => {
        if (event.target !== this.interactable) return
        if (this.isEditing) {
          this.handleDragEnd()
          this.restoreInteractorCursor()
        }
      })
    )
    this.unsubscribes.push(
      this.subscribeSecondaryTriggerStart((event) => {
        if (event.target !== this.interactable) return
        if (this.dragStartPosition) return
        if (this.isEditing) {
          this.handleLongPress()
        }
      })
    )

    this.setupHighlightHandlesDragEvents()

    this.updateBoundingBox()
    this.updateCursorPositions()
    this._text = this.textComponent.text
  }

  private subscribeSecondaryTriggerStart(callback: (event: InteractorEvent) => void): () => void {
    const interactableWithSecondaryTrigger = this.interactable as InteractableWithSecondaryTrigger

    if (interactableWithSecondaryTrigger.onSecondaryTriggerStart) {
      return interactableWithSecondaryTrigger.onSecondaryTriggerStart.add(callback)
    }

    print(
      "TextManipulationModule: onSecondaryTriggerStart is not available in this build yet. TODO: enable long-press text selection once the internal SIK event is wired in."
    )
    return () => {}
  }

  public destroy() {
    this.unsubscribes.forEach((unsub) => unsub())
    this.unsubscribes = []

    this.restoreInteractorCursor()

    this._batchUpdateEvent.enabled = false
    this.geometryResolver.destroy()
    this.textHighlightTracker.destroy()
    this.caretRenderer.destroy()
    this.startHandle.destroy()
    this.endHandle.destroy()
    this.highlightRenderer.destroy()
  }

  public get lineHeight(): number {
    if (!this.isLineHeightDirty) {
      return this._lineHeight
    }
    if (!this.cursorPositions || this.cursorPositions.length === 0) return 0

    let firstY: number | undefined = undefined
    let i = 0
    for (; i < this.cursorPositions.length; i++) {
      if (this.cursorPositions[i]?.position) {
        firstY = this.cursorPositions[i].position!.y
        break
      }
    }

    if (firstY !== undefined) {
      for (i++; i < this.cursorPositions.length; i++) {
        const cp = this.cursorPositions[i]
        if (cp?.position) {
          if (Math.abs(cp.position.y - firstY) > 0.1) {
            this._lineHeight = Math.abs(firstY - cp.position.y)
            this.isLineHeightDirty = false
            return this._lineHeight
          }
        }
      }
    }

    this._lineHeight = this.boundingBox?.getSize().y || 0
    this.isLineHeightDirty = false
    return this._lineHeight
  }

  public get caretIndex(): number {
    return this._caretIndex
  }

  private set caretIndex(index: number) {
    const newCaretIndex = this.getClampedCaretIndex(index)
    if (this._caretIndex !== newCaretIndex) {
      this._caretIndex = newCaretIndex
      this.markCaretDirty()
    }
  }

  public get caretCharIndex(): number {
    const charIndex = getUtf16IndexFromCursorIndex(this.caretIndex, this.cursorPositions, this._text)
    if (charIndex === undefined) return 0
    return charIndex
  }

  public get isHighlighted(): boolean {
    return this.textHighlightTracker.isHighlighted
  }

  // For Copying
  public getHighlightedText(): string {
    if (!this.textHighlightTracker.isHighlighted) return ""
    const charStartIndex = getUtf16IndexFromCursorIndex(
      this.textHighlightTracker.startCursorIndex,
      this.cursorPositions,
      this._text
    )
    const charEndIndex = getUtf16IndexFromCursorIndex(
      this.textHighlightTracker.endCursorIndex,
      this.cursorPositions,
      this._text
    )
    if (charStartIndex === undefined || charEndIndex === undefined) {
      return ""
    }
    return this._text.substring(charStartIndex, charEndIndex)
  }

  // For Cutting
  public removeHighlightedText(): boolean {
    return this.replaceHighlightedText("")
  }

  // For Pasting
  public replaceHighlightedText(textToPaste: string): boolean {
    let newText: string
    let newCaretCharPos: number

    if (this.cursorPositions && this.cursorPositions.length > 0) {
      if (this.textHighlightTracker.isHighlighted) {
        // Replace highlight with pasted text
        const range = this.textHighlightTracker.getHighlight()
        if (range) {
          const charStartIndex = getUtf16IndexFromCursorIndex(range.cursorStart, this.cursorPositions, this._text)
          const charEndIndex = getUtf16IndexFromCursorIndex(range.cursorEnd, this.cursorPositions, this._text)

          if (charStartIndex === undefined || charEndIndex === undefined) return false

          newText = this._text.slice(0, charStartIndex) + textToPaste + this._text.slice(charEndIndex)
          newCaretCharPos = charStartIndex + textToPaste.length
          this.clearHighlight()
        } else {
          return false
        }
      } else {
        // Insert at caret position
        const charIndex = getUtf16IndexFromCursorIndex(this._caretIndex, this.cursorPositions, this._text)
        if (charIndex === undefined) return false

        newText = this._text.slice(0, charIndex) + textToPaste + this._text.slice(charIndex)
        newCaretCharPos = charIndex + textToPaste.length
      }
    } else {
      newText = textToPaste
      newCaretCharPos = textToPaste.length
    }

    // Trim whitespace from each line (Text component doesn't support cursor positions for them)
    const trimmed = trimLinesWithCaretAdjustment(newText, newCaretCharPos)
    this.updateText(trimmed.text)
    this._caretCharIndex = trimmed.charPos
    if (this.isEditing) {
      this.showCaret()
    }

    return true
  }

  public updateBoundingBox() {
    this.boundingBox = this.textComponent.getBoundingBox()
  }

  public updateCursorPositions() {
    this.lastKnownCaretCharIndex = this.caretCharIndex
    if (this.textHighlightTracker.isHighlighted) {
      const range = this.textHighlightTracker.getHighlight()
      if (range && this._cursorPositions) {
        const startCharIndex = getUtf16IndexFromCursorIndex(range.cursorStart, this._cursorPositions, this._text)
        this.lastKnownHighlightStartCharIndex = startCharIndex !== undefined ? startCharIndex : null

        const endCharIndex = getUtf16IndexFromCursorIndex(range.cursorEnd, this._cursorPositions, this._text)
        this.lastKnownHighlightEndCharIndex = endCharIndex !== undefined ? endCharIndex : null
      } else {
        this.lastKnownHighlightStartCharIndex = null
        this.lastKnownHighlightEndCharIndex = null
      }
    } else {
      this.lastKnownHighlightStartCharIndex = null
      this.lastKnownHighlightEndCharIndex = null
    }
    this.cursorPositions = this.textComponent.getCursorPositions()
  }

  public get boundingBox(): Rect | null {
    return this._boundingBox
  }

  private set boundingBox(textBounds: Rect) {
    this._boundingBox = textBounds
    this.onTextBoundingBoxUpdatedEvent.invoke(textBounds)

    this.isLineHeightDirty = true
    if (this.textHighlightTracker.isHighlighted) {
      this.markHighlightDirty()
    }
  }

  public get cursorPositions(): CursorPosition[] | null {
    return this._cursorPositions
  }

  private set cursorPositions(cursorPositions: CursorPosition[]) {
    this._cursorPositions = cursorPositions
    this.onCursorPositionsUpdatedEvent.invoke(cursorPositions)

    this.isLineHeightDirty = true

    if (this.textHighlightTracker.isHighlighted) {
      this.markHighlightDirty()
    } else {
      this.markCaretDirty()
    }
  }

  private showCaret() {
    this._isCaretVisible = true
    this._caretVisibilityDirty = true
    this.batchUpdate()
  }

  private hideCaret() {
    this._isCaretVisible = false
    this._caretVisibilityDirty = true
    this.batchUpdate()
  }

  private handleTriggerDown(event: InteractorEvent): void {
    if (!this.dragStartPosition) {
      const interactor = event.interactor
      if (interactor && interactor.planecastPoint) {
        // Check highlight touch
        if (this.textHighlightTracker.isHighlighted) {
          const highlightIndex = this.geometryResolver.getIndexFromWorldPosition(interactor.planecastPoint)
          this.isTouchingHighlight =
            highlightIndex >= this.textHighlightTracker.startCursorIndex &&
            highlightIndex <= this.textHighlightTracker.endCursorIndex &&
            !this.geometryResolver.isAtLineBoundary(highlightIndex) // Edge case: allow clearing highlight by touching line boundaries (beginning/end of any line)

          if (this.isTouchingHighlight) {
            print(`Touching highlight - potential menu trigger`)
            // TODO
            //  this.openContextMenu(interactor.planecastPoint, interactor)
            return
          }

          this.clearHighlight()
        }

        if (this._text.length > 0) {
          this.caretIndex = this.geometryResolver.getIndexFromWorldPosition(interactor.planecastPoint)
          this.showCaret()
        }
      }
    }
  }

  private handleDragStart(event: DragInteractorEvent): void {
    this.dragStartPosition = event.interactor.planecastPoint
    this.caretRenderer.setDragState(true)
    this.caretRenderer.resetBlink()
    this.caretRenderer.pauseBlink()
  }

  private handleDragUpdate(event: DragInteractorEvent): void {
    const interactor = event.interactor
    if (!interactor || !interactor.planecastPoint || !this.dragStartPosition) return
    if (this._text.length > 0) {
      this.caretIndex = this.geometryResolver.getIndexFromDragPosition(
        this.dragStartPosition,
        interactor.planecastPoint,
        this.CARET_DRAG_SENSITIVITY
      )
      this.onCaretDraggedEvent.invoke(this.caretIndex)
    }
  }

  private handleDragEnd(): void {
    this.dragStartPosition = null
    this.caretRenderer.setDragState(false)
    this.caretRenderer.resumeBlink()
  }

  private handleLongPress() {
    this.textHighlightTracker.updateHighlightByCursorIndex(this.caretIndex)
    const wordRange = this.textHighlightTracker.getHighlight()
    if (wordRange) {
      this.hideCaret()
      this.markHighlightDirty()
    }
  }

  private setupHighlightHandlesDragEvents() {
    let startDragAnchorIndex = -1
    let endDragAnchorIndex = -1

    const highlightHandleDragUpdate = (event: HandleDragUpdateEvent, handleType: "start" | "end") => {
      let dragAnchorIndex = handleType === "start" ? startDragAnchorIndex : endDragAnchorIndex

      if (dragAnchorIndex === -1) {
        dragAnchorIndex =
          handleType === "start" ? this.textHighlightTracker.endCursorIndex : this.textHighlightTracker.startCursorIndex

        if (handleType === "start") startDragAnchorIndex = dragAnchorIndex
        else endDragAnchorIndex = dragAnchorIndex
      }

      const newCaretIndex = this.geometryResolver.getIndexFromDragPosition(
        event.dragStartWorldPosition,
        event.dragCurrentWorldPosition
      )
      const targetWord = this.textHighlightTracker.getWordAt(newCaretIndex)

      let newStart: number
      let newEnd: number

      if (newCaretIndex < dragAnchorIndex) {
        newStart = targetWord ? targetWord.cursorStart : newCaretIndex

        let adjustedEnd = dragAnchorIndex
        if (isAtLineStart(adjustedEnd, this.cursorPositions, this._text)) {
          adjustedEnd -= 1
        }
        newEnd = adjustedEnd
      } else {
        let adjustedStart = dragAnchorIndex
        if (isAtLineEnd(adjustedStart, this.cursorPositions, this._text)) {
          adjustedStart += 1
        }
        newStart = adjustedStart

        newEnd = targetWord ? targetWord.cursorEnd : newCaretIndex
      }

      this.textHighlightTracker.updateHighlightByRange(newStart, newEnd)

      const updateIndex = newCaretIndex < dragAnchorIndex ? newStart : newEnd
      const snappedLocalPos = this.geometryResolver.getLocalPositionForIndex(updateIndex)

      if (snappedLocalPos) {
        const handle = handleType === "start" ? this.startHandle : this.endHandle
        handle.updateVisualState(snappedLocalPos, false)
      }

      const range = this.textHighlightTracker.getHighlight()
      if (range) {
        this.highlightRenderer.updateHighlight(range.cursorStart, range.cursorEnd, this.lineHeight)

        this.dragEventPayload.type = handleType
        this.dragEventPayload.index = updateIndex
        this.onHighlightHandleDraggedEvent.invoke(this.dragEventPayload)

        const startCharIndex = getUtf16IndexFromCursorIndex(range.cursorStart, this.cursorPositions, this._text)
        const endCharIndex = getUtf16IndexFromCursorIndex(range.cursorEnd, this.cursorPositions, this._text)

        if (startCharIndex === undefined || endCharIndex === undefined) return

        const newText = this._text.substring(startCharIndex, endCharIndex)
        if (newText !== this._lastHighlightText) {
          this._lastHighlightText = newText
          this.onHighlightUpdatedEvent.invoke(newText)
        }
      }
    }

    this.unsubscribes.push(this.startHandle.onDragUpdate.add((event) => highlightHandleDragUpdate(event, "start")))
    this.unsubscribes.push(this.endHandle.onDragUpdate.add((event) => highlightHandleDragUpdate(event, "end")))

    const highlightHandleDragEnd = (handleType: "start" | "end") => {
      if (handleType === "start") startDragAnchorIndex = -1
      else endDragAnchorIndex = -1

      this.updateHighlightVisuals(handleType)
    }

    this.unsubscribes.push(
      this.startHandle.onDragEnd.add(() => {
        highlightHandleDragEnd("start")
      })
    )

    this.unsubscribes.push(
      this.endHandle.onDragEnd.add(() => {
        highlightHandleDragEnd("end")
      })
    )
  }

  private getClampedCaretIndex(index: number): number {
    if (!this.cursorPositions || this.cursorPositions.length === 0) return 0
    return Math.max(0, Math.min(index, this.cursorPositions.length - 1))
  }

  private markCaretDirty(): void {
    this._caretDirty = true
    this.batchUpdate()
  }

  private markHighlightDirty(): void {
    this._highlightDirty = true
    this.batchUpdate()
  }

  private batchUpdate(): void {
    if (!this.isFlushingBatchedUpdates) {
      this._batchUpdateEvent.enabled = true
    }
  }

  private flushBatchedUpdates(): void {
    this.isFlushingBatchedUpdates = true
    this._batchUpdateEvent.enabled = false

    // 1. Process text updates first (to ensure cursor positions are accurate)
    if (this._textDirty) {
      this._textDirty = false
      this.textComponent.text = this._text
      this.updateCursorPositions()
      this.updateBoundingBox()
    }

    // 2. Compute pending caret char index after cursor positions updated
    if (this._caretCharIndex !== null) {
      const newCaretIndex = getCursorIndexFromUtf16Index(this._caretCharIndex, this.cursorPositions, this._text, false)
      if (newCaretIndex !== undefined) {
        // Clamp the index just like the setter does!
        const clampedIndex = this.getClampedCaretIndex(newCaretIndex)
        if (this._caretIndex !== clampedIndex) {
          this._caretIndex = clampedIndex
          // Mark dirty so the position updates visually in this batch
          this._caretDirty = true
        }
      }
      this._caretCharIndex = null
    }

    const caretDirty = this._caretDirty
    const highlightDirty = this._highlightDirty
    this._caretDirty = false
    this._highlightDirty = false

    if (caretDirty) {
      this.updateCaretPosition(this.caretIndex)
    }

    if (this._caretVisibilityDirty) {
      this._caretVisibilityDirty = false
      if (this._isCaretVisible) {
        this.caretRenderer.show()
      } else {
        this.caretRenderer.hide()
      }
    }

    if (highlightDirty) {
      this.updateHighlightVisuals()
    }

    this.isFlushingBatchedUpdates = false
  }

  private updateText(text: string) {
    this._text = text
    this._textDirty = true
    this.batchUpdate()
  }

  private updateCaretPosition(index: number) {
    this.caretRenderer.updatePosition(index)
    this.caretRenderer.resetBlink()
    this.onCaretIndexChangedEvent.invoke(index)
  }

  private updateHandles(startIndex: number, endIndex: number, releasingHandle?: "start" | "end" | null): void {
    if (startIndex === endIndex) {
      this.startHandle.hide()
      this.endHandle.hide()
      return
    }

    const startPos = this.geometryResolver.getLocalPositionForIndex(startIndex)
    const endPos = this.geometryResolver.getLocalPositionForIndex(endIndex)

    if (!startPos || !endPos) {
      this.startHandle.hide()
      this.endHandle.hide()
      return
    }

    const lineHeight = this.lineHeight

    this.startHandle.lineHeight = lineHeight
    this.startHandle.updateVisualState(startPos, releasingHandle === "start")
    this.startHandle.show()

    this.endHandle.lineHeight = lineHeight
    this.endHandle.updateVisualState(endPos, releasingHandle === "end")
    this.endHandle.show()
  }

  private updateHighlightVisuals(releasingHandle?: "start" | "end" | null) {
    const range = this.textHighlightTracker.isHighlighted ? this.textHighlightTracker.getHighlight() : null
    if (!range) {
      this.highlightRenderer.hide()
      this.startHandle.hide()
      this.endHandle.hide()
      if (this._lastHighlightText !== "") {
        this._lastHighlightText = ""
        this.onHighlightUpdatedEvent.invoke("")
      }
      return
    }

    this.highlightRenderer.updateHighlight(range.cursorStart, range.cursorEnd, this.lineHeight)
    this.updateHandles(range.cursorStart, range.cursorEnd, releasingHandle)

    const startCharIndex = getUtf16IndexFromCursorIndex(range.cursorStart, this.cursorPositions, this._text)
    const endCharIndex = getUtf16IndexFromCursorIndex(range.cursorEnd, this.cursorPositions, this._text)

    if (startCharIndex === undefined || endCharIndex === undefined) return

    const newText = this._text.substring(startCharIndex, endCharIndex)
    if (newText !== this._lastHighlightText) {
      this._lastHighlightText = newText
      this.onHighlightUpdatedEvent.invoke(newText)
    }
  }

  private clearHighlight() {
    if (!this.textHighlightTracker.isHighlighted) return
    this.textHighlightTracker.clearHighlight()
    this.markHighlightDirty()
  }

  /**
   * Hides the interactor cursor during caret dragging.
   * @param interactor - The interactor whose cursor should be hidden
   */
  private hideInteractorCursor(interactor: Interactor): void {
    this.currentInteractorCursor = CursorControllerProvider.getInstance().getCursorByInteractor(interactor)
    if (this.currentInteractorCursor) {
      this.currentInteractorCursor.enabled = false
    }
  }

  private restoreInteractorCursor() {
    if (this.currentInteractorCursor) {
      this.currentInteractorCursor.enabled = true
      this.currentInteractorCursor = null
    }
  }
}
