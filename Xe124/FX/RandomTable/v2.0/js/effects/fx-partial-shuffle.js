(function () {
  'use strict';
  const { BIN_MAX, cloneFrame, hash01 } = window.WT;
  window.WT.EFFECTS = window.WT.EFFECTS || {};
  window.WT.EFFECTS['partial-shuffle'] = {
    label: 'Partial Shuffle',
    applyFrame: function (frame, strength, frameIndex, depth, seed) {
      const out  = cloneFrame(frame);
      const idxs = Array.from({ length: BIN_MAX }, function (_, i) { return i + 1; });
      for (let i = idxs.length - 1; i > 0; i--) {
        const j = (hash01(seed + i * 13.7) * (i + 1)) | 0;
        const tmp = idxs[i]; idxs[i] = idxs[j]; idxs[j] = tmp;
      }
      const copy = cloneFrame(out);
      for (let k = 1; k <= BIN_MAX; k++) {
        out.amp[k]   = copy.amp[idxs[k - 1]];
        out.phase[k] = copy.phase[idxs[k - 1]];
      }
      return out;
    }
  };
})();
