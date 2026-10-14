import {PublicApi} from "SpectaclesInteractionKit.lspkg/Utils/Event"
import {getUtf16IndexFromCursorIndex} from "../../../../../Scripts/Utility/TextManipulationUtils"

const UNIT_PLANE: RenderMesh = requireAsset("../../../../../Meshes/Unit Plane.mesh") as RenderMesh

// Constants
const HIGHLIGHT_Z_OFFSET = 0.005
const EPSILON = 0.001

/**
 * Represents a rectangle used for highlighting a segment of text.
 */
interface HighlightRect {
  x: number
  y: number
  width: number
}

/**
 * Represents a highlight visual that can be reused from a pool.
 */
interface PooledHighlight {
  sceneObject: SceneObject
  transform: Transform
  active: boolean
}

/**
 * Handles text selection highlight visual rendering.
 * Supports multi-line selections via object pooling.
 */
export class HighlightRenderer {
  private highlightPool: PooledHighlight[] = []
  private readonly rectsPool: HighlightRect[] = []
  private readonly textScreenTransform: ScreenTransform | null = null
  private cursorPositions: CursorPosition[] | null = null

  private readonly _highlightPosition: vec3 = vec3.zero()
  private readonly _highlightScale: vec3 = vec3.one()

  private unsubscribes: (() => void)[] = []

  public constructor(
    private readonly textComponent: Text,
    private readonly highlightMaterial: Material,
    onCursorPositionsUpdated: PublicApi<CursorPosition[]> | null = null
  ) {
    this.textScreenTransform = textComponent.getSceneObject().getComponent("ScreenTransform")

    if (onCursorPositionsUpdated) {
      this.unsubscribes.push(
        onCursorPositionsUpdated.add((cursorPositions: CursorPosition[]) => {
          this.cursorPositions = cursorPositions
        })
      )
    }
  }

  /**
   * Updates the highlight position and size based on selection range.
   * Handles multi-line selections by creating multiple highlight segments.
   *
   * @param startIndex - The start index of the selection
   * @param endIndex - The end index of the selection
   */
  public updateHighlight(startIndex: number, endIndex: number, lineHeight: number): void {
    if (startIndex === endIndex) {
      this.hide()
      return
    }

    if (!this.cursorPositions || this.cursorPositions.length === 0) {
      this.hide()
      return
    }

    const minIndex = Math.min(startIndex, endIndex)
    const maxIndex = Math.max(startIndex, endIndex)
    const maxCursorIndex = this.cursorPositions.length - 1
    const validStart = Math.max(0, Math.min(minIndex, maxCursorIndex))
    const validEnd = Math.max(0, Math.min(maxIndex, maxCursorIndex))

    if (validStart >= validEnd) {
      this.hide()
      return
    }

    // Calculate highlight rectangles
    const numRects = this.calculateSelectionRects(validStart, validEnd)

    // Render rects
    for (let i = 0; i < numRects; i++) {
      const rect = this.rectsPool[i]
      const highlight = this.getHighlightFromPool(i)

      const transform = highlight.transform

      // Rect x is the left edge, we need center for the Unit Plane
      const centerX = rect.x + rect.width / 2

      this._highlightPosition.x = centerX
      this._highlightPosition.y = rect.y - this.textOffset + lineHeight / 4
      this._highlightPosition.z = HIGHLIGHT_Z_OFFSET

      this._highlightScale.x = rect.width
      this._highlightScale.y = lineHeight
      this._highlightScale.z = 1

      transform.setLocalPosition(this._highlightPosition)
      transform.setLocalScale(this._highlightScale)

      if (!highlight.active) {
        highlight.sceneObject.enabled = true
        highlight.active = true
      }
    }

    // Disable unused rects
    for (let i = numRects; i < this.highlightPool.length; i++) {
      const unusedHighlight = this.highlightPool[i]
      if (!unusedHighlight.active) break
      unusedHighlight.sceneObject.enabled = false
      unusedHighlight.active = false
    }
  }

  /**
   * Calculates the geometric rectangles for the selection.
   * Merges contiguous characters on the same line into single rectangles.
   *
   * @param start - The start index of the selection
   * @param end - The end index of the selection
   * @returns The number of active highlight rectangles
   */
  private calculateSelectionRects(start: number, end: number): number {
    const text = this.textComponent.text

    let rectCount = 0

    let currentX = 0
    let currentY = 0
    let currentWidth = 0
    let hasCurrent = false

    for (let i = start; i < end; i++) {
      const pCurr = this.cursorPositions[i]
      const pNext = this.cursorPositions[i + 1]

      if (!pCurr || !pCurr.position) {
        if (hasCurrent) {
          this.saveRectToPool(rectCount++, currentX, currentY, currentWidth)
          hasCurrent = false
        }
        continue
      }

      let charY = pCurr.position.y

      // Calculate width and left X of this character
      let charWidth = 0
      let charLeftX = pCurr.position.x

      if (pNext && pNext.position && Math.abs(pNext.position.y - charY) < EPSILON) {
        // Normal case: width is difference in X
        charWidth = Math.abs(pNext.position.x - pCurr.position.x)
        charLeftX = Math.min(pCurr.position.x, pNext.position.x)
      } else {
        const charIndex = getUtf16IndexFromCursorIndex(i, this.cursorPositions, text)
        const isWrap = pNext && pNext.index === 0
        if (charIndex === undefined || charIndex < 0 || isWrap) {
          charWidth = 0
        } else {
          const charStr = text.charAt(charIndex)
          if (charStr.trim() === "") {
            charWidth = 0
          } else {
            const charBox = this.textComponent.getBoundingBox(charIndex, charIndex + 1)
            charWidth = charBox.getSize().x

            // Update X and Y to the actual character's position on the new line
            charLeftX = charBox.getCenter().x - charWidth / 2
            if (pNext && pNext.position) {
              charY = pNext.position.y
            }
          }
        }
      }

      // Start new rect or merge
      if (!hasCurrent) {
        currentX = charLeftX
        currentY = charY
        currentWidth = charWidth
        hasCurrent = true
      } else {
        // Check if on same line (Y matches)
        if (Math.abs(charY - currentY) < EPSILON) {
          // Check if contiguous. Use Math.min/Math.max to support both LTR and RTL text
          const startX = Math.min(currentX, charLeftX)
          const endX = Math.max(currentX + currentWidth, charLeftX + charWidth)
          currentX = startX
          currentWidth = endX - startX
        } else {
          // New line
          this.saveRectToPool(rectCount++, currentX, currentY, currentWidth)
          currentX = charLeftX
          currentY = charY
          currentWidth = charWidth
        }
      }
    }

    if (hasCurrent) {
      this.saveRectToPool(rectCount++, currentX, currentY, currentWidth)
    }

    return rectCount
  }

  private saveRectToPool(index: number, x: number, y: number, width: number): void {
    const rect = this.rectsPool[index]
    if (!rect) {
      this.rectsPool[index] = {x, y, width}
    } else {
      rect.x = x
      rect.y = y
      rect.width = width
    }
  }

  /**
   * Retrieves a highlight object from the pool, creating a new one if necessary.
   *
   * @param index - The index of the highlight to retrieve
   * @returns The pooled highlight object
   */
  private getHighlightFromPool(index: number): PooledHighlight {
    // Expand pool if needed
    const textSceneObject = this.textComponent.getSceneObject()
    while (this.highlightPool.length <= index) {
      const obj = global.scene.createSceneObject(`Highlight_${this.highlightPool.length}`)
      obj.setParent(textSceneObject)

      const rmv = obj.createComponent("RenderMeshVisual")
      rmv.mesh = UNIT_PLANE
      if (this.highlightMaterial) {
        rmv.mainMaterial = this.highlightMaterial
      }
      rmv.setRenderOrder(this.textComponent.getRenderOrder())

      obj.enabled = false
      this.highlightPool.push({
        sceneObject: obj,
        transform: obj.getTransform(),
        active: false
      })
    }

    return this.highlightPool[index]
  }

  /**
   * Resets all highlight objects in the pool by disabling them.
   */
  private resetPool(): void {
    for (const obj of this.highlightPool) {
      if (obj.active) {
        if (!isNull(obj.sceneObject)) {
          obj.sceneObject.enabled = false
        }
        obj.active = false
      }
    }
  }

  /**
   * Hides the highlight.
   */
  public hide(): void {
    this.resetPool()
  }

  /**
   * Destroys the highlight renderer and cleans up resources.
   */
  public destroy(): void {
    this.unsubscribes.forEach((unsub) => unsub())
    this.unsubscribes = []
    this.hide()
    // Objects attached to parent will be destroyed when parent is destroyed,
    // but if we are destroyed independently, we should clean up pool.
    for (const obj of this.highlightPool) {
      if (!isNull(obj.sceneObject)) {
        obj.sceneObject.destroy()
      }
    }
    this.highlightPool = []
  }

  /**
   * Gets the vertical offset of the text component.
   */
  private get textOffset(): number {
    return (this.textScreenTransform?.offsets?.top ?? 0) / 2
  }
}
