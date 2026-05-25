(function () {
  'use strict';
  const { BIN_MAX, clamp01, cloneFrame } = window.WT;
  window.WT.EFFECTS = window.WT.EFFECTS || {};
  window.WT.EFFECTS['harmonic-cut'] = {
    label: 'Harmonic Cut',
    applyFrame: function (frame, strength) {
      const out = cloneFrame(frame);
      const s   = clamp01(strength);
      for (let k = 1; k <= BIN_MAX; k++) out.amp[k] *= 0.35 + 0.65 * Math.pow(1 - k / BIN_MAX, 1.2 + s);
      return out;
    }
  };
})();
