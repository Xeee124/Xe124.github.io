(function () {
  'use strict';
  const { BIN_MAX, clamp01, cloneFrame } = window.WT;
  window.WT.EFFECTS = window.WT.EFFECTS || {};
  window.WT.EFFECTS['harmonic-boost'] = {
    label: 'Harmonic Boost',
    applyFrame: function (frame, strength) {
      const out = cloneFrame(frame);
      const s   = clamp01(strength);
      for (let k = 1; k <= BIN_MAX; k++) out.amp[k] *= 0.9 + 0.8 * s * Math.pow(1 - k / BIN_MAX, 0.45);
      return out;
    }
  };
})();
