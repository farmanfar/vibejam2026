# CLAUDE.md — widgets/

Generic, reusable UI widgets. No imports from scene-specific modules (no commanders.js, no CaptureSupport, no scene navigation).

## Files

- **SelectionMenuWidget.js** — top-level widget class. Owns state, keyboard input, view transitions, and the UI overlay (header, prompt, back/confirm buttons). Composes the four other files.
- **SelectionMenuPresenter.js** — pure motion model. Defines `VIEWPOINTS` (x/y/scale/alpha per layer per view) and `BASE_SLOTS`. No Phaser imports. Edit here to adjust positions/timing.
- **SelectionMenuLayerBuilder.js** — builds the four Phaser containers (background, panel, featured, preview). Returns named refs (title, header, hitzone, displays, hotspot, etc.) back to the widget. All pointer callbacks injected — no widget dependency.
- **SelectionMenuFixture.js** — non-scene test data for the widget. Proves widget modularity (no commander or scene imports).

## SelectionMenuWidget — depth / layering rules

Layer depths are **view-driven**: the active (clicked) element always renders on top.

| View          | `preview` depth | `featured` depth | Why                                      |
|---------------|-----------------|------------------|------------------------------------------|
| `center`      | 4               | 5                | Dudes (featured) are default foreground  |
| `left`        | 4               | 5                | Same as center                           |
| `right`       | 4               | 5                | Same as center                           |
| `featuredClose` | 4             | 5                | Featured cards are the focus             |
| `previewClose`  | 5             | 4                | Battle Archive zoomed in — takes front   |

**Rule:** only `previewClose` flips depths. All other views keep featured on top.

Depth swap is applied in `_changeView()` immediately after the tween block (not at the end of the tween — instant transitions need it too). The `setItems()` method also respects the current view when recreating the featured container.

## SelectionMenuWidget — view IDs

`center` | `left` | `right` | `previewClose` | `featuredClose`

Advance (W/click): center → featuredClose or previewClose depending on `centerFocus`.  
Back (S/ESC/background click): any non-center → center.

## Adding a new use case

1. Create a new Scene that instantiates `SelectionMenuWidget` with a config object (see `CommanderSelectScene.js` as reference).
2. The widget handles all input, transitions, and LayoutEditor registration internally — the scene only needs to wire `actions` callbacks.
3. Do NOT subclass the widget. Use the config contract instead.

## Positions / layout

Edit `VIEWPOINTS` in `SelectionMenuPresenter.js` for x/y/scale/alpha per view. Runtime F2 editing is NOT available for widget internals (only the UI overlay elements — header, prompt, buttons — are registered with LayoutEditor).
