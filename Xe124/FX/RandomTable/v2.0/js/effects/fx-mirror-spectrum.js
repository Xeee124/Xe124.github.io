(function () {
  'use strict';
  const { BIN_MAX, clamp01, cloneFrame, lerp, phaseLerp, wrapPhase } = window.WT;
  window.WT.EFFECTS = window.WT.EFFECTS || {};
  window.WT.EFFECTS['mirror-spectrum'] = {
    label: 'Mirror Spectrum',
    applyFrame: function (frame, strength) {
      const out  = cloneFrame(frame);
      const s    = clamp01(strength);
      const copy = cloneFrame(out);
      for (let k = 1; k <= BIN_MAX; k++) {
        const m        = BIN_MAX + 1 - k;
        const blendAmp = lerp(copy.amp[k], copy.amp[m], 0.5);
        const maxAmp   = Math.max(copy.amp[k], copy.amp[m]);
        out.amp[k]     = lerp(copy.amp[k], lerp(blendAmp, maxAmp, 0.4), s * 0.85);
        out.phase[k]   = phaseLerp(copy.phase[k], wrapPhase(-copy.phase[m]), s * 0.6);
      }
      return out;
    }
  };
})();
