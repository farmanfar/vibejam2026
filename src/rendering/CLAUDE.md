# CLAUDE.md - rendering/

Rendering helpers for Phaser 4 scenes. This file documents the Aseprite path used by alpha-unit battle/shop/card art.

Alpha warriors are the only Aseprite-loader track in the repo — documented below. Metadata comes from `src/config/alpha-art.generated.json`.

Merchants use plain `this.load.spritesheet(...)` — they have only a looping idle and don't need Aseprite's tag machinery. See `src/config/merchants.js` and the merchant block in `BootScene.preload()` / `BootScene.create()`.

Commanders, blank cards, and legacy non-alpha portraits do not use the Aseprite loader either.

## Alpha Flow

`BootScene.preload()` loops `getAlphaWarriors()`, skips units without `hasPortrait`, and queues:

```js
this.load.aseprite(w.spriteKey, w.art.pngPath, w.art.dataPath)
```

`src/config/alpha-units.js` is the runtime join point:
- `alpha-units.generated.json` supplies unit/combat data.
- `alpha-art.generated.json` supplies atlas metadata (`spriteKey`, `pngPath`, `dataPath`, `displayScale`, `defaultTag`, `portraitFrame`, `tags`, `frameCount`, `animTagOverrides`).

`alpha-art.generated.json` is machine-written from `src/config/alpha-sprite-mapping.json` by `npm run alpha:sprites` (`scripts/import-alpha-sprites.mjs`). Never hand-edit:
- `src/config/alpha-art.generated.json`
- `public/assets/warriors/alpha/*.png`
- `public/assets/warriors/alpha/*.json`

## Portrait Frames

Portrait consumers do not talk to atlas frames directly. They all go through `getUnitPortraitRef(scene, unit, context)` in `UnitArt.js`:
- `BattleScene.create()`
- `ShopScene._drawTeamBench()`
- `WarriorCard`

The helper returns `{ key, frame }`. Keep `resolvePortraitFrameName(texture, portraitFrame)` intact.

Critical footgun: Phaser's Aseprite loader registers frames by filename string, not numeric frame index. Alpha atlases may also expose `__BASE`, which is the full packed PNG. Passing raw integer frames to `add.sprite` / `add.image` can miss the real frame and fall through to `__BASE`, producing a giant screen-covering card/battle sprite. The resolver matches the requested frame by numeric suffix first, then falls back through drawable frame names.

Recurring alpha footgun: do not blindly trust `portraitFrame: 0`. Several imported atlases have a blank, setup, or glitch frame at index `0`, while the real idle pose starts later in `meta.frameTags`. The visible symptom is a shop card portrait or bench thumbnail that looks tiny, empty, or corrupted even though battle animation wiring basically works. Recent offenders have included `glitch_samurai`, `minion_001`, and `slopper`.

When this happens:
- Inspect the cached Aseprite JSON via `scene.cache.json.get(spriteKey)`.
- Check `meta.frameTags` for `unit.art.defaultTag` and note that tag's `from` frame.
- Prefer the first frame of the default tag over a stale hard-coded `portraitFrame`.
- Do not patch `public/assets/warriors/alpha/*.json` or `alpha-art.generated.json` by hand; fix the runtime selection logic or regenerate from `src/config/alpha-sprite-mapping.json`.

If a unit has no baked atlas or the texture failed to load, `getUnitPortraitRef()` returns `warrior_placeholder_<tier>` with `frame: undefined`. `BootScene.preload()` generates those placeholders up front, and `loggedFallbacks` keeps the warning to one log per `${context}:${unitId}`.

## Animation Wiring

`BattleScene._wireAlphaAnimations(sprite, warrior, side)` is the battle-only animation setup:

```text
cache.json.get(spriteKey)
-> getAsepriteTagConfigs(spriteKey, asepriteData)
-> sprite.anims.create(config)
-> sprite.anims.play({ key: defaultTag, repeat: -1 })
```

Critical rule: alpha tag animations are created on the sprite's LOCAL animation manager via `sprite.anims.create(...)`, not the scene-global manager.

Reason: raw Aseprite tag names collide across units (`idle`, `attack`, `death`, `Idle`, `Attack`, etc.). A global registration would make one unit clobber another. The fallback path in `_wireAlphaAnimations()` uses:

```js
this.anims.createFromAseprite(warrior.spriteKey, null, sprite)
```

The third `sprite` arg is the important part; it routes the generated tag anims onto that sprite's local manager. Never use global `this.anims.createFromAseprite(key)` for alpha warriors.

`BattleScene._playActorAnim(instanceId, tag)` resolves semantic names through `warrior.art.animTagOverrides` before playback. Do not hardcode semantic-to-atlas tag mapping anywhere else. Real tags vary wildly (`IDle`, `Hit/Damage`, `Special Attack`, `Move/Idle`, etc.).

## Tag Config Builder

`getAsepriteTagConfigs(textureKey, data, tags = null)` in `AsepriteAnimations.js` converts cached Aseprite JSON into Phaser animation configs:
- reads `data.meta.frameTags`
- slices the matching `data.frames`
- preserves filename-based frame ids
- carries per-frame `duration`
- supports `forward`, `reverse`, and `pingpong` (`yoyo: true`)
- optionally filters to a subset of tag names

Behavior is covered by `src/rendering/__tests__/AsepriteAnimations.test.js`.

## Import Script

`npm run alpha:sprites` runs `scripts/import-alpha-sprites.mjs`. The script:
- reads `src/config/alpha-sprite-mapping.json`
- shells out to Aseprite CLI with `--sheet`, `--data`, `--format json-array`, `--list-tags`, and `--sheet-pack`
- optionally adds `--ignore-layer` and `--trim` from the mapping entry
- writes baked outputs to `public/assets/warriors/alpha/`
- writes `src/config/alpha-art.generated.json`

Change the mapping or source `.aseprite` files, then rerun `npm run alpha:sprites`. Do not patch generated outputs by hand.

## Call Path

```text
BootScene.preload()
-> load.aseprite(spriteKey, pngPath, dataPath)

BattleScene.create()
-> getUnitPortraitRef(...)
-> add.sprite(...)
-> _wireAlphaAnimations(...)
   -> cache.json.get(spriteKey)
   -> getAsepriteTagConfigs(...)
   -> sprite.anims.create(...)
   -> sprite.anims.play(...)
```

## Rules

- Use `this.load.aseprite(...)` for alpha warrior atlases. Do not load them as plain images.
- Always resolve battle/shop/card portrait frames through `getUnitPortraitRef()`.
- Keep alpha tag animations on the sprite-local manager.
- Always resolve semantic anim names through `animTagOverrides` before calling `sprite.anims.play(...)`.
- Preserve one-warning-per-unit fallback behavior.
- Merchants follow the same local-manager rule, but their metadata path is `src/config/merchants.js`, not `alpha-art.generated.json`.
