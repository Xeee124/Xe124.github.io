// Audio Visualizer - Cyber Style Edition
// スムージング + アナライザーモード搭載版

let n = 512;
let GLP_Hz_dB = [];
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

let LogBias_Hz = 1.0;
let minFreq = 20;
let maxFreq = 20000;

let gAccel = 2000.0;
let vel = [];
let minVisible = 0.001;

let sampleRate = 44100;

let smoothingMode = 0;
let analyzerMode = false;
let splineM = [];

const ORANGE = [255, 120, 0];

if (typeof Math.log10 !== 'function') {
  Math.log10 = function(x) { return Math.log(x) / Math.LN10; };
}

function setup() {
  y = windowHeight;
  x = windowWidth;
  let canvas = createCanvas(x, y);
  canvas.parent('visualizer-canvas');

  fft = new p5.FFT(0.8, 8192);
  analyzer = new p5.Amplitude();
  analyzer.setInput();

  GLP_Hz_dB = new Array(n).fill(0);
  prevRMS = new Array(n).fill(0);
  vel = new Array(n).fill(0);
  splineM = new Array(n).fill(0);
}

function draw() {
  background(10, 10, 10);
  Audio();
  
  switch (smoothingMode) {
    case 0: WhiteRect(); break;
    case 1: drawLinearInterpolation(); break;
    case 2: drawCatmullRom(); break;
    case 3: drawCubicSpline(); break;
    case 4: drawMovingAverage(); break;
    case 5: drawGaussianSmooth(); break;
    default: WhiteRect();
  }
  
  if (analyzerMode) {
    drawAnalyzerOverlay();
  }
  
  updateFPS();
}

function windowResized() {
  y = windowHeight;
  x = windowWidth;
  resizeCanvas(x, y);
}

function freqToBin(freq, fftSize, sr) {
  return Math.round(freq * fftSize / sr);
}

function Audio() {
  let dt = Math.max(0.000001, deltaTime / 1000.0);

  if (soundFile && soundFile.isLoaded && soundFile.isLoaded() && soundFile.isPlaying && soundFile.isPlaying()) {
    let spectrum = fft.analyze();
    let fftSize = spectrum.length * 2;
    
    let sr = sampleRate;
    if (getAudioContext && getAudioContext()) {
      sr = getAudioContext().sampleRate;
    }

    let logMinFreq = Math.log10(minFreq);
    let logMaxFreq = Math.log10(maxFreq);

    let freqEdges = new Array(n + 1);
    for (let k = 0; k <= n; k++) {
      let t = k / n;
      t = Math.pow(t, LogBias_Hz);
      let logFreq = logMinFreq + t * (logMaxFreq - logMinFreq);
      freqEdges[k] = Math.pow(10, logFreq);
    }

    let rawRMS = new Array(n);
    let maxRMS = 0;

    for (let i = 0; i < n; i++) {
      let startFreq = freqEdges[i];
      let endFreq = freqEdges[i + 1];
      
      let startBin = freqToBin(startFreq, fftSize, sr);
      let endBin = freqToBin(endFreq, fftSize, sr);
      
      startBin = Math.max(0, Math.min(startBin, spectrum.length - 1));
      endBin = Math.max(startBin + 1, Math.min(endBin, spectrum.length));

      let sum = 0;
      let count = 0;
      
      for (let j = startBin; j < endBin; j++) {
        sum += spectrum[j] * spectrum[j];
        count++;
      }
      
      if (count === 0) count = 1;
      
      rawRMS[i] = Math.sqrt(sum / count) / 255;
      maxRMS = Math.max(maxRMS, rawRMS[i]);
    }

    if (maxRMS < 0.001) maxRMS = 1;

    for (let i = 0; i < n; i++) {
      let rms = rawRMS[i] / maxRMS;
      rms = rms * rms;

      let alpha = 1 - Math.exp(-deltaTime / Smooth);
      let smoothRMS = prevRMS[i] + alpha * (rms - prevRMS[i]);
      prevRMS[i] = smoothRMS;

      let targetHeight = 0;
      if (smoothRMS >= minVisible) {
        targetHeight = smoothRMS * (Limier * y / 2);
      }

      GLP_Hz_dB[i] = targetHeight;
      vel[i] = 0;
    }
    
    if (smoothingMode === 3) {
      computeCubicSplineM();
    }
    
  } else {
    for (let i = 0; i < n; i++) {
      vel[i] += gAccel * dt;
      let newH = GLP_Hz_dB[i] - vel[i] * dt;

      if (newH <= 0) {
        GLP_Hz_dB[i] = 0;
        vel[i] = 0;
      } else {
        GLP_Hz_dB[i] = newH;
      }
    }
    
    if (smoothingMode === 3) {
      computeCubicSplineM();
    }
  }
}

function WhiteRect() {
  drawingContext.shadowBlur = Glow;
  drawingContext.shadowColor = color(...ORANGE, Alpher);

  fill(...ORANGE, Alpher);
  noStroke();

  for (let i = 0; i < n; i++) {
    let barHeight = GLP_Hz_dB[i];
    let bw = (width / n) * (1 - spacing);
    let offset = (width / n - bw) / 2;
    rect(i * (width / n) + offset, y / 2 - barHeight, bw, barHeight * 2);
  }
}

function drawLinearInterpolation() {
  drawingContext.shadowBlur = Glow;
  drawingContext.shadowColor = color(...ORANGE, Alpher);
  
  stroke(...ORANGE, Alpher);
  strokeWeight(2);
  noFill();
  
  beginShape();
  for (let i = 0; i < n; i++) {
    let xPos = (i + 0.5) * (width / n);
    let yPos = y / 2 - GLP_Hz_dB[i];
    vertex(xPos, yPos);
  }
  endShape();
  
  beginShape();
  for (let i = 0; i < n; i++) {
    let xPos = (i + 0.5) * (width / n);
    let yPos = y / 2 + GLP_Hz_dB[i];
    vertex(xPos, yPos);
  }
  endShape();
  
  fill(...ORANGE, Alpher * 0.3);
  noStroke();
  beginShape();
  for (let i = 0; i < n; i++) {
    let xPos = (i + 0.5) * (width / n);
    vertex(xPos, y / 2 - GLP_Hz_dB[i]);
  }
  for (let i = n - 1; i >= 0; i--) {
    let xPos = (i + 0.5) * (width / n);
    vertex(xPos, y / 2 + GLP_Hz_dB[i]);
  }
  endShape(CLOSE);
}

function drawCatmullRom() {
  drawingContext.shadowBlur = Glow;
  drawingContext.shadowColor = color(...ORANGE, Alpher);
  
  stroke(...ORANGE, Alpher);
  strokeWeight(2);
  noFill();
  
  beginShape();
  let firstX = 0.5 * (width / n);
  let firstY = y / 2 - GLP_Hz_dB[0];
  curveVertex(firstX, firstY);
  
  for (let i = 0; i < n; i++) {
    let xPos = (i + 0.5) * (width / n);
    let yPos = y / 2 - GLP_Hz_dB[i];
    curveVertex(xPos, yPos);
  }
  
  let lastX = (n - 0.5) * (width / n);
  let lastY = y / 2 - GLP_Hz_dB[n - 1];
  curveVertex(lastX, lastY);
  endShape();
  
  beginShape();
  firstY = y / 2 + GLP_Hz_dB[0];
  curveVertex(firstX, firstY);
  
  for (let i = 0; i < n; i++) {
    let xPos = (i + 0.5) * (width / n);
    let yPos = y / 2 + GLP_Hz_dB[i];
    curveVertex(xPos, yPos);
  }
  
  lastY = y / 2 + GLP_Hz_dB[n - 1];
  curveVertex(lastX, lastY);
  endShape();
  
  fill(...ORANGE, Alpher * 0.3);
  noStroke();
  
  let points = [];
  let segments = 5;
  
  for (let i = 0; i < n - 1; i++) {
    for (let t = 0; t < segments; t++) {
      let tt = t / segments;
      let px = catmullRomInterp(
        (Math.max(0, i - 1) + 0.5) * (width / n),
        (i + 0.5) * (width / n),
        (i + 1 + 0.5) * (width / n),
        (Math.min(n - 1, i + 2) + 0.5) * (width / n),
        tt
      );
      let py = catmullRomInterp(
        GLP_Hz_dB[Math.max(0, i - 1)],
        GLP_Hz_dB[i],
        GLP_Hz_dB[i + 1],
        GLP_Hz_dB[Math.min(n - 1, i + 2)],
        tt
      );
      points.push({ x: px, y: py });
    }
  }
  points.push({ x: (n - 0.5) * (width / n), y: GLP_Hz_dB[n - 1] });
  
  beginShape();
  for (let p of points) {
    vertex(p.x, y / 2 - p.y);
  }
  for (let i = points.length - 1; i >= 0; i--) {
    vertex(points[i].x, y / 2 + points[i].y);
  }
  endShape(CLOSE);
}

function catmullRomInterp(p0, p1, p2, p3, t) {
  let t2 = t * t;
  let t3 = t2 * t;
  return 0.5 * (
    (2 * p1) +
    (-p0 + p2) * t +
    (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
    (-p0 + 3 * p1 - 3 * p2 + p3) * t3
  );
}

function computeCubicSplineM() {
  let nn = n;
  let h = new Array(nn - 1);
  let alpha = new Array(nn - 1);
  let l = new Array(nn);
  let mu = new Array(nn);
  let z = new Array(nn);
  
  let dx = width / nn;
  for (let i = 0; i < nn - 1; i++) {
    h[i] = dx;
  }
  
  for (let i = 1; i < nn - 1; i++) {
    alpha[i] = (3 / h[i]) * (GLP_Hz_dB[i + 1] - GLP_Hz_dB[i]) - 
               (3 / h[i - 1]) * (GLP_Hz_dB[i] - GLP_Hz_dB[i - 1]);
  }
  
  l[0] = 1;
  mu[0] = 0;
  z[0] = 0;
  
  for (let i = 1; i < nn - 1; i++) {
    l[i] = 2 * (h[i - 1] + h[i]) - h[i - 1] * mu[i - 1];
    if (Math.abs(l[i]) < 0.0001) l[i] = 0.0001;
    mu[i] = h[i] / l[i];
    z[i] = (alpha[i] - h[i - 1] * z[i - 1]) / l[i];
  }
  
  l[nn - 1] = 1;
  z[nn - 1] = 0;
  splineM[nn - 1] = 0;
  
  for (let j = nn - 2; j >= 0; j--) {
    splineM[j] = z[j] - mu[j] * splineM[j + 1];
  }
}

function cubicSplineInterp(i, t) {
  if (i < 0) i = 0;
  if (i >= n - 1) i = n - 2;
  
  let h = width / n;
  let a = GLP_Hz_dB[i];
  let b = (GLP_Hz_dB[i + 1] - GLP_Hz_dB[i]) / h - h * (2 * splineM[i] + splineM[i + 1]) / 3;
  let c = splineM[i];
  let d = (splineM[i + 1] - splineM[i]) / (3 * h);
  
  let x = t * h;
  return a + b * x + c * x * x + d * x * x * x;
}

function drawCubicSpline() {
  drawingContext.shadowBlur = Glow;
  drawingContext.shadowColor = color(...ORANGE, Alpher);
  
  let points = [];
  let segments = 8;
  
  for (let i = 0; i < n - 1; i++) {
    for (let s = 0; s < segments; s++) {
      let t = s / segments;
      let xPos = (i + 0.5 + t) * (width / n);
      let yVal = cubicSplineInterp(i, t);
      if (yVal < 0) yVal = 0;
      points.push({ x: xPos, y: yVal });
    }
  }
  points.push({ x: (n - 0.5) * (width / n), y: GLP_Hz_dB[n - 1] });
  
  stroke(...ORANGE, Alpher);
  strokeWeight(2);
  noFill();
  
  beginShape();
  for (let p of points) {
    vertex(p.x, y / 2 - p.y);
  }
  endShape();
  
  beginShape();
  for (let p of points) {
    vertex(p.x, y / 2 + p.y);
  }
  endShape();
  
  fill(...ORANGE, Alpher * 0.3);
  noStroke();
  
  beginShape();
  vertex(points[0].x, y / 2);
  for (let p of points) {
    vertex(p.x, y / 2 - p.y);
  }
  vertex(points[points.length - 1].x, y / 2);
  for (let i = points.length - 1; i >= 0; i--) {
    vertex(points[i].x, y / 2 + points[i].y);
  }
  endShape(CLOSE);
}

function drawMovingAverage() {
  drawingContext.shadowBlur = Glow;
  drawingContext.shadowColor = color(...ORANGE, Alpher);
  
  let windowSize = 5;
  let smoothed = new Array(n);
  
  for (let i = 0; i < n; i++) {
    let sum = 0;
    let count = 0;
    for (let j = -Math.floor(windowSize / 2); j <= Math.floor(windowSize / 2); j++) {
      let idx = i + j;
      if (idx >= 0 && idx < n) {
        sum += GLP_Hz_dB[idx];
        count++;
      }
    }
    smoothed[i] = sum / count;
  }
  
  stroke(...ORANGE, Alpher);
  strokeWeight(2);
  noFill();
  
  beginShape();
  let firstX = 0.5 * (width / n);
  curveVertex(firstX, y / 2 - smoothed[0]);
  for (let i = 0; i < n; i++) {
    let xPos = (i + 0.5) * (width / n);
    curveVertex(xPos, y / 2 - smoothed[i]);
  }
  let lastX = (n - 0.5) * (width / n);
  curveVertex(lastX, y / 2 - smoothed[n - 1]);
  endShape();
  
  beginShape();
  curveVertex(firstX, y / 2 + smoothed[0]);
  for (let i = 0; i < n; i++) {
    let xPos = (i + 0.5) * (width / n);
    curveVertex(xPos, y / 2 + smoothed[i]);
  }
  curveVertex(lastX, y / 2 + smoothed[n - 1]);
  endShape();
  
  fill(...ORANGE, Alpher * 0.3);
  noStroke();
  beginShape();
  for (let i = 0; i < n; i++) {
    let xPos = (i + 0.5) * (width / n);
    vertex(xPos, y / 2 - smoothed[i]);
  }
  for (let i = n - 1; i >= 0; i--) {
    let xPos = (i + 0.5) * (width / n);
    vertex(xPos, y / 2 + smoothed[i]);
  }
  endShape(CLOSE);
}

function drawGaussianSmooth() {
  drawingContext.shadowBlur = Glow;
  drawingContext.shadowColor = color(...ORANGE, Alpher);
  
  let sigma = 2.0;
  let kernelRadius = Math.ceil(sigma * 3);
  let kernel = [];
  let kernelSum = 0;
  
  for (let i = -kernelRadius; i <= kernelRadius; i++) {
    let g = Math.exp(-(i * i) / (2 * sigma * sigma));
    kernel.push(g);
    kernelSum += g;
  }
  for (let i = 0; i < kernel.length; i++) {
    kernel[i] /= kernelSum;
  }
  
  let smoothed = new Array(n);
  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (let k = 0; k < kernel.length; k++) {
      let idx = i + (k - kernelRadius);
      if (idx < 0) idx = 0;
      if (idx >= n) idx = n - 1;
      sum += GLP_Hz_dB[idx] * kernel[k];
    }
    smoothed[i] = sum;
  }
  
  stroke(...ORANGE, Alpher);
  strokeWeight(2);
  noFill();
  
  beginShape();
  let firstX = 0.5 * (width / n);
  curveVertex(firstX, y / 2 - smoothed[0]);
  for (let i = 0; i < n; i++) {
    let xPos = (i + 0.5) * (width / n);
    curveVertex(xPos, y / 2 - smoothed[i]);
  }
  let lastX = (n - 0.5) * (width / n);
  curveVertex(lastX, y / 2 - smoothed[n - 1]);
  endShape();
  
  beginShape();
  curveVertex(firstX, y / 2 + smoothed[0]);
  for (let i = 0; i < n; i++) {
    let xPos = (i + 0.5) * (width / n);
    curveVertex(xPos, y / 2 + smoothed[i]);
  }
  curveVertex(lastX, y / 2 + smoothed[n - 1]);
  endShape();
  
  fill(...ORANGE, Alpher * 0.3);
  noStroke();
  beginShape();
  for (let i = 0; i < n; i++) {
    let xPos = (i + 0.5) * (width / n);
    vertex(xPos, y / 2 - smoothed[i]);
  }
  for (let i = n - 1; i >= 0; i--) {
    let xPos = (i + 0.5) * (width / n);
    vertex(xPos, y / 2 + smoothed[i]);
  }
  endShape(CLOSE);
}

function drawAnalyzerOverlay() {
  noFill();
  stroke(255, 255, 255, 100);
  strokeWeight(1);
  
  let leftMargin = 60;
  let rightMargin = 20;
  let topMargin = 50;
  let bottomMargin = 50;
  
  let graphLeft = leftMargin;
  let graphRight = width - rightMargin;
  let graphTop = topMargin;
  let graphBottom = height - bottomMargin;
  let graphWidth = graphRight - graphLeft;
  let graphHeight = graphBottom - graphTop;
  
  stroke(255, 255, 255, 150);
  strokeWeight(1);
  noFill();
  rect(graphLeft, graphTop, graphWidth, graphHeight);
  
  let freqMarks = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];
  
  textAlign(CENTER, TOP);
  textSize(10);
  fill(255, 255, 255, 200);
  noStroke();
  
  let logMin = Math.log10(minFreq);
  let logMax = Math.log10(maxFreq);
  
  for (let freq of freqMarks) {
    if (freq < minFreq || freq > maxFreq) continue;
    
    let logFreq = Math.log10(freq);
    let t = (logFreq - logMin) / (logMax - logMin);
    t = Math.pow(t, 1 / LogBias_Hz);
    
    let xPos = graphLeft + t * graphWidth;
    
    stroke(255, 255, 255, 30);
    strokeWeight(1);
    line(xPos, graphTop, xPos, graphBottom);
    
    noStroke();
    fill(255, 255, 255, 200);
    let label;
    if (freq >= 1000) {
      label = (freq / 1000) + 'k';
    } else {
      label = freq + '';
    }
    text(label, xPos, graphBottom + 5);
  }
  
  textAlign(CENTER, TOP);
  text('Hz', graphLeft + graphWidth / 2, graphBottom + 20);
  
  let dbMin = -60;
  let dbMax = 0;
  let dbMarks = [0, -6, -12, -18, -24, -30, -36, -42, -48, -54, -60];
  
  textAlign(RIGHT, CENTER);
  
  for (let db of dbMarks) {
    let t = (db - dbMax) / (dbMin - dbMax);
    let yPos = graphTop + t * (graphHeight / 2);
    let yPosMirror = graphTop + graphHeight / 2 + (1 - t) * (graphHeight / 2);
    
    stroke(255, 255, 255, 30);
    strokeWeight(1);
    line(graphLeft, yPos, graphRight, yPos);
    
    if (db !== 0) {
      line(graphLeft, yPosMirror, graphRight, yPosMirror);
    }
    
    noStroke();
    fill(255, 255, 255, 200);
    text(db + ' dB', graphLeft - 5, yPos);
  }
  
  stroke(255, 120, 0, 100);
  strokeWeight(2);
  line(graphLeft, graphTop + graphHeight / 2, graphRight, graphTop + graphHeight / 2);
  
  push();
  translate(15, graphTop + graphHeight / 2);
  rotate(-HALF_PI);
  textAlign(CENTER, CENTER);
  fill(255, 255, 255, 200);
  text('dBFS', 0, 0);
  pop();
  
  if (soundFile && soundFile.isLoaded && soundFile.isLoaded()) {
    textAlign(LEFT, TOP);
    textSize(11);
    fill(255, 255, 255, 200);
    noStroke();
    
    let status = soundFile.isPlaying() ? '▶ Playing' : '■ Stopped';
    let currentTime = soundFile.currentTime ? soundFile.currentTime() : 0;
    let duration = soundFile.duration ? soundFile.duration() : 0;
    
    let timeStr = formatTime(currentTime) + ' / ' + formatTime(duration);
    
    text(status + '  ' + timeStr, graphLeft, 20);
    
    let sr = sampleRate;
    if (getAudioContext && getAudioContext()) {
      sr = getAudioContext().sampleRate;
    }
    textAlign(RIGHT, TOP);
    text('FFT: 8192 | SR: ' + sr + ' Hz', graphRight, 20);
  }
}

function formatTime(seconds) {
  let mins = Math.floor(seconds / 60);
  let secs = Math.floor(seconds % 60);
  return mins + ':' + (secs < 10 ? '0' : '') + secs;
}

let lastFPSUpdate = 0;
let frameCountFPS = 0;
function updateFPS() {
  frameCountFPS++;
  if (millis() - lastFPSUpdate > 1000) {
    let fpsEl = document.getElementById('fpsDisplay');
    if (fpsEl) {
      fpsEl.textContent = `FPS: ${frameCountFPS}`;
    }
    frameCountFPS = 0;
    lastFPSUpdate = millis();
  }
}

// UI初期化（DOMContentLoadedで確実に実行）
document.addEventListener('DOMContentLoaded', function() {
  console.log('UI初期化開始...');
  
  const fileInput = document.getElementById('fileInput');
  const playBtn = document.getElementById('playBtn');
  const pauseBtn = document.getElementById('pauseBtn');
  const stopBtn = document.getElementById('stopBtn');
  const analyzerBtn = document.getElementById('analyzerBtn');
  const modeButtons = document.querySelectorAll('.mode-btn');
  
  if (!fileInput || !playBtn || !pauseBtn || !stopBtn || !analyzerBtn) {
    console.error('必要なUI要素が見つかりません');
    return;
  }
  
  console.log('UI要素が見つかりました。イベントリスナーを設定します。');
  
  fileInput.addEventListener('change', function(e) {
    console.log('ファイルが選択されました');
    const file = e.target.files[0];
    if (file) {
      // 既存の音声を停止・破棄
      if (soundFile) {
        if (soundFile.isPlaying && soundFile.isPlaying()) {
          soundFile.stop();
        }
        soundFile.disconnect();
        soundFile = null;
      }
      
      // AudioContextを開始（ユーザーインタラクション時に必要）
      userStartAudio();
      
      // ファイル名を先に表示
      const fileName = file.name;
      updateAudioStatus(false, fileName);
      document.getElementById('audioInfo').textContent = fileName + ' (loading...)';
      
      // BlobURLを作成してloadSoundで読み込む
      const blobUrl = URL.createObjectURL(file);
      
      soundFile = loadSound(
        blobUrl,
        // 成功コールバック
        function() {
          console.log('音声ファイル読み込み完了:', fileName);
          
          // FFTとAnalyzerに接続
          fft.setInput(soundFile);
          analyzer.setInput(soundFile);
          
          // BlobURLを解放
          URL.revokeObjectURL(blobUrl);
          
          updateAudioStatus(false, fileName);
          console.log('長さ:', soundFile.duration(), '秒');
        },
        // エラーコールバック
        function(err) {
          console.error('音声ファイル読み込みエラー:', err);
          URL.revokeObjectURL(blobUrl);
          document.getElementById('audioInfo').textContent = 'Error loading file';
        },
        // 読み込み中コールバック（進捗）
        function(progress) {
          console.log('読み込み中...', Math.round(progress * 100) + '%');
        }
      );
    }
  });
  
  playBtn.addEventListener('click', function() {
    console.log('再生ボタンがクリックされました');
    
    // AudioContextを開始
    userStartAudio();
    
    if (soundFile && soundFile.isLoaded && soundFile.isLoaded()) {
      if (!soundFile.isPlaying()) {
        soundFile.play();
        updateAudioStatus(true);
        console.log('再生開始');
      }
    } else {
      console.warn('音声ファイルが読み込まれていません');
      alert('先に音声ファイルを選択してください');
    }
  });
  
  pauseBtn.addEventListener('click', function() {
    console.log('一時停止ボタンがクリックされました');
    if (soundFile && soundFile.isLoaded && soundFile.isLoaded() && soundFile.isPlaying()) {
      soundFile.pause();
      updateAudioStatus(false);
    }
  });
  
  stopBtn.addEventListener('click', function() {
    console.log('停止ボタンがクリックされました');
    if (soundFile && soundFile.isLoaded && soundFile.isLoaded()) {
      soundFile.stop();
      updateAudioStatus(false);
    }
  });
  
  analyzerBtn.addEventListener('click', function() {
    console.log('アナライザーボタンがクリックされました');
    analyzerMode = !analyzerMode;
    analyzerBtn.classList.toggle('active', analyzerMode);
    console.log('アナライザーモード:', analyzerMode);
  });
  
  modeButtons.forEach(function(btn) {
    btn.addEventListener('click', function() {
      const mode = parseInt(btn.dataset.mode);
      console.log('スムージングモード変更:', mode);
      
      if (smoothingMode === mode) {
        smoothingMode = 0;
      } else {
        smoothingMode = mode;
      }
      
      modeButtons.forEach(function(b) {
        b.classList.remove('active');
      });
      
      if (smoothingMode !== 0) {
        btn.classList.add('active');
      } else {
        modeButtons[0].classList.add('active');
      }
    });
  });
  
  setupSlider('alphaSlider', 'alphaVal', function(v) { Alpher = v; });
  setupSlider('spacingSlider', 'spacingVal', function(v) { spacing = v; }, 2);
  setupSlider('smoothSlider', 'smoothVal', function(v) { Smooth = v; });
  setupSlider('minFreqSlider', 'minFreqVal', function(v) { minFreq = v; }, 0, ' Hz');
  setupSlider('maxFreqSlider', 'maxFreqVal', function(v) { maxFreq = v; }, 0, ' Hz');
  setupSlider('logBiasSlider', 'logBiasVal', function(v) { LogBias_Hz = v; }, 2);
  
  updateTime();
  setInterval(updateTime, 1000);
  
  console.log('UI初期化完了');
});

function setupSlider(sliderId, labelId, callback, decimals, suffix) {
  decimals = decimals || 0;
  suffix = suffix || '';
  
  const slider = document.getElementById(sliderId);
  const label = document.getElementById(labelId);
  
  if (!slider || !label) {
    console.error('スライダー要素が見つかりません:', sliderId, labelId);
    return;
  }
  
  slider.addEventListener('input', function() {
    const val = parseFloat(slider.value);
    callback(val);
    label.textContent = val.toFixed(decimals) + suffix;
  });
}

let currentFileName = '';

function updateAudioStatus(active, filename) {
  if (filename) {
    currentFileName = filename;
  }
  
  const statusEl = document.getElementById('audioStatus');
  const infoEl = document.getElementById('audioInfo');
  const statusTextEl = document.getElementById('status');
  
  if (!statusEl || !infoEl || !statusTextEl) {
    console.error('ステータス表示要素が見つかりません');
    return;
  }
  
  if (active) {
    statusEl.classList.add('active');
    infoEl.textContent = currentFileName + ' (playing)';
    statusTextEl.textContent = 'STATUS: PLAYING';
  } else {
    statusEl.classList.remove('active');
    if (currentFileName) {
      infoEl.textContent = currentFileName + ' (ready)';
      statusTextEl.textContent = 'STATUS: READY';
    } else {
      infoEl.textContent = 'No audio loaded';
      statusTextEl.textContent = 'STATUS: READY';
    }
  }
}

function updateTime() {
  const timeDisplay = document.getElementById('timeDisplay');
  if (timeDisplay) {
    const now = new Date();
    const time = now.toTimeString().split(' ')[0];
    timeDisplay.textContent = time;
  }
}
