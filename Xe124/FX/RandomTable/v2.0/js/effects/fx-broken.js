(function () {
  'use strict';
  const { BIN_MAX, clamp01, cloneFrame, lerp, phaseLerp, hash01 } = window.WT;
  window.WT.EFFECTS = window.WT.EFFECTS || {};
  window.WT.EFFECTS['broken'] = {
    label: 'Broken',
    applyFrame: function (frame, strength, frameIndex, depth, seed) {
      const out = cloneFrame(frame);
      const s = clamp01(strength);
      for (let k = 1; k <= BIN_MAX; k++) {
        const gate = hash01(seed + k * 19.1 + frameIndex * 0.7) > 0.62 - 0.25 * s;
        out.amp[k] *= gate ? 1.0 : lerp(1.0, 0.02, s);
        if (!gate) out.phase[k] = phaseLerp(out.phase[k], (hash01(seed + k * 8.3) > 0.5 ? 0 : Math.PI), s * 0.8);
      }
      return out;
    }
  };
})();
