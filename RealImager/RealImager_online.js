// File: RealImager_online.js
// 式2：ScriptProcessorNode（互換性優先）でリアルタイムSO(2)回転
// ヒルベルトFIR + 純遅延補償でMid不変を保証

const RIOnline = {
  audioCtx: null,
  source: null,
  processor: null,
  analyser: null,
  K: 64, // FIR半長（タップ数 = 2K+1 = 129）
  hFIR: null,
  bufSize: 2048,

  // S, M のリングバッファ（遅延補償用）
  Sbuf: null, Mbuf: null,
  // ヒルベルトFIR履歴
  Sfir: null,
  bufIdx: 0,

  theta: 0,
  thetaTarget: 0,
  bypass: false,

  // 計測用最新ブロック
  lastL: null, lastR: null, lastLp: null, lastRp: null, lastM: null, lastMp: null,

  init() {
    this.hFIR = RICore.hilbertFIR(this.K, 'blackman');
    const ringLen = this.K * 4 + this.bufSize;
    this.Sbuf = new Float32Array(ringLen);
    this.Mbuf = new Float32Array(ringLen);
    this.Sfir = new Float32Array(this.hFIR.length);
    this.bufIdx = 0;
  },

  ensureContext() {
    if (!this.audioCtx) {
      this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (this.audioCtx.state === 'suspended') this.audioCtx.resume();
    return this.audioCtx;
  },

  setTheta(t) {
    this.thetaTarget = t;
  },

  setBypass(b) {
    this.bypass = b;
  },

  // ScriptProcessorで処理
  attachSource(srcNode, gainNode) {
    if (this.processor) this.processor.disconnect();
    const proc = this.audioCtx.createScriptProcessor(this.bufSize, 2, 2);
    proc.onaudioprocess = (e) => this._onAudio(e);
    this.processor = proc;
    srcNode.connect(proc);
    proc.connect(gainNode);
    return proc;
  },

  _onAudio(e) {
    const inL = e.inputBuffer.getChannelData(0);
    const inR = e.inputBuffer.getChannelData(1);
    const outL = e.outputBuffer.getChannelData(0);
    const outR = e.outputBuffer.getChannelData(1);
    const N = inL.length;

    if (this.bypass) {
      outL.set(inL); outR.set(inR);
      this.lastL = inL.slice(); this.lastR = inR.slice();
      this.lastLp = inL.slice(); this.lastRp = inR.slice();
      this.lastM = null; this.lastMp = null;
      return;
    }

    // θ補間（ブロック内線形）
    const t0 = this.theta;
    const t1 = this.thetaTarget;
    const ringLen = this.Sbuf.length;
    const K = this.K;
    const h = this.hFIR;
    const hLen = h.length;

    const Lp = new Float32Array(N);
    const Rp = new Float32Array(N);
    const Mlog = new Float32Array(N);
    const Mplog = new Float32Array(N);

    for (let n = 0; n < N; n++) {
      const M = 0.5 * (inL[n] + inR[n]);
      const S = 0.5 * (inL[n] - inR[n]);

      // リングバッファ書き込み
      this.Sbuf[this.bufIdx] = S;
      this.Mbuf[this.bufIdx] = M;

      // ヒルベルトFIR：S を畳み込み
      // h[k] と S[bufIdx-k] (k=0..hLen-1)
      let sHat = 0;
      for (let k = 0; k < hLen; k++) {
        let idx = this.bufIdx - k;
        if (idx < 0) idx += ringLen;
        sHat += h[k] * this.Sbuf[idx];
      }
      // sHat は S[bufIdx - K] のヒルベルト近似

      // K サンプル遅延した S と M
      let dIdx = this.bufIdx - K;
      if (dIdx < 0) dIdx += ringLen;
      const Sd = this.Sbuf[dIdx];
      const Md = this.Mbuf[dIdx];

      // θ補間
      const alpha = n / N;
      const th = t0 + (t1 - t0) * alpha;
      const c = Math.cos(th), s = Math.sin(th);
      const Sp = c * Sd + s * sHat;

      Lp[n] = Md + Sp;
      Rp[n] = Md - Sp;

      Mlog[n] = Md;
      Mplog[n] = 0.5 * (Lp[n] + Rp[n]);

      this.bufIdx++;
      if (this.bufIdx >= ringLen) this.bufIdx = 0;
    }

    this.theta = t1;

    outL.set(Lp);
    outR.set(Rp);

    // 計測ログ
    this.lastL = inL.slice(); this.lastR = inR.slice();
    this.lastLp = Lp; this.lastRp = Rp;
    this.lastM = Mlog; this.lastMp = Mplog;
  },

  computeMetrics() {
    if (!this.lastL) return null;
    const midErr = (this.lastM && this.lastMp)
      ? RICore.midError(this.lastM, this.lastMp)
      : -200;
    const powErr = RICore.powerError(this.lastL, this.lastR, this.lastLp, this.lastRp);
    const corr = RICore.correlation(this.lastLp, this.lastRp);
    return { midErr, powErr, corr };
  }
};