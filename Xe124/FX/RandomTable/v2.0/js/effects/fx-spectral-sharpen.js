(function () {
  'use strict';
  const { BIN_MAX, clamp01, cloneFrame, smoothBins } = window.WT;
  window.WT.EFFECTS = window.WT.EFFECTS || {};
  window.WT.EFFECTS['spectral-sharpen'] = {
    label: 'Spectral Sharpen',
    applyFrame: function (frame, strength) {
      const out = cloneFrame(frame);
      const s = clamp01(strength);
      const blur = smoothBins(out, 3, 1);
      for (let k = 1; k <= BIN_MAX; k++) out.amp[k] = Math.max(0, out.amp[k] + (out.amp[k] - blur.amp[k]) * (0.8 * s));
      return out;
    }
  };
})();
