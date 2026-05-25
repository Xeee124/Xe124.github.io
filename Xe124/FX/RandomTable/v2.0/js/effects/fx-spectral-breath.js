(function () {
  'use strict';
  const { BIN_MAX, TAU, clamp01, cloneFrame, phaseLerp, seededRand } = window.WT;
  window.WT.EFFECTS = window.WT.EFFECTS || {};
  window.WT.EFFECTS['spectral-breath'] = {
    label: 'Spectral Breath（倍音群の膨らみ縮み同期）',
    applyFrame: function (frame, strength, frameIndex, depth, seed) {
      const out         = cloneFrame(frame);
      const s           = clamp01(strength);
      const breathRate  = 0.5 + seededRand(seed)     * 1.5;
      const breathShift = seededRand(seed + 1) * TAU;
      const t           = frameIndex / Math.max(1, depth - 1);
      const breath      = 0.5 + 0.5 * Math.sin(t * TAU * breathRate + breathShift);
      const ampBoost    = 1.0 + s * (breath - 0.5) * 1.2;
      const phaseAlign  = breath * s;
      for (let k = 1; k <= BIN_MAX; k++) {
        out.amp[k]   = clamp01(out.amp[k] * Math.max(0.05, ampBoost));
        out.phase[k] = phaseLerp(out.phase[k], 0, phaseAlign * 0.5);
      }
      return out;
    }
  };
})();
