(function () {
  'use strict';
  const { BIN_MAX, TAU, clamp01, cloneFrame, lerp, phaseLerp } = window.WT;
  window.WT.EFFECTS = window.WT.EFFECTS || {};
  window.WT.EFFECTS['spectral-quantize'] = {
    label: 'Spectral Quantize',
    applyFrame: function (frame, strength) {
      const out = cloneFrame(frame);
      const s = clamp01(strength);
      const ampLevels = Math.max(4, Math.round(32 * (1 - s * 0.75)));
      const phStep    = TAU / 8;
      for (let k = 1; k <= BIN_MAX; k++) {
        const qAmp    = Math.round(out.amp[k] * ampLevels) / ampLevels;
        out.amp[k]    = lerp(out.amp[k], qAmp, s * 0.8);
        const nearestPh = Math.round(out.phase[k] / phStep) * phStep;
        out.phase[k]  = phaseLerp(out.phase[k], nearestPh, s * 0.5);
      }
      return out;
    }
  };
})();
