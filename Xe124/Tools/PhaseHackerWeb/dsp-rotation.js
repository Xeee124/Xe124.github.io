// =============================================================
// dsp-rotation.js — 位相回転・ノーマライズ・WAVエンコード/デコード
// =============================================================

// ----- 位相回転 ---------------------------------------------

/**
 * 位相回転を適用してチャンネル配列を返す
 * モノラル: +deg
 * ステレオ: L=+deg, R=−deg（Mid成分の上下対称を維持）
 * 計算Float64 → 出力Float32
 */
export function applyPhaseRotation(origData, hilbData, deg) {
  const isStereo = origData.length >= 2;
  return origData.map((io, chIdx) => {
    const sign = (isStereo && chIdx === 1) ? -1 : 1;
    const ph   = sign * deg * Math.PI / 180;
    const c = Math.cos(ph), s = Math.sin(ph);
    const qo  = hilbData[chIdx];
    const out = new Float32Array(io.length);
    for (let n = 0; n < io.length; n++) out[n] = io[n] * c - qo[n] * s;
    return out;
  });
}

// ----- ノーマライズ -----------------------------------------

/**
 * Mid成分のPeakを基準にノーマライズ
 * - targetDb=0 → Mid PeakのどちらかがちょうどFSに張り付く
 * - 全チャンネルに同一ゲインを適用（L/Rバランス保持）
 */
export function applyNormalize(channels, targetDb) {
  const targetLin = Math.pow(10, targetDb / 20);
  const len = channels[0].length;
  let maxMid = 0, minMid = 0;

  if (channels.length === 1) {
    for (let i = 0; i < len; i++) {
      const v = channels[0][i];
      if (v > maxMid) maxMid = v;
      if (v < minMid) minMid = v;
    }
  } else {
    const L = channels[0], R = channels[1];
    for (let i = 0; i < len; i++) {
      const m = (L[i] + R[i]) * 0.5;
      if (m > maxMid) maxMid = m;
      if (m < minMid) minMid = m;
    }
  }

  const peak = Math.max(maxMid, Math.abs(minMid));
  if (peak === 0) return channels;
  const gain = targetLin / peak;

  return channels.map(ch => {
    const out = new Float32Array(ch.length);
    for (let i = 0; i < ch.length; i++) out[i] = ch[i] * gain;
    return out;
  });
}

// ----- WAVエンコーダ ----------------------------------------

/**
 * WAVエンコード（オリジナルのbit深度・srを維持）
 * @param {Float32Array[]} channels
 * @param {number} rate  サンプルレート
 * @param {number} bits  0=32bit float / 16 / 24 / 32=32bit int PCM
 * @returns {Uint8Array}  JSZip・Blobどちらにも渡せる
 */
export function encodeWAV(channels, rate, bits) {
  const numCh   = channels.length;
  const len     = channels[0].length;
  const isFloat = (bits === 0);
  const audioFmt = isFloat ? 3 : 1;
  const outBits  = isFloat ? 32 : (bits || 24);
  const bytesPS  = outBits >> 3;
  const block    = numCh * bytesPS;
  const fmtSize  = isFloat ? 18 : 16; // float WAVはcbSize=0で18byte
  const dataSize = len * block;
  const bufSize  = 12 + (8 + fmtSize) + (8 + dataSize);

  const ab = new ArrayBuffer(bufSize);
  const dv = new DataView(ab);
  let p = 0;

  const wStr = str => { for (let i = 0; i < str.length; i++) dv.setUint8(p++, str.charCodeAt(i)); };
  const w16  = n   => { dv.setUint16(p, n, true); p += 2; };
  const w32  = n   => { dv.setUint32(p, n, true); p += 4; };

  // RIFFヘッダ
  wStr('RIFF'); w32(bufSize - 8); wStr('WAVE');

  // fmtチャンク
  wStr('fmt '); w32(fmtSize);
  w16(audioFmt); w16(numCh); w32(rate);
  w32(rate * block); w16(block); w16(outBits);
  if (isFloat) w16(0); // cbSize

  // dataチャンク
  wStr('data'); w32(dataSize);

  for (let i = 0; i < len; i++) {
    for (let ch = 0; ch < numCh; ch++) {
      const s = channels[ch][i];
      if (isFloat) {
        dv.setFloat32(p, s, true); p += 4;
      } else if (outBits === 16) {
        const iv = Math.max(-32768, Math.min(32767,
          s < 0 ? Math.round(s * 32768) : Math.round(s * 32767)));
        dv.setInt16(p, iv, true); p += 2;
      } else if (outBits === 24) {
        // read/writeともに8388608で統一（可逆性保証）
        const iv = Math.max(-8388608, Math.min(8388607, Math.round(s * 8388608)));
        dv.setUint8(p,   iv & 0xFF);
        dv.setUint8(p+1, (iv >> 8)  & 0xFF);
        dv.setUint8(p+2, (iv >> 16) & 0xFF);
        p += 3;
      } else {
        // 32bit int
        const iv = Math.max(-2147483648, Math.min(2147483647,
          s < 0 ? Math.round(s * 2147483648) : Math.round(s * 2147483647)));
        dv.setInt32(p, iv, true); p += 4;
      }
    }
  }

  return new Uint8Array(ab);
}

// ----- WAVパーサー ------------------------------------------

/**
 * WAVファイルをAudioContextを介さず直接パース
 * サンプルレート・ビット深度・フォーマットを完全保持
 * @returns {{ channels: Float32Array[], sampleRate: number, bits: number, audioFmt: number } | null}
 *   bits=0 は32bit IEEE float
 */
export function parseWAV(arrayBuf) {
  const dv  = new DataView(arrayBuf);
  const str = (off, len) => {
    let s = '';
    for (let i = 0; i < len; i++) s += String.fromCharCode(dv.getUint8(off + i));
    return s;
  };

  if (str(0, 4) !== 'RIFF' || str(8, 4) !== 'WAVE') return null;

  let p = 12;
  let fmt = null, dataOff = 0, dataSize = 0;

  while (p < dv.byteLength - 8) {
    const id = str(p, 4);
    const sz = dv.getUint32(p + 4, true);

    if (id === 'fmt ') {
      fmt = {
        audioFmt:   dv.getUint16(p + 8,  true),
        numCh:      dv.getUint16(p + 10, true),
        sampleRate: dv.getUint32(p + 12, true),
        bits:       dv.getUint16(p + 22, true),
      };
    } else if (id === 'data') {
      dataOff  = p + 8;
      dataSize = sz;
      break;
    }
    p += 8 + sz + (sz & 1); // paddingも考慮
  }

  if (!fmt || !dataOff) return null;

  const { audioFmt, numCh, sampleRate, bits } = fmt;
  // audioFmt=3(IEEE float) → encodeWAVへはbits=0(float flag)で渡す
  const outBitsFlag  = (audioFmt === 3) ? 0 : bits;
  const bytesPS      = bits >> 3;
  const numSamples   = Math.floor(dataSize / (numCh * bytesPS));
  const channels     = Array.from({ length: numCh }, () => new Float32Array(numSamples));

  let off = dataOff;
  for (let i = 0; i < numSamples; i++) {
    for (let ch = 0; ch < numCh; ch++) {
      let val;
      if (audioFmt === 3) {
        val = dv.getFloat32(off, true);
      } else if (bits === 16) {
        val = dv.getInt16(off, true) / 32768;
      } else if (bits === 24) {
        // 8388608で除算（可逆性保証・read/writeで統一）
        const lo = dv.getUint8(off), mi = dv.getUint8(off+1), hi = dv.getInt8(off+2);
        val = ((hi << 16) | (mi << 8) | lo) / 8388608;
      } else if (bits === 32) {
        val = dv.getInt32(off, true) / 2147483648;
      } else {
        val = 0;
      }
      channels[ch][i] = val;
      off += bytesPS;
    }
  }

  return { channels, sampleRate, bits: outBitsFlag, audioFmt };
}

// ----- デコーダ（WAV優先・非WAVフォールバック） ----------------

/**
 * ファイルをデコードしてチャンネル配列+フォーマット情報を返す
 * WAV → parseWAVで完全保持
 * 非WAV → AudioContextフォールバック（sr保持を試みる）
 */
export async function decodeAudioFileRaw(file) {
  const arrayBuf = await file.arrayBuffer();

  // WAV判定: 拡張子またはRIFFヘッダ
  const header = new Uint8Array(arrayBuf, 0, 4);
  const isWav  = /\.wav$/i.test(file.name) ||
    String.fromCharCode(...header) === 'RIFF';

  if (isWav) {
    const parsed = parseWAV(arrayBuf);
    if (parsed) return parsed;
  }

  // 非WAVフォールバック: オリジナルsrを2段階で取得
  const AC = window.AudioContext || window.webkitAudioContext;
  const ctx1  = new AC();
  const probe = await ctx1.decodeAudioData(arrayBuf.slice(0));
  const origSr = probe.sampleRate;
  await ctx1.close();

  const ctx2  = new AC({ sampleRate: origSr });
  const audio = await ctx2.decodeAudioData(arrayBuf.slice(0));
  await ctx2.close();

  const numCh   = Math.min(2, audio.numberOfChannels);
  const channels = [];
  for (let c = 0; c < numCh; c++)
    channels.push(new Float32Array(audio.getChannelData(c)));

  return { channels, sampleRate: origSr, bits: 0, audioFmt: 3 };
}
