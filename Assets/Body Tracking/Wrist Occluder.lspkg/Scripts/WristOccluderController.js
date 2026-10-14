// -----JS CODE-----
// WristOccluderController.js
// Version: 1.0.0
// Event: OnAwake
// Description: Controls the thickness of the Wrist Occluder as well as the Wrist Occluder Shadow

//@input Component.RenderMeshVisual wristOccluder;
var wristOccluder = script.wristOccluder;
//@input Component.RenderMeshVisual wristOccluderShadow;
var wristOccluderShadow = script.wristOccluderShadow;
//@ui {"widget":"separator"}
//@input float blendShape = 0.5 {"label":"Thickness", "widget":"slider", "min":0.0, "max":1.0, "step":0.01};
var blendShape = script.blendShape;

function isHierarchyValid() {
    if (wristOccluder !== null && wristOccluderShadow !== null) {
        return true;
    }
    else {
        if (wristOccluder == null) {
            print("Error: Make sure that Wrist Occluder input is set properly.");
        }
        if (wristOccluderShadow == null) {
            print("Error: Make sure that Wrist Occluder shadow input is set properly.");
        }
        return false;
    }
}

function init() {
    if (!isHierarchyValid) {
        return;
    }
    wristOccluder.setBlendShapeWeight("Thickness", blendShape);
    wristOccluderShadow.setBlendShapeWeight("Thickness", blendShape);
}

init();