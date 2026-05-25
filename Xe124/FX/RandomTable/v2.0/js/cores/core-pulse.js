(function () {
  'use strict';
  const { BIN_MAX, TAU, blankFrame, clamp01 } = window.WT;

  window.WT.CORES = window.WT.CORES || {};
  window.WT.CORES['pulse'] = {
    label: 'Pulse（短周期パルス列系）',
    fn: function corePulse(pos) {
      const f = blankFrame();
      const pulseWidth = 0.05 + Math.random() * 0.25;
      const jitter = Math.random() * 0.3;
      const detune = 0.98 + Math.random() * 0.04;
      for (let k = 1; k <= BIN_MAX; k++) {
        const x = k / BIN_MAX;
        const r1 = Math.random(), r2 = Math.random();
        const squareAmp = (k % 2 === 1) ? 1.0 / (k * detune) : 0.0;
        const sinc = Math.abs(Math.sin(Math.PI * k * pulseWidth) / (Math.PI * k * pulseWidth + 1e-9));
        const pulseAmp = sinc * (1 - x * 0.6);
        const jitterMod = 1 - jitter * r1;
        f.amp[k] = clamp01((squareAmp * 0.5 + pulseAmp * 0.5) * jitterMod);
        f.phase[k] = r2 * TAU * jitter + (k % 2 === 0 ? 0 : Math.PI * 0.5);
      }
      return f;
    }
  };
})();
