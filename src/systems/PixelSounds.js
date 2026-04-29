// PixelSounds.js — Web Audio API synthesis layer.
// Sample-accurate AudioBuffer port of TorchWars PixelSounds.cs + AudioManager.GenerateSweep.
// All buffers baked once at warmup; playback creates a fresh AudioBufferSourceNode per call.

const SAMPLE_RATE = 44100;

let _ctx = null;
let _masterGain = null;
let _muted = false;
let _volume = 1.0;
let _buffers = {};
let _warnedLocked = false;
let _unlockPending = false;

function _getCtx() {
  if (!_ctx) {
    _ctx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: SAMPLE_RATE });
    _masterGain = _ctx.createGain();
    _masterGain.gain.value = _volume;
    _masterGain.connect(_ctx.destination);
  }
  return _ctx;
}

// ── Buffer bakers ─────────────────────────────────────────────────────────────

// Single-frequency tick with quadratic decay. Matches PixelSounds.cs envelope: (1 - i/N)²
function _tick(freq, durationMs) {
  const ctx = _getCtx();
  const N = Math.ceil(SAMPLE_RATE * durationMs / 1000);
  const buf = ctx.createBuffer(1, N, SAMPLE_RATE);
  const ch = buf.getChannelData(0);
  for (let i = 0; i < N; i++) {
    const t = i / SAMPLE_RATE;
    const env = (1 - i / N) ** 2;
    ch[i] = Math.sin(2 * Math.PI * freq * t) * env;
  }
  return buf;
}

// Linear frequency sweep with phase accumulation and quadratic decay.
// Uses phase integration (not OscillatorNode ramp) to match AudioManager.GenerateSweep.
function _sweep(startFreq, endFreq, durationMs) {
  const ctx = _getCtx();
  const N = Math.ceil(SAMPLE_RATE * durationMs / 1000);
  const buf = ctx.createBuffer(1, N, SAMPLE_RATE);
  const ch = buf.getChannelData(0);
  let phase = 0;
  for (let i = 0; i < N; i++) {
    const progress = i / N;
    const freq = startFreq + (endFreq - startFreq) * progress;
    const env = (1 - i / N) ** 2;
    ch[i] = Math.sin(phase) * env;
    phase += 2 * Math.PI * freq / SAMPLE_RATE;
  }
  return buf;
}

function _whiteNoiseBuf(durationMs) {
  const ctx = _getCtx();
  const N = Math.ceil(SAMPLE_RATE * durationMs / 1000);
  const buf = ctx.createBuffer(1, N, SAMPLE_RATE);
  const ch = buf.getChannelData(0);
  for (let i = 0; i < N; i++) ch[i] = Math.random() * 2 - 1;
  return buf;
}

function _brownNoiseBuf(durationMs) {
  const ctx = _getCtx();
  const N = Math.ceil(SAMPLE_RATE * durationMs / 1000);
  const buf = ctx.createBuffer(1, N, SAMPLE_RATE);
  const ch = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < N; i++) {
    const white = (Math.random() * 2 - 1) * 0.02;
    last = (last + white) * 0.98;
    ch[i] = last;
  }
  let peak = 0;
  for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(ch[i]));
  if (peak > 0) for (let i = 0; i < N; i++) ch[i] /= peak;
  return buf;
}

function _mixBuffers(bufs) {
  const ctx = _getCtx();
  const N = bufs[0].length;
  const buf = ctx.createBuffer(1, N, SAMPLE_RATE);
  const out = buf.getChannelData(0);
  for (const b of bufs) {
    const ch = b.getChannelData(0);
    for (let i = 0; i < N; i++) out[i] += ch[i];
  }
  let peak = 0;
  for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(out[i]));
  if (peak > 1) for (let i = 0; i < N; i++) out[i] /= peak;
  return buf;
}

// CRT power-off: 400→60 Hz sweep + fast-decay 8 kHz whine + short noise burst
function _bakeCrtOff() {
  const ctx = _getCtx();
  const durationMs = 350;
  const N = Math.ceil(SAMPLE_RATE * durationMs / 1000);

  const sweep = _sweep(400, 60, durationMs);

  const whine = ctx.createBuffer(1, N, SAMPLE_RATE);
  {
    const ch = whine.getChannelData(0);
    for (let i = 0; i < N; i++) {
      const t = i / SAMPLE_RATE;
      const env = Math.exp(-i / (N * 0.15)) * 0.3;
      ch[i] = Math.sin(2 * Math.PI * 8000 * t) * env;
    }
  }

  const noise = ctx.createBuffer(1, N, SAMPLE_RATE);
  {
    const ch = noise.getChannelData(0);
    const noiseN = Math.ceil(SAMPLE_RATE * 0.08);
    for (let i = 0; i < noiseN; i++) {
      const env = (1 - i / noiseN) ** 2 * 0.15;
      ch[i] = (Math.random() * 2 - 1) * env;
    }
  }

  return _mixBuffers([sweep, whine, noise]);
}

// Card deal: crisp rising pitch, 50 ms
function _bakeCardDeal() {
  return _sweep(800, 1600, 50);
}

// Card shuffle: noise burst with a pitch click woven in
function _bakeCardShuffle() {
  const ctx = _getCtx();
  const durationMs = 120;
  const N = Math.ceil(SAMPLE_RATE * durationMs / 1000);
  const buf = ctx.createBuffer(1, N, SAMPLE_RATE);
  const ch = buf.getChannelData(0);
  const clickBuf = _sweep(600, 300, 40);
  const clickCh = clickBuf.getChannelData(0);
  const clickN = clickBuf.length;
  for (let i = 0; i < N; i++) {
    const env = (1 - i / N) ** 1.5;
    const noiseVal = (Math.random() * 2 - 1) * env * 0.5;
    const clickVal = i < clickN ? clickCh[i] * env * 0.8 : 0;
    ch[i] = noiseVal + clickVal;
  }
  return buf;
}

// Card ruffle: very short white noise brush
function _bakeCardRuffle() {
  return _whiteNoiseBuf(40);
}

// Cha-ching sell: mechanical click "cha" + bright coin-ring "ching"
function _bakeChaChingSell() {
  const ctx = _getCtx();
  const totalMs = 380;
  const N = Math.ceil(SAMPLE_RATE * totalMs / 1000);
  const buf = ctx.createBuffer(1, N, SAMPLE_RATE);
  const out = buf.getChannelData(0);

  // "Cha" — short noise burst + low thud (register key press)
  const chaN = Math.ceil(SAMPLE_RATE * 0.055);
  for (let i = 0; i < chaN; i++) {
    const env = (1 - i / chaN) ** 3;
    out[i] += (Math.random() * 2 - 1) * 0.25 * env;
    out[i] += Math.sin(2 * Math.PI * 190 * i / SAMPLE_RATE) * 0.45 * env;
  }

  // "Ching" — three coin-bell tones, overlapping from 40 ms, slow exponential ring
  const chingStart = Math.floor(SAMPLE_RATE * 0.040);
  const chingN     = Math.ceil(SAMPLE_RATE * 0.340);
  const freqs = [1047, 1319, 2093]; // C6, E6, C7
  const amps  = [0.55, 0.45, 0.30];
  for (let j = 0; j < freqs.length; j++) {
    let phase = 0;
    for (let i = 0; i < chingN; i++) {
      const si = chingStart + i;
      if (si >= N) break;
      const env = Math.exp(-i / (chingN * 0.35)) * amps[j];
      out[si] += Math.sin(phase) * env;
      phase += 2 * Math.PI * freqs[j] / SAMPLE_RATE;
    }
  }

  let peak = 0;
  for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(out[i]));
  if (peak > 0) for (let i = 0; i < N; i++) out[i] /= peak;
  return buf;
}

// Card burn: brown noise + descending sweep (crackle/discard)
function _bakeCardBurn() {
  const ctx = _getCtx();
  const durationMs = 200;
  const N = Math.ceil(SAMPLE_RATE * durationMs / 1000);
  const buf = ctx.createBuffer(1, N, SAMPLE_RATE);
  const ch = buf.getChannelData(0);
  const brownCh = _brownNoiseBuf(durationMs).getChannelData(0);
  const sweepCh = _sweep(300, 80, durationMs).getChannelData(0);
  for (let i = 0; i < N; i++) {
    const env = (1 - i / N) ** 2;
    ch[i] = (brownCh[i] * 0.6 + sweepCh[i] * 0.4) * env;
  }
  return buf;
}

// E4=329.63, G4=392.00, B4=493.88 Hz
const CAPTURE_TICK_FREQS = [329.63, 392.0, 493.88];

// ── Public API ────────────────────────────────────────────────────────────────

export const PixelSounds = {
  // Phase 1: bake all buffers. Safe to call before any user gesture — buffer
  // creation doesn't require a running AudioContext.
  warmup() {
    _getCtx();
    _buffers = {
      hover:           _tick(1800, 15),
      click:           _tick(1200, 30),
      flag:            _tick(800,  45),
      crtOff:          _bakeCrtOff(),
      captureTick0:    _tick(CAPTURE_TICK_FREQS[0], 60),
      captureTick1:    _tick(CAPTURE_TICK_FREQS[1], 60),
      captureTick2:    _tick(CAPTURE_TICK_FREQS[2], 60),
      captureComplete: _tick(659.25, 120),
      hit:             _sweep(900,  420, 70),
      kill:            _sweep(760,  240, 180),
      parry:           _sweep(1200, 600, 90),
      roundEnd:        _sweep(520,  780, 220),
      orbCollect:      _sweep(900,  320, 180),
      cardDeal:        _bakeCardDeal(),
      cardShuffle:     _bakeCardShuffle(),
      cardRuffle:      _bakeCardRuffle(),
      cardBurn:        _bakeCardBurn(),
      chaChing:        _bakeChaChingSell(),
      death:           _sweep(400,  100, 150),
    };
    console.log('[Sound] PixelSounds warmed up');
  },

  // Phase 2: resume AudioContext. Returns Promise<boolean> — true if the
  // context is confirmed running after this call. MUST be called from a
  // user-gesture handler (or installAutoUnlock will do it automatically).
  unlock() {
    const ctx = _getCtx();
    // Silent-tap warmup — parks output device even when state is already running.
    try {
      const silent = ctx.createBuffer(1, 1, SAMPLE_RATE);
      const src = ctx.createBufferSource();
      src.buffer = silent;
      src.connect(_masterGain);
      src.start(0);
    } catch (e) {
      console.error('[Sound] silent-tap failed:', e);
    }
    if (ctx.state === 'running') {
      console.log('[Sound] AudioContext already running — silent tap fired');
      return Promise.resolve(true);
    }
    _unlockPending = true;
    return ctx.resume()
      .then(() => {
        _unlockPending = false;
        console.log('[Sound] AudioContext unlocked');
        return true;
      })
      .catch(e => {
        _unlockPending = false;
        console.error('[Sound] AudioContext resume failed:', e);
        return false;
      });
  },

  // Install a DOM capture-phase unlock listener on `target` (defaults to
  // window). Stays attached until a resume() actually succeeds so a failed
  // first gesture automatically arms a retry on the next valid gesture.
  installAutoUnlock(target) {
    const el = target || window;
    let inFlight = false;
    let done = false;
    const detach = () => {
      el.removeEventListener('pointerdown', handler, true);
      el.removeEventListener('mousedown',   handler, true);
      el.removeEventListener('touchstart',  handler, true);
      el.removeEventListener('touchend',    handler, true);
      el.removeEventListener('keydown',     handler, true);
    };
    const handler = () => {
      if (done || inFlight) return;
      inFlight = true;
      Promise.resolve(this.unlock()).then(ok => {
        inFlight = false;
        if (ok) {
          done = true;
          detach();
        } else {
          console.log('[Sound] Auto-unlock retry armed for next gesture');
        }
      });
    };
    // capture:true fires before Phaser's bubble-phase GameObject handlers so
    // the click that unlocks audio also gets to produce its sound.
    el.addEventListener('pointerdown', handler, true);
    el.addEventListener('mousedown',   handler, true);
    el.addEventListener('touchstart',  handler, true);
    el.addEventListener('touchend',    handler, true);
    el.addEventListener('keydown',     handler, true);
    console.log('[Sound] Auto-unlock installed on', el === window ? 'window' : 'element');
  },

  // Generic dispatcher. opts: { volume, pitchJitter (semitones), detune (cents) }
  play(id, opts = {}) {
    const buf = _buffers[id];
    if (!buf) { console.warn(`[Sound] Unknown id: ${id}`); return; }
    const ctx = _getCtx();
    if (ctx.state !== 'running' && !_unlockPending) {
      if (!_warnedLocked) {
        console.log('[Sound] AudioContext not running — call unlock() from a user gesture first');
        _warnedLocked = true;
      }
      return;
    }
    if (_muted) return;

    const gain = ctx.createGain();
    gain.gain.value = opts.volume ?? 1.0;
    gain.connect(_masterGain);

    const src = ctx.createBufferSource();
    src.buffer = buf;
    if (opts.pitchJitter) src.playbackRate.value = 2 ** (opts.pitchJitter / 12);
    if (opts.detune)      src.detune.value = opts.detune;
    src.connect(gain);
    src.start();
  },

  // Named play methods — match C# API names for mechanical future ports
  playHover()           { this.play('hover'); },
  playClick()           { this.play('click'); },
  playFlag()            { this.play('flag'); },
  playCrtOff()          { this.play('crtOff'); },
  playCaptureTick(n)    { this.play(`captureTick${Math.min(2, Math.max(0, n))}`); },
  playCaptureComplete() { this.play('captureComplete'); },
  playHit()             { this.play('hit'); },
  playKill()            { this.play('kill'); },
  playParry()           { this.play('parry'); },
  playRoundEnd()        { this.play('roundEnd'); },
  playOrbCollect()      { this.play('orbCollect'); },
  playCardDeal()        { this.play('cardDeal'); },
  playCardShuffle()     { this.play('cardShuffle'); },
  playCardRuffle()      { this.play('cardRuffle'); },
  playCardBurn()        { this.play('cardBurn'); },
  playChaChing()        { this.play('chaChing'); },
  playDeath()           { this.play('death'); },

  setMuted(muted) {
    _muted = !!muted;
    console.log(`[Sound] ${_muted ? 'Muted' : 'Unmuted'}`);
  },

  // Applied to master gain — affects all subsequent playbacks.
  setVolume(v) {
    _volume = v;
    if (_masterGain) _masterGain.gain.value = v;
    console.log(`[Sound] Master volume: ${v.toFixed(2)}`);
  },

  isUnlocked() {
    return _ctx?.state === 'running';
  },
};
