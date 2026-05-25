// =============================================================
// tab-batch.js — Batch タブのUI・処理ロジック
// =============================================================
import { hilbert }              from './dsp-hilbert.js';
import { findPhaseHackAngle }   from './dsp-phase-hack.js';
import { applyPhaseRotation, applyNormalize, encodeWAV, decodeAudioFileRaw } from './dsp-rotation.js';
import { setupNormDbInput, getNormTarget } from './ui-normalize.js';

// ----- DOM参照 -----------------------------------------------
const dropZone    = document.getElementById('batchDropZone');
const fileInput   = document.getElementById('batchFileInput');
const fileList    = document.getElementById('batchFileList');
const runBtn      = document.getElementById('batchRunBtn');
const clearBtn    = document.getElementById('batchClearBtn');
const progressWrap = document.getElementById('batchProgressWrap');
const progressBar  = document.getElementById('batchProgressBar');
const statusEl    = document.getElementById('batchStatus');
const normOnEl    = document.getElementById('batchNormOn');
const normDbEl    = document.getElementById('batchNormDb');
const normLblEl   = document.getElementById('batchNormLabel');
const jszipStatusEl = document.getElementById('jszipStatus');

// ----- 状態 --------------------------------------------------
let batchFiles  = []; // { file, el, statusEl, degEl }
let batchRunning = false;
let JSZip = null;

// ----- 初期化 ------------------------------------------------
setupNormDbInput(normDbEl, normOnEl, normLblEl);
loadJSZip();

function loadJSZip() {
  jszipStatusEl.textContent = '(JSZip読み込み中...)';
  const s = document.createElement('script');
  s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
  s.onload  = () => { JSZip = window.JSZip; jszipStatusEl.textContent = ''; };
  s.onerror = () => { jszipStatusEl.textContent = '(JSZip読み込み失敗 – ZIP不可)'; };
  document.head.appendChild(s);
}

// ----- ドロップゾーン ----------------------------------------
dropZone.addEventListener('click',     () => fileInput.click());
dropZone.addEventListener('dragover',  e  => { e.preventDefault(); dropZone.classList.add('drag-over'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  addFiles([...e.dataTransfer.files]);
});
fileInput.addEventListener('change', e => {
  addFiles([...e.target.files]);
  fileInput.value = '';
});

function addFiles(files) {
  const audio = files.filter(f =>
    f.type.startsWith('audio/') ||
    /\.(mp3|wav|flac|ogg|aac|m4a|opus|aiff?)$/i.test(f.name)
  );
  for (const f of audio) {
    // 重複チェック（名前+サイズ）
    if (batchFiles.some(b => b.file.name === f.name && b.file.size === f.size)) continue;

    const item   = document.createElement('div');
    item.className = 'batch-file-item';

    const nameEl = document.createElement('span');
    nameEl.className   = 'batch-file-name';
    nameEl.textContent = f.name;

    const degEl  = document.createElement('span');
    degEl.className = 'batch-file-deg';

    const stEl   = document.createElement('span');
    stEl.className   = 'batch-file-status pending';
    stEl.textContent = '待機';

    item.append(nameEl, degEl, stEl);
    fileList.appendChild(item);
    batchFiles.push({ file: f, el: item, statusEl: stEl, degEl });
  }
  updateRunBtn();
}

function updateRunBtn() {
  runBtn.disabled = batchFiles.length === 0 || batchRunning;
}

clearBtn.addEventListener('click', () => {
  if (batchRunning) return;
  batchFiles = [];
  fileList.innerHTML     = '';
  progressWrap.style.display = 'none';
  progressBar.style.width    = '0%';
  statusEl.textContent       = '';
  updateRunBtn();
});

// ----- バッチ処理 --------------------------------------------
runBtn.addEventListener('click', async () => {
  if (batchRunning || batchFiles.length === 0) return;
  batchRunning = true;
  runBtn.disabled = true;
  progressWrap.style.display = 'block';

  // ステータスリセット
  for (const b of batchFiles) {
    b.statusEl.className   = 'batch-file-status pending';
    b.statusEl.textContent = '待機';
    b.degEl.textContent    = '';
  }

  const zip  = JSZip ? new JSZip() : null;
  let done   = 0;

  for (const b of batchFiles) {
    b.statusEl.className   = 'batch-file-status processing';
    b.statusEl.textContent = '処理中';
    statusEl.textContent   = `[${done+1}/${batchFiles.length}] ${b.file.name} を処理中...`;
    progressBar.style.width = `${(done / batchFiles.length * 100).toFixed(1)}%`;

    try {
      await tick(10); // UIをリフレッシュ

      const decoded  = await decodeAudioFileRaw(b.file);
      const sr       = decoded.sampleRate;
      const bits     = decoded.bits;
      const chs      = Math.min(2, decoded.channels.length);
      const origData = decoded.channels.slice(0, chs);

      // Hilbert変換
      const hilbData = [];
      for (let c = 0; c < chs; c++) {
        hilbData.push(hilbert(origData[c]));
        await tick(5);
      }

      // Phase Hack
      origData._sampleRate = sr;
      const bestDeg = findPhaseHackAngle(origData, hilbData);
      b.degEl.textContent = `${bestDeg.toFixed(2)}°`;

      // 位相回転 → ノーマライズ → エンコード
      let outs = applyPhaseRotation(origData, hilbData, bestDeg);
      if (normOnEl.checked) outs = applyNormalize(outs, getNormTarget(normDbEl));
      const wavBuf = encodeWAV(outs, sr, bits);

      if (zip) {
        const baseName = b.file.name.replace(/\.[^.]+$/, '');
        zip.file(`${baseName}_phasehack.wav`, wavBuf);
      }

      b.statusEl.className   = 'batch-file-status done';
      b.statusEl.textContent = '完了';
    } catch (err) {
      console.error(err);
      b.statusEl.className   = 'batch-file-status error';
      b.statusEl.textContent = 'エラー';
      b.degEl.textContent    = '';
    }

    done++;
    b.el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  progressBar.style.width = '100%';

  if (zip && done > 0) {
    statusEl.textContent = 'ZIP生成中...';
    await tick(10);
    const blob = await zip.generateAsync({
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 1 },
    });
    const url = URL.createObjectURL(blob);
    const a   = document.createElement('a');
    a.href = url;
    a.download = `phasehack_batch_${Date.now()}.zip`;
    a.click();
    URL.revokeObjectURL(url);
    statusEl.textContent = `完了 — ${done}ファイルをZIPでダウンロード`;
  } else if (!zip) {
    statusEl.textContent = '処理完了（JSZipが読み込まれていないためZIP生成をスキップ）';
  } else {
    statusEl.textContent = '処理完了（ダウンロードできるファイルがありませんでした）';
  }

  batchRunning = false;
  updateRunBtn();
});

function tick(ms = 20) { return new Promise(r => setTimeout(r, ms)); }
