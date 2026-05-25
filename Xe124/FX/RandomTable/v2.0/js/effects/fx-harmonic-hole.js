(function () {
  'use strict';
  const { BIN_MAX, clamp01, cloneFrame, lerp } = window.WT;
  window.WT.EFFECTS = window.WT.EFFECTS || {};
  window.WT.EFFECTS['harmonic-hole'] = {
    label: 'Harmonic Hole',
    applyFrame: function (frame, strength) {
      const out = cloneFrame(frame);
      const s   = clamp01(strength);
      for (let k = 1; k <= BIN_MAX; k++) {
        if ((k % (4 + Math.round(10 * s))) < 2) out.amp[k] *= lerp(1.0, 0.08, s);
      }
      return out;
    }
  };
})();
