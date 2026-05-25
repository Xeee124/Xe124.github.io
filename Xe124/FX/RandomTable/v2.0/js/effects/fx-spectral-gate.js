(function () {
  'use strict';
  const { BIN_MAX, clamp01, cloneFrame, lerp } = window.WT;
  window.WT.EFFECTS = window.WT.EFFECTS || {};
  window.WT.EFFECTS['spectral-gate'] = {
    label: 'Spectral Gate（振幅閾値以下の倍音を抑制）',
    applyFrame: function (frame, strength) {
      const out = cloneFrame(frame);
      const s   = clamp01(strength);
      let maxAmp = 0;
      for (let k = 1; k <= BIN_MAX; k++) if (out.amp[k] > maxAmp) maxAmp = out.amp[k];
      const threshold = maxAmp * (0.05 + 0.35 * s);
      for (let k = 1; k <= BIN_MAX; k++) {
        if (out.amp[k] < threshold) {
          const ratio    = out.amp[k] / threshold;
          const suppress = ratio * ratio;
          out.amp[k]     = lerp(out.amp[k], out.amp[k] * suppress, s * 0.85);
        }
      }
      return out;
    }
  };
})();
