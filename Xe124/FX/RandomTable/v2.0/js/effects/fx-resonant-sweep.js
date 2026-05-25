(function () {
  'use strict';
  const { BIN_MAX, clamp01, cloneFrame, phaseLerp, smoothBins, seededRand } = window.WT;
  window.WT.EFFECTS = window.WT.EFFECTS || {};
  window.WT.EFFECTS['resonant-sweep'] = {
    label: 'Resonant Sweep（共振ピーク移動＋位相追従）',
    applyFrame: function (frame, strength, frameIndex, depth, seed) {
      const out        = cloneFrame(frame);
      const s          = clamp01(strength);
      const sweepDir   = seededRand(seed)     > 0.5 ? 1 : -1;
      const sweepCycles = 1 + seededRand(seed + 1) * 3;
      const resonance  = 2.0 + s * 6.0;
      const t          = frameIndex / Math.max(1, depth - 1);
      const peakPos    = ((sweepDir > 0 ? t : 1 - t) * sweepCycles) % 1.0;
      const peakBin    = Math.max(1, Math.round(peakPos * BIN_MAX));
      for (let k = 1; k <= BIN_MAX; k++) {
        const dist    = Math.abs(k - peakBin);
        const resPeak = Math.exp(-0.5 * (dist / (BIN_MAX * 0.04 + resonance)) ** 2);
        out.amp[k]    = clamp01(out.amp[k] * (1.0 + s * resonance * resPeak));
        const phTarget = Math.PI * 0.5 * (k < peakBin ? -1 : 1);
        out.phase[k]   = phaseLerp(out.phase[k], phTarget, resPeak * s * 0.7);
      }
      return smoothBins(out, 2, 0.15 * s);
    }
  };
})();
