// File: RealImager_ui.js
// UI統合・ファイルI/O・メーター更新

(function() {
  let state = {
    mode: 'online',
    theta: 0,
    bypass: false,
    audioCtx: null,
    sourceBuffer: null,
    sourceNode: null,
    gainNode: null,
    micStream: null,
    isPlaying: false,
    renderedBuffer: null,
  };

  RIOnline.init();

  // DOM
  const $ = (id) => document.getElementById(id);
  const thetaSlider = $('thetaSlider');
  const thetaDeg = $('thetaDeg');
  const thetaHint = $('thetaHint');

  function updateThetaDisplay() {
    const deg = parseFloat(thetaSlider.value);
    thetaDeg.textContent = deg.toFixed(1) + '°';
    let hint = '';
    if (Math.abs(deg) < 0.1) hint = '恒等変換（原音）';
    else if (Math.abs(Math.abs(deg) - 90) < 0.1) hint = 'Side完全直交化';
    else if (Math.abs(Math.abs(deg) - 180) < 0.1) hint = 'Side位相反転';
    else if (deg > 0) hint = '正方向回転';
    else hint = '負方向回転';
    thetaHint.textContent = hint;
    state.theta = deg * Math.PI / 180;
    RIOnline.setTheta(state.theta);
  }

  thetaSlider.addEventListener('input', updateThetaDisplay);

  document.querySelectorAll('[data-theta]').forEach(b => {
    b.addEventListener('click', () => {
      thetaSlider.value = b.dataset.theta;
      updateThetaDisplay();
    });
  });

  // モード切替
  document.querySelectorAll('.seg-btn').forEach(b => {
    b.addEventListener('click', () => {
      document.querySelectorAll('.seg-btn').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      state.mode = b.dataset.mode;
    });
  });

  // ファイル読み込み
  $('fileInput').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const ctx = RIOnline.ensureContext();
    state.audioCtx = ctx;
    const arr = await f.arrayBuffer();
    state.sourceBuffer = await ctx.decodeAudioData(arr);
    alert(`読み込み完了: ${f.name}\n${state.sourceBuffer.duration.toFixed(2)}秒`);
  });

  // デモ信号（ステレオピンクノイズ風）
  $('useDemo').addEventListener('click', () => {
    const ctx = RIOnline.ensureContext();
    state.audioCtx = ctx;
    const sr = ctx.sampleRate;
    const len = sr * 4;
    const buf = ctx.createBuffer(2, len, sr);
    const L = buf.getChannelData(0);
    const R = buf.getChannelData(1);
    let lpL = 0, lpR = 0;
    for (let i = 0; i < len; i++) {
      const nL = (Math.random() * 2 - 1);
      const nR = (Math.random() * 2 - 1);
      lpL = lpL * 0.95 + nL * 0.05;
      lpR = lpR * 0.95 + nR * 0.05;
      L[i] = lpL * 3 + Math.sin(2 * Math.PI * 220 * i / sr) * 0.2;
      R[i] = lpR * 3 + Math.sin(2 * Math.PI * 220 * i / sr + 0.3) * 0.2;
    }
    state.sourceBuffer = buf;
    alert('デモ信号を生成しました（4秒）');
  });

  // マイク
  $('useMic').addEventListener('click', async () => {
    try {
      const ctx = RIOnline.ensureContext();
      state.audioCtx = ctx;
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 2 }
      });
      state.micStream = stream;
      stopPlayback();
      const src = ctx.createMediaStreamSource(stream);
      const gain = ctx.createGain();
      gain.gain.value = parseFloat($('gain').value);
      state.gainNode = gain;
      RIOnline.attachSource(src, gain);
      gain.connect(ctx.destination);
      state.sourceNode = src;
      state.isPlaying = true;
      startMeterLoop();
    } catch (err) {
      alert('マイクアクセス失敗: ' + err.message);
    }
  });

  // 再生
  $('playBtn').addEventListener('click', () => {
    if (!state.sourceBuffer) { alert('先にファイル/デモを読み込んでください'); return; }
    const ctx = RIOnline.ensureContext();
    state.audioCtx = ctx;
    stopPlayback();

    const playBuf = (state.mode === 'offline' && state.renderedBuffer)
      ? state.renderedBuffer
      : state.sourceBuffer;

    const src = ctx.createBufferSource();
    src.buffer = playBuf;
    src.loop = true;
    const gain = ctx.createGain();
    gain.gain.value = parseFloat($('gain').value);
    state.gainNode = gain;

    if (state.mode === 'online') {
      RIOnline.attachSource(src, gain);
      gain.connect(ctx.destination);
    } else {
      // オフラインモード：レンダリング済みなら直結、未レンダリングはオンライン経由
      if (state.renderedBuffer) {
        src.connect(gain);
        gain.connect(ctx.destination);
      } else {
        RIOnline.attachSource(src, gain);
        gain.connect(ctx.destination);
      }
    }

    src.start();
    state.sourceNode = src;
    state.isPlaying = true;
    startMeterLoop();
  });

  $('stopBtn').addEventListener('click', stopPlayback);

  function stopPlayback() {
    if (state.sourceNode) {
      try { state.sourceNode.stop && state.sourceNode.stop(); } catch (e) {}
      try { state.sourceNode.disconnect(); } catch (e) {}
      state.sourceNode = null;
    }
    if (state.micStream) {
      state.micStream.getTracks().forEach(t => t.stop());
      state.micStream = null;
    }
    state.isPlaying = false;
  }

  $('bypassBtn').addEventListener('click', () => {
    state.bypass = !state.bypass;
    RIOnline.setBypass(state.bypass);
    $('bypassBtn').style.background = state.bypass ? '#7a3a3a' : '';
  });

  $('gain').addEventListener('input', () => {
    if (state.gainNode) state.gainNode.gain.value = parseFloat($('gain').value);
  });

  // オフラインレンダリング
  $('renderBtn').addEventListener('click', async () => {
    if (!state.sourceBuffer) { alert('先にファイル/デモを読み込んでください'); return; }
    const ctx = RIOnline.ensureContext();
    state.audioCtx = ctx;
    $('renderBtn').textContent = 'レンダリング中...';
    $('renderBtn').disabled = true;
    await new Promise(r => setTimeout(r, 50));
    try {
      const out = RIOffline.processAudioBuffer(ctx, state.sourceBuffer, state.theta);
      state.renderedBuffer = out;
      $('downloadBtn').disabled = false;
      $('renderBtn').textContent = '再レンダリング';

      // オフライン処理結果でメーター更新
      const L = state.sourceBuffer.getChannelData(0);
      const R = state.sourceBuffer.numberOfChannels > 1 ? state.sourceBuffer.getChannelData(1) : L;
      const Lp = out.getChannelData(0);
      const Rp = out.getChannelData(1);
      const M = new Float32Array(L.length);
      const Mp = new Float32Array(L.length);
      for (let i = 0; i < L.length; i++) {
        M[i] = 0.5 * (L[i] + R[i]);
        Mp[i] = 0.5 * (Lp[i] + Rp[i]);
      }
      const midErr = RICore.midError(M, Mp);
      const powErr = RICore.powerError(L, R, Lp, Rp);
      const corr = RICore.correlation(Lp, Rp);
      updateMeters({ midErr, powErr, corr });
      alert(`レンダリング完了\nMid誤差: ${midErr.toFixed(2)} dB\nパワー誤差: ${powErr.toFixed(2)} dB\nLR相関: ${corr.toFixed(4)}`);
    } catch (err) {
      alert('レンダリング失敗: ' + err.message);
    } finally {
      $('renderBtn').disabled = false;
    }
  });

  $('downloadBtn').addEventListener('click', () => {
    if (!state.renderedBuffer) return;
    const blob = RIOffline.encodeWAV(state.renderedBuffer);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `RealImager_theta${(state.theta * 180 / Math.PI).toFixed(1)}.wav`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  // メーター
  function updateMeters({ midErr, powErr, corr }) {
    // dB を 0-100% にマップ：-100dB→0%, 0dB→100%
    const dbToPct = (db) => Math.max(0, Math.min(100, (db + 100)));
    $('midErr').style.width = dbToPct(midErr) + '%';
    $('midErrVal').textContent = (midErr <= -199 ? '-∞' : midErr.toFixed(1)) + ' dB';
    $('powErr').style.width = dbToPct(powErr) + '%';
    $('powErrVal').textContent = (powErr <= -199 ? '-∞' : powErr.toFixed(1)) + ' dB';
    $('corr').style.width = (Math.abs(corr) * 100) + '%';
    $('corrVal').textContent = corr.toFixed(3);
  }

  let meterTimer = null;
  function startMeterLoop() {
    if (meterTimer) return;
    meterTimer = setInterval(() => {
      if (!state.isPlaying) {
        clearInterval(meterTimer);
        meterTimer = null;
        return;
      }
      const m = RIOnline.computeMetrics();
      if (m) updateMeters(m);
    }, 100);
  }

  // 初期化
  updateThetaDisplay();
})();