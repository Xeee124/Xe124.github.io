(function () {
  'use strict';
  const { BIN_MAX, TAU, clamp01, cloneFrame, lerp, phaseLerp } = window.WT;
  window.WT.EFFECTS = window.WT.EFFECTS || {};
  window.WT.EFFECTS['vortex'] = {
    label: 'Vortex（倍音が螺旋状に回転）',
    applyFrame: function (frame, strength, frameIndex, depth) {
      const out         = cloneFrame(frame);
      const s           = clamp01(strength);
      const vortexSpeed = 0.5 + s * 2.0;
      const t           = frameIndex / Math.max(1, depth - 1);
      for (let k = 1; k <= BIN_MAX; k++) {
        const x        = k / BIN_MAX;
        const rotAngle = t * TAU * vortexSpeed * (0.3 + x * 2.7);
        const spiralAmp = 0.5 + 0.5 * Math.cos(rotAngle);
        out.amp[k]    = clamp01(out.amp[k] * (0.2 + 0.8 * lerp(1, spiralAmp, s)));
        out.phase[k]  = phaseLerp(out.phase[k], out.phase[k] + rotAngle * s, 1);
      }
      return out;
    }
  };
})();
