(function () {
  'use strict';
  const { BIN_MAX, clamp01, cloneFrame, clamp, resampleSpectrum, hash01 } = window.WT;
  window.WT.EFFECTS = window.WT.EFFECTS || {};
  window.WT.EFFECTS['spectral-scatter'] = {
    label: 'Spectral Scatter',
    applyFrame: function (frame, strength, frameIndex, depth, seed) {
      const out = cloneFrame(frame);
      const s = clamp01(strength);
      return resampleSpectrum(
        out,
        function (k) { return clamp(k + (hash01(seed + k * 6.6) - 0.5) * (20 + 120 * s), 1, BIN_MAX); },
        function (amp) { return amp * (0.75 + 0.5 * hash01(seed + amp * 1000)); },
        function (ph)  { return ph  + (hash01(seed + ph * 10) - 0.5) * 0.6 * s; }
      );
    }
  };
})();
