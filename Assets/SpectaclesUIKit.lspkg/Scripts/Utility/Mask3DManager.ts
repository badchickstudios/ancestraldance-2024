import {Singleton} from "SpectaclesInteractionKit.lspkg/Decorators/Singleton"
import WorldCameraFinderProvider from "SpectaclesInteractionKit.lspkg/Providers/CameraProvider/WorldCameraFinderProvider"
import NativeLogger from "SpectaclesInteractionKit.lspkg/Utils/NativeLogger"
import {Mask3D, STENCIL_MASK_REF_VALUE} from "./Mask3D"

const log = new NativeLogger("Mask3DManager")

type StencilStateData = {
  enabled: boolean
  stencilCompareFunction: StencilFunction
  referenceValue: number
  depthStencilPassOperation: StencilOperation
  stencilFailureOperation: StencilOperation
  depthFailureOperation: StencilOperation
}

/**
 * Manages the creation and lifecycle of 3D stencil masks and their associated content.
 * This singleton class handles mask camera setup, layer management, and stencil state configuration
 * for objects that should be masked within volumetric bounds.
 *
 * @remarks
 * The Mask3DManager is responsible for:
 * - Creating {@link Mask3D} instances with proper layer and camera configuration
 * - Managing multiple masks per layer set
 * - Registering and unregistering scene objects and materials as masked content
 * - Preserving and restoring original layer sets and stencil states
 */
@Singleton
export class Mask3DManager {
  public static getInstance: () => Mask3DManager

  private readonly mainCamera: Camera = WorldCameraFinderProvider.getInstance().getComponent()

  private readonly layerSetToMaskData: Map<
    string, //LayerSet objects in Lens Studio are likely wrapper objects, meaning layerSet !== sceneObject.layer even if they refer to the same layer index
    {
      maskCamera: Camera
      masks: Set<Mask3D>
      maskedContent: {sceneObjects: Set<SceneObject>; materials: Set<Material>}
    }
  > = new Map()
  private readonly sceneObjectToMask: WeakMap<SceneObject, Mask3D> = new WeakMap()

  // Masked content original layer sets and stencil states
  private readonly sceneObjectToOriginalLayerSet: WeakMap<SceneObject, LayerSet> = new WeakMap()
  private readonly materialToOriginalStencilState: WeakMap<Material, StencilStateData> = new WeakMap()

  private readonly maskedContentStencilState: Readonly<StencilStateData> = {
    enabled: true, // 1. Enable the Stencil Test
    stencilCompareFunction: StencilFunction.Equal, // 2. Stencil Function: Equal (render only where mask wrote)
    referenceValue: STENCIL_MASK_REF_VALUE, // 3. Set the Ref ID (Must match Mask3D's writer value)
    // 4. Set Operations (Don't mess up the buffer)
    depthStencilPassOperation: StencilOperation.Keep,
    stencilFailureOperation: StencilOperation.Keep,
    depthFailureOperation: StencilOperation.Keep
  } as const

  public constructor() {
    // Prevent stencil buffer from being cleared between frames, allowing masks to persist
    if (this.mainCamera.depthStencilRenderTarget) {
      this.mainCamera.depthStencilRenderTarget.stencilClearOption = StencilClearOption.None
    } else {
      log.e("Main camera does not have a depthStencilRenderTarget. 3D masking will not work correctly.")
    }
  }

  /**
   * Creates and returns a new 3D mask instance on a new SceneObject.
   * The mask is automatically cleaned up when destroyed, and if it's the last mask
   * on its layer, the associated camera is also destroyed.
   *
   * @param layerSet - Optional LayerSet to use for the mask. If not provided, a new unique LayerSet is created.
   * @returns A new Mask3D instance
   */
  public createMask(layerSet?: LayerSet): Mask3D {
    const maskLayerSet = layerSet ?? LayerSet.makeUnique()
    const maskObject = global.scene.createSceneObject("Mask")
    return this.createMaskInternal(maskObject, maskLayerSet)
  }

  /**
   * Returns a cached mask for the SceneObject if it exists, or creates a new mask on that SceneObject.
   * The mask is automatically cleaned up when destroyed.
   *
   * @param sceneObject - The SceneObject to get or create a mask for
   * @param layerSet - Optional LayerSet to use if creating a new mask. If not provided, a new unique LayerSet is created.
   * @returns A Mask3D instance on the provided SceneObject
   */
  public getMaskForSceneObject(sceneObject: SceneObject, layerSet?: LayerSet): Mask3D {
    // Return cached mask if it exists
    const existingMask = this.findMaskOnSceneObject(sceneObject)
    if (existingMask) {
      return existingMask
    }

    const maskLayerSet = layerSet ?? LayerSet.makeUnique()
    return this.createMaskInternal(sceneObject, maskLayerSet)
  }

  /**
   * Finds a mask associated with a SceneObject
   * @param sceneObject - The SceneObject to check
   * @returns The Mask3D instance if it exists, null otherwise
   */
  public findMaskOnSceneObject(sceneObject: SceneObject): Mask3D | null {
    return this.sceneObjectToMask.get(sceneObject) ?? null
  }

  /**
   * Gets all masks associated with a specific layer set
   * @param layerSet - The LayerSet to query
   * @returns ReadonlySet of Mask3D instances on the layer set
   */
  public getMasksForLayer(layerSet: LayerSet): ReadonlySet<Mask3D> {
    const maskData = this.layerSetToMaskData.get(layerSet.toString())
    return maskData ? maskData.masks : new Set()
  }

  /**
   * Registers scene objects and materials as masked content for a specific layer set.
   * This method configures the objects to render only within the bounds of masks on the specified layer.
   * Original layer sets and stencil states are cached and can be restored later.
   *
   * @param layerSet - The layer set that the masks use
   * @param sceneObjects - Array of scene objects to be masked
   * @param materials - Optional array of materials whose stencil states should be configured for masking.
   *                    If not provided, materials will be automatically extracted from the scene objects'
   *                    RenderMeshVisual, Image, and Text components.
   *
   * @remarks
   * The method performs two main operations:
   * 1. Assigns all scene objects to the specified layer set (caching their original layers)
   * 2. Configures materials' stencil states to only render where stencil value equals STENCIL_MASK_REF_VALUE (caching original states)
   */
  public registerMaskedContentsByLayer(layerSet: LayerSet, sceneObjects: SceneObject[], materials?: Material[]): void {
    // Cache and update layer sets
    const maskData = this.layerSetToMaskData.get(layerSet.toString())
    if (!maskData) {
      log.w(`Registering content to layer ${layerSet} but no Mask3D exists on this layer yet.`)
      return
    }

    for (const sceneObject of sceneObjects) {
      // Skip if already managed to prevent overwriting original layer set
      if (!this.sceneObjectToOriginalLayerSet.has(sceneObject)) {
        this.sceneObjectToOriginalLayerSet.set(sceneObject, sceneObject.layer)
      } else {
        const prevLayerSetMaskData = this.layerSetToMaskData.get(sceneObject.layer.toString())
        if (prevLayerSetMaskData) {
          prevLayerSetMaskData.maskedContent.sceneObjects.delete(sceneObject)
        }
      }

      if (sceneObject.layer !== layerSet) {
        sceneObject.layer = layerSet
      }
      maskData.maskedContent.sceneObjects.add(sceneObject)
    }

    // Auto-extract materials if not provided
    const materialsToRegister = materials ?? this.extractMaterialsFromSceneObjects(sceneObjects)

    // Cache and configure stencil states for masking
    for (const material of materialsToRegister) {
      const state = material.mainPass.stencilState
      if (!this.materialToOriginalStencilState.has(material)) {
        this.materialToOriginalStencilState.set(material, this.extractStencilState(state))
      } else {
        for (const data of this.layerSetToMaskData.values()) {
          if (data.maskedContent.materials.delete(material)) {
            break // A material is usually only bound to one active mask context at a time in this usage pattern
          }
        }
      }

      this.applyStencilState(state, this.maskedContentStencilState)
      maskData.maskedContent.materials.add(material)
    }
  }

  /**
   * Unregisters scene objects and materials from being masked content.
   * Restores the original layer sets for scene objects and original stencil states for materials
   * that were cached during registration.
   *
   * @param sceneObjects - Array of scene objects to unregister
   * @param materials - Optional array of materials whose stencil states should be restored.
   *                    If not provided, materials will be automatically extracted from the scene objects'
   *                    RenderMeshVisual, Image, and Text components.
   *
   * @remarks
   * The method performs two main operations:
   * 1. Restores scene objects to their original layer sets (if they were cached)
   * 2. Restores materials' stencil states to their original values (if they were cached)
   *
   * After unregistration, the cached data for these objects and materials is cleared.
   */
  public unregisterMaskedContents(sceneObjects: SceneObject[], materials?: Material[]): void {
    // Restore original layer sets
    for (const sceneObject of sceneObjects) {
      const originalLayerSet = this.sceneObjectToOriginalLayerSet.get(sceneObject)
      if (originalLayerSet !== undefined) {
        // Only access properties if object is still valid
        if (!isNull(sceneObject) && sceneObject) {
          // Remove from tracking in maskData
          const layerSet = sceneObject.layer
          const maskData = this.layerSetToMaskData.get(layerSet.toString())
          if (maskData) {
            maskData.maskedContent.sceneObjects.delete(sceneObject)
          }
          sceneObject.layer = originalLayerSet
        } else {
          // Object destroyed, clean up from all active mask sets to prevent leaks
          for (const data of this.layerSetToMaskData.values()) {
            if (data.maskedContent.sceneObjects.delete(sceneObject)) {
              break
            }
          }
        }
        this.sceneObjectToOriginalLayerSet.delete(sceneObject)
      }
    }

    // Auto-extract materials if not provided
    const materialsToUnregister = materials ?? this.extractMaterialsFromSceneObjects(sceneObjects)

    // Restore original stencil states
    for (const material of materialsToUnregister) {
      const originalStencilState = this.materialToOriginalStencilState.get(material)
      if (originalStencilState !== undefined) {
        // Remove from tracking in maskDatas
        for (const maskData of this.layerSetToMaskData.values()) {
          if (maskData.maskedContent.materials.delete(material)) {
            break // A material is usually only bound to one active mask context at a time in this usage pattern
          }
        }

        this.applyStencilState(material.mainPass.stencilState, originalStencilState)
        this.materialToOriginalStencilState.delete(material)
      }
    }
  }

  /**
   * Checks if a scene object is currently registered as masked content
   * @param sceneObject - The SceneObject to check
   * @returns True if the scene object is registered as masked content, false otherwise
   */
  public isSceneObjectMasked(sceneObject: SceneObject): boolean {
    return this.sceneObjectToOriginalLayerSet.has(sceneObject)
  }

  /**
   * Extracts all materials from the given scene objects by inspecting their
   * BaseMeshVisual (RenderMeshVisual, Image, and Text components).
   *
   * @param sceneObjects - Array of scene objects to extract materials from
   * @returns Array of unique materials found on the scene objects
   */
  private extractMaterialsFromSceneObjects(sceneObjects: SceneObject[]): Material[] {
    const materialSet = new Set<Material>()

    const addMaterial = (material: Material | null | undefined) => {
      if (material && !materialSet.has(material)) {
        materialSet.add(material)
      }
    }

    for (const sceneObject of sceneObjects) {
      if (isNull(sceneObject) || !sceneObject) {
        continue
      }

      const baseMeshVisuals = sceneObject.getComponents("Component.BaseMeshVisual")
      for (const baseMeshVisual of baseMeshVisuals) {
        if ((baseMeshVisual as any).getMaterialsCount) {
          const count = (baseMeshVisual as any).getMaterialsCount()
          for (let i = 0; i < count; i++) {
            addMaterial((baseMeshVisual as any).getMaterial(i))
          }
        }
      }
    }

    return [...materialSet]
  }

  private extractStencilState(state: StencilState): StencilStateData {
    return {
      enabled: state.enabled,
      stencilCompareFunction: state.stencilCompareFunction,
      referenceValue: state.referenceValue,
      depthStencilPassOperation: state.depthStencilPassOperation,
      stencilFailureOperation: state.stencilFailureOperation,
      depthFailureOperation: state.depthFailureOperation
    }
  }

  private applyStencilState(state: StencilState, data: Readonly<StencilStateData>): void {
    state.enabled = data.enabled
    state.stencilCompareFunction = data.stencilCompareFunction
    state.referenceValue = data.referenceValue
    state.depthStencilPassOperation = data.depthStencilPassOperation
    state.stencilFailureOperation = data.stencilFailureOperation
    state.depthFailureOperation = data.depthFailureOperation
  }

  private createMaskInternal(sceneObject: SceneObject, layerSet: LayerSet): Mask3D {
    const originalLayer = sceneObject.layer
    sceneObject.layer = layerSet
    const mask = sceneObject.createComponent(Mask3D.getTypeName())
    this.sceneObjectToMask.set(sceneObject, mask)
    let maskData = this.layerSetToMaskData.get(layerSet.toString())
    if (!maskData) {
      maskData = {
        maskCamera: this.createMaskCamera(layerSet),
        masks: new Set(),
        maskedContent: {sceneObjects: new Set(), materials: new Set()}
      }
      this.layerSetToMaskData.set(layerSet.toString(), maskData)
    }
    maskData.masks.add(mask)

    mask.createEvent("OnDestroyEvent").bind(() => {
      if (maskData) {
        if (maskData.masks.delete(mask)) {
          if (maskData.masks.size === 0) {
            // Auto-restore all content registered to this layer
            this.unregisterMaskedContents(
              [...maskData.maskedContent.sceneObjects],
              [...maskData.maskedContent.materials]
            )

            maskData.maskCamera.sceneObject.destroy()
            this.layerSetToMaskData.delete(layerSet.toString())
          }
        }
      }
      if (!isNull(sceneObject) && sceneObject) {
        sceneObject.layer = originalLayer
        this.sceneObjectToMask.delete(sceneObject)
      }
    })

    return mask
  }

  private createMaskCamera(layerSet: LayerSet): Camera {
    const maskCameraObject = global.scene.createSceneObject(`MaskCamera_${layerSet.toString()}`)
    maskCameraObject.layer = layerSet
    maskCameraObject.setParent(this.mainCamera.sceneObject)
    const camera = maskCameraObject.createComponent("Camera")
    camera.renderLayer = layerSet
    camera.renderTarget = this.mainCamera.renderTarget

    // Sync optical properties with main camera to prevent projection mismatch
    camera.fov = this.mainCamera.fov
    camera.near = this.mainCamera.near
    camera.far = this.mainCamera.far
    camera.type = this.mainCamera.type

    // Render after the main camera
    camera.renderOrder = this.mainCamera.renderOrder + 1
    // Draw over the world
    camera.enableClearColor = false
    // Respect real-world depth
    camera.enableClearDepth = false

    // Configure depth and stencil clear options via depthStencilRenderTarget
    const dsTarget = camera.depthStencilRenderTarget
    if (dsTarget) {
      // Clear Depth: Uncheck (Crucial! We want to respect real-world depth)
      dsTarget.depthClearOption = DepthClearOption.None

      // Clear Stencil: Check (Crucial! This gives us a fresh slate for our mask)
      dsTarget.stencilClearOption = StencilClearOption.CustomValue
      dsTarget.clearStencilValue = 0
    }
    return camera
  }
}
