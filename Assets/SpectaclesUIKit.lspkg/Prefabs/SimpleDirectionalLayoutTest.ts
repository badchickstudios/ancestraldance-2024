import {DirectionalLayout} from "../Scripts/Components/Layout/DirectionalLayout"
import {
  Axis,
  DepthAlignment,
  HorizontalAlignment,
  SizeDriver,
  VerticalAlignment,
  WrapDirection
} from "../Scripts/Components/Layout/LayoutConfigurationTypes"
import {LayoutItem} from "../Scripts/Components/Layout/LayoutItem"

/**
 * Configuration options for DirectionalLayout.
 * All properties are optional and will use DirectionalLayout's defaults if not specified.
 */
type DirectionalLayoutConfig = {
  // Directions
  primaryDirection?: Axis
  reverse?: boolean

  // Layout Size
  primarySizeFixed?: boolean
  primarySize?: number
  secondaryFixedSize?: boolean
  secondarySize?: number

  // Child Alignment
  childAlignmentX?: HorizontalAlignment
  childAlignmentY?: VerticalAlignment
  childAlignmentZ?: DepthAlignment

  // Padding
  paddingLeft?: number
  paddingRight?: number
  paddingBottom?: number
  paddingTop?: number
  paddingBack?: number
  paddingFront?: number

  // Spacing
  primarySpacing?: number

  // Child Size
  childWidth?: number
  childHeight?: number
  childDepth?: number

  // Wrap
  wrapToSecondaryAxis?: boolean
  secondaryDirection?: WrapDirection
  secondarySpacing?: number
  wrapToTertiaryAxis?: boolean
  tertiaryDirection?: WrapDirection
  tertiarySpacing?: number
  tertiaryFixedSize?: boolean
  tertiarySize?: number
}

@component
export class SimpleDirectionalLayoutTest extends BaseScriptComponent {
  @input
  @allowUndefined
  private layout: DirectionalLayout | undefined = undefined

  @input
  private itemPrefab: ObjectPrefab = undefined

  @input
  private numItems: number = 3

  @input
  private spawnInterval: number = 0.5

  private DIRECTIONAL_LAYOUT_CONFIG: DirectionalLayoutConfig = {
    // Directions - Horizontal only
    primaryDirection: Axis.X,
    reverse: false,

    // Layout Size - Fixed width of 10
    primarySizeFixed: true,
    primarySize: 12,

    // Child Alignment
    childAlignmentX: HorizontalAlignment.Left,
    childAlignmentY: VerticalAlignment.Center,
    childAlignmentZ: DepthAlignment.Center,

    // Padding
    paddingLeft: 0,
    paddingRight: 0,
    paddingBottom: 0,
    paddingTop: 0,
    paddingBack: 0,
    paddingFront: 0,

    // Spacing
    primarySpacing: 0,

    // Child Size - Width of 3
    childWidth: 3,
    childHeight: 1,
    childDepth: 1,

    // Wrap - Enabled with Down direction and spacing of 1
    wrapToSecondaryAxis: true,
    secondaryDirection: WrapDirection.Down,
    secondarySpacing: 1,
    secondaryFixedSize: true,
    secondarySize: 12,

    // Tertiary Wrap - Enabled with Back direction and spacing of 1
    wrapToTertiaryAxis: true,
    tertiaryDirection: WrapDirection.Back,
    tertiarySpacing: 1,
    tertiaryFixedSize: true,
    tertiarySize: 12
  }

  private currentItemIndex: number = 0
  private delayedEvent: DelayedCallbackEvent | undefined = undefined

  public onAwake() {
    if (!this.layout) {
      this.layout = this.sceneObject.createComponent(DirectionalLayout.getTypeName()) as DirectionalLayout
    }

    // Set primary direction early to ensure valid state before layout initializes (prevents errors from invalid serialized data)
    if (this.DIRECTIONAL_LAYOUT_CONFIG.primaryDirection !== undefined && this.layout) {
      this.layout.primaryDirection = this.DIRECTIONAL_LAYOUT_CONFIG.primaryDirection
    }

    this.createEvent("OnStartEvent").bind(() => {
      this.layout.onInitialized.add(() => {
        this.configureLayout()
        this.startSpawningItems()
      })
    })
  }

  private configureLayout(): void {
    if (!this.layout) return

    // Directions
    if (this.DIRECTIONAL_LAYOUT_CONFIG.primaryDirection !== undefined) {
      this.layout.primaryDirection = this.DIRECTIONAL_LAYOUT_CONFIG.primaryDirection
    }
    this.layout.reverse = this.DIRECTIONAL_LAYOUT_CONFIG.reverse!

    // Layout Size
    if (this.DIRECTIONAL_LAYOUT_CONFIG.primarySizeFixed !== undefined) {
      this.layout.primarySizeFixed = this.DIRECTIONAL_LAYOUT_CONFIG.primarySizeFixed
      if (this.DIRECTIONAL_LAYOUT_CONFIG.primarySize !== undefined) {
        this.layout.primarySize = this.DIRECTIONAL_LAYOUT_CONFIG.primarySize
      }
    }
    if (this.DIRECTIONAL_LAYOUT_CONFIG.secondaryFixedSize !== undefined) {
      this.layout.secondaryFixedSize = this.DIRECTIONAL_LAYOUT_CONFIG.secondaryFixedSize
      if (this.DIRECTIONAL_LAYOUT_CONFIG.secondarySize !== undefined) {
        this.layout.secondarySize = this.DIRECTIONAL_LAYOUT_CONFIG.secondarySize
      }
    }

    // Child Alignment
    this.layout.childAlignmentX = this.DIRECTIONAL_LAYOUT_CONFIG.childAlignmentX!
    this.layout.childAlignmentY = this.DIRECTIONAL_LAYOUT_CONFIG.childAlignmentY!
    this.layout.childAlignmentZ = this.DIRECTIONAL_LAYOUT_CONFIG.childAlignmentZ!

    // Padding
    this.layout.paddingLeft = this.DIRECTIONAL_LAYOUT_CONFIG.paddingLeft!
    this.layout.paddingRight = this.DIRECTIONAL_LAYOUT_CONFIG.paddingRight!
    this.layout.paddingBottom = this.DIRECTIONAL_LAYOUT_CONFIG.paddingBottom!
    this.layout.paddingTop = this.DIRECTIONAL_LAYOUT_CONFIG.paddingTop!
    this.layout.paddingBack = this.DIRECTIONAL_LAYOUT_CONFIG.paddingBack!
    this.layout.paddingFront = this.DIRECTIONAL_LAYOUT_CONFIG.paddingFront!

    // Spacing
    if (this.DIRECTIONAL_LAYOUT_CONFIG.primarySpacing !== undefined) {
      this.layout.primarySpacing = this.DIRECTIONAL_LAYOUT_CONFIG.primarySpacing
    }

    // Child Size
    this.layout.childWidth = this.DIRECTIONAL_LAYOUT_CONFIG.childWidth!
    this.layout.childHeight = this.DIRECTIONAL_LAYOUT_CONFIG.childHeight!
    this.layout.childDepth = this.DIRECTIONAL_LAYOUT_CONFIG.childDepth!

    // Wrap
    if (this.DIRECTIONAL_LAYOUT_CONFIG.wrapToSecondaryAxis !== undefined) {
      this.layout.wrapToSecondaryAxis = this.DIRECTIONAL_LAYOUT_CONFIG.wrapToSecondaryAxis
      if (this.DIRECTIONAL_LAYOUT_CONFIG.secondaryDirection !== undefined) {
        this.layout.secondaryDirection = this.DIRECTIONAL_LAYOUT_CONFIG.secondaryDirection
      }
      if (this.DIRECTIONAL_LAYOUT_CONFIG.secondarySpacing !== undefined) {
        this.layout.secondarySpacing = this.DIRECTIONAL_LAYOUT_CONFIG.secondarySpacing
      }
    }

    // Tertiary Wrap
    if (this.DIRECTIONAL_LAYOUT_CONFIG.wrapToTertiaryAxis !== undefined) {
      this.layout.wrapToTertiaryAxis = this.DIRECTIONAL_LAYOUT_CONFIG.wrapToTertiaryAxis
      if (this.DIRECTIONAL_LAYOUT_CONFIG.tertiaryDirection !== undefined) {
        this.layout.tertiaryDirection = this.DIRECTIONAL_LAYOUT_CONFIG.tertiaryDirection
      }
      if (this.DIRECTIONAL_LAYOUT_CONFIG.tertiarySpacing !== undefined) {
        this.layout.tertiarySpacing = this.DIRECTIONAL_LAYOUT_CONFIG.tertiarySpacing
      }
      if (this.DIRECTIONAL_LAYOUT_CONFIG.tertiaryFixedSize !== undefined) {
        this.layout.tertiaryFixedSize = this.DIRECTIONAL_LAYOUT_CONFIG.tertiaryFixedSize
        if (this.DIRECTIONAL_LAYOUT_CONFIG.tertiarySize !== undefined) {
          this.layout.tertiarySize = this.DIRECTIONAL_LAYOUT_CONFIG.tertiarySize
        }
      }
    }
  }

  private startSpawningItems(): void {
    this.currentItemIndex = 0
    this.spawnNextItem()
  }

  private spawnNextItem(): void {
    if (this.currentItemIndex >= this.numItems) {
      return
    }

    const item = this.createSingleItem()
    if (item) {
      this.layout.addLayoutItems([item])
    }

    this.currentItemIndex++

    if (this.currentItemIndex < this.numItems) {
      this.delayedEvent = this.createEvent("DelayedCallbackEvent") as DelayedCallbackEvent
      this.delayedEvent.bind(() => {
        this.spawnNextItem()
      })
      this.delayedEvent.reset(this.spawnInterval)
    }
  }

  private createSingleItem(): LayoutItem | null {
    if (!this.itemPrefab) {
      return null
    }
    const item = this.itemPrefab.instantiate(this.sceneObject).getComponent(LayoutItem.getTypeName()) as LayoutItem

    // Randomly decide if this item should override layout
    const shouldOverride = Math.random() < 0.5
    if (shouldOverride) {
      item.widthSizeDriver = SizeDriver.LayoutItem
      item.heightSizeDriver = SizeDriver.LayoutItem
      item.depthSizeDriver = SizeDriver.LayoutItem
      // Set random width between 1-7
      const randomWidth = Math.floor(Math.random() * 7) + 1
      item.width = randomWidth
    }

    return item
  }
}
