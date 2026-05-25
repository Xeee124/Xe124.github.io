// =============================================================
// dsp-hilbert.js — 理想ヒルベルト変換 + DC除去
// =============================================================
import { fft, ifft } from './dsp-fft.js';

// 端の循環折り返しアーチファクト抑圧用ハニングフェード
function makeEdgeFade(len) {
  const fadeLen = Math.min(2048, Math.floor(len * 0.01));
  const fade = new Float64Array(fadeLen);
  for (let i = 0; i < fadeLen; i++)
    fade[i] = 0.5 * (1 - Math.cos(Math.PI * i / fadeLen));
  return fade;
}

/**
 * 理想ヒルベルト変換
 * - エッジフェードで循環折り返しを抑圧
 * - DC (bin[0] = 0Hz) を完全除去（0.00001Hz以上は無傷）
 * - 内部計算 Float64、戻り値 Float64Array
 */
export function hilbert(sig) {
  const len = sig.length;
  const N   = 1 << Math.ceil(Math.log2(len));
  const re  = new Float64Array(N);
  const im  = new Float64Array(N);

  const fade = makeEdgeFade(len);
  const fLen = fade.length;
  for (let i = 0; i < len; i++) {
    let s = sig[i];
    if (i < fLen)          s *= fade[i];
    if (i >= len - fLen)   s *= fade[len - 1 - i];
    re[i] = s;
  }

  fft(re, im);

  // DC完全除去: bin[0]のみゼロ
  re[0] = 0; im[0] = 0;

  // 解析信号化: 正周波数×2、ナイキストはそのまま、負周波数=0
  const h = N >> 1;
  for (let i = 1; i < h; i++) { re[i] *= 2; im[i] *= 2; }
  for (let i = h + 1; i < N; i++) { re[i] = 0; im[i] = 0; }

  ifft(re, im);

  // 独立バッファとしてコピーして返す
  return im.slice(0, len);
}

/** Mid = (L+R)/2、モノラルはch[0]をFloat64に昇格 */
export function makeMid(origData) {
  if (origData.length === 1) {
    const a = origData[0];
    const out = new Float64Array(a.length);
    for (let i = 0; i < a.length; i++) out[i] = a[i];
    return out;
  }
  const L = origData[0], R = origData[1], len = L.length;
  const mid = new Float64Array(len);
  for (let i = 0; i < len; i++) mid[i] = (L[i] + R[i]) * 0.5;
  return mid;
}

/** Mid Hilbert = (hL+hR)/2、モノラルはそのまま */
export function makeMidHilbert(hilbData) {
  if (hilbData.length === 1) return hilbData[0];
  const L = hilbData[0], R = hilbData[1], len = L.length;
  const mid = new Float64Array(len);
  for (let i = 0; i < len; i++) mid[i] = (L[i] + R[i]) * 0.5;
  return mid;
}
