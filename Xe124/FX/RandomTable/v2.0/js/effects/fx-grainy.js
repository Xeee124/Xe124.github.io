(function () {
  'use strict';
  const { BIN_MAX, clamp01, cloneFrame, lerp, phaseLerp, hash01 } = window.WT;
  window.WT.EFFECTS = window.WT.EFFECTS || {};
  window.WT.EFFECTS['grainy'] = {
    label: 'Grainy',
    applyFrame: function (frame, strength, frameIndex, depth, seed) {
      const out = cloneFrame(frame);
      const s = clamp01(strength);
      const q = Math.max(4, Math.round(32 * (1 - s * 0.85)));
      for (let k = 1; k <= BIN_MAX; k++) {
        const quantized = Math.round(out.amp[k] * q) / q;
        const quantErr  = Math.abs(out.amp[k] - quantized);
        out.amp[k]   = lerp(out.amp[k], quantized, s * 0.85);
        const phRand = (hash01(seed + k * 14.7) * 2 - 1) * Math.PI;
        out.phase[k] = phaseLerp(out.phase[k], phRand, quantErr * s * 2.5);
      }
      return out;
    }
  };
})();
