//@input SceneObject[] uiElements
//@input Asset.AudioTrackAsset[] voTracks
//@input Asset.AudioTrackAsset bkndTrack
//@input Asset.AudioTrackAsset[] musicTracks
//@input Asset.AudioTrackAsset sfxTrack
//@input Component.AudioComponent voComponent
//@input Component.AudioComponent bkndComponent
//@input Component.AudioComponent musicComponent
//@input Component.AudioComponent sfxComponent
//@input SceneObject readyButton
//@input SceneObject visualsForPlayer2  // Only this gets enabled for Player 2
//@input Component.Text waitingMessageText
//@input Component.Text hostWaitingMessageText  
//@input Component.Text playerCountText
//@input SceneObject singlePlayerButton
//@input SceneObject multiplayerButton
//@input SceneObject[] gameObjects
//@input SceneObject breathingAni
//@input SceneObject voiceManager
//@input SceneObject giftManager
//@input SceneObject earthManager
//@input SceneObject touchtheEarth
//@input SceneObject FFShrink
//@input SceneObject gifts
//@input SceneObject plants
//@input SceneObject ancestorsShrink
//@input SceneObject UIRiseShrink
//@input SceneObject UIPinchShrink
//@input SceneObject UIEarthShrink
//@input Component.Text captionText
//@input string[] captions
//@input float[] captionTime
// @input vec4 captionColor = {1.0, 1.0, 1.0, 1.0} {"widget":"color"}
// @input vec4 instructColor = {1.0, 1.0, 1.0, 1.0} {"widget":"color"}
//@input SceneObject PlantParticlesLeft
//@input SceneObject PlantParticlesRight

var syncEntity;

// Game States
var GameState = {
    MENU: "menu",
    WAITING_FOR_PLAYERS: "waiting_for_players",
    READY_TO_START: "ready_to_start", 
    INTRO_PLAYING: "intro_playing",
    ANCESTOR_INTRO: "ancestor_intro",
    ANCESTOR_SELECTION: "ancestor_selection",
    READY_TO_FUSE: "ready_to_fuse",
    EARTH_HEALING: "earth_healing",
    ANCESTOR_FUSION: "ancestor_fusion",
    GAME_COMPLETE: "game_complete"
};

// State variables
var currentState = GameState.MENU;
var isGameManagerActive = false;

// Player tracking
var totalPlayersCount = 0;
var minPlayersRequired = 2;

// Progress tracking
var globalSelectionCount = 0;
var globalEarthHealedCount = 0;

// Players actually in this game, keyed by connection id. getUsers() can include
// stale connections, so the count comes from a presence handshake instead.
var presentPlayers = {};
// Who has finished each stage, keyed by connection id (so repeats don't double-count)
var completedSelections = {};
var completedHealers = {};
var fuseRequested = false;

// "solo" (Individual) or "collective", set by the start menu choice
var playMode = "solo";
var syncReady = false;
// Collective: placement asked for before the SyncEntity knew who the host is
var placementPending = false;
// Collective joiners: has the host's placement arrived yet?
var placementReceived = false;
// Collective: players taking part, fixed when the host begins (connection id -> true).
// Stages wait for these players only, so a late joiner can't stall the story.
var roster = null;
var gameStarted = false;
// Placement was asked for (content enabled) / this device ran the host's surface tracker
var assetPlacementRequested = false;
var hostPlacementStarted = false;

// Audio track number
var currentStemIndex = -1;
var currentVOIndex = -1;
var ancestorSelectionStarted = false;
var ancestorsRiseTriggered = false;
var riseReceived = false;
var ancestorsRiseTimeout = null;

// UI references
var ui = {
    waitingMessage: null,
    readyButton: null,
    playerCountText: null,
    hostWaitingMessage: null,
    singlePlayerButton: null,
    multiplayerButton: null
};

// Ready button setup with touch handler
function setupReadyButton() {
    if (script.readyButton) {
        var touchComponent = script.readyButton.getComponent("Component.TouchComponent");
        if (touchComponent) {
            touchComponent.onTouchStart.add(function() {
                var isSinglePlayerMode = playMode !== "collective";
                
                if (isSinglePlayerMode || isHost()) {
                    print("Starting game...");
                    beginGame();
                }
            });
        }
    }
}

// Initialize
function init() {
  //  print("GameManager: Initializing...");
    
    setupSyncEntity();
    setupUI();
    setupGlobalFunctions();
    setupReadyButton();
    
    isGameManagerActive = false;
    currentState = GameState.MENU;
}

// Setup sync entity and event listeners
function setupSyncEntity() {
    syncEntity = new SyncEntity(script, null, true);
    syncEntity.notifyOnReady(onSyncReady);
}

function onSyncReady() {
  //  print("GameManager: SyncEntity ready!");
    
    try {
        syncEntity.onEventReceived.add('startIntro', onReceiveStartIntro);
        syncEntity.onEventReceived.add('showFireflies', onReceiveShowFireflies);
        syncEntity.onEventReceived.add('ancestorsRisemsg', onReceiveAncestorsRise);
        syncEntity.onEventReceived.add('playerCompletedSelections', onReceivePlayerCompleted);
        syncEntity.onEventReceived.add('readytofusemsg', onReceiveReadyToFuse);
        syncEntity.onEventReceived.add('playerHealedEarth', onReceivePlayerHealed);
        syncEntity.onEventReceived.add('ancestorFusion', onReceiveAncestorFusion);
        
        // PLACEMENT SYNC EVENTS - NEW
        syncEntity.onEventReceived.add('assetPlacement', onReceivePlacement);
        syncEntity.onEventReceived.add('objectPlaced', onReceiveObjectPlaced);
        syncEntity.onEventReceived.add('requestPlacementSync', onReceiveRequestPlacementSync);
        
        // Test connectivity for host
        if (syncEntity.doIOwnStore()) {
            var delayedTest = script.createEvent("DelayedCallbackEvent");
            delayedTest.bind(function() {
                syncEntity.sendEvent('testConnectivity', {test: true});
            });
            delayedTest.reset(2.0);
        }
        
        syncEntity.onEventReceived.add('testConnectivity', function() {
          //  print("Network connectivity confirmed!");
        });
        
    } catch (e) {
      //  print("Failed to add event listeners: " + e);
    }

    setupPresence();
    syncReady = true;
    syncEntity.onEventReceived.add('gameInProgress', onReceiveGameInProgress);
    watchForHostRole();
    updatePlayerCount();
    setupPlayerCountMonitoring();
    
    // Check for stored user choice
    if (global.userChoice) {
        if (global.userChoice === "singlePlayer") {
            startSinglePlayer();
        }
        global.userChoice = null;
    }
    
    if (currentState == GameState.WAITING_FOR_PLAYERS) {
        checkHostStatusAndShowUI();
    }

    if (placementPending) {
        placementPending = false;
        startAssetPlacement();
    }

 //   print("GameManager ready");
}

// Setup UI references
function setupUI() {
    if (script.waitingMessageText) ui.waitingMessage = script.waitingMessageText.getSceneObject();
    if (script.hostWaitingMessageText) ui.hostWaitingMessage = script.hostWaitingMessageText.getSceneObject();
    if (script.readyButton) ui.readyButton = script.readyButton;
    if (script.playerCountText) ui.playerCountText = script.playerCountText;
    if (script.singlePlayerButton) ui.singlePlayerButton = script.singlePlayerButton;
    if (script.multiplayerButton) ui.multiplayerButton = script.multiplayerButton;
}

// Setup global functions
function setupGlobalFunctions() {
    global.gameManagerReady = true;
    global.onPlayerCompleted = sendPlayerCompleted;
    global.onPlayerHealed = sendPlayerHealed;
    global.startSinglePlayer = startSinglePlayer;
    global.startMultiplayer = startMultiplayer;
    global.beginGame = beginGame;
    global.isHost = isHost;
    global.isSinglePlayerMode = isSinglePlayerMode;
    global.getHostName = getHostName;
    global.sendAncestorsRise = sendAncestorsRise;
    global.sendShowFireflies = sendShowFireflies;
    global.sendReadyToFuse = sendReadyToFuse;
    global.sendStartIntro = sendStartIntro;
    
    // PLACEMENT SYNC FUNCTIONS - NEW
    global.startAssetPlacement = startAssetPlacement;
    global.sendObjectPlaced = sendObjectPlaced;
    global.requestPlacementSync = requestPlacementSync;
}

// State management
function setState(newState) {
    if (currentState == newState) return;
    
  //  print("State: " + currentState + " -> " + newState);
    var previousState = currentState;
    currentState = newState;
    
    onStateExit(previousState);
    onStateEnter(newState);
}

function onStateEnter(state) {
    switch(state) {
        case GameState.MENU: showMenu(); break;
        case GameState.WAITING_FOR_PLAYERS: showWaitingForPlayers(); break;
        case GameState.READY_TO_START: showReadyToStart(); break;
        case GameState.INTRO_PLAYING: playIntro(); break;
        case GameState.ANCESTOR_INTRO: playAncestorIntro(); break;
        case GameState.ANCESTOR_SELECTION: startAncestorSelection(); break;
        case GameState.READY_TO_FUSE: showReadyToFuse(); break;
        case GameState.EARTH_HEALING: startEarthHealing(); break;
        case GameState.ANCESTOR_FUSION: playAncestorFusion(); break;
        case GameState.GAME_COMPLETE: showGameComplete(); break;
    }
}

function onStateExit(state) {
    switch(state) {
        case GameState.MENU: hideMenu(); break;
        case GameState.WAITING_FOR_PLAYERS: hideWaitingUI(); break;
        case GameState.ANCESTOR_SELECTION: resetGlobalSelections(); break;
        case GameState.EARTH_HEALING: resetEarthHealing(); break;
    }
}

// Helper functions
// Host = owner of this GameManager's SyncEntity (the first player into the session)
function isHost() {
    if (playMode !== "collective") return true;
    return !!(syncEntity && syncEntity.doIOwnStore());
}

function isSinglePlayerMode() {
    return playMode !== "collective";
}

function getHostName() {
    if (syncEntity && syncEntity.ownerInfo && syncEntity.ownerInfo.displayName) {
        return syncEntity.ownerInfo.displayName;
    }
    return "the host";
}

function enableReadyButton(enable) {
    if (script.readyButton) {
        script.readyButton.enabled = enable;
    }
}

// Add this helper function to your GameManager.js
function delay(callback, seconds) {
    var delayedEvent = script.createEvent("DelayedCallbackEvent");
    delayedEvent.bind(callback);
    delayedEvent.reset(seconds);
    return delayedEvent; // Return in case you need to cancel it
}

// ===== CONTINUATION OF GAMEMANAGER.JS PART 2 =====

// State-specific logic
function showMenu() {
    if (!isGameManagerActive) return;
    
    setUIVisibility("singlePlayerButton", true);
    setUIVisibility("multiplayerButton", true);
    hideAllGameUI();
}

function startSinglePlayer() {
   // print("Starting single player mode");
    playMode = "solo";
    isGameManagerActive = true;
    totalPlayersCount = 1;
    
    setUIVisibility("singlePlayerButton", false);
    setUIVisibility("multiplayerButton", false);
     script.bkndComponent.play(1);
    script.bkndComponent.loop = false;
    
    if (global.startMenuObject) {
        global.startMenuObject.enabled = false;
    }
    
    setState(GameState.READY_TO_START);
}

function startMultiplayer() {
 //   print("Starting multiplayer mode");
    playMode = "collective";
    isGameManagerActive = true;
    enableReadyButton(false);
     script.bkndComponent.play(1);
    script.bkndComponent.loop = false;
    setState(GameState.WAITING_FOR_PLAYERS);
}

function showWaitingForPlayers() {
    enableReadyButton(false);

    if (roleKnown()) {
        checkHostStatusAndShowUI();
    } else {
        // Host isn't decided yet; watchForHostRole() shows the right message once it is
        setUIVisibility("hostWaitingMessage", false);
        setUIVisibility("waitingMessage", true);
        setUIText("waitingMessage", "Connecting...");
    }
}

// The host is whoever owns this SyncEntity; that isn't known until the session
// settles ownership, which can be a moment after the SyncEntity is ready.
function roleKnown() {
    return syncReady && syncEntity && syncEntity.isStoreOwned();
}

// How long the recorded host can be absent (never announced itself) before someone takes over
var HOST_TAKEOVER_SECONDS = 3;
var roleAnnounced = false;
var hostMissingSince = -1;
var takeoverRequested = false;

function watchForHostRole() {
    if (syncEntity.onOwnerUpdated) {
        syncEntity.onOwnerUpdated.add(function() {
            hostMissingSince = -1;
            onRoleKnown();
        });
    }
    // Per-frame: ownership may settle before we subscribed, and the host may be gone
    script.createEvent("UpdateEvent").bind(function() {
        if (!syncReady || playMode !== "collective") return;
        if (!roleAnnounced && roleKnown()) {
            roleAnnounced = true;
            onRoleKnown();
        }
        checkHostPresent();
    });
}

// The host is whoever owns this SyncEntity. If that owner never shows up (it left, or
// it's a stale connection), the present player with the lowest connection id takes over.
function checkHostPresent() {
    if (takeoverRequested || syncEntity.doIOwnStore()) {
        hostMissingSince = -1;
        return;
    }
    var owner = syncEntity.ownerInfo;
    var ownerHere = syncEntity.isStoreOwned() && owner && presentPlayers[owner.connectionId];
    if (ownerHere) {
        hostMissingSince = -1;
        return;
    }
    var now = getTime();
    if (hostMissingSince < 0) {
        hostMissingSince = now;
        return;
    }
    if (now - hostMissingSince < HOST_TAKEOVER_SECONDS || !isFirstPresentPlayer()) return;

    takeoverRequested = true;
    print("Host is not here - taking over as host");
    syncEntity.requestOwnership(function() {
        takeoverRequested = false;
        hostMissingSince = -1;
        onRoleKnown();
    }, function(error) {
        print("Host takeover failed: " + error);
        takeoverRequested = false;
        hostMissingSince = -1;
    });
}

function isFirstPresentPlayer() {
    var ids = Object.keys(presentPlayers).sort();
    return ids.length > 0 && ids[0] === localConnectionId();
}

function onRoleKnown() {
    if (!roleKnown() || playMode !== "collective") return;
    if (currentState == GameState.WAITING_FOR_PLAYERS) {
        checkHostStatusAndShowUI();
    } else if (currentState == GameState.READY_TO_START) {
        showReadyToStart();
    }
    if (placementPending) {
        placementPending = false;
        startAssetPlacement();
    } else if (assetPlacementRequested && isHost() && !hostPlacementStarted && !placementReceived) {
        // Took over as host before anything was placed: this player places now
        startAssetPlacement();
    }
}

function checkHostStatusAndShowUI() {
    if (isHost()) {
        setUIVisibility("waitingMessage", true);
        setUIVisibility("playerCountText", true);
        setUIVisibility("hostWaitingMessage", false);
        
        if (script.visualsForPlayer2) script.visualsForPlayer2.enabled = false;
        
        if (totalPlayersCount >= minPlayersRequired) {
            setState(GameState.READY_TO_START);
            showReadyToStart();
        } else {
            setUIText("waitingMessage", "Waiting for others to join...");
        }
    } else {
        setUIVisibility("waitingMessage", false);
        setUIVisibility("hostWaitingMessage", true);
        setUIVisibility("playerCountText", true);
        enableReadyButton(false);
        
        if (script.visualsForPlayer2) script.visualsForPlayer2.enabled = true;
        updateHostWaitingMessage();
    }
    
    updatePlayerCountDisplay();
}

function showReadyToStart() {
    var isSinglePlayerMode = playMode !== "collective";
    
    if (isSinglePlayerMode) {
        enableReadyButton(true);
        setUIVisibility("waitingMessage", true);
        setUIVisibility("hostWaitingMessage", false);
        setUIVisibility("playerCountText", false);
        setUIText("waitingMessage", "");
        
        if (script.visualsForPlayer2) script.visualsForPlayer2.enabled = true;
    } else if (isHost()) {
        enableReadyButton(true);
        setUIVisibility("waitingMessage", true);
        setUIVisibility("hostWaitingMessage", false);
        setUIVisibility("playerCountText", true);
        setUIText("waitingMessage", totalPlayersCount + " players here. Begin when everyone has joined.");
        
        if (script.visualsForPlayer2) script.visualsForPlayer2.enabled = true;
    } else {
        enableReadyButton(false);
        setUIVisibility("waitingMessage", false);
        setUIVisibility("hostWaitingMessage", true);
        setUIVisibility("playerCountText", true);
        
        if (script.visualsForPlayer2) script.visualsForPlayer2.enabled = true;
        updateHostWaitingMessage();
    }
}

function beginGame() {
    var isSinglePlayerMode = playMode !== "collective";
    
    if (isSinglePlayerMode) {
        currentState = GameState.INTRO_PLAYING;
        playIntro();
    } else if (syncEntity && syncEntity.doIOwnStore()) {
        sendStartIntro();
    }
}

function playIntro() {
    hideAllUI();
    // Captions appear now, starting with the palm-toggle instruction
    if (global.startCaptions) global.startCaptions();

    playStem(0);

    
     delay(function() {
        playVO(0);
        script.gameObjects[2].enabled = true;
    }, 1.0);
    
    delay(function() {
      //  script.captionText.textFill.color = script.captionColor;
        script.captionText.text = script.captions[0];
    }, script.captionTime[0]);
    
     delay(function() {
        script.captionText.text = script.captions[1];
    }, script.captionTime[1]);
    
       delay(function() {
        script.captionText.text = script.captions[2];
    }, script.captionTime[2]);
    
    
    
    delay(function() {
        sendShowFireflies();
    }, 9.0);

   
}

function playAncestorIntro() {
    playVO(1);
    script.gameObjects[0].enabled = true;
    
         delay(function() {
        script.captionText.text = script.captions[3];
    }, script.captionTime[3]);
    
          delay(function() {
        script.captionText.text = script.captions[4];
    }, script.captionTime[4]);
    
          delay(function() {
        script.captionText.text = script.captions[5];
    }, script.captionTime[5]);
    
          delay(function() {
        script.captionText.text = script.captions[6];
    }, script.captionTime[6]);
    
          delay(function() {
        script.captionText.text = script.captions[7];
    }, script.captionTime[7]);
    
          delay(function() {
        script.captionText.text = script.captions[8];
    }, script.captionTime[8]);
    
          delay(function() {
        script.captionText.text = script.captions[9];
    }, script.captionTime[9]);
    
          delay(function() {
        script.captionText.text = script.captions[10];
        // script.captionText.textFill.color = script.instructColor;
    }, script.captionTime[10]);
    
          delay(function() {
        script.captionText.text = script.captions[11];
      //  script.captionText.textFill.color = script.instructColor;
    }, script.captionTime[11]);
    
          delay(function() {
        script.captionText.text = script.captions[12];
         // script.captionText.textFill.color = script.captionColor;
    }, script.captionTime[12]);
    
    

     delay(function() {
        script.voiceManager.enabled = true;
        script.uiElements[0].enabled = true;
    }, 17);
   
}

function startAncestorSelection() {
    if (ancestorSelectionStarted) return;
    playSFX();
  //  print("Starting ancestor selection");
     script.UIRiseShrink.enabled = true;
     script.FFShrink.enabled = true;
    script.voiceManager.enabled = false;
    ancestorSelectionStarted = true;
     //script.uiElements[0].enabled = false;
    script.gameObjects[3].enabled = true;
    script.gameObjects[2].enabled = false;

   delay(function() {
        playVO(2);
    }, 10);
    
            delay(function() {
        script.captionText.text = script.captions[13];
    }, script.captionTime[13]);
    
               delay(function() {
        script.captionText.text = script.captions[14];
    }, script.captionTime[14]);
    
               delay(function() {
        script.captionText.text = script.captions[15];
    }, script.captionTime[15]);
    
               delay(function() {
        script.captionText.text = script.captions[16];
    }, script.captionTime[16]);
    
               delay(function() {
        script.captionText.text = script.captions[17];
    }, script.captionTime[17]);
    
               delay(function() {
        script.captionText.text = script.captions[18];
    }, script.captionTime[18]);
    
               delay(function() {
        script.captionText.text = script.captions[19];
           script.uiElements[1].enabled = true;
    }, script.captionTime[19]);
    
               delay(function() {
        script.captionText.text = script.captions[20];
       //  script.captionText.textFill.color = script.instructColor;
    }, script.captionTime[20]);
    

    delay(function() {
        script.giftManager.enabled = true;
     
    }, 16);

    resetGlobalSelections();
    updatePlayerCount();
}

function startEarthHealing() {
    script.giftManager.enabled = false;

    playVO(3);
     script.uiElements[1].enabled = false;
    
    
               delay(function() {
        script.captionText.text = script.captions[21];
        // script.captionText.textFill.color = script.captionColor;
    }, script.captionTime[21]);
    
    
               delay(function() {
        script.captionText.text = script.captions[22];
    }, script.captionTime[22]);
    
    
               delay(function() {
        script.captionText.text = script.captions[23];
      //   script.captionText.textFill.color = script.instructColor;
    }, script.captionTime[23]);
    
    
               delay(function() {
        script.captionText.text = script.captions[24];
     //   script.captionText.textFill.color = script.captionColor;
        
    }, script.captionTime[24]);
    
    
               delay(function() {
        script.captionText.text = script.captions[25];
    }, script.captionTime[25]);
    
    
               delay(function() {
        script.captionText.text = script.captions[26];
       //  script.captionText.textFill.color = script.instructColor;
    }, script.captionTime[26]);
    
    
               delay(function() {
        script.captionText.text = script.captions[27];
       //  script.captionText.textFill.color = script.captionColor;
    }, script.captionTime[27]);
   
    
     delay(function() {
         script.earthManager.enabled = true;  
        script.touchtheEarth.enabled = true;
         script.uiElements[2].enabled = true;
    }, 15);
    
    
    
    
}

function showReadyToFuse() {
    setState(GameState.EARTH_HEALING);
}

function playAncestorFusion() {
    playVO(4);
        script.uiElements[2].enabled = false;
     script.earthManager.enabled = false;  
        script.touchtheEarth.enabled = false;
    script.gameObjects[0].enabled = false;
    script.gameObjects[1].enabled = true;
    script.plants.enabled = true;
    
    
               delay(function() {
        script.captionText.text = script.captions[28];
    }, script.captionTime[28]);
    
       delay(function() {
        script.captionText.text = script.captions[29];
    }, script.captionTime[29]);
 
     delay(function() {
        script.captionText.text = script.captions[30];
    }, script.captionTime[30]);
 
    
        delay(function() {
        script.captionText.text = script.captions[31];
    }, script.captionTime[31]);
    
        delay(function() {
        script.captionText.text = script.captions[32];
    }, script.captionTime[32]);
    
         delay(function() {
        script.captionText.text = script.captions[33];
    }, script.captionTime[33]);
    
         delay(function() {
        script.captionText.text = script.captions[34];
    }, script.captionTime[34]);
    
         delay(function() {
        script.captionText.text = script.captions[35];
    }, script.captionTime[35]);
    
         delay(function() {
         script.gameObjects[7].enabled = true;
        script.gameObjects[3].enabled = false;
    }, 14);
    
    
  
    
        delay(function() {
        setState(GameState.GAME_COMPLETE);
    }, 18);
    
    
    
    
    
    
}

function showGameComplete() {
  //  print("Game complete!");
    playVO(5);
    
         delay(function() {
    //    print("caption36");
        script.captionText.text = script.captions[36];
    }, script.captionTime[36]);
    
        delay(function() {
        script.captionText.text = script.captions[37];
    }, script.captionTime[37]);
    
        delay(function() {
        script.captionText.text = script.captions[38];
    }, script.captionTime[38]);
    
       delay(function() {
            script.PlantParticlesLeft.enabled = true;  
        script.PlantParticlesRight.enabled = true;  
        script.captionText.text = script.captions[39];
        // script.captionText.textFill.color = script.instructColor;
    }, script.captionTime[39]);
    
     delay(function() {
        script.captionText.text = script.captions[40];
       //  script.captionText.textFill.color = script.captionColor;
    }, script.captionTime[40]);
    
     
     delay(function() {
        script.captionText.text = script.captions[41];
    }, script.captionTime[41]);
    
     
     delay(function() {
        script.captionText.text = script.captions[42];
    }, script.captionTime[42]);
    
    
     
     delay(function() {
        script.captionText.text = script.captions[43];
    }, script.captionTime[43]);
    
    
    
    
           delay(function() {

       
    }, 10);
    
}

// ===== PLACEMENT SYNC FUNCTIONS - NEW =====

// Individual: place locally. Collective: only the host runs the surface tracker;
// everyone else waits for the host's placement (or asks for it if they joined late).
function startAssetPlacement() {
    assetPlacementRequested = true;
    if (playMode !== "collective") {
        onReceivePlacement();
        return;
    }
    if (!roleKnown()) {
        // Host isn't known yet; onRoleKnown retries
        placementPending = true;
        return;
    }
    if (isHost()) {
        if (hostPlacementStarted || placementReceived) return;
        hostPlacementStarted = true;
        setUIVisibility("hostWaitingMessage", false);
        onReceivePlacement();
    } else if (!placementReceived) {
        setUIVisibility("hostWaitingMessage", true);
        updateHostWaitingMessage();
        requestPlacementSync();
    }
}

function sendObjectPlaced(position, rotation, isVisible) {
    if (syncEntity && syncEntity.doIOwnStore()) {
        var placementData = {
            position: {x: position.x, y: position.y, z: position.z},
            rotation: {x: rotation.x, y: rotation.y, z: rotation.z, w: rotation.w},
            visible: isVisible,
            timestamp: Date.now()
        };
        syncEntity.sendEvent('objectPlaced', placementData);
    }
}

function requestPlacementSync() {
    if (syncReady && syncEntity && !syncEntity.doIOwnStore()) {
        syncEntity.sendEvent('requestPlacementSync', {
            userId: global.sessionController.getLocalUserId()
        });
    }
}

function onReceivePlacement(eventData, messageInfo) {
    if (global.onPlacementRequested) {
        global.onPlacementRequested();
    }
}

function onReceiveObjectPlaced(eventData, messageInfo) {
    if (eventData && global.onObjectPlacementReceived) {
        global.onObjectPlacementReceived(eventData);
    }
    placementReceived = true;
    updateHostWaitingMessage();
}

function onReceiveRequestPlacementSync(eventData, messageInfo) {
    if (syncEntity && syncEntity.doIOwnStore() && global.getCurrentPlacementState) {
        var currentState = global.getCurrentPlacementState();
        if (currentState && currentState.isPlaced) {
            sendObjectPlaced(currentState.position, currentState.rotation, currentState.visible);
        }
    }
}

// ===== NETWORK MESSAGE SENDERS =====

function sendStartIntro() {
    if (syncEntity && syncEntity.doIOwnStore()) {
        // Everyone here now takes part; later joiners are told the journey has begun
        syncEntity.sendEvent('startIntro', { roster: Object.keys(presentPlayers) });
    }
}

function sendShowFireflies() {
    var isSinglePlayerMode = playMode !== "collective";
    
    if ((syncEntity && syncEntity.doIOwnStore()) || isSinglePlayerMode) {
        if (isSinglePlayerMode) {
            onReceiveShowFireflies();
        } else {
            syncEntity.sendEvent('showFireflies');
        }
    }
}

function sendAncestorsRise() {
    if (ancestorsRiseTriggered) return;
    
    ancestorsRiseTriggered = true;
    var isSinglePlayerMode = playMode !== "collective";
    
    if (isSinglePlayerMode) {
        onReceiveAncestorsRise();
    } else if (syncEntity) {
        syncEntity.sendEvent('ancestorsRisemsg');
    }
}

function sendReadyToFuse() {
    if (syncEntity && syncEntity.doIOwnStore()) {
        syncEntity.sendEvent('readytofusemsg');
    }
}

function sendPlayerCompleted() {
    if (isSinglePlayerMode()) {
        totalPlayersCount = 1;
        globalSelectionCount = 0;
        
        var eventData = { userId: "single_player", userName: "Player", timestamp: Date.now() };
        onReceivePlayerCompleted(eventData, null);
    } else if (syncEntity) {
        var eventData = {
            userId: global.sessionController.getLocalUserId(),
            userName: global.sessionController.getLocalUserName(),
            timestamp: Date.now()
        };
        syncEntity.sendEvent('playerCompletedSelections', eventData);
    }
}

function sendPlayerHealed() {
    if (isSinglePlayerMode()) {
        var eventData = { userId: "single_player", userName: "Player", timestamp: Date.now() };
        onReceivePlayerHealed(eventData, null);
    } else if (syncEntity) {
        var eventData = {
            userId: global.sessionController.getLocalUserId(),
            userName: global.sessionController.getLocalUserName(),
            timestamp: Date.now()
        };
        syncEntity.sendEvent('playerHealedEarth', eventData);
    }
}

function sendAncestorFusion() {
    var isSinglePlayerMode = playMode !== "collective";
    
    if (isSinglePlayerMode) {
        onReceiveAncestorFusion();
    } else if (syncEntity && syncEntity.doIOwnStore()) {
        syncEntity.sendEvent('ancestorFusion');
    }
}

// Network message receivers
function onReceiveStartIntro(eventData, messageInfo) {
    var ids = (eventData && eventData.data && eventData.data.roster) || Object.keys(presentPlayers);
    roster = {};
    for (var i = 0; i < ids.length; i++) roster[ids[i]] = true;
    gameStarted = true;
    print("Journey begins with " + ids.length + " players");
    currentState = GameState.INTRO_PLAYING;
    playIntro();
}

function onReceiveShowFireflies(eventData, messageInfo) {
    currentState = GameState.ANCESTOR_INTRO;
    playAncestorIntro();
}

function onReceiveAncestorsRise(eventData, messageInfo) {
    // Any player's "rise" (or their timeout) can send this; only act on the first
    if (riseReceived) return;
    riseReceived = true;
    currentState = GameState.ANCESTOR_SELECTION;
    startAncestorSelection();
}

function onReceivePlayerCompleted(eventData, messageInfo) {
    if (isSinglePlayerMode()) {
        totalPlayersCount = 1;
    }

    completedSelections[senderId(eventData)] = true;
    globalSelectionCount = countParticipants(completedSelections);
    print("Player completed selections (" + globalSelectionCount + "/" + requiredPlayers() + ")");
    checkSelectionsComplete();
}

function checkSelectionsComplete() {
    if (fuseRequested || globalSelectionCount < requiredPlayers()) return;
    fuseRequested = true;

    if (isSinglePlayerMode()) {
        var nextEventData = { userId: "single_player", userName: "Player", timestamp: Date.now() };
        onReceiveReadyToFuse(nextEventData, null);
    } else {
        var delayedEvent = script.createEvent("DelayedCallbackEvent");
        delayedEvent.bind(function() {
            sendReadyToFuse();
        });
        delayedEvent.reset(0.5);
    }
}

function onReceiveReadyToFuse(eventData, messageInfo) {
    currentState = GameState.EARTH_HEALING;
    startEarthHealing();
}

function onReceivePlayerHealed(eventData, messageInfo) {
    if (isSinglePlayerMode()) {
        totalPlayersCount = 1;
    }
    
    completedHealers[senderId(eventData)] = true;
    globalEarthHealedCount = countParticipants(completedHealers);
    print("Player healed earth (" + globalEarthHealedCount + "/" + requiredPlayers() + ")");
    checkHealingComplete();
}

function checkHealingComplete() {
    if (currentState == GameState.ANCESTOR_FUSION) return;
    if (globalEarthHealedCount >= requiredPlayers()) {
        if ((syncEntity && syncEntity.doIOwnStore()) || isSinglePlayerMode()) {
            currentState = GameState.ANCESTOR_FUSION;
            sendAncestorFusion();
        }
    }
}

function onReceiveAncestorFusion(eventData, messageInfo) {
    currentState = GameState.ANCESTOR_FUSION;
    playAncestorFusion();
}

// Presence: each device announces itself once its SyncEntity is ready and re-announces
// when it hears a newcomer, so late joiners learn who is already here. Stale
// connections never announce, so they aren't counted.
function setupPresence() {
    presentPlayers[localConnectionId()] = true;
    syncEntity.onEventReceived.add('playerPresent', onReceivePresence);
    // remoteOnly: our own copy is already recorded above
    syncEntity.sendEvent('playerPresent', { id: localConnectionId() }, true);

    if (global.sessionController && global.sessionController.onUserLeftSession) {
        global.sessionController.onUserLeftSession.add(function(session, userInfo) {
            var id = userInfo && userInfo.connectionId;
            if (!id || !presentPlayers[id]) return;
            delete presentPlayers[id];
            if (roster) delete roster[id];
            delete completedSelections[id];
            delete completedHealers[id];
            globalSelectionCount = countParticipants(completedSelections);
            globalEarthHealedCount = countParticipants(completedHealers);
            updatePlayerCount();
            // Someone leaving may mean everyone remaining is now done
            if (currentState == GameState.ANCESTOR_SELECTION && globalSelectionCount > 0) checkSelectionsComplete();
            if (currentState == GameState.EARTH_HEALING && globalEarthHealedCount > 0) checkHealingComplete();
        });
    }
}

function onReceivePresence(message) {
    var id = message && message.data && message.data.id;
    if (!id || presentPlayers[id]) return;
    presentPlayers[id] = true;
    syncEntity.sendEvent('playerPresent', { id: localConnectionId() }, true);
    // Someone arrived after the journey began: let them know instead of leaving them waiting
    if (gameStarted && isHost()) {
        syncEntity.sendEvent('gameInProgress', { to: id }, true);
    }
    updatePlayerCount();
    if (currentState == GameState.READY_TO_START && isHost()) showReadyToStart();
}

function onReceiveGameInProgress(message) {
    var to = message && message.data && message.data.to;
    if (to !== localConnectionId() || gameStarted) return;
    setUIVisibility("waitingMessage", false);
    setUIVisibility("hostWaitingMessage", true);
    setUIText("hostWaitingMessage", "This journey has already begun. Please join the next one.");
}

// Players each stage waits for: the roster once the journey has begun, otherwise everyone present
function requiredPlayers() {
    if (isSinglePlayerMode()) return 1;
    return roster ? Math.max(1, countKeys(roster)) : totalPlayersCount;
}

// Count only players in the roster (single player and pre-roster: everyone)
function countParticipants(done) {
    if (!roster || isSinglePlayerMode()) return countKeys(done);
    var n = 0;
    for (var id in done) if (roster[id]) n++;
    return n;
}

function localConnectionId() {
    var id = global.sessionController && global.sessionController.getLocalConnectionId();
    return id || "local";
}

// Connection id of whoever sent a network message (local calls pass no message)
function senderId(message) {
    return (message && message.senderConnectionId) || "local";
}

function countKeys(obj) {
    return Object.keys(obj).length;
}

// Utility functions
function updatePlayerCount() {
    if (global.sessionController) {
        totalPlayersCount = Math.max(1, countKeys(presentPlayers));
    } else {
        totalPlayersCount = 1;
    }
    
    if (currentState == GameState.WAITING_FOR_PLAYERS && 
        totalPlayersCount >= minPlayersRequired && 
        isHost()) {
        setState(GameState.READY_TO_START);
    } else if (currentState == GameState.WAITING_FOR_PLAYERS && totalPlayersCount < minPlayersRequired) {
        enableReadyButton(false);
    } else if (!isHost() && totalPlayersCount > 1) {
        enableReadyButton(false);
    }
    
    updatePlayerCountDisplay();
}

function setupPlayerCountMonitoring() {
    var updateEvent = script.createEvent("UpdateEvent");
    var lastPlayerCount = 0;
    
    updateEvent.bind(function() {
        if (global.sessionController) {
            var currentCount = global.sessionController.getUsers().length;
            if (currentCount != lastPlayerCount) {
                lastPlayerCount = currentCount;
                updatePlayerCount();
            }
        }
    });
}

function updateHostWaitingMessage() {
    var hostName = getHostName();
    var message = placementReceived
        ? "Waiting for " + hostName + " to start..."
        : "Waiting for " + hostName + " to place the experience...";
    setUIText("hostWaitingMessage", message);
}

// UI helper functions
function setUIVisibility(elementName, visible) {
    if (ui[elementName]) {
        ui[elementName].enabled = visible;
    }
}

function setUIText(elementName, text) {
    if (elementName == "hostWaitingMessage" && script.hostWaitingMessageText) {
        script.hostWaitingMessageText.text = text;
    } else if (elementName == "playerCountText" && script.playerCountText) {
        script.playerCountText.text = text;
    } else if (elementName == "waitingMessage" && script.waitingMessageText) {
        script.waitingMessageText.text = text;
    }
}

function updatePlayerCountDisplay() {
    var message = "Players: " + totalPlayersCount;

    if (currentState == GameState.WAITING_FOR_PLAYERS || currentState == GameState.READY_TO_START) {
        message += isHost() ? " (Hosting)" : " (Joined)";
    }
    
    setUIText("playerCountText", message);
}

function hideWaitingUI() {
    setUIVisibility("waitingMessage", false);
    enableReadyButton(false);
    setUIVisibility("hostWaitingMessage", false);
}

function hideMenu() {
    setUIVisibility("singlePlayerButton", false);
    setUIVisibility("multiplayerButton", false);
}

function hideAllGameUI() {
    hideWaitingUI();
    setUIVisibility("playerCountText", false);
}

function hideAllUI() {
    hideWaitingUI();
}

// Reset functions
function resetGlobalSelections() {
    globalSelectionCount = 0;
    completedSelections = {};
    fuseRequested = false;
    ancestorSelectionStarted = false;
}

function resetEarthHealing() {
    globalEarthHealedCount = 0;
    completedHealers = {};
}

// Audio functions
function playStem(index) {
    if (index < 0 || index >= script.musicTracks.length) return;
    
    var audioTrack = script.musicTracks[index];
    script.musicComponent.stop(true);
    script.musicComponent.audioTrack = audioTrack;
    script.musicComponent.loop = true;

    script.musicComponent.play(1);
}

function playVO(index, onComplete) {
    if (index < 0 || index >= script.voTracks.length) return;
    
    var audioTrack = script.voTracks[index];
    script.voComponent.stop(true);
    script.voComponent.audioTrack = audioTrack;
    script.voComponent.loop = false;

    script.voComponent.play(1);
}

function playSFX() {
    var audioTrack = script.sfxTrack;
    script.sfxComponent.stop(true);
    script.sfxComponent.audioTrack = audioTrack;
    script.sfxComponent.loop = false;

    script.sfxComponent.play(1);
}

// Initialize
function onStart() {
    init();
}

var onStartEvent = script.createEvent("OnStartEvent");
onStartEvent.bind(onStart);