/**
 * SelectionMenuFixture — non-commander test data for SelectionMenuWidget.
 *
 * Usage:
 *   import { FIXTURE_CONFIG } from '../widgets/SelectionMenuFixture.js'
 *   const widget = new SelectionMenuWidget(scene, FIXTURE_CONFIG)
 *
 * This file intentionally imports nothing from commanders.js, CaptureSupport,
 * or any scene-navigation logic, proving widget modularity.
 */

export const FIXTURE_CONFIG = {
  items: {
    featured: [
      { id: 'hero_a', name: 'Hero Alpha', subtitle: 'Starter'  },
      { id: 'hero_b', name: 'Hero Beta',  subtitle: 'Advanced' },
      { id: 'hero_c', name: 'Hero Gamma', subtitle: 'Elite'    },
    ],
    leftPanel:  Array.from({ length: 11 }, (_, i) => ({ id: `unit_l${i}`, name: `Unit L${i}`,  subtitle: `L-${i}` })),
    rightPanel: Array.from({ length: 11 }, (_, i) => ({ id: `unit_r${i}`, name: `Unit R${i}`,  subtitle: `R-${i}` })),
    preview:    [
      { id: 'hero_a', name: 'Hero Alpha' },
      { id: 'hero_b', name: 'Hero Beta'  },
    ],
  },
  text: {
    headerTitle: 'SELECT A UNIT',
    actionLabels: {
      back:           'BACK',
      confirm:        'CONFIRM',
      primary:        'SELECT',
      secondaryLeft:  'PREV',
      secondaryRight: 'NEXT',
    },
    regionTitles: {
      leftPanel:  'LEFT PANEL',
      rightPanel: 'RIGHT PANEL',
      preview:    'PREVIEW',
    },
  },
  visuals: {
    textureKeyForItem: (_item) => null,  // no real textures — falls back to placeholder rect
    labelForItem:      (item)  => item.name.toUpperCase(),
    subtitleForItem:   (item)  => item.subtitle ?? item.id,
  },
  actions: {
    onConfirm: (item, _state) => console.log('[Fixture] Confirmed:', item.id),
    onBack:    ()             => console.log('[Fixture] Back pressed'),
  },
  options: {
    initialView:    'center',
    initialFocus:   'featured',
    enableKeyboard: true,
    showLeftPanel:  true,
    showRightPanel: true,
    showPreview:    true,
  },
}
