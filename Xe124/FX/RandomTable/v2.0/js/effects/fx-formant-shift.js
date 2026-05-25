(function () {
  'use strict';
  const { BIN_MAX, clamp01, cloneFrame, hash01 } = window.WT;
  window.WT.EFFECTS = window.WT.EFFECTS || {};
  window.WT.EFFECTS['formant-shift'] = {
    label: 'Formant Shift',
    applyFrame: function (frame, strength, frameIndex, depth, seed) {
      const out   = cloneFrame(frame);
      const s     = clamp01(strength);
      const shift = (hash01(seed + 77.7) - 0.5) * 160 * s;
      const c     = 180 + shift;
      const w     = 80 + 120 * s;
      for (let k = 1; k <= BIN_MAX; k++) {
        const env  = 0.2 + 1.6 * Math.exp(-0.5 * Math.pow((k - c) / w, 2));
        out.amp[k] *= env;
      }
      return out;
    }
  };
})();
