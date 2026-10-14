// ═══════════════════════════════════════════════════════════════════════════
// Flexbox2D.ts — Pure 2D Flexbox layout engine.
// Zero Lens Studio imports. Depends only on FlexTypes.
//
// Implements CSS Flexbox spec sections 9.1–9.6:
//   Sort → hypothetical sizes → line breaking → grow/shrink →
//   main-axis justify → cross-axis line sizes → align-content →
//   align-items/align-self → map to x/y
// ═══════════════════════════════════════════════════════════════════════════

import {
  FlexAlign,
  FlexAlignContent,
  FlexAlignSelf,
  FlexContainerInput,
  FlexDirection,
  FlexItemInput,
  FlexItemOutput,
  FlexJustify,
  FlexLayoutResult,
  FlexWrap
} from "./FlexTypes"

// ─── Axis Helpers ────────────────────────────────────────────────────────

function isRowDirection(dir: FlexDirection): boolean {
  return dir === FlexDirection.Row || dir === FlexDirection.RowReverse
}

function isReversed(dir: FlexDirection): boolean {
  return dir === FlexDirection.RowReverse || dir === FlexDirection.ColumnReverse
}

function mainSize(item: FlexItemInput, dir: FlexDirection): number {
  return isRowDirection(dir) ? item.intrinsicWidth : item.intrinsicHeight
}

function crossSize(item: FlexItemInput, dir: FlexDirection): number {
  return isRowDirection(dir) ? item.intrinsicHeight : item.intrinsicWidth
}

function mainMin(item: FlexItemInput, dir: FlexDirection): number {
  return isRowDirection(dir) ? item.minWidth : item.minHeight
}

function mainMax(item: FlexItemInput, dir: FlexDirection): number {
  const max = isRowDirection(dir) ? item.maxWidth : item.maxHeight
  return max <= 0 ? Infinity : max
}

function crossMin(item: FlexItemInput, dir: FlexDirection): number {
  return isRowDirection(dir) ? item.minHeight : item.minWidth
}

function crossMax(item: FlexItemInput, dir: FlexDirection): number {
  const max = isRowDirection(dir) ? item.maxHeight : item.maxWidth
  return max <= 0 ? Infinity : max
}

function mainGap(container: FlexContainerInput): number {
  return isRowDirection(container.direction) ? container.columnGap : container.rowGap
}

function crossGap(container: FlexContainerInput): number {
  return isRowDirection(container.direction) ? container.rowGap : container.columnGap
}

function mainPaddingStart(container: FlexContainerInput): number {
  const dir = container.direction
  if (isRowDirection(dir)) return container.padding.left
  return container.padding.top
}

function mainPaddingEnd(container: FlexContainerInput): number {
  const dir = container.direction
  if (isRowDirection(dir)) return container.padding.right
  return container.padding.bottom
}

function crossPaddingStart(container: FlexContainerInput): number {
  const dir = container.direction
  if (isRowDirection(dir)) return container.padding.top
  return container.padding.left
}

function crossPaddingEnd(container: FlexContainerInput): number {
  const dir = container.direction
  if (isRowDirection(dir)) return container.padding.bottom
  return container.padding.right
}

function containerMainSize(container: FlexContainerInput): number {
  return isRowDirection(container.direction) ? container.width : container.height
}

function containerCrossSize(container: FlexContainerInput): number {
  return isRowDirection(container.direction) ? container.height : container.width
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min
  if (value > max) return max
  return value
}

// ─── Margin Helpers ───────────────────────────────────────────────────────

function mainMarginStart(item: FlexItemInput, dir: FlexDirection): number {
  if (isRowDirection(dir)) {
    return isReversed(dir) ? item.marginRight : item.marginLeft
  }
  return isReversed(dir) ? item.marginBottom : item.marginTop
}

function mainMarginEnd(item: FlexItemInput, dir: FlexDirection): number {
  if (isRowDirection(dir)) {
    return isReversed(dir) ? item.marginLeft : item.marginRight
  }
  return isReversed(dir) ? item.marginTop : item.marginBottom
}

function mainMarginTotal(item: FlexItemInput, dir: FlexDirection): number {
  return mainMarginStart(item, dir) + mainMarginEnd(item, dir)
}

function crossMarginStart(item: FlexItemInput, dir: FlexDirection): number {
  if (isRowDirection(dir)) {
    return item.marginTop
  }
  return item.marginLeft
}

function crossMarginEnd(item: FlexItemInput, dir: FlexDirection): number {
  if (isRowDirection(dir)) {
    return item.marginBottom
  }
  return item.marginRight
}

function crossMarginTotal(item: FlexItemInput, dir: FlexDirection): number {
  return crossMarginStart(item, dir) + crossMarginEnd(item, dir)
}

// ─── Internal Types ──────────────────────────────────────────────────────

interface SortedItem {
  originalIndex: number
  input: FlexItemInput
  clampedMain: number // after basis + clamp
  resolvedMain: number // after grow/shrink
  resolvedCross: number
  mainPos: number
  crossPos: number
}

interface FlexLine {
  items: SortedItem[]
  crossExtent: number // resolved cross size for this line
  crossOffset: number // offset within the container cross axis
}

// ─── Main Entry Point ────────────────────────────────────────────────────

/**
 * Runs the CSS Flexbox layout algorithm (spec sections 9.1-9.6) and returns
 * the computed position and size for each item plus the resolved container dimensions.
 *
 * This is a pure function with zero Lens Studio dependencies — all inputs and
 * outputs are plain data objects.
 *
 * @param container - Container configuration (size, direction, wrapping, alignment, gaps, padding).
 * @param items - Array of item inputs (intrinsic sizes, flex properties, margins, constraints).
 * @returns Layout result with per-item positions/sizes and resolved container dimensions.
 */
export function computeFlexLayout(container: FlexContainerInput, items: readonly FlexItemInput[]): FlexLayoutResult {
  if (items.length === 0) {
    const w = container.width < 0 ? 0 : container.width
    const h = container.height < 0 ? 0 : container.height
    return {items: [], containerWidth: w, containerHeight: h}
  }

  const dir = container.direction

  // ── Step 0: Sort by order (stable) ──────────────────────────────────
  const sorted: SortedItem[] = items.map((input, i) => ({
    originalIndex: i,
    input,
    clampedMain: 0,
    resolvedMain: 0,
    resolvedCross: 0,
    mainPos: 0,
    crossPos: 0
  }))

  sorted.sort((a, b) => {
    const orderDiff = a.input.order - b.input.order
    if (orderDiff !== 0) return orderDiff
    return a.originalIndex - b.originalIndex
  })

  // ── Step 1: Hypothetical main sizes ─────────────────────────────────
  for (const item of sorted) {
    const basis = item.input.flexBasis >= 0 ? item.input.flexBasis : mainSize(item.input, dir)
    item.clampedMain = clamp(basis, mainMin(item.input, dir), mainMax(item.input, dir))
  }

  // ── Step 2: Collect into flex lines ─────────────────────────────────
  const lines: FlexLine[] = []
  const mPadStart = mainPaddingStart(container)
  const mPadEnd = mainPaddingEnd(container)
  const mGap = mainGap(container)

  const availableMain = containerMainSize(container)
  const isAutoMain = availableMain < 0
  const innerMain = isAutoMain ? Infinity : availableMain - mPadStart - mPadEnd

  if (container.wrap === FlexWrap.NoWrap || isAutoMain) {
    // Single line
    lines.push({items: [...sorted], crossExtent: 0, crossOffset: 0})
  } else {
    // Multi-line wrapping
    let currentLine: SortedItem[] = []
    let lineMain = 0

    for (const item of sorted) {
      const itemMargins = mainMarginTotal(item.input, dir)
      const itemOuter = item.clampedMain + itemMargins
      const itemOuterWithGap = currentLine.length > 0 ? itemOuter + mGap : itemOuter
      if (currentLine.length > 0 && lineMain + itemOuterWithGap > innerMain) {
        lines.push({items: currentLine, crossExtent: 0, crossOffset: 0})
        currentLine = [item]
        lineMain = itemOuter
      } else {
        currentLine.push(item)
        lineMain += itemOuterWithGap
      }
    }
    if (currentLine.length > 0) {
      lines.push({items: currentLine, crossExtent: 0, crossOffset: 0})
    }
  }

  // If WrapReverse, reverse the line order
  if (container.wrap === FlexWrap.WrapReverse) {
    lines.reverse()
  }

  // ── Step 3: Resolve flexible sizes (grow/shrink) per line ───────────
  for (const line of lines) {
    resolveFlexibleSizes(line.items, innerMain, mGap, dir)
  }

  // ── Step 4: Main-axis positioning per line (justify-content) ────────
  for (const line of lines) {
    positionMainAxis(line.items, container, innerMain, mGap, mPadStart)
  }

  // ── Step 5: Cross-axis line sizes ───────────────────────────────────
  for (const line of lines) {
    let maxCross = 0
    for (const item of line.items) {
      const ic = crossSize(item.input, dir)
      const cMin = crossMin(item.input, dir)
      const cMax = crossMax(item.input, dir)
      const itemCross = clamp(ic, cMin, cMax)
      const itemCrossOuter = itemCross + crossMarginTotal(item.input, dir)
      if (itemCrossOuter > maxCross) maxCross = itemCrossOuter
    }
    line.crossExtent = maxCross
  }

  // ── Step 6: Resolve cross sizes + container auto sizing ─────────────
  const cPadStart = crossPaddingStart(container)
  const cPadEnd = crossPaddingEnd(container)
  const cGap = crossGap(container)

  const totalCrossGaps = lines.length > 1 ? (lines.length - 1) * cGap : 0
  const naturalCrossSum = lines.reduce((sum, l) => sum + l.crossExtent, 0) + totalCrossGaps

  const requestedCross = containerCrossSize(container)
  const isAutoCross = requestedCross < 0
  const innerCross = isAutoCross ? naturalCrossSum : requestedCross - cPadStart - cPadEnd

  // CSS spec 9.4.8: single-line container with definite cross size →
  // the line's cross extent equals the container's inner cross size.
  // This ensures align-items centers items within the full container height.
  if (lines.length === 1 && !isAutoCross) {
    lines[0].crossExtent = innerCross
  }

  // ── Step 7: Align-content (multi-line) ──────────────────────────────
  distributeLines(lines, container.alignContent, innerCross, cGap, cPadStart)

  // ── Step 8: Align-items / align-self per item ───────────────────────
  for (const line of lines) {
    for (const item of line.items) {
      const effAlign = resolveAlignSelf(item.input.alignSelf, container.alignItems)
      const ic = crossSize(item.input, dir)
      const cMin = crossMin(item.input, dir)
      const cMax = crossMax(item.input, dir)
      const cmStart = crossMarginStart(item.input, dir)
      const cmEnd = crossMarginEnd(item.input, dir)

      switch (effAlign) {
        case FlexAlign.Start:
          item.resolvedCross = clamp(ic, cMin, cMax)
          item.crossPos = line.crossOffset + cmStart
          break
        case FlexAlign.End:
          item.resolvedCross = clamp(ic, cMin, cMax)
          item.crossPos = line.crossOffset + line.crossExtent - item.resolvedCross - cmEnd
          break
        case FlexAlign.Center:
          item.resolvedCross = clamp(ic, cMin, cMax)
          item.crossPos = line.crossOffset + (line.crossExtent - item.resolvedCross - cmStart - cmEnd) * 0.5 + cmStart
          break
        case FlexAlign.Stretch: {
          const stretchable = line.crossExtent - cmStart - cmEnd
          item.resolvedCross = clamp(stretchable, cMin, cMax)
          item.crossPos = line.crossOffset + cmStart
          break
        }
      }
    }
  }

  // ── Step 9: Map to x/y ──────────────────────────────────────────────
  // Compute resolved container dimensions
  let resolvedContainerWidth: number
  let resolvedContainerHeight: number

  if (isRowDirection(dir)) {
    if (isAutoMain) {
      // auto main (width) = sum of items + margins + gaps + padding
      let maxLineMain = 0
      for (const line of lines) {
        let lineMain = 0
        for (let i = 0; i < line.items.length; i++) {
          if (i > 0) lineMain += mGap
          lineMain += line.items[i].resolvedMain + mainMarginTotal(line.items[i].input, dir)
        }
        if (lineMain > maxLineMain) maxLineMain = lineMain
      }
      resolvedContainerWidth = maxLineMain + mPadStart + mPadEnd
    } else {
      resolvedContainerWidth = container.width
    }

    if (isAutoCross) {
      resolvedContainerHeight = naturalCrossSum + cPadStart + cPadEnd
    } else {
      resolvedContainerHeight = container.height
    }
  } else {
    if (isAutoMain) {
      let maxLineMain = 0
      for (const line of lines) {
        let lineMain = 0
        for (let i = 0; i < line.items.length; i++) {
          if (i > 0) lineMain += mGap
          lineMain += line.items[i].resolvedMain + mainMarginTotal(line.items[i].input, dir)
        }
        if (lineMain > maxLineMain) maxLineMain = lineMain
      }
      resolvedContainerHeight = maxLineMain + mPadStart + mPadEnd
    } else {
      resolvedContainerHeight = container.height
    }

    if (isAutoCross) {
      resolvedContainerWidth = naturalCrossSum + cPadStart + cPadEnd
    } else {
      resolvedContainerWidth = container.width
    }
  }

  // Build output
  const outputItems: FlexItemOutput[] = new Array(items.length)

  for (const line of lines) {
    for (const item of line.items) {
      let x: number
      let y: number
      let w: number
      let h: number

      if (isRowDirection(dir)) {
        x = item.mainPos
        y = item.crossPos
        w = item.resolvedMain
        h = item.resolvedCross
      } else {
        x = item.crossPos
        y = item.mainPos
        w = item.resolvedCross
        h = item.resolvedMain
      }

      outputItems[item.originalIndex] = {
        index: item.originalIndex,
        x,
        y,
        width: w,
        height: h
      }
    }
  }

  return {
    items: outputItems,
    containerWidth: resolvedContainerWidth,
    containerHeight: resolvedContainerHeight
  }
}

// ─── Step 3 Helper: Grow/Shrink ──────────────────────────────────────────

function resolveFlexibleSizes(items: SortedItem[], innerMain: number, gap: number, dir: FlexDirection): void {
  const totalGaps = items.length > 1 ? (items.length - 1) * gap : 0
  const totalClamped = items.reduce((s, it) => s + it.clampedMain, 0)
  const totalMargins = items.reduce((s, it) => s + mainMarginTotal(it.input, dir), 0)
  const freeSpace = innerMain - totalGaps - totalClamped - totalMargins

  if (!isFinite(innerMain)) {
    // Auto main size: no grow/shrink
    for (const item of items) {
      item.resolvedMain = item.clampedMain
    }
    return
  }

  if (freeSpace > 0) {
    // Grow
    distributeFlexGrow(items, freeSpace, dir)
  } else if (freeSpace < 0) {
    // Shrink
    distributeFlexShrink(items, -freeSpace, dir)
  } else {
    for (const item of items) {
      item.resolvedMain = item.clampedMain
    }
  }
}

function distributeFlexGrow(items: SortedItem[], freeSpace: number, dir: FlexDirection): void {
  // Initialize all resolved sizes
  for (const item of items) {
    item.resolvedMain = item.clampedMain
  }

  const totalGrow = items.reduce((s, it) => s + it.input.flexGrow, 0)
  if (totalGrow <= 0) return

  // Multi-pass freeze-and-redistribute (up to items.length passes,
  // as in the worst case exactly one item freezes per pass)
  const frozen = new Set<number>()
  let remaining = freeSpace

  for (let pass = 0; pass < items.length && remaining > 0.001; pass++) {
    const activeGrow = items.reduce((s, it, i) => s + (frozen.has(i) ? 0 : it.input.flexGrow), 0)
    if (activeGrow <= 0) break

    let frozeAny = false

    for (let i = 0; i < items.length; i++) {
      if (frozen.has(i) || items[i].input.flexGrow <= 0) continue

      const share = (items[i].input.flexGrow / activeGrow) * remaining
      const proposed = items[i].clampedMain + share
      const max = mainMax(items[i].input, dir)

      if (proposed > max) {
        items[i].resolvedMain = max
        frozen.add(i)
        remaining -= max - items[i].clampedMain
        frozeAny = true
      }
    }

    if (!frozeAny) {
      // Distribute remaining to all unfrozen
      const finalActiveGrow = items.reduce((s, it, i) => s + (frozen.has(i) ? 0 : it.input.flexGrow), 0)
      if (finalActiveGrow <= 0) break

      for (let i = 0; i < items.length; i++) {
        if (frozen.has(i) || items[i].input.flexGrow <= 0) continue
        const share = (items[i].input.flexGrow / finalActiveGrow) * remaining
        items[i].resolvedMain = items[i].clampedMain + share
      }
      remaining = 0
    }
  }
}

function distributeFlexShrink(items: SortedItem[], overflow: number, dir: FlexDirection): void {
  // Initialize all resolved sizes
  for (const item of items) {
    item.resolvedMain = item.clampedMain
  }

  // Weighted shrink factor = flexShrink * baseSize
  const totalWeightedShrink = items.reduce((s, it) => s + it.input.flexShrink * it.clampedMain, 0)
  if (totalWeightedShrink <= 0) return

  const frozen = new Set<number>()
  let remaining = overflow

  for (let pass = 0; pass < items.length && remaining > 0.001; pass++) {
    const activeWeighted = items.reduce((s, it, i) => s + (frozen.has(i) ? 0 : it.input.flexShrink * it.clampedMain), 0)
    if (activeWeighted <= 0) break

    let frozeAny = false

    for (let i = 0; i < items.length; i++) {
      if (frozen.has(i) || items[i].input.flexShrink <= 0) continue

      const weight = items[i].input.flexShrink * items[i].clampedMain
      const shrinkAmount = (weight / activeWeighted) * remaining
      const proposed = items[i].clampedMain - shrinkAmount
      const min = mainMin(items[i].input, dir)

      if (proposed < min) {
        items[i].resolvedMain = min
        frozen.add(i)
        remaining -= items[i].clampedMain - min
        frozeAny = true
      }
    }

    if (!frozeAny) {
      const finalActiveWeighted = items.reduce(
        (s, it, i) => s + (frozen.has(i) ? 0 : it.input.flexShrink * it.clampedMain),
        0
      )
      if (finalActiveWeighted <= 0) break

      for (let i = 0; i < items.length; i++) {
        if (frozen.has(i) || items[i].input.flexShrink <= 0) continue
        const weight = items[i].input.flexShrink * items[i].clampedMain
        const shrinkAmount = (weight / finalActiveWeighted) * remaining
        items[i].resolvedMain = items[i].clampedMain - shrinkAmount
      }
      remaining = 0
    }
  }
}

// ─── Step 4 Helper: Main-axis Positioning (justify-content) ──────────────

function positionMainAxis(
  items: SortedItem[],
  container: FlexContainerInput,
  innerMain: number,
  gap: number,
  padStart: number
): void {
  const dir = container.direction
  const n = items.length
  const totalItemMain = items.reduce((s, it) => s + it.resolvedMain, 0)
  const totalGaps = n > 1 ? (n - 1) * gap : 0
  const totalMargins = items.reduce((s, it) => s + mainMarginTotal(it.input, dir), 0)
  const usedMain = totalItemMain + totalGaps + totalMargins

  const isAutoMain = !isFinite(innerMain) || containerMainSize(container) < 0
  const effectiveInner = isAutoMain ? usedMain : innerMain
  const freeSpace = Math.max(0, effectiveInner - usedMain)

  const reversed = isReversed(dir)

  let startOffset: number
  let spacing: number

  switch (container.justifyContent) {
    case FlexJustify.Start:
      startOffset = 0
      spacing = gap
      break
    case FlexJustify.End:
      startOffset = freeSpace
      spacing = gap
      break
    case FlexJustify.Center:
      startOffset = freeSpace * 0.5
      spacing = gap
      break
    case FlexJustify.SpaceBetween:
      startOffset = 0
      spacing = n > 1 ? (freeSpace + totalGaps) / (n - 1) : gap
      break
    case FlexJustify.SpaceAround:
      spacing = n > 0 ? (freeSpace + totalGaps) / n : gap
      startOffset = spacing * 0.5
      break
    case FlexJustify.SpaceEvenly:
      spacing = n > 0 ? (freeSpace + totalGaps) / (n + 1) : gap
      startOffset = spacing
      break
    default:
      startOffset = 0
      spacing = gap
  }

  if (reversed) {
    // Place from end — for reversed, mainMarginStart/End are already flipped
    let pos = padStart + effectiveInner - startOffset
    for (const item of items) {
      pos -= mainMarginStart(item.input, dir)
      pos -= item.resolvedMain
      item.mainPos = pos
      pos -= mainMarginEnd(item.input, dir)
      pos -= spacing
    }
  } else {
    let pos = padStart + startOffset
    for (const item of items) {
      pos += mainMarginStart(item.input, dir)
      item.mainPos = pos
      pos += item.resolvedMain
      pos += mainMarginEnd(item.input, dir)
      pos += spacing
    }
  }
}

// ─── Step 7 Helper: Distribute Lines (align-content) ─────────────────────

function distributeLines(
  lines: FlexLine[],
  alignContent: FlexAlignContent,
  innerCross: number,
  gap: number,
  padStart: number
): void {
  const n = lines.length
  if (n === 0) return

  const totalLineCross = lines.reduce((s, l) => s + l.crossExtent, 0)
  const totalGaps = n > 1 ? (n - 1) * gap : 0
  const usedCross = totalLineCross + totalGaps
  const freeCross = Math.max(0, innerCross - usedCross)

  let startOffset: number
  let spacing: number

  switch (alignContent) {
    case FlexAlignContent.Start:
      startOffset = 0
      spacing = gap
      break
    case FlexAlignContent.End:
      startOffset = freeCross
      spacing = gap
      break
    case FlexAlignContent.Center:
      startOffset = freeCross * 0.5
      spacing = gap
      break
    case FlexAlignContent.SpaceBetween:
      startOffset = 0
      spacing = n > 1 ? (freeCross + totalGaps) / (n - 1) : gap
      break
    case FlexAlignContent.SpaceAround:
      spacing = n > 0 ? (freeCross + totalGaps) / n : gap
      startOffset = spacing * 0.5
      break
    case FlexAlignContent.SpaceEvenly:
      spacing = n > 0 ? (freeCross + totalGaps) / (n + 1) : gap
      startOffset = spacing
      break
    case FlexAlignContent.Stretch: {
      // Distribute extra cross space proportionally to each line
      const extraPerLine = n > 0 ? freeCross / n : 0
      let pos = padStart
      for (const line of lines) {
        line.crossExtent += extraPerLine
        line.crossOffset = pos
        pos += line.crossExtent + gap
      }
      return
    }
    default:
      startOffset = 0
      spacing = gap
  }

  let pos = padStart + startOffset
  for (const line of lines) {
    line.crossOffset = pos
    pos += line.crossExtent + spacing
  }
}

// ─── Align-self Resolution ───────────────────────────────────────────────

function resolveAlignSelf(alignSelf: FlexAlignSelf, alignItems: FlexAlign): FlexAlign {
  if (alignSelf === FlexAlignSelf.Auto) return alignItems
  // FlexAlignSelf values (excluding Auto) map directly to FlexAlign
  return alignSelf as unknown as FlexAlign
}
