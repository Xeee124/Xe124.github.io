(function () {
  'use strict';
  const { BIN_MAX, clamp01, cloneFrame, smoothBins } = window.WT;
  window.WT.EFFECTS = window.WT.EFFECTS || {};
  window.WT.EFFECTS['liquid'] = {
    label: 'Liquid',
    applyFrame: function (frame, strength, frameIndex, depth, seed) {
      const out = cloneFrame(frame);
      const s = clamp01(strength);
      for (let k = 1; k <= BIN_MAX; k++) {
        out.amp[k]   *= 0.82 + 0.22 * Math.sin(k * 0.014 + frameIndex * 0.06 + seed * 0.01);
        out.phase[k] += Math.sin(k * 0.018 + frameIndex * 0.08) * 0.7 * s;
      }
      return smoothBins(out, 2, 0.45 * s);
    }
  };
})();
