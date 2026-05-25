(function () {
  'use strict';
  const { BIN_MAX, TAU, clamp01, cloneFrame, phaseLerp, wrapPhase } = window.WT;
  window.WT.EFFECTS = window.WT.EFFECTS || {};
  window.WT.EFFECTS['phase-rotate'] = {
    label: 'Phase Rotate',
    applyFrame: function (frame, strength, frameIndex, depth) {
      const out  = cloneFrame(frame);
      const s    = clamp01(strength);
      const t    = frameIndex / Math.max(1, depth - 1);
      const base = s * TAU * 0.5;
      for (let k = 1; k <= BIN_MAX; k++) {
        const rotK   = base * t * Math.pow(k / BIN_MAX, 0.5);
        out.phase[k] = phaseLerp(out.phase[k], wrapPhase(out.phase[k] + rotK), 0.7);
      }
      return out;
    }
  };
})();
