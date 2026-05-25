(function () {
  'use strict';
  const { BIN_MAX, TAU, blankFrame, clamp01 } = window.WT;

  window.WT.CORES = window.WT.CORES || {};
  window.WT.CORES['metaai'] = {
    label: 'MetaAI（オリジナルランダム）',
    fn: function coreMetaAI(pos) {
      const f = blankFrame();
      for (let k = 1; k <= BIN_MAX; k++) {
        const r1 = Math.random(), r2 = Math.random(), r3 = Math.random();
        const x = k / BIN_MAX;
        const falloff = 0.55 + 0.75 * Math.pow(1 - x, 1.5);
        const grain = 0.65 + 0.35 * r2;
        f.amp[k] = Math.pow(r1, 1.55) * falloff * grain;
        f.phase[k] = r2 * TAU + Math.sin(pos * 0.15 + k * 0.01 + r3 * TAU) * 0.12;
      }
      return f;
    }
  };
})();
