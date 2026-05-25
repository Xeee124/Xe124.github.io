(function () {
  'use strict';
  const { BIN_MAX, TAU, clamp01, cloneFrame, phaseLerp, smoothBins, seededRand } = window.WT;
  window.WT.EFFECTS = window.WT.EFFECTS || {};
  window.WT.EFFECTS['harmonic-orbit'] = {
    label: 'Harmonic Orbit（振幅・位相が円軌道同期）',
    applyFrame: function (frame, strength, frameIndex, depth, seed) {
      const out        = cloneFrame(frame);
      const s          = clamp01(strength);
      const orbitRate  = 0.08 + s * 0.18;
      const orbitAmp   = 0.3  + s * 0.5;
      const groupSize  = 3 + Math.floor(seededRand(seed) * 5);
      const phaseBase  = seededRand(seed + 1) * TAU;
      const t          = frameIndex / Math.max(1, depth - 1);
      for (let k = 1; k <= BIN_MAX; k++) {
        const group   = Math.floor(k / groupSize);
        const theta   = phaseBase + group * 0.7 + t * TAU * orbitRate * (1 + group * 0.1);
        const ampMod  = 1.0 + orbitAmp * Math.cos(theta);
        const phShift = orbitAmp * s * Math.sin(theta);
        out.amp[k]    = clamp01(out.amp[k] * Math.max(0, ampMod));
        out.phase[k]  = phaseLerp(out.phase[k], out.phase[k] + phShift, 1);
      }
      return smoothBins(out, 2, 0.2 * s);
    }
  };
})();
