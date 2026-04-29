// SoundManager.js — semantic wrapper mapping game events to PixelSounds calls.
// All scenes import from here, not PixelSounds directly. Centralising keeps remapping single-file.
import { PixelSounds } from './PixelSounds.js';

// Per-method throttle timestamps
const _lastPlayed = {};

function _throttle(id, cooldownMs, fn) {
  const now = performance.now();
  if (_lastPlayed[id] && now - _lastPlayed[id] < cooldownMs) return;
  _lastPlayed[id] = now;
  fn();
}

export const SoundManager = {
  // ── UI / global ────────────────────────────────────────────────────────────
  // Throttled: pointer drift over a button border fires dozens of pointerover
  // events; without the 60 ms gate it sounds like a buzz.
  uiHover()  { _throttle('hover', 60, () => PixelSounds.playHover()); },
  uiClick()  { PixelSounds.playClick(); },
  uiToggle() { PixelSounds.playFlag(); },

  // ── Scene transitions ──────────────────────────────────────────────────────
  sceneTransition() { PixelSounds.playCrtOff(); },

  // ── Shop ───────────────────────────────────────────────────────────────────
  shopBuy()    { PixelSounds.playCardDeal(); },
  shopSell()   { PixelSounds.playChaChing(); },
  shopReroll() { PixelSounds.playCardShuffle(); },

  // Called per-card after spin settles; caller staggers by index at 60 ms each.
  shopRerollCard() { PixelSounds.playCardDeal(); },

  shopLock() { PixelSounds.playFlag(); },

  shopCombine() {
    PixelSounds.playCardDeal();
    setTimeout(() => PixelSounds.playCaptureComplete(), 140);
  },

  shopNoFunds() { PixelSounds.play('cardBurn', { volume: 0.4 }); },

  // Throttled: rapid pickup/drop attempts during a drag-juggle can stack ruffles.
  dragPickup()  { _throttle('dragPickup', 80, () => PixelSounds.playCardRuffle()); },
  dragInvalid() { PixelSounds.play('flag', { pitchJitter: -3 }); },

  // ── Tutorial ───────────────────────────────────────────────────────────────
  tutorialAdvance() { PixelSounds.playClick(); },

  // ── Battle ─────────────────────────────────────────────────────────────────
  battleStage()    { PixelSounds.playRoundEnd(); },

  // 30 ms throttle: simultaneous-clash damage on both sides should sound as a
  // clash, not an echo, but ≥30 ms separates the two as distinct beats.
  battleHit()      { _throttle('battleHit',    30, () => PixelSounds.playHit()); },
  battleBlock()    { _throttle('battleBlock',  30, () => PixelSounds.playParry()); },
  battleHeal()     { _throttle('battleHeal',   30, () => PixelSounds.playCaptureTick(2)); },
  battleBuff()     { _throttle('battleBuff',   30, () => PixelSounds.playCaptureTick(1)); },
  battleDebuff()   { _throttle('battleDebuff', 30, () => PixelSounds.playCaptureTick(0)); },
  battlePoison()   { _throttle('battlePoison', 30, () => PixelSounds.play('cardBurn', { volume: 0.3 })); },
  battleArmor()    { _throttle('battleArmor',  30, () => PixelSounds.playFlag()); },
  battleResonance(){ PixelSounds.playCaptureComplete(); },

  // ONE call regardless of unit count: single death → Kill (TW), batch → Death (HT).
  battleDeath(count) {
    if (count === 1) PixelSounds.playKill();
    else             PixelSounds.playDeath();
  },

  battleReflow()  { PixelSounds.play('cardShuffle', { volume: 0.2 }); },
  battleVictory() { PixelSounds.playOrbCollect(); },
  battleDefeat()  { PixelSounds.play('death', { volume: 1.0 }); },

  // ── Commander / Merchant selection widget ──────────────────────────────────
  commanderFocus()   { SoundManager.uiHover(); },
  commanderConfirm() { PixelSounds.playClick(); PixelSounds.playFlag(); },
  merchantFocus()    { SoundManager.uiHover(); },
  merchantConfirm()  { PixelSounds.playClick(); PixelSounds.playFlag(); },
};
