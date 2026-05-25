(function () {
  'use strict';
  const { BIN_MAX, clamp01, cloneFrame, lerp, seededRand } = window.WT;
  window.WT.EFFECTS = window.WT.EFFECTS || {};
  window.WT.EFFECTS['magnitude-tilt'] = {
    label: 'Magnitude Tilt',
    applyFrame: function (frame, strength, frameIndex, depth, seed) {
      const out      = cloneFrame(frame);
      const s        = clamp01(strength);
      const shelfFreq = 0.1 + seededRand(seed) * 0.4;
      const shelfBin  = Math.max(1, Math.round(shelfFreq * BIN_MAX));
      const lowGain   = s < 0.5 ? 1.0 + (0.5 - s) * 0.4 : 1.0;
      const highGain  = s > 0.5 ? 1.0 + (s - 0.5) * 1.2 : lerp(1.0, 0.15, (0.5 - s) * 2);
      for (let k = 1; k <= BIN_MAX; k++) {
        const x     = (k - shelfBin) / (BIN_MAX * 0.1);
        const shelf = 1 / (1 + Math.exp(-x));
        const gain  = lerp(lowGain, highGain, shelf);
        out.amp[k]  = lerp(out.amp[k], out.amp[k] * gain, Math.abs(s - 0.5) * 2 * 0.85);
      }
      return out;
    }
  };
})();
