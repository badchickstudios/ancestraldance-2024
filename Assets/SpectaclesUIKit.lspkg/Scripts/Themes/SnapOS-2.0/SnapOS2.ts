import {Style} from "../Style"
import {Theme} from "../Theme"
import {ButtonParameters} from "./Styles/ButtonParameters"
import {CapsuleButtonParameters} from "./Styles/CapsuleButtonParameters"
import {CheckboxParameters} from "./Styles/CheckboxParameters"
import {ConfirmationSliderComponentData, ConfirmationSliderParameters} from "./Styles/ConfirmationSliderParameters"
import {FrameParameters} from "./Styles/FrameParameters"
import {RadioButtonParameters} from "./Styles/RadioButtonParameters"
import {RoundButtonParameters} from "./Styles/RoundButtonParameters"
import {ScrubBarComponentData, ScrubBarParameters} from "./Styles/ScrubBarParameters"
import {SliderComponentData, SliderParameters} from "./Styles/SliderParameters"
import {SwitchParameters} from "./Styles/SwitchParameters"
import {TextInputFieldParameters} from "./Styles/TextInputFieldParameters"

export enum SnapOS2Styles {
  "PrimaryNeutral" = "PrimaryNeutral",
  "Primary" = "Primary",
  "Secondary" = "Secondary",
  "Special" = "Special",
  "Ghost" = "Ghost",
  "Custom" = "Custom"
}

export const SnapOS2: Theme = {
  get name(): string {
    return "SnapOS2"
  },
  get defaultStyleName(): string {
    return "PrimaryNeutral"
  },
  get defaultShapeName(): string {
    return "Rectangle"
  },
  get styles(): Record<string, Record<string, Style>> {
    return {
      Button: ButtonParameters,
      RoundButton: RoundButtonParameters,
      RectangleButton: ButtonParameters,
      CapsuleButton: CapsuleButtonParameters,
      SliderTrack: SliderParameters.track,
      SliderKnob: SliderParameters.knob,
      SliderFill: SliderParameters.fill,
      SwitchTrack: SwitchParameters.track,
      SwitchKnob: SwitchParameters.knob,
      SwitchFill: SwitchParameters.fill,
      RadioButton: RadioButtonParameters.base,
      RadioButtonToggled: RadioButtonParameters.toggled,
      Checkbox: CheckboxParameters.base,
      CheckboxToggled: CheckboxParameters.toggled,
      CheckboxMark: CheckboxParameters.mark,
      TextInputField: TextInputFieldParameters.style,
      ScrubBarTrack: ScrubBarParameters.track,
      ScrubBarKnob: ScrubBarParameters.knob,
      ScrubBarFill: ScrubBarParameters.fill,
      ConfirmationSliderTrack: ConfirmationSliderParameters.track,
      ConfirmationSliderKnob: ConfirmationSliderParameters.knob
    }
  },
  get componentData(): Record<string, unknown> {
    return {
      Frame: FrameParameters,
      Slider: SliderComponentData,
      SliderKnob: SliderComponentData.knob,
      ScrubBar: ScrubBarComponentData,
      ScrubBarKnob: ScrubBarComponentData.knob,
      ConfirmationSlider: ConfirmationSliderComponentData,
      ConfirmationSliderKnob: ConfirmationSliderComponentData.knob
    }
  }
}
