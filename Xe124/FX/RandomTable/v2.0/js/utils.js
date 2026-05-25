(function () {
  'use strict';

  const N = 2048;
  const BIN_MAX = 1024;
  const TAU = Math.PI * 2;
  const MAX_LAYERS = 20;

  // ── 基本数学 ─────────────────────────────────────────────────────────
  function rand(min, max) {
    if (min === undefined) min = 0;
    if (max === undefined) max = 1;
    return min + Math.random() * (max - min);
  }
  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
  function clamp01(v) { return clamp(v, 0, 1); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function smoothstep(t) { return t * t * (3 - 2 * t); }
  function choice(arr) { return arr[(Math.random() * arr.length) | 0]; }
  function hash01(x) { const s = Math.sin(x) * 43758.5453123; return s - Math.floor(s); }
  function wrapPhase(p) { p %= TAU; return p < -Math.PI ? p + TAU : p > Math.PI ? p - TAU : p; }
  function phaseLerp(a, b, t) { const d = Math.atan2(Math.sin(b - a), Math.cos(b - a)); return a + d * t; }
  function seededRand(seed) { const x = Math.sin(seed + 1) * 43758.5453123; return x - Math.floor(x); }

  // ── フレーム操作 ──────────────────────────────────────────────────────
  function blankFrame() { return { amp: new Float64Array(BIN_MAX + 1), phase: new Float64Array(BIN_MAX + 1) }; }
  function cloneFrame(src) { return { amp: new Float64Array(src.amp), phase: new Float64Array(src.phase) }; }

  function blendFrames(a, b, t) {
    const out = blankFrame();
    for (let k = 1; k <= BIN_MAX; k++) {
      out.amp[k] = lerp(a.amp[k], b.amp[k], t);
      out.phase[k] = phaseLerp(a.phase[k], b.phase[k], t);
    }
    return out;
  }

  function smoothBins(frame, radius, strength) {
    if (radius === undefined) radius = 2;
    if (strength === undefined) strength = 1;
    const out = blankFrame();
    const r = Math.max(1, Math.round(radius));
    for (let k = 1; k <= BIN_MAX; k++) {
      let a = 0, c = 0, phx = 0, phy = 0;
      for (let j = Math.max(1, k - r); j <= Math.min(BIN_MAX, k + r); j++) {
        const w = 1 - Math.abs(j - k) / (r + 1);
        a += frame.amp[j] * w;
        phx += Math.cos(frame.phase[j]) * w;
        phy += Math.sin(frame.phase[j]) * w;
        c += w;
      }
      const avgA = a / Math.max(c, 1e-9);
      const avgP = Math.atan2(phy, phx);
      out.amp[k] = lerp(frame.amp[k], avgA, clamp01(strength));
      out.phase[k] = phaseLerp(frame.phase[k], avgP, clamp01(strength));
    }
    return out;
  }

  function normalizeFrame(frame, targetPeak) {
    if (targetPeak === undefined) targetPeak = 1;
    let max = 0;
    for (let k = 1; k <= BIN_MAX; k++) if (frame.amp[k] > max) max = frame.amp[k];
    if (max <= 0) return frame;
    const scale = targetPeak / max;
    for (let k = 1; k <= BIN_MAX; k++) frame.amp[k] *= scale;
    return frame;
  }

  function resampleSpectrum(frame, mapper, ampFn, phaseFn) {
    const out = blankFrame();
    for (let k = 1; k <= BIN_MAX; k++) {
      const x = clamp(mapper(k), 1, BIN_MAX);
      const i = Math.floor(x), f = x - i;
      const i2 = Math.min(i + 1, BIN_MAX);
      let amp = lerp(frame.amp[i], frame.amp[i2], f);
      let phase = phaseLerp(frame.phase[i], frame.phase[i2], f);
      if (ampFn) amp = ampFn(amp, k, frame);
      if (phaseFn) phase = phaseFn(phase, k, frame);
      out.amp[k] = Math.max(0, amp);
      out.phase[k] = phase;
    }
    return out;
  }

  function resampleFrames(frames, mapper) {
    const depth = frames.length;
    const out = new Array(depth);
    if (depth === 1) return [cloneFrame(frames[0])];
    for (let i = 0; i < depth; i++) {
      const t = i / (depth - 1);
      const u = clamp01(mapper(t, i, depth));
      const p = u * (depth - 1);
      const j = Math.floor(p);
      const ff = p - j;
      out[i] = blendFrames(frames[j], frames[Math.min(j + 1, depth - 1)], ff);
    }
    return out;
  }

  // ── FFT ──────────────────────────────────────────────────────────────
  function fft(re, im, invert) {
    if (invert === undefined) invert = false;
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) {
        [re[i], re[j]] = [re[j], re[i]];
        [im[i], im[j]] = [im[j], im[i]];
      }
    }
    for (let len = 2; len <= n; len <<= 1) {
      const ang = 2 * Math.PI / len * (invert ? -1 : 1);
      const wlenRe = Math.cos(ang);
      const wlenIm = Math.sin(ang);
      for (let i = 0; i < n; i += len) {
        let wRe = 1, wIm = 0;
        for (let j = 0; j < len / 2; j++) {
          const uRe = re[i + j], uIm = im[i + j];
          const vRe = re[i + j + len / 2] * wRe - im[i + j + len / 2] * wIm;
          const vIm = re[i + j + len / 2] * wIm + im[i + j + len / 2] * wRe;
          re[i + j] = uRe + vRe; im[i + j] = uIm + vIm;
          re[i + j + len / 2] = uRe - vRe; im[i + j + len / 2] = uIm - vIm;
          const nwRe = wRe * wlenRe - wIm * wlenIm;
          wIm = wRe * wlenIm + wIm * wlenRe; wRe = nwRe;
        }
      }
    }
    if (invert) {
      const inv = 1 / n;
      for (let i = 0; i < n; i++) { re[i] *= inv; im[i] *= inv; }
    }
  }

  const _twCache = new Map();
  function fftInPlace(re, im) {
    const n = re.length;
    let j = 0;
    for (let i = 1; i < n; i++) {
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) {
        let t = re[i]; re[i] = re[j]; re[j] = t;
        t = im[i]; im[i] = im[j]; im[j] = t;
      }
    }
    if (!_twCache.has(n)) {
      const cos = new Float64Array(n / 2), sin = new Float64Array(n / 2);
      for (let i = 0; i < n / 2; i++) { cos[i] = Math.cos(TAU * i / n); sin[i] = Math.sin(TAU * i / n); }
      _twCache.set(n, { cos, sin });
    }
    const { cos, sin } = _twCache.get(n);
    for (let size = 2; size <= n; size <<= 1) {
      const half = size >> 1, step = n / size;
      for (let i = 0; i < n; i += size) {
        for (let k = 0; k < half; k++) {
          const ti = k * step;
          const ar = re[i + k], ai = im[i + k], br = re[i + k + half], bi = im[i + k + half];
          const tr = br * cos[ti] + bi * sin[ti], ti2 = -br * sin[ti] + bi * cos[ti];
          re[i + k] = ar + tr; im[i + k] = ai + ti2;
          re[i + k + half] = ar - tr; im[i + k + half] = ai - ti2;
        }
      }
    }
  }

  // ── AudioContext ──────────────────────────────────────────────────────
  let audioCtx = null;
  function getAudioCtx() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    return audioCtx;
  }

  // ── 曲面ノイズ共通 ────────────────────────────────────────────────────
  function pHash(x, y, seed) {
    const h = Math.sin(x * 127.1 + y * 311.7 + seed * 74.3) * 43758.5453;
    return h - Math.floor(h);
  }
  function fade(t) { return t * t * (3 - 2 * t); }

  function perlinNoise2D(x, y, seed) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = fade(x - xi), yf = fade(y - yi);
    const v00 = pHash(xi, yi, seed), v10 = pHash(xi + 1, yi, seed);
    const v01 = pHash(xi, yi + 1, seed), v11 = pHash(xi + 1, yi + 1, seed);
    return lerp(lerp(v00, v10, xf), lerp(v01, v11, xf), yf);
  }

  function simplexNoise2D(x, y, seed) {
    const F = 0.366025, G = 0.211325;
    const s2 = (x + y) * F;
    const i = Math.floor(x + s2), j = Math.floor(y + s2);
    const t2 = (i + j) * G;
    const x0 = x - (i - t2), y0 = y - (j - t2);
    const i1 = x0 > y0 ? 1 : 0, j1 = x0 > y0 ? 0 : 1;
    const x1 = x0 - i1 + G, y1 = y0 - j1 + G;
    const x2 = x0 - 1 + 2 * G, y2 = y0 - 1 + 2 * G;
    let n = 0;
    for (const [dx, dy, di, dj] of [[x0, y0, 0, 0], [x1, y1, i1, j1], [x2, y2, 1, 1]]) {
      const t3 = 0.5 - dx * dx - dy * dy;
      if (t3 > 0) {
        const h = pHash(i + di, j + dj, seed);
        const gx = Math.cos(h * TAU), gy = Math.sin(h * TAU);
        n += t3 * t3 * t3 * t3 * (gx * dx + gy * dy);
      }
    }
    return 0.5 + n * 8;
  }

  function worleyNoise2D(x, y, seed, numCells) {
    const cells = numCells || 6;
    let minDist = Infinity;
    for (let ci = -1; ci <= 1; ci++) {
      for (let cj = -1; cj <= 1; cj++) {
        const cx = Math.floor(x / cells) * cells + ci * cells;
        const cy = Math.floor(y / cells) * cells + cj * cells;
        const px = cx + pHash(cx, cy, seed) * cells;
        const py = cy + pHash(cx, cy, seed + 1) * cells;
        const d = Math.sqrt((x - px) ** 2 + (y - py) ** 2);
        if (d < minDist) minDist = d;
      }
    }
    return 1 - clamp01(minDist / cells);
  }

  function cellularNoise2D(x, y, seed, numCells) {
    const cells = numCells || 5;
    let d1 = Infinity, d2 = Infinity;
    for (let ci = -1; ci <= 1; ci++) {
      for (let cj = -1; cj <= 1; cj++) {
        const cx = Math.floor(x / cells) * cells + ci * cells;
        const cy = Math.floor(y / cells) * cells + cj * cells;
        const px = cx + pHash(cx, cy, seed + 2) * cells;
        const py = cy + pHash(cx, cy, seed + 3) * cells;
        const d = Math.sqrt((x - px) ** 2 + (y - py) ** 2);
        if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) { d2 = d; }
      }
    }
    return clamp01((d2 - d1) / cells);
  }

  function randWalkNoise(x, y, seed, steps) {
    const n = steps || 32;
    let val = 0.5;
    for (let i = 0; i < n; i++) {
      const t = i / n;
      const step = (pHash(i, Math.floor(y * 4), seed) - 0.5) * 0.15;
      if (t <= x) val = clamp01(val + step);
    }
    return val;
  }

  function surfaceAmpEnvelope(k) {
    const x = k / BIN_MAX;
    const center = 0.12, width = 0.25;
    const bell = Math.exp(-0.5 * ((x - center) / width) ** 2);
    const lowCut = k < 3 ? 0 : (k < 8 ? (k - 3) / 5 : 1.0);
    return bell * lowCut * (0.1 + 0.9 * (1 - x * 0.6));
  }

  function surfacePhaseFromAmp(k, ampVal, pos, seed) {
    const coherence = Math.pow(ampVal, 0.5);
    const randPh = (pHash(k * 3, pos * 10, seed) * 2 - 1) * Math.PI;
    const orderedPh = Math.PI * 0.5 * Math.sin(k * 0.05 + pos * 0.3);
    return wrapPhase(lerp(randPh, orderedPh, coherence * 0.8));
  }

  // ── エクスポート ──────────────────────────────────────────────────────
  window.WT = window.WT || {};
  Object.assign(window.WT, {
    N, BIN_MAX, TAU, MAX_LAYERS,
    rand, clamp, clamp01, lerp, smoothstep, choice,
    hash01, wrapPhase, phaseLerp, seededRand,
    blankFrame, cloneFrame, blendFrames,
    smoothBins, normalizeFrame, resampleSpectrum, resampleFrames,
    fft, fftInPlace,
    getAudioCtx,
    pHash, fade,
    perlinNoise2D, simplexNoise2D, worleyNoise2D, cellularNoise2D, randWalkNoise,
    surfaceAmpEnvelope, surfacePhaseFromAmp,
  });
})();
