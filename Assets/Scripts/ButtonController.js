const SIK = require('SpectaclesInteractionKit.lspkg/SIK').SIK;
const interactionManager = SIK.InteractionManager;
const interactorInputType = require('SpectaclesInteractionKit.lspkg/Core/Interactor/Interactor').InteractorInputType;
const interactionConfiguration = SIK.InteractionConfiguration;

//@input SceneObject buttonObj
//@input string statemessagename


function onAwake() {
    // Wait for other components to initialize by deferring to OnStartEvent.
    script.createEvent('OnStartEvent').bind(function() {
        onStart();
    });
}

function onStart() {
    // You could also retrieve the Interactable component like this:
    interactable = interactionManager.getInteractableBySceneObject(
        script.buttonObj
    );

    // Define the desired callback logic for the relevant Interactable event.
    var onTriggerStartCallback = function(event) {
        if (global.gameManagerReady) {
            print("Button pressed - starting game!");
            
            // Check what type of button this is based on statemessagename
            if (script.statemessagename == "startGame") {
                // This is the initial "Start Game" button
                if (global.startGame) {
                    global.startGame();
                } else {
                    print("startGame function not available");
                }
            } else if (script.statemessagename == "beginGame") {
                // This is the "Ready to Begin" button in the waiting room
                if (global.beginGame) {
                    global.beginGame();
                } else {
                    print("beginGame function not available");
                }
            } else {
                // Generic fallback - try to begin the game
                if (global.beginGame) {
                    global.beginGame();
                } else if (global.startGame) {
                    global.startGame();
                } else {
                    print("No game start functions available");
                }
            }
        } else {
            print("Please wait, game is still loading...");
        }
    };

    interactable.onInteractorTriggerStart(onTriggerStartCallback);
}

onAwake();