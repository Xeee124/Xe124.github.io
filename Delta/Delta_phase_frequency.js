
import { fftComplex, hannWindow, toDb } from './Delta_core.js';

export const category = '位相(周波数)';

function phaseStats(mono) {
  const N = 2048;
  const windows = Math.max(1, Math.min(6, Math.floor(mono.length / N)));
  const win = hannWindow(N);
  const half = N >> 1;

  let gdSum = 0;
  let gdSqSum = 0;
  let phaseStdSum = 0;
  let wrapSum = 0;
  let count = 0;

  for (let w = 0; w < windows; w++) {
    const start = windows === 1 ? 0 : Math.floor(w * (mono.length - N) / (windows - 1));
    const seg = new Float32Array(N);
    for (let i = 0; i < N; i++) seg[i] = (mono[start + i] || 0) * win[i];
    const { re, im } = fftComplex(seg);

    const phases = new Float64Array(half);
    for (let k = 1; k < half; k++) phases[k] = Math.atan2(im[k], re[k]);

    let unwrap = 0;
    let prev = phases[1];
    let slopeNum = 0, slopeDen = 0;
    const xs = [];
    const ys = [];

    for (let k = 1; k < half; k++) {
      let p = phases[k];
      let d = p - prev;
      if (d > Math.PI) { p -= 2 * Math.PI; unwrap++; }
      else if (d < -Math.PI) { p += 2 * Math.PI; unwrap++; }
      prev = p;
      xs.push(k);
      ys.push(p);
    }

    const n = xs.length;
    if (n < 2) continue;
    const xm = xs.reduce((a, b) => a + b, 0) / n;
    const ym = ys.reduce((a, b) => a + b, 0) / n;
    for (let i = 0; i < n; i++) {
      const x = xs[i] - xm;
      const y = ys[i] - ym;
      slopeNum += x * y;
      slopeDen += x * x;
    }
    const slope = slopeNum / (slopeDen + 1e-12); // rad/bin
    const gdSamples = -slope * N / (2 * Math.PI); // rough sample delay proxy

    let varSum = 0;
    for (let i = 0; i < n; i++) {
      const y = ys[i] - ym;
      varSum += y * y;
    }
    const phaseStd = Math.sqrt(varSum / n);

    gdSum += gdSamples;
    gdSqSum += gdSamples * gdSamples;
    phaseStdSum += phaseStd;
    wrapSum += unwrap;
    count++;
  }

  const gdMean = count ? gdSum / count : 0;
  const gdStd = count ? Math.sqrt(Math.max(0, gdSqSum / count - gdMean * gdMean)) : 0;
  const phaseStd = count ? phaseStdSum / count : 0;
  const wrapRate = count ? wrapSum / count : 0;

  return [
    { id: 'groupDelay', label: '群遅延(近似) 平均', value: gdMean, precision: 3, unit: 'samples' },
    { id: 'groupDelayStd', label: '群遅延(近似) ばらつき', value: gdStd, precision: 3, unit: 'samples' },
    { id: 'phaseStd', label: '位相ばらつき', value: phaseStd, precision: 3, unit: 'rad' },
    { id: 'wrapRate', label: '位相ラップ回数/窓', value: wrapRate, precision: 2, unit: '' }
  ];
}
export function analyzePhaseFrequency(proc) {
  return phaseStats(proc.mono);
}
