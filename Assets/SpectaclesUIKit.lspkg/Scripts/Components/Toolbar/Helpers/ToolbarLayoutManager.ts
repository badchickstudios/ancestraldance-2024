import {ToolbarItem} from "../Items/ToolbarItem"
import {
  AlignmentGroup,
  AlignmentGroupLayout,
  AxisInfo,
  calculateOverflow,
  clampSizeWithConstraints,
  createPositionVec3,
  createSizeFromAxis,
  getAxisInfo,
  getAxisSize,
  ItemPosition,
  ItemSizeInfo,
  LayoutCalculationResult,
  LayoutConstraints,
  ToolbarLayoutResult
} from "../Types/ToolbarLayoutTypes"
import {
  isNumericAxisSize,
  isPerAxisSize,
  isVec2Size,
  ToolbarAlignment,
  ToolbarItemSizeMode
} from "../Types/ToolbarSchema"

export class ToolbarLayoutManager {
  private constraints: LayoutConstraints
  private items: ReadonlyMap<string, ToolbarItem> = new Map()

  public constructor(constraints: LayoutConstraints) {
    this.constraints = constraints
  }

  public updateConstraints(constraints: LayoutConstraints) {
    this.constraints = constraints
  }

  public setItems(items: ReadonlyMap<string, ToolbarItem>) {
    this.items = items
  }

  public calculateLayout(): ToolbarLayoutResult {
    const axisInfo = getAxisInfo(this.constraints.direction)
    const itemSizes = this.calculateItemSizes()
    const alignmentGroups = this.groupItemsByAlignment()
    const calculation = this.performLayoutCalculation(itemSizes, alignmentGroups, axisInfo)
    const itemPositions = this.calculateItemPositions(calculation, axisInfo)
    const contentBounds = this.calculateContentBounds(itemPositions)

    return {
      itemPositions,
      calculation,
      contentBounds
    }
  }

  private calculateItemSizes(): Map<string, ItemSizeInfo> {
    const sizes = new Map<string, ItemSizeInfo>()
    const axisInfo = getAxisInfo(this.constraints.direction)

    this.items.forEach((item, id) => {
      if (!item.sceneObject.enabled) {
        return
      }
      if (item.config.attachTo) {
        return
      }
      const config = item.config
      let sizeConfig = config.size

      if (!sizeConfig) {
        if (item.getSizeMode() === ToolbarItemSizeMode.MANUAL) {
          sizeConfig = item.intrinsicSize
        } else {
          const defaultCrossAxisSize = this.constraints.defaultCrossAxisSize
          sizeConfig = axisInfo.isHorizontal
            ? {x: ToolbarItemSizeMode.FILL, y: defaultCrossAxisSize}
            : {x: defaultCrossAxisSize, y: ToolbarItemSizeMode.FILL}
        }
      }

      let width = 0
      let height = 0
      let wantsFillPrimary = false
      let wantsFillCross = false

      if (isVec2Size(sizeConfig)) {
        width = sizeConfig.x
        height = sizeConfig.y
      } else if (isPerAxisSize(sizeConfig)) {
        const xMode = sizeConfig.x
        const yMode = sizeConfig.y

        if (isNumericAxisSize(xMode)) {
          width = xMode
        } else if (xMode === ToolbarItemSizeMode.FILL) {
          width = 0
          if (axisInfo.primary === "x") wantsFillPrimary = true
          else wantsFillCross = true
        }

        if (isNumericAxisSize(yMode)) {
          height = yMode
        } else if (yMode === ToolbarItemSizeMode.FILL) {
          height = 0
          if (axisInfo.primary === "y") wantsFillPrimary = true
          else wantsFillCross = true
        }
      }

      if (!wantsFillCross && axisInfo.cross === "x" && width === 0) {
        width = this.constraints.defaultCrossAxisSize
      }
      if (!wantsFillCross && axisInfo.cross === "y" && height === 0) {
        height = this.constraints.defaultCrossAxisSize
      }

      let preferredSize = new vec2(width, height)
      preferredSize = clampSizeWithConstraints(preferredSize, config.minSize, config.maxSize)

      preferredSize = clampSizeWithConstraints(preferredSize, undefined, this.constraints.availableSpace)

      sizes.set(id, {
        width: preferredSize.x,
        height: preferredSize.y,
        wantsFillPrimary,
        wantsFillCross,
        preferredSize
      })
    })

    return sizes
  }

  private groupItemsByAlignment(): Map<AlignmentGroup, string[]> {
    const groups = new Map<AlignmentGroup, string[]>([
      [ToolbarAlignment.LEFT, []],
      [ToolbarAlignment.CENTER, []],
      [ToolbarAlignment.RIGHT, []]
    ])

    this.items.forEach((item, id) => {
      if (item.sceneObject.enabled && !item.config.attachTo) {
        const alignment = (item.config.alignment ?? ToolbarAlignment.LEFT) as AlignmentGroup
        groups.get(alignment)?.push(id)
      }
    })

    return groups
  }

  private performLayoutCalculation(
    itemSizes: Map<string, ItemSizeInfo>,
    alignmentGroups: Map<AlignmentGroup, string[]>,
    axisInfo: AxisInfo
  ): LayoutCalculationResult {
    const contentSize = this.constraints.availableSpace
    const availablePrimarySpace = getAxisSize(contentSize, axisInfo.primary)

    const leftItems = alignmentGroups.get(ToolbarAlignment.LEFT)!
    const centerItems = alignmentGroups.get(ToolbarAlignment.CENTER)!
    const rightItems = alignmentGroups.get(ToolbarAlignment.RIGHT)!

    const leftLayout = this.calculateGroupLayout(leftItems, itemSizes, axisInfo)
    const centerLayout = this.calculateGroupLayout(centerItems, itemSizes, axisInfo)
    const rightLayout = this.calculateGroupLayout(rightItems, itemSizes, axisInfo)

    const totalUsedSpace = leftLayout.totalSize + centerLayout.totalSize + rightLayout.totalSize
    const remainingSpace = availablePrimarySpace - totalUsedSpace

    if (remainingSpace > 0) {
      const fillItemsByGroup = this.findFillItemsByGroup(itemSizes, alignmentGroups)
      const hasCenterItems = centerItems.length > 0
      const hasFillItems =
        fillItemsByGroup.left.length > 0 || fillItemsByGroup.center.length > 0 || fillItemsByGroup.right.length > 0

      if (hasFillItems) {
        if (hasCenterItems) {
          const spacingBetweenGroups = this.calculateSpacingBetweenGroups(
            leftItems.length > 0,
            true,
            rightItems.length > 0
          )
          const leftFixed = this.getGroupFixedSize(leftItems, itemSizes, axisInfo)
          const centerTotal = this.getGroupTotalSize(centerItems, itemSizes, axisInfo)
          const rightFixed = this.getGroupFixedSize(rightItems, itemSizes, axisInfo)
          const leftSpacing = leftItems.length > 1 ? (leftItems.length - 1) * this.constraints.spacing : 0
          const centerSpacing = centerItems.length > 1 ? (centerItems.length - 1) * this.constraints.spacing : 0
          const rightSpacing = rightItems.length > 1 ? (rightItems.length - 1) * this.constraints.spacing : 0

          const hasCenterFill = fillItemsByGroup.center.length > 0
          let leftRegionSize: number
          let centerRegionSize: number
          let rightRegionSize: number

          if (hasCenterFill) {
            const regionSize = Math.max(0, (availablePrimarySpace - spacingBetweenGroups) / 3)
            leftRegionSize = regionSize
            centerRegionSize = regionSize
            rightRegionSize = regionSize
          } else {
            const sideRegionSize = Math.max(0, (availablePrimarySpace - centerTotal - spacingBetweenGroups) / 2)
            leftRegionSize = sideRegionSize
            centerRegionSize = centerTotal
            rightRegionSize = sideRegionSize
          }

          this.distributeFillSpace(
            fillItemsByGroup.left,
            itemSizes,
            Math.max(0, leftRegionSize - leftFixed - leftSpacing),
            axisInfo
          )
          this.distributeFillSpace(
            fillItemsByGroup.center,
            itemSizes,
            Math.max(0, centerRegionSize - this.getGroupFixedSize(centerItems, itemSizes, axisInfo) - centerSpacing),
            axisInfo
          )
          this.distributeFillSpace(
            fillItemsByGroup.right,
            itemSizes,
            Math.max(0, rightRegionSize - rightFixed - rightSpacing),
            axisInfo
          )
        } else {
          const fillItems = this.findFillItems(itemSizes)
          let spacingBetweenGroups = 0
          const hasLeftItems = leftItems.length > 0
          const hasRightItems = rightItems.length > 0
          if (hasLeftItems && hasRightItems) {
            spacingBetweenGroups = this.constraints.spacing
          }
          const fillSpace = Math.max(0, remainingSpace - spacingBetweenGroups)
          this.distributeFillSpace(fillItems, itemSizes, fillSpace, axisInfo)
        }

        const updatedLeftLayout = this.calculateGroupLayout(leftItems, itemSizes, axisInfo)
        const updatedCenterLayout = this.calculateGroupLayout(centerItems, itemSizes, axisInfo)
        const updatedRightLayout = this.calculateGroupLayout(rightItems, itemSizes, axisInfo)
        const spacingBetweenGroups = this.calculateSpacingBetweenGroups(
          leftItems.length > 0,
          centerItems.length > 0,
          rightItems.length > 0
        )

        return {
          itemSizes,
          alignmentGroups: {
            left: updatedLeftLayout,
            center: updatedCenterLayout,
            right: updatedRightLayout
          },
          totalUsedSpace:
            updatedLeftLayout.totalSize +
            updatedCenterLayout.totalSize +
            updatedRightLayout.totalSize +
            spacingBetweenGroups,
          remainingSpace: 0,
          hasOverflow: false,
          overflowScaleFactor: 1.0
        }
      }
    }

    const interGroupSpacing = this.calculateSpacingBetweenGroups(
      leftItems.length > 0,
      centerItems.length > 0,
      rightItems.length > 0
    )
    const correctedTotal = totalUsedSpace + interGroupSpacing
    const correctedRemaining = availablePrimarySpace - correctedTotal
    const correctedHasOverflow = correctedRemaining < 0
    const correctedScaleFactor = correctedHasOverflow
      ? calculateOverflow(correctedTotal, availablePrimarySpace, "scale").scaleFactor
      : 1.0

    return {
      itemSizes,
      alignmentGroups: {
        left: leftLayout,
        center: centerLayout,
        right: rightLayout
      },
      totalUsedSpace: correctedTotal,
      remainingSpace: correctedRemaining,
      hasOverflow: correctedHasOverflow,
      overflowScaleFactor: correctedScaleFactor
    }
  }

  private calculateGroupLayout(
    itemIds: string[],
    itemSizes: Map<string, ItemSizeInfo>,
    axisInfo: AxisInfo
  ): AlignmentGroupLayout {
    const itemSizeArray: number[] = []
    let totalSize = 0

    itemIds.forEach((id) => {
      const sizeInfo = itemSizes.get(id)
      if (sizeInfo) {
        const primarySize = getAxisSize(sizeInfo.preferredSize, axisInfo.primary)
        itemSizeArray.push(primarySize)
        totalSize += primarySize
      }
    })

    if (itemIds.length > 1) {
      totalSize += (itemIds.length - 1) * this.constraints.spacing
    }

    return {
      items: itemIds,
      totalSize,
      startPosition: 0,
      itemSizes: itemSizeArray
    }
  }

  private findFillItems(itemSizes: Map<string, ItemSizeInfo>): string[] {
    const fillItems: string[] = []

    this.items.forEach((item, id) => {
      const sizeInfo = itemSizes.get(id)
      if (sizeInfo?.wantsFillPrimary) {
        fillItems.push(id)
      }
    })

    return fillItems
  }

  private findFillItemsByGroup(
    itemSizes: Map<string, ItemSizeInfo>,
    alignmentGroups: Map<AlignmentGroup, string[]>
  ): {left: string[]; center: string[]; right: string[]} {
    const left: string[] = []
    const center: string[] = []
    const right: string[] = []

    const addToGroup = (ids: string[], group: string[]) => {
      ids.forEach((id) => {
        const sizeInfo = itemSizes.get(id)
        if (sizeInfo?.wantsFillPrimary) {
          group.push(id)
        }
      })
    }

    addToGroup(alignmentGroups.get(ToolbarAlignment.LEFT)!, left)
    addToGroup(alignmentGroups.get(ToolbarAlignment.CENTER)!, center)
    addToGroup(alignmentGroups.get(ToolbarAlignment.RIGHT)!, right)

    return {left, center, right}
  }

  private getGroupFixedSize(itemIds: string[], itemSizes: Map<string, ItemSizeInfo>, axisInfo: AxisInfo): number {
    let sum = 0
    itemIds.forEach((id) => {
      const sizeInfo = itemSizes.get(id)
      if (sizeInfo && !sizeInfo.wantsFillPrimary) {
        sum += getAxisSize(sizeInfo.preferredSize, axisInfo.primary)
      }
    })
    return sum
  }

  private getGroupTotalSize(itemIds: string[], itemSizes: Map<string, ItemSizeInfo>, axisInfo: AxisInfo): number {
    let sum = 0
    itemIds.forEach((id) => {
      const sizeInfo = itemSizes.get(id)
      if (sizeInfo) {
        sum += getAxisSize(sizeInfo.preferredSize, axisInfo.primary)
      }
    })
    if (itemIds.length > 1) {
      sum += (itemIds.length - 1) * this.constraints.spacing
    }
    return sum
  }

  private calculateSpacingBetweenGroups(hasLeft: boolean, hasCenter: boolean, hasRight: boolean): number {
    if (hasLeft && hasRight) {
      return hasCenter ? this.constraints.spacing * 2 : this.constraints.spacing
    }
    if ((hasLeft || hasRight) && hasCenter) {
      return this.constraints.spacing
    }
    return 0
  }

  private distributeFillSpace(
    fillItems: string[],
    itemSizes: Map<string, ItemSizeInfo>,
    availableSpace: number,
    axisInfo: AxisInfo
  ) {
    if (fillItems.length === 0) return

    const spacePerItem = availableSpace / fillItems.length

    fillItems.forEach((id) => {
      const sizeInfo = itemSizes.get(id)
      const item = this.items.get(id)
      if (sizeInfo && item) {
        const currentPrimarySize = getAxisSize(sizeInfo.preferredSize, axisInfo.primary)
        const newPrimarySize = currentPrimarySize + spacePerItem

        const newSize = createSizeFromAxis(
          newPrimarySize,
          getAxisSize(sizeInfo.preferredSize, axisInfo.cross),
          axisInfo.isHorizontal
        )

        const clampedSize = clampSizeWithConstraints(newSize, item.config.minSize, item.config.maxSize)

        sizeInfo.preferredSize = clampedSize
        sizeInfo.width = clampedSize.x
        sizeInfo.height = clampedSize.y
      }
    })
  }

  private calculateItemPositions(calculation: LayoutCalculationResult, axisInfo: AxisInfo): ItemPosition[] {
    const positions: ItemPosition[] = []
    const contentSize = this.constraints.availableSpace
    const toolbarSize = new vec2(
      contentSize.x + this.constraints.padding.left + this.constraints.padding.right,
      contentSize.y + this.constraints.padding.top + this.constraints.padding.bottom
    )
    const availablePrimarySpace = getAxisSize(contentSize, axisInfo.primary)

    const leftGroup = calculation.alignmentGroups.left
    const centerGroup = calculation.alignmentGroups.center
    const rightGroup = calculation.alignmentGroups.right

    const primaryPaddingStart = axisInfo.isHorizontal ? this.constraints.padding.left : this.constraints.padding.bottom
    const crossPaddingBottom = axisInfo.isHorizontal ? this.constraints.padding.bottom : this.constraints.padding.left
    const availableCrossSpace = getAxisSize(contentSize, axisInfo.cross)
    const crossCenterPos = crossPaddingBottom + availableCrossSpace / 2

    const calculateScaledGroupSize = (group: AlignmentGroupLayout, scaleFactor: number): number => {
      const itemSizesSum = group.itemSizes.reduce((sum, size) => sum + size, 0)
      const spacingSum = group.items.length > 1 ? (group.items.length - 1) * this.constraints.spacing : 0
      return itemSizesSum * scaleFactor + spacingSum
    }

    const scaledCenterTotalSize = calculateScaledGroupSize(centerGroup, calculation.overflowScaleFactor)
    const scaledRightTotalSize = calculateScaledGroupSize(rightGroup, calculation.overflowScaleFactor)

    leftGroup.startPosition = primaryPaddingStart
    centerGroup.startPosition = primaryPaddingStart + (availablePrimarySpace - scaledCenterTotalSize) / 2
    rightGroup.startPosition = primaryPaddingStart + availablePrimarySpace - scaledRightTotalSize

    this.addGroupPositions(
      positions,
      leftGroup,
      ToolbarAlignment.LEFT,
      axisInfo,
      calculation.overflowScaleFactor,
      crossCenterPos,
      calculation.itemSizes,
      toolbarSize
    )
    this.addGroupPositions(
      positions,
      centerGroup,
      ToolbarAlignment.CENTER,
      axisInfo,
      calculation.overflowScaleFactor,
      crossCenterPos,
      calculation.itemSizes,
      toolbarSize
    )
    this.addGroupPositions(
      positions,
      rightGroup,
      ToolbarAlignment.RIGHT,
      axisInfo,
      calculation.overflowScaleFactor,
      crossCenterPos,
      calculation.itemSizes,
      toolbarSize
    )

    return positions
  }

  private addGroupPositions(
    positions: ItemPosition[],
    group: AlignmentGroupLayout,
    alignment: AlignmentGroup,
    axisInfo: AxisInfo,
    scaleFactor: number,
    crossCenterPos: number,
    itemSizes: Map<string, ItemSizeInfo>,
    toolbarSize: vec2
  ) {
    let currentPrimaryPosition = group.startPosition

    const primaryToolbarHalfSize = getAxisSize(toolbarSize, axisInfo.primary) / 2
    const crossToolbarHalfSize = getAxisSize(toolbarSize, axisInfo.cross) / 2

    group.items.forEach((itemId, index) => {
      const sizeInfo = itemSizes.get(itemId)
      if (!sizeInfo) return

      const itemSize = new vec2(sizeInfo.width, sizeInfo.height)
      const scaledPrimarySize = getAxisSize(itemSize, axisInfo.primary) * scaleFactor
      const crossSize = getAxisSize(itemSize, axisInfo.cross)

      const primaryPos = currentPrimaryPosition + scaledPrimarySize / 2
      const crossPos = crossCenterPos

      const primaryPosRelativeToCenter = primaryPos - primaryToolbarHalfSize
      const crossPosRelativeToCenter = crossPos - crossToolbarHalfSize

      const position = createPositionVec3(primaryPosRelativeToCenter, crossPosRelativeToCenter, axisInfo.isHorizontal)

      const finalSize = createSizeFromAxis(scaledPrimarySize, crossSize, axisInfo.isHorizontal)

      positions.push({
        itemId,
        position,
        size: finalSize,
        alignmentGroup: alignment,
        indexInGroup: index
      })

      currentPrimaryPosition += scaledPrimarySize
      if (index < group.items.length - 1) {
        currentPrimaryPosition += this.constraints.spacing
      }
    })
  }

  private calculateContentBounds(itemPositions: ItemPosition[]): {min: vec3; max: vec3} {
    if (itemPositions.length === 0) {
      return {
        min: vec3.zero(),
        max: vec3.zero()
      }
    }

    let minX = Number.MAX_VALUE
    let minY = Number.MAX_VALUE
    let maxX = -Number.MAX_VALUE
    let maxY = -Number.MAX_VALUE

    itemPositions.forEach((pos) => {
      minX = Math.min(minX, pos.position.x - pos.size.x / 2)
      minY = Math.min(minY, pos.position.y - pos.size.y / 2)
      maxX = Math.max(maxX, pos.position.x + pos.size.x / 2)
      maxY = Math.max(maxY, pos.position.y + pos.size.y / 2)
    })

    return {
      min: new vec3(minX, minY, 0),
      max: new vec3(maxX, maxY, 0)
    }
  }
}
