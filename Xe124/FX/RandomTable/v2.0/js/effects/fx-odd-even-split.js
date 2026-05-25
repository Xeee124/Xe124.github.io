(function () {
  'use strict';
  const { BIN_MAX, clamp01, cloneFrame } = window.WT;
  window.WT.EFFECTS = window.WT.EFFECTS || {};
  window.WT.EFFECTS['odd-even-split'] = {
    label: 'Odd/Even Split',
    applyFrame: function (frame, strength) {
      const out = cloneFrame(frame);
      const s   = clamp01(strength);
      for (let k = 1; k <= BIN_MAX; k++) {
        if (k % 2) out.amp[k] *= 1.25 + 0.6 * s;
        else        out.amp[k] *= 0.45 + 0.35 * (1 - s);
      }
      return out;
    }
  };
})();
