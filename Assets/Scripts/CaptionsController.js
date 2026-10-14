// Import required modules
const SIK = require('SpectaclesInteractionKit.lspkg/SIK').SIK;

//@input SceneObject captions
//@input Component.ScriptComponent createButton {"hint":"The button that will create the prefab object", "allowUndefined": true}

// Reference to the stored instantiated object
let latestObject = null;

function onAwake() {
//    print("Awake called");
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

    // Add the event listener to the Interactable component
    interactable.onTriggerStart.add(onTriggerStartCallback);
}

// Start the script
onAwake();