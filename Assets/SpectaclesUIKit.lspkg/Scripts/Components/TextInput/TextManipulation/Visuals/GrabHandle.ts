import {Interactable} from "SpectaclesInteractionKit.lspkg/Components/Interaction/Interactable/Interactable"
import {TargetingMode} from "SpectaclesInteractionKit.lspkg/Core/Interactor/Interactor"
import {InteractorEvent} from "SpectaclesInteractionKit.lspkg/Core/Interactor/InteractorEvent"
import animate, {CancelSet} from "SpectaclesInteractionKit.lspkg/Utils/animate"
import Event from "SpectaclesInteractionKit.lspkg/Utils/Event"

const UNIT_PLANE: RenderMesh = requireAsset("../../../../../Meshes/Unit Plane.mesh") as RenderMesh

// Handle size ratios relative to line height
const HANDLE_WIDTH_RATIO = 0.15 // Width as fraction of line height
const HANDLE_HEIGHT_RATIO = 1.0 // Height matches line height
const HANDLE_LARGE_MULTIPLIER = 1.3 // Scale up by this factor when hovered

const HANDLE_Z_OFFSET = 0.008

// Collider size ratio
const HANDLE_COLLIDER_RELATIVE_WIDTH = 5
const HANDLE_COLLIDER_RELATIVE_HEIGHT = 2
const HANDLE_COLLIDER_DEPTH = 0.1

// Animation
const HOVER_ANIMATION_DURATION = 0.15
const SNAP_BACK_ANIMATION_DURATION = 0.2

/**
 * Event payload for handle drag updates.
 */
export type HandleDragUpdateEvent = {
  dragStartWorldPosition: vec3
  dragCurrentWorldPosition: vec3
}

/**
 * Type of grab handle, indicating its position in the selection.
 */
export type HandleType = "start" | "end"

/**
 * Handles visual rendering and interaction for a text selection grab handle.
 */
export class GrabHandle {
  private readonly sceneObject: SceneObject
  private readonly transform: Transform
  private readonly interactable: Interactable
  private readonly collider: ColliderComponent
  private readonly handleType: HandleType
  private readonly rmv: RenderMeshVisual

  private readonly scaleAnimationCancelSet = new CancelSet()
  private readonly positionAnimationCancelSet = new CancelSet()

  private isHovered: boolean = false
  private isDragging: boolean = false
  private readonly currentVisualScale: vec3 = vec3.one()
  private readonly targetPosition: vec3 = vec3.zero()

  private readonly _handleScale: vec3 = vec3.one()
  private readonly _handlePosition: vec3 = vec3.zero()
  private readonly _startScale: vec3 = vec3.one()
  private readonly _endScale: vec3 = vec3.one()
  private readonly _startPosition: vec3 = vec3.zero()

  // Line height for scaling - all sizes derive from this
  private _lineHeight: number

  private dragStartWorldPos: vec3 | null = null

  private unsubscribes: (() => void)[] = []

  private readonly onDragUpdateEvent: Event<HandleDragUpdateEvent> = new Event<HandleDragUpdateEvent>()

  /**
   * Event triggered when the handle is dragged.
   */
  public readonly onDragUpdate = this.onDragUpdateEvent.publicApi()

  private readonly onDragEndEvent: Event = new Event()

  /**
   * Event triggered when the handle drag ends.
   */
  public readonly onDragEnd = this.onDragEndEvent.publicApi()

  /**
   * Gets the local position of the handle.
   */
  public get position(): vec3 {
    return this.transform.getLocalPosition()
  }

  /**
   * Sets the local position of the handle, cancelling any ongoing snap-back animations.
   *
   * @param pos - The new local position
   */
  public set position(pos: vec3) {
    this.targetPosition.x = pos.x
    this.targetPosition.y = pos.y
    this.targetPosition.z = pos.z
    // Cancel any ongoing snap-back animations so it doesn't fight this setter
    this.positionAnimationCancelSet.cancel()
    this.transform.setLocalPosition(pos)
  }

  /**
   * Gets the current line height used for scaling calculations.
   */
  public get lineHeight(): number {
    return this._lineHeight
  }

  /**
   * Sets the line height and updates visual scale if not currently interacting.
   *
   * @param height - The new line height
   */
  public set lineHeight(height: number) {
    this._lineHeight = height
    // Update visual scale if not animating
    if (!this.isDragging && !this.isHovered) {
      this.setSmallScale()
    }
  }

  public constructor(
    parent: SceneObject,
    material: Material,
    renderOrder: number,
    initialLineHeight: number,
    handleType: HandleType
  ) {
    this._lineHeight = initialLineHeight
    this.handleType = handleType
    this.updateSmallSize(this.currentVisualScale)

    // Create scene object
    this.sceneObject = global.scene.createSceneObject(`Handle_${handleType}`)
    this.sceneObject.setParent(parent)
    this.transform = this.sceneObject.getTransform()

    // Create visual
    this.rmv = this.sceneObject.createComponent("RenderMeshVisual")
    this.rmv.mesh = UNIT_PLANE
    this.rmv.mainMaterial = material
    this.rmv.setRenderOrder(renderOrder + 2)

    // Create collider with size based on initial line height
    this.collider = this.sceneObject.createComponent("Physics.ColliderComponent")
    this.initColliderShape()
    this.collider.intangible = false
    this.collider.fitVisual = false
    this.collider.debugDrawEnabled = false

    // Create interactable
    this.interactable = this.sceneObject.createComponent(Interactable.getTypeName()) as Interactable
    this.interactable.targetingMode = TargetingMode.All
    this.interactable.enableInstantDrag = true
    this.interactable.colliders = [this.collider]

    // Bind events
    this.unsubscribes.push(
      this.interactable.onHoverEnter.add(() => {
        this.isHovered = true
        this.onHandleHoverEnter()
      })
    )

    this.unsubscribes.push(
      this.interactable.onHoverExit.add(() => {
        this.isHovered = false
        if (!this.isDragging) {
          this.onHandleHoverExit()
        }
      })
    )

    this.unsubscribes.push(
      this.interactable.onDragStart.add((event: InteractorEvent) => {
        this.isDragging = true
        this.onHandleDragStart(event)
      })
    )

    this.unsubscribes.push(
      this.interactable.onDragUpdate.add((event: InteractorEvent) => {
        if (this.isDragging) {
          this.onHandleDragUpdate(event)
        }
      })
    )

    this.unsubscribes.push(
      this.interactable.onDragEnd.add((event: InteractorEvent) => {
        if (this.isDragging) {
          this.isDragging = false
          this.onHandleDragEnd(event)
        }
      })
    )

    this.unsubscribes.push(
      this.interactable.onTriggerEnd.add((event: InteractorEvent) => {
        if (this.isDragging) {
          this.isDragging = false
          this.onHandleDragEnd(event)
        }
      })
    )

    this.unsubscribes.push(
      this.interactable.onTriggerEndOutside.add((event: InteractorEvent) => {
        if (this.isDragging) {
          this.isDragging = false
          this.onHandleDragEnd(event)
        }
      })
    )

    this.unsubscribes.push(
      this.interactable.onTriggerCanceled.add((event: InteractorEvent) => {
        if (this.isDragging) {
          this.isDragging = false
          this.onHandleDragEnd(event)
        }
      })
    )

    // Initialize as hidden
    this.sceneObject.enabled = false
    this.setSmallScale()
  }

  /**
   * Destroys the handle and cleans up resources.
   */
  public destroy(): void {
    this.scaleAnimationCancelSet.cancel()
    this.positionAnimationCancelSet.cancel()
    this.unsubscribes.forEach((unsub) => unsub())
    this.unsubscribes = []
    if (!isNull(this.sceneObject)) {
      this.sceneObject.destroy()
    }
  }

  /**
   * Shows the handle.
   */
  public show(): void {
    this.sceneObject.enabled = true
  }

  /**
   * Hides the handle.
   */
  public hide(): void {
    this.scaleAnimationCancelSet.cancel()
    this.positionAnimationCancelSet.cancel()
    this.sceneObject.enabled = false
    this.isDragging = false
    this.isHovered = false
    this.setSmallScale()
  }

  /**
   * Updates the visual position of the handle, either animating to it (if releasing)
   * or snapping directly to it.
   * Note: `pos` should be the raw position of the character, this method handles the width offsetting.
   *
   * @param pos - The raw position of the character to align with
   * @param isReleasing - Whether the handle is being released and should animate to position
   */
  public updateVisualState(pos: vec3, isReleasing: boolean): void {
    const widthOffset = (this.handleType === "start" ? -1 : 1) * (this.getSmallWidth() / 2)
    this._handlePosition.x = pos.x + widthOffset
    this._handlePosition.y = pos.y + this.lineHeight / 4
    this._handlePosition.z = HANDLE_Z_OFFSET

    if (!this.isDragging && isReleasing) {
      this.targetPosition.x = this._handlePosition.x
      this.targetPosition.y = this._handlePosition.y
      this.targetPosition.z = this._handlePosition.z
      this.animateToTargetPosition(() => {
        if (!this.isHovered) this.animateToSmallScale()
      })
    } else {
      this.position = this._handlePosition
    }
  }

  /**
   * Event handler for when dragging starts.
   *
   * @param event - The interactor event
   */
  private onHandleDragStart(event: InteractorEvent): void {
    this.dragStartWorldPos = event.interactor?.planecastPoint
    this.animateToLargeScale()
  }

  /**
   * Event handler for when the handle is hovered.
   */
  private onHandleHoverEnter(): void {
    this.animateToLargeScale()
  }

  /**
   * Event handler for when the handle hover ends.
   */
  private onHandleHoverExit(): void {
    this.animateToSmallScale()
  }

  /**
   * Event handler for drag updates.
   *
   * @param event - The interactor event
   */
  private onHandleDragUpdate(event: InteractorEvent): void {
    const pos = event.interactor?.planecastPoint

    // Skip update to avoid janky jumps
    if (!pos || !this.dragStartWorldPos) return

    this.onDragUpdateEvent.invoke({
      dragStartWorldPosition: this.dragStartWorldPos!, // Safe because of fallback in DragStart
      dragCurrentWorldPosition: pos
    })
  }

  /**
   * Event handler for when dragging ends.
   *
   * @param _ - The interactor event
   */
  private onHandleDragEnd(_: InteractorEvent): void {
    this.dragStartWorldPos = null
    this.onDragEndEvent.invoke()

    if (!this.isHovered) {
      this.animateToSmallScale()
    }
  }

  /**
   * Gets the current handle width for positioning calculations.
   */
  private getSmallWidth(): number {
    return this._lineHeight * HANDLE_WIDTH_RATIO
  }

  /**
   * Calculates the small (idle) size based on line height.
   *
   * @param outScale - The vector to store the calculated scale in
   */
  private updateSmallSize(outScale: vec3): void {
    outScale.x = this._lineHeight * HANDLE_WIDTH_RATIO
    outScale.y = this._lineHeight * HANDLE_HEIGHT_RATIO
    outScale.z = 1
  }

  /**
   * Calculates the large (hovered) size based on line height.
   *
   * @param outScale - The vector to store the calculated scale in
   */
  private updateLargeSize(outScale: vec3): void {
    outScale.x = this._lineHeight * HANDLE_WIDTH_RATIO * HANDLE_LARGE_MULTIPLIER
    outScale.y = this._lineHeight * HANDLE_HEIGHT_RATIO * HANDLE_LARGE_MULTIPLIER
    outScale.z = 1
  }

  /**
   * Sets small scale immediately with no animation.
   */
  private setSmallScale(): void {
    this.scaleAnimationCancelSet.cancel()
    this.updateSmallSize(this.currentVisualScale)
    this.transform.setLocalScale(this.currentVisualScale)
  }

  /**
   * Animates to small (idle) scale.
   */
  private animateToSmallScale(): void {
    this.updateSmallSize(this._handleScale)
    this.animateToTargetScale(this._handleScale)
  }

  /**
   * Animates to large (hovered) scale.
   */
  private animateToLargeScale(): void {
    this.updateLargeSize(this._handleScale)
    this.animateToTargetScale(this._handleScale)
  }

  private readonly onPositionAnimationUpdate = (t: number): void => {
    this._handlePosition.x = this._startPosition.x + (this.targetPosition.x - this._startPosition.x) * t
    this._handlePosition.y = this._startPosition.y + (this.targetPosition.y - this._startPosition.y) * t
    this._handlePosition.z = this._startPosition.z + (this.targetPosition.z - this._startPosition.z) * t
    this.transform.setLocalPosition(this._handlePosition)
  }

  /**
   * Animates the handle position back to its target (highlight edge).
   *
   * @param onComplete - Optional callback when animation finishes
   */
  private animateToTargetPosition(onComplete?: () => void): void {
    this.positionAnimationCancelSet.cancel()

    const startPos = this.position
    this._startPosition.x = startPos.x
    this._startPosition.y = startPos.y
    this._startPosition.z = startPos.z

    animate({
      duration: SNAP_BACK_ANIMATION_DURATION,
      easing: "ease-out-cubic",
      cancelSet: this.positionAnimationCancelSet,
      update: this.onPositionAnimationUpdate,
      ended: onComplete
    })
  }

  private readonly onScaleAnimationUpdate = (t: number): void => {
    this.currentVisualScale.x = this._startScale.x + (this._endScale.x - this._startScale.x) * t
    this.currentVisualScale.y = this._startScale.y + (this._endScale.y - this._startScale.y) * t
    this.currentVisualScale.z = this._startScale.z + (this._endScale.z - this._startScale.z) * t
    this.transform.setLocalScale(this.currentVisualScale)
  }

  /**
   * Animates the handle scale to a target scale.
   *
   * @param targetScale - The scale to animate to
   */
  private animateToTargetScale(targetScale: vec3): void {
    this.scaleAnimationCancelSet.cancel()

    this._startScale.x = this.currentVisualScale.x
    this._startScale.y = this.currentVisualScale.y
    this._startScale.z = this.currentVisualScale.z

    this._endScale.x = targetScale.x
    this._endScale.y = targetScale.y
    this._endScale.z = targetScale.z

    animate({
      duration: HOVER_ANIMATION_DURATION,
      easing: "ease-out-cubic",
      cancelSet: this.scaleAnimationCancelSet,
      update: this.onScaleAnimationUpdate
    })
  }

  private initColliderShape(): void {
    const shape = Shape.createBoxShape()
    shape.size = new vec3(HANDLE_COLLIDER_RELATIVE_WIDTH, HANDLE_COLLIDER_RELATIVE_HEIGHT, HANDLE_COLLIDER_DEPTH)
    this.collider.shape = shape
  }
}
