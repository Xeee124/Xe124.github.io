(function () {
  'use strict';
  const { BIN_MAX, clamp01, cloneFrame, lerp, phaseLerp, seededRand } = window.WT;
  function factorial(n) { return n <= 1 ? 1 : n * factorial(n - 1); }
  window.WT.EFFECTS = window.WT.EFFECTS || {};
  window.WT.EFFECTS['fm'] = {
    label: 'FM-ish',
    applyFrame: function (frame, strength, frameIndex, depth, seed) {
      const out = cloneFrame(frame);
      const s = clamp01(strength);
      const modRatio = 2 + Math.round(seededRand(seed) * 5);
      const beta = 0.5 + s * 3.5;
      for (let k = 1; k <= BIN_MAX; k++) {
        let fmEnv = 0;
        for (let n = -4; n <= 4; n++) {
          const sb = k - n * modRatio;
          if (sb >= 1 && sb <= BIN_MAX) {
            const jn = Math.exp(-beta) * Math.pow(beta / 2, Math.abs(n)) / Math.max(1, factorial(Math.abs(n)));
            fmEnv += jn;
          }
        }
        fmEnv = Math.min(2.0, fmEnv * 4);
        out.amp[k] = lerp(out.amp[k], out.amp[k] * (0.5 + 0.5 * fmEnv), s * 0.75);
        const sidebandN = Math.round((k - 1) / Math.max(1, modRatio));
        const phTarget = sidebandN % 2 === 0 ? 0 : Math.PI;
        out.phase[k] = phaseLerp(out.phase[k], phTarget, s * 0.3);
      }
      return out;
    }
  };
})();
