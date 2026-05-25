(function () {
  'use strict';
  const { BIN_MAX, clamp01, cloneFrame, lerp, seededRand } = window.WT;
  window.WT.EFFECTS = window.WT.EFFECTS || {};
  window.WT.EFFECTS['band-split'] = {
    label: 'Band Split',
    applyFrame: function (frame, strength, frameIndex, depth, seed) {
      const out      = cloneFrame(frame);
      const s        = clamp01(strength);
      const lowGain  = 0.3 + seededRand(seed)     * 1.5;
      const midGain  = 0.2 + seededRand(seed + 1) * 1.3;
      const highGain = 0.1 + seededRand(seed + 2) * 1.4;
      const cut1     = 0.15 + seededRand(seed + 3) * 0.15;
      const cut2     = 0.45 + seededRand(seed + 4) * 0.25;
      for (let k = 1; k <= BIN_MAX; k++) {
        const x = k / BIN_MAX;
        const targetGain = x < cut1 ? lowGain : x < cut2 ? midGain : highGain;
        out.amp[k] = lerp(out.amp[k], out.amp[k] * targetGain, s * 0.75);
      }
      return out;
    }
  };
})();
