import { Scene } from 'phaser';
import { Theme, PixelLabel, PixelButton, PixelPanel } from '../ui/index.js';
import { FONT_KEY } from '../ui/PixelFont.js';
import { finalizeCaptureScene } from '../systems/CaptureSupport.js';
import { LayoutEditor } from '../systems/LayoutEditor.js';
import { SceneCrt } from '../rendering/SceneCrt.js';
import { SceneDust } from '../rendering/SceneDust.js';
import { SYNERGY_ICONS, getSynergyTiers } from '../config/synergy-icons.js';
import { loadSynergyIcons } from '../systems/AssetLoaders.js';

const FACTION_ORDER = ['Robot', 'Undead', 'Beast', 'Fantasy', 'Tribal', 'Folk', 'Monster'];
const CLASS_ORDER   = ['Ancient', 'Assassin', 'Berserker', 'Grunt', 'Gunner', 'Knight', 'Tank'];

// ROW BUDGET: 16 entries max at 20px row height + 3 headers × 14px + 4px top inset
// + 2 × 4px section gaps = 374px. Fits in the 379px titled-PixelPanel content area
// at h=420 (panelH - contentOffsetY 25 - spacingMedium*2). Adding a 17th entry overflows.
const SECTIONS = [
  { title: 'FACTIONS', entries: FACTION_ORDER.map((tag) => ({ id: `fac:${tag}`, tag, kind: 'faction' })) },
  { title: 'CLASSES',  entries: CLASS_ORDER.map((tag)   => ({ id: `cls:${tag}`, tag, kind: 'class'   })) },
  { title: 'OVERVIEW', entries: [
    { id: 'ovr:commanders', tag: 'Commanders', kind: 'overview' },
    { id: 'ovr:merchants',  tag: 'Merchants',  kind: 'overview' },
  ] },
];

const ROW_HEIGHT    = 20;
const HEADER_HEIGHT = 14;
const SECTION_GAP   = 4;
const TOP_INSET     = 4;
const ICON_GUTTER   = 22; // icon 16 + 6 gap; overview rows leave this empty so names align
const DEFAULT_ID    = 'fac:Robot';
const TIER_LABEL_X  = 110;         // body-local x for the bonus label column (left of threshold at 24)
const BODY_PAD_X    = 12;          // left/right inset for body prose inside body container

// Overview prose — m5x7 is ASCII 32-126 only, so no em-dashes / unicode punctuation.
// Runtime-accurate per MerchantSelectScene.js:17 and BattleScene.js:1149.
const OVERVIEW_TEXT = {
  'ovr:commanders': [
    'You pick a commander at the start of every run. They lead your team and grant a flat, battle-start buff to every unit you field.',
    'Three buffs in the pool right now - one rolls per commander: +1 ATK and +1 HP to all, +2 HP to all, or +2 ATK to all.',
    'Roster: 25 commanders, each with unique art.',
  ],
  'ovr:merchants': [
    'Once you hit 3 wins, one merchant joins your run for good. You pick from three and they staff the shop for every round after.',
    'Every merchant FAVORS a faction or class. The favored tag counts as one extra member of that tag on your team at battle start, so thresholds trigger with one fewer unit and scaling bonuses earn an extra tier.',
    'The six merchants and their favored tags: Wandering Trader (Robot), Skull Trader (Monster), Fruit Vendor (Folk), Bread Vendor (Knight), Fortune Teller (Ancient), Mushroom Dealer (Assassin).',
    'Selling is always on - drag any unit onto the merchant zone for 1 credit, whether a merchant has been hired yet or not.',
  ],
};

const KIND_LABEL = { faction: 'FACTION', class: 'CLASS', overview: 'OVERVIEW' };

export class RulesScene extends Scene {
  constructor() {
    super('Rules');
  }

  preload() {
    loadSynergyIcons(this);
  }

  create() {
    const { width, height } = this.cameras.main;
    console.log(`[Rules] Creating rules scene (${width}x${height})`);

    SceneCrt.attach(this, 'strongUi');
    SceneDust.attach(this, 'settings');

    // --- Title + subtitle ---
    const title = new PixelLabel(this, width / 2, 14, 'FACTIONS & CLASSES', {
      scale: 4, color: 'accent', align: 'center',
    });
    LayoutEditor.register(this, 'title', title, width / 2, 14);

    const subtitle = new PixelLabel(
      this, width / 2, 54,
      'hover a synergy to preview - click to pin',
      { scale: 2, color: 'muted', align: 'center' },
    );
    LayoutEditor.register(this, 'subtitle', subtitle, width / 2, 54);

    // Decorative title divider (unregistered).
    const divider = this.add.graphics();
    divider.lineStyle(1, Theme.panelBorder, 0.6);
    divider.lineBetween(width * 0.08, 76, width * 0.92, 76);

    // --- State ---
    this._lockedId = DEFAULT_ID;
    this._hoverId  = null;
    this._rows     = [];

    // --- Panels ---
    this._listPanel = new PixelPanel(this, 20, 88, 260, 420, { title: 'SYNERGIES' });
    LayoutEditor.register(this, 'listPanel', this._listPanel, 20, 88);

    this._detailPanel = new PixelPanel(this, 296, 88, 644, 420, { title: 'DETAIL' });
    LayoutEditor.register(this, 'detailPanel', this._detailPanel, 296, 88);

    // Scroll state for the detail body — populated by _renderOverview when content overflows.
    // Shape: { text, scrollY, maxScroll, viewportH, thumb, trackY, thumbTravel } or null.
    this._scrollState = null;
    this._lastRenderedId = null;

    this._buildList();
    this._renderDetail(this._activeId());

    // --- Keyboard ---
    this.input.keyboard.on('keydown-ESC', () => {
      if (this._lockedId) {
        console.log(`[Rules] ESC unlock - was locked on ${this._lockedId}`);
        this._lockedId = null;
        this._refreshRowStyles();
        this._renderDetail(this._activeId());
      }
    });

    this.input.keyboard.on('keydown-DOWN',     () => this._scrollBy(20));
    this.input.keyboard.on('keydown-UP',       () => this._scrollBy(-20));
    this.input.keyboard.on('keydown-PAGE_DOWN', () => this._scrollBy(this._scrollState?.viewportH ?? 100));
    this.input.keyboard.on('keydown-PAGE_UP',   () => this._scrollBy(-(this._scrollState?.viewportH ?? 100)));

    // Mouse wheel — scroll the overview body when content overflows. No-op otherwise.
    this.input.on('wheel', (_pointer, _gameObjects, _dx, dy) => {
      if (!this._scrollState) return;
      this._scrollBy(dy);
    });

    // --- Back button ---
    const backBtn = new PixelButton(this, width / 2, height - 28, 'BACK', () => {
      console.log('[Rules] Back - returning to Menu');
      this.scene.start('Menu');
    }, { style: 'filled', scale: 2, bg: Theme.error, pill: true, width: 110, height: 28 });
    LayoutEditor.register(this, 'backBtn', backBtn, width / 2, height - 28);

    this.events.once('shutdown', () => {
      console.log('[Rules] Shutdown - unregistering layout');
      this._clearScrollState();
      LayoutEditor.unregisterScene('Rules');
    });

    console.log('[Rules] Scene created successfully');
    finalizeCaptureScene('Rules');
  }

  _activeId() {
    return this._hoverId ?? this._lockedId ?? SECTIONS[0].entries[0].id;
  }

  _buildList() {
    const bounds = this._listPanel.getContentBounds();
    const ox = bounds.x;
    const oy = bounds.y;
    const cw = bounds.width;

    let y = TOP_INSET;
    let first = true;

    for (const section of SECTIONS) {
      if (!first) y += SECTION_GAP;
      first = false;

      const header = this.add.bitmapText(ox, oy + y, FONT_KEY, section.title, 14)
        .setTint(Theme.warning);
      this._listPanel.add(header);
      y += HEADER_HEIGHT;

      for (const entry of section.entries) {
        this._buildRow(entry, ox, oy + y, cw);
        y += ROW_HEIGHT;
      }
    }

    console.log(`[Rules] Built list: ${this._rows.length} rows across ${SECTIONS.length} sections`);
  }

  _buildRow(entry, x, y, width) {
    const row = { ...entry, x, y, width };

    row.band = this.add.rectangle(x, y, width, ROW_HEIGHT, Theme.focusBand)
      .setOrigin(0, 0).setAlpha(0);
    this._listPanel.add(row.band);

    const iconKey = SYNERGY_ICONS[entry.tag]?.textureKey;
    if (entry.kind !== 'overview' && iconKey && this.textures.exists(iconKey)) {
      row.icon = this.add.image(x, y + 2, iconKey)
        .setOrigin(0, 0).setDisplaySize(16, 16);
      this._listPanel.add(row.icon);
    }

    row.text = null;
    this._refreshRowText(row);

    row.hit = this.add.rectangle(x, y, width, ROW_HEIGHT, 0x000000, 0)
      .setOrigin(0, 0).setInteractive({ useHandCursor: true });
    this._listPanel.add(row.hit);

    row.hit.on('pointerover', () => {
      this._hoverId = entry.id;
      this._refreshRowStyles();
      this._renderDetail(this._activeId());
    });
    row.hit.on('pointerout', () => {
      if (this._hoverId === entry.id) this._hoverId = null;
      this._refreshRowStyles();
      this._renderDetail(this._activeId());
    });
    row.hit.on('pointerdown', () => {
      this._lockedId = (this._lockedId === entry.id) ? null : entry.id;
      console.log(`[Rules] select id=${entry.id} locked=${this._lockedId === entry.id}`);
      this._refreshRowStyles();
      this._renderDetail(this._activeId());
    });

    this._rows.push(row);
  }

  _refreshRowText(row) {
    const isLocked = this._lockedId === row.id;
    const isHover  = !isLocked && this._hoverId === row.id;

    const base = row.tag.toUpperCase();
    let label = base;
    if (isLocked)      label = `> ${base} <`;
    else if (isHover)  label = `> ${base}`;

    let tint = Theme.primaryText;
    if (isLocked)      tint = Theme.criticalText;
    else if (isHover)  tint = Theme.hover;

    if (row.text) row.text.destroy();
    const textX = row.x + ICON_GUTTER;
    row.text = this.add.bitmapText(textX, row.y + 3, FONT_KEY, label, 14).setTint(tint);
    this._listPanel.add(row.text);

    if (isLocked) {
      row.band.setFillStyle(Theme.selection).setAlpha(0.55);
    } else if (isHover) {
      row.band.setFillStyle(Theme.focusBand).setAlpha(0.35);
    } else {
      row.band.setAlpha(0);
    }
  }

  _refreshRowStyles() {
    for (const row of this._rows) this._refreshRowText(row);
  }

  _renderDetail(id) {
    // Skip rebuild if we're already showing this id — preserves scroll position
    // through hover-in/hover-out wobble on the locked row.
    if (this._lastRenderedId === id) return;
    this._lastRenderedId = id;

    // Clean up the previous scroll state's external resources (offscreen text
    // labels and the DynamicTexture). The body container's own children are
    // destroyed below when we destroy the container.
    this._clearScrollState();

    if (this._innerHeader)   { this._innerHeader.destroy(true); this._innerHeader = null; }
    if (this._bodyContainer) { this._bodyContainer.destroy(true); this._bodyContainer = null; }

    const bounds = this._detailPanel.getContentBounds();
    const cx = bounds.x;
    const cy = bounds.y;

    const row = this._rows.find((r) => r.id === id);
    if (!row) {
      console.warn(`[Rules] _renderDetail - unknown id ${id}`);
      return;
    }

    this._innerHeader = this.add.container(cx, cy);
    this._detailPanel.add(this._innerHeader);

    const iconKey = SYNERGY_ICONS[row.tag]?.textureKey;
    if (row.kind !== 'overview' && iconKey && this.textures.exists(iconKey)) {
      const icon = this.add.image(12, 12, iconKey).setOrigin(0, 0).setDisplaySize(48, 48);
      this._innerHeader.add(icon);
    }

    const displayName = (SYNERGY_ICONS[row.tag]?.displayName ?? row.tag).toUpperCase();
    const nameLabel = this.add.bitmapText(72, 10, FONT_KEY, displayName, 28)
      .setTint(Theme.criticalText);
    this._innerHeader.add(nameLabel);

    const kind = this.add.bitmapText(72, 50, FONT_KEY, KIND_LABEL[row.kind] ?? '', 14)
      .setTint(Theme.mutedText);
    this._innerHeader.add(kind);

    const hdrDivider = this.add.graphics();
    hdrDivider.lineStyle(1, Theme.panelBorder, 0.6);
    hdrDivider.lineBetween(0, 70, bounds.width, 70);
    this._innerHeader.add(hdrDivider);

    this._bodyContainer = this.add.container(cx, cy + 84);
    this._detailPanel.add(this._bodyContainer);

    // Pixel-based wrap widths — use Phaser BitmapText's setMaxWidth so we don't
    // have to guess char-advance for m5x7 (which varies from what scale-based
    // math predicts). bounds.width is the real content width from PixelPanel.
    this._proseMaxW = bounds.width - BODY_PAD_X * 2;
    this._tierLabelMaxW = bounds.width - TIER_LABEL_X - BODY_PAD_X;

    // Body viewport height — from body container's local origin down to the
    // bottom of the panel's content area, minus a small bottom inset.
    // bounds.y + bounds.height is the bottom of the panel content (panel-local).
    // bodyContainer is at cy + 84 (panel-local), so available = bottom - (cy+84).
    const BODY_BOTTOM_INSET = 6;
    this._bodyViewportH = (bounds.y + bounds.height) - (cy + 84) - BODY_BOTTOM_INSET;

    if (row.kind === 'overview') {
      this._renderOverview(row.id);
    } else {
      const tiers = getSynergyTiers(row.tag);
      if (tiers.length > 0) {
        this._renderTiers(tiers);
      } else {
        const desc = SYNERGY_ICONS[row.tag]?.description;
        if (desc) this._renderDescription(desc);
        else this._renderNoSynergy();
      }
    }
  }

  _renderTiers(tiers) {
    let y = 8;
    const rowGap = 8;
    tiers.forEach((tier) => {
      const thr = this.add.bitmapText(24, y, FONT_KEY, `${tier.threshold}+`, 14)
        .setTint(Theme.warning);
      const bonus = this.add.bitmapText(TIER_LABEL_X, y, FONT_KEY, tier.label, 14)
        .setTint(Theme.primaryText);
      bonus.setMaxWidth(this._tierLabelMaxW);
      bonus.setLineSpacing(2);
      this._bodyContainer.add(thr);
      this._bodyContainer.add(bonus);
      const h = Math.max(20, bonus.height + 2);
      y += h + rowGap;
    });
  }

  _renderDescription(text) {
    const label = this.add.bitmapText(BODY_PAD_X, 8, FONT_KEY, text, 14)
      .setTint(Theme.primaryText);
    label.setMaxWidth(this._proseMaxW);
    label.setLineSpacing(2);
    this._bodyContainer.add(label);
  }

  _renderNoSynergy() {
    const label = this.add.bitmapText(
      BODY_PAD_X, 8, FONT_KEY,
      'No synergy yet. Units with this tag fight without a team bonus.',
      14,
    ).setTint(Theme.mutedText);
    label.setMaxWidth(this._proseMaxW);
    label.setLineSpacing(2);
    this._bodyContainer.add(label);
  }

  _renderOverview(id) {
    const paragraphs = OVERVIEW_TEXT[id] ?? [];

    const TOP_INSET_PX = 8;
    const viewportW = this._proseMaxW;
    const viewportH = this._bodyViewportH - TOP_INSET_PX;

    // Build paragraph BitmapTexts at scene root, positioned at (0, 0). They
    // need to live within the main camera's visible region so they don't get
    // culled by the DynamicTexture's internal draw. We hide them from the
    // main camera via cameras.main.ignore() — DynamicTexture has its own
    // internal camera, so the ignore flag doesn't affect dt.draw.
    const labels = [];
    let yAccum = 0;
    paragraphs.forEach((para, i) => {
      const lbl = this.add.bitmapText(0, 0, FONT_KEY, para, 14)
        .setTint(Theme.primaryText);
      lbl.setMaxWidth(viewportW);
      lbl.setLineSpacing(2);
      this.cameras.main.ignore(lbl);
      labels.push({ text: lbl, paraY: yAccum, height: lbl.height });
      yAccum += lbl.height + (i < paragraphs.length - 1 ? 10 : 0);
    });
    const contentH = yAccum;

    // DynamicTexture sized to the viewport. We re-draw it on every scroll
    // change, offsetting paragraph y positions by -scrollY so the texture
    // always shows the visible window. UV-based — no glScissor side effects.
    const textureKey = `_rules_ov_${id.replace(/[^\w]/g, '_')}_${Math.floor(Math.random() * 1e9)}`;
    const dt = this.textures.addDynamicTexture(textureKey, viewportW, viewportH);

    const drawProse = (scrollY) => {
      dt.clear();
      for (const item of labels) {
        const targetY = item.paraY - scrollY;
        if (targetY + item.height < 0) continue; // entirely above viewport
        if (targetY > viewportH) continue;       // entirely below viewport
        dt.draw(item.text, 0, targetY);
      }
      dt.render();
    };
    drawProse(0);

    const img = this.add.image(BODY_PAD_X, TOP_INSET_PX, textureKey).setOrigin(0, 0);
    this._bodyContainer.add(img);

    const maxScroll = Math.max(0, contentH - viewportH);
    console.log(`[Rules] Overview ${id}: contentH=${contentH} viewportH=${viewportH} maxScroll=${maxScroll}`);

    const scrollState = {
      drawProse,
      labels,
      textureKey,
      image: img,
      scrollY: 0,
      maxScroll,
      viewportH,
      thumb: null,
      trackY: 0,
      thumbTravel: 0,
    };

    if (maxScroll > 0) {
      const trackW  = 3;
      const trackX  = viewportW + BODY_PAD_X + 4;
      const trackY  = TOP_INSET_PX;
      const trackH  = viewportH;

      const track = this.add.rectangle(trackX, trackY, trackW, trackH, Theme.panelBorder, 0.5)
        .setOrigin(0, 0);
      this._bodyContainer.add(track);

      const thumbH = Math.max(20, Math.floor(trackH * (viewportH / contentH)));
      const thumb = this.add.rectangle(trackX, trackY, trackW, thumbH, Theme.accent, 0.9)
        .setOrigin(0, 0);
      this._bodyContainer.add(thumb);

      scrollState.thumb = thumb;
      scrollState.trackY = trackY;
      scrollState.thumbTravel = trackH - thumbH;
    }

    this._scrollState = scrollState;
  }

  _scrollBy(dy) {
    const s = this._scrollState;
    if (!s || s.maxScroll <= 0) return;
    const next = Math.max(0, Math.min(s.maxScroll, s.scrollY + dy));
    if (next === s.scrollY) return;
    s.scrollY = next;
    s.drawProse(next);
    if (s.thumb && s.thumbTravel > 0) {
      s.thumb.y = s.trackY + (s.scrollY / s.maxScroll) * s.thumbTravel;
    }
  }

  _clearScrollState() {
    const s = this._scrollState;
    if (!s) return;
    if (Array.isArray(s.labels)) {
      for (const item of s.labels) {
        if (item.text && item.text.destroy) item.text.destroy();
      }
    }
    if (s.textureKey && this.textures.exists(s.textureKey)) {
      this.textures.remove(s.textureKey);
    }
    this._scrollState = null;
  }
}
