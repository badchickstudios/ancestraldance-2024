import {BaseButton} from "SpectaclesUIKit.lspkg/Scripts/Components/Button/BaseButton"

/**
 * Connects the SyncKit start menu to GameManager.
 *
 * SyncKit's own StartMenu starts the session (solo = mocked online, multiplayer = connected).
 * This script then tells GameManager which mode was picked, the job the hand-edited
 * SyncKit 1.2 StartMenu.ts used to do before the kit became a read-only package.
 */
@component
export class StartMenuBridge extends BaseScriptComponent {
  @input
  @hint("The SyncKit StartMenu object (has the StartMenu script)")
  startMenu: SceneObject

  @input
  @hint("Start menu Solo button (shown as Individual)")
  soloButton: BaseButton

  @input
  @hint("Start menu Multiplayer button (shown as Collective)")
  multiplayerButton: BaseButton

  private hasChosen = false

  onAwake() {
    // GameManager hides the menu through this global once a mode starts
    ;(global as any).startMenuObject = this.startMenu
    this.createEvent("OnStartEvent").bind(() => this.onStart())
  }

  private onStart() {
    this.soloButton.onTriggerUp.add(() => this.onSoloPressed())
    this.multiplayerButton.onTriggerUp.add(() => this.onMultiplayerPressed())
  }

  private onSoloPressed() {
    if (this.hasChosen) return
    this.hasChosen = true
    const g = global as any
    if (g.startSinglePlayer) {
      g.startSinglePlayer()
    } else {
      // GameManager picks this up once its SyncEntity is ready
      g.userChoice = "singlePlayer"
    }
  }

  private onMultiplayerPressed() {
    // SyncKit's StartMenu shows its own alert and stays open when offline
    if (!global.deviceInfoSystem.isInternetAvailable()) return
    if (this.hasChosen) return
    this.hasChosen = true
    const g = global as any
    if (g.startMultiplayer) {
      g.startMultiplayer()
    } else {
      g.userChoice = "multiplayer"
    }
  }
}
