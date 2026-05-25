
import { CATEGORIES, processFiles } from './Delta_compare.js';
import { fmt, wavBlobFromStereo } from './Delta_core.js';

const state = {
  fileA: null,
  fileB: null,
  result: null,
  mode: 'auto'
};

const $ = (s) => document.querySelector(s);

function buildCategorySections() {
  const host = $('#categories');
  host.innerHTML = '';
  for (const cat of CATEGORIES) {
    const section = document.createElement('section');
    section.className = 'card';
    section.innerHTML = `
      <h2>${cat.label}</h2>
      <div class="table-wrap">
        <table>
          <thead>
            <tr><th style="width:34%">項目</th><th style="width:28%">A</th><th style="width:38%">B (差分)</th></tr>
          </thead>
          <tbody id="body-${cat.id}">
            <tr><td colspan="3" class="empty">解析待ち</td></tr>
          </tbody>
        </table>
      </div>
    `;
    host.appendChild(section);
  }
}

function renderSummary() {
  const s = $('#summary');
  const r = state.result;
  if (!r || r.error) {
    s.innerHTML = `
      <div class="summary-item"><div class="summary-label">状態</div><div class="summary-value mono">${r && r.error ? 'エラー' : '待機'}</div></div>
      <div class="summary-item"><div class="summary-label">サンプル</div><div class="summary-value mono">-</div></div>
      <div class="summary-item"><div class="summary-label">モード</div><div class="summary-value mono">${state.mode}</div></div>
    `;
    return;
  }

  s.innerHTML = `
    <div class="summary-item">
      <div class="summary-label">処理モード</div>
      <div class="summary-value mono">${r.compare.modeLabel}</div>
    </div>
    <div class="summary-item">
      <div class="summary-label">サンプルレート</div>
      <div class="summary-value mono">${r.procA.sampleRate} / ${r.procB.sampleRate}</div>
    </div>
    <div class="summary-item">
      <div class="summary-label">サンプル数</div>
      <div class="summary-value mono">${r.procA.length} / ${r.procB.length}</div>
    </div>
    <div class="summary-item">
      <div class="summary-label">ずれ</div>
      <div class="summary-value mono">${fmt(r.compare.lagMs, 1)} ms</div>
    </div>
    <div class="summary-item">
      <div class="summary-label">整列相関</div>
      <div class="summary-value mono">${fmt(r.compare.alignedCorr, 3)}</div>
    </div>
    <div class="summary-item">
      <div class="summary-label">残差深度</div>
      <div class="summary-value mono">${fmt(r.compare.nullDepthDb, 1)} dB</div>
    </div>
  `;
}

function renderCategory(cat, metricsA, metricsB) {
  const tb = document.getElementById(`body-${cat.id}`);
  tb.innerHTML = '';
  for (let i = 0; i < metricsA.length; i++) {
    const a = metricsA[i];
    const b = metricsB[i];
    const delta = (Number.isFinite(a.value) && Number.isFinite(b.value)) ? (b.value - a.value) : NaN;
    const showDelta = Number.isFinite(delta);
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${a.label}</td>
      <td class="mono">${formatCell(a.value, a.precision)}${a.unit ? ` ${a.unit}` : ''}</td>
      <td class="mono">${formatCell(b.value, b.precision)}${b.unit ? ` ${b.unit}` : ''}${showDelta ? `<span class="delta ${delta >= 0 ? 'delta-up' : 'delta-down'}">${delta >= 0 ? '↑' : '↓'} ${Math.abs(delta).toFixed(a.precision)}${a.unit ? ` ${a.unit}` : ''}</span>` : ''}</td>
    `;
    tb.appendChild(tr);
  }
}

function formatCell(v, p) {
  if (v === null || v === undefined) return '-';
  if (typeof v === 'string') return v;
  if (!Number.isFinite(v)) return v > 0 ? '∞' : '-∞';
  return Number(v).toFixed(p);
}

function renderAll() {
  const r = state.result;
  if (!r || r.error) {
    for (const cat of CATEGORIES) {
      const tb = document.getElementById(`body-${cat.id}`);
      tb.innerHTML = '<tr><td colspan="3" class="empty">' + (r && r.error ? r.error : '解析待ち') + '</td></tr>';
    }
    renderSummary();
    return;
  }
  for (const cat of CATEGORIES) {
    renderCategory(cat, r.analysis.categoriesA[cat.id], r.analysis.categoriesB[cat.id]);
  }
  renderSummary();
  drawWaveform();
}

function drawWaveform() {
  const canvas = $('#waveform');
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const w = Math.floor(canvas.clientWidth * dpr);
  const h = Math.floor(canvas.clientHeight * dpr);
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#0a1120';
  ctx.fillRect(0, 0, w, h);

  if (!state.result || state.result.error) return;
  const { procA, procB } = state.result;
  const draw = (mono, color, alpha) => {
    const step = Math.max(1, Math.floor(mono.length / w));
    ctx.strokeStyle = color;
    ctx.globalAlpha = alpha;
    ctx.lineWidth = 1.2 * dpr;
    ctx.beginPath();
    for (let x = 0; x < w; x++) {
      const start = x * step;
      let mn = 1, mx = -1;
      for (let i = start; i < Math.min(start + step, mono.length); i++) {
        const v = mono[i];
        if (v < mn) mn = v;
        if (v > mx) mx = v;
      }
      const y1 = h / 2 - mx * h * 0.40;
      const y2 = h / 2 - mn * h * 0.40;
      ctx.moveTo(x, y1);
      ctx.lineTo(x, y2);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  };

  draw(procA.mono, '#38bdf8', 0.95);
  draw(procB.mono, '#f59e0b', 0.75);
}

function clearDownloads() {
  const out = $('#audioOut');
  out.innerHTML = '';
}

function addDiffAudio(label, left, right, sr, filename) {
  const out = $('#audioOut');
  const row = document.createElement('div');
  row.className = 'audio-row';
  const title = document.createElement('span');
  title.className = 'mono';
  title.style.fontSize = '12px';
  title.style.color = '#9fb0c6';
  title.textContent = label;
  const audio = document.createElement('audio');
  audio.controls = true;
  const blob = wavBlobFromStereo(left, right, sr);
  const url = URL.createObjectURL(blob);
  audio.src = url;
  const dl = document.createElement('a');
  dl.className = 'download';
  dl.href = url;
  dl.download = filename;
  dl.textContent = 'ダウンロード';
  row.appendChild(title);
  row.appendChild(audio);
  row.appendChild(dl);
  out.prepend(row);
}

function buildDiffOutputs() {
  const r = state.result;
  clearDownloads();
  if (!r || r.error) return;

  const a = r.compare.alignedA;
  const b = r.compare.alignedB;
  const len = Math.min(a.left.length, b.left.length, a.right.length, b.right.length);
  const rawL = new Float32Array(len);
  const rawR = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    rawL[i] = a.left[i] - b.left[i];
    rawR[i] = a.right[i] - b.right[i];
  }

  let peak = 0;
  for (let i = 0; i < len; i++) {
    const p = Math.max(Math.abs(rawL[i]), Math.abs(rawR[i]));
    if (p > peak) peak = p;
  }
  const g = peak > 0 ? Math.pow(10, -1 / 20) / peak : 1;
  const normL = new Float32Array(len);
  const normR = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    normL[i] = rawL[i] * g;
    normR[i] = rawR[i] * g;
  }

  const rmsA = Math.sqrt(a.mono.reduce((s, v) => s + v * v, 0) / Math.max(1, a.mono.length));
  const rmsB = Math.sqrt(b.mono.reduce((s, v) => s + v * v, 0) / Math.max(1, b.mono.length));
  const rg = rmsB > 0 ? rmsA / rmsB : 1;
  const matchL = new Float32Array(len);
  const matchR = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    matchL[i] = a.left[i] - b.left[i] * rg;
    matchR[i] = a.right[i] - b.right[i] * rg;
  }

  addDiffAudio('差分(生)', rawL, rawR, a.sampleRate, 'Delta_raw.wav');
  addDiffAudio('差分(-1dBFS)', normL, normR, a.sampleRate, 'Delta_norm_-1dBFS.wav');
  addDiffAudio('差分(RMS一致)', matchL, matchR, a.sampleRate, 'Delta_rms_match.wav');
}

async function analyzeSelected() {
  const a = $('#fileA').files[0];
  const b = $('#fileB').files[0];
  if (!a || !b) {
    $('#status').textContent = 'A/B の両方を選択してください';
    return;
  }
  $('#status').textContent = '解析中...';
  $('#analyze').disabled = true;

  try {
    state.result = await processFiles(a, b, state.mode);
    if (state.result.error) {
      $('#status').textContent = state.result.error;
      renderAll();
      clearDownloads();
      return;
    }
    const r = state.result;
    $('#status').textContent =
      `判定: ${r.compare.modeLabel} / SR一致=${r.compare.sampleRateMatch ? 'YES' : 'NO'} / サンプル一致=${r.compare.sampleCountMatch ? 'YES' : 'NO'}`;
    renderAll();
    buildDiffOutputs();
  } catch (e) {
    console.error(e);
    $('#status').textContent = `エラー: ${e.message || e}`;
  } finally {
    $('#analyze').disabled = false;
  }
}

function init() {
  buildCategorySections();
  renderAll();

  $('#fileA').addEventListener('change', e => {
    state.fileA = e.target.files[0] || null;
    $('#nameA').textContent = state.fileA ? state.fileA.name : '未選択';
  });
  $('#fileB').addEventListener('change', e => {
    state.fileB = e.target.files[0] || null;
    $('#nameB').textContent = state.fileB ? state.fileB.name : '未選択';
  });

  document.querySelectorAll('.mode-btn[data-mode]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.mode-btn[data-mode]').forEach(x => x.classList.remove('active'));
      btn.classList.add('active');
      state.mode = btn.dataset.mode;
      if (state.fileA && state.fileB) analyzeSelected();
    });
  });

  $('#analyze').addEventListener('click', analyzeSelected);
  window.addEventListener('resize', () => { if (state.result && !state.result.error) drawWaveform(); });
}

init();
