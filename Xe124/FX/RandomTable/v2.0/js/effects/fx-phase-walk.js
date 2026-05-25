(function () {
  'use strict';
  const { BIN_MAX, TAU, clamp01, cloneFrame, phaseLerp, wrapPhase, hash01 } = window.WT;
  window.WT.EFFECTS = window.WT.EFFECTS || {};
  window.WT.EFFECTS['phase-walk'] = {
    label: 'Phase Walk',
    applyFrame: function (frame, strength, frameIndex, depth, seed) {
      const out = cloneFrame(frame);
      const s = clamp01(strength);
      const t = frameIndex / Math.max(1, depth - 1);
      for (let k = 1; k <= BIN_MAX; k++) {
        const x = k / BIN_MAX;
        const stepSize = s * (0.1 + 0.9 * x) * Math.PI;
        const angle = hash01(seed + k * 31.7 + frameIndex * 7.3) * TAU;
        const walk  = stepSize * Math.sqrt(t + 0.01);
        out.phase[k] = phaseLerp(out.phase[k], wrapPhase(out.phase[k] + Math.cos(angle) * walk), s * 0.65);
      }
      return out;
    }
  };
})();
