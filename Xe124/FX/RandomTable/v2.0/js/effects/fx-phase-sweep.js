(function () {
  'use strict';
  const { BIN_MAX, clamp01, cloneFrame, phaseLerp, wrapPhase } = window.WT;
  window.WT.EFFECTS = window.WT.EFFECTS || {};
  window.WT.EFFECTS['phase-sweep'] = {
    label: 'Phase Sweep',
    applyFrame: function (frame, strength, frameIndex, depth) {
      const out = cloneFrame(frame);
      const s = clamp01(strength);
      const t = frameIndex / Math.max(1, depth - 1);
      const sweepCutoff = 0.05 + 0.7 * t * s;
      for (let k = 1; k <= BIN_MAX; k++) {
        const x = k / BIN_MAX;
        const delay = -2 * Math.atan(x / Math.max(0.01, sweepCutoff));
        out.phase[k] = phaseLerp(out.phase[k], wrapPhase(out.phase[k] + delay), s * 0.7);
      }
      return out;
    }
  };
})();
