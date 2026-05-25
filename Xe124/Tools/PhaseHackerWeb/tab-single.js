// =============================================================
// tab-single.js — Single タブのUI・再生・描画ロジック
// =============================================================
import { hilbert }              from './dsp-hilbert.js';
import { findPhaseHackAngle }   from './dsp-phase-hack.js';
import { applyPhaseRotation, applyNormalize, encodeWAV, decodeAudioFileRaw } from './dsp-rotation.js';
import { setupNormDbInput, getNormTarget } from './ui-normalize.js';

// ----- DOM参照 -----------------------------------------------
const fileInput   = document.getElementById('file');
const playBtn     = document.getElementById('play');
const stopBtn     = document.getElementById('stop');
const exportBtn   = document.getElementById('export');
const phaseHackBtn = document.getElementById('phaseHack');
const phaseSlider = document.getElementById('phase');
const phaseValEl  = document.getElementById('phaseVal');
const statusEl    = document.getElementById('status');
const waveCanvas  = document.getElementById('waveform');
const iqCanvas    = document.getElementById('iq');
const normOnEl    = document.getElementById('singleNormOn');
const normDbEl    = document.getElementById('singleNormDb');
const normLblEl   = document.getElementById('singleNormLabel');

const wCtx = waveCanvas.getContext('2d');
const iCtx = iqCanvas.getContext('2d');

// ----- 状態 --------------------------------------------------
let audioCtx   = null;
let workletNode = null;
let isPlaying  = false;
let originalData = [];  // Float32Array[]
let hilbertData  = [];  // Float64Array[]
let sampleRate   = 48000;
let origBits     = 0;   // 0=float32

// ----- 初期化 ------------------------------------------------
setupNormDbInput(normDbEl, normOnEl, normLblEl);

// AudioWorkletの初期化（遅延初期化）
async function initAudio() {
  if (audioCtx) return;
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const resp = await fetch(new URL('./worklet-phase-rotator.js', import.meta.url));
  const src  = await resp.text();
  const blob = new Blob([src], { type: 'application/javascript' });
  const url  = URL.createObjectURL(blob);
  await audioCtx.audioWorklet.addModule(url);
  URL.revokeObjectURL(url);
}

// ----- ファイル読み込み ---------------------------------------
fileInput.addEventListener('change', async e => {
  const f = e.target.files[0];
  if (!f) return;
  statusEl.textContent = 'デコード中...';
  await initAudio();

  const decoded = await decodeAudioFileRaw(f);
  sampleRate = decoded.sampleRate;
  origBits   = decoded.bits;
  const chs  = Math.min(2, decoded.channels.length);
  originalData = decoded.channels.slice(0, chs);
  hilbertData  = [];

  statusEl.textContent = `理想ヒルベルト変換中... (${sampleRate}Hz / ${chs}ch / ${decoded.bits || 32}bit)`;
  await tick();

  for (let c = 0; c < chs; c++) {
    hilbertData.push(hilbert(originalData[c]));
    statusEl.textContent = `Hilbert ${c+1}/${chs}...`;
    await tick(10);
  }

  const dur = (originalData[0].length / sampleRate).toFixed(1);
  statusEl.textContent = `準備完了 — ${sampleRate}Hz / ${chs}ch / ${decoded.bits || 32}bit / ${dur}s`;
  stopPlayback();
  resizeWave();
  resizeIQ();
});

// ----- 再生制御 ----------------------------------------------
async function startPlayback() {
  if (!originalData.length) { statusEl.textContent = '先に音声を選択してください'; return; }
  stopPlayback();
  await initAudio();
  if (audioCtx.state === 'suspended') await audioCtx.resume();

  workletNode = new AudioWorkletNode(audioCtx, 'phase-rotator', {
    numberOfInputs:  0,
    numberOfOutputs: 1,
    outputChannelCount: [originalData.length],
  });
  workletNode.port.onmessage = e => {
    if (e.data.ended) { workletNode = null; stopPlayback(); }
  };
  workletNode.port.postMessage({
    i: originalData,
    q: hilbertData,
    stereo: originalData.length >= 2,
  });
  workletNode.parameters.get('phase').setValueAtTime(
    parseFloat(phaseSlider.value), audioCtx.currentTime
  );
  workletNode.connect(audioCtx.destination);
  isPlaying = true;
  playBtn.textContent = '再生中…';
}

function stopPlayback() {
  if (workletNode) { try { workletNode.disconnect(); } catch {} workletNode = null; }
  isPlaying = false;
  playBtn.textContent = '再生';
}

playBtn.addEventListener('click', () => isPlaying ? stopPlayback() : startPlayback());
stopBtn.addEventListener('click', stopPlayback);

// ----- 位相スライダー ----------------------------------------
function updatePhase() {
  const v = parseFloat(phaseSlider.value);
  phaseValEl.textContent = v.toFixed(1) + '°';
  if (workletNode)
    workletNode.parameters.get('phase').setValueAtTime(v, audioCtx?.currentTime || 0);
  drawWaveform();
  drawIQ();
}
phaseSlider.addEventListener('input', updatePhase);

// スクロールロック（ドラッグ中）
let draggingSlider = false;
phaseSlider.addEventListener('pointerdown', e => {
  draggingSlider = true;
  document.body.style.overflow    = 'hidden';
  document.body.style.touchAction = 'none';
  try { phaseSlider.setPointerCapture(e.pointerId); } catch {}
});
['pointerup', 'pointercancel', 'pointerleave'].forEach(t =>
  phaseSlider.addEventListener(t, e => {
    draggingSlider = false;
    document.body.style.overflow    = '';
    document.body.style.touchAction = '';
    try { phaseSlider.releasePointerCapture(e.pointerId); } catch {}
  })
);
phaseSlider.addEventListener('pointermove', e => {
  if (draggingSlider) e.preventDefault();
}, { passive: false });
phaseSlider.addEventListener('wheel', e => {
  e.preventDefault();
  let v = parseFloat(phaseSlider.value) + e.deltaY * 0.01;
  v = Math.max(-180, Math.min(180, v));
  phaseSlider.value = v;
  updatePhase();
}, { passive: false });

// ----- Phase Hack --------------------------------------------
async function runPhaseHack() {
  if (!originalData.length) { statusEl.textContent = '先に音声ファイルを選択してください'; return; }
  const wasPlaying = isPlaying;
  stopPlayback();
  phaseHackBtn.disabled = true;
  playBtn.disabled = true;
  statusEl.textContent = 'Phase Hack探索中...';
  await new Promise(requestAnimationFrame);

  originalData._sampleRate = sampleRate;
  const bestDeg = findPhaseHackAngle(originalData, hilbertData);
  phaseSlider.value = bestDeg.toFixed(2);
  updatePhase();

  statusEl.textContent = `Phase Hack完了 — ${bestDeg.toFixed(2)}°`;
  phaseHackBtn.disabled = false;
  playBtn.disabled = false;
  if (wasPlaying) startPlayback();
}
phaseHackBtn.addEventListener('click', runPhaseHack);

// ----- エクスポート ------------------------------------------
exportBtn.addEventListener('click', () => {
  if (!originalData.length) return;
  const deg = parseFloat(phaseSlider.value);
  let outs = applyPhaseRotation(originalData, hilbertData, deg);
  if (normOnEl.checked) outs = applyNormalize(outs, getNormTarget(normDbEl));
  const wav  = encodeWAV(outs, sampleRate, origBits);
  const blob = new Blob([wav], { type: 'audio/wav' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = `phase_${phaseSlider.value}deg.wav`; a.click();
  URL.revokeObjectURL(url);
});

// ----- 描画 --------------------------------------------------
export function resizeWave() {
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const r   = waveCanvas.getBoundingClientRect();
  waveCanvas.width  = Math.max(1, Math.floor(r.width  * dpr));
  waveCanvas.height = Math.max(1, Math.floor(r.height * dpr));
  wCtx.setTransform(1,0,0,1,0,0);
  wCtx.scale(dpr, dpr);
  drawWaveform();
}
export function resizeIQ() {
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const r   = iqCanvas.getBoundingClientRect();
  iqCanvas.width  = Math.max(1, Math.floor(r.width  * dpr));
  iqCanvas.height = Math.max(1, Math.floor(r.height * dpr));
  iCtx.setTransform(1,0,0,1,0,0);
  iCtx.scale(dpr, dpr);
  drawIQ();
}

function drawWaveform() {
  const w = waveCanvas.clientWidth, h = waveCanvas.clientHeight;
  wCtx.clearRect(0, 0, w, h);
  wCtx.fillStyle = '#060b15'; wCtx.fillRect(0, 0, w, h);
  wCtx.beginPath(); wCtx.moveTo(0, h/2); wCtx.lineTo(w, h/2);
  wCtx.strokeStyle = 'rgba(255,255,255,0.06)'; wCtx.stroke();
  if (!originalData.length) return;

  const io  = originalData[0], qo = hilbertData[0];
  const len = io.length;
  const spp = len / w;
  const mid = h / 2, scale = h * 0.43;
  const ph  = parseFloat(phaseSlider.value) * Math.PI / 180;
  const c = Math.cos(ph), s = Math.sin(ph);

  for (let x = 0; x < w; x++) {
    const i0 = Math.floor(x * spp);
    let   i1 = Math.floor((x+1) * spp);
    if (i1 <= i0) i1 = i0 + 1;
    if (i1 > len)  i1 = len;
    let minO = 1, maxO = -1, minR = 1, maxR = -1;
    for (let i = i0; i < i1; i++) {
      const o = io[i]; if (o < minO) minO = o; if (o > maxO) maxO = o;
      const r = o * c - qo[i] * s; if (r < minR) minR = r; if (r > maxR) maxR = r;
    }
    const xp = x + 0.5;
    wCtx.beginPath(); wCtx.strokeStyle = 'rgba(148,163,184,0.5)';
    wCtx.moveTo(xp, mid - maxO * scale); wCtx.lineTo(xp, mid - minO * scale); wCtx.stroke();
    wCtx.beginPath(); wCtx.strokeStyle = 'rgba(56,189,248,0.95)';
    wCtx.moveTo(xp, mid - maxR * scale); wCtx.lineTo(xp, mid - minR * scale); wCtx.stroke();
  }
}

function drawIQ() {
  const w = iqCanvas.clientWidth, h = iqCanvas.clientHeight;
  iCtx.clearRect(0, 0, w, h);
  iCtx.fillStyle = '#05080e'; iCtx.fillRect(0, 0, w, h);
  if (!originalData.length) return;

  const cx = w/2, cy = h/2, r = Math.min(w, h) * 0.42;
  iCtx.strokeStyle = 'rgba(148,163,184,0.18)'; iCtx.lineWidth = 1;
  iCtx.beginPath(); iCtx.arc(cx, cy, r, 0, Math.PI*2); iCtx.stroke();
  iCtx.beginPath();
  iCtx.moveTo(cx-r, cy); iCtx.lineTo(cx+r, cy);
  iCtx.moveTo(cx, cy-r); iCtx.lineTo(cx, cy+r);
  iCtx.stroke();
  iCtx.fillStyle = '#64748b'; iCtx.font = '11px sans-serif';
  iCtx.fillText('I', cx+r-8, cy-5);
  iCtx.fillText('Q', cx+5,   cy-r+10);

  const ang = parseFloat(phaseSlider.value) * Math.PI / 180;
  const c = Math.cos(ang), s = Math.sin(ang);
  const io = originalData[0], qo = hilbertData[0];
  const len  = io.length;
  const step = Math.max(1, Math.floor(len / 2000));

  iCtx.fillStyle = 'rgba(34,211,238,0.9)';
  for (let i = 0; i < len; i += step) {
    const xr = io[i]*c - qo[i]*s;
    const yr = io[i]*s + qo[i]*c;
    const px = cx + xr * r * 0.9;
    const py = cy - yr * r * 0.9;
    iCtx.beginPath(); iCtx.arc(px, py, 1.1, 0, Math.PI*2); iCtx.fill();
  }

  iCtx.strokeStyle = '#f59e0b'; iCtx.lineWidth = 2;
  iCtx.beginPath(); iCtx.moveTo(cx, cy);
  iCtx.lineTo(cx + Math.cos(ang)*r*0.78, cy - Math.sin(ang)*r*0.78);
  iCtx.stroke();
}

// ----- 初期描画 ----------------------------------------------
updatePhase();
resizeWave();
resizeIQ();

// ----- ユーティリティ ----------------------------------------
function tick(ms = 20) { return new Promise(r => setTimeout(r, ms)); }
