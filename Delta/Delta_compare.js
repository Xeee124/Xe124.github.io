
import { decodeFile, getChannels, mixChannels, resampleAudioBuffer, resampleLinear, alignByLag, estimateLag, wavBlobFromStereo, rms, toDb, zscore } from './Delta_core.js';
import { analyzeVolume } from './Delta_volume.js';
import { analyzeFrequency } from './Delta_frequency.js';
import { analyzePhaseFrequency } from './Delta_phase_frequency.js';
import { analyzePhaseLR } from './Delta_phase_lr.js';
import { analyzeTime } from './Delta_time.js';
import { analyzePerceptual } from './Delta_perceptual.js';
import { analyzeOther } from './Delta_other.js';

export const CATEGORIES = [
  { id: 'volume', label: '音量(振幅系)', run: analyzeVolume },
  { id: 'frequency', label: '周波数', run: analyzeFrequency },
  { id: 'phaseFreq', label: '位相(周波数)', run: analyzePhaseFrequency },
  { id: 'phaseLR', label: '位相(左右)', run: analyzePhaseLR },
  { id: 'time', label: '時間', run: analyzeTime },
  { id: 'perceptual', label: '知覚系', run: analyzePerceptual },
  { id: 'other', label: 'その他', run: analyzeOther }
];

export async function loadRawFile(file) {
  const audio = await decodeFile(file);
  const channels = getChannels(audio);
  const mono = mixChannels(channels);
  const left = channels[0] || new Float32Array(0);
  const right = channels[1] || left;

  return {
    file,
    audio,
    sampleRate: audio.sampleRate,
    channels: audio.numberOfChannels,
    length: audio.length,
    left,
    right,
    mono,
    originalSampleRate: audio.sampleRate,
    originalLength: audio.length
  };
}

function makeProcessedFromAudio(audio, originalFile) {
  const channels = getChannels(audio);
  const mono = mixChannels(channels);
  const left = channels[0] || new Float32Array(0);
  const right = channels[1] || left;
  return {
    file: originalFile,
    audio,
    sampleRate: audio.sampleRate,
    channels: audio.numberOfChannels,
    length: audio.length,
    left,
    right,
    mono,
    originalSampleRate: originalFile.sampleRate,
    originalLength: originalFile.length
  };
}

function chooseTargetRate(rawA, rawB) {
  return Math.max(rawA.sampleRate, rawB.sampleRate);
}

async function prepareForComparison(rawA, rawB, mode) {
  const sameSampleRate = rawA.sampleRate === rawB.sampleRate;
  const sameSampleCount = rawA.length === rawB.length;

  if (mode === 'strict') {
    if (!sameSampleRate) {
      return {
        error: 'strictモードではサンプルレート一致が必要です',
        sameSampleRate,
        sameSampleCount,
        mode: 'strict'
      };
    }
    const len = Math.min(rawA.length, rawB.length);
    return {
      mode: sameSampleCount ? 'exact' : 'trim',
      modeLabel: sameSampleCount ? '同SR・同長さ' : '同SR・長さ違い(切り詰め)',
      sampleRateMatch: true,
      sampleCountMatch: sameSampleCount,
      procA: trimProc(rawA, len),
      procB: trimProc(rawB, len)
    };
  }

  if (sameSampleRate && sameSampleCount) {
    return {
      mode: 'exact',
      modeLabel: '同SR・同長さ',
      sampleRateMatch: true,
      sampleCountMatch: true,
      procA: trimProc(rawA, rawA.length),
      procB: trimProc(rawB, rawB.length)
    };
  }

  if (sameSampleRate) {
    const len = Math.min(rawA.length, rawB.length);
    return {
      mode: 'trim',
      modeLabel: '同SR・長さ違い(切り詰め)',
      sampleRateMatch: true,
      sampleCountMatch: false,
      procA: trimProc(rawA, len),
      procB: trimProc(rawB, len)
    };
  }

  const targetRate = chooseTargetRate(rawA, rawB);
  const audioA = rawA.sampleRate === targetRate ? rawA.audio : await resampleAudioBuffer(rawA.audio, targetRate);
  const audioB = rawB.sampleRate === targetRate ? rawB.audio : await resampleAudioBuffer(rawB.audio, targetRate);
  const procA = makeProcessedFromAudio(audioA, rawA);
  const procB = makeProcessedFromAudio(audioB, rawB);
  const len = Math.min(procA.length, procB.length);
  return {
    mode: 'resample',
    modeLabel: `SR違い→${targetRate}Hzへ統一`,
    sampleRateMatch: false,
    sampleCountMatch: procA.length === procB.length,
    procA: trimProc(procA, len),
    procB: trimProc(procB, len)
  };
}

function trimProc(proc, len) {
  return {
    ...proc,
    mono: proc.mono.subarray(0, len),
    left: proc.left.subarray(0, len),
    right: proc.right.subarray(0, len),
    length: len
  };
}

function analyzeAll(procA, procB) {
  const categoriesA = {};
  const categoriesB = {};
  for (const cat of CATEGORIES) {
    categoriesA[cat.id] = cat.run(procA);
    categoriesB[cat.id] = cat.run(procB);
  }
  return { categoriesA, categoriesB };
}

function correlation(a, b) {
  const len = Math.min(a.length, b.length);
  let ma = 0, mb = 0;
  for (let i = 0; i < len; i++) {
    ma += a[i];
    mb += b[i];
  }
  ma /= len || 1;
  mb /= len || 1;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < len; i++) {
    const x = a[i] - ma;
    const y = b[i] - mb;
    num += x * y;
    da += x * x;
    db += y * y;
  }
  return num / Math.sqrt(da * db + 1e-12);
}

function scaleArray(arr, gain) {
  const out = new Float32Array(arr.length);
  for (let i = 0; i < arr.length; i++) out[i] = arr[i] * gain;
  return out;
}

function diffStereo(a, b) {
  const len = Math.min(a.left.length, b.left.length, a.right.length, b.right.length);
  const left = new Float32Array(len);
  const right = new Float32Array(len);
  let s = 0;
  for (let i = 0; i < len; i++) {
    left[i] = a.left[i] - b.left[i];
    right[i] = a.right[i] - b.right[i];
    s += (left[i] * left[i] + right[i] * right[i]) * 0.5;
  }
  return { left, right, rms: Math.sqrt(s / Math.max(1, len)) };
}

function alignStereoByLag(a, b, lagSamples) {
  if (lagSamples === 0) return { a, b, len: Math.min(a.length, b.length) };
  if (lagSamples > 0) {
    const len = Math.min(a.length, b.length - lagSamples);
    return {
      a: trimProc(a, len),
      b: {
        ...b,
        mono: b.mono.subarray(lagSamples, lagSamples + len),
        left: b.left.subarray(lagSamples, lagSamples + len),
        right: b.right.subarray(lagSamples, lagSamples + len),
        length: len
      },
      len
    };
  }
  const shift = -lagSamples;
  const len = Math.min(a.length - shift, b.length);
  return {
    a: {
      ...a,
      mono: a.mono.subarray(shift, shift + len),
      left: a.left.subarray(shift, shift + len),
      right: a.right.subarray(shift, shift + len),
      length: len
    },
    b: trimProc(b, len),
    len
  };
}

export async function processFiles(fileA, fileB, mode = 'auto') {
  const [rawA, rawB] = await Promise.all([loadRawFile(fileA), loadRawFile(fileB)]);
  const prep = await prepareForComparison(rawA, rawB, mode);
  if (prep.error) {
    return { error: prep.error, rawA, rawB };
  }

  const analysis = analyzeAll(prep.procA, prep.procB);
  const sameRate = prep.sampleRateMatch;
  const sameCount = prep.sampleCountMatch;

  let alignedA = prep.procA;
  let alignedB = prep.procB;
  let lagSamples = 0;
  let lagMs = 0;
  let alignedCorr = correlation(alignedA.mono, alignedB.mono);

  if (mode === 'auto' && prep.mode === 'resample') {
    const dsA = resampleLinear(alignedA.mono, alignedA.sampleRate, 1000);
    const dsB = resampleLinear(alignedB.mono, alignedB.sampleRate, 1000);
    const zA = zscore(dsA);
    const zB = zscore(dsB);
    const lag = estimateLag(zA, zB, 1000, 1000);
    lagSamples = lag.lagSamples;
    lagMs = lagSamples;
    const lagOrig = Math.round(lagSamples * (alignedA.sampleRate / 1000));
    const aligned = alignStereoByLag(alignedA, alignedB, lagOrig);
    alignedA = aligned.a;
    alignedB = aligned.b;
    alignedCorr = correlation(alignedA.mono, alignedB.mono);
  }

  const diff = diffStereo(alignedA, alignedB);
  const diffRmsDb = toDb(diff.rms);
  const refRms = Math.max(rms(alignedA.mono), 1e-12);
  const nullDepthDb = toDb(diff.rms / refRms);

  const rmsA = rms(alignedA.mono);
  const rmsB = rms(alignedB.mono);
  const gain = rmsB > 0 ? rmsA / rmsB : 1;
  const scaledB = {
    ...alignedB,
    mono: scaleArray(alignedB.mono, gain),
    left: scaleArray(alignedB.left, gain),
    right: scaleArray(alignedB.right, gain)
  };
  const matchedDiff = diffStereo(alignedA, scaledB);
  const rmsMatchedResidualDb = toDb(matchedDiff.rms);

  return {
    rawA,
    rawB,
    procA: prep.procA,
    procB: prep.procB,
    compare: {
      mode: prep.mode,
      modeLabel: prep.modeLabel,
      sampleRateMatch: sameRate,
      sampleCountMatch: sameCount,
      lagSamples,
      lagMs,
      alignedCorr,
      residualRmsDb: diffRmsDb,
      rmsMatchedResidualDb,
      nullDepthDb,
      diffRmsDb,
      alignedA,
      alignedB,
      diffStereo: diff
    },
    analysis
  };
}
