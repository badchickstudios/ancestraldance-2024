import {PinchButton} from "SpectaclesInteractionKit.lspkg/Components/UI/PinchButton/PinchButton"
import WorldCameraFinderProvider from "SpectaclesInteractionKit.lspkg/Providers/CameraProvider/WorldCameraFinderProvider"
import {SessionController} from "../Core/SessionController"
import {SyncKitLogger} from "./SyncKitLogger"

const TAG = "StartMenu"

@component
export class StartMenu extends BaseScriptComponent {
    @input
    private readonly singlePlayerButton: PinchButton

    @input
    private readonly multiPlayerButton: PinchButton

    @input("float", "150.0")
    private readonly startMenuDistanceFromUser: number

    @input("string", "manual")
    @widget(
        new ComboBoxWidget([
            new ComboBoxItem("Manual", "manual"),
            new ComboBoxItem("Mocked Online (Automatic)", "mocked_online")
        ])
    )
    private readonly singlePlayerType: "manual" | "mocked_online" = "manual"

    @input
    private readonly enableOnSingleplayerNodes: SceneObject[]

    private worldCamera: WorldCameraFinderProvider
    private startMenuTransform: Transform
    private readonly log = new SyncKitLogger(TAG)
    private hasStartedSession = false // Add this flag

    constructor() {
        super()
        this.worldCamera = WorldCameraFinderProvider.getInstance()
        this.startMenuTransform = this.sceneObject.getTransform()

        this.createEvent("OnStartEvent").bind(() => this.onStart())
    }

    private onStart() {
        // Register this menu so GameManager can hide it
        ;(global as any).startMenuObject = this.getSceneObject()
        
        // Re-enable the start menu if the connection fails
        SessionController.getInstance().onConnectionFailed.add(() => {
            this.getSceneObject().enabled = true
            this.setStartMenuInFrontOfUser()
            this.hasStartedSession = false // Reset flag on connection failure
        })

        // Skip the start menu if the lens was launched directly as multiplayer
        this.checkIfStartedAsMultiplayer()

        this.setStartMenuInFrontOfUser()
        this.singlePlayerButton.onButtonPinched.add(() => this.onSinglePlayerPress())
        this.multiPlayerButton.onButtonPinched.add(() => this.startMultiplayerSession())
    }

    /**
     * If the systemUI has requested that the lens launch directly into multiplayer mode,
     * immediately dismiss this menu and initialize the Spectacles Sync Kit.
     */
    private checkIfStartedAsMultiplayer() {
        const shouldStartMultiplayer = global.launchParams.getBool("StartMultiplayer")
        this.log.i(`Lens started as multiplayer: ${shouldStartMultiplayer}`)
        
        if (shouldStartMultiplayer && !this.hasStartedSession) {
            this.log.i("Auto-starting multiplayer session")
            this.startMultiplayerSession()
        } else if (!shouldStartMultiplayer) {
            this.log.i("Single player mode detected - waiting for user input")
            // Don't auto-start anything in single player mode
        }
    }

    /**
     * Start the game in single player mode by hiding this menu.
     */
    private onSinglePlayerPress() {
        if (this.hasStartedSession) {
            this.log.i("Session already started, ignoring single player press")
            return
        }
        
        this.log.i("Single player button pressed")
        this.hasStartedSession = true
        
        switch (this.singlePlayerType) {
            case "mocked_online":
                this.log.i("Starting mocked online single player")
                SessionController.getInstance().prepareOfflineMode()

                this.enableOnSingleplayerNodes.forEach((node) => {
                    node.enabled = true
                })

                // For mocked online, we still want single player behavior
                // Try to call Game Manager function first
                if ((global as any).startSinglePlayer) {
                    this.log.i("Calling global.startSinglePlayer() for mocked online")
                    ;(global as any).startSinglePlayer()
                } else {
                    // Fallback to multiplayer session if GameManager not ready
                    this.log.i("GameManager not ready - falling back to multiplayer session")
                    this.startMultiplayerSession()
                }
                break

            case "manual":
            default:
                this.log.i("Starting manual single player")
                this.enableOnSingleplayerNodes.forEach((node) => {
                    node.enabled = true
                })

                // DON'T hide the menu here - let GameManager handle it
                // this.getSceneObject().enabled = false

                // Try to call Game Manager function, fallback to original behavior
                if ((global as any).startSinglePlayer) {
                    this.log.i("Calling global.startSinglePlayer()")
                    ;(global as any).startSinglePlayer()
                } else {
                    // Store the choice for when Game Manager loads
                    this.log.i("Game Manager not available - storing choice for later")
                    ;(global as any).userChoice = "singlePlayer"
                }
                break
        }
    }

    /**
     * Start the session by initializing the Spectacles Sync Kit, and hiding this menu.
     */
    private startMultiplayerSession() {
        if (this.hasStartedSession) {
            this.log.i("Session already started, ignoring multiplayer start")
            return
        }
        
        this.log.i("Starting multiplayer session")
        this.hasStartedSession = true
        
        // Hide the menu first
        this.getSceneObject().enabled = false
        
        // Initialize the session controller
        SessionController.getInstance().init()
        
        // Try to call Game Manager function, fallback to original behavior
        if ((global as any).startMultiplayer) {
            this.log.i("Calling global.startMultiplayer()")
            ;(global as any).startMultiplayer()
        } else {
            // Store the choice for when Game Manager loads
            this.log.i("Game Manager not available - storing choice for later")
            ;(global as any).userChoice = "multiplayer"
        }
    }

    private setStartMenuInFrontOfUser() {
        const head = this.worldCamera.getTransform().getWorldPosition()
        const forward = this.worldCamera.getTransform().forward
        forward.y = 0
        const pos = forward.normalize().uniformScale(-this.startMenuDistanceFromUser)
        this.startMenuTransform.setWorldPosition(head.add(pos))

        this.startMenuTransform.setWorldRotation(quat.lookAt(pos.uniformScale(-1), vec3.up()))
    }
}