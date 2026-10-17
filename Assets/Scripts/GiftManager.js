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




var autoPick = null;
var awakeTime = getTime();

function onAwake() {
  // Wait for other components to initialize by deferring to OnStartEvent.
  script.createEvent('OnStartEvent').bind(() => {
    onStart();
  });
  // Replay: each time the story switches this back on, everyone picks again
  script.createEvent('OnEnableEvent').bind(() => {
    if (getTime() === awakeTime) return; // first switch-on: onStart handles it
    localselections = 0;
    isaGiftClicked = false;
    global.localGiftIndex = -1;
    startAutoPick();
  });
  script.createEvent('OnDisableEvent').bind(() => {
    if (autoPick) autoPick.enabled = false;
  });
}

// WristGiftShare copies these to show this gift on other players' devices
global.localWristGifts = { left: script.leftWristGifts, right: script.rightWristGifts };
global.localGiftIndex = -1;

function onStart() {
  for (var i = 0; i < script.Gifts.length; i++) {
    var interactable = interactionManager.getInteractableBySceneObject(script.Gifts[i]);
    if (interactable) {
      interactable.onInteractorTriggerStart.add(onGiftTriggered(i));
    }
  }

  startAutoPick();
}

// Fallback so one player who never chooses can't stall the story for everyone
function startAutoPick() {
  if (autoPick) autoPick.enabled = false;
  autoPick = script.createEvent("DelayedCallbackEvent");
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
  // Shared with the other players by WristGiftShare
  global.localGiftIndex = index;

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
