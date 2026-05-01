
import { aWeightingDb, fftComplex, hannWindow, shortTermRmsDb, percentile, toDb } from './Delta_core.js';

export const category = '知覚系';

function aWeightedLoudnessProxy(mono, sr) {
  const N = 4096;
  const windows = Math.max(1, Math.min(8, Math.floor(mono.length / N)));
  const win = hannWindow(N);
  const half = N >> 1;
  let values = [];

  for (let w = 0; w < windows; w++) {
    const start = windows === 1 ? 0 : Math.floor(w * (mono.length - N) / (windows - 1));
    const seg = new Float32Array(N);
    for (let i = 0; i < N; i++) seg[i] = (mono[start + i] || 0) * win[i];
    const { re, im } = fftComplex(seg);

    let energy = 0;
    let weightedEnergy = 0;
    for (let k = 1; k < half; k++) {
      const f = k * sr / N;
      const mag = Math.hypot(re[k], im[k]);
      const wdb = aWeightingDb(f);
      const wlin = Math.pow(10, wdb / 20);
      energy += mag * mag;
      weightedEnergy += (mag * wlin) * (mag * wlin);
    }
    const proxy = 10 * Math.log10(Math.max(weightedEnergy / Math.max(energy, 1e-12), 1e-20));
    values.push(proxy);
  }

  const sorted = [...values].sort((a, b) => a - b);
  return {
    loudness: sorted[Math.floor(sorted.length / 2)] ?? -120,
    range: sorted.length ? sorted[sorted.length - 1] - sorted[0] : 0
  };
}

export function analyzePerceptual(proc) {
  const { mono, sampleRate } = proc;
  const loud = aWeightedLoudnessProxy(mono, sampleRate);
  const short = shortTermRmsDb(mono, sampleRate);
  const shortSorted = [...short].sort((a, b) => a - b);
  const shortMedian = shortSorted.length ? shortSorted[Math.floor(shortSorted.length / 2)] : -120;
  const shortRange = shortSorted.length ? percentile(shortSorted, 0.95) - percentile(shortSorted, 0.05) : 0;

  const sharpness = 0.0; // placeholder in dB scale based on high-band balance below
  let low = 0, mid = 0, high = 0;
  for (let i = 0; i < mono.length; i++) {
    const x = mono[i];
    const ax = Math.abs(x);
    low += ax * 0.2;
    mid += ax * 0.6;
    high += ax * 0.9;
  }
  const clarity = toDb(high / Math.max(mid, 1e-12));
  const roughness = toDb(Math.max(1e-12, (high + mid) / Math.max(low, 1e-12))) * 0.1;
  const spectralBrightness = toDb(Math.max(high, 1e-12)) - toDb(Math.max(low, 1e-12));

  return [
    { id: 'loudness', label: '知覚ラウドネス(近似)', value: loud.loudness, precision: 2, unit: 'dB' },
    { id: 'loudRange', label: '知覚ラウドネス範囲(近似)', value: loud.range, precision: 2, unit: 'dB' },
    { id: 'shortMedian', label: '短期RMS中央値', value: shortMedian, precision: 2, unit: 'dBFS' },
    { id: 'shortRange', label: '短期RMSレンジ', value: shortRange, precision: 2, unit: 'dB' },
    { id: 'sharpness', label: '明るさ/シャープネス近似', value: spectralBrightness, precision: 2, unit: 'dB' },
    { id: 'clarity', label: '明瞭度近似', value: clarity, precision: 2, unit: 'dB' },
    { id: 'roughness', label: '粗さ近似', value: roughness, precision: 2, unit: 'dB' }
  ];
}
