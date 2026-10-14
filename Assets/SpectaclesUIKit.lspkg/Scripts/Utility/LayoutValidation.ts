import NativeLogger from "SpectaclesInteractionKit.lspkg/Utils/NativeLogger"
import {
  Alignment,
  Anchor,
  Axis,
  GridBoundsConstraints,
  GridPlacement,
  Overflow,
  WrapDirection
} from "../Components/Layout/LayoutConfigurationTypes"
import {
  getAllowedWrapDirectionsForAxis,
  isWrapDirectionPerpendicularToAxis,
  WRAP_DIRECTION_INFO
} from "./LayoutUtilities"

const log = new NativeLogger("LayoutValidation")

// ═══════════════════════════════════════════════════════════════════════════
// BASIC VALUE VALIDATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Validates that a value is non-negative.
 * @param value - The value to validate.
 * @param propertyName - The name of the property for error messages.
 * @throws Error if value is negative.
 */
export function validateNonNegative(value: number, propertyName: string): void {
  if (value < 0) {
    throw new Error(`${propertyName} must be non-negative. Got: ${value}`)
  }
}

/**
 * Validates that a value is positive.
 * @param value - The value to validate.
 * @param propertyName - The name of the property for error messages.
 * @throws Error if value is not positive.
 */
export function validatePositive(value: number, propertyName: string): void {
  if (value <= 0) {
    throw new Error(`${propertyName} must be positive. Got: ${value}`)
  }
}

/**
 * Validates that a value is an integer.
 * @param value - The value to validate.
 * @param propertyName - The name of the property for error messages.
 * @throws Error if value is not a finite integer.
 */
export function validateInteger(value: number, propertyName: string): void {
  if (!Number.isFinite(value) || !Number.isInteger(value)) {
    throw new Error(`${propertyName} must be an integer. Got: ${value}`)
  }
}

/**
 * Validates that a value is a valid Anchor enum value.
 * @param value - The value to validate.
 * @param propertyName - The name of the property for error messages.
 * @throws Error if value is not a valid Anchor.
 */
export function validateAnchor(value: Anchor, propertyName: string): void {
  if (!Object.values(Anchor).includes(value)) {
    throw new Error(`${propertyName} must be a valid Anchor (${Object.values(Anchor).join(", ")}). Got: ${value}`)
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SINGLE AXIS LAYOUT CONFIGURATION VALIDATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Validates the complete configuration for a SingleAxisLayout.
 * This method performs cross-property validations that depend on multiple settings.
 *
 * @param flexibleSize - Whether flexible sizing is enabled.
 * @param normalizedChildSize - Whether normalized child sizing is enabled.
 * @param overflow - The overflow mode.
 * @param alignment - The alignment mode.
 * @param autoAlignment - Whether auto alignment is enabled.
 * @param anchor - The anchor point.
 * @param childSize - The child size value.
 * @param secondaryDirection - The secondary wrap direction.
 * @param axis - The layout axis.
 * @param secondarySize - The size limit for the secondary axis (for tertiary wrapping).
 * @param tertiaryDirection - The tertiary wrap direction.
 * @throws Error if configuration is invalid.
 */
export function validateSingleAxisConfiguration(
  flexibleSize: boolean,
  normalizedChildSize: boolean,
  overflow: Overflow,
  alignment: Alignment,
  autoAlignment: boolean,
  childSize: number,
  secondaryDirection: WrapDirection,
  axis: Axis,
  secondarySize: number = Infinity,
  tertiaryDirection?: WrapDirection
): void {
  // Normalized child size requires fixed size (flexibleSize = false)
  if (normalizedChildSize && flexibleSize) {
    throw new Error(
      "Normalized child size requires a fixed layout size. Set flexibleSize to false or disable normalizedChildSize."
    )
  }

  // Normalized child size must be <= 1
  if (normalizedChildSize && childSize > 1) {
    throw new Error(`When normalizedChildSize is enabled, childSize must be between 0 and 1. Got: ${childSize}`)
  }

  // Stretch/StretchSpacing alignments require fixed size when autoAlignment is enabled
  if (autoAlignment && (alignment === Alignment.Stretch || alignment === Alignment.StretchSpacing) && flexibleSize) {
    throw new Error(
      `${alignment === Alignment.Stretch ? "Stretch" : "Stretch Spacing"} alignment requires a fixed layout size. ` +
        `Set flexibleSize to false or choose a different alignment.`
    )
  }

  // Wrap direction must be perpendicular to layout axis (when overflow = wrap)
  if (overflow === Overflow.Wrap && !flexibleSize) {
    if (!isWrapDirectionPerpendicularToAxis(secondaryDirection, axis)) {
      throw new Error(
        `Secondary wrap direction "${secondaryDirection}" is parallel to layout axis "${axis}". ` +
          `Wrap direction must be perpendicular. Allowed directions for ${axis} axis: ${getAllowedWrapDirectionsForAxis(axis)}`
      )
    }

    // Tertiary wrap validation
    if (secondarySize !== Infinity && tertiaryDirection !== undefined) {
      // 1. Tertiary must be perpendicular to Main Axis
      if (!isWrapDirectionPerpendicularToAxis(tertiaryDirection, axis)) {
        throw new Error(
          `Tertiary wrap direction "${tertiaryDirection}" is parallel to layout axis "${axis}". ` +
            `Tertiary wrap direction must be perpendicular to both main axis and secondary wrap axis.`
        )
      }

      // 2. Tertiary must be perpendicular to Secondary Axis
      const secondaryAxis = WRAP_DIRECTION_INFO[secondaryDirection].axis
      if (!isWrapDirectionPerpendicularToAxis(tertiaryDirection, secondaryAxis)) {
        throw new Error(
          `Tertiary wrap direction "${tertiaryDirection}" is parallel to secondary wrap direction "${secondaryDirection}". ` +
            `Tertiary wrap direction must be perpendicular to both main axis and secondary wrap axis.`
        )
      }
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// DIRECTIONAL LAYOUT CONFIGURATION VALIDATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Validates stretch configuration for the primary axis in DirectionalLayout.
 * Throws an error if Stretch alignment is enabled without Fixed Size.
 *
 * @param alignment - The alignment value for the primary axis.
 * @param fixedSize - Whether the primary axis has a fixed size.
 * @throws Error if Stretch alignment is enabled without Fixed Size.
 */
export function validateAxisStretchConfiguration(alignment: string, fixedSize: boolean): void {
  // Check if alignment is Stretch ("*")
  if (alignment !== "*") {
    return
  }

  // Error if Stretch is enabled but fixed size is not set
  if (!fixedSize) {
    throw new Error(
      `Stretch alignment requires Fixed Size to be enabled. ` + `Enable Fixed Size or choose a different alignment.`
    )
  }
}

/**
 * Validates normalized child size configuration in DirectionalLayout.
 * normalizedChildSize requires the primary layout axis size to be fixed.
 * When normalized, child sizes must be <= 1 for the primary axis.
 *
 * @param normalizedChildSize - Whether normalized child sizing is enabled.
 * @param primarySizeFixed - Whether the primary layout axis has a fixed size.
 * @param primaryAxis - The primary layout axis ("x", "y", or "z").
 * @param childWidth - The child width value.
 * @param childHeight - The child height value.
 * @param childDepth - The child depth value.
 * @throws Error if configuration is invalid.
 */
export function validateNormalizedChildSizes(
  normalizedChildSize: boolean,
  primarySizeFixed: boolean,
  primaryAxis: string,
  childWidth: number,
  childHeight: number,
  childDepth: number
): void {
  if (!normalizedChildSize) {
    return
  }

  // Primary axis size must be fixed for normalizedChildSize
  if (!primarySizeFixed) {
    throw new Error(
      "Normalized child size requires the primary layout axis size to be fixed. Enable fixed size for the selected direction."
    )
  }

  // Child size on primary axis must be <= 1 when normalized
  let relevantChildSize = 0
  let sizeName = ""

  if (primaryAxis === "x") {
    relevantChildSize = childWidth
    sizeName = "childWidth"
  } else if (primaryAxis === "y") {
    relevantChildSize = childHeight
    sizeName = "childHeight"
  } else {
    relevantChildSize = childDepth
    sizeName = "childDepth"
  }

  if (relevantChildSize > 1) {
    throw new Error(
      `When normalizedChildSize is enabled, child size on the primary axis must be between 0 and 1. ` +
        `Invalid value for ${sizeName}: ${relevantChildSize}`
    )
  }
}

/**
 * Validates wrap settings in DirectionalLayout.
 * Checks that wrap configuration is valid for the primary direction.
 *
 * @param primaryDirection - The primary layout direction.
 * @param fixedSize - Whether the primary axis has a fixed size.
 * @param wrapToSecondaryAxis - Whether secondary wrapping is enabled.
 * @param wrapDirection - The secondary wrap direction.
 * @param secondaryFixedSize - Whether the secondary axis has a fixed size.
 * @param wrapToTertiaryAxis - Whether tertiary wrapping is enabled.
 * @param tertiaryDirection - The tertiary wrap direction (required if wrapToTertiaryAxis is true).
 * @throws Error if wrap configuration is invalid.
 */
export function validateDirectionalWrapSettings(
  primaryDirection: Axis,
  fixedSize: boolean,
  wrapToSecondaryAxis: boolean,
  wrapDirection: WrapDirection,
  secondaryFixedSize: boolean,
  wrapToTertiaryAxis: boolean = false,
  tertiaryDirection?: WrapDirection
): void {
  if (!wrapToSecondaryAxis) {
    return
  }

  // Wrap direction must be perpendicular to the item direction
  if (!isWrapDirectionPerpendicularToAxis(wrapDirection, primaryDirection)) {
    throw new Error(
      `Wrap direction "${wrapDirection}" is parallel to item axis "${primaryDirection}". ` +
        `Wrap direction must be perpendicular. Allowed directions for ${primaryDirection} axis: ${getAllowedWrapDirectionsForAxis(primaryDirection)}`
    )
  }

  // Item axis must have fixed size for wrap to determine wrap boundary
  if (!fixedSize) {
    throw new Error(
      `Wrap requires a fixed size on the item axis. ` + `Enable Fixed Size to use wrap on the ${primaryDirection} axis.`
    )
  }

  // Validate tertiary wrap settings
  if (wrapToTertiaryAxis && tertiaryDirection !== undefined) {
    const secondaryAxis = WRAP_DIRECTION_INFO[wrapDirection].axis
    const tertiaryAxis = WRAP_DIRECTION_INFO[tertiaryDirection].axis

    if (tertiaryAxis === primaryDirection || tertiaryAxis === secondaryAxis) {
      throw new Error("Tertiary wrap direction must be perpendicular to both primary and secondary directions")
    }

    if (!secondaryFixedSize) {
      throw new Error("Wrapping to tertiary axis requires secondary axis to have a fixed size")
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// GRID LAYOUT VALIDATION
// ═══════════════════════════════════════════════════════════════════════════

interface GridValidationConfig {
  maxColumns: number
  maxRows: number
  maxLayers: number
  cellWidth: number
  cellHeight: number
  cellDepth: number
  spacingX: number
  spacingY: number
  spacingZ: number
  paddingLeft: number
  paddingRight: number
  paddingTop: number
  paddingBottom: number
  paddingBack: number
  paddingFront: number
}

/**
 * Validates the complete configuration for a GridLayout.
 * @param config - The grid configuration object.
 * @throws Error if any value is invalid.
 */
export function validateGridConfiguration(config: GridValidationConfig): void {
  validatePositive(config.maxColumns, "Max columns")
  validatePositive(config.maxRows, "Max rows")
  validatePositive(config.maxLayers, "Max layers")
  validateInteger(config.maxColumns, "Max columns")
  validateInteger(config.maxRows, "Max rows")
  validateInteger(config.maxLayers, "Max layers")
  validatePositive(config.cellWidth, "Cell width")
  validatePositive(config.cellHeight, "Cell height")
  validatePositive(config.cellDepth, "Cell depth")
  validateNonNegative(config.spacingX, "Spacing X")
  validateNonNegative(config.spacingY, "Spacing Y")
  validateNonNegative(config.spacingZ, "Spacing Z")
  validateNonNegative(config.paddingLeft, "Padding left")
  validateNonNegative(config.paddingRight, "Padding right")
  validateNonNegative(config.paddingTop, "Padding top")
  validateNonNegative(config.paddingBottom, "Padding bottom")
  validateNonNegative(config.paddingBack, "Padding back")
  validateNonNegative(config.paddingFront, "Padding front")
}

/**
 * Validates that grid coordinates are finite integers.
 * Logs a warning if invalid.
 * @param col - Column index.
 * @param row - Row index.
 * @param layer - Layer index.
 * @param context - Context string for logging (e.g. "getItemAtCell").
 * @returns True if coordinates are valid.
 */
export function isValidGridCoordinate(col: number, row: number, layer: number, context: string): boolean {
  if (!Number.isFinite(col) || !Number.isFinite(row) || !Number.isFinite(layer)) {
    log.w(`${context} received non-finite indices: col=${col}, row=${row}, layer=${layer}`)
    return false
  }
  if (!Number.isInteger(col) || !Number.isInteger(row) || !Number.isInteger(layer)) {
    log.w(`${context} received non-integer indices: col=${col}, row=${row}, layer=${layer}`)
    return false
  }
  return true
}

/**
 * Checks if a specific cell coordinate is within the valid bounds of the grid.
 * If a dimension is fixed, the coordinate must be between 0 and max-1.
 * If a dimension is not fixed, any coordinate is considered valid (grid expands).
 */
export function isCellWithinGridBounds(
  col: number,
  row: number,
  layer: number,
  constraints: GridBoundsConstraints
): boolean {
  if (constraints.fixedColumns && (col < 0 || col >= constraints.maxColumns)) return false
  if (constraints.fixedRows && (row < 0 || row >= constraints.maxRows)) return false
  if (constraints.fixedLayers && (layer < 0 || layer >= constraints.maxLayers)) return false
  return true
}

/**
 * Validates that a placement (start and end cells) is within the grid bounds.
 */
export function isPlacementWithinGridBounds(placement: GridPlacement, constraints: GridBoundsConstraints): boolean {
  const startCol = Math.floor(placement.col)
  const startRow = Math.floor(placement.row)
  const startLayer = Math.floor(placement.layer)
  const endCol = startCol + placement.colSpan
  const endRow = startRow + placement.rowSpan
  const endLayer = startLayer + placement.layerSpan

  if (!isCellWithinGridBounds(startCol, startRow, startLayer, constraints)) {
    return false
  }

  // Check end bound (exclusive index, so check end-1)
  if (!isCellWithinGridBounds(endCol - 1, endRow - 1, endLayer - 1, constraints)) {
    return false
  }

  return true
}
