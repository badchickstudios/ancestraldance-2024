import {Frame} from "../Components/Frame/Frame"
import {GridLayout} from "../Components/Layout/GridLayout"
import {AddLayoutItemFallbackStrategy} from "../Components/Layout/LayoutConfigurationTypes"
import {LayoutItem} from "../Components/Layout/LayoutItem"

@component
export class FramesManagementExample extends BaseScriptComponent {
  @input
  private framedLayoutItems: LayoutItem[] = []

  @input
  @widget(
    new ComboBoxWidget([new ComboBoxItem("Closest Available", "closestAvailable"), new ComboBoxItem("Push", "push")])
  )
  private _fallbackStrategy: string = AddLayoutItemFallbackStrategy.ClosestAvailable.toString()

  private GridLayout: GridLayout

  public onAwake() {
    this.GridLayout = this.sceneObject.getComponent(GridLayout.getTypeName())
    this.createEvent("OnStartEvent").bind(() => {
      this.GridLayout.onInitialized.add(() => {
        print(`GridLayout initialized: ${this.GridLayout.gridSize}. Items: ${this.framedLayoutItems.length}`)
        for (let i = 0; i < this.framedLayoutItems.length; i++) {
          print(`Adding Settings ${i}`)
          const layoutItem = this.framedLayoutItems[i]
          const itemObject = layoutItem.sceneObject
          const frame = itemObject.getComponent(Frame.getTypeName())
          print(`LayoutItem ${itemObject.name} initialized: ${layoutItem.initialized}`)
          if (layoutItem.initialized) {
            this.onItemInitialized(frame, layoutItem)
          } else {
            layoutItem.onInitialized.add(() => {
              this.onItemInitialized(frame, layoutItem)
            })
          }
        }
      })
    })
  }

  private onItemInitialized(frame: Frame, layoutItem: LayoutItem): void {
    print(`LayoutItem ${layoutItem.sceneObject.name} initialized`)
    if (this.GridLayout.getPlacement(layoutItem)) {
      print(`LayoutItem ${layoutItem.sceneObject.name} is already in the grid`)
      this.subscribeToTranslation(frame, layoutItem)
    } else {
      print(`Adding LayoutItem ${layoutItem.sceneObject.name} to the grid`)
      if (
        this.GridLayout.addLayoutItem(layoutItem, undefined, this._fallbackStrategy as AddLayoutItemFallbackStrategy)
      ) {
        print(
          `Added LayoutItem: ${layoutItem.sceneObject.name} with position ${layoutItem.position}, ${layoutItem.size}`
        )
        this.subscribeToTranslation(frame, layoutItem)
      } else {
        print(`Failed to add LayoutItem: ${layoutItem.sceneObject.name} at  ${layoutItem.position}, ${layoutItem.size}`)
      }
    }
  }

  private subscribeToTranslation(frame: Frame, layoutItem: LayoutItem): void {
    frame.onTranslationStart.add(() => {
      this.GridLayout.removeLayoutItem(layoutItem)
    })
    frame.onTranslationEnd.add(() => {
      this.GridLayout.addLayoutItem(layoutItem, undefined, this._fallbackStrategy as AddLayoutItemFallbackStrategy)
    })
  }
}
