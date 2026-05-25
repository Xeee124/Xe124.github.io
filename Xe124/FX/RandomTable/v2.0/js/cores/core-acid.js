(function () {
  'use strict';
  const { BIN_MAX, blankFrame, clamp01, wrapPhase } = window.WT;

  window.WT.CORES = window.WT.CORES || {};
  window.WT.CORES['acid'] = {
    label: 'Acid（TB-303 ラダーLPF掃引）',
    fn: function coreAcid(pos) {
      const f = blankFrame();
      const rng = (x) => { const v = Math.sin(x * 127.1 + pos * 31.4 + 17.3) * 43758.5453; return v - Math.floor(v); };
      const t = (pos % 1.0);
      const envAttack = 0.05 + rng(1) * 0.15;
      const envDecay = 0.3 + rng(2) * 0.5;
      let envelope;
      if (t < envAttack) {
        envelope = t / envAttack;
      } else {
        envelope = Math.exp(-(t - envAttack) / Math.max(0.01, envDecay));
      }
      const envAmount = 0.3 + rng(3) * 0.5;
      const cutBase = 0.03 + rng(4) * 0.1;
      const cutMax = 0.15 + rng(5) * 0.35;
      const cutoff = cutBase + (cutMax - cutBase) * envelope * envAmount;
      const cutBin = Math.max(1, Math.round(cutoff * BIN_MAX));
      const resonance = 0.6 + rng(6) * 0.35;
      const order = 4;
      for (let k = 1; k <= BIN_MAX; k++) {
        const ratio = k / Math.max(1, cutBin);
        const lpGain = 1 / Math.sqrt(1 + Math.pow(ratio, order * 2));
        const resDist = Math.abs(k - cutBin) / Math.max(1, cutBin * 0.06);
        const resPeak = resonance * 2.5 * Math.exp(-0.5 * resDist * resDist);
        const sawAmp = 1.0 / k;
        f.amp[k] = clamp01(sawAmp * (lpGain + resPeak));
        const phaseShift = -Math.PI * 0.5 * (1 - lpGain) * (1 + resonance);
        const phBase = ratio < 0.8 ? phaseShift : phaseShift + (rng(k * 7 + 11) * 2 - 1) * Math.PI * (ratio - 0.8);
        f.phase[k] = wrapPhase(phBase);
      }
      return f;
    }
  };
})();
