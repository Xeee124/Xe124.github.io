(function () {
  'use strict';
  const { BIN_MAX, clamp01, cloneFrame, lerp, phaseLerp, wrapPhase, smoothBins, seededRand } = window.WT;
  window.WT.EFFECTS = window.WT.EFFECTS || {};
  window.WT.EFFECTS['ladder-filter'] = {
    label: 'Ladder Filter（12段Moogラダーフィルター質感）',
    applyFrame: function (frame, strength, frameIndex, depth, seed) {
      const out        = cloneFrame(frame);
      const s          = clamp01(strength);
      const STAGES     = 12;
      const t          = frameIndex / Math.max(1, depth - 1);
      const cutBase    = 0.05 + seededRand(seed)     * 0.45;
      const cutMod     = cutBase + 0.08 * Math.sin(t * Math.PI * 2 * (1 + seededRand(seed + 1) * 2));
      const cutBin     = Math.max(1, Math.round(clamp01(cutMod) * BIN_MAX));
      const resonance  = 0.1 + s * 0.85;
      const rolloffOrder = STAGES / 2;
      for (let k = 1; k <= BIN_MAX; k++) {
        const ratio   = k / Math.max(1, cutBin);
        const denom   = 1 + Math.pow(ratio, rolloffOrder * 2);
        const lpGain  = 1 / Math.sqrt(denom);
        const resDist = Math.abs(k - cutBin) / Math.max(1, cutBin * 0.08);
        const resPeak = resonance * Math.exp(-0.5 * resDist * resDist);
        const totalGain = Math.min(2.5, lpGain + resPeak);
        out.amp[k]    = lerp(out.amp[k], out.amp[k] * totalGain, s * 0.88);
        const phaseShift = -Math.PI * (1 - lpGain) * (1 + resonance * resPeak);
        out.phase[k]  = phaseLerp(out.phase[k], wrapPhase(out.phase[k] + phaseShift), s * 0.55);
      }
      if (resonance > 0.7) {
        const oscStrength = (resonance - 0.7) / 0.3;
        const oscRange    = Math.max(1, Math.round(cutBin * 0.04));
        for (let k = Math.max(1, cutBin - oscRange); k <= Math.min(BIN_MAX, cutBin + oscRange); k++) {
          out.amp[k]   = lerp(out.amp[k], Math.min(1.0, out.amp[k] * (1 + oscStrength * 3)), s * 0.7);
          out.phase[k] = phaseLerp(out.phase[k], 0, oscStrength * s * 0.6);
        }
      }
      return smoothBins(out, 1, 0.15 * s);
    }
  };
})();
