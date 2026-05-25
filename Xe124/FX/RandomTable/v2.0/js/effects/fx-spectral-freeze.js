(function () {
  'use strict';
  const { BIN_MAX, clamp01, cloneFrame, lerp, phaseLerp } = window.WT;
  window.WT.EFFECTS = window.WT.EFFECTS || {};
  window.WT.EFFECTS['spectral-freeze'] = {
    label: 'Spectral Freeze',
    applyFrame: function (frame, strength, frameIndex) {
      const out = cloneFrame(frame);
      const s = clamp01(strength);
      const frozen = frameIndex <= 0 ? out : cloneFrame(frame);
      for (let k = 1; k <= BIN_MAX; k++) {
        out.amp[k]   = lerp(out.amp[k], frozen.amp[k], 0.3 + 0.4 * s);
        out.phase[k] = phaseLerp(out.phase[k], frozen.phase[k], 0.3 + 0.4 * s);
      }
      return out;
    },
    applyLayer: function (frames, strength) {
      const s = clamp01(strength);
      const ref = frames[(frames.length / 2) | 0] || frames[0];
      return frames.map(function (f) {
        const out = cloneFrame(f);
        for (let k = 1; k <= BIN_MAX; k++) {
          out.amp[k]   = lerp(out.amp[k], ref.amp[k], 0.68 + 0.28 * s);
          out.phase[k] = phaseLerp(out.phase[k], ref.phase[k], 0.68 + 0.28 * s);
        }
        return out;
      });
    }
  };
})();
