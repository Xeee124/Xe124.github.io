(function () {
  'use strict';
  const { BIN_MAX, TAU, clamp01, lerp, cloneFrame, phaseLerp, seededRand } = window.WT;
  window.WT.EFFECTS = window.WT.EFFECTS || {};
  window.WT.EFFECTS['comb-drift'] = {
    label: 'Comb Drift（コム＋位相スウィープ同期）',
    applyFrame: function (frame, strength, frameIndex, depth, seed) {
      const out        = cloneFrame(frame);
      const s          = clamp01(strength);
      const combTeeth  = 4 + Math.floor(seededRand(seed)     * 8);
      const driftSpeed = 0.3 + seededRand(seed + 1) * 0.7;
      const t          = frameIndex / Math.max(1, depth - 1);
      const combOffset = (t * driftSpeed) % 1.0;
      for (let k = 1; k <= BIN_MAX; k++) {
        const x       = (k / BIN_MAX + combOffset) % 1.0;
        const comb    = 0.5 + 0.5 * Math.cos(x * TAU * combTeeth);
        out.amp[k]    = clamp01(out.amp[k] * lerp(1.0, comb, s));
        const phShift = comb * s * Math.PI * 0.5 * Math.sin(t * TAU);
        out.phase[k]  = phaseLerp(out.phase[k], out.phase[k] + phShift, 1);
      }
      return out;
    }
  };

})();
