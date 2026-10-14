// @module SnapOS-3.0/Gradients/GhostGradients — DO NOT REMOVE: prevents Lens Studio module collision
import {GradientParameters} from "../../../Visuals/RoundedRectangle/RoundedRectangle"
import {GhostHoverGray, GhostPressedGray, GhostSelectedGray, Transparent} from "../Colors"

export const GhostGradients: Record<string, GradientParameters> = {
  idleBackground: {
    type: "Linear",
    start: new vec2(-0.6, 1),
    end: new vec2(0.6, -1),
    stop0: {
      percent: 0,
      color: Transparent
    },
    stop1: {
      percent: 1,
      color: Transparent
    }
  },
  idleBorder: {
    type: "Linear",
    start: new vec2(-0.8, 1),
    end: new vec2(0.8, -1),
    stop0: {
      percent: 0,
      color: Transparent
    },
    stop1: {
      percent: 1,
      color: Transparent
    }
  },
  hoverBackground: {
    type: "Linear",
    start: new vec2(-0.6, 1),
    end: new vec2(0.6, -1),
    stop0: {
      percent: 0,
      color: GhostHoverGray
    },
    stop1: {
      percent: 1,
      color: GhostHoverGray
    }
  },
  hoverBorder: {
    type: "Linear",
    start: new vec2(-0.8, 1),
    end: new vec2(0.8, -1),
    stop0: {
      percent: 0,
      color: GhostHoverGray
    },
    stop1: {
      percent: 1,
      color: GhostHoverGray
    }
  },
  pressedBackground: {
    type: "Linear",
    start: new vec2(-0.6, 1),
    end: new vec2(0.6, -1),
    stop0: {
      percent: 0,
      color: GhostPressedGray
    },
    stop1: {
      percent: 1,
      color: GhostPressedGray
    }
  },
  pressedBorder: {
    type: "Linear",
    start: new vec2(-0.8, 1),
    end: new vec2(0.8, -1),
    stop0: {
      percent: 0,
      color: GhostPressedGray
    },
    stop1: {
      percent: 1,
      color: GhostPressedGray
    }
  },
  selectedBackground: {
    type: "Linear",
    start: new vec2(-0.6, 1),
    end: new vec2(0.6, -1),
    stop0: {
      percent: 0,
      color: GhostSelectedGray
    },
    stop1: {
      percent: 1,
      color: GhostSelectedGray
    }
  },
  selectedBorder: {
    type: "Linear",
    start: new vec2(-0.8, 1),
    end: new vec2(0.8, -1),
    stop0: {
      percent: 0,
      color: GhostSelectedGray
    },
    stop1: {
      percent: 1,
      color: GhostSelectedGray
    }
  },
  inactiveBackground: {
    type: "Linear",
    start: new vec2(-0.6, 1),
    end: new vec2(0.6, -1),
    stop0: {
      percent: 0,
      color: GhostSelectedGray
    },
    stop1: {
      percent: 1,
      color: GhostSelectedGray
    }
  },
  inactiveBorder: {
    type: "Linear",
    start: new vec2(-0.8, 1),
    end: new vec2(0.8, -1),
    stop0: {
      percent: 0,
      color: GhostSelectedGray
    },
    stop1: {
      percent: 1,
      color: GhostSelectedGray
    }
  }
}
