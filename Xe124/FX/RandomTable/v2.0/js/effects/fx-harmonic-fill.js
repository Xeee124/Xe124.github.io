(function () {
  'use strict';
  const { BIN_MAX, clamp01, cloneFrame, lerp, smoothBins } = window.WT;
  window.WT.EFFECTS = window.WT.EFFECTS || {};
  window.WT.EFFECTS['harmonic-fill'] = {
    label: 'Harmonic Fill',
    applyFrame: function (frame, strength) {
      const out  = cloneFrame(frame);
      const s    = clamp01(strength);
      const blur = smoothBins(out, 5, 1);
      for (let k = 1; k <= BIN_MAX; k++) out.amp[k] = lerp(out.amp[k], blur.amp[k], 0.55 * s) + 0.04 * s;
      return out;
    }
  };
})();
