(function () {
  'use strict';
  const { BIN_MAX, clamp01, cloneFrame, hash01 } = window.WT;
  window.WT.EFFECTS = window.WT.EFFECTS || {};
  window.WT.EFFECTS['formant'] = {
    label: 'Formant',
    applyFrame: function (frame, strength, frameIndex, depth, seed) {
      const out = cloneFrame(frame);
      const c1 = 70  + hash01(seed + 1.1) * 350;
      const c2 = 220 + hash01(seed + 2.2) * 1100;
      const w1 = 22  + hash01(seed + 3.3) * 70;
      const w2 = 35  + hash01(seed + 4.4) * 120;
      for (let k = 1; k <= BIN_MAX; k++) {
        const d1 = (k - c1) / w1, d2 = (k - c2) / w2;
        const env = 0.08 + 1.6 * Math.exp(-0.5 * d1 * d1) + 1.0 * Math.exp(-0.5 * d2 * d2);
        out.amp[k] *= env;
      }
      return out;
    }
  };
})();
