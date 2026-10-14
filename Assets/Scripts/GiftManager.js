const SIK = require('SpectaclesInteractionKit.lspkg/SIK').SIK;
const interactionManager = SIK.InteractionManager;


//@input SceneObject[] Gifts
//@input SceneObject GiftsShrink
//@input SceneObject[] leftWristGifts
//@input SceneObject[] rightWristGifts
//@input SceneObject HaloLines2
//@input float autoPickSeconds = 30 {"hint": "If this player hasn't chosen a gift after this many seconds, one is picked at random"}
var localselections = 0;
var isaGiftClicked = false;




function onAwake() {
  // Wait for other components to initialize by deferring to OnStartEvent.
  script.createEvent('OnStartEvent').bind(() => {
    onStart();
  });
}

function onStart() {
  for (var i = 0; i < script.Gifts.length; i++) {
    var interactable = interactionManager.getInteractableBySceneObject(script.Gifts[i]);
    if (interactable) {
      interactable.onInteractorTriggerStart.add(onGiftTriggered(i));
    }
  }

  // Fallback so one player who never chooses can't stall the story for everyone
  var autoPick = script.createEvent("DelayedCallbackEvent");
  autoPick.bind(function() {
    if (!isaGiftClicked) {
      var index = Math.floor(Math.random() * script.Gifts.length);
      print("No gift chosen after " + script.autoPickSeconds + "s - picking gift " + index);
      pickGift(index);
    }
  });
  autoPick.reset(script.autoPickSeconds);
}

function onGiftTriggered(index) {
  return function(event) {
    pickGift(index);
  };
}

function pickGift(index) {
  if (isaGiftClicked) return;
  isaGiftClicked = true;
  print("Picked gift " + index);
  localselections += 1;
  script.leftWristGifts[index].enabled = true;
  script.rightWristGifts[index].enabled = true;

  print("local selections: " + localselections);
  checkIfAllSelected();
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
