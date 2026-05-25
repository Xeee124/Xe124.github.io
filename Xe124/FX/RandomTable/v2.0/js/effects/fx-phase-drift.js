(function () {
  'use strict';
  const { BIN_MAX, TAU, clamp01, cloneFrame } = window.WT;
  window.WT.EFFECTS = window.WT.EFFECTS || {};
  window.WT.EFFECTS['phase-drift'] = {
    label: 'Phase Drift',
    applyFrame: function (frame, strength, frameIndex, depth) {
      const out   = cloneFrame(frame);
      const s     = clamp01(strength);
      const drift = (frameIndex / Math.max(1, depth - 1)) * TAU * 0.45 * s;
      for (let k = 1; k <= BIN_MAX; k++) {
        out.phase[k] += drift + Math.sin(k * 0.005 + frameIndex * 0.03) * 0.08 * s;
      }
      return out;
    }
  };
})();
