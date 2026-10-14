import {Frame} from "../Components/Frame/Frame"
import {SpatialLayout} from "../Components/Layout/SpatialLayout"
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

  private SpatialLayout: SpatialLayout

  public onAwake() {
    this.SpatialLayout = this.sceneObject.getComponent(SpatialLayout.getTypeName())
    this.createEvent("OnStartEvent").bind(() => {
      this.SpatialLayout.onInitialized.add(() => {
        print(`SpatialLayout initialized: ${this.SpatialLayout.gridSize}. Items: ${this.framedLayoutItems.length}`)
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
    if (this.SpatialLayout.getPlacement(layoutItem)) {
      print(`LayoutItem ${layoutItem.sceneObject.name} is already in the grid`)
      this.subscribeToTranslation(frame, layoutItem)
    } else {
      print(`Adding LayoutItem ${layoutItem.sceneObject.name} to the grid`)
      if (
        this.SpatialLayout.addLayoutItem(layoutItem, undefined, this._fallbackStrategy as AddLayoutItemFallbackStrategy)
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
      this.SpatialLayout.removeLayoutItem(layoutItem)
    })
    frame.onTranslationEnd.add(() => {
      this.SpatialLayout.addLayoutItem(layoutItem, undefined, this._fallbackStrategy as AddLayoutItemFallbackStrategy)
    })
  }
}
