(function () {
  'use strict';
  const { BIN_MAX, clamp01, cloneFrame, phaseLerp } = window.WT;
  window.WT.EFFECTS = window.WT.EFFECTS || {};
  window.WT.EFFECTS['phase-align'] = {
    label: 'Phase Align',
    applyFrame: function (frame, strength) {
      const out = cloneFrame(frame);
      const s   = clamp01(strength);
      const ref = out.phase[1];
      for (let k = 1; k <= BIN_MAX; k++) out.phase[k] = phaseLerp(out.phase[k], ref + k * 0.002, s);
      return out;
    }
  };
})();
