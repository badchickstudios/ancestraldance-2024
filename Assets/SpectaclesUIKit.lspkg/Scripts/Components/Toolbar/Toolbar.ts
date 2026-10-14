import {Interactable} from "SpectaclesInteractionKit.lspkg/Components/Interaction/Interactable/Interactable"
import {Frame} from "../Frame/Frame"
import {ToolbarAttachedItemPositioner} from "./Helpers/ToolbarAttachedItemPositioner"
import {ToolbarAutoHideManager} from "./Helpers/ToolbarAutoHideManager"
import {ToolbarBackground} from "./Helpers/ToolbarBackground"
import {ToolbarFactory} from "./Helpers/ToolbarFactory"
import {ToolbarFramePositioner} from "./Helpers/ToolbarFramePositioner"
import {ToolbarLayoutManager} from "./Helpers/ToolbarLayoutManager"
import {ToolbarSizeCalculator} from "./Helpers/ToolbarSizeCalculator"
import {ToolbarItem} from "./Items/ToolbarItem"
import {ToolbarSeparator} from "./Items/ToolbarSeparator"
import {ToolbarItemInput} from "./ToolbarItemInput"
import {LayoutConstraints, ToolbarLayoutResult} from "./Types/ToolbarLayoutTypes"
import {
  AnyToolbarItemConfig,
  getDefaultBackgroundConfig,
  mergePadding,
  ToolbarConfig,
  ToolbarDirections,
  ToolbarFramePositionEnum,
  ToolbarItemType,
  ToolbarSizingMode,
  validateToolbarConfig
} from "./Types/ToolbarSchema"

/**
 * Toolbar component: lays out buttons, text fields, sliders, toggles, separators, and custom items.
 * Can be attached to a Frame or used standalone. Call {@link Toolbar.initialize} before using
 * programmatic API (e.g. {@link Toolbar.addItem}); when using scene children with ToolbarItemInput,
 * initialization runs on start.
 */
@component
export class Toolbar extends BaseScriptComponent {
  @ui.group_start("Toolbar Settings")
  @input
  @allowUndefined
  @hint("Optional: Frame component to attach the toolbar to. Leave empty for standalone toolbar.")
  public frame: Frame | null = null

  @input
  @hint(
    "When enabled, toolbar fades when not targeted. With a Frame attached, targeting the Frame shows it; otherwise targeting the toolbar shows it."
  )
  public autoHideWhenFrameNotTargeted: boolean = false

  @input
  @widget(new ComboBoxWidget([new ComboBoxItem("Horizontal", "horizontal"), new ComboBoxItem("Vertical", "vertical")]))
  @hint("Direction items are laid out in the toolbar.")
  public direction: string = ToolbarDirections.HORIZONTAL
  @ui.group_end
  @ui.group_start("Size Settings")
  @input("vec2", "{25,5}")
  @hint("Size of the toolbar in centimeters (width, height).")
  public size: vec2 = new vec2(25, 5)

  @input
  @widget(
    new ComboBoxWidget([
      new ComboBoxItem("Bottom", "bottom"),
      new ComboBoxItem("Top", "top"),
      new ComboBoxItem("Left", "left"),
      new ComboBoxItem("Right", "right")
    ])
  )
  @hint("Position of the toolbar relative to the Frame.")
  public framePosition: string = ToolbarFramePositionEnum.BOTTOM

  @input("number", "1")
  @hint("Gap between the toolbar and the Frame in centimeters.")
  public frameGap: number = 1

  @input
  @hint("Place toolbar inside frame (inner area) or outside. Gap applies in both cases.")
  public isToolbarInsideFrame: boolean = false

  @input
  @hint("Match toolbar size to Frame (scale factors below). Uses inner size when inside frame.")
  public fitToFrame: boolean = false

  @input("number", "1")
  @hint("Width scale relative to Frame (1.0 = same width, 0.5 = half width). Only for horizontal fit-to-frame mode.")
  @showIf("fitToFrame")
  public frameSizeScaleX: number = 1.0

  @input("number", "1")
  @hint("Height scale relative to Frame (1.0 = same height, 0.5 = half height). Only for vertical fit-to-frame mode.")
  @showIf("fitToFrame")
  public frameSizeScaleY: number = 1.0
  @ui.group_end
  @ui.group_start("Layout Settings")
  @input("number", "0.5")
  @hint("Spacing between items in centimeters.")
  public spacing: number = 0.5

  @input("number", "1")
  @hint("Left padding in centimeters.")
  public paddingLeft: number = 1

  @input("number", "1")
  @hint("Right padding in centimeters.")
  public paddingRight: number = 1

  @input("number", "0.5")
  @hint("Top padding in centimeters.")
  public paddingTop: number = 0.5

  @input("number", "0.5")
  @hint("Bottom padding in centimeters.")
  public paddingBottom: number = 0.5
  @ui.group_end
  @ui.group_start("Background")
  @input("vec4", "{0.173,0.173,0.173,1}")
  @hint("Toolbar background color (RGBA, 0–1).")
  @widget(new ColorWidget())
  public backgroundColor: vec4
  @ui.group_end
  private _config: ToolbarConfig
  private _factory: ToolbarFactory
  private _layoutManager: ToolbarLayoutManager
  private _background: ToolbarBackground
  private _layoutResult: ToolbarLayoutResult | null = null
  private _initialized: boolean = false
  private _destroyed: boolean = false
  private _previousFrameSize: vec2 | null = null
  private _attachedItemPositioner: ToolbarAttachedItemPositioner
  private _framePositioner: ToolbarFramePositioner | null = null
  private _autoHideManager: ToolbarAutoHideManager | null = null
  private _sizeCalculator: ToolbarSizeCalculator
  private _alpha: number = 1
  private _layoutDirty: boolean = false

  /** Toolbar background opacity (0–1). */
  public get backgroundAlpha(): number {
    return this._config?.background?.alpha ?? getDefaultBackgroundConfig().alpha
  }

  public set backgroundAlpha(value: number) {
    this.updateBackgroundConfig((bg) => (bg.alpha = value))
    this._background?.setAlpha(value)
  }

  /** Toolbar background corner radius in centimeters. */
  public get backgroundCornerRadius(): number {
    return this._config?.background?.cornerRadius ?? getDefaultBackgroundConfig().cornerRadius
  }

  public set backgroundCornerRadius(value: number) {
    this.updateBackgroundConfig((bg) => (bg.cornerRadius = value))
    this._background?.setCornerRadius(value)
  }

  /** Whether the toolbar background is drawn. */
  public get backgroundEnabled(): boolean {
    return this._config?.background?.enabled ?? getDefaultBackgroundConfig().enabled
  }

  public set backgroundEnabled(value: boolean) {
    this.updateBackgroundConfig((bg) => (bg.enabled = value))
    if (this._background) {
      this._background.sceneObject.enabled = value
    }
  }

  /** All toolbar items in layout order. */
  public get allItems(): ToolbarItem[] {
    return this._factory?.getAllItems() ?? []
  }

  /** Current toolbar size in centimeters (width, height). */
  public get currentSize(): vec2 {
    return this._sizeCalculator?.calculateToolbarSize() ?? this.size
  }

  /** Toolbar opacity (0–1). Applied to background and items (multiplied with item alpha). */
  public get alpha(): number {
    return this._alpha
  }

  public set alpha(value: number) {
    this._alpha = value
    this._background?.setAlpha(value)
    this._factory?.getAllItems().forEach((item) => {
      if (item.sceneObject.enabled) {
        const originalAlpha = item.config.alpha ?? 1
        const finalAlpha = value * originalAlpha
        item.applyAlpha(finalAlpha)
      }
    })
  }

  public onAwake() {
    this.createEvent("OnStartEvent").bind(() => {
      this.initialize()
    })
  }

  /**
   * Builds the toolbar from current config and discovers ToolbarItemInput children.
   * Idempotent. Required before {@link addItem}, {@link removeItem}, etc. when using the API only.
   */
  public initialize() {
    if (this._initialized) {
      return
    }

    this._config = this.buildConfigFromInputs()
    validateToolbarConfig(this._config)
    this._initialized = true

    this._sizeCalculator = new ToolbarSizeCalculator(
      this._config,
      this.size,
      this.fitToFrame,
      this.frameSizeScaleX,
      this.frameSizeScaleY,
      this.frame
    )

    const initialConstraints = this.buildLayoutConstraints()
    this._factory = new ToolbarFactory({root: this.sceneObject})
    this._layoutManager = new ToolbarLayoutManager(initialConstraints)
    this._attachedItemPositioner = new ToolbarAttachedItemPositioner(this._factory)

    this._background = this.sceneObject.createComponent(ToolbarBackground.getTypeName()) as ToolbarBackground
    this._background.initialize(this._config)

    const updateEvent = this.createEvent("LateUpdateEvent")
    updateEvent.bind(this.onUpdate)

    if (this.frame) {
      this.sceneObject.setParent(this.frame.sceneObject)
      this._previousFrameSize = this.frame.innerSize

      this._framePositioner = new ToolbarFramePositioner(this.frame, this._config, () =>
        this._sizeCalculator.calculateToolbarSize()
      )

      this._framePositioner.updateToolbarLocalPositionRelativeToFrame(this.getTransform())
    }

    if (this.autoHideWhenFrameNotTargeted) {
      const hoverTarget = this.frame ? this.frame.sceneObject : this.ensureHoverTargetOnToolbar()
      if (hoverTarget) {
        this._autoHideManager = new ToolbarAutoHideManager(hoverTarget, (a) => (this.alpha = a))
        this._autoHideManager.setup()
        this.alpha = this._autoHideManager.getInitialAlpha()
      }
    }

    this.discoverAndAddItems()

    this._layoutDirty = true
  }

  /**
   * Adds an item from config and refreshes layout. Use {@link ToolbarItemType}, {@link ToolbarButtonType}, etc. in config.
   * @param config - Item config (e.g. ToolbarButtonConfig, ToolbarTextFieldConfig). If `id` is omitted, one is generated automatically.
   * @returns The created item instance (use its `id` for {@link getItem}, {@link removeItem}, etc.).
   * @throws If toolbar has not been initialized.
   */
  public addItem(config: AnyToolbarItemConfig): ToolbarItem {
    if (!this._initialized) {
      throw new Error("Toolbar: Must call initialize() before adding items")
    }

    const item = this._factory.createItem(config)
    this._layoutDirty = true
    return item
  }

  /**
   * Removes an item by id and refreshes layout.
   * @param id - The item's id (e.g. `toolbarItem.id` from {@link addItem} return value).
   * @returns True if an item was found and removed.
   */
  public removeItem(id: string): boolean {
    if (!this._initialized) {
      return false
    }

    if (!this._factory.hasItem(id)) {
      return false
    }

    const removed = this._factory.destroyItem(id)
    if (removed) {
      this._layoutDirty = true
    }
    return removed
  }

  /** Returns the item with the given id, or undefined. */
  public getItem(id: string): ToolbarItem | undefined {
    return this._initialized ? this._factory.getItem(id) : undefined
  }

  /** Returns the item created from the given ToolbarItemInput, or undefined. */
  public getToolbarItem(input: ToolbarItemInput): ToolbarItem | undefined {
    return this.getItem(input.id)
  }

  /** Returns whether an item with the given id exists. */
  public hasItem(id: string): boolean {
    return this._initialized ? this._factory.hasItem(id) : false
  }

  /** Cleans up auto-hide, removes all items, and destroys the toolbar scene object. */
  public destroy() {
    if (this._destroyed) return
    this._destroyed = true
    this._autoHideManager?.cancel()
    this._factory?.reset()
    this._layoutResult = null
    this._initialized = false
    this.sceneObject.destroy()
  }

  private ensureHoverTargetOnToolbar(): SceneObject {
    const so = this.sceneObject
    if (!so.getComponent("ColliderComponent")) {
      so.createComponent("ColliderComponent")
    }
    if (!so.getComponent(Interactable.getTypeName())) {
      so.createComponent(Interactable.getTypeName())
    }
    return so
  }

  private discoverAndAddItems() {
    const childCount = this.sceneObject.getChildrenCount()

    for (let i = 0; i < childCount; i++) {
      const child = this.sceneObject.getChild(i)
      const itemInput = child.getComponent(ToolbarItemInput.getTypeName()) as ToolbarItemInput

      if (itemInput && child.enabled && itemInput.enabled) {
        const config = itemInput.toConfig()
        if (!config) {
          if (itemInput.itemType === ToolbarItemType.CUSTOM) {
            const id = itemInput.id?.trim() || itemInput.sceneObject.name || "unknown"
            print(
              `WARNING: Toolbar item '${id}' is set to custom type but no customObject is attached. Skipping this item.`
            )
          }
          continue
        }
        this._factory.createItem(config)
      }
    }
  }

  private buildConfigFromInputs(): ToolbarConfig {
    let toolbarSize: vec2
    let sizingMode: ToolbarSizingMode

    if (this.fitToFrame && this.frame) {
      sizingMode = "frame-fit"
      const frameSize = this.frame.innerSize
      if (this.direction === ToolbarDirections.HORIZONTAL) {
        toolbarSize = new vec2(frameSize.x * this.frameSizeScaleX, this.size.y)
      } else {
        toolbarSize = new vec2(this.size.x, frameSize.y * this.frameSizeScaleY)
      }
    } else {
      sizingMode = "fixed"
      toolbarSize = this.size
    }

    return {
      sizingMode: sizingMode,
      size: toolbarSize,
      direction: this.direction as "horizontal" | "vertical",
      padding: {
        left: this.paddingLeft,
        right: this.paddingRight,
        top: this.paddingTop,
        bottom: this.paddingBottom
      },
      spacing: this.spacing,
      background: (() => {
        const defaults = getDefaultBackgroundConfig()
        const color = this.backgroundColor ?? defaults.color
        return {
          ...defaults,
          color,
          alpha: color.w
        }
      })(),
      framePosition: this.framePosition as ToolbarFramePositionEnum,
      frameGap: this.frameGap,
      isToolbarInsideFrame: this.isToolbarInsideFrame
    }
  }

  private updateBackgroundConfig(updater: (bg: ToolbarConfig["background"]) => void): void {
    if (this._config?.background) {
      updater(this._config.background)
    }
  }

  private onUpdate = () => {
    if (this._layoutDirty) {
      this._layoutDirty = false
      this.updateLayout()
    }

    this._attachedItemPositioner.updateAttachedItemPositions(this._factory.getAllItems())
    if (!this.frame || !this._framePositioner) {
      return
    }

    const currentFrameSize = this.frame.innerSize

    if (!this._previousFrameSize || !this._previousFrameSize.equal(currentFrameSize)) {
      this._previousFrameSize = currentFrameSize
      if (this.fitToFrame) {
        this._layoutDirty = true
      }
      this._framePositioner.updateToolbarLocalPositionRelativeToFrame(this.getTransform())
    }
  }

  private updateLayout() {
    const itemsMap = this._factory.getItemsMap()

    if (!this._initialized || itemsMap.size === 0) {
      const toolbarSize = this._sizeCalculator.calculateToolbarSize()
      this._background.setSize(toolbarSize)
      return
    }

    const constraints = this.buildLayoutConstraints()
    this._layoutManager.updateConstraints(constraints)

    this._layoutManager.setItems(itemsMap)

    this._layoutResult = this._layoutManager.calculateLayout()

    const contentSpace = this._sizeCalculator.calculateAvailableContentSpace()

    this._layoutResult.itemPositions.forEach((itemPos) => {
      const item = itemsMap.get(itemPos.itemId)
      if (item) {
        const finalSize = item.getFinalLayoutSize(itemPos.size, contentSpace)

        item.computedSize = finalSize
        this._attachedItemPositioner.applyItemSizeAndScale(item, finalSize, 0)

        let position = itemPos.position
        if (item instanceof ToolbarSeparator) {
          position = new vec3(itemPos.position.x, itemPos.position.y, 0.1)
        }
        item.transform.setLocalPosition(position)

        if (!item.config.attachTo) {
          if (item.onLayoutScaleApplied) {
            item.onLayoutScaleApplied()
          }

          if (item.onLayoutApplied) {
            item.onLayoutApplied()
          }
        }
      }
    })

    this._attachedItemPositioner.positionAttachedItems(this._factory.getAllItems())

    const toolbarSize = this._sizeCalculator.calculateToolbarSize()
    this._background.setSize(toolbarSize)

    if (this._framePositioner) {
      this._framePositioner.updateToolbarLocalPositionRelativeToFrame(this.getTransform())
    }
  }

  private buildLayoutConstraints(): LayoutConstraints {
    const availableSpace = this._sizeCalculator.calculateAvailableContentSpace()
    const mergedPadding = mergePadding(this._config.padding)

    return {
      availableSpace,
      direction: this._config.direction,
      defaultCrossAxisSize: 3,
      spacing: this._config.spacing ?? 0.5,
      padding: mergedPadding
    }
  }
}
