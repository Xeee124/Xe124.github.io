(function () {
  'use strict';
  const { BIN_MAX, TAU, clamp01, cloneFrame, lerp, seededRand } = window.WT;
  window.WT.EFFECTS = window.WT.EFFECTS || {};
  window.WT.EFFECTS['comb-mask'] = {
    label: 'Comb Mask',
    applyFrame: function (frame, strength, frameIndex, depth, seed) {
      const out = cloneFrame(frame);
      const s = clamp01(strength);
      const t = frameIndex / Math.max(1, depth - 1);
      const baseTeeth = 3 + Math.floor(seededRand(seed) * 10);
      const teethMod  = 1 + s * 0.4 * Math.sin(t * TAU + seededRand(seed + 1) * TAU);
      const teeth     = baseTeeth * teethMod;
      const resonance = 0.3 + s * 0.6;
      for (let k = 1; k <= BIN_MAX; k++) {
        const x    = k / BIN_MAX;
        const comb = 0.5 + 0.5 * Math.cos(x * TAU * teeth);
        const gain = lerp(1.0, comb * 0.5 + 0.5, resonance);
        out.amp[k] = lerp(out.amp[k], out.amp[k] * Math.max(0.05, gain), s * 0.8);
      }
      return out;
    }
  };
})();
