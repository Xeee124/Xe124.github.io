(function () {
  'use strict';
  const { BIN_MAX, clamp01, cloneFrame, lerp, phaseLerp } = window.WT;
  window.WT.EFFECTS = window.WT.EFFECTS || {};
  window.WT.EFFECTS['spectral-expand'] = {
    label: 'Spectral Expand（スペクトル包絡を引き伸ばす）',
    applyFrame: function (frame, strength) {
      const out        = cloneFrame(frame);
      const s          = clamp01(strength);
      const expandRate = 1.0 + s * 0.8;
      const copy       = cloneFrame(out);
      for (let k = 1; k <= BIN_MAX; k++) {
        const srcK = (k - 1) / expandRate + 1;
        const si   = Math.floor(srcK);
        const frac = srcK - si;
        if (si >= 1 && si < BIN_MAX) {
          const targetAmp = lerp(copy.amp[si], copy.amp[Math.min(si + 1, BIN_MAX)], frac);
          const targetPh  = phaseLerp(copy.phase[si], copy.phase[Math.min(si + 1, BIN_MAX)], frac);
          out.amp[k]   = lerp(copy.amp[k], targetAmp, s * 0.75);
          out.phase[k] = phaseLerp(copy.phase[k], targetPh, s * 0.6);
        }
      }
      return out;
    }
  };
})();
