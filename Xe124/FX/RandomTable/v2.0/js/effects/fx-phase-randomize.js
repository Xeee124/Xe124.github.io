(function () {
  'use strict';
  const { BIN_MAX, TAU, clamp01, cloneFrame, phaseLerp, hash01 } = window.WT;
  window.WT.EFFECTS = window.WT.EFFECTS || {};
  window.WT.EFFECTS['phase-randomize'] = {
    label: 'Phase Randomize',
    applyFrame: function (frame, strength, frameIndex, depth, seed) {
      const out = cloneFrame(frame);
      const s   = clamp01(strength);
      for (let k = 1; k <= BIN_MAX; k++) {
        const randPh = TAU * hash01(seed + k * 21.7 + frameIndex * 0.9) - Math.PI;
        out.phase[k] = phaseLerp(out.phase[k], randPh, s * 0.75);
      }
      return out;
    }
  };
})();
