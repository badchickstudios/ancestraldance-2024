import {ToolbarAlignment, ToolbarDirection} from "../Types/ToolbarSchema"

export type AlignmentGroup = ToolbarAlignment

export interface AlignmentGroupLayout {
  items: string[]
  totalSize: number
  startPosition: number
  itemSizes: number[]
}

export interface ItemSizeInfo {
  width: number
  height: number
  wantsFillPrimary: boolean
  wantsFillCross: boolean
  preferredSize: vec2
}

export interface LayoutCalculationResult {
  itemSizes: Map<string, ItemSizeInfo>
  alignmentGroups: {
    left: AlignmentGroupLayout
    center: AlignmentGroupLayout
    right: AlignmentGroupLayout
  }
  totalUsedSpace: number
  remainingSpace: number
  hasOverflow: boolean
  overflowScaleFactor: number
}

export interface ItemPosition {
  itemId: string
  position: vec3
  size: vec2
  alignmentGroup: AlignmentGroup
  indexInGroup: number
}

export interface ToolbarLayoutResult {
  itemPositions: ItemPosition[]
  calculation: LayoutCalculationResult
  contentBounds: {
    min: vec3
    max: vec3
  }
}

export interface LayoutConstraints {
  availableSpace: vec2
  direction: ToolbarDirection
  defaultCrossAxisSize: number
  spacing: number
  padding: {
    left: number
    right: number
    top: number
    bottom: number
  }
}

export interface AxisInfo {
  primary: "x" | "y"
  cross: "x" | "y"
  isHorizontal: boolean
}

export function getAxisInfo(direction: ToolbarDirection): AxisInfo {
  const isHorizontal = direction === "horizontal"
  return {
    primary: isHorizontal ? "x" : "y",
    cross: isHorizontal ? "y" : "x",
    isHorizontal
  }
}

export function getAxisSize(size: vec2, axis: "x" | "y"): number {
  return axis === "x" ? size.x : size.y
}

export function createSizeFromAxis(primaryValue: number, crossValue: number, isHorizontal: boolean): vec2 {
  return isHorizontal ? new vec2(primaryValue, crossValue) : new vec2(crossValue, primaryValue)
}

export type OverflowStrategy = "scale" | "clip" | "scroll"

export interface OverflowInfo {
  hasOverflow: boolean
  overflowAmount: number
  strategy: OverflowStrategy
  scaleFactor: number
}

export function calculateOverflow(
  totalRequiredSpace: number,
  availableSpace: number,
  strategy: OverflowStrategy = "scale"
): OverflowInfo {
  const overflowAmount = totalRequiredSpace - availableSpace
  const hasOverflow = overflowAmount > 0

  let scaleFactor = 1.0
  if (hasOverflow && strategy === "scale" && totalRequiredSpace > 0) {
    scaleFactor = availableSpace / totalRequiredSpace
  }

  return {hasOverflow, overflowAmount, strategy, scaleFactor}
}

export function createPositionVec3(
  primaryPosition: number,
  crossPosition: number,
  isHorizontal: boolean,
  zOffset: number = 0.1
): vec3 {
  return isHorizontal
    ? new vec3(primaryPosition, crossPosition, zOffset)
    : new vec3(crossPosition, primaryPosition, zOffset)
}

export function clampSizeWithConstraints(size: vec2, minSize?: vec2, maxSize?: vec2): vec2 {
  const minX = minSize?.x ?? 0
  const minY = minSize?.y ?? 0
  const maxX = maxSize?.x ?? Number.MAX_VALUE
  const maxY = maxSize?.y ?? Number.MAX_VALUE

  return new vec2(MathUtils.clamp(size.x, minX, maxX), MathUtils.clamp(size.y, minY, maxY))
}
