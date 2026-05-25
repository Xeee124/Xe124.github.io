(function () {
  'use strict';
  const { BIN_MAX, clamp01, cloneFrame, lerp, phaseLerp, smoothBins } = window.WT;
  window.WT.EFFECTS = window.WT.EFFECTS || {};
  window.WT.EFFECTS['dense'] = {
    label: 'Dense',
    applyFrame: function (frame, strength) {
      const out = cloneFrame(frame);
      const s = clamp01(strength);
      const blur = smoothBins(out, 4, 1.0);
      for (let k = 1; k <= BIN_MAX; k++) {
        const floor = blur.amp[k] * (0.3 + 0.4 * s);
        out.amp[k] = Math.max(out.amp[k], lerp(out.amp[k], floor, s * 0.8));
        out.phase[k] = phaseLerp(out.phase[k], blur.phase[k], s * 0.25);
      }
      return out;
    }
  };
})();
