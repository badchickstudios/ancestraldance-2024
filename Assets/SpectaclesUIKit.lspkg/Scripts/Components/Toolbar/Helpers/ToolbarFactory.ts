import {ToolbarButton} from "../Items/ToolbarButton"
import {ToolbarCustomItem} from "../Items/ToolbarCustomItem"
import {ToolbarItem} from "../Items/ToolbarItem"
import {ToolbarSeparator} from "../Items/ToolbarSeparator"
import {ToolbarSlider} from "../Items/ToolbarSlider"
import {ToolbarTextField} from "../Items/ToolbarTextField"
import {ToolbarToggle} from "../Items/ToolbarToggle"
import {AnyToolbarItemConfig, ToolbarItemType, validateItemConfig} from "../Types/ToolbarSchema"

type ToolbarFactoryInput = {
  root: SceneObject
}

export class ToolbarFactory {
  private readonly root: SceneObject
  private createdItems: Map<string, ToolbarItem> = new Map()

  public constructor(input: ToolbarFactoryInput) {
    this.root = input.root
  }

  public createItem(config: AnyToolbarItemConfig): ToolbarItem {
    validateItemConfig(config)
    const id = config.id!

    if (this.createdItems.has(id)) {
      throw new Error(`Toolbar item with id '${id}' already exists`)
    }

    const itemObject = global.scene.createSceneObject(`ToolbarItem_${id}`)
    itemObject.setParent(this.root)
    let item: ToolbarItem

    switch (config.type) {
      case ToolbarItemType.BUTTON:
        item = itemObject.createComponent(ToolbarButton.getTypeName()) as ToolbarButton
        break
      case ToolbarItemType.SEPARATOR:
        item = itemObject.createComponent(ToolbarSeparator.getTypeName()) as ToolbarSeparator
        break
      case ToolbarItemType.TEXTFIELD:
        item = itemObject.createComponent(ToolbarTextField.getTypeName()) as ToolbarTextField
        break
      case ToolbarItemType.SLIDER:
        item = itemObject.createComponent(ToolbarSlider.getTypeName()) as ToolbarSlider
        break
      case ToolbarItemType.TOGGLE:
        item = itemObject.createComponent(ToolbarToggle.getTypeName()) as ToolbarToggle
        break
      case ToolbarItemType.CUSTOM:
        item = itemObject.createComponent(ToolbarCustomItem.getTypeName()) as ToolbarCustomItem
        break
      default:
        throw new Error(`Unknown toolbar item type: ${(config as any).type}`)
    }

    item.initializeWithConfig(config)
    this.createdItems.set(id, item)
    if (config.onCreated) {
      config.onCreated(item)
    }

    return item
  }

  public getItem(id: string): ToolbarItem | undefined {
    return this.createdItems.get(id)
  }

  public hasItem(id: string): boolean {
    return this.createdItems.has(id)
  }

  public destroyItem(id: string): boolean {
    const item = this.createdItems.get(id)
    if (!item) {
      return false
    }

    item.sceneObject.destroy()
    this.createdItems.delete(id)
    return true
  }

  public reset(): void {
    this.createdItems.forEach((item) => {
      item.sceneObject.destroy()
    })
    this.createdItems.clear()
  }

  public getAllItems(): ToolbarItem[] {
    return Array.from(this.createdItems.values())
  }

  public getItemsMap(): ReadonlyMap<string, ToolbarItem> {
    return this.createdItems
  }
}
