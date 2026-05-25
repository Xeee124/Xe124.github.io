// =============================================================
// ui-normalize.js — ノーマライズUIヘルパー（両タブ共通）
// =============================================================

/**
 * ノーマライズ入力欄のUIをセットアップ
 * - トグル連動（ラベル色・入力欄の透明度）
 * - ドラッグアップ/ダウンで0.0001dB単位変更
 * - ダブルクリック or 小さいクリックでテキスト編集
 */
export function setupNormDbInput(inputEl, toggleEl, labelEl) {
  function syncLabel() {
    const on = toggleEl.checked;
    labelEl.classList.toggle('active-lbl', on);
    inputEl.style.opacity = on ? '1' : '0.35';
  }
  toggleEl.addEventListener('change', syncLabel);
  syncLabel();

  let dragStartY = null, dragStartVal = 0;

  inputEl.addEventListener('pointerdown', e => {
    if (e.detail === 2) return; // ダブルクリックは編集モードへ
    dragStartY   = e.clientY;
    dragStartVal = parseFloat(inputEl.value) || 0;
    inputEl.setPointerCapture(e.pointerId);
    inputEl.classList.remove('editing');
    e.preventDefault();
  });

  inputEl.addEventListener('pointermove', e => {
    if (dragStartY === null) return;
    const delta = (dragStartY - e.clientY) * 0.01; // 上ドラッグ = 増加
    let v = Math.round((dragStartVal + delta) * 10000) / 10000;
    v = Math.max(-60, Math.min(0, v));
    inputEl.value = formatDb(v);
    e.preventDefault();
  });

  inputEl.addEventListener('pointerup', e => {
    if (dragStartY !== null && Math.abs(e.clientY - dragStartY) < 3) {
      // 微小移動 → クリックとして編集モードへ
      inputEl.classList.add('editing');
      inputEl.focus();
      inputEl.select();
    }
    dragStartY = null;
    inputEl.releasePointerCapture(e.pointerId);
  });

  inputEl.addEventListener('dblclick', () => {
    inputEl.classList.add('editing');
    inputEl.focus();
    inputEl.select();
  });

  inputEl.addEventListener('blur', () => {
    inputEl.classList.remove('editing');
    let v = parseFloat(inputEl.value);
    if (!Number.isFinite(v)) v = 0;
    v = Math.max(-60, Math.min(0, v));
    inputEl.value = formatDb(v);
  });

  inputEl.addEventListener('keydown', e => {
    if (e.key === 'Enter')  inputEl.blur();
    if (e.key === 'Escape') { inputEl.value = formatDb(dragStartVal); inputEl.blur(); }
  });
}

function formatDb(v) {
  return v.toFixed(4).replace(/\.?0+$/, '') || '0';
}

export function getNormTarget(inputEl) {
  const v = parseFloat(inputEl.value);
  return Number.isFinite(v) ? v : 0;
}
