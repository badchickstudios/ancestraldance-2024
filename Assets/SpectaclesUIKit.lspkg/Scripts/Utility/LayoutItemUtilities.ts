import {Layoutable} from "../Components/Layout/Layoutable"
import {Axis, Bounds3D, LayoutableOriginalSettings, SizeDriver} from "../Components/Layout/LayoutConfigurationTypes"
import {LayoutItem} from "../Components/Layout/LayoutItem"
import {NestableLayout} from "../Components/Layout/NestableLayout"
import {VisualElement} from "../Components/VisualElement"
import {Shape} from "../Visuals/Shape"
import {
  computeLocalBoundsFromWorldAabb,
  computeLocalBoundsFromWorldAabbScaled,
  computeScaleRatio,
  computeUnifiedScaleRatio,
  maxVec3Components,
  minVec3Components
} from "./UIKitUtilities"

// ═══════════════════════════════════════════════════════════════════════════
// BOUNDS CALCULATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Computes the bounds of an item given its position and size.
 * @param position - The center position of the item.
 * @param size - The size of the item.
 * @returns The computed 3D bounds.
 */
export function computeBounds(position: vec3, size: vec3): Bounds3D {
  const halfSize = size.uniformScale(0.5)
  return {
    min: position.sub(halfSize),
    max: position.add(halfSize),
    size: size,
    center: position
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SIZE DRIVERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Helper to determine the size driver for a specific axis of a LayoutItem.
 * @param item - The LayoutItem to query.
 * @param axis - The axis to check.
 * @returns The SizeDriver for the specified axis.
 */
export function getLayoutItemSizeDriver(item: LayoutItem, axis: Axis): SizeDriver {
  switch (axis) {
    case Axis.X:
      return item.widthSizeDriver
    case Axis.Y:
      return item.heightSizeDriver
    case Axis.Z:
      return item.depthSizeDriver
    default:
      return SizeDriver.LayoutAndLayoutItem
  }
}

/**
 * Represents a mask for enabling/disabling operations on specific layout axes.
 * Used throughout the layout system to control which axes are affected by size calculations,
 * caching, and sync operations.
 */
export type AxisMask = Readonly<{horizontal: boolean; vertical: boolean; depth: boolean}>

/**
 * Creates an axis mask enabling checks for which axes are component-driven vs. layout-driven.
 * @param widthDriver - SizeDriver for the width axis.
 * @param heightDriver - SizeDriver for the height axis.
 * @param depthDriver - SizeDriver for the depth axis.
 * @returns An object with boolean flags for each axis (true = layout driven, false = component driven).
 */
export function getAxisMask(widthDriver: SizeDriver, heightDriver: SizeDriver, depthDriver: SizeDriver): AxisMask {
  return {
    horizontal: widthDriver !== SizeDriver.Component,
    vertical: heightDriver !== SizeDriver.Component,
    depth: depthDriver !== SizeDriver.Component
  }
}

/**
 * Checks if any axis is component-driven (size flows from component to LayoutItem).
 * @param mask - The axis mask from getAxisMask.
 * @returns True if at least one axis is component-driven.
 */
export function isAnyAxisComponentDriven(mask: AxisMask): boolean {
  return !mask.horizontal || !mask.vertical || !mask.depth
}

/**
 * Checks if any axis is layout-driven (size flows from LayoutItem/Layout to component).
 * @param mask - The axis mask from getAxisMask.
 * @returns True if at least one axis is layout-driven.
 */
export function isAnyAxisLayoutDriven(mask: AxisMask): boolean {
  return mask.horizontal || mask.vertical || mask.depth
}

// ═══════════════════════════════════════════════════════════════════════════
// POSITIONING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Computes the local position from a ScreenTransform's anchors and offsets.
 * Combines the center of anchors and offsets for X/Y, and uses the provided Z.
 *
 * @param screenTransform - The ScreenTransform component.
 * @param localZ - The current local Z position.
 * @returns The calculated local position.
 */
function computePositionFromScreenTransform(screenTransform: ScreenTransform, localZ: number): vec3 {
  const anchorCenter = screenTransform.anchors.getCenter()
  const offsetCenter = screenTransform.offsets.getCenter()
  return new vec3(anchorCenter.x + offsetCenter.x, anchorCenter.y + offsetCenter.y, localZ)
}

/**
 * Computes the local position from either a ScreenTransform or regular Transform.
 * For ScreenTransform, combines anchor and offset centers for X/Y, uses local Z.
 * For regular Transform, returns the local position directly.
 *
 * @param transform - The Transform component.
 * @param screenTransform - The ScreenTransform component (optional).
 * @returns The calculated local position.
 */
export function computeLocalPosition(transform: Transform, screenTransform: ScreenTransform | undefined): vec3 {
  if (screenTransform) {
    return computePositionFromScreenTransform(screenTransform, transform.getLocalPosition().z)
  }
  return transform.getLocalPosition()
}

/**
 * Applies a local position to a ScreenTransform.
 * Sets the offsets center to match X/Y and the position Z to match Z.
 * @param screenTransform - The ScreenTransform to update.
 * @param position - The position vector (x, y used for center, z for local z).
 */
function applyPositionToScreenTransform(screenTransform: ScreenTransform, position: vec3): void {
  screenTransform.offsets.setCenter(new vec2(position.x, position.y))
  screenTransform.position.z = position.z
}

/**
 * Applies a local position to either a ScreenTransform or regular Transform.
 * For ScreenTransform, sets the offsets center for X/Y and position Z.
 * For regular Transform, sets the local position directly.
 *
 * @param position - The position to apply.
 * @param transform - The Transform component.
 * @param screenTransform - The ScreenTransform component (optional).
 */
export function applyLocalPosition(
  position: vec3,
  transform: Transform,
  screenTransform: ScreenTransform | undefined
): void {
  if (screenTransform) {
    applyPositionToScreenTransform(screenTransform, position)
  } else {
    transform.setLocalPosition(position)
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENT INTROSPECTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Checks if a component implements the Layoutable interface.
 * @param component - The component to check.
 * @returns True if the component matches the Layoutable interface.
 */
export function isLayoutable(component: any): component is Layoutable {
  return (
    component &&
    "width" in component &&
    "height" in component &&
    "depth" in component &&
    "layoutSize" in component &&
    "onSizeChanged" in component
  )
}

/**
 * Retrieves the first component that implements the Layoutable interface from a scene object.
 * @param object - The scene object to search.
 * @returns The first Layoutable component found, or null if none exists.
 */
export function getLayoutable(object: SceneObject): Layoutable | null {
  const components = object.getComponents("ScriptComponent")
  for (const component of components) {
    if (isLayoutable(component)) {
      return component
    }
  }
  return null
}

/**
 * Checks if a component implements the NestableLayout interface.
 * @param component - The component to check.
 * @returns True if the component matches the NestableLayout interface.
 */
export function isNestableLayout(component: any): component is NestableLayout {
  return isLayoutable(component) && "fixedWidth" in component && "fixedHeight" in component && "fixedDepth" in component
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENT COLLECTION & MATERIAL
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Collects all visual components (RenderMeshVisual, Image, Text) from a scene object.
 * @param object - The scene object to search.
 * @returns An object containing arrays of each component type.
 */
export function collectVisualComponents(object: SceneObject): {
  renderMeshVisuals: RenderMeshVisual[]
  images: Image[]
  texts: Text[]
} {
  return {
    renderMeshVisuals: object.getComponents("Component.RenderMeshVisual"),
    images: object.getComponents("Component.Image"),
    texts: object.getComponents("Component.Text")
  }
}

/**
 * Clones materials from a visual component.
 * This allows for independent material manipulation per instance.
 *
 * @param visual - The visual component (RenderMeshVisual or Image) to clone materials for.
 * @returns Array of cloned materials.
 */
export function cloneVisualMaterials(visual: RenderMeshVisual | Image): Material[] {
  const materialsCount = visual.getMaterialsCount()
  const materials: Material[] = []

  // Clone existing materials
  for (let i = 0; i < materialsCount; i++) {
    materials.push(visual.getMaterial(i).clone())
  }

  // Re-assign cloned materials to the visual
  visual.clearMaterials()
  materials.forEach((material) => {
    visual.addMaterial(material)
  })

  return materials
}

/**
 * Safely retrieves the main material from a Text component.
 * Handles API inconsistencies where material methods might not be exposed on the type.
 */
export function getTextMaterial(text: Text): Material | null {
  // Cast to any to access potentially unexposed methods
  const textAny = text as any
  if (textAny.getMaterialsCount && textAny.getMaterial) {
    return textAny.getMaterial(0)
  }
  return null
}

/**
 * Safely retrieves the main material from a Layoutable component (like Element/VisualElement or Shape).
 * Uses property checking to avoid hard dependencies on specific component classes.
 */
export function extractUIKitComponentMaterial(layoutable: any): Material | null {
  if (!layoutable) return null

  // Check for VisualElement pattern (Element -> visual -> renderMeshVisual)
  if (layoutable instanceof VisualElement) {
    if (layoutable.visual && layoutable.visual.renderMeshVisual && layoutable.visual.renderMeshVisual.mainMaterial) {
      return layoutable.visual.renderMeshVisual.mainMaterial
    }
  }

  // Check for Shape pattern (Shape -> renderMeshVisual)
  if (layoutable instanceof Shape) {
    if (layoutable.renderMeshVisual && layoutable.renderMeshVisual.mainMaterial) {
      return layoutable.renderMeshVisual.mainMaterial
    }
  }

  return null
}

// ═══════════════════════════════════════════════════════════════════════════
// SCREEN TRANSFORM SETUP
// ═══════════════════════════════════════════════════════════════════════════

const SCREEN_TRANSFORM_FULL_ANCHOR: Rect = Rect.create(-1, 1, -1, 1)
export const SCREEN_TRANSFORM_CENTER_ANCHOR: Rect = Rect.create(0, 0, 0, 0)
const SCREEN_TRANSFORM_SCALE_DEFAULT = new vec3(1, 1, 0.5)

/**
 * Configures a ScreenTransform to fill its parent completely.
 * Sets anchors to (-1, 1), zeroes offsets, and resets scale.
 */
export function configureScreenTransformToFill(screenTransform: ScreenTransform, transform: Transform): void {
  screenTransform.anchors = SCREEN_TRANSFORM_FULL_ANCHOR
  screenTransform.offsets.setSize(vec2.zero())
  transform.setLocalScale(SCREEN_TRANSFORM_SCALE_DEFAULT)
}

/**
 * Applies a size to a ScreenTransform's offsets.
 * @param screenTransform - The ScreenTransform to update.
 * @param width - The width to set.
 * @param height - The height to set.
 */
export function applySizeToScreenTransformOffsets(
  screenTransform: ScreenTransform,
  width: number,
  height: number
): void {
  screenTransform.offsets.setSize(new vec2(width, height))
}

// ═══════════════════════════════════════════════════════════════════════════
// LAYOUT SETTINGS MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Axis mask enabling only the horizontal axis.
 */
const HORIZONTAL_AXIS_MASK: AxisMask = {
  horizontal: true,
  vertical: false,
  depth: false
}

/**
 * Axis mask enabling only the vertical axis.
 */
const VERTICAL_AXIS_MASK: AxisMask = {
  horizontal: false,
  vertical: true,
  depth: false
}

/**
 * Axis mask enabling only the depth axis.
 */
const DEPTH_AXIS_MASK: AxisMask = {
  horizontal: false,
  vertical: false,
  depth: true
}

/**
 * Represents a single layout axis for direction-specific operations.
 */
export type LayoutAxis = "horizontal" | "vertical" | "depth"

/**
 * Creates an axis mask with only the specified axis enabled.
 * Uses static constants to avoid allocation.
 * @param axis - The axis to enable.
 * @returns An axis mask object with the specified axis set to true.
 */
function createAxisMask(axis: LayoutAxis): AxisMask {
  switch (axis) {
    case "horizontal":
      return HORIZONTAL_AXIS_MASK
    case "vertical":
      return VERTICAL_AXIS_MASK
    case "depth":
      return DEPTH_AXIS_MASK
  }
}

/**
 * Caches the original Layoutable settings for enabled axes.
 * Only caches settings for axes that are currently enabled and not already cached.
 * This prevents overwriting original values with LayoutItem-controlled values on re-enable.
 */
export function cacheLayoutableSettings(
  layoutable: Layoutable,
  originalSettings: LayoutableOriginalSettings | null,
  enabled: AxisMask
): LayoutableOriginalSettings {
  const settings = originalSettings || {}

  if (enabled.horizontal) {
    // Only cache if direction is not already cached
    if (settings.layoutWidth === undefined) {
      settings.layoutWidth = layoutable.width
    }
  }
  if (enabled.vertical) {
    // Only cache if direction is not already cached
    if (settings.layoutHeight === undefined) {
      settings.layoutHeight = layoutable.height
    }
  }
  if (enabled.depth) {
    // Only cache if direction is not already cached
    if (settings.layoutDepth === undefined) {
      settings.layoutDepth = layoutable.depth
    }
  }

  return settings
}

/**
 * Caches the original NestableLayout settings for enabled axes.
 * Only caches settings for axes that are currently enabled and not already cached.
 */
function cacheNestableLayoutSettings(
  nestableLayout: NestableLayout,
  originalSettings: LayoutableOriginalSettings | null,
  enabled: AxisMask
): LayoutableOriginalSettings {
  const settings = originalSettings || {}

  if (enabled.horizontal) {
    if (settings.fixedLayoutWidth === undefined) {
      settings.fixedLayoutWidth = nestableLayout.fixedWidth
    }
  }
  if (enabled.vertical) {
    if (settings.fixedLayoutHeight === undefined) {
      settings.fixedLayoutHeight = nestableLayout.fixedHeight
    }
  }
  if (enabled.depth) {
    if (settings.fixedLayoutDepth === undefined) {
      settings.fixedLayoutDepth = nestableLayout.fixedDepth
    }
  }

  return settings
}

/**
 * Syncs the Layoutable's layout size with LayoutItem's current size.
 * Only syncs enabled axes.
 */
export function syncLayoutableSize(
  layoutable: Layoutable,
  size: {width: number; height: number; depth: number},
  enabled: AxisMask
): void {
  if (enabled.horizontal) {
    layoutable.width = size.width
  }
  if (enabled.vertical) {
    layoutable.height = size.height
  }
  if (enabled.depth) {
    layoutable.depth = size.depth
  }
}

/**
 * Enables fixed layout size and syncs layout sizes.
 */
function applyNestableLayoutSettings(nestableLayout: NestableLayout, enabled: AxisMask): void {
  if (enabled.horizontal) {
    nestableLayout.fixedWidth = true
  }
  if (enabled.vertical) {
    nestableLayout.fixedHeight = true
  }
  if (enabled.depth) {
    nestableLayout.fixedDepth = true
  }
}

/**
 * Updates a Layoutable's settings for specific axes: caches current settings, and syncs size.
 * Useful for handling dynamic axis enable/disable events.
 */
export function updateLayoutableAxisSettings(
  layoutable: Layoutable,
  originalSettings: LayoutableOriginalSettings | null,
  size: {width: number; height: number; depth: number},
  axisMask: AxisMask
): LayoutableOriginalSettings | null {
  const updatedOriginalSettings = cacheLayoutableSettings(layoutable, originalSettings, axisMask)
  syncLayoutableSize(layoutable, size, axisMask)
  return updatedOriginalSettings
}

/**
 * Updates a NestableLayout's settings for specific axes: caches current settings, and applies new nestable settings.
 */
export function updateNestableLayoutAxisSettings(
  nestableLayout: NestableLayout,
  originalSettings: LayoutableOriginalSettings | null,
  axisMask: AxisMask
): LayoutableOriginalSettings | null {
  const updatedOriginalSettings = cacheNestableLayoutSettings(nestableLayout, originalSettings, axisMask)
  applyNestableLayoutSettings(nestableLayout, axisMask)
  return updatedOriginalSettings
}

/**
 * Updates cached settings for a specific axis when the direction is enabled.
 * Combines updateLayoutableAxisSettings and updateNestableLayoutAxisSettings for a single axis.
 *
 * @param layoutable - The Layoutable component to update.
 * @param originalSettings - The cached original settings.
 * @param size - The current size values.
 * @param axis - The axis to update.
 * @returns The updated original settings.
 */
export function updateCachedAxisSettings(
  layoutable: Layoutable,
  originalSettings: LayoutableOriginalSettings | null,
  size: {width: number; height: number; depth: number},
  axis: LayoutAxis
): LayoutableOriginalSettings | null {
  const axisMask = createAxisMask(axis)
  let settings = updateLayoutableAxisSettings(layoutable, originalSettings, size, axisMask)
  if (isNestableLayout(layoutable)) {
    settings = updateNestableLayoutAxisSettings(layoutable as NestableLayout, settings, axisMask)
  }
  return settings
}

/**
 * Restores the original Layoutable settings that were cached during initialization.
 * Called only when LayoutItem is destroyed to ensure the nested Layoutable
 * returns to its original configuration.
 */
export function restoreLayoutableSettings(layoutable: Layoutable, settings: LayoutableOriginalSettings | null): void {
  if (!settings) {
    return
  }

  // Restore horizontal settings
  if (settings.layoutWidth !== undefined) {
    layoutable.width = settings.layoutWidth
  }

  // Restore vertical settings
  if (settings.layoutHeight !== undefined) {
    layoutable.height = settings.layoutHeight
  }

  // Restore depth settings
  if (settings.layoutDepth !== undefined) {
    layoutable.depth = settings.layoutDepth
  }
}

/**
 * Restores the original NestableLayout settings that were cached during initialization.
 */
export function restoreNestableLayoutSettings(
  nestableLayout: NestableLayout,
  settings: LayoutableOriginalSettings | null
): void {
  if (!settings) {
    return
  }

  // Restore horizontal settings
  if (settings.fixedLayoutWidth !== undefined) {
    nestableLayout.fixedWidth = settings.fixedLayoutWidth
  }

  // Restore vertical settings
  if (settings.fixedLayoutHeight !== undefined) {
    nestableLayout.fixedHeight = settings.fixedLayoutHeight
  }

  // Restore depth settings
  if (settings.fixedLayoutDepth !== undefined) {
    nestableLayout.fixedDepth = settings.fixedLayoutDepth
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// VISUAL MEASUREMENT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Computes the size from ScreenTransform anchors if available.
 * @returns The size from anchors, or null if not available or zero.
 */
function computeSizeFromScreenTransformAnchors(
  screenTransform: ScreenTransform | null | undefined,
  localScale: vec3
): vec3 | null {
  if (!screenTransform) return null

  const anchors = screenTransform.anchors
  const boundsWidth = (anchors.right - anchors.left) * localScale.x
  const boundsHeight = (anchors.top - anchors.bottom) * localScale.y

  if (boundsWidth > 0 || boundsHeight > 0) {
    return new vec3(boundsWidth, boundsHeight, 0)
  }
  return null
}

/**
 * Computes the bounds of a RenderMeshVisual in local space.
 */
function getRenderMeshVisualBounds(
  visual: RenderMeshVisual,
  localScale: vec3,
  worldToLocal: mat4
): {min: vec3; max: vec3} | null {
  if (isNull(visual) || !visual) return null

  const mesh = visual.mesh
  if (mesh) {
    const localMin = new vec3(
      mesh.aabbMin.x * localScale.x,
      mesh.aabbMin.y * localScale.y,
      mesh.aabbMin.z * localScale.z
    )
    const localMax = new vec3(
      mesh.aabbMax.x * localScale.x,
      mesh.aabbMax.y * localScale.y,
      mesh.aabbMax.z * localScale.z
    )

    return {
      min: minVec3Components(localMin, localMax),
      max: maxVec3Components(localMin, localMax)
    }
  } else {
    return computeLocalBoundsFromWorldAabbScaled(visual.worldAabbMin(), visual.worldAabbMax(), worldToLocal, localScale)
  }
}

/**
 * Computes the bounds of an Image in local space.
 */
function getImageBounds(image: Image, localScale: vec3, worldToLocal: mat4): {min: vec3; max: vec3} | null {
  const bounds = computeLocalBoundsFromWorldAabbScaled(
    image.worldAabbMin(),
    image.worldAabbMax(),
    worldToLocal,
    localScale
  )

  if (bounds.max.x > bounds.min.x && bounds.max.y > bounds.min.y) {
    return bounds
  }
  return null
}

/**
 * Computes the bounds of a Text component in local space.
 */
function getTextBounds(text: Text, localScale: vec3, worldToLocal: mat4): {min: vec3; max: vec3} | null {
  if (text.worldSpaceRect) {
    const rect = text.worldSpaceRect
    const z = text.getTransform().getWorldPosition().z
    const worldMin = new vec3(rect.left, rect.bottom, z)
    const worldMax = new vec3(rect.right, rect.top, z)

    const bounds = computeLocalBoundsFromWorldAabbScaled(worldMin, worldMax, worldToLocal, localScale)

    if (bounds.max.x > bounds.min.x && bounds.max.y > bounds.min.y) {
      return bounds
    }
  }
  return null
}

/**
 * Computes the combined bounds of various visual components.
 * Useful for determining the "visual size" of a SceneObject.
 *
 * @param localScale - The local scale of the object.
 * @param worldToLocal - The world to local transform matrix.
 * @param screenTransform - The ScreenTransform component (optional).
 * @param meshVisuals - Array of RenderMeshVisual components.
 * @param images - Array of Image components.
 * @param texts - Array of Text components.
 * @param fallbackSize - Optional size to use for Images/Texts if they don't have intrinsic bounds.
 * @returns The combined bounds of all components, or null if no valid components found.
 */
export function measureVisualComponents(
  localScale: vec3,
  worldToLocal: mat4,
  screenTransform: ScreenTransform | null | undefined,
  meshVisuals: RenderMeshVisual[],
  images: Image[],
  texts: Text[],
  fallbackSize?: {width: number; height: number}
): vec3 | null {
  let minX = Infinity
  let minY = Infinity
  let minZ = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  let maxZ = -Infinity
  let hasBounds = false

  const expandBounds = (bMin: vec3, bMax: vec3) => {
    if (bMin.x < minX) minX = bMin.x
    if (bMin.y < minY) minY = bMin.y
    if (bMin.z < minZ) minZ = bMin.z

    if (bMax.x > maxX) maxX = bMax.x
    if (bMax.y > maxY) maxY = bMax.y
    if (bMax.z > maxZ) maxZ = bMax.z

    hasBounds = true
  }

  // Pre-calculate anchor size as it's shared across all components on this SceneObject
  const anchorSize = computeSizeFromScreenTransformAnchors(screenTransform, localScale)

  // If anchors are present, they contribute to the bounding box (centered)
  if (anchorSize) {
    // ScreenTransform anchors primarily define X/Y. Z is effectively 0 unless expanded by other components.
    const halfSizeX = anchorSize.x * 0.5
    const halfSizeY = anchorSize.y * 0.5
    const halfSizeZ = anchorSize.z * 0.5

    if (-halfSizeX < minX) minX = -halfSizeX
    if (-halfSizeY < minY) minY = -halfSizeY
    if (-halfSizeZ < minZ) minZ = -halfSizeZ

    if (halfSizeX > maxX) maxX = halfSizeX
    if (halfSizeY > maxY) maxY = halfSizeY
    if (halfSizeZ > maxZ) maxZ = halfSizeZ

    hasBounds = true
  }

  for (const visual of meshVisuals) {
    const bounds = getRenderMeshVisualBounds(visual, localScale, worldToLocal)
    if (bounds) {
      expandBounds(bounds.min, bounds.max)
    }
  }

  const expandWithFallback = (bounds: {min: vec3; max: vec3} | null) => {
    if (bounds) {
      expandBounds(bounds.min, bounds.max)
    } else if (fallbackSize) {
      const halfW = fallbackSize.width * 0.5
      const halfH = fallbackSize.height * 0.5

      if (-halfW < minX) minX = -halfW
      if (-halfH < minY) minY = -halfH
      if (0 < minZ) minZ = 0

      if (halfW > maxX) maxX = halfW
      if (halfH > maxY) maxY = halfH
      if (0 > maxZ) maxZ = 0

      hasBounds = true
    }
  }

  for (const image of images) {
    expandWithFallback(getImageBounds(image, localScale, worldToLocal))
  }

  for (const text of texts) {
    expandWithFallback(getTextBounds(text, localScale, worldToLocal))
  }

  if (!hasBounds) return null

  // Calculate size from the union bounds
  const width = Math.max(0, maxX - minX)
  const height = Math.max(0, maxY - minY)
  const depth = Math.max(0, maxZ - minZ)

  // Ensure non-negative and return full size
  return new vec3(width, height, depth)
}

// ═══════════════════════════════════════════════════════════════════════════
// VISUAL SIZING & SCALING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Applies a local size to a Text component by calculating and setting its worldSpaceRect.
 * Requires the parent's world scale to convert local dimensions to world dimensions.
 * @param text - The Text component.
 * @param localSize - The target local size.
 * @param parentWorldScale - The world scale of the parent object.
 */
function applyLocalSizeToText(text: Text, localSize: vec3, parentWorldScale: vec3): void {
  const worldWidth = localSize.x * parentWorldScale.x
  const worldHeight = localSize.y * parentWorldScale.y

  text.worldSpaceRect = Rect.create(-worldWidth * 0.5, worldWidth * 0.5, -worldHeight * 0.5, worldHeight * 0.5)
}

/**
 * Updates a list of Text components to fit a target size in local space.
 */
export function resizeTextsToFit(texts: Text[], targetSize: vec3, parentObject: SceneObject | null): void {
  if (texts.length === 0) return

  const parentScale = parentObject ? parentObject.getTransform().getWorldScale() : vec3.one()

  texts.forEach((text) => {
    applyLocalSizeToText(text, targetSize, parentScale)
  })
}

/**
 * Calculates the scale required to fit a list of RenderMeshVisuals into a target size.
 * Uses the mesh's AABB to determine the unscaled size.
 */
function computeRenderMeshScaleRatio(visuals: RenderMeshVisual[], targetSize: vec3): vec3 | null {
  if (visuals.length === 0) return null

  const combinedMin = new vec3(Infinity, Infinity, Infinity)
  const combinedMax = new vec3(-Infinity, -Infinity, -Infinity)
  let hasMesh = false

  visuals.forEach((rmv) => {
    if (isNull(rmv) || !rmv) return
    const mesh = rmv.mesh
    if (mesh) {
      hasMesh = true
      combinedMin.x = Math.min(combinedMin.x, mesh.aabbMin.x)
      combinedMin.y = Math.min(combinedMin.y, mesh.aabbMin.y)
      combinedMin.z = Math.min(combinedMin.z, mesh.aabbMin.z)

      combinedMax.x = Math.max(combinedMax.x, mesh.aabbMax.x)
      combinedMax.y = Math.max(combinedMax.y, mesh.aabbMax.y)
      combinedMax.z = Math.max(combinedMax.z, mesh.aabbMax.z)
    }
  })

  if (!hasMesh) return null

  const meshSize = combinedMax.sub(combinedMin)
  return computeScaleRatio(meshSize, targetSize)
}

/**
 * Applies frustum culling settings to a list of RenderMeshVisuals based on a target size.
 * Sets the culling mode to UserDefinedAABB and updates the bounds.
 */
function applyFrustumCullingToVisuals(visuals: RenderMeshVisual[], targetSize: vec3): void {
  if (visuals.length === 0) return

  const frustumCullMin = new vec3(-targetSize.x / 2, -targetSize.y / 2, -targetSize.z / 2)
  const frustumCullMax = new vec3(targetSize.x / 2, targetSize.y / 2, targetSize.z / 2)

  visuals.forEach((renderMeshVisual) => {
    if (isNull(renderMeshVisual) || !renderMeshVisual) {
      return
    }
    const mesh = renderMeshVisual.mesh
    if (mesh) {
      renderMeshVisual.mainPass.frustumCullMode = FrustumCullMode.UserDefinedAABB
      renderMeshVisual.mainPass.frustumCullMin = frustumCullMin
      renderMeshVisual.mainPass.frustumCullMax = frustumCullMax
    }
  })
}

/**
 * Calculates the scale required to fit a list of Images into a target size.
 */
function computeImageScaleRatio(images: Image[], targetSize: vec3, worldToLocal: mat4): vec3 | null {
  if (images.length === 0) return null

  let combinedMin = new vec3(Infinity, Infinity, Infinity)
  let combinedMax = new vec3(-Infinity, -Infinity, -Infinity)
  let hasBounds = false

  images.forEach((image) => {
    const worldMin = image.worldAabbMin()
    const worldMax = image.worldAabbMax()

    const bounds = computeLocalBoundsFromWorldAabb(worldMin, worldMax, worldToLocal)
    combinedMin = minVec3Components(combinedMin, bounds.min)
    combinedMax = maxVec3Components(combinedMax, bounds.max)
    hasBounds = true
  })

  if (!hasBounds) return null

  const unscaledSize = combinedMax.sub(combinedMin).uniformScale(0.5)
  return computeScaleRatio(unscaledSize, targetSize)
}

/**
 * Applies scaling to fit RenderMeshVisuals into a target size.
 * Updates the transform's local scale and applies frustum culling.
 * Handles ScreenTransform special case (Z-scaling).
 */
function applyScaleToFitRenderMesh(
  visuals: RenderMeshVisual[],
  targetSize: vec3,
  transform: Transform,
  isScreenTransform: boolean
): void {
  const scale = computeRenderMeshScaleRatio(visuals, targetSize)
  if (scale) {
    if (isScreenTransform) {
      transform.setLocalScale(new vec3(1, 1, scale.z / 2))
    } else {
      transform.setLocalScale(scale)
    }
    applyFrustumCullingToVisuals(visuals, targetSize)
  }
}

/**
 * Applies scaling to fit Images into a target size.
 * Updates the transform's local scale.
 */
function applyScaleToFitImage(images: Image[], targetSize: vec3, transform: Transform): void {
  const scale = computeImageScaleRatio(images, targetSize, transform.getInvertedWorldTransform())
  if (scale) {
    transform.setLocalScale(scale)
  }
}

/**
 * Calculates the scale required to fit diverse visuals (meshes and images) into a target size.
 * Returns the calculated scale which should be applied to the object.
 *
 * @param targetSize - The target size to fit into.
 * @param meshVisuals - Array of RenderMeshVisual components.
 * @param images - Array of Image components.
 * @param invertedWorldTransform - The inverted world transform (for Image bounds calculation).
 * @param isScreenTransform - Whether the object has a ScreenTransform (affects Z scaling).
 * @returns The unified scale vector.
 */
function calculateUnifiedFitScale(
  targetSize: vec3,
  meshVisuals: RenderMeshVisual[],
  images: Image[],
  invertedWorldTransform: mat4,
  isScreenTransform: boolean
): vec3 {
  const meshScale = computeRenderMeshScaleRatio(meshVisuals, targetSize)
  const imageScale = !isScreenTransform ? computeImageScaleRatio(images, targetSize, invertedWorldTransform) : null

  const finalScale = computeUnifiedScaleRatio(meshScale, imageScale)

  if (isScreenTransform) {
    const zScale = meshScale ? meshScale.z / finalScale.y : finalScale.z
    return new vec3(1, 1, zScale)
  } else {
    return finalScale
  }
}

/**
 * Applies a unified scale to a transform to fit visual components into a target size.
 * Also applies frustum culling to mesh visuals.
 *
 * @param transform - The transform to scale.
 * @param targetSize - The target size to fit.
 * @param meshVisuals - Array of RenderMeshVisual components.
 * @param images - Array of Image components.
 * @param invertedWorldTransform - The inverted world transform (for Image bounds calculation).
 * @param isScreenTransform - Whether the object has a ScreenTransform (affects Z scaling).
 */
export function applyUnifiedScale(
  transform: Transform,
  targetSize: vec3,
  meshVisuals: RenderMeshVisual[],
  images: Image[],
  invertedWorldTransform: mat4,
  isScreenTransform: boolean
): void {
  const finalScale = calculateUnifiedFitScale(
    targetSize,
    meshVisuals,
    images,
    invertedWorldTransform,
    isScreenTransform
  )

  transform.setLocalScale(finalScale)
  applyFrustumCullingToVisuals(meshVisuals, targetSize)
}

/**
 * Applies a target size to various visual components, handling ScreenTransform vs standard Transform differences.
 */
export function applySizeToVisualComponents(
  targetSize: vec3,
  transform: Transform,
  parent: SceneObject | null,
  screenTransform: ScreenTransform | undefined,
  renderMeshVisuals: RenderMeshVisual[],
  images: Image[],
  texts: Text[]
): void {
  // Apply to RenderMeshVisuals
  applyScaleToFitRenderMesh(renderMeshVisuals, targetSize, transform, !!screenTransform)

  // Apply to ScreenTransform or Image/Text
  if (screenTransform) {
    applySizeToScreenTransformOffsets(screenTransform, targetSize.x, targetSize.y)
  } else {
    applyScaleToFitImage(images, targetSize, transform)
    resizeTextsToFit(texts, targetSize, parent)
  }
}
