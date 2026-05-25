(function () {
  'use strict';
  const { BIN_MAX, clamp01, cloneFrame, phaseLerp } = window.WT;
  window.WT.EFFECTS = window.WT.EFFECTS || {};
  window.WT.EFFECTS['phase-chase'] = {
    label: 'Phase Chase',
    applyFrame: function (frame, strength) {
      const out = cloneFrame(frame);
      const s   = clamp01(strength);
      for (let k = 1; k <= BIN_MAX; k++) {
        const radius  = Math.max(2, Math.floor((1 - k / BIN_MAX) * 12 + 2));
        let leadAmp   = 0, leadK = k;
        for (let j = Math.max(1, k - radius); j <= Math.min(BIN_MAX, k + radius); j++) {
          if (out.amp[j] > leadAmp) { leadAmp = out.amp[j]; leadK = j; }
        }
        const chaseStr = s * (1 - out.amp[k] / (leadAmp + 1e-6)) * 0.7;
        out.phase[k] = phaseLerp(out.phase[k], out.phase[leadK] + (k - leadK) * 0.04, chaseStr);
      }
      return out;
    },
    applyLayer: function (frames, strength) {
      const s   = clamp01(strength);
      const out = frames.map(cloneFrame);
      const depth = frames.length;
      for (let i = 1; i < depth; i++) {
        for (let k = 1; k <= BIN_MAX; k++) {
          out[i].phase[k] = phaseLerp(frames[i].phase[k], out[i - 1].phase[k], 0.35 * s);
        }
      }
      return out;
    }
  };
})();
