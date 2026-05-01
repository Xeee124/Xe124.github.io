// === WTSG_utils.js ===
  function byId(id) { return document.getElementById(id); }

  function uuid() {
    if (crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  function clone(obj) { return JSON.parse(JSON.stringify(obj)); }

  function nowIso() { return new Date().toISOString(); }

  function referenceList(reference) {
    if (!reference) return [];
    if (Array.isArray(reference)) return reference.filter(item => item && typeof item === 'object');
    if (Array.isArray(reference.items)) return reference.items.filter(item => item && typeof item === 'object');
    return [reference];
  }

  function referenceCount(reference) {
    return referenceList(reference).length;
  }

  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

  function rand() { return Math.random(); }

  function randn() {
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  function normalizeVector(vec) {
    let maxAmp = 1e-6;
    for (let i = 0; i < vec.amps.length; i++) {
      const a = Math.abs(vec.amps[i]);
      if (a > maxAmp) maxAmp = a;
    }
    for (let i = 0; i < vec.amps.length; i++) vec.amps[i] = clamp(vec.amps[i] / maxAmp, 0, 1);
    for (let i = 0; i < vec.phases.length; i++) vec.phases[i] = wrapPhase(vec.phases[i]);
    return vec;
  }

  function wrapPhase(x) {
    return x - Math.PI * 2 * Math.floor((x + Math.PI) / (Math.PI * 2));
  }

  function lerp(a, b, t) { return a + (b - a) * t; }

  function lerpArray(a, b, t) {
    const out = new Array(Math.min(a.length, b.length));
    for (let i = 0; i < out.length; i++) out[i] = lerp(a[i], b[i], t);
    return out;
  }

