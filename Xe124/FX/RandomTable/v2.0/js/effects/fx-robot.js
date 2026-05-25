(function () {
  'use strict';
  const { BIN_MAX, clamp01, cloneFrame, phaseLerp } = window.WT;
  window.WT.EFFECTS = window.WT.EFFECTS || {};
  window.WT.EFFECTS['robot'] = {
    label: 'Robot',
    applyFrame: function (frame, strength) {
      const out = cloneFrame(frame);
      const s = clamp01(strength);
      for (let k = 1; k <= BIN_MAX; k++) {
        out.amp[k]   *= 0.65 + 0.35 * Math.sin(k * 0.09);
        out.phase[k]  = phaseLerp(out.phase[k], (k % 4 === 0 ? 0 : Math.PI), s * 0.6);
      }
      return out;
    }
  };
})();
