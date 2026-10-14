import {ToolbarButton} from "../Items/ToolbarButton"
import {ToolbarCustomItem} from "../Items/ToolbarCustomItem"
import {ToolbarItem} from "../Items/ToolbarItem"
import {ToolbarSeparator} from "../Items/ToolbarSeparator"
import {ToolbarSlider} from "../Items/ToolbarSlider"
import {ToolbarTextField} from "../Items/ToolbarTextField"
import {ToolbarToggle} from "../Items/ToolbarToggle"
import {getAxisInfo} from "../Types/ToolbarLayoutTypes"
import {
  isNumericAxisSize,
  ToolbarAttachmentPosition,
  ToolbarDirections,
  ToolbarItemSizeMode
} from "../Types/ToolbarSchema"
import {ToolbarFactory} from "./ToolbarFactory"

export class ToolbarAttachedItemPositioner {
  public constructor(private factory: ToolbarFactory) {}

  /**
   * Full setup for attached items: applies size, scale, render order, and layout callbacks.
   * Call this from layout (Toolbar.updateLayout) when the toolbar is fully rebuilt.
   */
  public positionAttachedItems(items: ToolbarItem[]): void {
    items.forEach((item) => {
      const config = item.config
      if (!config.attachTo) {
        return
      }

      const targetItem = this.factory.getItem(config.attachTo)
      if (!targetItem) {
        return
      }

      const {targetSize, itemSize} = this.resolveAttachedItemSizes(item, targetItem)

      item.computedSize = itemSize

      const attachmentPosition = config.attachmentPosition ?? ToolbarAttachmentPosition.RIGHT
      const attachmentOffset = config.attachmentOffset ?? new vec2(0, 0)
      const targetPosition = targetItem.transform.getLocalPosition()
      const position = this.calculateAttachmentPosition(
        targetPosition,
        targetSize,
        itemSize,
        attachmentPosition,
        attachmentOffset
      )

      item.transform.setLocalPosition(position)

      const targetRenderOrder = this.getTargetRenderOrder(targetItem)
      const attachedRenderOrder = targetRenderOrder + 10

      this.setItemRenderOrder(item, attachedRenderOrder)
      this.applyItemSizeAndScale(item, itemSize, attachedRenderOrder)

      if (item.onLayoutScaleApplied) {
        item.onLayoutScaleApplied()
      }

      if (item.onLayoutApplied) {
        item.onLayoutApplied()
      }

      if (item instanceof ToolbarButton) {
        this.setComponentRenderOrders(item.sceneObject, attachedRenderOrder)
      }
    })
  }

  /**
   * Lightweight per-frame position update for attached items.
   * Skips size/scale application and layout callbacks — only recalculates position
   * relative to the current target position. Call this from onUpdate.
   */
  public updateAttachedItemPositions(items: ToolbarItem[]): void {
    items.forEach((item) => {
      const config = item.config
      if (!config.attachTo) {
        return
      }

      const targetItem = this.factory.getItem(config.attachTo)
      if (!targetItem) {
        return
      }

      const {targetSize, itemSize} = this.resolveAttachedItemSizes(item, targetItem)

      const attachmentPosition = config.attachmentPosition ?? ToolbarAttachmentPosition.RIGHT
      const attachmentOffset = config.attachmentOffset ?? new vec2(0, 0)
      const targetPosition = targetItem.transform.getLocalPosition()
      const position = this.calculateAttachmentPosition(
        targetPosition,
        targetSize,
        itemSize,
        attachmentPosition,
        attachmentOffset
      )

      item.transform.setLocalPosition(position)
    })
  }

  public applyItemSizeAndScale(item: ToolbarItem, itemSize: vec2, attachedRenderOrder: number = 0): void {
    if (item instanceof ToolbarButton) {
      item.buttonComponent.size = new vec3(itemSize.x, itemSize.y, 0)
      item.transform.setLocalScale(vec3.one())
      item.forceLayoutUpdate()
      this.setComponentRenderOrders(item.sceneObject, attachedRenderOrder)
      return
    }

    if (item instanceof ToolbarTextField) {
      item.textFieldComponent.size = new vec3(itemSize.x, itemSize.y, 0)
      item.transform.setLocalScale(vec3.one())
      return
    }

    if (item instanceof ToolbarSlider || item instanceof ToolbarToggle) {
      item.computedSize = itemSize
      item.transform.setLocalScale(vec3.one())
      return
    }

    if (item instanceof ToolbarSeparator) {
      item.transform.setLocalScale(vec3.one())
      return
    }

    if (item instanceof ToolbarCustomItem) {
      item.onLayoutScaleApplied?.()
      item.onLayoutApplied?.()
      item.transform.setLocalScale(vec3.one())
      return
    }

    const scaleX = itemSize.x / item.size.x
    const scaleY = itemSize.y / item.size.y
    item.transform.setLocalScale(new vec3(scaleX, scaleY, 1))
  }

  private resolveAttachedItemSizes(item: ToolbarItem, targetItem: ToolbarItem): {targetSize: vec2; itemSize: vec2} {
    let targetSize = targetItem.computedSize

    if (targetItem instanceof ToolbarTextField && item.getToolbarDirection() !== ToolbarDirections.VERTICAL) {
      const actualSize = targetItem.textFieldComponent.size
      if (actualSize && actualSize.x > 0 && actualSize.y > 0) {
        targetSize = new vec2(actualSize.x, actualSize.y)
      }
    }

    if (!targetSize || (targetSize.x === 0 && targetSize.y === 0)) {
      const targetIntrinsicSize = targetItem.intrinsicSize
      targetSize = targetIntrinsicSize.x > 0 && targetIntrinsicSize.y > 0 ? targetIntrinsicSize : new vec2(3, 3)
    }

    let itemSize: vec2
    let sizeConfig = item.config.size

    if (!sizeConfig) {
      const axisInfo = getAxisInfo(item.getToolbarDirection())
      const defaultCrossAxisSize = 3
      sizeConfig = axisInfo.isHorizontal
        ? {x: ToolbarItemSizeMode.FILL, y: defaultCrossAxisSize}
        : {x: defaultCrossAxisSize, y: ToolbarItemSizeMode.FILL}
    }

    if (sizeConfig instanceof vec2) {
      itemSize = sizeConfig
    } else {
      const width = isNumericAxisSize(sizeConfig.x) ? sizeConfig.x : targetSize.x
      const height = isNumericAxisSize(sizeConfig.y) ? sizeConfig.y : targetSize.y
      itemSize = new vec2(width, height)
    }

    return {targetSize, itemSize}
  }

  private calculateAttachmentPosition(
    targetPosition: vec3,
    targetSize: vec2,
    itemSize: vec2,
    attachmentPosition: ToolbarAttachmentPosition,
    attachmentOffset: vec2
  ): vec3 {
    const position = new vec3(targetPosition.x, targetPosition.y, targetPosition.z + 0.1)

    const halfItemWidth = itemSize.x / 2
    const halfItemHeight = itemSize.y / 2
    const halfTargetWidth = targetSize.x / 2
    const halfTargetHeight = targetSize.y / 2
    const padding = 0.3

    switch (attachmentPosition) {
      case ToolbarAttachmentPosition.LEFT:
        position.x = targetPosition.x - halfTargetWidth + halfItemWidth + padding + attachmentOffset.x
        position.y = targetPosition.y + attachmentOffset.y
        break
      case ToolbarAttachmentPosition.RIGHT:
        position.x = targetPosition.x + halfTargetWidth - halfItemWidth - padding + attachmentOffset.x
        position.y = targetPosition.y + attachmentOffset.y
        break
      case ToolbarAttachmentPosition.TOP:
        position.x = targetPosition.x + attachmentOffset.x
        position.y = targetPosition.y + halfTargetHeight - halfItemHeight - padding + attachmentOffset.y
        break
      case ToolbarAttachmentPosition.BOTTOM:
        position.x = targetPosition.x + attachmentOffset.x
        position.y = targetPosition.y - halfTargetHeight + halfItemHeight + padding + attachmentOffset.y
        break
      case ToolbarAttachmentPosition.CENTER:
        position.x = targetPosition.x + attachmentOffset.x
        position.y = targetPosition.y + attachmentOffset.y
        break
    }

    return position
  }

  private getTargetRenderOrder(targetItem: ToolbarItem): number {
    const renderMeshVisual = this.getItemRenderMeshVisual(targetItem)
    return renderMeshVisual?.getRenderOrder() || 0
  }

  private getItemRenderMeshVisual(item: ToolbarItem): RenderMeshVisual | null {
    if (item instanceof ToolbarButton && item.buttonComponent?.visual?.renderMeshVisual) {
      return item.buttonComponent.visual.renderMeshVisual
    }
    if (item instanceof ToolbarTextField && item.textFieldComponent?.visual?.renderMeshVisual) {
      return item.textFieldComponent.visual.renderMeshVisual
    }
    if (item instanceof ToolbarSlider && item.sliderComponent?.visual?.renderMeshVisual) {
      return item.sliderComponent.visual.renderMeshVisual
    }
    if (item instanceof ToolbarToggle && item.switchComponent?.visual?.renderMeshVisual) {
      return item.switchComponent.visual.renderMeshVisual
    }
    if (item.sceneObject) {
      const visuals = item.sceneObject.getComponents("RenderMeshVisual")
      if (visuals.length > 0) {
        return visuals[0] as RenderMeshVisual
      }
    }
    return null
  }

  private setItemRenderOrder(item: ToolbarItem, renderOrder: number): void {
    const renderMeshVisual = this.getItemRenderMeshVisual(item)
    if (renderMeshVisual) {
      renderMeshVisual.renderOrder = renderOrder
    }

    if (item instanceof ToolbarButton) {
      this.enableButtonComponents(item, renderOrder)
    }
  }

  private enableButtonComponents(item: ToolbarButton, renderOrder: number): void {
    if (!item.sceneObject) return

    this.setComponentRenderOrders(item.sceneObject, renderOrder)

    const childCount = item.sceneObject.getChildrenCount()
    for (let i = 0; i < childCount; i++) {
      const child = item.sceneObject.getChild(i)
      if (child && !child.enabled) {
        child.enabled = true
      }
    }
  }

  private setComponentRenderOrders(sceneObject: SceneObject, renderOrder: number): void {
    const imageComponents = sceneObject.getComponents("Component.Image")
    imageComponents.forEach((image) => {
      if (image instanceof Image) {
        image.renderOrder = renderOrder + 1
        image.enabled = true
      }
    })

    const textComponents = sceneObject.getComponents("Component.Text")
    textComponents.forEach((text) => {
      if (text instanceof Text) {
        text.renderOrder = renderOrder + 2
        text.enabled = true
      }
    })
  }
}
