// =============================================================
// main.js — エントリーポイント（タブ切り替え + 各タブ初期化）
// =============================================================
import { resizeWave, resizeIQ } from './tab-single.js';
import './tab-batch.js';

// ----- タブ切り替え ------------------------------------------
function switchTab(name) {
  document.getElementById('tabBatch').classList.toggle('active',    name === 'batch');
  document.getElementById('tabSingle').classList.toggle('active',   name === 'single');
  document.getElementById('tabBtnBatch').classList.toggle('active', name === 'batch');
  document.getElementById('tabBtnSingle').classList.toggle('active',name === 'single');
  if (name === 'single') { resizeWave(); resizeIQ(); }
}

// グローバルに公開（HTML onclickから呼ぶため）
window.switchTab = switchTab;

// デフォルト: Batchタブ
switchTab('batch');

// リサイズ
window.addEventListener('resize', () => { resizeWave(); resizeIQ(); });
