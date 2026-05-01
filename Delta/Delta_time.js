
import { envelopeDb, onsetCount, toDb, percentile } from './Delta_core.js';

export const category = '時間';

function silenceEdges(mono, sr) {
  const thr = -60;
  const env = envelopeDb(mono, sr, 0.01, 0.005);
  let start = 0;
  while (start < env.length && env[start] < thr) start++;
  let end = env.length - 1;
  while (end >= 0 && env[end] < thr) end--;
  const startMs = start * 5;
  const endMs = Math.max(0, (env.length - 1 - end) * 5);
  return { startMs, endMs, env };
}

export function analyzeTime(proc) {
  const { mono, sampleRate } = proc;
  const { startMs, endMs, env } = silenceEdges(mono, sampleRate);
  const onsets = onsetCount(mono, sampleRate);
  const density = onsets / Math.max(1, mono.length / sampleRate);

  const envSorted = [...env].sort((a, b) => a - b);
  const envVar = envSorted.length ? percentile(envSorted, 0.9) - percentile(envSorted, 0.1) : 0;
  const attack = env.length >= 5 ? env[4] - env[0] : 0;
  const sustain = env.length >= 5 ? env[env.length - 1] - env[env.length >> 1] : 0;
  const transientRatio = attack - sustain;

  return [
    { id: 'duration', label: '長さ', value: mono.length / sampleRate, precision: 3, unit: 's' },
    { id: 'startSilence', label: '先頭無音(近似)', value: startMs, precision: 1, unit: 'ms' },
    { id: 'endSilence', label: '末尾無音(近似)', value: endMs, precision: 1, unit: 'ms' },
    { id: 'onsets', label: 'オンセット数(近似)', value: onsets, precision: 0, unit: '' },
    { id: 'density', label: 'オンセット密度', value: density, precision: 2, unit: '/s' },
    { id: 'envVar', label: '包絡レンジ', value: envVar, precision: 2, unit: 'dB' },
    { id: 'transientRatio', label: 'トランジェント傾向', value: transientRatio, precision: 2, unit: 'dB' }
  ];
}
