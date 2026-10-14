// Require the ASR Module
const asrModule = require("LensStudio:AsrModule");

// @input Component.Text statusText {"hint":"Text component to show status"}
// @input Component.Text resultText {"hint":"Text component to show results"}
//@input SceneObject UIRiseShrink
//@input SceneObject HaloLines1
//@input float fallbackSeconds = 10 {"hint": "Advance automatically if nobody says 'rise' within this many seconds. In Collective on glasses the mic is blocked, so this is the only path there."}

var isListening = false;
var options;
var isRiseTriggered = false;
var voiceRiseTriggered = false;
var voiceRiseTimeout = null;
var fallbackTimeout = null; // New: fallback timer

function initialize() {
    // Create ASR transcription options
    options = AsrModule.AsrTranscriptionOptions.create();
    
    // Configure options
    options.silenceUntilTerminationMs = 2000; // Stop after 2 seconds of silence
    options.mode = AsrModule.AsrMode.HighAccuracy; // Use high accuracy mode
    
    // Set up event handlers
    options.onTranscriptionUpdateEvent.add(onTranscriptionUpdate);
    options.onTranscriptionErrorEvent.add(onTranscriptionError);
    
    updateStatus("Ready ");
    print("ASR module initialized successfully");
    
    // Auto-start listening when initialized
    print("*** AUTO-STARTING VOICE LISTENING ***");
    startListening();
    
    // Start the 10-second fallback timer
    startFallbackTimer();
}

function startFallbackTimer() {
    print("*** STARTING " + script.fallbackSeconds + "-SECOND FALLBACK TIMER ***");
    
    if (fallbackTimeout) {
        fallbackTimeout.enabled = false; // Cancel any existing timer
    }
    
    fallbackTimeout = script.createEvent("DelayedCallbackEvent");
    fallbackTimeout.bind(function() {
        if (!voiceRiseTriggered) {
            print("*** 10-SECOND FALLBACK TRIGGERED - No 'rise' command detected ***");
            updateStatus("Timeout - Auto-advancing...");
            updateResult("⏰ Auto-advancing after 10 seconds");
            
            // Trigger the rise command automatically
            isRiseTriggered = true;
            handleRiseCommand();
        } else {
            print("*** Fallback timer expired but rise already triggered ***");
        }
    });
    fallbackTimeout.reset(script.fallbackSeconds);
}

function onTranscriptionUpdate(eventArgs) {
    var text = eventArgs.text;
    var isFinal = eventArgs.isFinal;
    
    print("*** TRANSCRIPTION RECEIVED ***");
    print(`Transcription: "${text}", isFinal: ${isFinal}`);
    
    // Show the transcription result
    updateResult(`Heard: "${text}"`);
    
    // Check for "rise" command in the transcription
    checkForRiseCommand(text, isFinal);
}

function onTranscriptionError(errorCode) {
    print(`ASR Error: ${errorCode}`);
    isListening = false;
    
    switch (errorCode) {
        case AsrModule.AsrStatusCode.InternalError:
            updateStatus("Error: Internal Error");
            break;
        case AsrModule.AsrStatusCode.Unauthenticated:
            updateStatus("Error: Unauthenticated");
            break;
        case AsrModule.AsrStatusCode.NoInternet:
            updateStatus("Error: No Internet");
            break;
        default:
            updateStatus("Error: " + errorCode);
    }
}

function checkForRiseCommand(text, isFinal) {
    // Convert to lowercase for checking
    var lowerText = text.toLowerCase();
    
    // List of words that should trigger the "rise" command
    var riseWords = ["rise", "raise", "up", "lift", "elevate", "ascend", "rice", "surprise", "five", "hi", "razz", "fries","race", "rind","right","guys","ride","slide","arise"];
    
    // Check if any rise words are in the transcription
    for (var i = 0; i < riseWords.length; i++) {
        if (lowerText.includes(riseWords[i])) {
            print(`RISE command detected! Triggered by: "${riseWords[i]}"`);
            updateResult(`🔥 RISE command activated!`);
            
            // Cancel the fallback timer since we detected the command
            cancelFallbackTimer();
            
            isRiseTriggered = true;
            // Add your custom logic here when "rise" is detected
            handleRiseCommand();
            
            // Optionally stop listening after detecting the command
            if (isFinal) {
                stopListening();
            }
            break;
        }
    }
}

function cancelFallbackTimer() {
    if (fallbackTimeout) {
        print("*** CANCELING FALLBACK TIMER - Voice command detected ***");
        fallbackTimeout.enabled = false;
        fallbackTimeout = null;
    }
}

function handleRiseCommand() {
    print("🔥 RISE COMMAND TRIGGERED! 🔥");
    // shrink the Rise UI
    script.UIRiseShrink.enabled = true;
    script.HaloLines1.enabled = true;
    
    if (voiceRiseTriggered) {
        print("*** Rise already triggered from voice - ignoring duplicate ***");
        return;
    }

    if (isRiseTriggered) {
        // Any player's "rise" advances everyone right away (solo or Collective).
        // GameManager ignores the event if another player already triggered it.
        var solo = global.isSinglePlayerMode ? global.isSinglePlayerMode() : true;
        print((solo ? "SOLO" : "COLLECTIVE") + " rise - advancing");
        voiceRiseTriggered = true;
        callSendAncestorsRise();
        isRiseTriggered = false; // Reset the detection flag
    }
}

function callSendAncestorsRise() {
    if (typeof global.sendAncestorsRise === 'function') {
        print("*** CALLING global.sendAncestorsRise() ***");
        global.sendAncestorsRise();
    } else {
        print("ERROR: global.sendAncestorsRise function not found");
    }
    
    // Cancel any pending timeout since we triggered
    if (voiceRiseTimeout) {
        voiceRiseTimeout.enabled = false;
        voiceRiseTimeout = null;
    }
    
    // Also cancel the fallback timer
    cancelFallbackTimer();
}

function startListening() {
    if (!isListening) {
        try {
            isListening = true;
            updateStatus("Starting transcription...");
            
            print("*** ATTEMPTING TO START ASR ***");
            asrModule.startTranscribing(options);
            print("*** ASR START COMMAND SENT ***");
            
            updateStatus("Listening... Say 'rise' or similar");
            print("ASR transcription started");
            
        } catch (error) {
            isListening = false;
            print("*** ERROR STARTING ASR: " + error + " ***");
            updateStatus("Error starting: " + error);
        }
    } else {
        print("*** ASR ALREADY LISTENING ***");
    }
}

function stopListening() {
    if (isListening) {
        asrModule
            .stopTranscribing()
            .then(function () {
                isListening = false;
                updateStatus("Stopped listening");
                print("ASR transcription stopped successfully");
            })
            .catch(function (error) {
                print("Error stopping ASR: " + error);
                isListening = false;
                updateStatus("Error stopping");
            });
    }
}

// UI update functions
function updateStatus(message) {
    if (script.statusText) {
        script.statusText.text = message;
    }
    print("Status: " + message);
}

function updateResult(message) {
    if (script.resultText) {
        script.resultText.text = message;
    }
    print("Result: " + message);
}

// Touch event to manually start/stop listening
function createTouchEvent() {
    var touchEvent = script.createEvent("TapEvent");
    touchEvent.bind(function() {
        if (isListening) {
            stopListening();
        } else {
            startListening();
        }
    });
}

// Clean up function to cancel timers
function cleanup() {
    cancelFallbackTimer();
    if (voiceRiseTimeout) {
        voiceRiseTimeout.enabled = false;
        voiceRiseTimeout = null;
    }
}

// Initialize everything
initialize();

// Create touch controls
//createTouchEvent();

// Public functions you can call from other scripts
script.startListening = startListening;
script.stopListening = stopListening;
script.isListening = function() { return isListening; };
script.cleanup = cleanup;