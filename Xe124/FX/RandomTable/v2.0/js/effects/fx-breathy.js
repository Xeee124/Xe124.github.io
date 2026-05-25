(function () {
  'use strict';
  const { BIN_MAX, clamp01, cloneFrame, hash01 } = window.WT;
  window.WT.EFFECTS = window.WT.EFFECTS || {};
  window.WT.EFFECTS['breathy'] = {
    label: 'Breathy',
    applyFrame: function (frame, strength, frameIndex, depth, seed) {
      const out = cloneFrame(frame);
      const s = clamp01(strength);
      for (let k = 1; k <= BIN_MAX; k++) {
        out.amp[k]   = out.amp[k] * (0.55 + 0.45 * Math.pow(1 - k / BIN_MAX, 1.1)) + 0.03 * s * hash01(seed + k * 11.1);
        out.phase[k] += (hash01(seed + k * 3.3) - 0.5) * 0.8 * s;
      }
      return out;
    }
  };
})();
