(function () {
  'use strict';
  const { BIN_MAX, clamp01, cloneFrame, smoothBins } = window.WT;
  window.WT.EFFECTS = window.WT.EFFECTS || {};
  window.WT.EFFECTS['warm'] = {
    label: 'Warm',
    applyFrame: function (frame, strength) {
      const out = cloneFrame(frame);
      const s = clamp01(strength);
      for (let k = 1; k <= BIN_MAX; k++) out.amp[k] *= Math.pow(1 - k / BIN_MAX, 0.4 + 1.5 * s);
      return smoothBins(out, 3, 0.6 * s);
    }
  };
})();
