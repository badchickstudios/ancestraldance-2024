// Import required modules
const SIK = require('SpectaclesInteractionKit.lspkg/SIK').SIK;

//@input SceneObject captions
//@input Component.ScriptComponent createButton {"hint":"The button that will create the prefab object", "allowUndefined": true}
// Reference to the stored instantiated object
let latestObject = null;

// Captions are on by default; the palm toggle flips this. They only show once the story starts.
let captionsWanted = true;
let storyStarted = false;

function applyCaptionVisibility() {
    if (script.captions) script.captions.enabled = storyStarted && captionsWanted;
}

// Called by GameManager when the "Let's begin" tip shows: the palm menu becomes available
global.enableCaptionMenu = function() {
    global.captionMenuEnabled = true;
};

// Called by GameManager when the intro begins
global.startCaptions = function() {
    storyStarted = true;
    global.captionMenuEnabled = true;
    applyCaptionVisibility();
};

function onAwake() {
//    print("Awake called");
    // Captions stay hidden until the story starts (global.startCaptions)
    global.captionMenuEnabled = false;
    applyCaptionVisibility();
    // Wait for other components to initialize by deferring to OnStartEvent
    script.createEvent("OnStartEvent").bind(() => {
        onStart();
    });
}

function onStart() {
  //  print("OnStart called");

    if (!script.createButton) {
     //   print("Warning: Create button is not assigned!");
        return;
    }

    // Get the Interactable component from the same SceneObject as the script component

    const interactable = script.createButton;
    
    if (!interactable) {
      //  print("Warning: No Interactable component found on the button object!");
        return;
    }

  // print("Found interactable, adding event listener");

    // Create an event callback function for the create button
    const onTriggerStartCallback = () => {
      //  print("Button triggered!");
      //  
        captionsWanted = !captionsWanted;
        applyCaptionVisibility();
    };

    // UIKit buttons (SIK 2.0) expose onTriggerUp; older SIK Interactables expose onTriggerStart
    if (interactable.onTriggerUp) {
        interactable.onTriggerUp.add(onTriggerStartCallback);
    } else {
        interactable.onTriggerStart.add(onTriggerStartCallback);
    }
}

// Start the script
onAwake();