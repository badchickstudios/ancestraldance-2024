const SIK = require('SpectaclesInteractionKit.lspkg/SIK').SIK;
const handInputData = SIK.HandInputData;

// @input SceneObject palmMenu
// @input Component.HandTracking3DAsset leftHandAsset
//@input vec3 menuOffset
// @input float menuScale = 1.0


var leftHand;

function onAwake() {
    script.createEvent('OnStartEvent').bind(() => {
        onStart();
    });
    script.createEvent('UpdateEvent').bind(() => {
        update();
    });
}




function onStart() {
    // Fetch the TrackedHand for left hand
    leftHand = handInputData.getHand('left');
    
    // Cache the desired scale from the editor
    if (script.palmMenu) {
        script.palmMenu.enabled = false;
    }
}


function update(eventData) {
    if (!leftHand) return;

    // The caption menu becomes available at "Let's begin" (CaptionsController.enableCaptionMenu)
    if (global.captionMenuEnabled && leftHand.getFacingCameraAngle() != null && leftHand.isFacingCamera()) {
        // Show the object
        if (script.palmMenu) {
            setMenuShown(true);
        }
        
        // Get palm center position and offset it
        const palmCenter = leftHand.getPalmCenter();
        
        // Get object tracking component for rotation
        const trackingComponent = leftHand.objectTracking3DComponent;
        
       if (palmCenter && trackingComponent) {
    // Get rotation from the object tracking component first
    const trackingTransform = trackingComponent.getSceneObject().getTransform();
    const rotation = trackingTransform.getWorldRotation();
    
    // Transform the offset from local space to world space
    const worldOffset = rotation.multiplyVec3(script.menuOffset);
    
    // Position the object at the palm center plus the offset
    const offsetPosition = palmCenter.add(worldOffset);
    script.palmMenu.getTransform().setWorldPosition(offsetPosition);
    
    // Apply rotation to our object
    script.palmMenu.getTransform().setWorldRotation(rotation);
}
    } else {
        // Hide the object when palm is not facing camera
        if (script.palmMenu) {
            setMenuShown(false);
        }
    }
}

// Scales the menu on or off (ButtonScale.ts, registered by StartMenuBridge)
function setMenuShown(show) {
    if (global.scaleButton) {
        global.scaleButton(script.palmMenu, show);
    } else {
        script.palmMenu.enabled = show;
    }
}



onAwake();