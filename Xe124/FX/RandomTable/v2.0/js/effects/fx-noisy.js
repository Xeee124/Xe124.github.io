(function () {
  'use strict';
  const { BIN_MAX, clamp01, cloneFrame, phaseLerp, hash01 } = window.WT;
  window.WT.EFFECTS = window.WT.EFFECTS || {};
  window.WT.EFFECTS['noisy'] = {
    label: 'Noisy',
    applyFrame: function (frame, strength, frameIndex, depth, seed) {
      const out = cloneFrame(frame);
      const s = clamp01(strength);
      for (let k = 1; k <= BIN_MAX; k++) {
        const pinkGain = Math.pow(1 / k, 0.5);
        const noiseAmp = pinkGain * s * 0.25 * hash01(seed + k * 2.3);
        out.amp[k] = Math.max(0, out.amp[k] * (1 - s * 0.3) + noiseAmp);
        const randPh = (hash01(seed + k * 8.7) * 2 - 1) * Math.PI;
        out.phase[k] = phaseLerp(out.phase[k], randPh, s * 0.4);
      }
      return out;
    }
  };
})();
