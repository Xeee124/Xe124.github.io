// === WTSG_main.js ===

  const DB_NAME = 'wavetable-training-db';
  const DB_VERSION = 1;
  const STORE = 'models';
  const ACTIVE_KEY = 'wavetable-active-model-id';
  const UI_KEY = 'wavetable-ui-settings';
  const SAMPLE_RATE = 48000;
  const HARMONICS_DEFAULT = 1024;

  const els = {
    modelSelect: byId('modelSelect'),
    newModelName: byId('newModelName'),
    newModelBtn: byId('newModelBtn'),
    saveModelBtn: byId('saveModelBtn'),
    statusBox: byId('statusBox'),
    candidateCount: byId('candidateCount'),
    bandwidthMode: byId('bandwidthMode'),
    bandwidthValue: byId('bandwidthValue'),
    bandwidthMin: byId('bandwidthMin'),
    bandwidthMax: byId('bandwidthMax'),
    waveSize: byId('waveSize'),
    durationSeconds: byId('durationSeconds'),
    harmonicsCount: byId('harmonicsCount'),
    trainLabelSelect: byId('trainLabelSelect'),
    newLabelName: byId('newLabelName'),
    genCandidatesBtn: byId('genCandidatesBtn'),
    candidateList: byId('candidateList'),
    modelSummary: byId('modelSummary'),
    labelList: byId('labelList'),
    referenceSummary: byId('referenceSummary'),
    referenceEditor: byId('referenceEditor'),
    saveReferenceBtn: byId('saveReferenceBtn'),
    importReferenceBtn: byId('importReferenceBtn'),
    importReferenceInput: byId('importReferenceInput'),
    importReferenceBtn2: byId('importReferenceBtn2'),
    importReferenceInput2: byId('importReferenceInput2'),
    genLabelA: byId('genLabelA'),
    genLabelB: byId('genLabelB'),
    mixSlider: byId('mixSlider'),
    mixReadout: byId('mixReadout'),
    refInfluence: byId('refInfluence'),
    refReadout: byId('refReadout'),
    useBoundaryAuto: byId('useBoundaryAuto'),
    boundaryThreshold: byId('boundaryThreshold'),
    boundaryReadout: byId('boundaryReadout'),
    genWaveSize: byId('genWaveSize'),
    genDurationSeconds: byId('genDurationSeconds'),
    genHarmonicsCount: byId('genHarmonicsCount'),
    generateAudioBtn: byId('generateAudioBtn'),
    generatedAudio: byId('generatedAudio'),
    downloadWavBtn: byId('downloadWavBtn'),
    clearGeneratedBtn: byId('clearGeneratedBtn'),
    genInfo: byId('genInfo'),
    genMeter: byId('genMeter'),
    importModelBtn: byId('importModelBtn'),
    importModelBtn2: byId('importModelBtn2'),
    importModelInput: byId('importModelInput'),
    importModelInput2: byId('importModelInput2'),
    exportModelBtn: byId('exportModelBtn'),
    exportModelBtn2: byId('exportModelBtn2'),
    clearReferenceBtn: byId('clearReferenceBtn'),
    duplicateModelBtn: byId('duplicateModelBtn'),
    dataSummary: byId('dataSummary'),
    dbModelList: byId('dbModelList'),
    textureModeOn: byId('textureModeOn'),
    ampNoise: byId('ampNoise'),
    ampNoiseReadout: byId('ampNoiseReadout'),
    phaseScale: byId('phaseScale'),
    phaseScaleReadout: byId('phaseScaleReadout'),
    arLoopBtn: byId('arLoopBtn'),
    arStopBtn: byId('arStopBtn'),
    arStatus: byId('arStatus'),
    arPreviewCanvas: byId('arPreviewCanvas'),
  };

  let db = null;
  let state = {
    models: [],
    activeModelId: null,
    currentModel: null,
    referenceFileName: '',
    generatedBlobUrl: '',
    generatedArrayBuffer: null,
    candidateBatch: [],
    playbackAudioCtx: null,
    ui: { activeTab: 'train', useBoundaryAuto: true, boundaryThreshold: 12 },
    arLoop: { running: false, acCtx: null, nextStartTime: 0, segmentsQueued: 0 },
  };

  init();

  async function init() {
    await openDb();
    loadUiState();
    await loadModels();
    wireEvents();
    updateBoundaryReadout();
    if (!state.models.length) {
      const model = createDefaultModel('Default Model');
      await saveModel(model);
      state.models = [model];
      state.activeModelId = model.id;
      persistActiveId();
    }
    renderModelSelect();
    await selectActiveModel(state.activeModelId || state.models[0].id);
    renderAll();
    setStatus('準備完了です。');
  }

