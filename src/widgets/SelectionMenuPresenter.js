/**
 * SelectionMenuPresenter — neutral motion model for SelectionMenuWidget.
 * Ported from TrophyRoomPresenter with all room-specific naming replaced.
 *
 * Layer slot keys: background, leftPanel, rightPanel, preview, featured, foreground
 * View IDs: center, left, right, previewClose, featuredClose
 */

const BASE_SLOTS = {
  background: { x: 480, y: 270, scale: 1,    alpha: 1   },
  leftPanel:  { x: 190, y: 278, scale: 0.88, alpha: 0.9 },
  rightPanel: { x: 770, y: 278, scale: 0.88, alpha: 0.9 },
  featured:   { x: 480, y: 326, scale: 1,    alpha: 1   },
  preview:    { x: 480, y: 180, scale: 1,    alpha: 1   },
  foreground: { x: 480, y: 490, scale: 1,    alpha: 1   },
}

export const WIDGET_VIEW_IDS = ['center', 'left', 'right', 'previewClose', 'featuredClose']

const VIEWPOINTS = {
  center: {
    duration: 280,
    prompt: 'Featured selection.',
    layers: {
      background: { x: 480, y: 270, scale: 1,    alpha: 1    },
      leftPanel:  { x: 176, y: 278, scale: 0.8,  alpha: 0.42 },
      rightPanel: { x: 784, y: 278, scale: 0.8,  alpha: 0.42 },
      featured:   { x: 480, y: 326, scale: 1,    alpha: 1    },
      preview:    { x: 480, y: 182, scale: 1,    alpha: 1    },
      foreground: { x: 480, y: 490, scale: 1,    alpha: 1    },
    },
  },
  left: {
    duration: 320,
    prompt: 'Left panel.',
    layers: {
      background: { x: 528, y: 274, scale: 1.04, alpha: 1    },
      leftPanel:  { x: 254, y: 280, scale: 1.22, alpha: 1    },
      rightPanel: { x: 842, y: 282, scale: 0.66, alpha: 0.42 },
      featured:   { x: 680, y: 334, scale: 0.74, alpha: 0.62 },
      preview:    { x: 694, y: 194, scale: 0.72, alpha: 0.54 },
      foreground: { x: 518, y: 494, scale: 1.02, alpha: 1    },
    },
  },
  right: {
    duration: 320,
    prompt: 'Right panel.',
    layers: {
      background: { x: 432, y: 274, scale: 1.04, alpha: 1    },
      leftPanel:  { x: 118, y: 282, scale: 0.66, alpha: 0.42 },
      rightPanel: { x: 706, y: 280, scale: 1.22, alpha: 1    },
      featured:   { x: 280, y: 334, scale: 0.74, alpha: 0.62 },
      preview:    { x: 266, y: 194, scale: 0.72, alpha: 0.54 },
      foreground: { x: 442, y: 494, scale: 1.02, alpha: 1    },
    },
  },
  previewClose: {
    duration: 360,
    prompt: 'Preview.',
    layers: {
      background: { x: 480, y: 284, scale: 1.06, alpha: 1    },
      leftPanel:  { x: 200, y: 294, scale: 0.72, alpha: 0.46 },
      rightPanel: { x: 760, y: 294, scale: 0.72, alpha: 0.46 },
      featured:   { x: 480, y: 362, scale: 0.74, alpha: 0.54 },
      preview:    { x: 480, y: 242, scale: 1.62, alpha: 1    },
      foreground: { x: 480, y: 512, scale: 1.04, alpha: 1    },
    },
  },
  featuredClose: {
    duration: 360,
    prompt: 'Featured items.',
    layers: {
      background: { x: 480, y: 278, scale: 1.03, alpha: 1   },
      leftPanel:  { x: 216, y: 290, scale: 0.78, alpha: 0.56 },
      rightPanel: { x: 744, y: 290, scale: 0.78, alpha: 0.56 },
      featured:   { x: 480, y: 404, scale: 1.56, alpha: 1    },
      preview:    { x: 480, y: 192, scale: 0.76, alpha: 0.7  },
      foreground: { x: 480, y: 522, scale: 1.06, alpha: 1    },
    },
  },
}

const PANEL_SLOT_ROWS    = [-154, -92, -30, 32, 94, 156]
const PANEL_SLOT_COLUMNS = [-44, 44]

export class SelectionMenuPresenter {
  constructor(width, height) {
    this.width  = width
    this.height = height
  }

  getViewpoint(viewId) {
    const selected = VIEWPOINTS[viewId] ?? VIEWPOINTS.center
    const layers   = {}

    for (const [slotId, defaults] of Object.entries(BASE_SLOTS)) {
      layers[slotId] = {
        x:     selected.layers[slotId]?.x     ?? defaults.x,
        y:     selected.layers[slotId]?.y     ?? defaults.y,
        scale: selected.layers[slotId]?.scale ?? defaults.scale,
        alpha: selected.layers[slotId]?.alpha ?? defaults.alpha,
      }
    }

    return {
      id:       viewId in VIEWPOINTS ? viewId : 'center',
      duration: selected.duration,
      prompt:   selected.prompt,
      layers,
    }
  }

  getPanelSlots(side) {
    const xBias = side === 'left' ? -6 : 6
    const slots = []

    for (let row = 0; row < PANEL_SLOT_ROWS.length; row++) {
      for (let col = 0; col < PANEL_SLOT_COLUMNS.length; col++) {
        slots.push({ x: PANEL_SLOT_COLUMNS[col] + xBias, y: PANEL_SLOT_ROWS[row] })
      }
    }

    return slots
  }

  getFeaturedSlots() {
    return [
      { x: -142, y: 0  },
      { x:    0, y: -16 },
      { x:  142, y: 0  },
    ]
  }
}
