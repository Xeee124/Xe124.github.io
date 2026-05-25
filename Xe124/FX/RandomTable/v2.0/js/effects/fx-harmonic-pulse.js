(function () {
  'use strict';
  const { BIN_MAX, TAU, clamp01, cloneFrame, phaseLerp, seededRand } = window.WT;
  window.WT.EFFECTS = window.WT.EFFECTS || {};
  window.WT.EFFECTS['harmonic-pulse'] = {
    label: 'Harmonic Pulse（拍動強弱＋同期位相整列）',
    applyFrame: function (frame, strength, frameIndex, depth, seed) {
      const out        = cloneFrame(frame);
      const s          = clamp01(strength);
      const pulseRate  = 1 + Math.floor(seededRand(seed)     * 4);
      const pulseShift = seededRand(seed + 1) * TAU;
      const t          = frameIndex / Math.max(1, depth - 1);
      const pulse      = 0.5 + 0.5 * Math.sin(t * TAU * pulseRate + pulseShift);
      const coherence  = pulse * s;
      for (let k = 1; k <= BIN_MAX; k++) {
        out.amp[k]   = clamp01(out.amp[k] * (0.2 + 0.8 * pulse));
        out.phase[k] = phaseLerp(out.phase[k], 0, coherence * 0.6);
      }
      return out;
    }
  };
})();
