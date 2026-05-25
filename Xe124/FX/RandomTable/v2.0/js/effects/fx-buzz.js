(function () {
  'use strict';
  const { BIN_MAX, clamp01, cloneFrame } = window.WT;
  window.WT.EFFECTS = window.WT.EFFECTS || {};
  window.WT.EFFECTS['buzz'] = {
    label: 'Buzz',
    applyFrame: function (frame, strength) {
      const out = cloneFrame(frame);
      const s = clamp01(strength);
      for (let k = 1; k <= BIN_MAX; k++) out.amp[k] *= (k % 2 ? 1.7 + 0.6 * s : 0.25 + 0.4 * (1 - s));
      return out;
    }
  };
})();
