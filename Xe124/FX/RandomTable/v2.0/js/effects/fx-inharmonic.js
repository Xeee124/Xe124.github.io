(function () {
  'use strict';
  const { BIN_MAX, clamp01, cloneFrame, resampleSpectrum, hash01 } = window.WT;
  window.WT.EFFECTS = window.WT.EFFECTS || {};
  window.WT.EFFECTS['inharmonic'] = {
    label: 'Inharmonic',
    applyFrame: function (frame, strength, frameIndex, depth, seed) {
      const out = cloneFrame(frame);
      const s = clamp01(strength);
      const kShift = 1 + s * 0.6;
      return resampleSpectrum(
        out,
        k => 1 + Math.pow((k - 1) / BIN_MAX, 1.08 + 0.65 * s) * (BIN_MAX - 1),
        amp => amp,
        ph => ph + (hash01(seed + kShift) - 0.5) * 0.2 * s
      );
    }
  };
})();
