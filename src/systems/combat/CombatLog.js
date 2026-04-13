// Append-only log of combat events. Every state transition, every roll,
// every trigger fires a log entry. The sim CLI prints these; tests assert
// against them; determinism tests deep-equal two logs from the same seed.
//
// Entries are plain objects with a `kind` string and arbitrary payload.
// Keep payloads JSON-serializable (no unit refs — snapshot by id/slot).

export class CombatLog {
  constructor() {
    this.entries = [];
  }

  push(kind, payload = {}) {
    const entry = { kind, ...payload };
    this.entries.push(entry);
    return entry;
  }

  get length() {
    return this.entries.length;
  }

  // Pretty-print to a string for the CLI. Tests should NOT rely on this
  // format — they should assert directly against this.entries.
  toString() {
    return this.entries.map((e) => `[${e.kind}] ${JSON.stringify(e)}`).join('\n');
  }

  // Filter helper for tests: return every entry whose kind matches.
  ofKind(kind) {
    return this.entries.filter((e) => e.kind === kind);
  }

  // Count occurrences of a kind. Test convenience.
  countKind(kind) {
    return this.ofKind(kind).length;
  }
}
