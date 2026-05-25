(function () {
  'use strict';
  const { BIN_MAX, clamp01, cloneFrame } = window.WT;
  window.WT.EFFECTS = window.WT.EFFECTS || {};
  window.WT.EFFECTS['bright'] = {
    label: 'Bright',
    applyFrame: function (frame, strength) {
      const out = cloneFrame(frame);
      const s = clamp01(strength);
      for (let k = 1; k <= BIN_MAX; k++) out.amp[k] *= Math.pow(k / BIN_MAX, 0.2 + 0.8 * s);
      return out;
    }
  };
})();
