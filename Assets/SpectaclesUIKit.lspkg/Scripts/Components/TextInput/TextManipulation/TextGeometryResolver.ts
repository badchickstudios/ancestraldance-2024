import {PublicApi} from "SpectaclesInteractionKit.lspkg/Utils/Event"

/**
 * A utility class responsible for mapping between 3D space and 2D text cursor positions.
 *
 * TextGeometryResolver translates world coordinates, local coordinates, and drag deltas into
 * logical text caret indices. It uses the visual cursor positions provided by the Lens Studio
 * Text component to perform accurate geometric lookups for interactions like tapping to place
 * the caret or dragging to select text.
 */
export class TextGeometryResolver {
  private readonly textTransform: Transform
  private readonly textScreenTransform: ScreenTransform | null
  private cursorPositions: CursorPosition[] | null = null

  private readonly _offsetVector: vec3 = vec3.zero()
  private readonly _targetLocalPos: vec3 = vec3.zero()
  private readonly _startLocalForIndex = {x: 0, y: 0}

  private unsubscribes: (() => void)[] = []

  public constructor(
    private readonly textComponent: Text,
    onCursorPositionsUpdated: PublicApi<CursorPosition[]> | null = null
  ) {
    const textObject = this.textComponent.getSceneObject()
    this.textTransform = textObject.getTransform()
    this.textScreenTransform = textObject.getComponent("ScreenTransform")
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
   * Checks if a caret index is at the beginning or end of a line.
   * Used to allow clearing highlights by touching line boundaries.
   * @param index - The caret index to check
   * @returns True if the index is at the start or end of its line
   */
  public isAtLineBoundary(index: number): boolean {
    if (
      !this.cursorPositions ||
      this.cursorPositions.length === 0 ||
      index < 0 ||
      index >= this.cursorPositions.length
    ) {
      return false
    }

    const targetPos = this.cursorPositions[index]
    if (!targetPos || !targetPos.position) {
      return false
    }

    const targetY = targetPos.position.y
    const EPSILON = 0.001

    let isMin = true
    let isMax = true

    // Scan backwards - stop as soon as we find a character on the same line
    for (let i = index - 1; i >= 0; i--) {
      const pos = this.cursorPositions[i]
      if (pos && pos.position && Math.abs(pos.position.y - targetY) < EPSILON) {
        isMin = false
        break
      } else if (pos && pos.position) {
        break // Reached a different line
      }
    }

    // Scan forwards - stop as soon as we find a character on the same line
    for (let i = index + 1; i < this.cursorPositions.length; i++) {
      const pos = this.cursorPositions[i]
      if (pos && pos.position && Math.abs(pos.position.y - targetY) < EPSILON) {
        isMax = false
        break
      } else if (pos && pos.position) {
        break // Reached a different line
      }
    }

    return isMin || isMax
  }

  /**
   * Retrieves the local 3D position of a specific caret index.
   *
   * @param index - The caret index to look up
   * @returns The local position of the caret, or null if the cursor positions are unavailable
   */
  public getLocalPositionForIndex(index: number): vec3 | null {
    if (!this.cursorPositions || this.cursorPositions.length === 0) return null
    const validIndex = Math.max(0, Math.min(index, this.cursorPositions.length - 1))
    const pos = this.cursorPositions[validIndex]?.position
    if (!pos) return null
    return new vec3(pos.x, pos.y - this.textOffset, 0)
  }

  /**
   * Calculates the nearest caret index from a world space position.
   * @param worldPos - World space position to convert
   * @returns Index of nearest caret position (0 to text.length)
   */
  public getIndexFromWorldPosition(worldPos: vec3): number {
    this._offsetVector.y = this.textOffset
    const localPos = this.textTransform.getInvertedWorldTransform().multiplyPoint(worldPos).add(this._offsetVector)

    return this.getIndexFromLocalPosition(localPos)
  }

  /**
   * Calculates the target caret index during a drag operation.
   *
   * Converts the drag delta into local space to ensure text selection accurately follows
   * the interactor, regardless of the text component's rotation or scale.
   *
   * @param dragStart - The initial world space position where the drag started
   * @param currentPos - The current world space position of the drag
   * @param sensitivity - Multiplier for the drag delta to adjust responsiveness
   * @returns The nearest caret index to the dragged position
   */
  public getIndexFromDragPosition(dragStart: vec3, currentPos: vec3, sensitivity: vec2 = vec2.one()): number {
    if (!this.cursorPositions || this.cursorPositions.length === 0) {
      return 0
    }

    // Convert drag positions to local space to calculate deltas.
    // Scroll offset cancels in the delta since both points are transformed the same way.
    const invertedTransform = this.textTransform.getInvertedWorldTransform()
    const startLocal = invertedTransform.multiplyPoint(dragStart)
    const currLocal = invertedTransform.multiplyPoint(currentPos)

    // Calculate start caret index without calling getIndexFromWorldPosition to avoid redundant invertedTransform calculation
    this._startLocalForIndex.x = startLocal.x
    this._startLocalForIndex.y = startLocal.y + this.textOffset
    const startCaretIndex = this.getIndexFromLocalPosition(this._startLocalForIndex)

    // Get the start caret position in local space
    const validIndex = Math.min(startCaretIndex, this.cursorPositions.length - 1)
    const startCaretPos = this.cursorPositions[validIndex]

    if (!startCaretPos?.position) {
      return startCaretIndex
    }

    const deltaX = currLocal.x - startLocal.x
    const deltaY = currLocal.y - startLocal.y

    // Apply sensitivity to deltas
    const scaledDeltaX = deltaX * sensitivity.x
    const scaledDeltaY = deltaY * sensitivity.y

    // targetLocalPos is in cursor-position space (raw, no scroll offset).
    this._targetLocalPos.x = startCaretPos.position.x + scaledDeltaX
    this._targetLocalPos.y = startCaretPos.position.y + scaledDeltaY
    this._targetLocalPos.z = 0

    // Find the nearest cursor position to the transformed position
    const nearestIndex = this.getIndexFromLocalPosition(this._targetLocalPos)
    return nearestIndex
  }

  private getIndexFromLocalPosition(localPos: {x: number; y: number}): number {
    if (!this.cursorPositions || this.cursorPositions.length === 0) {
      return 0
    }

    let nearest = 0
    let minDistSq = Infinity

    for (let i = 0; i < this.cursorPositions.length; i++) {
      const cursorData = this.cursorPositions[i]
      if (!cursorData || !cursorData.position) continue

      const pos = cursorData.position

      // Calculate distance manually to be safe
      const dy = localPos.y - pos.y
      const dySq = dy * dy

      if (dySq >= minDistSq) continue

      const dx = localPos.x - pos.x
      const distSq = dx * dx + dySq

      if (distSq < minDistSq) {
        minDistSq = distSq
        nearest = i
      }
    }
    return nearest
  }

  private get textOffset(): number {
    return (this.textScreenTransform?.offsets?.top ?? 0) / 2
  }
}
