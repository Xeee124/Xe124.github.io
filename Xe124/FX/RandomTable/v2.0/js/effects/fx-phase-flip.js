(function () {
  'use strict';
  const { BIN_MAX, clamp01, cloneFrame, phaseLerp, hash01 } = window.WT;
  window.WT.EFFECTS = window.WT.EFFECTS || {};
  window.WT.EFFECTS['phase-flip'] = {
    label: 'Phase Flip',
    applyFrame: function (frame, strength, frameIndex, depth, seed) {
      const out = cloneFrame(frame);
      const s = clamp01(strength);
      for (let k = 1; k <= BIN_MAX; k++) {
        if (hash01(seed + k * 7.3 + frameIndex * 1.4) > 0.5) {
          const target = out.phase[k] > 0 ? out.phase[k] - Math.PI : out.phase[k] + Math.PI;
          out.phase[k] = phaseLerp(out.phase[k], target, s * 0.7);
        }
      }
      return out;
    }
  };
})();
