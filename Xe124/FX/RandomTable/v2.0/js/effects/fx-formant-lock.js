(function () {
  'use strict';
  const { BIN_MAX, clamp01, cloneFrame, lerp } = window.WT;
  window.WT.EFFECTS = window.WT.EFFECTS || {};
  window.WT.EFFECTS['formant-lock'] = {
    label: 'Formant Lock',
    applyFrame: function (frame, strength) {
      const out = cloneFrame(frame);
      const s   = clamp01(strength);
      const c = 220, w = 90;
      for (let k = 1; k <= BIN_MAX; k++) {
        const env  = 0.25 + 1.2 * Math.exp(-0.5 * Math.pow((k - c) / w, 2));
        out.amp[k] = lerp(out.amp[k], out.amp[k] * env, 0.7 * s);
      }
      return out;
    }
  };
})();
