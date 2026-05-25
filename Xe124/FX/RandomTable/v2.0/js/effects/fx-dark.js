(function () {
  'use strict';
  const { BIN_MAX, clamp01, cloneFrame, smoothBins } = window.WT;
  window.WT.EFFECTS = window.WT.EFFECTS || {};
  window.WT.EFFECTS['dark'] = {
    label: 'Dark',
    applyFrame: function (frame, strength) {
      const out = cloneFrame(frame);
      const s = clamp01(strength);
      for (let k = 1; k <= BIN_MAX; k++) out.amp[k] *= Math.pow(1 - k / BIN_MAX, 1.6 + 1.8 * s);
      return smoothBins(out, 4, 0.4);
    }
  };
})();
