
import { fftComplex, hannWindow, percentile, toDb } from './Delta_core.js';

export const category = '周波数';

function avgSpectrum(mono, sr) {
  const N = 4096;
  const windows = Math.max(1, Math.min(8, Math.floor(mono.length / N)));
  const win = hannWindow(N);
  const half = N >> 1;
  const avg = new Float64Array(half);

  for (let w = 0; w < windows; w++) {
    const start = windows === 1 ? 0 : Math.floor(w * (mono.length - N) / (windows - 1));
    const seg = new Float32Array(N);
    for (let i = 0; i < N; i++) seg[i] = (mono[start + i] || 0) * win[i];
    const { re, im } = fftComplex(seg);
    for (let k = 1; k < half; k++) {
      avg[k] += Math.hypot(re[k], im[k]);
    }
  }
  for (let k = 1; k < half; k++) avg[k] /= windows;
  return { avg, N };
}

export function analyzeFrequency(proc) {
  const { mono, sampleRate } = proc;
  const { avg, N } = avgSpectrum(mono, sampleRate);
  const half = N >> 1;
  const binHz = sampleRate / N;

  let sum = 0, sumF = 0, sumLogF = 0, sumLogMag = 0, sumFF = 0, sumFL = 0;
  let low = 0, mid = 0, high = 0, total = 0, flatLog = 0;

  for (let k = 1; k < half; k++) {
    const f = k * binHz;
    const m = Math.max(avg[k], 1e-20);
    total += m;
    sum += m;
    sumF += m * f;
    const lf = Math.log10(f);
    const lm = Math.log10(m);
    sumLogF += lf;
    sumLogMag += lm;
    sumFF += lf * lf;
    sumFL += lf * lm;
    flatLog += Math.log(m);

    if (f < 250) low += m;
    else if (f < 4000) mid += m;
    else high += m;
  }

  const centroid = sum > 0 ? sumF / sum : 0;
  let variance = 0;
  for (let k = 1; k < half; k++) {
    const f = k * binHz;
    const m = Math.max(avg[k], 1e-20);
    const d = f - centroid;
    variance += m * d * d;
  }
  const bandwidth = sum > 0 ? Math.sqrt(variance / sum) : 0;

  let cum = 0;
  let rolloff = sampleRate / 2;
  const target = total * 0.85;
  for (let k = 1; k < half; k++) {
    cum += avg[k];
    if (cum >= target) {
      rolloff = k * binHz;
      break;
    }
  }

  const arithmeticMean = total / Math.max(1, half - 1);
  const geometricMean = Math.exp(flatLog / Math.max(1, half - 1));
  const flatness = geometricMean / Math.max(arithmeticMean, 1e-20);

  const slope = (sumFF > 0) ? ((sumFL * (half - 1) - sumLogF * sumLogMag) / (sumFF * (half - 1) - sumLogF * sumLogF + 1e-12)) : 0;

  const lowDb = toDb(low);
  const midDb = toDb(mid);
  const highDb = toDb(high);
  const tilt = highDb - lowDb;
  const lowMid = lowDb - midDb;
  const highMid = highDb - midDb;

  const sorted = [...avg].sort((a, b) => a - b);
  const p10 = percentile(sorted, 0.10);
  const p90 = percentile(sorted, 0.90);
  const contrast = toDb(p90) - toDb(p10);

  return [
    { id: 'centroid', label: 'スペクトル重心', value: centroid, precision: 0, unit: 'Hz' },
    { id: 'bandwidth', label: '帯域幅', value: bandwidth, precision: 0, unit: 'Hz' },
    { id: 'rolloff', label: 'ロールオフ85%', value: rolloff, precision: 0, unit: 'Hz' },
    { id: 'flatness', label: 'スペクトル平坦度', value: flatness, precision: 4, unit: '' },
    { id: 'tilt', label: 'スペクトル傾き(高低差)', value: tilt, precision: 2, unit: 'dB' },
    { id: 'lowMid', label: 'Low-Mid差', value: lowMid, precision: 2, unit: 'dB' },
    { id: 'highMid', label: 'High-Mid差', value: highMid, precision: 2, unit: 'dB' },
    { id: 'contrast', label: 'スペクトルコントラスト', value: contrast, precision: 2, unit: 'dB' },
    { id: 'slope', label: '対数スペクトル傾き', value: slope, precision: 4, unit: '' }
  ];
}
