(function () {
  'use strict';
  const { BIN_MAX, clamp01, cloneFrame, phaseLerp } = window.WT;
  window.WT.EFFECTS = window.WT.EFFECTS || {};
  window.WT.EFFECTS['phase-lock'] = {
    label: 'Phase Lock',
    applyFrame: function (frame, strength) {
      const out  = cloneFrame(frame);
      const s    = clamp01(strength);
      let peak = 1, peakAmp = 0;
      for (let k = 1; k <= BIN_MAX; k++) if (out.amp[k] > peakAmp) { peakAmp = out.amp[k]; peak = k; }
      const ref = out.phase[peak];
      for (let k = 1; k <= BIN_MAX; k++) out.phase[k] = phaseLerp(out.phase[k], ref, s);
      return out;
    }
  };
})();
