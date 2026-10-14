import WorldCameraFinderProvider from "SpectaclesInteractionKit.lspkg/Providers/CameraProvider/WorldCameraFinderProvider"
import {setTimeout} from "SpectaclesInteractionKit.lspkg/Utils/FunctionTimingUtils"
import {SpatialLayout} from "../Scripts/Components/Layout/SpatialLayout"
import {AddLayoutItemFallbackStrategy} from "../Scripts/Components/Layout/LayoutConfigurationTypes"
import {LayoutItem} from "../Scripts/Components/Layout/LayoutItem"

@component
export class SimpleSpatialLayoutTest extends BaseScriptComponent {
  @input
  private SpatialLayout: SpatialLayout

  @input
  @allowUndefined
  private layoutItemPrefab: ObjectPrefab | undefined = undefined

  @input
  @widget(
    new ComboBoxWidget([new ComboBoxItem("Closest Available", "closestAvailable"), new ComboBoxItem("Push", "push")])
  )
  private _fallbackStrategy: string = AddLayoutItemFallbackStrategy.ClosestAvailable.toString()

  private cam: Camera = WorldCameraFinderProvider.getInstance().getComponent()

  public onAwake() {
    this.createEvent("OnStartEvent").bind(() => {
      this.test1()
    })
  }

  private test1(): void {
    let i = 0
    this.createEvent("TapEvent").bind((arg) => {
      const layoutItem = this.layoutItemPrefab
        .instantiate(this.sceneObject)
        .getComponent(LayoutItem.getTypeName()) as LayoutItem
      if (layoutItem === null) {
        throw new Error(`Prefab does not contain a LayoutItem component`)
      }
      layoutItem.sceneObject.name = `LayoutItem ${i++}`
      layoutItem.size = new vec3(
        layoutItem.width - this.SpatialLayout.spacingX * 2,
        layoutItem.height - this.SpatialLayout.spacingY * 2,
        layoutItem.depth - this.SpatialLayout.spacingZ * 2
      )
      const gridDistance = this.SpatialLayout.getTransform()
        .getWorldPosition()
        .distance(this.cam.getTransform().getWorldPosition())
      const tapPosition = arg.getTapPosition()
      const tapWorldPosition = this.cam.screenSpaceToWorldSpace(new vec2(tapPosition.x, tapPosition.y), gridDistance)
      layoutItem.position = tapWorldPosition
      layoutItem.sceneObject.enabled = true
      layoutItem.onInitialized.add(() => {
        print(
          `LayoutItem onInitialized: size: ${layoutItem.size} from tap position: ${tapWorldPosition}, item position: ${layoutItem.position}`
        )
        setTimeout(() => {
          if (
            !this.SpatialLayout.addLayoutItem(
              layoutItem,
              undefined,
              this._fallbackStrategy as AddLayoutItemFallbackStrategy
            )
          ) {
            print("Failed to add LayoutItem")
          } else {
            print(`Added LayoutItem: ${layoutItem.sceneObject.name} with position ${layoutItem.position}`)
          }
        }, 1000)
      })
    })
  }
}
