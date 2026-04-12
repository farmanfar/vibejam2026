import { Scene } from 'phaser';
import {
  Theme, FONT_KEY, PixelButton, PixelLabel, PixelPanel, PixelTextInput,
} from '../ui/index.js';
import {
  clearUnitDefinitionsDraft,
  exportUnitDefinitionsJSON,
  getRepoUnitDefinitions,
  getUnitDefinitions,
  getUnitValidation,
  getWarriors,
  saveUnitDefinitionsDraft,
} from '../config/warriors.js';
import { finalizeCaptureScene } from '../systems/CaptureSupport.js';
import { getUnitTextureKey } from '../rendering/UnitArt.js';
import { LayoutEditor } from '../systems/LayoutEditor.js';
import { SceneCrt } from '../rendering/SceneCrt.js';

const PAGE_SIZE = 12;

function isNumericField(key) {
  return key === 'hp' || key === 'atk' || key === 'cost' || key === 'tier';
}

function toDisplayValue(value) {
  return value == null ? '' : String(value);
}

function parseFieldValue(key, value) {
  if (!isNumericField(key)) return value;
  if (value === '') return '';
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : value;
}

function printableAsciiFilter(ch) {
  return /^[\x20-\x7E]$/.test(ch);
}

function factionFilter(ch) {
  return /^[a-zA-Z \-]$/.test(ch);
}

function numberFilter(ch) {
  return /^[0-9]$/.test(ch);
}

function truncateText(text, maxChars) {
  const normalized = String(text ?? '').trim();
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, Math.max(0, maxChars - 3))}...`;
}

function wrapText(text, maxChars, maxLines = 3) {
  const normalized = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (!normalized) return '';

  const words = normalized.split(' ');
  const lines = [];
  let currentLine = '';

  for (const word of words) {
    const chunks = word.length > maxChars
      ? word.match(new RegExp(`.{1,${maxChars}}`, 'g')) ?? [word]
      : [word];

    for (const chunk of chunks) {
      const candidate = currentLine ? `${currentLine} ${chunk}` : chunk;
      if (candidate.length <= maxChars) {
        currentLine = candidate;
        continue;
      }

      if (currentLine) lines.push(currentLine);
      currentLine = chunk;

      if (lines.length >= maxLines) {
        const last = lines[maxLines - 1] ?? '';
        lines[maxLines - 1] = truncateText(last, maxChars);
        return lines.slice(0, maxLines).join('\n');
      }
    }
  }

  if (currentLine) lines.push(currentLine);
  return lines.slice(0, maxLines).join('\n');
}

export class UnitLabScene extends Scene {
  constructor() {
    super('UnitLab');
  }

  create() {
    // CRT post-process (softGameplay — interactive scene)
    SceneCrt.attach(this, 'softGameplay');

    this.definitions = getUnitDefinitions();
    this.filterText = '';
    this.page = 0;
    this.selectedId = this.definitions[0]?.id ?? null;
    this.listObjects = [];
    this.fieldInputs = {};
    this.previewSprite = null;
    this.statusMessage = null;

    this._refreshCaches();

    const { width, height } = this.cameras.main;

    const title = new PixelLabel(this, 18, 18, 'UNIT LAB', {
      scale: 3, color: 'accent',
    });
    LayoutEditor.register(this, 'unitLabTitle', title, 18, 18);

    const subtitle = new PixelLabel(this, 18, 46, 'Thin authoring for stats, costs, and flavor', {
      scale: 1, color: 'muted',
    });
    LayoutEditor.register(this, 'unitLabSubtitle', subtitle, 18, 46);

    this.summaryLabel = new PixelLabel(this, 18, 68, '', {
      scale: 1, color: 'muted',
    });

    this.statusLabel = new PixelLabel(this, width - 18, 68, '', {
      scale: 1, color: 'ambient', align: 'right',
    });

    this.leftPanel = new PixelPanel(this, 16, 92, 260, height - 108, { title: 'UNITS' });
    this.rightPanel = new PixelPanel(this, 292, 92, width - 308, height - 108, { title: 'UNIT DATA' });

    new PixelLabel(this, 28, 126, 'SEARCH', { scale: 2, color: 'muted' });
    this.searchInput = new PixelTextInput(this, 28, 148, {
      width: 236,
      height: 28,
      scale: 2,
      maxLength: 32,
      hintText: 'filter units...',
      charFilter: printableAsciiFilter,
      onChange: (text) => {
        this.statusMessage = null;
        this.filterText = text.trim().toLowerCase();
        this.page = 0;
        this._ensureValidSelection();
        this._renderList();
        this._renderSummary();
        this._renderDetailPane();
      },
    });

    this.prevPageBtn = new PixelButton(this, 28, height - 50, 'PREV', () => {
      if (this.page <= 0) return;
      this.page--;
      this._renderList();
    }, { style: 'filled', scale: 2, width: 90, height: 28, bg: Theme.accentDim });

    this.nextPageBtn = new PixelButton(this, 174, height - 50, 'NEXT', () => {
      const maxPage = Math.max(0, Math.ceil(this._getFilteredDefinitions().length / PAGE_SIZE) - 1);
      if (this.page >= maxPage) return;
      this.page++;
      this._renderList();
    }, { style: 'filled', scale: 2, width: 90, height: 28, bg: Theme.accentDim });

    this.pageLabel = new PixelLabel(this, 146, height - 48, '', {
      scale: 1, color: 'muted', align: 'center',
    });

    this.backBtn = new PixelButton(this, width - 86, 18, 'BACK', () => {
      this.scene.start('Menu');
    }, { style: 'filled', scale: 2, width: 72, height: 26, bg: Theme.panelBorder });

    this.exportBtn = new PixelButton(this, width - 192, 18, 'EXPORT', () => {
      this._exportDefinitions();
    }, { style: 'filled', scale: 2, width: 92, height: 26, bg: Theme.accent });

    this.resetBtn = new PixelButton(this, width - 298, 18, 'RESET', () => {
      this._resetDraft();
    }, { style: 'filled', scale: 2, width: 86, height: 26, bg: Theme.warning });

    this.unitNameLabel = new PixelLabel(this, 320, 124, '', {
      scale: 2, color: 'accent',
    });

    this.metaLabel = new PixelLabel(this, 320, 148, '', {
      scale: 1, color: 'ambient',
    });

    this.previewFrame = this.add.rectangle(372, 228, 96, 96, Theme.screenBg)
      .setOrigin(0.5)
      .setStrokeStyle(1, Theme.panelBorder);
    this.previewSprite = this.add.image(372, 228, 'warrior_placeholder_0').setScale(2.5);

    this.importStatusLabel = new PixelLabel(this, 320, 292, '', {
      scale: 1, color: 'muted',
    });

    this.fieldStatusLabel = new PixelLabel(this, 320, 316, '', {
      scale: 1, color: 'warning',
    });

    this._createField(new PixelLabel(this, 496, 170, 'HP', { scale: 1, color: 'muted' }), 'hp', 496, 188, {
      width: 72,
      charFilter: numberFilter,
      maxLength: 3,
    });
    this._createField(new PixelLabel(this, 588, 170, 'ATK', { scale: 1, color: 'muted' }), 'atk', 588, 188, {
      width: 72,
      charFilter: numberFilter,
      maxLength: 3,
    });
    this._createField(new PixelLabel(this, 680, 170, 'COST', { scale: 1, color: 'muted' }), 'cost', 680, 188, {
      width: 72,
      charFilter: numberFilter,
      maxLength: 2,
    });
    this._createField(new PixelLabel(this, 772, 170, 'TIER', { scale: 1, color: 'muted' }), 'tier', 772, 188, {
      width: 72,
      charFilter: numberFilter,
      maxLength: 1,
    });

    this._createField(new PixelLabel(this, 496, 240, 'FACTION', { scale: 1, color: 'muted' }), 'faction', 496, 258, {
      width: 220,
      charFilter: factionFilter,
      maxLength: 18,
    });

    this._createField(new PixelLabel(this, 496, 306, 'DEV COMMENT', { scale: 1, color: 'muted' }), 'devComment', 496, 324, {
      width: 362,
      scale: 1,
      height: 24,
      charFilter: printableAsciiFilter,
      maxLength: 72,
    });

    this._createField(new PixelLabel(this, 496, 374, 'FLAVOR TEXT', { scale: 1, color: 'muted' }), 'flavorText', 496, 392, {
      width: 362,
      scale: 1,
      height: 24,
      charFilter: printableAsciiFilter,
      maxLength: 96,
    });

    this.sourceLabel = new PixelLabel(this, 320, 438, '', {
      scale: 1, color: 'ambient',
    });

    this.autosaveLabel = new PixelLabel(this, 320, height - 38, 'Autosaves locally on every edit', {
      scale: 1, color: 'ambient',
    });

    this._ensureValidSelection();
    this._syncFieldsFromSelection();
    this._renderList();
    this._renderSummary();
    this._renderDetailPane();
    finalizeCaptureScene('UnitLab');

    this.events.once('shutdown', () => {
      LayoutEditor.unregisterScene('UnitLab');
      this.searchInput?.destroy();
      Object.values(this.fieldInputs).forEach((input) => input.destroy());
    });
  }

  _createField(_label, key, x, y, opts) {
    this.fieldInputs[key] = new PixelTextInput(this, x, y, {
      width: opts.width,
      height: opts.height ?? 28,
      scale: opts.scale ?? 2,
      maxLength: opts.maxLength,
      charFilter: opts.charFilter,
      onChange: (value) => {
        this._updateField(key, value);
      },
    });
  }

  _refreshCaches() {
    this.validation = getUnitValidation(this.definitions);
    this.runtimeUnits = getWarriors();
    this.runtimeById = new Map(this.runtimeUnits.map((unit) => [unit.id, unit]));
  }

  _getFilteredDefinitions() {
    const definitions = this.definitions ?? [];
    if (!this.filterText) return definitions;

    return definitions.filter((definition) => {
      const haystack = [
        definition.name,
        definition.id,
        definition.faction,
        definition.devComment,
        definition.flavorText,
      ].join(' ').toLowerCase();
      return haystack.includes(this.filterText);
    });
  }

  _ensureValidSelection() {
    const filtered = this._getFilteredDefinitions();
    if (filtered.length === 0) {
      this.selectedId = null;
      return;
    }

    if (!filtered.some((definition) => definition.id === this.selectedId)) {
      this.selectedId = filtered[0].id;
    }

    const selectedIndex = filtered.findIndex((definition) => definition.id === this.selectedId);
    const pageForSelection = Math.floor(Math.max(0, selectedIndex) / PAGE_SIZE);
    this.page = Math.max(0, pageForSelection);
  }

  _getSelectedDefinition() {
    return this.definitions.find((definition) => definition.id === this.selectedId) ?? null;
  }

  _setSelectedUnit(id) {
    this.selectedId = id;
    this._syncFieldsFromSelection();
    this._renderList();
    this._renderDetailPane();
  }

  _syncFieldsFromSelection() {
    const definition = this._getSelectedDefinition();
    if (!definition) return;

    for (const [key, input] of Object.entries(this.fieldInputs)) {
      input.setText(toDisplayValue(definition[key]));
    }
  }

  _updateField(key, rawValue) {
    const definition = this._getSelectedDefinition();
    if (!definition) return;

    definition[key] = parseFieldValue(key, rawValue);
    this.statusMessage = 'Draft updated locally';
    saveUnitDefinitionsDraft(this.definitions);
    this._refreshCaches();
    this._renderSummary();
    this._renderList();
    this._renderDetailPane();
  }

  _renderSummary() {
    const filtered = this._getFilteredDefinitions();
    const summary = this.validation.summary;
    this.summaryLabel.setText(
      `${filtered.length} visible  |  ${summary.readyArtCount}/${summary.total} art ready  |  ${summary.invalidFieldCount} invalid`,
    );

    if (this.statusMessage) {
      this.statusLabel.setText(this.statusMessage);
      return;
    }

    if (summary.missingArtCount > 0) {
      this.statusLabel.setText(`${summary.missingArtCount} units still need exported art`);
    } else {
      this.statusLabel.setText('All visible units have art');
    }
  }

  _renderList() {
    this.listObjects.forEach((object) => object.destroy());
    this.listObjects = [];

    const filtered = this._getFilteredDefinitions();
    const maxPage = Math.max(0, Math.ceil(filtered.length / PAGE_SIZE) - 1);
    this.page = Math.min(this.page, maxPage);

    const pageItems = filtered.slice(this.page * PAGE_SIZE, (this.page + 1) * PAGE_SIZE);
    const startY = 190;
    const rowHeight = 24;

    pageItems.forEach((definition, index) => {
      const y = startY + index * rowHeight;
      const runtimeUnit = this.runtimeById.get(definition.id);
      const validation = this.validation.byId[definition.id];
      const selected = definition.id === this.selectedId;
      const bgColor = selected ? Theme.focusBand : Theme.panelBg;
      const borderColor = selected ? Theme.accent : Theme.panelBorder;
      const textColor = validation?.artReady ? Theme.accent : Theme.primaryText;

      const rowBg = this.add.rectangle(28, y, 236, 20, bgColor)
        .setOrigin(0, 0)
        .setStrokeStyle(1, borderColor)
        .setInteractive({ useHandCursor: true });
      rowBg.on('pointerdown', () => this._setSelectedUnit(definition.id));

      const name = this.add.bitmapText(34, y + 4, FONT_KEY, truncateText(runtimeUnit?.name ?? definition.name, 19), 14)
        .setTint(textColor);

      const tag = this.add.bitmapText(256, y + 4, FONT_KEY, `${definition.tier ?? 0}`, 14)
        .setOrigin(1, 0)
        .setTint(validation?.requiredIssues?.length ? Theme.warning : Theme.mutedText);

      this.listObjects.push(rowBg, name, tag);
    });

    if (pageItems.length === 0) {
      const empty = new PixelLabel(this, 28, 194, 'No units match the current filter', {
        scale: 1, color: 'muted',
      });
      this.listObjects.push(empty);
    }

    this.pageLabel.setText(`${this.page + 1}/${Math.max(1, maxPage + 1)}`);
    this.prevPageBtn.setEnabled(this.page > 0);
    this.nextPageBtn.setEnabled(this.page < maxPage);
  }

  _renderDetailPane() {
    const definition = this._getSelectedDefinition();
    const runtimeUnit = definition ? this.runtimeById.get(definition.id) : null;

    if (!definition || !runtimeUnit) {
      this.unitNameLabel.setText('No unit selected');
      this.metaLabel.setText('');
      this.importStatusLabel.setText('');
      this.fieldStatusLabel.setText('');
      this.sourceLabel.setText('');
      this.previewSprite.setTexture('warrior_placeholder_0');
      return;
    }

    const validation = this.validation.byId[definition.id];
    const importStatus = runtimeUnit.importStatus ?? 'missing_generated_entry';
    const firstIssue = validation?.requiredIssues?.[0] ?? runtimeUnit.importErrors?.[0] ?? runtimeUnit.importWarnings?.[0] ?? '';

    this.unitNameLabel.setText(truncateText(runtimeUnit.name, 22));
    this.metaLabel.setText(`ID ${runtimeUnit.id} | ${runtimeUnit.faction || 'NO FACTION'} | T${runtimeUnit.tier}`);
    this.importStatusLabel.setText(`IMPORT ${importStatus.toUpperCase()} | ART ${runtimeUnit.hasPortrait ? 'READY' : 'MISSING'}`);
    this.fieldStatusLabel.setText(firstIssue ? wrapText(`CHECK ${firstIssue}`, 42, 2) : 'Fields look valid');

    const sourceParts = [
      runtimeUnit.source?.category ? `CAT ${truncateText(runtimeUnit.source.category, 42)}` : '',
      runtimeUnit.source?.pack ? `PACK ${truncateText(runtimeUnit.source.pack, 42)}` : '',
      runtimeUnit.source?.sourceDir ? `DIR ${truncateText(runtimeUnit.source.sourceDir.replaceAll('\\', '/'), 42)}` : '',
    ].filter(Boolean);
    this.sourceLabel.setText(sourceParts.join('\n'));

    const textureKey = getUnitTextureKey(this, runtimeUnit, 'unit lab preview');
    this.previewSprite.setTexture(textureKey);
  }

  _exportDefinitions() {
    const json = exportUnitDefinitionsJSON(this.definitions);
    const blob = new Blob([json], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'unit-definitions.draft.json';
    anchor.click();
    window.URL.revokeObjectURL(url);
    this.statusMessage = 'Exported unit-definitions.draft.json';
    this._renderSummary();
  }

  _resetDraft() {
    clearUnitDefinitionsDraft();
    this.definitions = getRepoUnitDefinitions();
    this.filterText = '';
    this.searchInput.setText('');
    this.page = 0;
    this.selectedId = this.definitions[0]?.id ?? null;
    this._refreshCaches();
    this._ensureValidSelection();
    this._syncFieldsFromSelection();
    this.statusMessage = 'Reloaded repo definitions';
    this._renderList();
    this._renderSummary();
    this._renderDetailPane();
  }
}
