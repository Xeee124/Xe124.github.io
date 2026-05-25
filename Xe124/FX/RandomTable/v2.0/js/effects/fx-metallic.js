(function () {
  'use strict';
  const { BIN_MAX, clamp01, cloneFrame, phaseLerp, hash01 } = window.WT;
  window.WT.EFFECTS = window.WT.EFFECTS || {};
  window.WT.EFFECTS['metallic'] = {
    label: 'Metallic',
    applyFrame: function (frame, strength, frameIndex, depth, seed) {
      const out = cloneFrame(frame);
      const s = clamp01(strength);
      for (let k = 1; k <= BIN_MAX; k++) {
        out.amp[k] *= (k % 2 ? 1.2 + 0.8 * s : 0.35 + 0.4 * (1 - s));
        out.phase[k] = phaseLerp(out.phase[k], (k % 2 ? 0 : Math.PI) + (hash01(seed + k * 7.7) - 0.5) * 0.3, s * 0.7);
      }
      return out;
    }
  };
})();
