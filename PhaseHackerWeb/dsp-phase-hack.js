// =============================================================
// dsp-phase-hack.js — Phase Hack角度探索
//   3候補: Symmetric / PeakMin / Balanced
//   評価:  レゾナンスQ値スコア → 差≤5%なら自己相関ピーク強度
// =============================================================
import { fft, ifft } from './dsp-fft.js';
import { makeMid, makeMidHilbert } from './dsp-hilbert.js';

// ----- 共通ユーティリティ -----------------------------------

function normalizeDeg(deg) {
  return ((deg + 180) % 360 + 360) % 360 - 180;
}

/**
 * 回転後のMid波形の max/min/peak/balance をストライドスキャンで高速計算
 * balance = max + min → 0 が上下対称
 */
function calcPeak(io, qo, deg) {
  const len    = Math.min(io.length, qo.length);
  const ph     = normalizeDeg(deg) * Math.PI / 180;
  const c = Math.cos(ph), s = Math.sin(ph);
  const stride = Math.max(1, Math.floor(len / 8000));
  let max = -Infinity, min = Infinity;
  for (let i = 0; i < len; i += stride) {
    const y = io[i] * c - qo[i] * s;
    if (y > max) max = y;
    if (y < min) min = y;
  }
  return { max, min, peak: Math.max(Math.abs(max), Math.abs(min)), balance: max + min };
}

/**
 * balance = max + min を返す評価関数
 * ゼロクロスが対称 = balance → 0
 */
function evalBalance(io, qo, deg) {
  const { max, min } = calcPeak(io, qo, deg);
  return max + min;
}

// ----- 候補1: Symmetric ------------------------------------

/**
 * evalBalance = 0 になる角度を二分法48ステップで全探索し、
 * 絶対値が最小（0°に近い）の根を返す
 */
function findSymmetricAngle(io, qo) {
  const TOLERANCE  = 1e-5;
  const STEP       = 0.5;
  const BISECT_ITR = 48;

  const roots = [];
  let prevDeg = -180, prevVal = evalBalance(io, qo, prevDeg);

  for (let deg = -179.5; deg <= 180; deg += STEP) {
    const curVal = evalBalance(io, qo, deg);
    if (Number.isFinite(prevVal) && Number.isFinite(curVal)) {
      // 符号反転または許容誤差以内
      const signChange = (prevVal < 0 && curVal > 0) || (prevVal > 0 && curVal < 0);
      if (Math.abs(prevVal) <= TOLERANCE) {
        roots.push(prevDeg);
      } else if (signChange || curVal === 0) {
        let lo = prevDeg, hi = deg, fLo = prevVal;
        for (let k = 0; k < BISECT_ITR; k++) {
          const mid = (lo + hi) / 2;
          const fMid = evalBalance(io, qo, mid);
          if (!Number.isFinite(fMid)) break;
          if (Math.abs(fMid) <= TOLERANCE) { lo = hi = mid; break; }
          if ((fLo < 0 && fMid > 0) || (fLo > 0 && fMid < 0)) { hi = mid; }
          else { lo = mid; fLo = fMid; }
        }
        roots.push(normalizeDeg((lo + hi) / 2));
      }
    }
    prevDeg = deg; prevVal = curVal;
  }

  if (!roots.length) {
    // 根なし → 粗→細探索でbalance絶対値最小点
    let bestDeg = 0, bestAbs = Infinity;
    for (let deg = -180; deg <= 180; deg += 0.5) {
      const a = Math.abs(evalBalance(io, qo, deg));
      if (a < bestAbs) { bestAbs = a; bestDeg = deg; }
    }
    for (let deg = bestDeg - 0.6; deg <= bestDeg + 0.6; deg += 0.005) {
      const a = Math.abs(evalBalance(io, qo, deg));
      if (a < bestAbs) { bestAbs = a; bestDeg = deg; }
    }
    return normalizeDeg(bestDeg);
  }

  // 重複除去 → |deg| 最小の根を返す
  const uniq = [];
  for (const d of roots) {
    const n = normalizeDeg(d);
    if (!uniq.some(v => Math.abs(normalizeDeg(v - n)) < 0.15)) uniq.push(n);
  }
  uniq.sort((a, b) => Math.abs(a) - Math.abs(b));
  return normalizeDeg(uniq[0]);
}

// ----- 候補2: PeakMin --------------------------------------

/** peak絶対値が最小になる角度（粗→細） */
function findPeakMinAngle(io, qo) {
  let bestDeg = 0, bestPeak = Infinity;
  for (let deg = -180; deg <= 180; deg += 0.5) {
    const { peak } = calcPeak(io, qo, deg);
    if (peak < bestPeak) { bestPeak = peak; bestDeg = deg; }
  }
  for (let deg = bestDeg - 0.6; deg <= bestDeg + 0.6; deg += 0.005) {
    const { peak } = calcPeak(io, qo, deg);
    if (peak < bestPeak) { bestPeak = peak; bestDeg = deg; }
  }
  return normalizeDeg(bestDeg);
}

// ----- 候補3: Balanced -------------------------------------

/**
 * 全対称点（balance≒0）を列挙し、その中でpeak最小のものを返す
 * = 上下対称を守りながらヘッドルームを最大化
 */
function findBalancedAngle(io, qo) {
  const TOLERANCE  = 1e-4;
  const BISECT_ITR = 48;
  const symCandidates = [];

  let prevDeg = -180, prevVal = evalBalance(io, qo, prevDeg);
  for (let deg = -179.5; deg <= 180; deg += 0.5) {
    const curVal = evalBalance(io, qo, deg);
    if (Number.isFinite(prevVal) && Number.isFinite(curVal)) {
      const signChange = (prevVal < 0 && curVal > 0) || (prevVal > 0 && curVal < 0);
      if (signChange || Math.abs(prevVal) < TOLERANCE) {
        let lo = prevDeg, hi = deg, fLo = prevVal;
        for (let k = 0; k < BISECT_ITR; k++) {
          const mid = (lo + hi) / 2;
          const fMid = evalBalance(io, qo, mid);
          if (!Number.isFinite(fMid)) break;
          if (Math.abs(fMid) <= TOLERANCE) { lo = hi = mid; break; }
          if ((fLo < 0 && fMid > 0) || (fLo > 0 && fMid < 0)) { hi = mid; }
          else { lo = mid; fLo = fMid; }
        }
        const candDeg = normalizeDeg((lo + hi) / 2);
        symCandidates.push({ deg: candDeg, peak: calcPeak(io, qo, candDeg).peak });
      }
    }
    prevDeg = deg; prevVal = curVal;
  }

  if (!symCandidates.length) return findSymmetricAngle(io, qo);

  symCandidates.sort((a, b) => a.peak - b.peak);
  return normalizeDeg(symCandidates[0].deg);
}

// ----- レゾナンスQ値スコア ---------------------------------

/**
 * 帯域定義 [lo, hi] Hz + 重み
 * 重み順位: 3900-6300 / 6300-8150 / 8850-14200 / 2300-3600 (w=6)
 *           800-1600 / 250-600 (w=3)
 *           16300-18000 (w=2)
 *           400-700 (w=1)
 */
const RESONANCE_BANDS = [
  { lo:  3900, hi:  6300, w: 6.0 },
  { lo:  6300, hi:  8150, w: 6.0 },
  { lo:  8850, hi: 14200, w: 6.0 },
  { lo:  2300, hi:  3600, w: 6.0 },
  { lo:   800, hi:  1600, w: 3.0 },
  { lo:   250, hi:   600, w: 3.0 },
  { lo: 16300, hi: 18000, w: 2.0 },
  { lo:   400, hi:   700, w: 1.0 },
];

// バタワース臨界Q値
const Q_THRESHOLD = 1 / Math.SQRT2; // ≈ 0.7071

/** Hanning窓つきパワースペクトル（Float64） */
function computePowerSpectrum(signal, sr) {
  const len = signal.length;
  const N   = 1 << Math.ceil(Math.log2(len));
  const re  = new Float64Array(N);
  const im  = new Float64Array(N);
  for (let i = 0; i < len; i++) {
    const w = 0.5 * (1 - Math.cos(2 * Math.PI * i / (len - 1)));
    re[i] = signal[i] * w;
  }
  fft(re, im);
  const halfN  = N >> 1;
  const power  = new Float64Array(halfN);
  for (let i = 0; i < halfN; i++) power[i] = re[i]*re[i] + im[i]*im[i];
  return { power, freqRes: sr / N, halfN };
}

/**
 * 帯域内のパワースペクトルピークのQ値を推定
 * Q = center_freq / (-3dB bandwidth)
 */
function calcBandQ(power, freqRes, halfN, loHz, hiHz) {
  const loIdx = Math.max(1, Math.round(loHz / freqRes));
  const hiIdx = Math.min(halfN - 1, Math.round(hiHz / freqRes));
  if (loIdx >= hiIdx) return 0;

  let peakPow = 0, peakIdx = loIdx;
  for (let i = loIdx; i <= hiIdx; i++) {
    if (power[i] > peakPow) { peakPow = power[i]; peakIdx = i; }
  }
  if (peakPow === 0) return 0;

  const halfPow = peakPow * 0.5; // -3dB (power)

  let loIdx3dB = loIdx;
  for (let i = peakIdx; i >= loIdx; i--) {
    if (power[i] <= halfPow) { loIdx3dB = i; break; }
  }
  let hiIdx3dB = hiIdx;
  for (let i = peakIdx; i <= hiIdx; i++) {
    if (power[i] <= halfPow) { hiIdx3dB = i; break; }
  }

  const bwHz = (hiIdx3dB - loIdx3dB) * freqRes;
  if (bwHz <= 0) return Infinity;
  return (peakIdx * freqRes) / bwHz;
}

/**
 * レゾナンスQ値重み付きスコア
 * Q > Q_THRESHOLD の超過量を重み付き加算
 * 大きい = うるさい = 悪い
 */
function calcResonanceScore(signal, sr) {
  const { power, freqRes, halfN } = computePowerSpectrum(signal, sr);
  let score = 0;
  for (const band of RESONANCE_BANDS) {
    const q      = calcBandQ(power, freqRes, halfN, band.lo, band.hi);
    const excess = Math.max(0, q - Q_THRESHOLD);
    score += excess * band.w;
  }
  return score;
}

// ----- 自己相関ピーク強度 -----------------------------------

/**
 * FFTベース自己相関ピーク強度（O(N log N)、Float64）
 * 「芯の強さ」= 基音周期性 = 自己相関の正規化ピーク値
 * 戻り値: 0〜1（1に近いほど基音が支配的）
 */
function calcAutocorrPeakStrength(signal, sr) {
  const len = signal.length;
  // 線形自己相関のため2倍パディング
  const N  = 1 << Math.ceil(Math.log2(len * 2));
  const re = new Float64Array(N);
  const im = new Float64Array(N);

  // Hanning窓
  for (let i = 0; i < len; i++) {
    const w = 0.5 * (1 - Math.cos(2 * Math.PI * i / (len - 1)));
    re[i] = signal[i] * w;
  }

  fft(re, im);

  // |X|²: 自己パワースペクトル（虚部=0）
  for (let i = 0; i < N; i++) {
    re[i] = re[i]*re[i] + im[i]*im[i];
    im[i] = 0;
  }

  ifft(re, im); // → 自己相関関数（実部）

  const r0 = re[0]; // ラグ0 = 総エネルギー（正規化基準）
  if (r0 === 0) return 0;

  // 基音探索範囲: 20Hz〜1500Hz
  const lagMin = Math.max(2, Math.floor(sr / 1500));
  const lagMax = Math.min((N >> 1) - 1, Math.floor(sr / 20));

  // 局所ピークの中で最大の正規化値を返す（高調波偽ピーク防止）
  let best = 0;
  for (let lag = lagMin; lag <= lagMax; lag++) {
    const r = re[lag] / r0;
    if (r > re[lag-1]/r0 && r > re[lag+1]/r0 && r > best) best = r;
  }
  return Math.max(0, best);
}

// ----- メインエントリ ----------------------------------------

/**
 * Phase Hack角度を決定する
 * @param {Float32Array[]} origData  チャンネル配列（._sampleRateプロパティ必須）
 * @param {Float64Array[]} hilbData  hilbert()で生成したチャンネル配列
 * @returns {number} 最適回転角度 [degrees]
 */
export function findPhaseHackAngle(origData, hilbData) {
  const io = makeMid(origData);
  const qo = makeMidHilbert(hilbData);
  const sr = origData._sampleRate ?? 44100;

  // 3候補を計算
  const degSym      = findSymmetricAngle(io, qo);
  const degPeakMin  = findPeakMinAngle(io, qo);
  const degBalanced = findBalancedAngle(io, qo);

  const candidates = [
    { name: 'Symmetric', deg: degSym },
    { name: 'PeakMin',   deg: degPeakMin },
    { name: 'Balanced',  deg: degBalanced },
  ];

  // 各候補の出力Mid波形を生成してスコア計算
  for (const cand of candidates) {
    const ph = cand.deg * Math.PI / 180;
    const c = Math.cos(ph), s = Math.sin(ph);
    const rotated = new Float32Array(io.length);
    for (let n = 0; n < io.length; n++) rotated[n] = io[n] * c - qo[n] * s;

    cand.resonanceScore = calcResonanceScore(rotated, sr);
    cand.autocorrPeak   = calcAutocorrPeakStrength(rotated, sr);
    cand.peakData       = calcPeak(io, qo, cand.deg);
  }

  // レゾナンススコア差が5%以内か判定
  const scores = candidates.map(c => c.resonanceScore);
  const rMin   = Math.min(...scores);
  const rMax   = Math.max(...scores);
  const relRange = rMin > 0 ? (rMax - rMin) / rMin : (rMax - rMin);

  let chosen, reason;
  if (relRange < 0.05) {
    // 誤差範囲 → 自己相関ピーク強度最大（芯が最も強い）
    candidates.sort((a, b) => b.autocorrPeak - a.autocorrPeak);
    chosen = candidates[0];
    reason = `autocorr-peak (scoreRange=${(relRange*100).toFixed(2)}%)`;
  } else {
    // スコア差あり → レゾナンス最小（耳に優しい）
    candidates.sort((a, b) => a.resonanceScore - b.resonanceScore);
    chosen = candidates[0];
    reason = `resonance-score (scoreRange=${(relRange*100).toFixed(2)}%)`;
  }

  // コンソールに全候補の数値を出力
  console.group('Phase Hack 評価結果');
  for (const name of ['Symmetric', 'PeakMin', 'Balanced']) {
    const c = candidates.find(x => x.name === name);
    if (!c) continue;
    console.log(
      `${name.padEnd(10)}: ${c.deg.toFixed(4)}° | ` +
      `Q-score: ${c.resonanceScore.toFixed(6)} | ` +
      `autocorr: ${c.autocorrPeak.toFixed(6)} | ` +
      `peak: ${c.peakData.peak.toFixed(6)} | ` +
      `balance: ${c.peakData.balance.toFixed(6)}`
    );
  }
  console.log(`→ 選択: ${chosen.name} (${chosen.deg.toFixed(4)}°) [判定: ${reason}]`);
  console.groupEnd();

  return normalizeDeg(chosen.deg);
}
