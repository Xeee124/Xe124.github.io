(function () {
  'use strict';
  const { BIN_MAX, blankFrame, clamp01, wrapPhase } = window.WT;

  window.WT.CORES = window.WT.CORES || {};
  window.WT.CORES['ring'] = {
    label: 'Ring（サイクロイドアトム配置）',
    fn: function coreRing(pos) {
      const f = blankFrame();
      const rng = (x) => { const v = Math.sin(x * 127.1 + pos * 31.4) * 43758.5453; return v - Math.floor(v); };
      const numAtoms = 2 + Math.floor(rng(1) * 5);
      const atoms = [];
      for (let a = 0; a < numAtoms; a++) {
        atoms.push({
          center: 0.04 + rng(a * 7 + 2) * 0.72,
          width: 0.04 + rng(a * 7 + 3) * 0.18,
          height: 0.5 + rng(a * 7 + 4) * 0.5,
        });
      }
      for (let k = 1; k <= BIN_MAX; k++) {
        const x = k / BIN_MAX;
        let ampSum = 0, phxSum = 0, phySum = 0;
        for (const atom of atoms) {
          const dist = (x - atom.center) / Math.max(0.01, atom.width);
          if (Math.abs(dist) > 2.0) continue;
          if (dist >= -1.0 && dist <= 1.0) {
            const semicircle = Math.sqrt(Math.max(0, 1 - dist * dist));
            ampSum += atom.height * semicircle;
            const sawPhase = Math.PI * Math.abs(dist);
            const phTarget = sawPhase * (dist > 0 ? 1 : -1);
            phxSum += Math.cos(phTarget) * atom.height * semicircle;
            phySum += Math.sin(phTarget) * atom.height * semicircle;
          } else {
            const tail = Math.max(0, 1 - (Math.abs(dist) - 1.0) * 3);
            ampSum += atom.height * 0.04 * tail;
            phxSum += Math.cos(Math.PI) * atom.height * 0.04 * tail;
            phySum += Math.sin(Math.PI) * atom.height * 0.04 * tail;
          }
        }
        const falloff = 0.15 + 0.85 * Math.pow(1 - Math.pow(x, 0.6), 0.5);
        f.amp[k] = clamp01(ampSum * falloff + 0.02 * rng(k * 3 + 5));
        const basePhase = phxSum !== 0 || phySum !== 0
          ? Math.atan2(phySum, phxSum)
          : (rng(k + 10) * 2 - 1) * Math.PI;
        f.phase[k] = wrapPhase(basePhase + pos * 0.08 * (k / BIN_MAX));
      }
      return f;
    }
  };
})();
