(function () {
  'use strict';
  const { BIN_MAX, clamp01, cloneFrame, lerp, phaseLerp, wrapPhase } = window.WT;
  window.WT.EFFECTS = window.WT.EFFECTS || {};
  window.WT.EFFECTS['spectral-fold'] = {
    label: 'Spectral Fold',
    applyFrame: function (frame, strength) {
      const out = cloneFrame(frame);
      const s = clamp01(strength);
      const foldPoint = Math.round(BIN_MAX * (0.2 + 0.6 * (1 - s)));
      const copy = cloneFrame(out);
      for (let k = 1; k <= BIN_MAX; k++) {
        if (k > foldPoint) {
          const mirror = 2 * foldPoint - k;
          if (mirror >= 1) {
            out.amp[mirror]   = lerp(copy.amp[mirror], clamp01(copy.amp[mirror] + copy.amp[k] * 0.7), s * 0.8);
            out.amp[k]        = lerp(copy.amp[k], copy.amp[k] * 0.2, s * 0.7);
            out.phase[mirror] = phaseLerp(copy.phase[mirror], wrapPhase(-copy.phase[k] + Math.PI), s * 0.5);
          }
        }
      }
      return out;
    }
  };
})();
