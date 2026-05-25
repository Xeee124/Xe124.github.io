(function () {
  'use strict';
  const { BIN_MAX, TAU, clamp01, cloneFrame } = window.WT;
  window.WT.EFFECTS = window.WT.EFFECTS || {};
  window.WT.EFFECTS['phase-spread'] = {
    label: 'Phase Spread',
    applyFrame: function (frame, strength) {
      const out = cloneFrame(frame);
      const s   = clamp01(strength);
      for (let k = 1; k <= BIN_MAX; k++) out.phase[k] += (k / BIN_MAX) * TAU * 0.35 * s;
      return out;
    }
  };
})();
