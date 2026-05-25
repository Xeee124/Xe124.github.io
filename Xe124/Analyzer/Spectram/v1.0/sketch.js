
// Audio Visualizer - Spectrum Analyzer Pro V3
// Optimized for Low Latency, High Stability, and Performance

let n = 512;
let GLP_Hz_dB = []; 
let raw_GLP = [];   
let binMap = [];    // 高速化のためのプリ計算インデックス
let x, y;
let spacing = 0.2;
let Limier = 0.7;
let Alpher = 185;
let Glow = 6;
let soundFile = null;
let fft = null;
let Smooth = 10;
let prevRMS = [];
let analyzer = null;

const LogBias_Hz = 1.0;
let minFreq = 20;
let maxFreq = 20000;

let gAccel = 2000.0;
let vel = [];
let minVisible = 0.0001; // 精度向上のため閾値を微調整

let smoothingMode = 0;
let analyzerMode = false;

let bgGraphics; 
const ORANGE = [255, 120, 0];

// システムオーディオ用の変数
let systemAudioStream = null;
let systemAudioSource = null;
let systemAudioAnalyser = null;
let isSystemAudioMode = false;
let systemAudioData = null;

let currentPanelHeight = 0;
let isResizing = false;

// 安全なログ関数
const safeLog10 = (num) => (num <= 0) ? -20 : Math.log(num) / Math.LN10;

function setup() {
  y = windowHeight;
  x = windowWidth;
  let canvas = createCanvas(x, y);
  canvas.parent('visualizer-canvas');

  // ファイル再生用FFT (p5.jsのデフォルトを使用)
  fft = new p5.FFT(0.8, 8192);
  analyzer = new p5.Amplitude();
  
  reinitArrays();
  
  currentPanelHeight = windowHeight / 3;
  updateUIPosition();

  bgGraphics = createGraphics(windowWidth, windowHeight);
  updateBackgroundGraphics();
}

/**
 * 配列の初期化とプリ計算マップの更新
 */
function reinitArrays() {
  GLP_Hz_dB = new Float32Array(n).fill(0);
  raw_GLP = new Float32Array(n).fill(0);
  prevRMS = new Float32Array(n).fill(0);
  vel = new Float32Array(n).fill(0);
  updateBinMap();
}

/**
 * 周波数からFFTビンへのマッピングをプリ計算し、メインループを高速化
 */
function updateBinMap() {
  binMap = new Int32Array(n);
  let ctx = getAudioContext();
  if (!ctx) return;
  
  let sr = ctx.sampleRate;
  let currentFFTSize = isSystemAudioMode ? (systemAudioAnalyser ? systemAudioAnalyser.fftSize : 8192) : 8192 * 2;
  
  let logMin = safeLog10(minFreq);
  let logMax = safeLog10(maxFreq);
  
  for (let i = 0; i < n; i++) {
    let t = i / n;
    let freq = Math.pow(10, logMin + t * (logMax - logMin));
    let bin = Math.round(freq * currentFFTSize / sr);
    binMap[i] = bin;
  }
}

function draw() {
  // 背景描画
  background(10, 10, 10);
  
  // アナライザー表示（キャッシュされたバッファを使用）
  if (analyzerMode) {
    image(bgGraphics, 0, 0);
  }

  // オーディオデータの更新（計算処理）
  AudioUpdate();
  
  // 描画の中心計算
  let drawingAreaHeight = windowHeight - currentPanelHeight;
  let centerY = drawingAreaHeight / 2;

  // グラフ描画
  drawBars(centerY);
  
  updateFPS();
}

function windowResized() {
  y = windowHeight;
  x = windowWidth;
  resizeCanvas(x, y);
  
  currentPanelHeight = Math.min(currentPanelHeight, windowHeight / 3);
  updateUIPosition();
  
  bgGraphics.resizeCanvas(x, y);
  updateBackgroundGraphics();
  updateBinMap();
}

/**
 * オーディオ信号の解析とデータスムージング
 */
function AudioUpdate() {
  let dt = Math.max(0.000001, deltaTime / 1000.0);
  let spectrum;

  // ソースの確認とデータ取得
  if (isSystemAudioMode && systemAudioAnalyser && systemAudioData) {
    systemAudioAnalyser.getByteFrequencyData(systemAudioData);
    spectrum = systemAudioData;
  } else if (soundFile && soundFile.isLoaded() && soundFile.isPlaying()) {
    spectrum = fft.analyze();
  } else {
    // 信号なし：物理シミュレーションによる減衰
    for (let i = 0; i < n; i++) {
      vel[i] += gAccel * dt;
      let newH = GLP_Hz_dB[i] - vel[i] * dt;
      GLP_Hz_dB[i] = newH <= 0 ? 0 : newH;
      if (GLP_Hz_dB[i] === 0) vel[i] = 0;
    }
    return;
  }

  let drawingAreaHeight = windowHeight - currentPanelHeight;
  let alpha = 1 - Math.exp(-deltaTime / Smooth);
  let specLen = spectrum.length;

  // ステップ1: プリ計算されたbinMapを使用して高速に生データを抽出
  for (let i = 0; i < n; i++) {
    let bin = binMap[i];
    // 安全な範囲チェック
    if (bin >= specLen) bin = specLen - 1;
    
    let val = spectrum[bin] / 255.0;
    let rms = val * val; // パワーに変換
    
    // 時間軸のスムージング（Temporal）
    prevRMS[i] = prevRMS[i] + alpha * (rms - prevRMS[i]);
    
    // 物理的な高さに変換
    raw_GLP[i] = (prevRMS[i] >= minVisible) ? prevRMS[i] * (Limier * drawingAreaHeight / 2) : 0;
  }

  // ステップ2: 空間フィルタリング（データ段階でのスムージング）
  applyDataSmoothing();
}

/**
 * 改良部分1: データ数値段階でのスムージング処理
 */
function applyDataSmoothing() {
  switch (smoothingMode) {
    case 0: // RAW
      for (let i = 0; i < n; i++) GLP_Hz_dB[i] = raw_GLP[i];
      break;
    case 1: // MOVING AVG L
      for (let i = 0; i < n; i++) {
        let prev = (i > 0) ? raw_GLP[i-1] : raw_GLP[i];
        let next = (i < n - 1) ? raw_GLP[i+1] : raw_GLP[i];
        GLP_Hz_dB[i] = (prev + raw_GLP[i] + next) / 3;
      }
      break;
    case 2: // MOVING AVG H
      for (let i = 0; i < n; i++) {
        let sum = 0, count = 0;
        for (let j = -3; j <= 3; j++) {
          let idx = i + j;
          if (idx >= 0 && idx < n) { sum += raw_GLP[idx]; count++; }
        }
        GLP_Hz_dB[i] = sum / count;
      }
      break;
    case 3: // GAUSSIAN
      const kernel = [0.061, 0.242, 0.383, 0.242, 0.061];
      for (let i = 0; i < n; i++) {
        let sum = 0;
        for (let j = -2; j <= 2; j++) {
          let idx = (i + j < 0) ? 0 : (i + j >= n) ? n - 1 : i + j;
          sum += raw_GLP[idx] * kernel[j + 2];
        }
        GLP_Hz_dB[i] = sum;
      }
      break;
    case 4: // INTERPOLATE (Spatial blending)
      for (let i = 0; i < n; i++) {
        let p = raw_GLP[i];
        let n_val = (i < n - 1) ? raw_GLP[i+1] : p;
        GLP_Hz_dB[i] = p * 0.7 + n_val * 0.3;
      }
      break;
    case 5: // TEMPORAL ENHANCED
      for (let i = 0; i < n; i++) {
        GLP_Hz_dB[i] = raw_GLP[i] * 1.1; 
      }
      break;
  }
}

/**
 * バーの描画（常に高速な矩形描画を使用）
 */
function drawBars(centerY) {
  if (Alpher <= 0) return;
  
  drawingContext.shadowBlur = Glow;
  drawingContext.shadowColor = `rgba(${ORANGE[0]}, ${ORANGE[1]}, ${ORANGE[2]}, ${Alpher/255})`;
  fill(ORANGE[0], ORANGE[1], ORANGE[2], Alpher);
  noStroke();

  const barW = x / n;
  const bw = barW * (1 - spacing);
  const offset = (barW - bw) / 2;

  for (let i = 0; i < n; i++) {
    const h = GLP_Hz_dB[i];
    if (h > 0) {
      rect(i * barW + offset, centerY - h, bw, h * 2);
    }
  }
}

/**
 * 改良部分2: グリッド描画をオフ画面バッファへキャッシュ
 */
function updateBackgroundGraphics() {
  bgGraphics.clear();
  
  let drawH = windowHeight - currentPanelHeight;
  if (drawH <= 50) return;

  bgGraphics.noFill();
  bgGraphics.stroke(255, 255, 255, 40);
  bgGraphics.strokeWeight(1);
  
  let lm = 60, rm = 20, tm = 50, bm = 50;
  let gL = lm, gR = x - rm, gT = tm, gB = drawH - bm;
  let gW = gR - gL, gH = gB - gT;
  
  if (gW <= 0 || gH <= 0) return;

  bgGraphics.rect(gL, gT, gW, gH);
  
  let freqMarks = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];
  let logMin = safeLog10(minFreq), logMax = safeLog10(maxFreq);
  
  bgGraphics.textAlign(CENTER, TOP);
  bgGraphics.textSize(10);
  for (let f of freqMarks) {
    if (f < minFreq || f > maxFreq) continue;
    let t = (safeLog10(f) - logMin) / (logMax - logMin);
    let px = gL + t * gW;
    bgGraphics.stroke(255, 255, 255, 20);
    bgGraphics.line(px, gT, px, gB);
    bgGraphics.noStroke();
    bgGraphics.fill(255, 255, 255, 120);
    bgGraphics.text(f >= 1000 ? (f / 1000) + 'k' : f, px, gB + 8);
  }
  
  let dbMarks = [0, -12, -24, -36, -48, -60];
  bgGraphics.textAlign(RIGHT, CENTER);
  for (let db of dbMarks) {
    let t = db / -60;
    let py = gT + t * (gH / 2);
    let pyMirror = gT + gH / 2 + (1 - t) * (gH / 2);
    bgGraphics.stroke(255, 255, 255, 20);
    bgGraphics.line(gL, py, gR, py);
    if (db !== 0) bgGraphics.line(gL, pyMirror, gR, pyMirror);
    bgGraphics.noStroke();
    bgGraphics.fill(255, 255, 255, 120);
    bgGraphics.text(db + 'dB', gL - 10, py);
  }
}

function updateFPS() {
  if (frameCount % 30 === 0) {
    let fpsEl = document.getElementById('fpsDisplay');
    if (fpsEl) fpsEl.textContent = `FPS: ${Math.round(frameRate())}`;
  }
}

// --- UI Logic ---

document.addEventListener('mousedown', (e) => {
  if (e.target.id === 'panel-resizer') isResizing = true;
});

document.addEventListener('mousemove', (e) => {
  if (isResizing) {
    let newH = windowHeight - e.clientY;
    currentPanelHeight = Math.max(0, Math.min(newH, windowHeight / 3));
    updateUIPosition();
    updateBackgroundGraphics();
  }
});

document.addEventListener('mouseup', () => { isResizing = false; });

function updateUIPosition() {
  const panel = document.getElementById('control-panel');
  const resizer = document.getElementById('panel-resizer');
  if (panel && resizer) {
    panel.style.height = `${currentPanelHeight}px`;
    resizer.style.bottom = `${currentPanelHeight}px`;
  }
}

document.addEventListener('DOMContentLoaded', function() {
  const fileInput = document.getElementById('fileInput');
  const playBtn = document.getElementById('playBtn');
  const pauseBtn = document.getElementById('pauseBtn');
  const stopBtn = document.getElementById('stopBtn');
  const analyzerBtn = document.getElementById('analyzerBtn');
  const sysAudioBtn = document.getElementById('systemAudioBtn');
  
  fileInput.addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (file) {
      if (soundFile) { soundFile.stop(); soundFile.disconnect(); }
      userStartAudio();
      updateAudioStatus(false, "LOADING...");
      
      let blobUrl = URL.createObjectURL(file);
      soundFile = loadSound(blobUrl, () => {
        fft.setInput(soundFile);
        URL.revokeObjectURL(blobUrl);
        updateAudioStatus(false, file.name);
        updateBinMap();
      }, (err) => {
        updateAudioStatus(false, "LOAD ERROR");
      });
    }
  });

  playBtn.addEventListener('click', () => {
    let ctx = getAudioContext();
    if (ctx.state === 'suspended') ctx.resume();
    if (soundFile && soundFile.isLoaded()) {
      if (isSystemAudioMode) stopSystemAudio();
      soundFile.play();
      updateAudioStatus(true);
    }
  });

  pauseBtn.addEventListener('click', () => { if (soundFile && soundFile.isPlaying()) { soundFile.pause(); updateAudioStatus(false); } });
  stopBtn.addEventListener('click', () => { if (soundFile) { soundFile.stop(); updateAudioStatus(false); } });
  
  sysAudioBtn.addEventListener('click', async () => {
    if (isSystemAudioMode) {
      stopSystemAudio();
    } else {
      await startSystemAudio();
    }
  });

  analyzerBtn.addEventListener('click', () => {
    analyzerMode = !analyzerMode;
    analyzerBtn.classList.toggle('active', analyzerMode);
    updateBackgroundGraphics();
  });

  document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      smoothingMode = parseInt(btn.dataset.mode);
      document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  setupSlider('alphaSlider', 'alphaVal', (v) => Alpher = v);
  setupSlider('spacingSlider', 'spacingVal', (v) => spacing = v, 2);
  setupSlider('smoothSlider', 'smoothVal', (v) => Smooth = v);
  setupSlider('minFreqSlider', 'minFreqVal', (v) => { minFreq = v; updateBackgroundGraphics(); updateBinMap(); });
  setupSlider('maxFreqSlider', 'maxFreqVal', (v) => { maxFreq = v; updateBackgroundGraphics(); updateBinMap(); });
  setupSlider('barCountSlider', 'barCountVal', (v) => { n = parseInt(v); reinitArrays(); });

  setInterval(() => {
    const timeDisplay = document.getElementById('timeDisplay');
    if (timeDisplay) timeDisplay.textContent = new Date().toTimeString().split(' ')[0];
  }, 1000);
});

function setupSlider(id, valId, cb, dec = 0) {
  const s = document.getElementById(id), l = document.getElementById(valId);
  if (s && l) s.addEventListener('input', () => { let v = parseFloat(s.value); cb(v); l.textContent = v.toFixed(dec); });
}

function updateAudioStatus(playing, name) {
  const info = document.getElementById('audioInfo');
  const indicator = document.getElementById('audioStatus');
  const statusTxt = document.getElementById('status');
  if (name) info.textContent = name.toUpperCase();
  if (playing) {
    indicator.classList.add('active');
    statusTxt.textContent = "STATUS: PLAYING";
  } else {
    indicator.classList.remove('active');
    statusTxt.textContent = "STATUS: READY";
  }
}

/**
 * システムオーディオ（PC音）のキャプチャ開始
 * 低レイテンシ化のため、AnalyserNodeの設定を最適化
 */
async function startSystemAudio() {
  try {
    let ctx = getAudioContext();
    if (ctx.state === 'suspended') await ctx.resume();

    // 画面共有APIで音声付きストリームを取得
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: { displaySurface: "monitor" },
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        channelCount: 1
      }
    });
    
    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) {
      stream.getTracks().forEach(t => t.stop());
      throw new Error("AUDIO NOT SHARED");
    }
    
    // 不要なビデオトラックを停止して負荷軽減
    stream.getVideoTracks().forEach(t => t.stop());
    systemAudioStream = stream;
    
    // Web Audio APIのノード構築
    systemAudioSource = ctx.createMediaStreamSource(stream);
    systemAudioAnalyser = ctx.createAnalyser();
    
    // 遅延最小化のための設定
    systemAudioAnalyser.fftSize = 8192; // 16384よりレイテンシが改善
    systemAudioAnalyser.smoothingTimeConstant = 0; // ブラウザ側のスムージングを無効化して即時性を確保
    
    systemAudioSource.connect(systemAudioAnalyser);
    
    systemAudioData = new Uint8Array(systemAudioAnalyser.frequencyBinCount);
    isSystemAudioMode = true;
    
    const btn = document.getElementById('systemAudioBtn');
    btn.classList.add('active');
    btn.textContent = "⏹ STOP CAPTURE";
    updateAudioStatus(true, "SYSTEM AUDIO");
    updateBinMap();

    audioTracks[0].onended = () => stopSystemAudio();

  } catch (err) {
    console.error("System Audio Start Error:", err);
    alert("SYSTEM AUDIO ERROR: " + err.message);
  }
}

function stopSystemAudio() {
  if (systemAudioStream) {
    systemAudioStream.getTracks().forEach(t => t.stop());
    systemAudioStream = null;
  }
  if (systemAudioSource) {
    systemAudioSource.disconnect();
    systemAudioSource = null;
  }
  isSystemAudioMode = false;
  const btn = document.getElementById('systemAudioBtn');
  btn.classList.remove('active');
  btn.textContent = "🔊 SYSTEM AUDIO";
  updateAudioStatus(false, "NO SOURCE");
  updateBinMap();
}
