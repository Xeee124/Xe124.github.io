(function () {
  'use strict';
  const { BIN_MAX, clamp01, cloneFrame, resampleSpectrum } = window.WT;
  window.WT.EFFECTS = window.WT.EFFECTS || {};
  window.WT.EFFECTS['spectral-warp'] = {
    label: 'Spectral Warp',
    applyFrame: function (frame, strength) {
      const out = cloneFrame(frame);
      const s = clamp01(strength);
      const power = 0.45 + 1.7 * s;
      return resampleSpectrum(out, function (k) { return 1 + Math.pow((k - 1) / BIN_MAX, power) * (BIN_MAX - 1); });
    }
  };
})();
