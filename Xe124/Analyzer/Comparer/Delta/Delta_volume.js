
import { toDb, mean, rms, maxAbs, approxTruePeak, shortTermRmsDb, percentile } from './Delta_core.js';

export const category = '音量(振幅系)';

export function analyzeVolume(proc) {
  const { left, right, mono, sampleRate } = proc;
  const len = Math.min(left.length, right.length, mono.length);

  let peakL = 0, peakR = 0, dcL = 0, dcR = 0, clip = 0;
  for (let i = 0; i < len; i++) {
    const l = left[i], r = right[i];
    const al = Math.abs(l), ar = Math.abs(r);
    if (al > peakL) peakL = al;
    if (ar > peakR) peakR = ar;
    dcL += l;
    dcR += r;
    if (al >= 0.999 || ar >= 0.999) clip++;
  }
  dcL /= len || 1;
  dcR /= len || 1;

  const rmsL = rms(left);
  const rmsR = rms(right);
  const rmsMono = rms(mono);
  const peakMax = Math.max(peakL, peakR);
  const tp = Math.max(approxTruePeak(left), approxTruePeak(right));

  const short = shortTermRmsDb(mono, sampleRate);
  const shortSorted = [...short].sort((a, b) => a - b);
  const shortMedian = shortSorted.length ? shortSorted[Math.floor(shortSorted.length / 2)] : -120;
  const p95 = shortSorted.length ? percentile(shortSorted, 0.95) : -120;
  const p05 = shortSorted.length ? percentile(shortSorted, 0.05) : -120;

  const crest = toDb(peakMax) - toDb(rmsMono);
  const dynamicRange = p95 - p05;
  const balance = toDb(Math.max(rmsL, 1e-12)) - toDb(Math.max(rmsR, 1e-12));

  return [
    { id: 'peakL', label: 'ピーク L', value: toDb(peakL), precision: 2, unit: 'dBFS' },
    { id: 'peakR', label: 'ピーク R', value: toDb(peakR), precision: 2, unit: 'dBFS' },
    { id: 'peakMax', label: 'ピーク最大', value: toDb(peakMax), precision: 2, unit: 'dBFS' },
    { id: 'truePeak', label: 'True Peak 近似', value: toDb(tp), precision: 2, unit: 'dBFS' },
    { id: 'rmsL', label: 'RMS L', value: toDb(rmsL), precision: 2, unit: 'dBFS' },
    { id: 'rmsR', label: 'RMS R', value: toDb(rmsR), precision: 2, unit: 'dBFS' },
    { id: 'rmsMono', label: 'RMS Mono', value: toDb(rmsMono), precision: 2, unit: 'dBFS' },
    { id: 'crest', label: 'クレストファクタ', value: crest, precision: 2, unit: 'dB' },
    { id: 'dynamicRange', label: '短期ダイナミックレンジ', value: dynamicRange, precision: 2, unit: 'dB' },
    { id: 'shortMedian', label: '短期RMS中央値', value: shortMedian, precision: 2, unit: 'dBFS' },
    { id: 'dcL', label: 'DCオフセット L', value: dcL, precision: 5, unit: '' },
    { id: 'dcR', label: 'DCオフセット R', value: dcR, precision: 5, unit: '' },
    { id: 'clipRatio', label: 'クリップ率(推定)', value: (clip / len) * 100, precision: 2, unit: '%' },
    { id: 'balance', label: 'L/R RMS差', value: balance, precision: 2, unit: 'dB' }
  ];
}
