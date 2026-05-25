(function () {
  'use strict';
  const {
    BIN_MAX, clamp01,
    blankFrame,
    perlinNoise2D, simplexNoise2D, worleyNoise2D, cellularNoise2D, randWalkNoise,
    surfaceAmpEnvelope, surfacePhaseFromAmp, pHash
  } = window.WT;

  function coreSurface(pos, noiseType) {
    const f = blankFrame();
    const seed = Math.random() * 1000;
    const bands = [
      { kMin: 3, kMax: 30, scale: 4.0, yScale: 2.0, weight: 0.8 },
      { kMin: 20, kMax: 120, scale: 8.0, yScale: 3.0, weight: 1.2 },
      { kMin: 80, kMax: 350, scale: 12.0, yScale: 4.0, weight: 1.0 },
      { kMin: 200, kMax: BIN_MAX, scale: 20.0, yScale: 5.0, weight: 0.6 },
    ];
    for (let k = 1; k <= BIN_MAX; k++) {
      const x = k / BIN_MAX;
      const y = pos;
      let noiseVal = 0, totalWeight = 0;
      for (const band of bands) {
        if (k < band.kMin || k > band.kMax) continue;
        const nx = x * band.scale;
        const ny = y * band.yScale;
        let n;
        switch (noiseType) {
          case 'perlin': n = perlinNoise2D(nx, ny, seed + band.kMin); break;
          case 'simplex': n = clamp01(simplexNoise2D(nx, ny, seed + band.kMin)); break;
          case 'worley': n = worleyNoise2D(nx, ny, seed + band.kMin, 3 + Math.floor(band.scale / 4)); break;
          case 'cellular': n = cellularNoise2D(nx, ny, seed + band.kMin, 3 + Math.floor(band.scale / 4)); break;
          case 'randwalk': n = randWalkNoise(x, y, seed + band.kMin, 16 + Math.floor(band.scale * 2)); break;
          case 'randmix': {
            const types = ['perlin', 'simplex', 'worley', 'cellular', 'randwalk'];
            const pick = types[Math.floor(pHash(band.kMin, 0, seed) * types.length)];
            switch (pick) {
              case 'perlin': n = perlinNoise2D(nx, ny, seed + band.kMin); break;
              case 'simplex': n = clamp01(simplexNoise2D(nx, ny, seed + band.kMin)); break;
              case 'worley': n = worleyNoise2D(nx, ny, seed + band.kMin, 4); break;
              case 'cellular': n = cellularNoise2D(nx, ny, seed + band.kMin, 4); break;
              default: n = randWalkNoise(x, y, seed + band.kMin, 20); break;
            }
            break;
          }
          default: n = perlinNoise2D(nx, ny, seed + band.kMin);
        }
        noiseVal += n * band.weight;
        totalWeight += band.weight;
      }
      const rawNoise = totalWeight > 0 ? noiseVal / totalWeight : 0;
      f.amp[k] = clamp01(rawNoise * surfaceAmpEnvelope(k));
      f.phase[k] = surfacePhaseFromAmp(k, f.amp[k], pos, seed + k * 0.01);
    }
    return f;
  }

  window.WT.CORES = window.WT.CORES || {};

  window.WT.CORES['perlin'] = {
    label: 'Perlin Noise（パーリンノイズ曲面）',
    fn: (pos) => coreSurface(pos, 'perlin')
  };
  window.WT.CORES['simplex'] = {
    label: 'Simplex Noise（シンプレックスノイズ曲面）',
    fn: (pos) => coreSurface(pos, 'simplex')
  };
  window.WT.CORES['worley'] = {
    label: 'Worley Noise（ウォーリーノイズ曲面）',
    fn: (pos) => coreSurface(pos, 'worley')
  };
  window.WT.CORES['cellular'] = {
    label: 'Cellular Noise（セルラーノイズ曲面）',
    fn: (pos) => coreSurface(pos, 'cellular')
  };
  window.WT.CORES['randwalk'] = {
    label: 'Random Walk（ランダムウォーク曲面）',
    fn: (pos) => coreSurface(pos, 'randwalk')
  };
  window.WT.CORES['randmix'] = {
    label: 'Random Mix（ノイズ種混合曲面）',
    fn: (pos) => coreSurface(pos, 'randmix')
  };
})();
