// Import required modules
const SIK = require('SpectaclesInteractionKit.lspkg/SIK').SIK;

//@input SceneObject captions
//@input Component.ScriptComponent createButton {"hint":"The button that will create the prefab object", "allowUndefined": true}
//@input Component.Text captionText {"hint":"Caption text (defaults to the first Text under Captions)", "allowUndefined": true}
//@input string instructionText = "Look at your left palm to toggle captions" {"hint":"Shown when the story starts, cleared after the first palm look"}

// Reference to the stored instantiated object
let latestObject = null;

let instructionShowing = false;

function getCaptionText() {
    if (script.captionText) return script.captionText;
    if (!script.captions) return null;
    for (let i = 0; i < script.captions.getChildrenCount(); i++) {
        const text = script.captions.getChild(i).getComponent("Component.Text");
        if (text) return text;
    }
    return null;
}

// Called by GameManager when the intro begins: captions appear with the palm instruction
global.startCaptions = function() {
    global.captionsStarted = true;
    if (script.captions) script.captions.enabled = true;
    const text = getCaptionText();
    if (text) {
        text.text = script.instructionText;
        instructionShowing = true;
    }
};

// Called by PalmController the first time the palm menu appears
global.onPalmMenuShown = function() {
    if (!instructionShowing) return;
    instructionShowing = false;
    const text = getCaptionText();
    // Leave it alone if a story caption already replaced the instruction
    if (text && text.text === script.instructionText) text.text = "";
};

function onAwake() {
//    print("Awake called");
    // Captions stay hidden until the story starts (global.startCaptions)
    global.captionsStarted = false;
    if (script.captions) script.captions.enabled = false;
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
        if (script.captions) {
            script.captions.enabled = !script.captions.enabled;
           // print("Captions toggled to: " + script.captions.enabled);
        } else {
           // print("No captions object assigned!");
        }
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