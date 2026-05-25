(function () {
  'use strict';
  const { BIN_MAX, clamp01, cloneFrame, phaseLerp, hash01 } = window.WT;
  window.WT.EFFECTS = window.WT.EFFECTS || {};
  window.WT.EFFECTS['glass'] = {
    label: 'Glass',
    applyFrame: function (frame, strength, frameIndex, depth, seed) {
      const out = cloneFrame(frame);
      const s = clamp01(strength);
      for (let k = 1; k <= BIN_MAX; k++) {
        out.amp[k]   *= Math.pow(k / BIN_MAX, 0.9 - 0.5 * s) * (0.7 + 0.3 * Math.sin(k * 0.09));
        out.phase[k]  = phaseLerp(out.phase[k], k % 3 === 0 ? 0 : out.phase[k], s * 0.4) + (hash01(seed + k * 9.9) - 0.5) * 0.2 * s;
      }
      return out;
    }
  };
})();
