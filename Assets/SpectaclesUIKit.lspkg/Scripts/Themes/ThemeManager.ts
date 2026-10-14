import {SnapOS2} from "./SnapOS-2.0/SnapOS2"
import {SnapOS3} from "./SnapOS-3.0/SnapOS3"
import {ThemeService} from "./ThemeService"

/**
 * Scene-level bootstrap component for selecting the initial global UI theme.
 * If this component is absent, ThemeService falls back to SnapOS2.
 */
@component
export class ThemeManager extends BaseScriptComponent {
  @input
  @widget(new ComboBoxWidget([new ComboBoxItem("SnapOS2", "SnapOS2"), new ComboBoxItem("SnapOS3", "SnapOS3")]))
  private _theme: string = "SnapOS2"

  public onAwake() {
    // ThemeService remains the runtime source of truth after this initial set.
    const mgr = ThemeService.getInstance()
    switch (this._theme) {
      case "SnapOS3":
        mgr.setTheme(SnapOS3)
        break
      default:
        mgr.setTheme(SnapOS2)
        break
    }
  }
}
