import {DragInteractorEvent, InteractorEvent} from "SpectaclesInteractionKit.lspkg/Core/Interactor/InteractorEvent"
import Event, {PublicApi} from "SpectaclesInteractionKit.lspkg/Utils/Event"
import {
  DarkerLessGray,
  DarkestGray,
  DarkGray,
  DarkWarmGray,
  MediumDarkGray,
  MediumWarmGray,
  SwitchBorderYellowBright,
  SwitchBorderYellowBrighter,
  SwitchBorderYellowLight,
  SwitchBorderYellowMedium,
  SwitchHoverOrange,
  SwitchHoverYellow,
  SwitchKnobBorderGray,
  SwitchKnobBorderTransparent,
  SwitchKnobBorderTransparentHover,
  SwitchKnobBorderYellow,
  SwitchKnobBorderYellowBright,
  SwitchKnobBorderYellowHover,
  SwitchKnobBorderYellowMedium,
  SwitchKnobGray,
  SwitchTrackBorderGray,
  SwitchTrackBorderTransparent,
  SwitchTrackFillGray,
  SwitchTrackGray,
  SwitchTrackYellowDark,
  SwitchTrackYellowMedium,
  SwitchYellowBright,
  SwitchYellowBrightestHover,
  SwitchYellowBrightHover,
  SwitchYellowDark,
  TriggeredBorderYellow
} from "../../Themes/SnapOS-2.0/Colors"
import {Callback, createCallbacks} from "../../Utility/SceneUtilities"
import {RoundedRectangleVisualParameters} from "../../Visuals/RoundedRectangle/RoundedRectangleVisual"
import {Slider} from "../Slider/Slider"
import {Toggleable} from "../Toggle/Toggleable"

// Track visual style
const trackStyle: Partial<RoundedRectangleVisualParameters> = {
  default: {
    baseGradient: {
      type: "Linear",
      start: new vec2(-1, 0),
      end: new vec2(1, 0),
      stop0: {percent: 0, color: SwitchTrackGray},
      stop1: {percent: 0.5, color: SwitchTrackGray},
      stop2: {percent: 1, color: SwitchTrackGray}
    },
    baseType: "Gradient",
    hasBorder: true,
    borderSize: 0.1,
    borderType: "Gradient",
    borderGradient: {
      start: new vec2(-0.8, 1),
      end: new vec2(0.8, -1),
      stop0: {percent: 0, color: SwitchTrackBorderGray},
      stop1: {percent: 0.5, color: SwitchTrackBorderTransparent},
      stop2: {percent: 1, color: SwitchTrackBorderGray}
    }
  },
  hovered: {
    baseGradient: {
      start: new vec2(0, 1.8),
      end: new vec2(0, -1.8),
      stop0: {percent: 0, color: DarkGray},
      stop1: {percent: 0.5, color: DarkGray},
      stop2: {percent: 1, color: MediumDarkGray}
    }
  },
  triggered: {
    baseGradient: {
      start: new vec2(-1, 0),
      end: new vec2(1, 0),
      stop0: {percent: 0, color: SwitchTrackGray},
      stop1: {percent: 0.5, color: SwitchTrackGray},
      stop2: {percent: 1, color: SwitchTrackGray}
    }
  },
  toggledDefault: {
    borderGradient: {
      type: "Linear",
      start: new vec2(-0.9, 1),
      end: new vec2(0.9, -1),
      stop0: {percent: 0, color: SwitchBorderYellowLight},
      stop1: {percent: 0.55, color: SwitchBorderYellowMedium},
      stop2: {percent: 1, color: SwitchBorderYellowLight}
    }
  },
  toggledHovered: {
    borderGradient: {
      type: "Linear",
      start: new vec2(-0.9, 1),
      end: new vec2(0.9, -1),
      stop0: {percent: 0, color: SwitchBorderYellowBright},
      stop1: {percent: 0.55, color: SwitchBorderYellowBrighter},
      stop2: {percent: 1, color: SwitchBorderYellowBright}
    }
  },
  toggledTriggered: {
    borderGradient: {
      type: "Linear",
      start: new vec2(-0.9, 1),
      end: new vec2(0.9, -1),
      stop0: {percent: 0, color: SwitchBorderYellowLight},
      stop1: {percent: 0.55, color: SwitchBorderYellowMedium},
      stop2: {percent: 1, color: SwitchBorderYellowLight}
    }
  }
}

// Track Fill visual style
const trackFillStyle: Partial<RoundedRectangleVisualParameters> = {
  default: {
    baseGradient: {
      type: "Linear",
      start: new vec2(-1, 0),
      end: new vec2(1, 0),
      stop0: {percent: 0, color: SwitchTrackFillGray},
      stop1: {percent: 1, color: SwitchTrackFillGray}
    },
    baseType: "Gradient"
  },
  hovered: {
    baseGradient: {
      type: "Linear",
      start: new vec2(-1, 0),
      end: new vec2(1, 0),
      stop0: {percent: 0, color: SwitchHoverOrange},
      stop1: {percent: 1, color: SwitchHoverYellow}
    }
  },
  toggledDefault: {
    baseGradient: {
      type: "Linear",
      start: new vec2(-1, 0),
      end: new vec2(1, 0),
      stop0: {percent: 0, color: SwitchTrackYellowDark},
      stop1: {percent: 1, color: SwitchTrackYellowDark}
    }
  },
  toggledHovered: {
    baseGradient: {
      type: "Linear",
      start: new vec2(-1, 0),
      end: new vec2(1, 0),
      stop0: {percent: 0, color: SwitchTrackYellowMedium},
      stop1: {percent: 1, color: SwitchTrackYellowMedium}
    }
  },
  toggledTriggered: {
    baseGradient: {
      type: "Linear",
      start: new vec2(-1, 0),
      end: new vec2(1, 0),
      stop0: {percent: 0, color: SwitchTrackYellowDark},
      stop1: {percent: 1, color: SwitchTrackYellowDark}
    }
  }
}

// Knob visual style
const knobStyle: Partial<RoundedRectangleVisualParameters> = {
  default: {
    baseGradient: {
      enabled: true,
      type: "Linear",
      start: new vec2(-1, 1),
      end: new vec2(1, -1),
      stop0: {percent: 0, color: DarkestGray},
      stop1: {percent: 1, color: DarkWarmGray}
    },
    baseType: "Gradient",
    hasBorder: true,
    borderSize: 0.05,
    borderType: "Gradient",
    borderGradient: {
      start: new vec2(-0.8, 1),
      end: new vec2(0.8, -1),
      stop0: {percent: 0, color: SwitchKnobBorderGray},
      stop1: {percent: 1, color: SwitchKnobBorderTransparent}
    }
  },
  hovered: {
    baseGradient: {
      enabled: true,
      type: "Linear",
      start: new vec2(-1, 1),
      end: new vec2(1, -1),
      stop0: {percent: 0, color: DarkerLessGray},
      stop1: {percent: 1, color: SwitchKnobGray}
    },
    borderGradient: {
      start: new vec2(-0.8, 1),
      end: new vec2(0.8, -1),
      stop0: {percent: 0, color: MediumWarmGray},
      stop1: {percent: 1, color: SwitchKnobBorderTransparentHover}
    }
  },
  triggered: {
    baseGradient: {
      enabled: true,
      type: "Linear",
      stop0: {percent: 0, color: SwitchYellowDark},
      stop1: {percent: 1, color: SwitchYellowBright}
    }
  },
  toggledDefault: {
    baseGradient: {
      enabled: true,
      type: "Linear",
      stop0: {percent: 0, color: SwitchYellowDark},
      stop1: {percent: 1, color: SwitchYellowBright}
    },
    borderGradient: {
      type: "Linear",
      start: new vec2(-0.8, 1),
      end: new vec2(0.8, -1),
      stop0: {percent: 0, color: SwitchKnobBorderYellow},
      stop1: {percent: 0.55, color: SwitchKnobBorderYellowMedium},
      stop2: {percent: 1, color: SwitchKnobBorderYellowBright}
    }
  },
  toggledHovered: {
    baseGradient: {
      enabled: true,
      type: "Linear",
      stop0: {percent: 0, color: SwitchYellowBrightHover},
      stop1: {percent: 1, color: SwitchYellowBrightestHover}
    },
    borderGradient: {
      type: "Linear",
      start: new vec2(-0.8, 1),
      end: new vec2(0.8, -1),
      stop0: {percent: 0, color: TriggeredBorderYellow},
      stop1: {percent: 0.55, color: SwitchKnobBorderYellowHover},
      stop2: {percent: 1, color: TriggeredBorderYellow}
    }
  },
  toggledTriggered: {
    baseGradient: {
      enabled: true,
      type: "Linear",
      stop0: {percent: 0, color: SwitchYellowDark},
      stop1: {percent: 1, color: SwitchYellowBright}
    },
    borderGradient: {
      type: "Linear",
      start: new vec2(-0.8, 1),
      end: new vec2(0.8, -1),
      stop0: {percent: 0, color: SwitchKnobBorderYellow},
      stop1: {percent: 0.55, color: SwitchKnobBorderYellowMedium},
      stop2: {percent: 1, color: SwitchKnobBorderYellowBright}
    }
  }
}

/**
 * Represents a Switch component that extends the Slider functionality.
 *
 * @extends Slider
 * @implements Toggleable
 */
@component
export class Switch extends Slider implements Toggleable {
  @input
  @showIf("addCallbacks")
  @label("On Interaction Finished Callbacks")
  private onFinishedCallbacks: Callback[] = []

  @input("int")
  @hint("The default state of the switch")
  @widget(new ComboBoxWidget([new ComboBoxItem("Off", 0), new ComboBoxItem("On", 1)]))
  protected _defaultValue: number = 0

  // Hidden inputs
  protected _segmented: boolean = true
  protected snapToTriggerPosition: boolean = true
  protected _numberOfSegments: number = 2
  protected get isToggle(): boolean {
    return true
  }

  /**
   * An internal event invoked when the switch interaction is finished.
   *
   * @remarks
   * The `explicit` parameter indicates the source of the change:
   * - `true` — triggered by direct user interaction or developer action.
   * - `false` — triggered programmatically by a ToggleGroup.
   */
  private onFinishedEvent: Event<boolean> = new Event()
  public readonly onFinished: PublicApi<boolean> = this.onFinishedEvent.publicApi()

  /**
   * Gets the current state of the switch.
   *
   * @returns {boolean} - Returns `true` if the switch's current state is not set to 0, otherwise `false`.
   */
  public get isOn(): boolean {
    return this._currentValue !== 0
  }

  /**
   * Sets the state of the switch to either "on" or "off".
   *
   * @param on - A boolean value indicating whether the switch should be turned on (`true`) or off (`false`).
   */
  public set isOn(on: boolean) {
    if (on === undefined) {
      return
    }
    this.setOn(on, false)
  }

  /**
   * Toggles the switch to the on/off state.
   *
   * This method sets the current state of the switch to 1 or 0 and updates the knob position accordingly.
   * @param on - A boolean value indicating the desired toggle state.
   */
  public toggle(on: boolean): void {
    this.setOn(on, true)
  }

  /**
   * Initializes the switch component.
   *
   * This method sets the default state
   */
  public initialize() {
    super.initialize()
    this._interactableStateMachine.toggle = this.currentValue > 0
  }

  protected setUpEventCallbacks(): void {
    if (this.addCallbacks) {
      this.onFinished.add(createCallbacks(this.onFinishedCallbacks))
    }
    super.setUpEventCallbacks()
  }

  protected onTriggerUpHandler(event: InteractorEvent) {
    super.onTriggerUpHandler(event)
    if (!this._isDragged) {
      this.onFinishedEvent.invoke(true)
    }
  }

  protected onInteractableDragEnd(dragEvent: DragInteractorEvent): void {
    super.onInteractableDragEnd(dragEvent)
    this.onFinishedEvent.invoke(true)
  }

  protected onInteractableDragUpdate(dragEvent: DragInteractorEvent): void {
    super.onInteractableDragUpdate(dragEvent)
    const knobDraggedOn = this.knobValue > 0
    if (this._interactableStateMachine.toggle !== knobDraggedOn) this._interactableStateMachine.toggle = knobDraggedOn
  }

  protected onTriggerRespond(): void {
    if (!this._isDragged) {
      if (this._segmented && this.snapToTriggerPosition) {
        const newValue = this.currentValue === 0 ? 1 : 0
        this.updateCurrentValue(newValue, true)
      }
    }
  }

  private setOn(on: boolean, explicit: boolean) {
    if ((on && this._currentValue === 1) || (!on && this._currentValue === 0)) {
      return
    }
    this.updateCurrentValue(on ? 1 : 0, true)
    if (this._initialized) {
      this.onFinishedEvent.invoke(explicit)
    }
  }

  public updateCurrentValue(value: number, shouldAnimate: boolean = false): void {
    if (this._initialized) {
      this._interactableStateMachine.toggle = value > 0
    }
    super.updateCurrentValue(value, shouldAnimate)
  }

  protected get defaultTrackStyle(): Partial<RoundedRectangleVisualParameters> {
    const themed = this.resolveTheme()?.styles["SwitchTrack"]?.["default"]
    return themed ?? trackStyle
  }

  protected get defaultKnobStyle(): Partial<RoundedRectangleVisualParameters> {
    const themed = this.resolveTheme()?.styles["SwitchKnob"]?.["default"]
    return themed ?? knobStyle
  }

  protected get defaultTrackFillStyle(): Partial<RoundedRectangleVisualParameters> {
    const themed = this.resolveTheme()?.styles["SwitchFill"]?.["default"]
    return themed ?? trackFillStyle
  }

  protected get knobObjectName(): string {
    return "SwitchKnob"
  }

  protected get trackFillObjectName(): string {
    return "SwitchTrackFill"
  }
}
