(function () {
  'use strict';
  const { BIN_MAX, clamp01, cloneFrame, lerp, seededRand } = window.WT;
  window.WT.EFFECTS = window.WT.EFFECTS || {};
  window.WT.EFFECTS['hollow'] = {
    label: 'Hollow',
    applyFrame: function (frame, strength, frameIndex, depth, seed) {
      const out = cloneFrame(frame);
      const s = clamp01(strength);
      const n1 = 80  + seededRand(seed)     * 200;
      const n2 = 280 + seededRand(seed + 1) * 300;
      const w1 = 30  + s * 100;
      const w2 = 50  + s * 120;
      for (let k = 1; k <= BIN_MAX; k++) {
        const notch1 = 1 - Math.exp(-0.5 * ((k - n1) / w1) ** 2) * s;
        const notch2 = 1 - Math.exp(-0.5 * ((k - n2) / w2) ** 2) * s * 0.75;
        out.amp[k] = lerp(out.amp[k], out.amp[k] * notch1 * notch2, s * 0.85);
      }
      return out;
    }
  };
})();
