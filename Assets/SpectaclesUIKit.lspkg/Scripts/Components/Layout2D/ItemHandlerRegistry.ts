// ═══════════════════════════════════════════════════════════════════════════
// ItemHandlerRegistry.ts — Content-type adapters with runtime registry.
//
// Detects what kind of content a SceneObject holds (Element, Shape, Text,
// Image, RenderMeshVisual) and provides measure/apply.
//
// Registry is extensible: call ItemHandlerRegistry.register() to add
// custom handlers at any priority.
//
// Extracted from FlexItemHandlers.ts to be layout-agnostic (used by both
// FlexItem and GridItem).
// ═══════════════════════════════════════════════════════════════════════════

// ─── Handler Interface ───────────────────────────────────────────────────

/**
 * Content-type adapter that knows how to measure and position a specific
 * kind of SceneObject (e.g. Element, Text, Image, RenderMeshVisual).
 */
export interface ItemHandler {
  /** Human-readable name for debugging. */
  readonly name: string
  /** Returns true if this handler can manage the given SceneObject. */
  canHandle(sceneObject: SceneObject): boolean
  /** Measures the intrinsic width and height of the SceneObject (in cm). */
  measure(sceneObject: SceneObject): {width: number; height: number}
  /**
   * Positions and sizes the SceneObject according to layout output.
   * @param sceneObject - The scene object to position.
   * @param x - Target X position (center-based, in cm).
   * @param y - Target Y position (center-based, in cm).
   * @param width - Allocated width (in cm).
   * @param height - Allocated height (in cm).
   */
  apply(
    sceneObject: SceneObject,
    x: number,
    y: number,
    width: number,
    height: number
  ): void
}

// ─── Registry ────────────────────────────────────────────────────────────

interface RegisteredHandler {
  handler: ItemHandler
  priority: number
}

/**
 * Priority-sorted registry of {@link ItemHandler} instances.
 * Higher-priority handlers are tested first when resolving a SceneObject.
 */
class HandlerRegistry {
  private handlers: RegisteredHandler[] = []
  private sorted = false

  /**
   * Registers a handler at the given priority. Higher priority = checked first.
   * @param handler - The handler to register.
   * @param priority - Numeric priority (e.g. 100 for Element, 50 for RenderMeshVisual).
   */
  public register(handler: ItemHandler, priority: number): void {
    this.handlers.push({handler, priority})
    this.sorted = false
  }

  /**
   * Removes a previously registered handler.
   * @param handler - The handler instance to remove.
   */
  public unregister(handler: ItemHandler): void {
    this.handlers = this.handlers.filter((h) => h.handler !== handler)
  }

  /**
   * Finds the highest-priority handler that can manage the given SceneObject.
   * @param sceneObject - The SceneObject to resolve a handler for.
   * @returns The matching handler, or null if none can handle it.
   */
  public resolve(sceneObject: SceneObject): ItemHandler | null {
    if (!this.sorted) {
      this.handlers.sort((a, b) => b.priority - a.priority)
      this.sorted = true
    }
    for (const entry of this.handlers) {
      if (entry.handler.canHandle(sceneObject)) {
        return entry.handler
      }
    }
    return null
  }
}

/**
 * Global singleton registry of content-type handlers for the Layout2D system.
 * Pre-populated with handlers for Element, Shape, Text, Image, RenderMeshVisual,
 * and nested layout containers. Register custom handlers via
 * `ItemHandlerRegistry.register(handler, priority)`.
 */
export const ItemHandlerRegistry = new HandlerRegistry()

// ─── Position Helper ─────────────────────────────────────────────────────

function setLocalXY(sceneObject: SceneObject, x: number, y: number): void {
  const transform = sceneObject.getTransform()
  const current = transform.getLocalPosition()
  transform.setLocalPosition(new vec3(x, y, current.z))
}

// ─── Default Handlers ────────────────────────────────────────────────────

// ─── Duck-type finders (single source of truth per handler) ──────────────

/** Finds a layout-container component (has computeContentSize, forceLayout, width, height). */
function findLayoutContainer(sceneObject: SceneObject): any | null {
  for (const c of sceneObject.getComponents("ScriptComponent")) {
    const comp = c as any
    if (
      comp &&
      "computeContentSize" in comp &&
      "forceLayout" in comp &&
      "width" in comp &&
      "height" in comp
    ) {
      return comp
    }
  }
  return null
}

/** Finds a layoutable element component (has width, height, onSizeChanged). */
function findElement(sceneObject: SceneObject): any | null {
  for (const c of sceneObject.getComponents("ScriptComponent")) {
    const comp = c as any
    if (
      comp &&
      "width" in comp &&
      "height" in comp &&
      "onSizeChanged" in comp
    ) {
      return comp
    }
  }
  return null
}

/** Finds a shape component (has _size vec2 + renderMeshVisual). */
function findShape(sceneObject: SceneObject): any | null {
  for (const c of sceneObject.getComponents("ScriptComponent")) {
    const comp = c as any
    if (comp && "_size" in comp && "renderMeshVisual" in comp) {
      return comp
    }
  }
  return null
}

// Priority 110: Layout containers (FlexLayout, GridLayout, etc.)
const LayoutContainerHandler: ItemHandler = {
  name: "LayoutContainerHandler",

  canHandle(sceneObject: SceneObject): boolean {
    return findLayoutContainer(sceneObject) !== null
  },

  measure(sceneObject: SceneObject): {width: number; height: number} {
    const comp = findLayoutContainer(sceneObject)
    if (!comp) {
      print("WARNING: LayoutContainerHandler.measure – component no longer found")
      return {width: 1, height: 1}
    }
    return comp.computeContentSize()
  },

  apply(
    sceneObject: SceneObject,
    x: number,
    y: number,
    width: number,
    height: number
  ): void {
    const comp = findLayoutContainer(sceneObject)
    if (comp) {
      comp.width = width
      comp.height = height
      comp.forceLayout()
    }
    setLocalXY(sceneObject, x, y)
  },
}

// Priority 100: Layoutable components (Element, Shape, Frame, ScrollWindow, layouts)
const ElementHandler: ItemHandler = {
  name: "ElementHandler",

  canHandle(sceneObject: SceneObject): boolean {
    return findElement(sceneObject) !== null
  },

  measure(sceneObject: SceneObject): {width: number; height: number} {
    const comp = findElement(sceneObject)
    if (!comp) {
      print("WARNING: ElementHandler.measure – component no longer found")
      return {width: 1, height: 1}
    }
    return {width: comp.width, height: comp.height}
  },

  apply(
    sceneObject: SceneObject,
    x: number,
    y: number,
    width: number,
    height: number
  ): void {
    const comp = findElement(sceneObject)
    if (comp) {
      comp.width = width
      comp.height = height
    }
    setLocalXY(sceneObject, x, y)
  },
}

// Priority 90: Shape components (has _size vec2 + renderMeshVisual)
const ShapeHandler: ItemHandler = {
  name: "ShapeHandler",

  canHandle(sceneObject: SceneObject): boolean {
    return findShape(sceneObject) !== null
  },

  measure(sceneObject: SceneObject): {width: number; height: number} {
    const comp = findShape(sceneObject)
    if (!comp) {
      print("WARNING: ShapeHandler.measure – component no longer found")
      return {width: 1, height: 1}
    }
    return {width: comp.width ?? comp._size.x, height: comp.height ?? comp._size.y}
  },

  apply(
    sceneObject: SceneObject,
    x: number,
    y: number,
    width: number,
    height: number
  ): void {
    const comp = findShape(sceneObject)
    if (comp) {
      if ("width" in comp) comp.width = width
      if ("height" in comp) comp.height = height
    }
    setLocalXY(sceneObject, x, y)
  },
}

// Priority 70: Text components
const TextHandler: ItemHandler = {
  name: "TextHandler",

  canHandle(sceneObject: SceneObject): boolean {
    return sceneObject.getComponent("Component.Text") !== null
  },

  measure(sceneObject: SceneObject): {width: number; height: number} {
    const text = sceneObject.getComponent("Component.Text") as Text
    if (!text || !text.worldSpaceRect) return {width: 1, height: 1}

    const rect = text.worldSpaceRect
    const worldWidth = Math.abs(rect.right - rect.left)
    const worldHeight = Math.abs(rect.top - rect.bottom)

    const parent = sceneObject.getParent()
    const parentScale = parent ? parent.getTransform().getWorldScale() : vec3.one()
    return {
      width: Math.abs(parentScale.x) > 0 ? worldWidth / Math.abs(parentScale.x) : worldWidth,
      height: Math.abs(parentScale.y) > 0 ? worldHeight / Math.abs(parentScale.y) : worldHeight,
    }
  },

  apply(
    sceneObject: SceneObject,
    x: number,
    y: number,
    width: number,
    height: number
  ): void {
    const text = sceneObject.getComponent("Component.Text") as Text
    if (text) {
      const parent = sceneObject.getParent()
      const parentScale = parent ? parent.getTransform().getWorldScale() : vec3.one()
      const worldWidth = width * Math.abs(parentScale.x)
      const worldHeight = height * Math.abs(parentScale.y)
      text.worldSpaceRect = Rect.create(
        -worldWidth * 0.5,
        worldWidth * 0.5,
        -worldHeight * 0.5,
        worldHeight * 0.5
      )
    }
    setLocalXY(sceneObject, x, y)
  },
}

// Priority 60: Image components
const ImageHandler: ItemHandler = {
  name: "ImageHandler",

  canHandle(sceneObject: SceneObject): boolean {
    return sceneObject.getComponent("Component.Image") !== null
  },

  measure(sceneObject: SceneObject): {width: number; height: number} {
    const scale = sceneObject.getTransform().getLocalScale()
    return {
      width: Math.abs(scale.x),
      height: Math.abs(scale.y),
    }
  },

  apply(
    sceneObject: SceneObject,
    x: number,
    y: number,
    width: number,
    height: number
  ): void {
    const transform = sceneObject.getTransform()
    transform.setLocalScale(new vec3(width, height, transform.getLocalScale().z))
    setLocalXY(sceneObject, x, y)
  },
}

// Priority 50: RenderMeshVisual components
const RenderMeshVisualHandler: ItemHandler = {
  name: "RenderMeshVisualHandler",

  canHandle(sceneObject: SceneObject): boolean {
    return sceneObject.getComponent("Component.RenderMeshVisual") !== null
  },

  measure(sceneObject: SceneObject): {width: number; height: number} {
    const rmv = sceneObject.getComponent("Component.RenderMeshVisual") as RenderMeshVisual
    if (!rmv) return {width: 1, height: 1}

    const mesh = rmv.mesh
    if (mesh) {
      const localScale = sceneObject.getTransform().getLocalScale()
      const w = Math.abs(mesh.aabbMax.x - mesh.aabbMin.x) * Math.abs(localScale.x)
      const h = Math.abs(mesh.aabbMax.y - mesh.aabbMin.y) * Math.abs(localScale.y)
      return {width: w, height: h}
    }

    return {width: 1, height: 1}
  },

  apply(
    sceneObject: SceneObject,
    x: number,
    y: number,
    width: number,
    height: number
  ): void {
    const rmv = sceneObject.getComponent("Component.RenderMeshVisual") as RenderMeshVisual
    if (rmv && rmv.mesh) {
      const mesh = rmv.mesh
      const meshW = Math.abs(mesh.aabbMax.x - mesh.aabbMin.x)
      const meshH = Math.abs(mesh.aabbMax.y - mesh.aabbMin.y)
      if (meshW > 0 && meshH > 0) {
        const scaleX = width / meshW
        const scaleY = height / meshH
        const scale = Math.min(scaleX, scaleY)
        const transform = sceneObject.getTransform()
        const current = transform.getLocalScale()
        transform.setLocalScale(new vec3(scale, scale, current.z))
      }
    }
    setLocalXY(sceneObject, x, y)
  },
}

// ─── Register Default Handlers ───────────────────────────────────────────

ItemHandlerRegistry.register(LayoutContainerHandler, 110)
ItemHandlerRegistry.register(ElementHandler, 100)
ItemHandlerRegistry.register(ShapeHandler, 90)
ItemHandlerRegistry.register(TextHandler, 70)
ItemHandlerRegistry.register(ImageHandler, 60)
ItemHandlerRegistry.register(RenderMeshVisualHandler, 50)
