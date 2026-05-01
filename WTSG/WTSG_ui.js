// === WTSG_ui.js ===
      const name = els.newModelName.value.trim() || `Model ${state.models.length + 1}`;
      const model = createDefaultModel(name);
      await saveModel(model);
      state.activeModelId = model.id;
      state.currentModel = model;
      persistActiveId();
      renderAll();
      setStatus(`新規モデル「${name}」を作成しました。`);
    });

    els.saveModelBtn.addEventListener('click', async () => {
      if (!state.currentModel) return;
      syncModelFromUI();
      await saveModel(state.currentModel);
      renderAll();
      setStatus('モデルを保存しました。');
    });

    els.modelSelect.addEventListener('change', async () => {
      await selectActiveModel(els.modelSelect.value);
      renderAll();
    });

    document.querySelectorAll('.tabbar button').forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        state.ui.activeTab = tab;
        saveUiState();
        document.querySelectorAll('.tabbar button').forEach(b => b.classList.toggle('active', b === btn));
        document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
        byId('tab-' + tab).classList.remove('hidden');
      });
    });

    els.genCandidatesBtn.addEventListener('click', generateCandidates);
    els.importReferenceBtn.addEventListener('click', () => els.importReferenceInput.click());
    els.importReferenceBtn2.addEventListener('click', () => els.importReferenceInput2.click());
    els.importReferenceInput.addEventListener('change', handleReferenceImport);
    els.importReferenceInput2.addEventListener('change', handleReferenceImport);
    els.importModelBtn.addEventListener('click', () => els.importModelInput.click());
    els.importModelBtn2.addEventListener('click', () => els.importModelInput2.click());
    els.importModelInput.addEventListener('change', handleModelImport);
    els.importModelInput2.addEventListener('change', handleModelImport);
    els.exportModelBtn.addEventListener('click', exportModelJson);
    els.exportModelBtn2.addEventListener('click', exportModelJson);
    els.saveReferenceBtn.addEventListener('click', saveReferenceEditor);
    els.clearReferenceBtn.addEventListener('click', async () => {
      if (!state.currentModel) return;
      state.currentModel.reference = [];
      await saveModel(state.currentModel);
      renderAll();
      setStatus('リファレンスを解除しました。');
    });
    els.duplicateModelBtn.addEventListener('click', async () => {
      if (!state.currentModel) return;
      const copy = clone(state.currentModel);
      copy.id = uuid();
      copy.name = `${copy.name} copy`;
      copy.createdAt = nowIso();
      copy.updatedAt = nowIso();
      await saveModel(copy);
      state.activeModelId = copy.id;
      state.currentModel = copy;
      persistActiveId();
      renderAll();
      setStatus('モデルを複製しました。');
    });

    [els.bandwidthMode, els.bandwidthValue, els.bandwidthMin, els.bandwidthMax, els.waveSize, els.durationSeconds, els.harmonicsCount].forEach(el => {
      el.addEventListener('input', () => syncModelFromUI());
    });
    [els.candidateCount, els.genWaveSize, els.genDurationSeconds, els.genHarmonicsCount].forEach(el => {
      el.addEventListener('input', () => syncModelFromUI());
    });
    els.mixSlider.addEventListener('input', updateMixReadout);
    els.refInfluence.addEventListener('input', updateRefReadout);
    els.useBoundaryAuto.addEventListener('change', () => saveUiState());
    els.boundaryThreshold.addEventListener('input', () => { updateBoundaryReadout(); saveUiState(); });
    els.generateAudioBtn.addEventListener('click', generateFinalAudio);
    els.downloadWavBtn.addEventListener('click', downloadCurrentWav);

    // 質感モード UIの読み取り更新
    const updateTextureReadouts = () => {
      els.ampNoiseReadout.textContent   = (parseInt(els.ampNoise.value, 10) / 100).toFixed(2);
      els.phaseScaleReadout.textContent = '×' + (parseInt(els.phaseScale.value, 10) / 100).toFixed(2);
    };
    els.ampNoise.addEventListener('input', updateTextureReadouts);
    els.phaseScale.addEventListener('input', updateTextureReadouts);
    updateTextureReadouts();

    // 自己回帰ループ
    els.arLoopBtn.addEventListener('click', startArLoop);
    els.arStopBtn.addEventListener('click', stopArLoop);
    els.clearGeneratedBtn.addEventListener('click', () => {
      if (state.generatedBlobUrl) URL.revokeObjectURL(state.generatedBlobUrl);
      state.generatedBlobUrl = '';
      state.generatedArrayBuffer = null;
      els.generatedAudio.removeAttribute('src');
      els.generatedAudio.load();
      els.downloadWavBtn.disabled = true;
      els.clearGeneratedBtn.disabled = true;
      els.genInfo.textContent = 'まだ生成していません。';
      els.genMeter.style.width = '0%';
    });
    wireCandNav();
  }

  async function selectActiveModel(id) {
    if (!id) return;
    const model = state.models.find(m => m.id === id);
    if (!model) return;
    state.activeModelId = id;
    state.currentModel = clone(model);
    invalidateRefPoolCache();
    persistActiveId();
    syncUIFromModel();
  }

  function syncUIFromModel() {
    const m = state.currentModel;
    if (!m) return;
    const s = m.settings || {};
    els.modelSelect.value = m.id;
    els.bandwidthMode.value = s.bandwidthMode || 'fixed';
    els.bandwidthValue.value = s.bandwidthValue ?? 0.35;
    els.bandwidthMin.value = (s.bandwidthRange && s.bandwidthRange[0]) ?? 0.2;
    els.bandwidthMax.value = (s.bandwidthRange && s.bandwidthRange[1]) ?? 0.5;
    els.waveSize.value = String(s.waveSize || 2048);
    els.durationSeconds.value = s.durationSeconds || 5;
    els.candidateCount.value = s.candidateCount || 10;
    els.harmonicsCount.value = String(s.harmonicsCount || HARMONICS_DEFAULT);
    els.genWaveSize.value = String(s.waveSize || 2048);
    els.genDurationSeconds.value = s.durationSeconds || 5;
    els.genHarmonicsCount.value = String(s.harmonicsCount || HARMONICS_DEFAULT);
    els.genLabelA.innerHTML = labelsOptionsHtml(m, false);
    els.genLabelB.innerHTML = labelsOptionsHtml(m, true);
    els.trainLabelSelect.innerHTML = labelsOptionsHtml(m, true);
    if (!els.trainLabelSelect.value && Object.keys(m.labels).length) els.trainLabelSelect.value = Object.keys(m.labels)[0];
    if (!els.genLabelA.value && Object.keys(m.labels).length) els.genLabelA.value = Object.keys(m.labels)[0];
    if (!els.genLabelB.value) els.genLabelB.value = '';
    els.useBoundaryAuto.checked = !!state.ui.useBoundaryAuto;
    els.boundaryThreshold.value = String(state.ui.boundaryThreshold ?? 12);
    updateMixReadout();
    updateRefReadout();
    updateBoundaryReadout();
  }

  function syncModelFromUI() {
    if (!state.currentModel) return;
    const m = state.currentModel;
    m.settings.bandwidthMode = els.bandwidthMode.value;
    m.settings.bandwidthValue = clamp(parseFloat(els.bandwidthValue.value || '0.35'), 0.01, 1);
    m.settings.bandwidthRange = [
      clamp(parseFloat(els.bandwidthMin.value || '0.2'), 0.01, 2),
      clamp(parseFloat(els.bandwidthMax.value || '0.5'), 0.01, 2)
    ].sort((a,b) => a - b);
    m.settings.waveSize = parseInt(els.waveSize.value, 10) || 2048;
    m.settings.durationSeconds = parseFloat(els.durationSeconds.value) || 5;
    m.settings.candidateCount = Math.max(1, parseInt(els.candidateCount.value, 10) || 10);
    m.settings.harmonicsCount = Math.max(8, parseInt(els.harmonicsCount.value, 10) || HARMONICS_DEFAULT);
    const g = m.settings;
    els.genWaveSize.value = String(g.waveSize);
    els.genDurationSeconds.value = String(g.durationSeconds);
    els.genHarmonicsCount.value = String(g.harmonicsCount);
  }

  function labelsOptionsHtml(model, allowNone) {
    const names = Object.keys(model.labels || {}).sort((a,b)=>a.localeCompare(b, 'ja'));
    let html = allowNone ? '<option value="">（未選択）</option>' : '';
    for (const name of names) html += `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`;
    html += `<option value="__new__">＋山を追加する</option>`;
    return html;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  }

  function renderAll() {
    renderModelSelect();
    syncUIFromModel();
    renderStatus();
    renderLabels();
    renderReferenceSummary();
    renderDbList();
    els.useBoundaryAuto.checked = !!state.ui.useBoundaryAuto;
    els.boundaryThreshold.value = String(state.ui.boundaryThreshold ?? 12);
    updateMixReadout();
    updateRefReadout();
    updateBoundaryReadout();
    // アクティブなタブを復元（ページを開き直した時にタイムアウトしないよう、候補は再生成しない）
    if (state.ui.activeTab && state.ui.activeTab !== 'train') {
      document.querySelectorAll('.tabbar button').forEach(btn => btn.classList.toggle('active', btn.dataset.tab === state.ui.activeTab));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
      const tabEl = byId('tab-' + state.ui.activeTab);
      if (tabEl) tabEl.classList.remove('hidden');
    } else {
      // trainタブの場合のみ候補の表示を維持（renderCandidatesは候補生成時のみ呼ぶ）
      document.querySelectorAll('.tabbar button').forEach(btn => btn.classList.toggle('active', btn.dataset.tab === (state.ui.activeTab || 'train')));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
      const tabEl = byId('tab-train');
      if (tabEl) tabEl.classList.remove('hidden');
    }
  }

  function renderModelSelect() {
    els.modelSelect.innerHTML = state.models.map(m =>
      `<option value="${escapeAttr(m.id)}">${escapeHtml(m.name)}</option>`
    ).join('');
    if (state.activeModelId) els.modelSelect.value = state.activeModelId;
  }

    function renderStatus() {
    const m = state.currentModel;
    if (!m) {
      els.statusBox.textContent = 'モデルがありません。';
      els.modelSummary.textContent = '未作成です。';
      els.dataSummary.textContent = '未作成です。';
      return;
    }
    const labelCount = Object.keys(m.labels || {}).length;
    const sampleCount = Object.values(m.labels || {}).reduce((a, l) => a + (l.samples ? l.samples.length : 0), 0);
    const boundaryCount = (m.boundary_kde && m.boundary_kde.samples && m.boundary_kde.samples.length) || 0;
    const refCount = referenceCount(m.reference);
    els.statusBox.innerHTML = `モデル: <strong>${escapeHtml(m.name)}</strong><br>${labelCount}ラベル / ${sampleCount}サンプル / 境界 ${boundaryCount} / リファレンス ${refCount}`;
    els.modelSummary.innerHTML = `
      <strong>${escapeHtml(m.name)}</strong><br>
      ラベル数: ${labelCount}<br>
      学習済みサンプル: ${sampleCount}<br>
      境界KDEサンプル: ${boundaryCount}<br>
      リファレンス数: ${refCount}<br>
      ぼかし: ${escapeHtml(m.settings.bandwidthMode)} / ${m.settings.bandwidthValue.toFixed(2)}<br>
      波形長: ${m.settings.waveSize} / 時間: ${m.settings.durationSeconds}s
    `;
    els.dataSummary.innerHTML = `
      保存先: IndexedDB<br>
      モデル数: ${state.models.length}<br>
      現在のモデルID: <span class="mono">${escapeHtml(m.id)}</span><br>
      リファレンス: ${refCount}件
    `;
  }

  function renderLabels() {
    const m = state.currentModel;
    if (!m) return;
    const names = Object.keys(m.labels || {}).sort((a,b)=>a.localeCompare(b, 'ja'));
    const labelHtml = names.length ? names.map(name => {
      const label = m.labels[name];
      const count = label.samples ? label.samples.length : 0;
      return `<div class="card"><div class="card-head"><div><div class="card-title">${escapeHtml(name)}</div><div class="card-sub">${count} サンプル</div></div><button class="tiny danger" data-del-label="${escapeAttr(name)}">削除</button></div></div>`;
    }).join('') : '<div class="status">ラベルはまだありません。</div>';
    els.labelList.innerHTML = labelHtml;
    els.labelList.querySelectorAll('[data-del-label]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const name = btn.getAttribute('data-del-label');
        if (!confirm(`ラベル「${name}」を削除しますか？`)) return;
        delete m.labels[name];
        await saveModel(m);
        state.currentModel = clone(m);
        renderAll();
      });
    });
  }

  function renderReferenceSummary() {
    const m = state.currentModel;
    const items = m ? referenceList(m.reference) : [];
    if (!m || !items.length) {
      els.referenceSummary.innerHTML = '未読み込みです。';
      if (els.referenceEditor) els.referenceEditor.value = '[]';
      return;
    }
    els.referenceSummary.innerHTML = `
      <strong>${items.length}件のリファレンス</strong><br>
      合計フレーム数: ${items.reduce((a, r) => a + ((r.frames && r.frames.length) || 0), 0)}<br>
      <div class="list" style="margin-top:8px;">${items.map((r, i) => `
        <div style="display:flex;align-items:center;gap:8px;padding:4px 0;border-top:1px solid var(--line);">
          <span style="flex:1;font-size:0.88rem;">${escapeHtml(r.name || r.fileName || `リファレンス ${i+1}`)}</span>
          <button class="tiny danger" data-del-ref="${i}">削除</button>
        </div>`).join('')}
      </div>
    `;
    els.referenceSummary.querySelectorAll('[data-del-ref]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const idx = parseInt(btn.getAttribute('data-del-ref'), 10);
        const list = referenceList(state.currentModel.reference);
        list.splice(idx, 1);
        state.currentModel.reference = list;
        await saveModel(state.currentModel);
        state.currentModel = clone(state.currentModel);
        renderAll();
        setStatus('リファレンスを1件削除しました。');
      });
    });
    if (els.referenceEditor) {
      els.referenceEditor.value = JSON.stringify(items, null, 2);
    }
  }

  async function saveReferenceEditor() {
    if (!state.currentModel) return;
    let parsed;
    try {
      parsed = JSON.parse(els.referenceEditor.value || '[]');
    } catch (e) {
      alert('リファレンスJSONの読み込みに失敗しました。');
      return;
    }
    state.currentModel.reference = referenceList(parsed);
    await saveModel(state.currentModel);
    state.currentModel = clone(state.currentModel);
    renderAll();
    setStatus('リファレンスを反映しました。');
  }

  function renderDbList() {
    const items = state.models.slice().sort((a,b) => (a.updatedAt < b.updatedAt ? 1 : -1));
    els.dbModelList.innerHTML = items.map(m => `
      <div class="card">
        <div class="card-head">
          <div>
            <div class="card-title">${escapeHtml(m.name)}</div>
            <div class="card-sub">${escapeHtml(m.updatedAt || '')}</div>
          </div>
          <div class="chip">${Object.keys(m.labels || {}).length} labels</div>
        </div>
        <div class="card-actions">
          <button class="tiny secondary" data-load-model="${escapeAttr(m.id)}">開く</button>
          <button class="tiny danger" data-delete-model="${escapeAttr(m.id)}">削除</button>
        </div>
      </div>
    `).join('') || '<div class="status">保存済みモデルはありません。</div>';
    els.dbModelList.querySelectorAll('[data-load-model]').forEach(btn => btn.addEventListener('click', async () => {
      await selectActiveModel(btn.getAttribute('data-load-model'));
      renderAll();
      setStatus('モデルを切り替えました。');
    }));
    els.dbModelList.querySelectorAll('[data-delete-model]').forEach(btn => btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-delete-model');
      const m = state.models.find(x => x.id === id);
      if (!confirm(`モデル「${m ? m.name : id}」を削除しますか？`)) return;
      await deleteModel(id);
      if (state.activeModelId === id) {
        state.currentModel = state.models[0] ? clone(state.models[0]) : null;
        state.activeModelId = state.currentModel ? state.currentModel.id : null;
        persistActiveId();
      }
      renderAll();
      setStatus('モデルを削除しました。');
    }));
  }

  function updateMixReadout() {
    const a = 100 - parseInt(els.mixSlider.value, 10);
    const b = parseInt(els.mixSlider.value, 10);
    els.mixReadout.textContent = `A ${a}% / B ${b}%`;
  }

  function updateRefReadout() {
    els.refReadout.textContent = `${parseInt(els.refInfluence.value, 10)}%`;
  }

  function updateBoundaryReadout() {
    els.boundaryReadout.textContent = `±${parseInt(els.boundaryThreshold.value, 10)}%`;
    state.ui.useBoundaryAuto = !!els.useBoundaryAuto.checked;
    state.ui.boundaryThreshold = parseInt(els.boundaryThreshold.value, 10) || 12;
    saveUiState();
  }

  function setStatus(text) {
    els.statusBox.textContent = text;
  }

