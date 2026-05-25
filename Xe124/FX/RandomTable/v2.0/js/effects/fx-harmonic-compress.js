(function () {
  'use strict';
  const { BIN_MAX, clamp01, cloneFrame, lerp } = window.WT;
  window.WT.EFFECTS = window.WT.EFFECTS || {};
  window.WT.EFFECTS['harmonic-compress'] = {
    label: 'Harmonic Compress（倍音振幅のダイナミクス圧縮）',
    applyFrame: function (frame, strength) {
      const out   = cloneFrame(frame);
      const s     = clamp01(strength);
      let rms     = 0;
      for (let k = 1; k <= BIN_MAX; k++) rms += out.amp[k] ** 2;
      rms = Math.sqrt(rms / BIN_MAX) || 0.1;
      const ratio = 1 + s * 3;
      const knee  = rms * (0.5 + 0.5 * (1 - s));
      for (let k = 1; k <= BIN_MAX; k++) {
        let gain;
        if (out.amp[k] > knee) {
          const excess = out.amp[k] - knee;
          gain = (knee + excess / ratio) / out.amp[k];
        } else {
          gain = 1.0 + (1 - out.amp[k] / knee) * s * 0.3;
        }
        out.amp[k] = clamp01(lerp(out.amp[k], out.amp[k] * gain, s * 0.8));
      }
      return out;
    }
  };
})();
