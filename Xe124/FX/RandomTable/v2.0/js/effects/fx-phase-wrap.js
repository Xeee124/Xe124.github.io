(function () {
  'use strict';
  const { BIN_MAX, TAU, clamp01, cloneFrame, phaseLerp } = window.WT;
  window.WT.EFFECTS = window.WT.EFFECTS || {};
  window.WT.EFFECTS['phase-wrap'] = {
    label: 'Phase Wrap',
    applyFrame: function (frame, strength) {
      const out          = cloneFrame(frame);
      const s            = clamp01(strength);
      const gridDivisions = 4 + Math.round(s * 8);
      const gridStep     = TAU / gridDivisions;
      for (let k = 1; k <= BIN_MAX; k++) {
        const nearest  = Math.round(out.phase[k] / gridStep) * gridStep;
        out.phase[k]   = phaseLerp(out.phase[k], nearest, s * 0.6);
      }
      return out;
    }
  };
})();
