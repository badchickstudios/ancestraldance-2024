const SIK = require('SpectaclesInteractionKit.lspkg/SIK').SIK;
const interactionManager = SIK.InteractionManager;
const interactorInputType = require('SpectaclesInteractionKit.lspkg/Core/Interactor/Interactor').InteractorInputType;
const interactionConfiguration = SIK.InteractionConfiguration;


//@input SceneObject[] Gifts
//@input SceneObject GiftsShrink
//@input SceneObject[] leftWristGifts
//@input SceneObject[] rightWristGifts
//@input SceneObject HaloLines2
var localselections = 0;
var isaGiftClicked = false;




function onAwake() {
  // Wait for other components to initialize by deferring to OnStartEvent.
  script.createEvent('OnStartEvent').bind(() => {
    onStart();
  });
}

function onStart() {

  // You could also retrieve the Interactable component like this:
  interactable0 = interactionManager.getInteractableBySceneObject(
    script.Gifts[0]
  );
    
      interactable1 = interactionManager.getInteractableBySceneObject(
    script.Gifts[1]
  );
      interactable2 = interactionManager.getInteractableBySceneObject(
    script.Gifts[2]
  );

  // Define the desired callback logic for the relevant Interactable event.
  var onTriggerStartCallback0 = (event) => {
 
    if (isaGiftClicked== false ) {
        print("Clicked the first ancestor!");
             localselections+=1;
               script.leftWristGifts[0].enabled = true;
            script.rightWristGifts[0].enabled =true;
            isaGiftClicked = true;
  
       print("local selections: " + localselections);   
     checkIfAllSelected();
            
     }
        
  };
    
    var onTriggerStartCallback1 = (event) => {
 
    if (isaGiftClicked == false ) {
        print("Clicked the first ancestor!");
             localselections+=1;
               script.leftWristGifts[1].enabled = true;
            script.rightWristGifts[1].enabled =true;
            isaGiftClicked = true;
     
       print("local selections: " + localselections);   
     checkIfAllSelected();
            
     }
        
  };
    
        var onTriggerStartCallback2 = (event) => {
 
    if (isaGiftClicked == false ) {
        print("Clicked the first ancestor!");
             localselections+=1;
            script.leftWristGifts[2].enabled = true;
            script.rightWristGifts[2].enabled =true;
            isaGiftClicked = true;
     
       print("local selections: " + localselections);   
    checkIfAllSelected();
            
     }
        
  };

  interactable0.onInteractorTriggerStart(onTriggerStartCallback0);
    interactable1.onInteractorTriggerStart(onTriggerStartCallback1);
    interactable2.onInteractorTriggerStart(onTriggerStartCallback2);
}


function checkIfAllSelected() {
    if (localselections >= 1) {
        print("Player completed all selections! Sending sync message...");
          script.HaloLines2.enabled = true;
        sendPlayerCompletedMessage();
    }
}

function sendPlayerCompletedMessage() {
    // Call the global function directly
    if (global.onPlayerCompleted) {
        global.onPlayerCompleted();
        script.GiftsShrink.enabled = true;
    } else {
        print("Could not find game manager sync function");
    }
}



onAwake();