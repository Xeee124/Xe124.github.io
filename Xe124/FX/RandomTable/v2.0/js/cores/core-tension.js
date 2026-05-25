(function () {
  'use strict';
  const { BIN_MAX, TAU, blankFrame, clamp01 } = window.WT;

  window.WT.CORES = window.WT.CORES || {};
  window.WT.CORES['tension'] = {
    label: 'Tension（不協和音程の引き伸ばし系）',
    fn: function coreTension(pos) {
      const f = blankFrame();
      const ratios = [1.0, 1.414, 1.618, 2.236, 2.732, 3.141, 4.0, 5.236];
      const baseFreqBin = 3 + Math.floor(Math.random() * 8);
      const lowSwellK = 2 + Math.floor(Math.random() * 10);
      const lowSwellGain = 0.5 + Math.random() * 0.8;
      for (let k = 1; k <= BIN_MAX; k++) {
        const x = k / BIN_MAX;
        const r1 = Math.random(), r2 = Math.random();
        let dissonanceAmp = 0;
        for (const ratio of ratios) {
          const target = baseFreqBin * ratio;
          const dist = Math.abs(k - target);
          dissonanceAmp += 0.7 * Math.exp(-0.5 * (dist / (1.5 + target * 0.03)) ** 2);
        }
        const lowSwell = k <= lowSwellK * 3
          ? lowSwellGain * Math.exp(-0.5 * ((k - lowSwellK) / (lowSwellK * 0.6)) ** 2)
          : 0;
        const base = Math.pow(r1, 1.6) * (0.3 + 0.5 * (1 - x));
        f.amp[k] = clamp01(base + 0.6 * dissonanceAmp * (0.8 + 0.2 * r1) + lowSwell);
        f.phase[k] = r2 * TAU + (k * 0.13 % TAU);
      }
      return f;
    }
  };
})();
