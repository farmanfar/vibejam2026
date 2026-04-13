// Central registry for unit abilities, class mechanics, and faction mechanics.
//
// Abilities are indexed by `ability_id` (string, matches the generator's
// mapping table). Classes and factions are indexed by freeform string names
// that must match the frontmatter in design/units/*.md.
//
// A handler is a plain object:
//   {
//     id: 'volatile_payload',
//     event: 'on_faint',
//     priority: 100,
//     fn(ctx, payload) { ... },
//   }
//
// Classes and factions are lifecycle objects with multiple possible hooks:
//   {
//     name: 'Ancient',
//     initialize(ctx, unit) { ... },       // battle start
//     onAction(ctx, unit) { ... },         // replaces basic attack
//     beforeAttack(ctx, attacker, target) { ... },
//     afterDamage(ctx, attacker, target, dmg) { ... },
//     onFaint(ctx, unit) { ... },
//   }

export class Registry {
  constructor() {
    this._abilities = new Map();
    this._classes = new Map();
    this._factions = new Map();
  }

  registerAbility(handler) {
    if (!handler || !handler.id) {
      throw new Error('[Registry] ability handler must have an id');
    }
    if (this._abilities.has(handler.id)) {
      throw new Error(`[Registry] duplicate ability id: ${handler.id}`);
    }
    if (!handler.event || typeof handler.fn !== 'function') {
      throw new Error(`[Registry] ability ${handler.id} missing event or fn`);
    }
    const normalized = { priority: 100, ...handler };
    this._abilities.set(handler.id, normalized);
  }

  getAbility(id) {
    if (!id) return null;
    return this._abilities.get(id) ?? null;
  }

  listAbilities() {
    return [...this._abilities.values()];
  }

  registerClass(mechanic) {
    if (!mechanic || !mechanic.name) {
      throw new Error('[Registry] class mechanic must have a name');
    }
    if (this._classes.has(mechanic.name)) {
      throw new Error(`[Registry] duplicate class: ${mechanic.name}`);
    }
    this._classes.set(mechanic.name, mechanic);
  }

  getClass(name) {
    if (!name) return null;
    return this._classes.get(name) ?? null;
  }

  listClasses() {
    return [...this._classes.values()];
  }

  registerFaction(mechanic) {
    if (!mechanic || !mechanic.name) {
      throw new Error('[Registry] faction mechanic must have a name');
    }
    if (this._factions.has(mechanic.name)) {
      throw new Error(`[Registry] duplicate faction: ${mechanic.name}`);
    }
    this._factions.set(mechanic.name, mechanic);
  }

  getFaction(name) {
    if (!name) return null;
    return this._factions.get(name) ?? null;
  }

  listFactions() {
    return [...this._factions.values()];
  }

  // For each unit: fire every handler whose event matches. Event dispatch
  // goes through the engine's fireEvent() — this just returns the list of
  // ability handlers scoped to a given unit + event.
  abilitiesForUnit(unit, eventType) {
    if (!unit?.def?.ability_id) return [];
    const h = this._abilities.get(unit.def.ability_id);
    if (!h) return [];
    return h.event === eventType ? [h] : [];
  }
}
