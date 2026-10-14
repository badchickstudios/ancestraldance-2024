// Add this as a separate behavior script just for debugging
//@input Component.Text distanceText
//@input SceneObject handObject
//@input SceneObject targetObject


function update() {
    if (script.handObject && script.targetObject) {
        var handPos = script.handObject.getTransform().getWorldPosition();
        var targetPos = script.targetObject.getTransform().getWorldPosition();
        
        var distance = handPos.distance(targetPos);
        
        if (script.distanceText) {
            script.distanceText.text = "Distance: " + distance.toFixed(2);
        }
        
        print("Current distance: " + distance.toFixed(2));
    }
}

script.createEvent("UpdateEvent").bind(update);