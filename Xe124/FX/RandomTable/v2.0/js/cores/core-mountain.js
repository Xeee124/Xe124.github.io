(function () {
  'use strict';
  const { BIN_MAX, TAU, blankFrame, clamp01 } = window.WT;

  window.WT.CORES = window.WT.CORES || {};
  window.WT.CORES['mountain'] = {
    label: 'Mountain（ギザギザ＋大小うねうね）',
    fn: function coreMountain(pos) {
      const f = blankFrame();
      const bigAmp = 0.6 + Math.random() * 0.4;
      const bigFreq = 2 + Math.random() * 5;
      const smallAmp = 0.3 + Math.random() * 0.4;
      const smallFreq = 18 + Math.random() * 25;
      const phase0 = Math.random() * TAU;
      const sawBias = 0.3 + Math.random() * 0.5;
      const bassGrainFreq = 4 + Math.floor(Math.random() * 6);
      for (let k = 1; k <= BIN_MAX; k++) {
        const x = k / BIN_MAX;
        const r1 = Math.random(), r2 = Math.random();
        const bigEnv = 0.5 + 0.5 * Math.cos(x * TAU * bigFreq + phase0 + pos * 0.15);
        const smallEnv = 0.5 + 0.5 * Math.sin(x * TAU * smallFreq + phase0 * 1.3 + pos * 0.4);
        const sawEnv = (k % 2 === 1) ? 1.0 : (1.0 - sawBias);
        const bassGrain = x < 0.15 ? (0.5 + 0.5 * Math.sin(k * TAU / bassGrainFreq + pos)) : 0;
        const base = Math.pow(r1, 1.4) * (0.35 + 0.65 * (1 - x) * sawEnv);
        f.amp[k] = clamp01(base * (0.45 * bigEnv + 0.3 * smallEnv + 0.25) + 0.4 * bassGrain * r1);
        f.phase[k] = r2 * TAU + (k % 2 === 0 ? Math.PI : 0) * 0.5 + pos * 0.1;
      }
      return f;
    }
  };
})();
