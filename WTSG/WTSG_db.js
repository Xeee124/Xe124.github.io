// === WTSG_db.js ===
  function createDefaultModel(name) {
    return {
      id: uuid(),
      name: name || 'Untitled Model',
      createdAt: nowIso(),
      updatedAt: nowIso(),
      settings: {
        sampleRate: SAMPLE_RATE,
        waveSize: 2048,
        durationSeconds: 5,
        candidateCount: 10,
        harmonicsCount: HARMONICS_DEFAULT,
        bandwidthMode: 'fixed',
        bandwidthValue: 0.35,
        bandwidthRange: [0.20, 0.50],
      },
      labels: {},
      boundary: { samples: [] },
      reference: [],
      meta: { notes: 'single-file browser model' },
    };
  }

  function createEmptyLabel(name) {
    return {
      name,
      samples: [],
      stats: { count: 0 },
      lastVector: null,
    };
  }

  async function openDb() {
    db = await new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const database = req.result;
        if (!database.objectStoreNames.contains(STORE)) {
          database.createObjectStore(STORE, { keyPath: 'id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function dbGetAllModels() {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const store = tx.objectStore(STORE);
      const req = store.getAll();
      let result = [];
      req.onsuccess = () => { result = req.result || []; };
      req.onerror = () => reject(req.error);
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
    });
  }

  async function saveModel(model) {
    model.updatedAt = nowIso();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(clone(model));
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    await loadModels();
    if (state.currentModel && state.currentModel.id === model.id) state.currentModel = clone(model);
    syncCandidateLabels();
  }

  async function deleteModel(id) {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    await loadModels();
  }

  async function loadModels() {
    state.models = await dbGetAllModels();
    const savedId = localStorage.getItem(ACTIVE_KEY);
    state.activeModelId = savedId && state.models.some(m => m.id === savedId) ? savedId : (state.models[0] ? state.models[0].id : null);
    state.currentModel = state.models.find(m => m.id === state.activeModelId) || null;
    persistActiveId();
  }

  function persistActiveId() {
    if (state.activeModelId) localStorage.setItem(ACTIVE_KEY, state.activeModelId);
  }

  function loadUiState() {
    try {
      const raw = localStorage.getItem(UI_KEY);
      if (raw) state.ui = Object.assign(state.ui, JSON.parse(raw));
    } catch (_) {}
  }

  function saveUiState() {
    localStorage.setItem(UI_KEY, JSON.stringify(state.ui));
  }

  function wireEvents() {
    els.newModelBtn.addEventListener('click', async () => {
