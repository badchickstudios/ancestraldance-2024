import { PlacementMode, PlacementSettings } from "SurfacePlacement.lspkg/Scripts/PlacementSettings";
import { SurfacePlacementController } from "SurfacePlacement.lspkg/Scripts/SurfacePlacementController";

// Declare global types for Lens Studio APIs
declare global {
    var startAssetPlacement: () => void;
    var onPlacementRequested: () => void;
    var onObjectPlacementReceived: (data: any) => void;
    var getCurrentPlacementState: () => any;
    var sendObjectPlaced: (pos: vec3, rot: quat, visible: boolean) => void;
    var requestPlacementSync: () => void;
    var sessionController: any;
}

@component
export class SurfacePlacementSync extends BaseScriptComponent {
    @input
    @allowUndefined
    objectVisuals: SceneObject;

    @input("int")
    @widget(
        new ComboBoxWidget([
            new ComboBoxItem("Near Surface", 0),
            new ComboBoxItem("Horizontal", 1),
            new ComboBoxItem("Vertical", 2),
        ])
    )
    placementSettingMode: number = 0;

    @input
    autoStart: boolean = true;

    private transform: Transform = null;
    private isObjectPlaced: boolean = false;
    private currentPosition: vec3 = null;
    private currentRotation: quat = null;

    private surfacePlacement: SurfacePlacementController =
        SurfacePlacementController.getInstance();

    onAwake() {
        this.transform = this.getSceneObject().getTransform();
        this.createEvent("OnStartEvent").bind(this.onStart.bind(this));
        
        // Ensure object starts hidden
        if (this.objectVisuals) {
            this.objectVisuals.enabled = false;
        }
        
        // Register callbacks for multiplayer sync
        (global as any).onPlacementRequested = this.startPlacement.bind(this);
        (global as any).onObjectPlacementReceived = this.onReceivePlacement.bind(this);
        (global as any).getCurrentPlacementState = this.getCurrentPlacementState.bind(this);
    }

    private onStart() {
        if (this.objectVisuals) {
            this.objectVisuals.enabled = false;
        }

        if (this.autoStart) {
            // GameManager decides who places: Individual places locally; in Collective
            // only the host gets the tracker and joiners request the host's placement.
            (global as any).startAssetPlacement?.();
        }
    }

    startPlacement() {
        if (this.objectVisuals) {
            this.objectVisuals.enabled = false;
        }

        let placementSettings: PlacementSettings;
        switch (this.placementSettingMode) {
            case 0: // Near Surface
                placementSettings = new PlacementSettings(
                    PlacementMode.NEAR_SURFACE,
                    true, // use surface adjustment widget
                    new vec3(10, 10, 0), // offset in cm of widget from surface center
                    this.onSliderUpdated.bind(this) // callback from widget height changes
                );
                break;
            case 1: // Horizontal
                placementSettings = new PlacementSettings(PlacementMode.HORIZONTAL);
                break;
            case 2: // Vertical
                placementSettings = new PlacementSettings(PlacementMode.VERTICAL);
                break;
            default:
                placementSettings = new PlacementSettings(PlacementMode.NEAR_SURFACE);
        }

        this.surfacePlacement.startSurfacePlacement(
            placementSettings,
            (pos: vec3, rot: quat) => {
                this.onSurfaceDetected(pos, rot);
            }
        );
    }

    // Position/rotation are local to the parent, which sits under ColocatedWorld,
    // so they mean the same physical spot on every device.
    private getCurrentPlacementState() {
        return {
            isPlaced: this.isObjectPlaced,
            position: this.transform.getLocalPosition(),
            rotation: this.transform.getLocalRotation(),
            visible: this.objectVisuals ? this.objectVisuals.enabled : false
        };
    }

    private onReceivePlacement(data: any) {
        // Handle nested data structure from network events
        let placementData = data;
        if (data && data.data) {
            placementData = data.data;
        }
        if (!placementData) return;

        const p = placementData.position;
        const r = placementData.rotation;
        if (p && this.transform) {
            this.transform.setLocalPosition(new vec3(p.x, p.y, p.z));
        }
        if (r && this.transform) {
            this.transform.setLocalRotation(new quat(r.w, r.x, r.y, r.z));
        }
        if (placementData.visible !== undefined) {
            if (this.objectVisuals) {
                this.objectVisuals.enabled = placementData.visible;
            }
            this.isObjectPlaced = placementData.visible;
        }
    }

    private resetPlacement() {
        this.surfacePlacement.stopSurfacePlacement();
        this.startPlacement();
    }

    private onSliderUpdated(pos: vec3) {
        if (this.transform) {
            this.transform.setWorldPosition(pos);
        }
    }

    private onSurfaceDetected(pos: vec3, rot: quat) {
        // Only the host places in Collective (GameManager: Individual always counts as host)
        const isHostFn = (global as any).isHost;
        const isHost = isHostFn ? isHostFn() === true : true;
            
        print("=== SURFACE DETECTED ===");
        print("Is Host: " + isHost);
        print("Position: " + pos.x + ", " + pos.y + ", " + pos.z);
        print("Script Object: " + this.getSceneObject().name);
        print("Visual Object: " + (this.objectVisuals ? this.objectVisuals.name : "null"));
        print("========================");
            
        if (isHost) {
            // Apply placement locally - SyncTransform will automatically sync position/rotation
            if (this.transform) {
                this.transform.setWorldPosition(pos);
                this.transform.setWorldRotation(rot);
                print("Set position on: " + this.transform.getSceneObject().name);
            }

            if (this.objectVisuals) {
                this.objectVisuals.enabled = true;
                print("Enabled visuals on: " + this.objectVisuals.name);
            }

            // Update state
            this.currentPosition = pos;
            this.currentRotation = rot;
            this.isObjectPlaced = true;

            // Share the placement in the colocated frame so other players see it in the same spot
            (global as any).sendObjectPlaced?.(this.transform.getLocalPosition(), this.transform.getLocalRotation(), true);

            // Remove the placement circle: its collider stays in front of the content and
            // would catch every later pinch (Earth, Let's begin). Next frame, so it isn't
            // destroyed inside its own click handler.
            const stop = this.createEvent("DelayedCallbackEvent");
            stop.bind(() => this.surfacePlacement.stopSurfacePlacement());
            stop.reset(0);
        }
    }
}