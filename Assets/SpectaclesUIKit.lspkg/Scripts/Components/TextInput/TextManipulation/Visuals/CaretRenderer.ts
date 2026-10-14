import {PublicApi} from "SpectaclesInteractionKit.lspkg/Utils/Event"
import {ESTIMATED_HEIGHT_FACTOR} from "../TextManipulationModule"

const UNIT_PLANE: RenderMesh = requireAsset("../../../../../Meshes/Unit Plane.mesh") as RenderMesh

// Constants
const CARET_WIDTH = 0.07
const CARET_BLINK_INTERVAL = 500 // milliseconds
const CARET_SIZE_MULTIPLIER_DRAG = 1.2
const CARET_SIZE_MULTIPLIER_DEFAULT = 1.0
const CARET_Z_OFFSET = 0.01

/**
 * Handles all caret visual rendering including position, scale, blinking animation, and drag state.
 */
export class CaretRenderer {
  private readonly caretObject: SceneObject
  private readonly caretTransform: Transform
  private readonly textTransform: Transform
  private readonly textScreenTransform: ScreenTransform | null
  private readonly caretRMV: RenderMeshVisual
  private caretVisible: boolean = false
  private caretBlinkTimer: number = 0
  private caretBlinkState: boolean = true
  private caretScaleMultiplier: number = CARET_SIZE_MULTIPLIER_DEFAULT

  private readonly _caretScale: vec3 = vec3.one()
  private readonly _caretPosition: vec3 = vec3.zero()
  private readonly viewPoint: vec2 = vec2.zero()

  private cursorPositions: CursorPosition[] | null = null
  private caretIndex: number = 0

  private unsubscribes: (() => void)[] = []

  public constructor(
    private readonly textComponent: Text,
    private readonly caretMaterial: Material,
    private readonly dragMaterial: Material,
    private readonly caretUpdateEvent: UpdateEvent,
    private readonly onCursorPositionsUpdated: PublicApi<CursorPosition[]> | null = null
  ) {
    this.textTransform = textComponent.getTransform()
    this.textScreenTransform = textComponent.sceneObject.getComponent("ScreenTransform")

    this.caretObject = global.scene.createSceneObject("Caret")
    this.caretObject.setParent(textComponent.getSceneObject())
    this.caretTransform = this.caretObject.getTransform()
    this.caretRMV = this.caretObject.createComponent("RenderMeshVisual")
    this.caretRMV.mesh = UNIT_PLANE
    this.caretRMV.mainMaterial = caretMaterial
    this.caretRMV.setRenderOrder(textComponent.getRenderOrder() + 1)
    this.caretObject.enabled = false

    this.caretUpdateEvent.bind(() => this.onCaretUpdate())
    this.caretUpdateEvent.enabled = false

    if (this.onCursorPositionsUpdated) {
      this.unsubscribes.push(
        this.onCursorPositionsUpdated.add((cursorPositions: CursorPosition[]) => {
          this.cursorPositions = cursorPositions
          if (this.caretVisible) {
            this.updatePosition(this.caretIndex)
          }
        })
      )
    }
  }

  /**
   * Shows the caret.
   */
  public show(): void {
    this.caretVisible = true
    this.updateScale()
    this.resetBlink()
    if (this.caretUpdateEvent) {
      this.caretUpdateEvent.enabled = true
    }
  }

  /**
   * Hides the caret.
   */
  public hide(): void {
    this.caretVisible = false
    if (!isNull(this.caretObject)) {
      this.caretObject.enabled = false
    }
    if (this.caretUpdateEvent) {
      this.caretUpdateEvent.enabled = false
    }
  }

  /**
   * Updates the visual position of the caret based on the current caret index.
   *
   * @param index - The text caret index to position the visual caret at
   */
  public updatePosition(index: number): void {
    if (!this.caretObject || !this.textComponent) return

    this.caretIndex = index

    const hasValidCursorPosition =
      this.cursorPositions && this.cursorPositions.length > 0 && index < this.cursorPositions.length
    const cursorPos = hasValidCursorPosition ? this.cursorPositions[index] : null

    // TODO: CursorPositions currently has a bug where it doesn't return any value when there is no text
    // This means we would need to implement a temporary fix to guess the estimated position of the first character
    // Later, please remove this and use CursorPositions to handle all cases uniformly
    if (this.textComponent.text.length === 0 || !cursorPos || !cursorPos.position) {
      if (this.textScreenTransform) {
        let viewPortX = 0
        if (this.textComponent.horizontalAlignment === HorizontalAlignment.Left) {
          viewPortX = -1
        } else if (this.textComponent.horizontalAlignment === HorizontalAlignment.Right) {
          viewPortX = 1
        }
        let viewPortY = 0
        let offsetY = 0
        if (this.textComponent.verticalAlignment === VerticalAlignment.Top) {
          viewPortY = 1
          offsetY = -this._caretScale.y / 4
        } else if (this.textComponent.verticalAlignment === VerticalAlignment.Bottom) {
          viewPortY = -1
          offsetY = this._caretScale.y / 4
        }
        this.viewPoint.x = viewPortX
        this.viewPoint.y = viewPortY
        const worldStartPos = this.textScreenTransform.localPointToWorldPoint(this.viewPoint)
        const localStartPos = this.textTransform.getInvertedWorldTransform().multiplyPoint(worldStartPos)

        this._caretPosition.x = localStartPos.x
        this._caretPosition.y = localStartPos.y + offsetY
        this._caretPosition.z = CARET_Z_OFFSET
      } else {
        const worldScale = this.textTransform.getWorldScale()
        let localStartX = 0
        if (this.textComponent.horizontalAlignment === HorizontalAlignment.Left) {
          localStartX = this.textComponent.worldSpaceRect.left / worldScale.x
        } else if (this.textComponent.horizontalAlignment === HorizontalAlignment.Right) {
          localStartX = this.textComponent.worldSpaceRect.right / worldScale.x
        } else {
          localStartX = this.textComponent.worldSpaceRect.getCenter().x / worldScale.x
        }
        let localStartY = 0
        let offsetY = 0
        if (this.textComponent.verticalAlignment === VerticalAlignment.Top) {
          localStartY = this.textComponent.worldSpaceRect.top / worldScale.y
          offsetY = -this._caretScale.y / 4
        } else if (this.textComponent.verticalAlignment === VerticalAlignment.Bottom) {
          localStartY = this.textComponent.worldSpaceRect.bottom / worldScale.y
          offsetY = this._caretScale.y / 4
        } else {
          localStartY = this.textComponent.worldSpaceRect.getCenter().y / worldScale.y
        }

        this._caretPosition.x = localStartX
        this._caretPosition.y = localStartY + offsetY
        this._caretPosition.z = CARET_Z_OFFSET
      }
    } else {
      const pos = cursorPos.position
      const offsetY = (this.textScreenTransform ? this.textScreenTransform.offsets.top / 2 : 0) - this._caretScale.y / 4
      this._caretPosition.x = pos.x
      this._caretPosition.y = pos.y - offsetY
      this._caretPosition.z = CARET_Z_OFFSET
    }
    this.caretTransform?.setLocalPosition(this._caretPosition)
  }

  /**
   * Updates the local scale of the caret to match the estimated text height.
   */
  private updateScale(): void {
    if (!this.caretObject || !this.textComponent) return

    const estimatedHeight = this.textComponent.size * ESTIMATED_HEIGHT_FACTOR // approx
    this._caretScale.x = CARET_WIDTH * this.caretScaleMultiplier
    this._caretScale.y = estimatedHeight
    this._caretScale.z = 1
    this.caretTransform?.setLocalScale(this._caretScale)
  }

  /**
   * Sets the drag state, which changes the caret appearance.
   * @param isDragging - Whether caret is being dragged
   */
  public setDragState(isDragging: boolean): void {
    if (!this.caretObject || !this.caretRMV) return

    if (isDragging) {
      this.caretScaleMultiplier = CARET_SIZE_MULTIPLIER_DRAG
      if (this.dragMaterial) {
        this.caretRMV.mainMaterial = this.dragMaterial
      }
    } else {
      this.caretScaleMultiplier = CARET_SIZE_MULTIPLIER_DEFAULT
      if (this.caretMaterial) {
        this.caretRMV.mainMaterial = this.caretMaterial
      }
    }
    this.updateScale()
  }

  /**
   * Resumes the caret blink animation.
   */
  public resumeBlink(): void {
    this.caretUpdateEvent.enabled = true
  }

  /**
   * Pauses the caret blink animation.
   */
  public pauseBlink(): void {
    this.caretUpdateEvent.enabled = false
  }

  /**
   * Resets the caret blink animation.
   */
  public resetBlink(): void {
    this.caretBlinkTimer = 0
    this.caretBlinkState = true
    if (!isNull(this.caretObject)) {
      this.caretObject.enabled = this.caretVisible
    }
  }

  /**
   * Update callback for caret blinking animation.
   */
  private onCaretUpdate(): void {
    if (!this.caretVisible) {
      if (!isNull(this.caretObject) && this.caretObject.enabled) {
        this.caretObject.enabled = false
      }
      return
    }

    this.caretBlinkTimer += getDeltaTime() * 1000
    this.caretBlinkTimer %= CARET_BLINK_INTERVAL * 2
    const phase = Math.floor(this.caretBlinkTimer / CARET_BLINK_INTERVAL)
    const newBlinkState = phase === 0
    if (this.caretBlinkState !== newBlinkState) {
      this.caretBlinkState = newBlinkState
      if (!isNull(this.caretObject)) this.caretObject.enabled = this.caretBlinkState
    }
  }

  /**
   * Destroys the caret renderer and cleans up resources.
   */
  public destroy(): void {
    this.unsubscribes.forEach((unsub) => unsub())
    this.unsubscribes = []
    if (this.caretUpdateEvent) {
      this.caretUpdateEvent.enabled = false
    }
    this.hide()
    if (!isNull(this.caretObject)) {
      this.caretObject.destroy()
    }
  }
}
