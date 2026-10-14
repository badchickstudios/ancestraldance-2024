import {RoundedRectangleVisual} from "../../Visuals/RoundedRectangle/RoundedRectangleVisual"
import {BaseRoundedRectButton} from "./BaseRoundedRectButton"

@component
export class RectangleButton extends BaseRoundedRectButton {
  protected configureDefaultRoundedRectVisual(visual: RoundedRectangleVisual): void {
    visual.cornerRadius = 0.5
  }
}
