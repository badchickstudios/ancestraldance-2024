import {Singleton} from "SpectaclesInteractionKit.lspkg/Decorators/Singleton"
import {Theme} from "./Theme"
import {SnapOS2} from "./SnapOS-2.0/SnapOS2"
import {SnapOS3} from "./SnapOS-3.0/SnapOS3"

/**
 * Global registry and source of truth for active UI theme resolution.
 * ThemeManager can set the startup value, but all consumers read from here.
 */
@Singleton
export class ThemeService {
  public static getInstance: () => ThemeService

  private _currentTheme: Theme = SnapOS2
  private _themes: Map<string, Theme> = new Map()

  public constructor() {
    this.registerTheme(SnapOS2)
    this.registerTheme(SnapOS3)
  }

  public get currentTheme(): Theme {
    return this._currentTheme
  }

  /**
   * Sets the active theme used by runtime style lookups.
   * Note: This only affects visuals created after the theme is set.
   * Existing visuals are not dynamically updated. It is recommended
   * to only set the theme at startup.
   */
  public setTheme(theme: Theme): void {
    this._currentTheme = theme
  }

  public registerTheme(theme: Theme): void {
    this._themes.set(theme.name, theme)
  }

  public getTheme(name: string): Theme | undefined {
    return this._themes.get(name)
  }
}
