// =============================================================
// dsp-fft.js — 基本FFT/IFFT（Float64、in-place）
// =============================================================

export function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      let t; t = re[i]; re[i] = re[j]; re[j] = t;
              t = im[i]; im[i] = im[j]; im[j] = t;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len;
    const wRe = Math.cos(ang), wIm = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let wr = 1, wi = 0;
      for (let j = 0; j < len / 2; j++) {
        const uRe = re[i+j],       uIm = im[i+j];
        const vRe = re[i+j+len/2] * wr - im[i+j+len/2] * wi;
        const vIm = re[i+j+len/2] * wi + im[i+j+len/2] * wr;
        re[i+j]       = uRe + vRe; im[i+j]       = uIm + vIm;
        re[i+j+len/2] = uRe - vRe; im[i+j+len/2] = uIm - vIm;
        const nr = wr * wRe - wi * wIm;
        wi = wr * wIm + wi * wRe; wr = nr;
      }
    }
  }
}

export function ifft(re, im) {
  const n = re.length;
  for (let i = 0; i < n; i++) im[i] = -im[i];
  fft(re, im);
  for (let i = 0; i < n; i++) { re[i] /= n; im[i] = -im[i] / n; }
}
