/** Stencil reference value used by masks - must match between Mask3D writer and masked content reader */
export const STENCIL_MASK_REF_VALUE = 1

/**
 * A 3D stencil mask component that creates an invisible volumetric mask using the stencil buffer.
 * Objects rendered with matching stencil settings will only be visible within the mask's bounds.
 * The mask uses a box mesh that is invisible to both color and depth buffers but writes to the stencil buffer.
 *
 * @remarks
 * **Important:** Developers should create instances of Mask3D through the {@link Mask3DManager} rather than
 * directly using `sceneObject.createComponent()`. The Mask3DManager handles proper setup and lifecycle management.
 */
@component
export class Mask3D extends BaseScriptComponent {
  private transform: Transform
  private rmv: RenderMeshVisual

  private static readonly STENCIL_MASK_MESH: RenderMesh = requireAsset("../../Meshes/Mask3DBox.mesh") as RenderMesh
  private static readonly STENCIL_MASK_MATERIAL: Material = requireAsset("../../Materials/StencilMask.mat") as Material
  private readonly RENDER_ORDER = -10000

  private _debug: boolean = false

  /**
   * Gets the layer set for this mask's scene object.
   * @returns The LayerSet associated with this mask
   */
  public get layerSet(): LayerSet {
    return this.sceneObject.layer
  }

  /**
   * Gets the mask's position in world space coordinates.
   * @returns The world position as a vec3
   */
  public get worldPosition(): vec3 {
    return this.transform.getWorldPosition()
  }

  /**
   * Sets the mask's position in world space coordinates.
   * @param value - The new world position as a vec3
   */
  public set worldPosition(value: vec3) {
    this.transform.setWorldPosition(value)
  }

  /**
   * Gets the mask's position relative to its parent.
   * @returns The local position as a vec3
   */
  public get localPosition(): vec3 {
    return this.transform.getLocalPosition()
  }

  /**
   * Sets the mask's position relative to its parent.
   * @param value - The new local position as a vec3
   */
  public set localPosition(value: vec3) {
    this.transform.setLocalPosition(value)
  }

  /**
   * Gets the mask's rotation in world space coordinates.
   * @returns The world rotation as a quat
   */
  public get worldRotation(): quat {
    return this.transform.getWorldRotation()
  }

  /**
   * Sets the mask's rotation in world space coordinates.
   * @param value - The new world rotation as a quat
   */
  public set worldRotation(value: quat) {
    this.transform.setWorldRotation(value)
  }

  /**
   * Gets the mask's rotation relative to its parent.
   * @returns The local rotation as a quat
   */
  public get localRotation(): quat {
    return this.transform.getLocalRotation()
  }

  /**
   * Sets the mask's rotation relative to its parent.
   * @param value - The new local rotation as a quat
   */
  public set localRotation(value: quat) {
    this.transform.setLocalRotation(value)
  }

  /**
   * Gets the mask's scale in world space coordinates.
   * @returns The world scale as a vec3
   */
  public get worldScale(): vec3 {
    return this.transform.getWorldScale()
  }

  /**
   * Sets the mask's scale in world space coordinates.
   * @param value - The new world scale as a vec3
   */
  public set worldScale(value: vec3) {
    this.transform.setWorldScale(value)
  }

  /**
   * Gets the mask's scale relative to its parent.
   * @returns The local scale as a vec3
   */
  public get localScale(): vec3 {
    return this.transform.getLocalScale()
  }

  /**
   * Sets the mask's scale relative to its parent.
   * @param value - The new local scale as a vec3
   */
  public set localScale(value: vec3) {
    this.transform.setLocalScale(value)
  }

  /**
   * Gets whether the mask is in debug mode.
   * @returns True if the mask is in debug mode, false otherwise.
   */
  public get debug(): boolean {
    return this._debug
  }

  /**
   * Sets whether the mask is in debug mode.
   * @param value - True to enable debug mode, false to disable.
   */
  public set debug(value: boolean) {
    this._debug = value
    this.rmv.mainPass.colorMask = this._debug
      ? new vec4b(false, false, true, false)
      : new vec4b(false, false, false, false)
  }

  public onAwake() {
    this.transform = this.sceneObject.getTransform()
    this.rmv = this.sceneObject.createComponent("Component.RenderMeshVisual")
    this.rmv.mesh = Mask3D.STENCIL_MASK_MESH
    this.rmv.mainMaterial = Mask3D.STENCIL_MASK_MATERIAL.clone()
    this.rmv.renderOrder = this.RENDER_ORDER

    this.setupStencilMask()

    this.createEvent("OnDestroyEvent").bind(() => {
      this.rmv.destroy()
    })
  }

  /**
   * Configures the stencil buffer settings for the mask.
   * Sets up the render pass to be invisible (no color or depth writes) but write to the stencil buffer.
   * The stencil is configured to always pass and write a reference value of 1.
   */
  private setupStencilMask() {
    const pass = this.rmv.mainPass

    // Color Write: Disable all channels (Invisible)
    pass.colorMask = this._debug ? new vec4b(false, false, true, false) : new vec4b(false, false, false, false)

    // Depth Write: Disable (Invisible to depth)
    pass.depthWrite = false

    // Depth Test: Disable (so it always passes, even if inside a wall)
    pass.depthTest = false

    // Culling: Off (Double-sided, works from inside the box too)
    pass.twoSided = true

    // Stencil Mode Configuration
    const stencilState = pass.stencilState

    // Enable stencil test
    stencilState.enabled = true

    // Stencil Function: Always
    stencilState.stencilCompareFunction = StencilFunction.Always

    // Stencil Pass Operation: Replace (when both stencil and depth pass)
    stencilState.depthStencilPassOperation = StencilOperation.Replace

    // Stencil Ref: 1
    stencilState.referenceValue = STENCIL_MASK_REF_VALUE

    // Read/Write Mask: 255 (0xFF - all bits enabled)
    stencilState.readMask = 255
    stencilState.writeMask = 255

    // Keep stencil fail operations as Keep (default behavior)
    stencilState.stencilFailureOperation = StencilOperation.Keep
    stencilState.depthFailureOperation = StencilOperation.Keep
  }
}
