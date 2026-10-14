import {ElementContent} from "./ElementContent"

/**
 * Convenience factory for programmatically adding content to a VisualElement's SceneObject.
 *
 * @param sceneObject - The SceneObject that has (or will have) a VisualElement component.
 * @param config - Content configuration options.
 * @returns The created ElementContent component.
 */
export function addContentToElement(
  sceneObject: SceneObject,
  config: {
    text?: string
    leadingIcon?: Texture
    trailingIcon?: Texture
    iconLayout?: string
    contentAlignment?: string
    textSize?: number
    spacing?: number
    autoResize?: boolean
    sizeOverride?: vec2
  }
): ElementContent {
  const content = sceneObject.createComponent(ElementContent.getTypeName()) as ElementContent

  if (config.text !== undefined) content.text = config.text
  if (config.leadingIcon !== undefined) content.leadingIcon = config.leadingIcon
  if (config.trailingIcon !== undefined) content.trailingIcon = config.trailingIcon
  if (config.iconLayout !== undefined) content.iconLayout = config.iconLayout
  if (config.contentAlignment !== undefined) content.contentAlignment = config.contentAlignment
  if (config.textSize !== undefined) content.textSize = config.textSize
  if (config.spacing !== undefined) content.spacing = config.spacing
  if (config.autoResize !== undefined) content.autoResize = config.autoResize
  if (config.sizeOverride !== undefined) content.sizeOverride = config.sizeOverride

  return content
}
