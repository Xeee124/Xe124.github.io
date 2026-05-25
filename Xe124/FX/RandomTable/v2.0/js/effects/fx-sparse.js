(function () {
  'use strict';
  const { BIN_MAX, clamp01, cloneFrame, lerp, hash01 } = window.WT;
  window.WT.EFFECTS = window.WT.EFFECTS || {};
  window.WT.EFFECTS['sparse'] = {
    label: 'Sparse',
    applyFrame: function (frame, strength, frameIndex, depth, seed) {
      const out = cloneFrame(frame);
      const s = clamp01(strength);
      for (let k = 1; k <= BIN_MAX; k++) {
        const keep = hash01(seed + k * 17.1 + frameIndex * 3.7) > 0.82 - 0.35 * s;
        out.amp[k] *= keep ? 1.0 : lerp(1.0, 0.05, s);
      }
      return out;
    }
  };
})();
