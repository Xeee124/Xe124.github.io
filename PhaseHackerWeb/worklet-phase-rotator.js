// =============================================================
// worklet-phase-rotator.js — AudioWorklet (リアルタイム再生用)
// このファイルはBlob URL経由でAudioWorkletに登録される
// =============================================================

class PhaseRotatorProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [{ name: 'phase', defaultValue: 0, automationRate: 'k-rate' }];
  }

  constructor() {
    super();
    this.iCh    = null; // originalData (Float32Array[])
    this.qCh    = null; // hilbertData  (Float64Array[])
    this.pos    = 0;
    this.stereo = false;
    this.port.onmessage = e => {
      if (e.data.i) {
        this.iCh    = e.data.i;
        this.qCh    = e.data.q;
        this.pos    = 0;
        this.stereo = e.data.stereo;
      }
    };
  }

  process(_inputs, outputs, parameters) {
    const out = outputs[0];
    if (!this.iCh || !this.qCh) return true;

    const phaseDeg = parameters.phase[0];
    const totalLen = this.iCh[0].length;

    for (let i = 0; i < out[0].length; i++) {
      if (this.pos >= totalLen) {
        for (const ch of out) ch[i] = 0;
        continue;
      }
      for (let ch = 0; ch < out.length; ch++) {
        // ステレオ: Rチャンネルは逆回転
        const sign = (this.stereo && ch === 1) ? -1 : 1;
        const ph   = sign * phaseDeg * Math.PI / 180;
        const c = Math.cos(ph), s = Math.sin(ph);
        const ib = this.iCh[ch], qb = this.qCh[ch];
        out[ch][i] = ib ? ib[this.pos] * c - qb[this.pos] * s : 0;
      }
      this.pos++;
    }

    if (this.pos >= totalLen) this.port.postMessage({ ended: true });
    return true;
  }
}

registerProcessor('phase-rotator', PhaseRotatorProcessor);
