(function () {
  'use strict';
  const { BIN_MAX, TAU, clamp01, lerp, cloneFrame, phaseLerp, seededRand } = window.WT;
  window.WT.EFFECTS = window.WT.EFFECTS || {};
  window.WT.EFFECTS['inharmonic-shift'] = {
    label: 'Inharmonic Shift（倍音位置ズレが時間変化）',
    applyFrame: function (frame, strength, frameIndex, depth, seed) {
      const out        = cloneFrame(frame);
      const s          = clamp01(strength);
      const maxStretch = 1.0 + s * 0.08;
      const t          = frameIndex / Math.max(1, depth - 1);
      const stretch    = lerp(1.0, maxStretch, 0.5 + 0.5 * Math.sin(t * TAU + seededRand(seed) * TAU));
      const newAmp     = new Float32Array(BIN_MAX + 2);
      const newPhase   = new Float32Array(BIN_MAX + 2);
      for (let k = 1; k <= BIN_MAX; k++) {
        const destK = k * Math.pow(stretch, k / BIN_MAX * 2);
        const dk    = Math.floor(destK);
        const frac  = destK - dk;
        if (dk >= 1 && dk < BIN_MAX) {
          newAmp[dk]     += out.amp[k] * (1 - frac);
          newAmp[dk + 1] += out.amp[k] * frac;
          const phShift   = (destK - k) * Math.PI * s * 0.5;
          newPhase[dk]    = out.phase[k] + phShift;
          newPhase[dk + 1] = out.phase[k] + phShift + 0.1;
        }
      }
      for (let k = 1; k <= BIN_MAX; k++) {
        if (newAmp[k]   > 0) out.amp[k]   = clamp01(newAmp[k]);
        if (newPhase[k] !== 0) out.phase[k] = newPhase[k];
      }
      return out;
    }
  };

})();
