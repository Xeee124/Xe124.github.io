(function () {
  'use strict';
  const { clamp01, cloneFrame, smoothBins } = window.WT;
  window.WT.EFFECTS = window.WT.EFFECTS || {};
  window.WT.EFFECTS['spectral-blur'] = {
    label: 'Spectral Blur',
    applyFrame: function (frame, strength) {
      const out = cloneFrame(frame);
      const s = clamp01(strength);
      return smoothBins(out, 2 + Math.round(3 * s), 0.75 + 0.2 * s);
    }
  };
})();
