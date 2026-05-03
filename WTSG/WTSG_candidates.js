// === WTSG_candidates.js ===
  async function generateCandidates() {

    if (!state.currentModel) return;
    syncModelFromUI();
    const m = state.currentModel;
    const harmonicsCount = m.settings.harmonicsCount || HARMONICS_DEFAULT;
    const count = m.settings.candidateCount || 10;
    const bwMode = m.settings.bandwidthMode || 'fixed';
    const range = m.settings.bandwidthRange || [0.2, 0.5];
    const minBw = range[0];
    const maxBw = range[1];
    const ref = referenceCount(m.reference) ? m.reference : null;
    const activeLabelName = els.trainLabelSelect.value && els.trainLabelSelect.value !== '__new__' ? els.trainLabelSelect.value : '';
    const activeLabel = activeLabelName ? ensureLabel(m, activeLabelName) : null;
    const samples = activeLabel && activeLabel.samples ? activeLabel.samples : [];
    const tex = ref ? mergeTextureProfiles(ref, harmonicsCount) : null;
    const generated = [];
    for (let i = 0; i < count; i++) {
      const t = count <= 1 ? 0.5 : i / (count - 1);
      const bw = bwMode === 'adjustable' ? lerp(minBw, maxBw, t) : m.settings.bandwidthValue;
      const mix = ref ? clamp(parseInt(els.refInfluence.value, 10) / 100, 0, 1) : 0;
      const vec = sampleLabelVector(activeLabel, harmonicsCount, bw, ref, mix, t);
      generated.push({
        id: uuid(),
        bandwidth: bw,
        vector: vec,
        wav: synthVectorToBuffer(vec, m.settings.waveSize, m.settings.durationSeconds, SAMPLE_RATE, harmonicsCount, tex),
        sourceLabel: activeLabelName || 'random',
      });
    }
    state.candidateBatch = generated;
    renderCandidates();
    setStatus(`候補を ${generated.length} 個生成しました。`);
  }

  // ---- アナライザー描画 ----
  const ANALYZER_VIEWS = ['3D', 'Bar', 'Det'];
  // 各候補のビューモード記憶
  const candViewMap = {};

  function drawAnalyzer(canvas, vec, viewMode) {
    const ctx = canvas.getContext('2d');
    const W = canvas.width || canvas.offsetWidth || 320;
    const H = canvas.height || 110;
    canvas.width = W;
    canvas.height = H;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#060d1a';
    ctx.fillRect(0, 0, W, H);

    const amps = vec.amps;
    const phases = vec.phases;
    const n = amps.length;

    if (viewMode === '3D') {
      // ---- Vital スタイル 3D ----
      // 波形をIFFT相当で時間軸に展開し、複数フレームを奥から手前に並べる
      const NUM_FRAMES = 12;   // 奥から手前へ並べるフレーム数
      const WAVE_PTS  = 256;   // 1フレームの描画点数

      // 投影パラメータ
      const ox = W * 0.06;          // 左端オフセット
      const fw = W * 0.88;          // フレームの横幅
      const midY = H * 0.52;        // 水平中央
      const amp_scale = H * 0.38;   // 縦スケール
      const depth_dx = W * 0.008;   // フレームごとの右シフト量
      const depth_dy = H * 0.028;   // フレームごとの上シフト量（奥ほど上）

      // 波形を時間軸に展開（加算合成）
      function makeWave(ampArr, phArr, frameIdx, numFrames) {
        // 位相に微小なオフセットを入れて各フレームに変化を出す
        const phaseOffset = (frameIdx / numFrames) * Math.PI * 0.18;
        const wave = new Float32Array(WAVE_PTS);
        const harmonics = Math.min(ampArr.length, 128); // 128本までで十分
        for (let h = 0; h < harmonics; h++) {
          const a = ampArr[h] || 0;
          if (a < 1e-5) continue;
          const ph = (phArr[h] || 0) + phaseOffset * (h + 1) * 0.3;
          for (let i = 0; i < WAVE_PTS; i++) {
            wave[i] += a * Math.sin(2 * Math.PI * (h + 1) * i / WAVE_PTS + ph);
          }
        }
        // 正規化
        let mx = 0;
        for (let i = 0; i < WAVE_PTS; i++) { const v = Math.abs(wave[i]); if (v > mx) mx = v; }
        if (mx > 1e-6) for (let i = 0; i < WAVE_PTS; i++) wave[i] /= mx;
        return wave;
      }

      // 奥から順に描画（painter's algorithm）
      for (let fi = NUM_FRAMES - 1; fi >= 0; fi--) {
        const t = fi / (NUM_FRAMES - 1);  // 0=最奥, 1=最前面
        const frameX = ox + (NUM_FRAMES - 1 - fi) * depth_dx;
        const frameY = midY - (NUM_FRAMES - 1 - fi) * depth_dy;
        const wave = makeWave(amps, phases, fi, NUM_FRAMES);

        // 奥は小さく・薄く
        const alpha  = 0.12 + 0.78 * t;
        const lwidth = 0.6  + 1.2  * t;
        const scaleX = 1 - (1 - t) * 0.14; // 奥ほど少し横を縮める

        // 塗りつぶし（最前面のみ）
        if (fi === 0) {
          ctx.beginPath();
          for (let i = 0; i <= WAVE_PTS; i++) {
            const px = frameX + (i / WAVE_PTS) * fw * scaleX;
            const py = i < WAVE_PTS ? frameY - wave[i] * amp_scale : frameY;
            i === 0 ? ctx.moveTo(px, frameY) : (i === 1 ? ctx.lineTo(px, py) : ctx.lineTo(px, py));
          }
          ctx.lineTo(frameX + fw * scaleX, frameY);
          ctx.closePath();
          ctx.fillStyle = 'rgba(255,100,30,0.07)';
          ctx.fill();
        }

        // ライン
        ctx.beginPath();
        const hue = 25 + (1 - t) * 160; // 前面=オレンジ、後面=青
        ctx.strokeStyle = `hsla(${hue},${70+t*30}%,${55+t*25}%,${alpha})`;
        ctx.lineWidth = lwidth;
        for (let i = 0; i < WAVE_PTS; i++) {
          const px = frameX + (i / (WAVE_PTS - 1)) * fw * scaleX;
          const py = frameY - wave[i] * amp_scale;
          i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
        }
        ctx.stroke();

        // 底辺ライン（立体感）
        ctx.beginPath();
        ctx.strokeStyle = `rgba(40,80,140,${alpha * 0.3})`;
        ctx.lineWidth = 0.5;
        ctx.moveTo(frameX, frameY);
        ctx.lineTo(frameX + fw * scaleX, frameY);
        ctx.stroke();
      }

      // ラベル
      ctx.fillStyle = 'rgba(120,170,220,0.5)';
      ctx.font = '8px system-ui';
      ctx.fillText('3D', 4, H - 4);

    } else if (viewMode === 'Bar') {
      // ---- 棒グラフ（振幅上段 + 位相0〜360°下段）----
      const ampH = H * 0.50, phH = H * 0.36;
      const ampY = 4, phY = H * 0.58;
      const barW = Math.max(1, (W - 4) / n);

      // 振幅
      for (let i = 0; i < n; i++) {
        const bh = amps[i] * ampH;
        const x = 2 + i * barW;
        const g = ctx.createLinearGradient(0, ampY + ampH - bh, 0, ampY + ampH);
        g.addColorStop(0, '#ff7832'); g.addColorStop(1, '#ff3a00');
        ctx.fillStyle = g;
        ctx.fillRect(x, ampY + ampH - bh, Math.max(1, barW - 0.5), bh);
      }
      ctx.fillStyle = 'rgba(140,190,255,0.5)'; ctx.font = '8px system-ui';
      ctx.fillText('Amp', 3, ampY + 9);

      // 位相 0〜360°
      ctx.strokeStyle = 'rgba(100,160,255,0.18)'; ctx.lineWidth = 0.5;
      for (let deg = 90; deg < 360; deg += 90) {
        const ly = phY + phH - (deg / 360) * phH;
        ctx.beginPath(); ctx.moveTo(2, ly); ctx.lineTo(W - 2, ly); ctx.stroke();
      }
      for (let i = 0; i < n; i++) {
        const norm = ((phases[i] + Math.PI) / (2 * Math.PI));
        const bh = norm * phH;
        const x = 2 + i * barW;
        ctx.fillStyle = `hsla(${200 + 60 * norm},80%,65%,0.75)`;
        ctx.fillRect(x, phY + phH - bh, Math.max(1, barW - 0.5), bh);
      }
      ctx.fillStyle = 'rgba(140,190,255,0.5)';
      ctx.fillText('Phase 0–360°', 3, phY + 9);

    } else {
      // ---- Det（横スクロール詳細表示）----
      const BAR_W = 8, GAP = 2, UNIT = BAR_W + GAP;
      const totalW = n * UNIT;
      canvas.width = totalW;
      canvas.style.width = totalW + 'px';
      const ampH = H * 0.50, phH = H * 0.36;
      const ampY = 4, phY = H * 0.58;

      ctx.fillStyle = '#060d1a';
      ctx.fillRect(0, 0, totalW, H);

      for (let i = 0; i < n; i++) {
        const bh = amps[i] * ampH;
        const x = i * UNIT;
        const g = ctx.createLinearGradient(0, ampY + ampH - bh, 0, ampY + ampH);
        g.addColorStop(0, '#ff9050'); g.addColorStop(1, '#ff4010');
        ctx.fillStyle = g;
        ctx.fillRect(x, ampY + ampH - bh, BAR_W, bh);
      }
      ctx.strokeStyle = 'rgba(100,180,255,0.15)'; ctx.lineWidth = 0.5;
      for (let deg = 90; deg < 360; deg += 90) {
        const ly = phY + phH - (deg / 360) * phH;
        ctx.beginPath(); ctx.moveTo(0, ly); ctx.lineTo(totalW, ly); ctx.stroke();
      }
      for (let i = 0; i < n; i++) {
        const norm = ((phases[i] + Math.PI) / (2 * Math.PI));
        const bh = norm * phH;
        const x = i * UNIT;
        ctx.fillStyle = `hsla(${200 + 60 * norm},80%,65%,0.78)`;
        ctx.fillRect(x, phY + phH - bh, BAR_W, bh);
      }
      ctx.fillStyle = 'rgba(170,205,255,0.55)'; ctx.font = '9px system-ui';
      ctx.fillText('Amp', 2, ampY + 10);
      ctx.fillText('Phase 0–360°', 2, phY + 10);
    }
  }
  // (old drawAnalyzer code removed)

  function setupAnalyzer(container, vec, candId) {
    const viewMode = candViewMap[candId] || '3D';
    const canvas = container.querySelector('canvas');
    const wrap = container.querySelector('.det-wrap');

    if (viewMode === 'Det') {
      // Det: 横スクロールwrapの中にcanvasを置く
      wrap.style.display = 'block';
      canvas.style.display = 'none';
      const dc = wrap.querySelector('canvas');
      const H = 110;
      dc.height = H;
      drawAnalyzer(dc, vec, 'Det');
    } else {
      wrap.style.display = 'none';
      canvas.style.display = 'block';
      canvas.width = canvas.offsetWidth || 320;
      canvas.height = 110;
      drawAnalyzer(canvas, vec, viewMode);
    }

    // ビューボタンのactive更新
    container.querySelectorAll('.view-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.view === viewMode);
    });
  }

  // 現在表示中の候補インデックス
  let candCurrentIdx = 0;

  function updateCandNav() {
    const total = state.candidateBatch.length;
    const nav = document.getElementById('candidateNav');
    const counter = document.getElementById('candCounter');
    if (!nav || !counter) return;
    if (total === 0) { nav.classList.add('hidden'); return; }
    nav.classList.remove('hidden');
    counter.textContent = `${candCurrentIdx + 1} / ${total}`;
    const track = document.getElementById('candidateList');
    if (!track) return;
    // アニメーションクラスを一時的に付けて、終わったら外す（折り返し時のカクつき防止）
    track.classList.add('animating');
    track.style.transform = `translateX(-${candCurrentIdx * 100}%)`;
    clearTimeout(track._animTimer);
    track._animTimer = setTimeout(() => track.classList.remove('animating'), 360);
  }

  function renderCandidates() {
    if (!state.currentModel) return;
    const m = state.currentModel;
    const labels = Object.keys(m.labels || {}).sort((a,b) => a.localeCompare(b, 'ja'));
    const track = document.getElementById('candidateList');

    if (!state.candidateBatch.length) {
      track.innerHTML = '<div class="cand-slide"><div class="status" style="margin:8px 0;">まだ候補がありません。候補を生成してください。</div></div>';
      document.getElementById('candidateNav').classList.add('hidden');
      return;
    }

    track.innerHTML = state.candidateBatch.map((cand, idx) => {
      const selectOptions = labels.map(n => `<option value="${escapeAttr(n)}">${escapeHtml(n)}</option>`).join('') + (labels.length ? '' : '<option value="">（ラベルなし）</option>');
      return `
        <div class="cand-slide">
          <div class="card" data-cand-id="${escapeAttr(cand.id)}">
            <div class="cand-analyzer">
              <canvas style="display:block;width:100%;height:110px;"></canvas>
              <div class="det-wrap" style="display:none;height:110px;overflow-x:auto;-webkit-overflow-scrolling:touch;">
                <canvas height="110" style="height:110px;display:block;"></canvas>
              </div>
              <div class="view-btns">
                ${ANALYZER_VIEWS.map(v => `<button class="view-btn${v === (candViewMap[cand.id]||'3D') ? ' active':''}" data-view="${v}" data-cand-ref="${escapeAttr(cand.id)}">${v}</button>`).join('')}
              </div>
            </div>
            <div class="card-head" style="margin-bottom:6px;">
              <div>
                <div class="card-title">候補 ${idx + 1}</div>
                <div class="card-sub">${escapeHtml(cand.sourceLabel)} / ぼかし ${cand.bandwidth.toFixed(2)}</div>
              </div>
              <div class="chip">A1 ${(cand.vector.amps[0]||0).toFixed(2)} / P1 ${(cand.vector.phases[0]||0).toFixed(2)}</div>
            </div>
            <div class="cand-audio">
              <audio controls src="${cand.wav.url}"></audio>
            </div>
            <div class="card-actions" style="margin-top:8px;">
              <div style="min-width:160px;flex:1 1 160px;">
                <select data-target-label="${escapeAttr(cand.id)}">
                  <option value="">保存先ラベルを選ぶ</option>
                  ${selectOptions}
                  <option value="__new__">＋山を追加する</option>
                </select>
              </div>
              <button class="tiny good" data-add-label="${escapeAttr(cand.id)}">山に入れる</button>
              <button class="tiny warn" data-mark-boundary="${escapeAttr(cand.id)}">中間</button>
              <button class="tiny secondary" data-download-cand="${escapeAttr(cand.id)}">DL</button>
              <button class="tiny ghost" data-remove-cand="${escapeAttr(cand.id)}">破棄</button>
            </div>
            <div class="boundary-ui hidden" data-boundary-ui="${escapeAttr(cand.id)}">
              <div class="divider"></div>
              <div class="row">
                <div class="c-5"><span class="label">左の山</span>
                  <select data-boundary-a="${escapeAttr(cand.id)}">${labels.map(n => `<option value="${escapeAttr(n)}">${escapeHtml(n)}</option>`).join('')}</select></div>
                <div class="c-5"><span class="label">右の山</span>
                  <select data-boundary-b="${escapeAttr(cand.id)}">${labels.map(n => `<option value="${escapeAttr(n)}">${escapeHtml(n)}</option>`).join('')}</select></div>
                <div class="c-2"><span class="label">中間の強さ</span>
                  <input type="range" min="0" max="100" value="50" data-boundary-ratio="${escapeAttr(cand.id)}"></div>
              </div>
              <div class="card-actions">
                <button class="tiny good" data-save-boundary="${escapeAttr(cand.id)}">境界に入れる</button>
                <button class="tiny ghost" data-hide-boundary="${escapeAttr(cand.id)}">閉じる</button>
              </div>
            </div>
          </div>
        </div>`;
    }).join('');

    // アナライザー初期描画（requestAnimationFrameでレイアウト確定後）
    requestAnimationFrame(() => {
      track.querySelectorAll('.cand-slide').forEach((slide, idx) => {
        const cand = state.candidateBatch[idx];
        if (!cand) return;
        setupAnalyzer(slide.querySelector('.cand-analyzer'), cand.vector, cand.id);
      });
    });

    // ビューボタン
    track.querySelectorAll('.view-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.candRef;
        candViewMap[id] = btn.dataset.view;
        const slide = btn.closest('.cand-slide');
        const cand = state.candidateBatch.find(c => c.id === id);
        if (cand) setupAnalyzer(slide.querySelector('.cand-analyzer'), cand.vector, id);
      });
    });

    // 山に入れる
    track.querySelectorAll('[data-add-label]').forEach(btn => btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-add-label');
      const cand = state.candidateBatch.find(c => c.id === id);
      if (!cand) return;
      let target = track.querySelector(`[data-target-label="${cssEscape(id)}"]`).value;
      if (!target) { target = prompt('入れるラベル名を入力してください'); if (!target) return; }
      if (target === '__new__') { target = prompt('新しいラベル名を入力してください'); if (!target) return; }
      addCandidateToLabel(target.trim(), cand);
    }));

    track.querySelectorAll('[data-mark-boundary]').forEach(btn => btn.addEventListener('click', () => {
      const ui = track.querySelector(`[data-boundary-ui="${cssEscape(btn.getAttribute('data-mark-boundary'))}"]`);
      if (ui) ui.classList.remove('hidden');
    }));
    track.querySelectorAll('[data-hide-boundary]').forEach(btn => btn.addEventListener('click', () => {
      const ui = track.querySelector(`[data-boundary-ui="${cssEscape(btn.getAttribute('data-hide-boundary'))}"]`);
      if (ui) ui.classList.add('hidden');
    }));
    track.querySelectorAll('[data-save-boundary]').forEach(btn => btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-save-boundary');
      const cand = state.candidateBatch.find(c => c.id === id);
      if (!cand) return;
      const a = track.querySelector(`[data-boundary-a="${cssEscape(id)}"]`).value;
      const b = track.querySelector(`[data-boundary-b="${cssEscape(id)}"]`).value;
      const ratio = parseInt(track.querySelector(`[data-boundary-ratio="${cssEscape(id)}"]`).value, 10) / 100;
      await addCandidateToBoundary(cand, a, b, ratio);
    }));
    track.querySelectorAll('[data-download-cand]').forEach(btn => btn.addEventListener('click', () => {
      const cand = state.candidateBatch.find(c => c.id === btn.getAttribute('data-download-cand'));
      if (cand) downloadBufferAsWav(cand.wav.buffer, `candidate_${cand.id}.wav`);
    }));
    track.querySelectorAll('[data-remove-cand]').forEach(btn => btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-remove-cand');
      state.candidateBatch = state.candidateBatch.filter(c => c.id !== id);
      if (candCurrentIdx >= state.candidateBatch.length) candCurrentIdx = Math.max(0, state.candidateBatch.length - 1);
      renderCandidates();
      updateCandNav();
    }));

    // スワイプ対応
    setupCandSwipe();
    candCurrentIdx = Math.min(candCurrentIdx, state.candidateBatch.length - 1);
    // HTML再構築後はアニメーションなしで即座に位置をセット（カクつき防止）
    track.classList.remove('animating');
    track.style.transform = `translateX(-${candCurrentIdx * 100}%)`;
    updateCandNav();
  }

  function setupCandSwipe() {
    const wrap = document.getElementById('candidateScrollWrap');
    if (!wrap || wrap._swipeReady) return;
    wrap._swipeReady = true;
    let startX = 0, startY = 0, isDragging = false;
    wrap.addEventListener('touchstart', e => {
      // Det横スクロール枠内のタッチは候補スワイプとして扱わない
      if (e.target.closest && e.target.closest('.det-wrap')) { isDragging = false; return; }
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      isDragging = true;
    }, { passive: true });
    wrap.addEventListener('touchmove', e => {
      if (!isDragging) return;
      if (e.target.closest && e.target.closest('.det-wrap')) { isDragging = false; return; }
      const dx = e.touches[0].clientX - startX;
      const dy = Math.abs(e.touches[0].clientY - startY);
      if (dy > Math.abs(dx) * 1.2) { isDragging = false; return; }
      e.preventDefault();
    }, { passive: false });
    wrap.addEventListener('touchend', e => {
      if (!isDragging) return;
      isDragging = false;
      const dx = e.changedTouches[0].clientX - startX;
      if (Math.abs(dx) < 40) return;
      if (dx < 0 && candCurrentIdx < state.candidateBatch.length - 1) candCurrentIdx++;
      else if (dx > 0 && candCurrentIdx > 0) candCurrentIdx--;
      updateCandNav();
    });
  }

  // 矢印ボタンのイベント（wireEventsから呼ぶのでここで登録しない）
  function wireCandNav() {
    document.getElementById('candPrev').addEventListener('click', () => {
      if (candCurrentIdx > 0) { candCurrentIdx--; updateCandNav(); }
    });
    document.getElementById('candNext').addEventListener('click', () => {
      if (candCurrentIdx < state.candidateBatch.length - 1) { candCurrentIdx++; updateCandNav(); }
    });
  }
