
export const TARGET_SR = 48000;

export function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

export function toDb(v) {
  return 20 * Math.log10(Math.max(v, 1e-12));
}

export function fmt(v, p = 2) {
  if (v === null || v === undefined || Number.isNaN(v)) return '-';
  if (!Number.isFinite(v)) return v > 0 ? '∞' : '-∞';
  return Number(v).toFixed(p);
}

export function mean(arr) {
  let s = 0;
  for (let i = 0; i < arr.length; i++) s += arr[i];
  return arr.length ? s / arr.length : 0;
}

export function rms(arr) {
  let s = 0;
  for (let i = 0; i < arr.length; i++) s += arr[i] * arr[i];
  return arr.length ? Math.sqrt(s / arr.length) : 0;
}

export function maxAbs(arr) {
  let m = 0;
  for (let i = 0; i < arr.length; i++) {
    const v = Math.abs(arr[i]);
    if (v > m) m = v;
  }
  return m;
}

export function percentile(sortedArr, p) {
  if (!sortedArr.length) return 0;
  const idx = (sortedArr.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sortedArr[lo];
  const t = idx - lo;
  return sortedArr[lo] * (1 - t) + sortedArr[hi] * t;
}

export function getChannels(audioBuffer) {
  const out = [];
  for (let c = 0; c < audioBuffer.numberOfChannels; c++) {
    out.push(Float32Array.from(audioBuffer.getChannelData(c)));
  }
  return out;
}

export function mixToMono(audioBuffer) {
  const ch = getChannels(audioBuffer);
  return mixChannels(ch);
}

export function mixChannels(channels) {
  if (!channels.length) return new Float32Array(0);
  if (channels.length === 1) return Float32Array.from(channels[0]);
  const len = Math.min(...channels.map(ch => ch.length));
  const out = new Float32Array(len);
  const inv = 1 / channels.length;
  for (let c = 0; c < channels.length; c++) {
    const ch = channels[c];
    for (let i = 0; i < len; i++) out[i] += ch[i] * inv;
  }
  return out;
}

export function resampleLinear(data, srcRate, dstRate) {
  if (srcRate === dstRate) return Float32Array.from(data);
  const outLen = Math.max(1, Math.round(data.length * dstRate / srcRate));
  const out = new Float32Array(outLen);
  const ratio = srcRate / dstRate;
  for (let i = 0; i < outLen; i++) {
    const pos = i * ratio;
    const i0 = Math.floor(pos);
    const frac = pos - i0;
    const a = data[Math.min(i0, data.length - 1)];
    const b = data[Math.min(i0 + 1, data.length - 1)];
    out[i] = a + (b - a) * frac;
  }
  return out;
}

export async function resampleAudioBuffer(audioBuffer, dstRate) {
  if (audioBuffer.sampleRate === dstRate) return audioBuffer;
  const channels = audioBuffer.numberOfChannels;
  const dstLen = Math.max(1, Math.round(audioBuffer.length * dstRate / audioBuffer.sampleRate));
  const offline = new OfflineAudioContext(channels, dstLen, dstRate);
  const src = offline.createBufferSource();
  src.buffer = audioBuffer;
  src.connect(offline.destination);
  src.start(0);
  return await offline.startRendering();
}

export async function decodeFile(file) {
  const ab = await file.arrayBuffer();
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  try {
    return await ctx.decodeAudioData(ab);
  } finally {
    try { await ctx.close(); } catch {}
  }
}

export function wavBlobFromStereo(left, right, sampleRate) {
  const len = Math.min(left.length, right.length);
  const ab = new ArrayBuffer(44 + len * 4);
  const v = new DataView(ab);
  let o = 0;
  const w = s => { for (let i = 0; i < s.length; i++) v.setUint8(o++, s.charCodeAt(i)); };

  w('RIFF'); v.setUint32(o, 36 + len * 4, true); o += 4;
  w('WAVE');
  w('fmt '); v.setUint32(o, 16, true); o += 4;
  v.setUint16(o, 1, true); o += 2;
  v.setUint16(o, 2, true); o += 2;
  v.setUint32(o, sampleRate, true); o += 4;
  v.setUint32(o, sampleRate * 4, true); o += 4;
  v.setUint16(o, 4, true); o += 2;
  v.setUint16(o, 16, true); o += 2;
  w('data'); v.setUint32(o, len * 4, true); o += 4;

  for (let i = 0; i < len; i++) {
    let l = clamp(left[i], -1, 1);
    let r = clamp(right[i], -1, 1);
    l = l < 0 ? l * 0x8000 : l * 0x7fff;
    r = r < 0 ? r * 0x8000 : r * 0x7fff;
    v.setInt16(o, l, true); o += 2;
    v.setInt16(o, r, true); o += 2;
  }
  return new Blob([ab], { type: 'audio/wav' });
}

export function audioBufferFromStereo(left, right, sampleRate) {
  const len = Math.min(left.length, right.length);
  const ctx = new OfflineAudioContext(2, len, sampleRate);
  const buffer = ctx.createBuffer(2, len, sampleRate);
  buffer.copyToChannel(left.subarray(0, len), 0);
  buffer.copyToChannel(right.subarray(0, len), 1);
  return buffer;
}

export function approxTruePeak(arr) {
  if (!arr.length) return 0;
  let p = 0;
  for (let i = 0; i < arr.length - 1; i++) {
    const a = arr[i];
    const b = arr[i + 1];
    const aa = Math.abs(a);
    const ab = Math.abs(b);
    if (aa > p) p = aa;
    if (ab > p) p = ab;
    for (let t = 0.25; t < 1; t += 0.25) {
      const v = Math.abs(a + (b - a) * t);
      if (v > p) p = v;
    }
  }
  const last = Math.abs(arr[arr.length - 1]);
  if (last > p) p = last;
  return p;
}

export function zeroCrossRate(arr, sr) {
  if (!arr.length) return 0;
  let z = 0;
  for (let i = 1; i < arr.length; i++) {
    if ((arr[i - 1] >= 0) !== (arr[i] >= 0)) z++;
  }
  return z / (arr.length / sr);
}

export function shortTermRmsDb(arr, sr, winSec = 0.05, hopSec = 0.025) {
  const win = Math.max(1, Math.round(sr * winSec));
  const hop = Math.max(1, Math.round(sr * hopSec));
  const vals = [];
  for (let i = 0; i + win <= arr.length; i += hop) {
    let s = 0;
    for (let j = 0; j < win; j++) {
      const v = arr[i + j];
      s += v * v;
    }
    vals.push(toDb(Math.sqrt(s / win)));
  }
  return vals;
}

export function envelopeDb(arr, sr, winSec = 0.02, hopSec = 0.01) {
  const win = Math.max(1, Math.round(sr * winSec));
  const hop = Math.max(1, Math.round(sr * hopSec));
  const out = [];
  for (let i = 0; i + win <= arr.length; i += hop) {
    let s = 0;
    for (let j = 0; j < win; j++) s += arr[i + j] * arr[i + j];
    out.push(toDb(Math.sqrt(s / win)));
  }
  return out;
}

export function onsetCount(arr, sr) {
  const env = envelopeDb(arr, sr, 0.02, 0.01);
  if (env.length < 3) return 0;
  let count = 0;
  for (let i = 2; i < env.length; i++) {
    const rise = env[i] - env[i - 1];
    const prevRise = env[i - 1] - env[i - 2];
    if (rise > 1.5 && rise > prevRise + 0.8) count++;
  }
  return count;
}

export function overlapTrim(a, b) {
  const len = Math.min(a.length, b.length);
  return { a: a.subarray(0, len), b: b.subarray(0, len), len };
}

export function alignByLag(a, b, lagSamples) {
  if (lagSamples === 0) return overlapTrim(a, b);
  if (lagSamples > 0) {
    const len = Math.min(a.length, b.length - lagSamples);
    return {
      a: a.subarray(0, len),
      b: b.subarray(lagSamples, lagSamples + len),
      len
    };
  }
  const shift = -lagSamples;
  const len = Math.min(a.length - shift, b.length);
  return {
    a: a.subarray(shift, shift + len),
    b: b.subarray(0, len),
    len
  };
}

export function zscore(arr) {
  const m = mean(arr);
  let s = 0;
  for (let i = 0; i < arr.length; i++) {
    const d = arr[i] - m;
    s += d * d;
  }
  const sd = Math.sqrt(s / Math.max(1, arr.length)) || 1;
  const out = new Float32Array(arr.length);
  for (let i = 0; i < arr.length; i++) out[i] = (arr[i] - m) / sd;
  return out;
}

export function estimateLag(a, b, searchMs = 1000, sampleRate = 1000) {
  const maxLag = Math.max(1, Math.floor(searchMs * sampleRate / 1000));
  const len = Math.min(a.length, b.length);
  if (len < maxLag * 2 + 2) return { lagSamples: 0, correlation: 0 };
  const start = maxLag;
  const usable = len - maxLag * 2;

  let bestCorr = -Infinity;
  let bestLag = 0;

  for (let lag = -maxLag; lag <= maxLag; lag++) {
    let sum = 0, sa = 0, sb = 0;
    for (let i = 0; i < usable; i++) {
      const av = a[start + i];
      const bv = b[start + i + lag];
      sum += av * bv;
      sa += av * av;
      sb += bv * bv;
    }
    const corr = sum / Math.sqrt(sa * sb + 1e-12);
    if (corr > bestCorr) {
      bestCorr = corr;
      bestLag = lag;
    }
  }
  return { lagSamples: bestLag, correlation: bestCorr };
}

export function fftComplex(real) {
  const n = real.length;
  if ((n & (n - 1)) !== 0) throw new Error('FFT size must be power of 2');
  const re = new Float32Array(n);
  const im = new Float32Array(n);
  for (let i = 0; i < n; i++) re[i] = real[i];

  for (let i = 0, j = 0; i < n; i++) {
    if (i < j) {
      const tr = re[i]; re[i] = re[j]; re[j] = tr;
      const ti = im[i]; im[i] = im[j]; im[j] = ti;
    }
    let m = n >> 1;
    while (j >= m && m > 0) { j -= m; m >>= 1; }
    j += m;
  }

  for (let len = 2; len <= n; len <<= 1) {
    const half = len >> 1;
    const theta = -2 * Math.PI / len;
    for (let i = 0; i < n; i += len) {
      for (let j = 0; j < half; j++) {
        const k = i + j;
        const l = k + half;
        const wr = Math.cos(theta * j);
        const wi = Math.sin(theta * j);
        const tr = wr * re[l] - wi * im[l];
        const ti = wr * im[l] + wi * re[l];
        re[l] = re[k] - tr;
        im[l] = im[k] - ti;
        re[k] += tr;
        im[k] += ti;
      }
    }
  }

  return { re, im };
}

export function hannWindow(n) {
  const w = new Float32Array(n);
  for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (n - 1));
  return w;
}

export function aWeightingDb(f) {
  if (f <= 0) return -120;
  const f2 = f * f;
  const ra = (12200 * 12200 * f2 * f2) /
    ((f2 + 20.6 * 20.6) *
     Math.sqrt((f2 + 107.7 * 107.7) * (f2 + 737.9 * 737.9)) *
     (f2 + 12200 * 12200));
  return 2.0 + 20 * Math.log10(Math.max(ra, 1e-20));
}
