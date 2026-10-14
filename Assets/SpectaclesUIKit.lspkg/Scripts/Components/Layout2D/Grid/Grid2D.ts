// ═══════════════════════════════════════════════════════════════════════════
// Grid2D.ts — Pure CSS Grid layout engine.
// Zero Lens Studio imports. Implements CSS Grid Layout Level 1 spec.
//
// Algorithm (6 steps, per CSS Grid spec sections 7-11):
//   1. Parse definitions
//   2. Place items
//   3. Resolve grid dimensions
//   4. Track sizing algorithm
//   5. Position items
//   6. Handle auto container sizing
// ═══════════════════════════════════════════════════════════════════════════

import {
  GridAlign,
  GridAutoFlow,
  GridContainerInput,
  GridItemInput,
  GridItemOutput,
  GridLayoutResult,
  GridTrackDef,
  GridTrackUnit,
} from "./GridTypes"

// ─── Internal Types ──────────────────────────────────────────────────────

interface PlacedItem {
  index: number // original GridItemInput index
  row: number // 0-based
  column: number
  rowSpan: number
  columnSpan: number
}

interface TrackState {
  baseSize: number
  growthLimit: number // Infinity for auto/fr
  definition: GridTrackDef
  frozen: boolean
}

interface ParsedArea {
  name: string
  row: number
  column: number
  rowSpan: number
  columnSpan: number
}

// ─── Parsing Helpers ─────────────────────────────────────────────────────

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min
  if (value > max) return max
  return value
}

/**
 * Expand `repeat(N, pattern)` expressions in a track list string.
 * E.g. "1fr repeat(3, 2cm 1fr) auto" → "1fr 2cm 1fr 2cm 1fr 2cm 1fr auto"
 */
function expandRepeat(str: string): string {
  let result = str
  let safety = 10
  while (safety-- > 0) {
    const idx = result.search(/repeat\s*\(/i)
    if (idx === -1) break

    // Find the matching closing paren, respecting nesting
    let depth = 0
    let start = -1
    let end = -1
    for (let i = idx; i < result.length; i++) {
      if (result[i] === "(") {
        if (start === -1) start = i
        depth++
      } else if (result[i] === ")") {
        depth--
        if (depth === 0) {
          end = i
          break
        }
      }
    }
    if (start === -1 || end === -1) break

    // Extract count and pattern from "repeat(N, pattern)"
    const inner = result.slice(start + 1, end)
    const commaIdx = inner.indexOf(",")
    if (commaIdx === -1) break

    const count = parseInt(inner.slice(0, commaIdx).trim(), 10)
    if (isNaN(count) || count <= 0) break

    const pattern = inner.slice(commaIdx + 1).trim()
    const parts: string[] = []
    for (let i = 0; i < count; i++) {
      parts.push(pattern)
    }

    result = result.slice(0, idx) + parts.join(" ") + result.slice(end + 1)
  }
  return result
}

/**
 * Parse a single track token into a GridTrackDef.
 * Handles: "Ncm", "Nfr", "auto", "minmax(min, max)"
 */
function parseTrackToken(token: string): GridTrackDef {
  token = token.trim()

  if (token === "auto") {
    return {value: 0, unit: GridTrackUnit.Auto}
  }

  if (token.startsWith("minmax(")) {
    // Extract inner: "minmax(Xcm, Yfr)" → "Xcm, Yfr"
    const inner = token.slice(7, -1).trim()
    const commaIdx = findTopLevelComma(inner)
    if (commaIdx === -1) {
      return {value: 0, unit: GridTrackUnit.Auto}
    }
    const minStr = inner.slice(0, commaIdx).trim()
    const maxStr = inner.slice(commaIdx + 1).trim()
    return {
      value: 0,
      unit: GridTrackUnit.MinMax,
      min: parseTrackToken(minStr),
      max: parseTrackToken(maxStr),
    }
  }

  if (token.endsWith("fr")) {
    const val = parseFloat(token.slice(0, -2))
    return {value: isNaN(val) ? 1 : val, unit: GridTrackUnit.Fr}
  }

  if (token.endsWith("cm")) {
    const val = parseFloat(token.slice(0, -2))
    return {value: isNaN(val) ? 0 : val, unit: GridTrackUnit.Cm}
  }

  // Bare number = cm
  const val = parseFloat(token)
  if (!isNaN(val)) {
    return {value: val, unit: GridTrackUnit.Cm}
  }

  return {value: 0, unit: GridTrackUnit.Auto}
}

function findTopLevelComma(str: string): number {
  let depth = 0
  for (let i = 0; i < str.length; i++) {
    if (str[i] === "(") depth++
    else if (str[i] === ")") depth--
    else if (str[i] === "," && depth === 0) return i
  }
  return -1
}

/**
 * Parse a track list string into GridTrackDef[].
 * Input: "1fr 2cm auto minmax(1cm, 1fr)"
 */
function parseTrackList(str: string): GridTrackDef[] {
  if (!str || str.trim() === "") return []

  const expanded = expandRepeat(str)
  const defs: GridTrackDef[] = []
  const tokens = tokenizeTrackList(expanded)

  for (const token of tokens) {
    defs.push(parseTrackToken(token))
  }

  return defs
}

/**
 * Tokenize a track list string, respecting parentheses for minmax().
 */
function tokenizeTrackList(str: string): string[] {
  const tokens: string[] = []
  let current = ""
  let depth = 0

  for (let i = 0; i < str.length; i++) {
    const ch = str[i]
    if (ch === "(") {
      depth++
      current += ch
    } else if (ch === ")") {
      depth--
      current += ch
    } else if (ch === " " && depth === 0) {
      if (current.trim()) {
        tokens.push(current.trim())
      }
      current = ""
    } else {
      current += ch
    }
  }
  if (current.trim()) {
    tokens.push(current.trim())
  }
  return tokens
}

/**
 * Parse template areas string into named area definitions.
 * Format: "header header / sidebar content / footer footer"
 * Rows separated by " / ", columns by spaces within each row.
 */
function parseTemplateAreas(str: string): ParsedArea[] | null {
  if (!str || str.trim() === "") return null

  const rows = str.split("/").map((r) => r.trim())
  if (rows.length === 0) return null

  // Build 2D grid of names
  const grid: string[][] = []
  let numCols = -1

  for (const row of rows) {
    const cells = row.split(/\s+/).filter((c) => c.length > 0)
    if (numCols === -1) {
      numCols = cells.length
    } else if (cells.length !== numCols) {
      // Invalid: not rectangular
      return null
    }
    grid.push(cells)
  }

  // Extract rectangular named regions
  const areas: ParsedArea[] = []
  const seen = new Set<string>()

  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < grid[r].length; c++) {
      const name = grid[r][c]
      if (name === "." || seen.has(name)) continue
      seen.add(name)

      // Find extent of this named region
      let maxCol = c
      while (maxCol + 1 < numCols && grid[r][maxCol + 1] === name) {
        maxCol++
      }

      let maxRow = r
      outer: while (maxRow + 1 < grid.length) {
        for (let cc = c; cc <= maxCol; cc++) {
          if (grid[maxRow + 1][cc] !== name) break outer
        }
        maxRow++
      }

      areas.push({
        name,
        row: r,
        column: c,
        rowSpan: maxRow - r + 1,
        columnSpan: maxCol - c + 1,
      })
    }
  }

  return areas.length > 0 ? areas : null
}

// ─── Main Entry Point ────────────────────────────────────────────────────

/**
 * Runs the CSS Grid Level 1 layout algorithm and returns the computed position
 * and size for each item, resolved track sizes, and container dimensions.
 *
 * This is a pure function with zero Lens Studio dependencies — all inputs and
 * outputs are plain data objects.
 *
 * Algorithm (6 steps, per CSS Grid spec sections 7-11):
 * 1. Parse track definitions and template areas
 * 2. Place items (named areas, explicit placement, auto-placement)
 * 3. Resolve grid dimensions
 * 4. Track sizing algorithm (intrinsic sizing, fr distribution)
 * 5. Position items within their cells (with alignment)
 * 6. Handle auto container sizing
 *
 * @param container - Container configuration (size, templates, flow, alignment, gaps, padding).
 * @param items - Array of item inputs (intrinsic sizes, placement, alignment, constraints).
 * @returns Layout result with per-item positions/sizes, resolved track sizes, and container dimensions.
 */
export function computeGridLayout(
  container: GridContainerInput,
  items: readonly GridItemInput[]
): GridLayoutResult {
  if (items.length === 0) {
    const w = container.width < 0 ? 0 : container.width
    const h = container.height < 0 ? 0 : container.height
    return {items: [], containerWidth: w, containerHeight: h, columnSizes: [], rowSizes: []}
  }

  // ── Step 1: Parse Definitions ─────────────────────────────────────────
  const explicitCols = parseTrackList(container.templateColumns)
  const explicitRows = parseTrackList(container.templateRows)
  const autoColDefs = parseTrackList(container.autoColumns)
  const autoRowDefs = parseTrackList(container.autoRows)
  const parsedAreas = parseTemplateAreas(container.templateAreas)

  // Default auto track if not specified
  const defaultAutoTrack: GridTrackDef = {value: 0, unit: GridTrackUnit.Auto}

  // ── Step 2: Place Items ───────────────────────────────────────────────
  const placed: PlacedItem[] = []
  let numCols = explicitCols.length
  let numRows = explicitRows.length

  // Build area lookup
  const areaMap = new Map<string, ParsedArea>()
  if (parsedAreas) {
    for (const area of parsedAreas) {
      areaMap.set(area.name, area)
      // Ensure grid is large enough for named areas
      numCols = Math.max(numCols, area.column + area.columnSpan)
      numRows = Math.max(numRows, area.row + area.rowSpan)
    }
  }

  // Phase 1: Named area items
  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    if (item.gridArea && areaMap.has(item.gridArea)) {
      const area = areaMap.get(item.gridArea)!
      placed.push({
        index: i,
        row: area.row,
        column: area.column,
        rowSpan: area.rowSpan,
        columnSpan: area.columnSpan,
      })
    }
  }

  // Phase 2: Explicitly placed items
  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    if (item.gridArea && areaMap.has(item.gridArea)) continue // already placed
    if (!item.autoPlacement) {
      const row = Math.max(0, item.gridRow)
      const col = Math.max(0, item.gridColumn)
      const rSpan = Math.max(1, item.rowSpan)
      const cSpan = Math.max(1, item.columnSpan)

      numCols = Math.max(numCols, col + cSpan)
      numRows = Math.max(numRows, row + rSpan)

      placed.push({
        index: i,
        row,
        column: col,
        rowSpan: rSpan,
        columnSpan: cSpan,
      })
    }
  }

  // Ensure minimum grid size
  if (numCols === 0) numCols = 1
  if (numRows === 0) numRows = 1

  // Phase 3: Auto-placed items
  const isColumnFlow =
    container.autoFlow === GridAutoFlow.Column ||
    container.autoFlow === GridAutoFlow.ColumnDense
  const isDense =
    container.autoFlow === GridAutoFlow.RowDense ||
    container.autoFlow === GridAutoFlow.ColumnDense

  // Build occupancy grid
  const placedIndices = new Set(placed.map((p) => p.index))

  // Collect auto-placement items
  const autoItems: {itemIndex: number; rowSpan: number; columnSpan: number}[] = []
  for (let i = 0; i < items.length; i++) {
    if (placedIndices.has(i)) continue
    if (items[i].autoPlacement || !(items[i].gridArea && areaMap.has(items[i].gridArea))) {
      if (!placedIndices.has(i)) {
        autoItems.push({
          itemIndex: i,
          rowSpan: Math.max(1, items[i].rowSpan),
          columnSpan: Math.max(1, items[i].columnSpan),
        })
      }
    }
  }

  // Auto-place items using occupancy grid scan
  if (autoItems.length > 0) {
    // Function to check and grow occupancy grid as needed
    const getOccupancy = (): boolean[][] => {
      const grid: boolean[][] = []
      for (let r = 0; r < numRows; r++) {
        grid.push(new Array(numCols).fill(false))
      }
      // Mark placed items
      for (const p of placed) {
        for (let r = p.row; r < p.row + p.rowSpan && r < numRows; r++) {
          for (let c = p.column; c < p.column + p.columnSpan && c < numCols; c++) {
            grid[r][c] = true
          }
        }
      }
      return grid
    }

    let cursorRow = 0
    let cursorCol = 0

    for (const autoItem of autoItems) {
      const rSpan = autoItem.rowSpan
      const cSpan = autoItem.columnSpan

      if (isDense) {
        cursorRow = 0
        cursorCol = 0
      }

      let foundPlacement = false

      // Search for available space
      const maxSearchIterations = 1000
      let iterations = 0

      while (!foundPlacement && iterations < maxSearchIterations) {
        iterations++
        const occupancy = getOccupancy()

        if (isColumnFlow) {
          // Column flow: scan top→bottom within each column, left→right across columns
          // Per CSS Grid spec: if an item's row span exceeds numRows, expand to fit
          if (rSpan > numRows) {
            numRows = rSpan
          }
          for (let c = cursorCol; !foundPlacement; c++) {
            // Grow columns as needed (don't grow rows in column flow)
            if (c + cSpan > numCols) {
              numCols = c + cSpan
            }
            const occupancyCol = getOccupancy()
            const startR = c === cursorCol ? cursorRow : 0
            for (let r = startR; r + rSpan <= numRows && !foundPlacement; r++) {
              if (canPlace(occupancyCol, r, c, rSpan, cSpan, numRows, numCols)) {
                placed.push({
                  index: autoItem.itemIndex,
                  row: r,
                  column: c,
                  rowSpan: rSpan,
                  columnSpan: cSpan,
                })
                cursorRow = r
                cursorCol = c
                foundPlacement = true
              }
            }
          }
        } else {
          // Row flow: scan left→right, top→bottom
          // Per CSS Grid spec: if an item's column span exceeds numCols, expand to fit
          if (cSpan > numCols) {
            numCols = cSpan
          }
          for (let r = cursorRow; r < numRows + rSpan && !foundPlacement; r++) {
            const startC = r === cursorRow ? cursorCol : 0
            for (let c = startC; c + cSpan <= numCols && !foundPlacement; c++) {
              if (r + rSpan > numRows) {
                numRows = r + rSpan
              }

              if (canPlace(occupancy, r, c, rSpan, cSpan, numRows, numCols)) {
                placed.push({
                  index: autoItem.itemIndex,
                  row: r,
                  column: c,
                  rowSpan: rSpan,
                  columnSpan: cSpan,
                })
                cursorRow = r
                cursorCol = c
                foundPlacement = true
              }
            }
          }

          if (!foundPlacement) {
            // Grow rows
            numRows += rSpan
            // Reset cursor and try again
            if (!isDense) {
              cursorRow = numRows - rSpan
              cursorCol = 0
            }
          }
        }
      }
    }
  }

  // ── Step 3: Resolve Grid Dimensions ───────────────────────────────────
  // Build final column and row track definitions
  const colDefs: GridTrackDef[] = []
  for (let c = 0; c < numCols; c++) {
    if (c < explicitCols.length) {
      colDefs.push(explicitCols[c])
    } else {
      // Implicit track: cycle through autoColumns
      const def = autoColDefs.length > 0
        ? autoColDefs[(c - explicitCols.length) % autoColDefs.length]
        : defaultAutoTrack
      colDefs.push(def)
    }
  }

  const rowDefs: GridTrackDef[] = []
  for (let r = 0; r < numRows; r++) {
    if (r < explicitRows.length) {
      rowDefs.push(explicitRows[r])
    } else {
      const def = autoRowDefs.length > 0
        ? autoRowDefs[(r - explicitRows.length) % autoRowDefs.length]
        : defaultAutoTrack
      rowDefs.push(def)
    }
  }

  // ── Step 4: Track Sizing Algorithm ────────────────────────────────────
  const padH = container.padding.left + container.padding.right
  const padV = container.padding.top + container.padding.bottom
  const totalColGaps = numCols > 1 ? (numCols - 1) * container.columnGap : 0
  const totalRowGaps = numRows > 1 ? (numRows - 1) * container.rowGap : 0

  const isAutoWidth = container.width < 0
  const isAutoHeight = container.height < 0
  const availableWidth = isAutoWidth ? -1 : container.width - padH - totalColGaps
  const availableHeight = isAutoHeight ? -1 : container.height - padV - totalRowGaps

  const colStates = sizeTracksForAxis(
    colDefs, placed, items, "column", availableWidth, container.columnGap
  )
  const rowStates = sizeTracksForAxis(
    rowDefs, placed, items, "row", availableHeight, container.rowGap
  )

  const colSizes = colStates.map((s) => s.baseSize)
  const rowSizes = rowStates.map((s) => s.baseSize)

  // ── Step 5: Position Items ────────────────────────────────────────────
  // Compute cumulative start positions (prefix sum + gaps)
  const colStarts: number[] = []
  let pos = container.padding.left
  for (let c = 0; c < numCols; c++) {
    colStarts.push(pos)
    pos += colSizes[c] + container.columnGap
  }

  const rowStarts: number[] = []
  pos = container.padding.top
  for (let r = 0; r < numRows; r++) {
    rowStarts.push(pos)
    pos += rowSizes[r] + container.rowGap
  }

  // Build output
  const outputItems: GridItemOutput[] = new Array(items.length)

  for (const p of placed) {
    const item = items[p.index]

    const cellX = colStarts[p.column]
    const cellY = rowStarts[p.row]
    const cellW = spanSize(colSizes, p.column, p.columnSpan, container.columnGap)
    const cellH = spanSize(rowSizes, p.row, p.rowSpan, container.rowGap)

    // Resolve effective alignment
    const hAlign = item.justifySelf !== GridAlign.Auto
      ? item.justifySelf
      : container.justifyItems
    const vAlign = item.alignSelf !== GridAlign.Auto
      ? item.alignSelf
      : container.alignItems

    // Resolve item size
    const maxW = item.maxWidth > 0 ? item.maxWidth : Infinity
    const maxH = item.maxHeight > 0 ? item.maxHeight : Infinity
    let itemW: number
    let itemH: number

    if (hAlign === GridAlign.Stretch) {
      itemW = clamp(cellW, item.minWidth, maxW)
    } else {
      itemW = clamp(item.intrinsicWidth, item.minWidth, maxW)
    }

    if (vAlign === GridAlign.Stretch) {
      itemH = clamp(cellH, item.minHeight, maxH)
    } else {
      itemH = clamp(item.intrinsicHeight, item.minHeight, maxH)
    }

    // Position within cell
    let x: number
    switch (hAlign) {
      case GridAlign.Start:
      case GridAlign.Stretch:
        x = cellX
        break
      case GridAlign.Center:
        x = cellX + (cellW - itemW) * 0.5
        break
      case GridAlign.End:
        x = cellX + cellW - itemW
        break
      default:
        x = cellX
    }

    let y: number
    switch (vAlign) {
      case GridAlign.Start:
      case GridAlign.Stretch:
        y = cellY
        break
      case GridAlign.Center:
        y = cellY + (cellH - itemH) * 0.5
        break
      case GridAlign.End:
        y = cellY + cellH - itemH
        break
      default:
        y = cellY
    }

    outputItems[p.index] = {
      index: p.index,
      x,
      y,
      width: itemW,
      height: itemH,
    }
  }

  // ── Step 6: Handle Auto Container Sizing ──────────────────────────────
  const totalColSize = colSizes.reduce((s, v) => s + v, 0)
  const totalRowSize = rowSizes.reduce((s, v) => s + v, 0)

  const containerWidth = isAutoWidth
    ? totalColSize + totalColGaps + padH
    : container.width
  const containerHeight = isAutoHeight
    ? totalRowSize + totalRowGaps + padV
    : container.height

  return {
    items: outputItems,
    containerWidth,
    containerHeight,
    columnSizes: colSizes,
    rowSizes,
  }
}

// ─── Track Sizing ────────────────────────────────────────────────────────

function sizeTracksForAxis(
  trackDefs: GridTrackDef[],
  placed: PlacedItem[],
  items: readonly GridItemInput[],
  axis: "column" | "row",
  availableSize: number,
  gap: number
): TrackState[] {
  const numTracks = trackDefs.length
  if (numTracks === 0) return []

  // Phase A: Initialize Track Sizes
  const tracks: TrackState[] = trackDefs.map((def) => {
    const resolved = resolveTrackInit(def)
    return {
      baseSize: resolved.base,
      growthLimit: resolved.limit,
      definition: def,
      frozen: false,
    }
  })

  // Phase B: Resolve Intrinsic Track Sizes

  // B.1: Non-spanning items (span=1)
  for (const p of placed) {
    const item = items[p.index]
    const trackIdx = axis === "column" ? p.column : p.row
    const span = axis === "column" ? p.columnSpan : p.rowSpan

    if (span !== 1) continue
    if (trackIdx >= numTracks) continue

    const intrinsic = axis === "column" ? item.intrinsicWidth : item.intrinsicHeight
    const min = axis === "column" ? item.minWidth : item.minHeight
    const max = axis === "column" ? (item.maxWidth > 0 ? item.maxWidth : Infinity) : (item.maxHeight > 0 ? item.maxHeight : Infinity)
    const required = clamp(intrinsic, min, max)

    const track = tracks[trackIdx]
    if (!isFixedTrack(track.definition) && getFrValue(track.definition) === 0) {
      track.baseSize = Math.max(track.baseSize, required)
      if (isFinite(track.growthLimit)) {
        track.growthLimit = Math.max(track.growthLimit, track.baseSize)
      }
    }
  }

  // B.2: Spanning items (span>1)
  // Collect spanning items sorted by span size
  const spanningItems: {pIdx: number; start: number; span: number; required: number}[] = []
  for (const p of placed) {
    const item = items[p.index]
    const start = axis === "column" ? p.column : p.row
    const span = axis === "column" ? p.columnSpan : p.rowSpan

    if (span <= 1) continue
    if (start >= numTracks) continue

    const intrinsic = axis === "column" ? item.intrinsicWidth : item.intrinsicHeight
    const min = axis === "column" ? item.minWidth : item.minHeight
    const max = axis === "column" ? (item.maxWidth > 0 ? item.maxWidth : Infinity) : (item.maxHeight > 0 ? item.maxHeight : Infinity)

    spanningItems.push({
      pIdx: p.index,
      start,
      span: Math.min(span, numTracks - start),
      required: clamp(intrinsic, min, max),
    })
  }

  spanningItems.sort((a, b) => a.span - b.span)

  for (const si of spanningItems) {
    const spannedTracks: number[] = []
    for (let t = si.start; t < si.start + si.span && t < numTracks; t++) {
      spannedTracks.push(t)
    }

    const internalGaps = (spannedTracks.length - 1) * gap
    const currentSize = spannedTracks.reduce((s, t) => s + tracks[t].baseSize, 0) + internalGaps

    if (si.required > currentSize) {
      const delta = si.required - currentSize

      // Distribute delta among non-fixed, non-fr tracks
      const nonFixed = spannedTracks.filter((t) => !isFixedTrack(tracks[t].definition) && getFrValue(tracks[t].definition) === 0)
      if (nonFixed.length > 0) {
        distributeSpaceToTracks(tracks, nonFixed, delta)
      } else {
        // Only distribute to all tracks if none are fr (all fixed)
        const hasFr = spannedTracks.some((t) => getFrValue(tracks[t].definition) > 0)
        if (!hasFr) {
          distributeSpaceToTracks(tracks, spannedTracks, delta)
        }
      }
    }
  }

  // Phase C: Maximize Tracks
  if (availableSize >= 0) {
    const totalBase = tracks.reduce((s, t) => s + t.baseSize, 0)
    const freeSpace = availableSize - totalBase
    if (freeSpace > 0) {
      const growable = tracks
        .map((t, i) => ({idx: i, t}))
        .filter(({t}) => !isFixedTrack(t.definition) && getFrValue(t.definition) === 0 && (isFinite(t.growthLimit) ? t.baseSize < t.growthLimit : true))
        .map(({idx}) => idx)

      if (growable.length > 0) {
        distributeSpaceToTracks(tracks, growable, freeSpace)
      }
    }
  }

  // Phase D: Expand Flexible Tracks (fr units)
  const frTracks: {idx: number; frValue: number}[] = []
  for (let i = 0; i < tracks.length; i++) {
    const frVal = getFrValue(tracks[i].definition)
    if (frVal > 0) {
      frTracks.push({idx: i, frValue: frVal})
    }
  }

  if (frTracks.length > 0 && availableSize >= 0) {
    const totalFr = frTracks.reduce((s, ft) => s + ft.frValue, 0)
    const nonFrSpace = tracks.reduce((s, t, i) => {
      const isFr = frTracks.some((ft) => ft.idx === i)
      return s + (isFr ? 0 : t.baseSize)
    }, 0)
    const freeSpace = Math.max(0, availableSize - nonFrSpace)
    const frUnit = totalFr > 0 ? freeSpace / totalFr : 0

    for (const ft of frTracks) {
      const frSize = ft.frValue * frUnit
      // For minmax(min, Nfr): floor at resolved min
      const minFloor = getMinMaxFloor(tracks[ft.idx].definition)
      tracks[ft.idx].baseSize = Math.max(tracks[ft.idx].baseSize, Math.max(frSize, minFloor))
    }
  }

  // Phase E: Stretch Auto Tracks (if container has definite size)
  if (availableSize >= 0) {
    const autoTracks = tracks
      .map((t, i) => ({idx: i, t}))
      .filter(({t}) => t.definition.unit === GridTrackUnit.Auto)
      .map(({idx}) => idx)

    if (autoTracks.length > 0) {
      const totalBase = tracks.reduce((s, t) => s + t.baseSize, 0)
      const remaining = availableSize - totalBase
      if (remaining > 0) {
        const share = remaining / autoTracks.length
        for (const idx of autoTracks) {
          tracks[idx].baseSize += share
        }
      }
    }
  }

  return tracks
}

function resolveTrackInit(def: GridTrackDef): {base: number; limit: number} {
  switch (def.unit) {
    case GridTrackUnit.Cm:
      return {base: def.value, limit: def.value}
    case GridTrackUnit.Auto:
      return {base: 0, limit: 0}
    case GridTrackUnit.Fr:
      return {base: 0, limit: Infinity}
    case GridTrackUnit.MinMax: {
      const minResolved = resolveTrackInit(def.min!)
      const maxResolved = resolveTrackInit(def.max!)
      return {
        base: minResolved.base,
        limit: maxResolved.limit,
      }
    }
    default:
      return {base: 0, limit: Infinity}
  }
}

function isFixedTrack(def: GridTrackDef): boolean {
  return def.unit === GridTrackUnit.Cm
}

function getFrValue(def: GridTrackDef): number {
  if (def.unit === GridTrackUnit.Fr) return def.value
  if (def.unit === GridTrackUnit.MinMax && def.max) return getFrValue(def.max)
  return 0
}

function getMinMaxFloor(def: GridTrackDef): number {
  if (def.unit === GridTrackUnit.MinMax && def.min) {
    return resolveTrackInit(def.min).base
  }
  return 0
}

function distributeSpaceToTracks(
  tracks: TrackState[],
  indices: number[],
  space: number
): void {
  if (indices.length === 0 || space <= 0) return

  let remaining = space
  const active = [...indices]

  // Multi-pass: distribute evenly, freeze tracks hitting growth limit
  for (let pass = 0; pass < 3 && remaining > 0.001 && active.length > 0; pass++) {
    const share = remaining / active.length
    let frozeAny = false
    const toRemove: number[] = []

    for (let i = 0; i < active.length; i++) {
      const t = tracks[active[i]]
      const proposed = t.baseSize + share

      if (isFinite(t.growthLimit) && proposed > t.growthLimit) {
        const added = t.growthLimit - t.baseSize
        t.baseSize = t.growthLimit
        remaining -= added
        toRemove.push(i)
        frozeAny = true
      }
    }

    // Remove frozen tracks (in reverse order to preserve indices)
    for (let i = toRemove.length - 1; i >= 0; i--) {
      active.splice(toRemove[i], 1)
    }

    if (!frozeAny && active.length > 0) {
      const finalShare = remaining / active.length
      for (const idx of active) {
        tracks[idx].baseSize += finalShare
      }
      remaining = 0
    }
  }
}

// ─── Occupancy & Span Helpers ────────────────────────────────────────────

function canPlace(
  occupancy: boolean[][],
  row: number,
  col: number,
  rowSpan: number,
  colSpan: number,
  numRows: number,
  numCols: number
): boolean {
  if (col + colSpan > numCols) return false
  if (row + rowSpan > numRows) return false

  for (let r = row; r < row + rowSpan; r++) {
    if (r >= occupancy.length) continue // new row, not occupied
    for (let c = col; c < col + colSpan; c++) {
      if (c >= occupancy[r].length) continue
      if (occupancy[r][c]) return false
    }
  }
  return true
}

function spanSize(
  sizes: number[],
  start: number,
  span: number,
  gap: number
): number {
  let total = 0
  for (let i = start; i < start + span && i < sizes.length; i++) {
    total += sizes[i]
    if (i > start) total += gap
  }
  return total
}
