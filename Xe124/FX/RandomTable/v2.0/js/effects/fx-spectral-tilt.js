(function () {
  'use strict';
  const { BIN_MAX, clamp01, cloneFrame, lerp } = window.WT;
  window.WT.EFFECTS = window.WT.EFFECTS || {};
  window.WT.EFFECTS['spectral-tilt'] = {
    label: 'Spectral Tilt（スペクトル傾きの調整）',
    applyFrame: function (frame, strength) {
      const out        = cloneFrame(frame);
      const s          = clamp01(strength);
      const tiltCurve  = s * 2 - 1;
      const tiltPower  = Math.abs(tiltCurve) * 2.5;
      for (let k = 1; k <= BIN_MAX; k++) {
        const x    = k / BIN_MAX;
        const tiltGain = tiltCurve >= 0
          ? 0.3 + 0.7 * Math.pow(x, tiltPower)
          : 0.3 + 0.7 * Math.pow(1 - x, tiltPower);
        out.amp[k] = lerp(out.amp[k], out.amp[k] * tiltGain, Math.abs(tiltCurve) * 0.8);
      }
      return out;
    }
  };
})();
