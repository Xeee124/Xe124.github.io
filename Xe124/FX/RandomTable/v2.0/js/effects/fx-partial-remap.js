(function () {
  'use strict';
  const { BIN_MAX, clamp01, cloneFrame, resampleSpectrum } = window.WT;
  window.WT.EFFECTS = window.WT.EFFECTS || {};
  window.WT.EFFECTS['partial-remap'] = {
    label: 'Partial Remap',
    applyFrame: function (frame, strength) {
      const out   = cloneFrame(frame);
      const s     = clamp01(strength);
      const power = 0.75 + 1.1 * s;
      return resampleSpectrum(out, function (k) { return 1 + Math.pow((k - 1) / BIN_MAX, power) * (BIN_MAX - 1); });
    }
  };
})();
