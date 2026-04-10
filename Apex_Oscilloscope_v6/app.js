"use strict";
(() => {

  const RING_SIZE = 65536;
  const RING_MASK = RING_SIZE - 1;
  const META_SIZE = 16; // v5: 拡張メタ領域（トリガー結果等をWorkletから受け取る）
  const MAX_POINTS = 4096;

  /* ═══════════════════════════════════════════════════════════════
     DOM CACHE
     ═══════════════════════════════════════════════════════════════ */
  const $ = id => document.getElementById(id);
  const glCanvas = $('gl-canvas');
  const overCanvas = $('overlay-cv');
  const overCtx = overCanvas.getContext('2d', { alpha: true, desynchronized: true });
  const domCache =
  {
    stFps: $('st-fps'),
    stLat: $('st-lat'),
    stTrig: $('st-trig'),
    stAmp: $('st-amp'),
    stSrc: $('st-src'),
    seekbar: $('seekbar'),
    timeDsp: $('time-dsp'),
    btnPlay: $('btn-play'),
    btnStop: $('btn-stop'),
    btnTp: $('btn-tp'),
    statsBar: $('stats-bar'),
    mainEl: $('main'),
    dropOverlay: $('drop-overlay'),
    topBar: $('topBar'),
    menuToggle: $('menu-toggle'),
  };
  const domPrev =
  {
    stFps: '',
    stLat: '',
    stTrig: '',
    stAmp: '',
    stSrc: '',
    timeDsp: '',
    seekbar: -1
  };

  /* ═══════════════════════════════════════════════════════════════
     WEBGL2
     ═══════════════════════════════════════════════════════════════ */
  const gl = glCanvas.getContext
    (
      'webgl2',
      {
        alpha: false,
        antialias: false,
        depth: false,
        stencil: false,
        desynchronized: true,
        powerPreference: 'high-performance',
        preserveDrawingBuffer: false
      }
    );
  if (!gl) { document.body.innerHTML = '<h2 style="color:#f66;padding:2em">WebGL2 is required</h2>'; return; }

  const VERT_POLYLINE = `#version 300 es
precision highp float;
uniform sampler2D   u_dataTex;
uniform int         u_numPoints;
uniform vec2        u_res;
uniform float       u_thickness;
uniform float       u_offsetX;
uniform float       u_scaleX;
uniform float       u_offsetY;
uniform float       u_scaleY;

out float v_t;

// v5: データテクスチャからY値を取得する関数（境界外アクセスはクランプ）
float fetchY(int idx)
{
    idx = clamp(idx, 0, u_numPoints - 1);
    return texelFetch(u_dataTex, ivec2(idx, 0), 0).r;
}

// v5: 線の太さを持たせたポリライン描画。gl_VertexIDでポイントインデックスと左右オフセットを生成。
void main()
{
    int pointIdx = gl_VertexID / 2;
    float side = float((gl_VertexID & 1) * 2 - 1);

    float t = float(pointIdx) / float(max(1, u_numPoints - 1));
    v_t = t;

    float y = fetchY(pointIdx);
    float x = t;

    // v5: スケーリングとオフセットを適用してクリップ空間に変換
    vec2 pos = vec2
        (
            (x * u_scaleX + u_offsetX) * 2.0 - 1.0,
             y * u_scaleY + u_offsetY
        );

    float yPrev = fetchY(pointIdx - 1);
    float yNext = fetchY(pointIdx + 1);
    float xPrev = float(max(0, pointIdx-1)) / float(max(1, u_numPoints-1));
    float xNext = float(min(u_numPoints-1, pointIdx+1)) / float(max(1, u_numPoints-1));

    // v5: 前後のポイントも同様に変換
    vec2 pPrev = vec2
    (
        (xPrev * u_scaleX + u_offsetX) * 2.0 - 1.0,
         yPrev * u_scaleY + u_offsetY
    );

    // v5: 前後のポイントも同様に変換
    vec2 pNext = vec2
    (
        (xNext * u_scaleX + u_offsetX) * 2.0 - 1.0,
         yNext * u_scaleY + u_offsetY
    );

    vec2 posPx  = (pos * 0.5 + 0.5) * u_res;
    vec2 prevPx = (pPrev * 0.5 + 0.5) * u_res;
    vec2 nextPx = (pNext * 0.5 + 0.5) * u_res;
    vec2 dirIn  = posPx - prevPx;
    vec2 dirOut = nextPx - posPx;
    float lenIn = length(dirIn);
    float lenOut= length(dirOut);
    vec2 normIn, normOut;

    // もし前後のポイントがほぼ同じ位置なら、法線は上向きに固定（垂直な線を描くため）
    if(lenIn > 0.001)
    {
        dirIn /= lenIn; normIn = vec2(-dirIn.y, dirIn.x);
    }
    else
    {
        normIn = vec2(0.0, 1.0);
    }

    // もし前後のポイントがほぼ同じ位置なら、法線は上向きに固定（垂直な線を描くため）
    if(lenOut > 0.001)
    {
        dirOut /= lenOut; normOut = vec2(-dirOut.y, dirOut.x);
    }
    else
    {
        normOut = vec2(0.0, 1.0);
    }

    vec2 miter      = normalize(normIn + normOut);
    float miterDot  = dot(miter, normOut);
    float miterLen  = (abs(miterDot) > 0.1) ? (1.0 / miterDot) : 1.0;
    miterLen        = clamp(miterLen, -3.0, 3.0);
    vec2 offset     = miter * u_thickness * 0.5 * side * miterLen;
    vec2 finalPx    = posPx + offset;
    vec2 finalClip  = (finalPx / u_res) * 2.0 - 1.0;
    gl_Position     = vec4(finalClip, 0.0, 1.0);
}`;

  const FRAG_SOLID = `#version 300 es
precision mediump float;
uniform vec4 u_color;
in float v_t;
out vec4 fragColor;
void main()
{
    fragColor = u_color;
}`;

  const FRAG_GRADIENT = `#version 300 es
precision mediump float;
uniform vec4 u_colorA;
uniform vec4 u_colorB;
uniform vec4 u_colorC;
uniform vec4 u_colorD;
in float v_t;
out vec4 fragColor;
void main()
{
    vec4 c;

    // もしtが0.333未満なら、           AとBの間を線形補間
    // もしtが0.333以上0.666未満なら、  BとCの間を線形補間
    // もしtが0.666以上なら、           CとDの間を線形補間
    if      (v_t < 0.333) c = mix(u_colorA, u_colorB,  v_t * 3.0);
    else if (v_t < 0.666) c = mix(u_colorB, u_colorC, (v_t - 0.333) * 3.0);
    else    c = mix(u_colorC, u_colorD, (v_t - 0.666) * 3.0);
    
    fragColor = c;
}`;

  // v5: XY（Lissajous）用 — 2つのData Texture（L, R）を使う
  const VERT_LISSAJOUS = `#version 300 es
precision highp float;
uniform sampler2D u_dataTexL;
uniform sampler2D u_dataTexR;
uniform int       u_numPoints;
uniform vec2      u_res;
uniform float     u_thickness;
uniform float     u_scaleY;

out float v_t;

float fetchL(int idx){ return texelFetch(u_dataTexL, ivec2(clamp(idx,0,u_numPoints-1),0),0).r; }
float fetchR(int idx){ return texelFetch(u_dataTexR, ivec2(clamp(idx,0,u_numPoints-1),0),0).r; }

// v5: L,RをそれぞれX,YにマッピングしてLissajousを描画。線の太さも同様に持たせる。
void main()
{
    int pointIdx    = gl_VertexID / 2;
    float side      = float((gl_VertexID & 1) * 2 - 1);
    v_t             = float(pointIdx) / float(max(1, u_numPoints - 1));

    float lx        = fetchL(pointIdx) * 0.5 + 0.5; // L → X [0,1]→[-1,1]
    float ry        = fetchR(pointIdx);               // R → Y

    vec2 pos        = vec2(lx * 2.0 - 1.0, ry * u_scaleY);

    float lxP       = fetchL(pointIdx-1)*0.5+0.5;
    float ryP       = fetchR(pointIdx-1);
    float lxN       = fetchL(pointIdx+1)*0.5+0.5;
    float ryN       = fetchR(pointIdx+1);
    vec2 pPrev      = vec2(lxP*2.0-1.0, ryP*u_scaleY);
    vec2 pNext      = vec2(lxN*2.0-1.0, ryN*u_scaleY);

    vec2 posPx      = (pos*0.5+0.5)*u_res;
    vec2 prevPx     = (pPrev*0.5+0.5)*u_res;
    vec2 nextPx     = (pNext*0.5+0.5)*u_res;

    vec2 dirIn      = posPx - prevPx;
    vec2 dirOut     = nextPx - posPx;
    float lenIn     = length(dirIn);
    float lenOut    = length(dirOut);
    vec2 normIn     = lenIn>0.001 ? vec2(-dirIn.y/lenIn, dirIn.x/lenIn) : vec2(0,1);
    vec2 normOut    = lenOut>0.001 ? vec2(-dirOut.y/lenOut, dirOut.x/lenOut) : vec2(0,1);
    vec2 miter      = normalize(normIn + normOut);
    float md        = dot(miter, normOut);
    float ml        = abs(md)>0.1 ? 1.0/md : 1.0;
    ml              = clamp(ml, -3.0, 3.0);
    vec2 offset     = miter * u_thickness * 0.5 * side * ml;
    vec2 finalPx    = posPx + offset;
    gl_Position     = vec4((finalPx/u_res)*2.0-1.0, 0.0, 1.0);
}`;

  // v5: 残像用 — 前フレームの内容をテクスチャとして読み込み、減衰させて描画。RGBもわずかに減衰させることで、色が深みに沈む効果を追加。
  const VERT_QUAD = `#version 300 es
precision highp float;
in vec2 a_pos;
out vec2 v_uv;

// v5: フルスクリーンクアッドの頂点シェーダ。単純に位置からUVを生成して、残像用フラグメントシェーダに渡す。
void main()
{
    v_uv = a_pos * 0.5 + 0.5;
    gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

  // v5: 残像にRGB減衰を追加（エネルギー密度感の向上）
  const FRAG_PERSIST = `#version 300 es
precision mediump float;
uniform sampler2D u_tex;
uniform float u_decay;
in vec2 v_uv;
out vec4 fragColor;

// v5: 前フレームの内容をテクスチャから取得し、アルファだけでなくRGBも減衰させて描画。これにより、残像が徐々に色褪せて深みに沈むような視覚効果が得られる。
void main()
{
    vec4 c          = texture(u_tex, v_uv);
    float rgbDecay  = mix(1.0, u_decay, 0.15);
    fragColor       = vec4(c.rgb * rgbDecay, c.a * u_decay);
}`;

  // v5: グリッド描画。線の太さは距離に応じて変化させ、中心線を強調。グリッド表示オプションも追加。
  const FRAG_GRID = `#version 300 es
precision mediump float;
uniform vec2 u_res;
uniform float u_showGrid;
in vec2 v_uv;
out vec4 fragColor;

void main()
{
    if(u_showGrid < 0.5){ discard; }

    vec2 px             = v_uv * u_res;
    float minor         = 0.0;
    float gridSpacing   = max(20.0, min(u_res.x, u_res.y) / 18.0);
    float major         = gridSpacing * 4.0;
    float mxMin         = mod(px.x, gridSpacing);
    float myMin         = mod(px.y, gridSpacing);
    float mxMaj         = mod(px.x, major);
    float myMaj         = mod(px.y, major);
    float lineW         = 1.0;

    if(mxMin < lineW || myMin < lineW) minor = 0.06;
    if(mxMaj < lineW || myMaj < lineW) minor = max(minor, 0.1);

    float cx            = abs(px.x - u_res.x*0.5);
    float cy            = abs(px.y - u_res.y*0.5);

    if(cx < 1.0 || cy < 1.0) minor = max(minor, 0.15);
    if(minor < 0.001) discard;

    fragColor           = vec4(0.33, 0.84, 1.0, minor);
}`;

  function compileShader(src, type) {
    const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.error(gl.getShaderInfoLog(s)); gl.deleteShader(s); return null; }
    return s;
  }
  function linkProgram(vs, fs) {
    const p = gl.createProgram(); gl.attachShader(p, vs); gl.attachShader(p, fs); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) { console.error(gl.getProgramInfoLog(p)); return null; }
    return p;
  }
  function buildProg(vsrc, fsrc) {
    return linkProgram(compileShader(vsrc, gl.VERTEX_SHADER), compileShader(fsrc, gl.FRAGMENT_SHADER));
  }

  const progSolid = buildProg(VERT_POLYLINE, FRAG_SOLID);
  const progGrad = buildProg(VERT_POLYLINE, FRAG_GRADIENT);
  const progLiss = buildProg(VERT_LISSAJOUS, FRAG_SOLID);
  const progLissGrad = buildProg(VERT_LISSAJOUS, FRAG_GRADIENT);
  const progPersist = buildProg(VERT_QUAD, FRAG_PERSIST);
  const progGrid = buildProg(VERT_QUAD, FRAG_GRID);

  /* ── Uniform Locations ── */
  function getUniforms(prog, names) {
    const u = {}; for (const n of names) u[n] = gl.getUniformLocation(prog, n); return u;
  }
  const uSolid = getUniforms(progSolid, ['u_dataTex', 'u_numPoints', 'u_res', 'u_thickness', 'u_offsetX', 'u_scaleX', 'u_offsetY', 'u_scaleY', 'u_color']);
  const uGrad = getUniforms(progGrad, ['u_dataTex', 'u_numPoints', 'u_res', 'u_thickness', 'u_offsetX', 'u_scaleX', 'u_offsetY', 'u_scaleY', 'u_colorA', 'u_colorB', 'u_colorC', 'u_colorD']);
  const uLiss = getUniforms(progLiss, ['u_dataTexL', 'u_dataTexR', 'u_numPoints', 'u_res', 'u_thickness', 'u_scaleY', 'u_color']);
  const uLissGrad = getUniforms(progLissGrad, ['u_dataTexL', 'u_dataTexR', 'u_numPoints', 'u_res', 'u_thickness', 'u_scaleY', 'u_colorA', 'u_colorB', 'u_colorC', 'u_colorD']);
  const uPersist = getUniforms(progPersist, ['u_tex', 'u_decay']);
  const uGrid = getUniforms(progGrid, ['u_res', 'u_showGrid']);

  /* ── Data Textures (1D, R32F) ── */
  // v5: JSはfloat配列をテクスチャに流し込むだけ。頂点計算はGPU完結。
  function createDataTex(width) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, width, 1, 0, gl.RED, gl.FLOAT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return tex;
  }
  const dataTex1 = createDataTex(MAX_POINTS);
  const dataTex2 = createDataTex(MAX_POINTS);

  function uploadDataTex(tex, data, count) {
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, count, 1, gl.RED, gl.FLOAT, data);
  }

  /* ── VAO: 空VAO（頂点はgl_VertexIDで生成） ── */
  const vaoEmpty = gl.createVertexArray();

  /* ── Fullscreen quad ── */
  const quadBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const vaoQuad = gl.createVertexArray();
  gl.bindVertexArray(vaoQuad);
  const aPosP = gl.getAttribLocation(progPersist, 'a_pos');
  gl.enableVertexAttribArray(aPosP); gl.vertexAttribPointer(aPosP, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);
  const vaoGrid = gl.createVertexArray();
  gl.bindVertexArray(vaoGrid);
  const aPosG = gl.getAttribLocation(progGrid, 'a_pos');
  gl.enableVertexAttribArray(aPosG);
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
  gl.vertexAttribPointer(aPosG, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);

  /* ── FBO ping-pong ── */
  let fboW = 0, fboH = 0;
  const fbos = [null, null], fboTexs = [null, null];
  let fboCur = 0;
  function setupFBOs(w, h) {
    if (fboW === w && fboH === h) return;
    fboW = w; fboH = h;
    for (let i = 0; i < 2; i++) {
      if (fbos[i]) gl.deleteFramebuffer(fbos[i]);
      if (fboTexs[i]) gl.deleteTexture(fboTexs[i]);
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      const fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      fbos[i] = fbo; fboTexs[i] = tex;
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  /* ═══════════════════════════════════════════════════════════════
     STATE
     ═══════════════════════════════════════════════════════════════ */
  const S = {
    ac: null, workletReady: false, workletNode: null,
    sourceNode: null, sourceType: 'none', sourceStream: null,
    mediaElSrc: null, fileUrl: null,
    sab: null, metaI32: null, ringL: null, ringR: null,
    analyserL: null, analyserR: null, splitter: null, inputGain: null, monitorGain: null,
    useSAB: false,
    // v5: DC filter状態をトリガー用/表示用で分離
    dcTrigPrevX: 0, dcTrigPrevY: 0,
    dcDispPrevX: 0, dcDispPrevY: 0,
    // work buffers (事前確保、GC回避)
    workL: new Float32Array(MAX_POINTS),
    workR: new Float32Array(MAX_POINTS),
    mixBufTrig: new Float32Array(MAX_POINTS), // v5: トリガー専用
    mixBufDisp: new Float32Array(MAX_POINTS), // v5: 表示専用
    smoothL: new Float32Array(MAX_POINTS),
    smoothR: new Float32Array(MAX_POINTS),
    prevL: new Float32Array(MAX_POINTS),
    prevR: new Float32Array(MAX_POINTS),
    dispL: new Float32Array(MAX_POINTS),
    dispR: new Float32Array(MAX_POINTS),
    // v5: min/max envelope用
    envMin: new Float32Array(MAX_POINTS),
    envMax: new Float32Array(MAX_POINTS),
    envMinR: new Float32Array(MAX_POINTS),
    envMaxR: new Float32Array(MAX_POINTS),
    // GPU upload用（gain適用後）
    gpuBuf1: new Float32Array(MAX_POINTS),
    gpuBuf2: new Float32Array(MAX_POINTS),
    // display
    W: 0, H: 0, dpr: 1, currentDpr: 1, // v5: 動的DPR
    // params
    mode: 'time', channel: 'mix', trigMode: 'nsdf', slope: 'rising',
    threshNorm: .08, holdoffMs: 20,
    zoom: 1, gain: 1, smooth: .15, persist: .85, thick: 1.5,
    colorMode: 'gradient', gridOn: true, glowOn: true, statsOn: true,
    targetFrameMs: 0,
    // render state
    lastTs: 0, rafId: 0,
    lastTrigIdx: 0, lastPeriod: 128, lastAmp: 0,
    // v5: holdoffを時間ベースに
    lastTrigTimeMs: 0,
    // v5: NSDF結果はWorkletから受け取る（SAB経由）
    // meta layout: [0]=writePos, [1]=reserved, [2]=triggerIdx, [3]=nsdfPeriod(float bits), [4]=nsdfConfidence(float bits)
    // stats
    statsTimer: 0,
    // colors
    colorsGrad: [[0.29, 0.96, 1, 1], [0.47, 0.83, 1, 1], [0.55, 0.53, 1, 1], [0.82, 0.55, 1, 1]],
    colorsSolid: { cyan: [0.33, 0.84, 1, 1], green: [0.22, 1, 0.08, 1], magenta: [1, 0.18, 0.48, 1], white: [0.85, 0.85, 0.85, 1] },
    // v5: 動的品質制御
    adaptiveLevel: 0, // 0=full, 1=reduced glow, 2=reduced points, 3=reduced DPR
    fpsHistory: new Float32Array(30),
    fpsHistIdx: 0,
  };

  const audioEl = document.createElement('audio');
  audioEl.crossOrigin = 'anonymous'; audioEl.preload = 'auto';

  /* ═══════════════════════════════════════════════════════════════
     HELPERS
     ═══════════════════════════════════════════════════════════════ */
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  function fmtTime(s) { const m = s / 60 | 0; const sec = s % 60 | 0; return m + ':' + (sec < 10 ? '0' : '') + sec }

  /* ═══════════════════════════════════════════════════════════════
     RESIZE — v5: 動的DPR対応
     ═══════════════════════════════════════════════════════════════ */
  function resize() {
    const rect = domCache.mainEl.getBoundingClientRect();
    // v5: adaptiveLevelに応じてDPRを調整
    const baseDpr = Math.min(devicePixelRatio || 1, 2.5);
    S.currentDpr = S.adaptiveLevel >= 3 ? Math.max(1, baseDpr * 0.5) : baseDpr;
    const w = Math.round(rect.width * S.currentDpr) | 0, h = Math.round(rect.height * S.currentDpr) | 0;
    if (S.W === w && S.H === h) return;
    S.W = w; S.H = h;
    for (const cv of [glCanvas, overCanvas]) { cv.width = w; cv.height = h; cv.style.width = rect.width + 'px'; cv.style.height = rect.height + 'px' }
    gl.viewport(0, 0, w, h);
    setupFBOs(w, h);
  }

  /* ═══════════════════════════════════════════════════════════════
     AUDIO WORKLET — v5: NSDF+トリガー計算をWorklet内で完結
     ═══════════════════════════════════════════════════════════════ */
  const WORKLET_CODE = `
class RingWriter extends AudioWorkletProcessor {
  constructor(options){
    super();
    const p=options.processorOptions||{};
    this.sab=p.sab;
    this.ringSize=p.ringSize||65536;
    this.mask=this.ringSize-1;
    this.metaSize=${META_SIZE};
    if(this.sab){
      this.meta=new Int32Array(this.sab,0,this.metaSize);
      this.metaF=new Float32Array(this.sab,0,this.metaSize);
      this.ringL=new Float32Array(this.sab,this.metaSize*4,this.ringSize);
      this.ringR=new Float32Array(this.sab,this.metaSize*4+this.ringSize*4,this.ringSize);
    }
    this.usePort=!this.sab;
    // v5: Worklet内NSDF用バッファ
    this.nsdfBuf=new Float32Array(2048);
    this.lastPeriod=128;
    this.nsdfFrameCount=0;
    this.nsdfInterval=8; // 8量子(128*8=1024サンプル)ごとに更新
    this.cachedPeriod=128;
    this.cachedConfidence=0;
    this.trigMixBuf=new Float32Array(4096);
    this.trigWritePos=0;
    this.lastTrigIdx=0;
    this.holdoffSamples=960; // ~20ms@48kHz
    this.lastTrigSampleTime=0; // 時間ベースholdoff
    this.totalSamplesProcessed=0;
    this.threshNorm=0.08;
    this.slope='rising';
    this.trigMode='nsdf';
    // v5: MessagePortフォールバック用Ping-Pongバッファ
    this.portPool=[];
    this.portBufSize=4096;
    this.portAccumL=null;
    this.portAccumR=null;
    this.portAccumPos=0;
    if(this.usePort){
      // 初期バッファはport経由で受け取る
      this.port.onmessage=(e)=>{
        if(e.data.type==='config'){
          this.threshNorm=e.data.threshNorm||0.08;
          this.slope=e.data.slope||'rising';
          this.trigMode=e.data.trigMode||'nsdf';
          this.holdoffSamples=e.data.holdoffSamples||960;
        }else if(e.data.type==='returnBuf'){
          // Ping-Pong: メインスレッドから空バッファが返却される
          this.portPool.push(e.data.buf);
        }
      };
    }
  }

  nsdfCompute(sig,n){
    const ds=2;
    const dsLen=Math.min(1024,(n/ds)|0);
    const nsdf=this.nsdfBuf;
    const sr=sampleRate||48000;
    const minLag=Math.max(2,Math.floor(sr/(8000*ds)));
    const maxLag=Math.min(dsLen>>1,Math.floor(sr/(20*ds)));
    for(let tau=minLag;tau<maxLag;tau++){
      let acf=0,m=0;
      const end=dsLen-tau;
      for(let i=0;i<end;i++){
        const si=sig[i*ds],sti=sig[(i+tau)*ds];
        acf+=si*sti;m+=si*si+sti*sti;
      }
      nsdf[tau]=m>1e-12?2*acf/m:0;
    }
    let bestLag=this.cachedPeriod/ds,bestVal=-1,inPos=false;
    for(let tau=minLag;tau<maxLag-1;tau++){
      if(nsdf[tau]>0)inPos=true;
      if(inPos&&nsdf[tau]>0.3&&nsdf[tau]>nsdf[tau-1]&&nsdf[tau]>=nsdf[tau+1]){
        const a=nsdf[tau-1],b=nsdf[tau],c=nsdf[tau+1];
        const denom=a-2*b+c;
        const delta=Math.abs(denom)>1e-12?0.5*(a-c)/denom:0;
        const rt=tau+Math.max(-1,Math.min(1,delta));
        const rv=b-0.25*(a-c)*delta;
        if(rv>bestVal){bestVal=rv;bestLag=rt;}
      }
      if(inPos&&nsdf[tau]<0)inPos=false;
    }
    this.cachedPeriod=bestLag*ds;
    this.cachedConfidence=bestVal;
    return this.cachedPeriod;
  }

  findTrigger(sig,n){
    const tm=this.trigMode;
    if(tm==='free')return 0;
    const slope=this.slope,thresh=this.threshNorm;
    if(tm==='peak'){
      let bi=0,bv=-1;
      for(let i=8;i<n-8;i++){const a=Math.abs(sig[i]);if(a>bv&&a>=thresh){bv=a;bi=i;}}
      return bi;
    }
    let period=this.lastPeriod;
    if(tm==='nsdf'){
      this.nsdfFrameCount++;
      if(this.nsdfFrameCount%this.nsdfInterval===0||this.cachedConfidence<0.3){
        period=this.nsdfCompute(sig,Math.min(n,4096));
      }else{
        period=this.cachedPeriod;
      }
      this.lastPeriod=period;
    }
    const scanCenter=n>>2;
    const scanRange=Math.max(period*2,256)|0;
    const scanStart=Math.max(8,scanCenter-scanRange);
    const scanEnd=Math.min(n-2,scanCenter+scanRange);
    let bestIdx=-1,bestScore=-1e9;
    for(let i=scanStart;i<scanEnd;i++){
      const p=sig[i-1],c=sig[i];
      let cond=false;
      if(tm==='zero'){
        const zr=p<=0&&c>0,zf=p>=0&&c<0;
        cond=slope==='rising'?zr:slope==='falling'?zf:(zr||zf);
      }else{
        const ri=p<thresh&&c>=thresh,fa=p>-thresh&&c<=-thresh;
        cond=slope==='rising'?ri:slope==='falling'?fa:(ri||fa);
      }
      if(!cond)continue;
      const nx=i+1<n?sig[i+1]:c;
      const edge=Math.abs(nx-p)+Math.abs(c)*0.5;
      let bonus=0;
      if(period>0&&this.lastTrigIdx>=0){
        const drift=Math.abs(i-(this.lastTrigIdx+Math.round(period)));
        bonus=2/(1+drift*0.05);
      }
      if(edge+bonus>bestScore){bestScore=edge+bonus;bestIdx=i;}
    }
    if(bestIdx<0)bestIdx=scanCenter;
    // v5: 時間ベースholdoff
    const sampleTimeBest=this.totalSamplesProcessed-(n-bestIdx);
    if(this.holdoffSamples>0&&(sampleTimeBest-this.lastTrigSampleTime)<this.holdoffSamples){
      bestIdx=this.lastTrigIdx;
    }else{
      this.lastTrigIdx=bestIdx;
      this.lastTrigSampleTime=sampleTimeBest;
    }
    return bestIdx;
  }

  process(inputs,outputs){
    const input=inputs[0];
    if(!input||!input.length)return true;
    const L=input[0],R=input[1]||input[0];
    const n=L.length;
    const output = outputs[0];
    if (output && output.length) {}
    this.totalSamplesProcessed+=n;

    if(this.sab){
      let w=Atomics.load(this.meta,0);
      for(let i=0;i<n;i++){
        const idx=w&this.mask;
        this.ringL[idx]=L[i];this.ringR[idx]=R[i];
        w++;
      }
      Atomics.store(this.meta,0,w);
      // Trigger用mixバッファに蓄積
      const tbLen=this.trigMixBuf.length;
      for(let i=0;i<n;i++){
        this.trigMixBuf[this.trigWritePos%tbLen]=0.5*(L[i]+R[i]);
        this.trigWritePos++;
      }
      // トリガー計算（十分なデータがあれば）
      if(this.trigWritePos>=2048){
        const avail=Math.min(tbLen,this.trigWritePos);
        const trigIdx=this.findTrigger(this.trigMixBuf,avail);
        // Store results into shared meta
        Atomics.store(this.meta,2,trigIdx);
        // Float値をInt32としてstore（ビット転送）
        const periodBits=new Float32Array([this.cachedPeriod]);
        const confBits=new Float32Array([this.cachedConfidence]);
        Atomics.store(this.meta,3,new Int32Array(periodBits.buffer)[0]);
        Atomics.store(this.meta,4,new Int32Array(confBits.buffer)[0]);
        this.trigWritePos=0;
      }
    }else if(this.usePort){
      // v5: Ping-Pong zero-alloc MessagePort
      if(!this.portAccumL){
        if(this.portPool.length>=2){
          this.portAccumL=new Float32Array(this.portPool.pop());
          this.portAccumR=new Float32Array(this.portPool.pop());
          this.portAccumPos=0;
        }else{
          return true; // まだバッファがない
        }
      }
      for(let i=0;i<n;i++){
        if(this.portAccumPos<this.portBufSize){
          this.portAccumL[this.portAccumPos]=L[i];
          this.portAccumR[this.portAccumPos]=R[i];
          this.portAccumPos++;
        }
      }
      if(this.portAccumPos>=this.portBufSize){
        const bufL=this.portAccumL.buffer;
        const bufR=this.portAccumR.buffer;
        this.port.postMessage({type:'audio',l:bufL,r:bufR},[bufL,bufR]);
        this.portAccumL=null;this.portAccumR=null;this.portAccumPos=0;
      }
    }
    return true;
  }
}
registerProcessor('ring-writer',RingWriter);
`;

  async function setupWorklet(ac) {
    if (S.workletReady) return true;
    if (typeof SharedArrayBuffer !== 'undefined') {
      try {
        const totalBytes = META_SIZE * 4 + RING_SIZE * 4 * 2;
        S.sab = new SharedArrayBuffer(totalBytes);
        S.metaI32 = new Int32Array(S.sab, 0, META_SIZE);
        S.ringL = new Float32Array(S.sab, META_SIZE * 4, RING_SIZE);
        S.ringR = new Float32Array(S.sab, META_SIZE * 4 + RING_SIZE * 4, RING_SIZE);
        S.useSAB = true;
      } catch (e) { S.useSAB = false }
    }
    try {
      // file://プロトコルではcreateObjectURLがblob:nullになりWorkletロード不可のため
      // base64エンコードしたdata: URLを使用する
      const b64 = btoa(unescape(encodeURIComponent(WORKLET_CODE)));
      const url = 'data:application/javascript;base64,' + b64;
      await ac.audioWorklet.addModule(url);
      S.workletReady = true;
      return true;
    } catch (e) {
      console.warn('AudioWorklet failed', e);
      S.useSAB = false;
      return false;
    }
  }

  /* ═══════════════════════════════════════════════════════════════
     AUDIO CONTEXT + SOURCE
     ═══════════════════════════════════════════════════════════════ */
  // v5: MessagePortフォールバック用リングバッファ（readポインタ方式）
  const portRingL = new Float32Array(RING_SIZE);
  const portRingR = new Float32Array(RING_SIZE);
  let portRingW = 0;

  async function ensureAC() {
    if (S.ac) return S.ac;
    const ac = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
    S.ac = ac;
    await setupWorklet(ac);
    S.inputGain = ac.createGain(); S.inputGain.gain.value = 1;
    S.monitorGain = ac.createGain(); S.monitorGain.gain.value = 1;

    if (S.workletReady) {
      const workletNode = new AudioWorkletNode(ac, 'ring-writer', {
        numberOfInputs: 1, numberOfOutputs: 1,
        channelCount: 2, channelCountMode: 'explicit',
        processorOptions: S.useSAB ? { sab: S.sab, ringSize: RING_SIZE } : { ringSize: RING_SIZE }
      });
      S.workletNode = workletNode;
      S.inputGain.connect(workletNode);
      workletNode.connect(S.monitorGain);
      S.monitorGain.connect(ac.destination);

      if (!S.useSAB) {
        // v5: Ping-Pongバッファプール初期化（6個=3ペア）
        const POOL_SIZE = 6;
        for (let i = 0; i < POOL_SIZE; i++) {
          const buf = new ArrayBuffer(MAX_POINTS * 4);
          workletNode.port.postMessage({ type: 'returnBuf', buf }, [buf]);
        }
        workletNode.port.onmessage = (e) => {
          if (e.data.type === 'audio') {
            const l = new Float32Array(e.data.l);
            const r = new Float32Array(e.data.r);
            const n = l.length;
            for (let i = 0; i < n; i++) {
              portRingL[portRingW & RING_MASK] = l[i];
              portRingR[portRingW & RING_MASK] = r[i];
              portRingW++;
            }
            // バッファを返却（ゼロアロケーション循環）
            workletNode.port.postMessage({ type: 'returnBuf', buf: e.data.l }, [e.data.l]);
            workletNode.port.postMessage({ type: 'returnBuf', buf: e.data.r }, [e.data.r]);
          }
        };
      }

      // v5: トリガーパラメータをWorkletに送信
      sendTrigConfig();
    } else {
      S.splitter = ac.createChannelSplitter(2);
      S.analyserL = ac.createAnalyser(); S.analyserR = ac.createAnalyser();
      S.analyserL.fftSize = 4096; S.analyserR.fftSize = 4096; // v5: 8192→4096
      S.analyserL.smoothingTimeConstant = 0; S.analyserR.smoothingTimeConstant = 0;
      S.inputGain.connect(S.splitter);
      S.splitter.connect(S.analyserL, 0); S.splitter.connect(S.analyserR, 1);
      S.inputGain.connect(S.monitorGain);
      S.monitorGain.connect(ac.destination);
      S._fbL = new Float32Array(4096); S._fbR = new Float32Array(4096);
    }
    return ac;
  }

  function sendTrigConfig() {
    if (!S.workletNode) return;
    const sr = S.ac ? S.ac.sampleRate : 48000;
    S.workletNode.port.postMessage({
      type: 'config',
      threshNorm: S.threshNorm,
      slope: S.slope,
      trigMode: S.trigMode,
      holdoffSamples: Math.floor(S.holdoffMs / 1000 * sr)
    });
  }

  function disconnectSrc() {
    if (S.sourceNode) { try { S.sourceNode.disconnect() } catch (e) { } }
    S.sourceNode = null;
    if (S.sourceStream) { S.sourceStream.getTracks().forEach(t => t.stop()); S.sourceStream = null }
    if (S.fileUrl) { URL.revokeObjectURL(S.fileUrl); S.fileUrl = null }
    S.sourceType = 'none'; audioEl.pause(); audioEl.src = '';
    if (S.monitorGain) S.monitorGain.gain.value = 1;
    domCache.btnPlay.disabled = true; domCache.btnStop.disabled = true; domCache.btnTp.disabled = true;
    domCache.seekbar.disabled = true;
  }

  function connectToInput(node) { try { node.disconnect() } catch (e) { } node.connect(S.inputGain) }

  async function loadFile(file) {
    disconnectSrc(); await ensureAC(); await S.ac.resume();
    // file://プロトコルではcreateObjectURLがblob:nullになるため
    // FileReaderでdata URLとして読み込む
    const dataUrl = await new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = e => resolve(e.target.result);
      fr.onerror = reject;
      fr.readAsDataURL(file);
    });
    audioEl.src = dataUrl; audioEl.load();
    if (!S.mediaElSrc) S.mediaElSrc = S.ac.createMediaElementSource(audioEl);
    S.sourceNode = S.mediaElSrc; connectToInput(S.mediaElSrc);
    S.sourceType = 'file';
    if (S.monitorGain) S.monitorGain.gain.value = 1;
    domCache.btnPlay.disabled = false; domCache.btnStop.disabled = false; domCache.btnTp.disabled = false;
    domCache.seekbar.disabled = false;
  }

  async function startMic() {
    disconnectSrc(); await ensureAC(); await S.ac.resume();
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: { ideal: 2 } } });
    S.sourceStream = stream; const src = S.ac.createMediaStreamSource(stream);
    S.sourceNode = src; connectToInput(src); S.sourceType = 'mic';
    if (S.monitorGain) S.monitorGain.gain.value = 0;
  }

  async function startSystem() {
    disconnectSrc(); await ensureAC(); await S.ac.resume();
    let stream;
    try {
      // video:trueはブラウザが音声共有UIを表示するために必要
      stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    } catch (e) { console.warn('getDisplayMedia failed', e); return }
    if (!stream.getAudioTracks().length) { stream.getTracks().forEach(t => t.stop()); alert('音声共有をONにしてください'); return }
    // 映像トラックは不要なので即停止（デコード負荷削減）
    stream.getVideoTracks().forEach(t => t.stop());
    S.sourceStream = stream; const src = S.ac.createMediaStreamSource(stream);
    S.sourceNode = src; connectToInput(src); S.sourceType = 'system';
    // システム音声はモニター出力をミュート（原音との二重再生でフランジャーが発生するため）
    if (S.monitorGain) S.monitorGain.gain.value = 0;
    const at = stream.getAudioTracks()[0];
    if (at) at.onended = () => { if (S.sourceType === 'system') disconnectSrc() };
  }

  /* ═══════════════════════════════════════════════════════════════
     RING BUFFER READ — v5: readポインタ方式（portRingAvailリセット問題解消）
     ═══════════════════════════════════════════════════════════════ */
  let lastReadPos = 0; // v5: 前回読んだ位置を保持

  function readRing(outL, outR, count) {
    if (S.useSAB) {
      const w = Atomics.load(S.metaI32, 0);
      const totalWritten = w;
      const available = totalWritten - lastReadPos;
      if (available < 64) { outL.fill(0, 0, count); outR.fill(0, 0, count); return 0 }
      const n = Math.min(count, available, RING_SIZE);
      const start = (w - n) & RING_MASK;
      for (let i = 0; i < n; i++) {
        const idx = (start + i) & RING_MASK;
        outL[i] = S.ringL[idx]; outR[i] = S.ringR[idx];
      }
      lastReadPos = w;
      return n;
    } else if (S.workletReady && !S.useSAB) {
      // v5: readポインタ方式（リセット不要）
      const available = portRingW - lastReadPos;
      if (available < 64) { outL.fill(0, 0, count); outR.fill(0, 0, count); return 0 }
      const n = Math.min(count, available, RING_SIZE);
      const start = (portRingW - n) & RING_MASK;
      for (let i = 0; i < n; i++) {
        const idx = (start + i) & RING_MASK;
        outL[i] = portRingL[idx]; outR[i] = portRingR[idx];
      }
      lastReadPos = portRingW;
      return n;
    } else if (S.analyserL) {
      S.analyserL.getFloatTimeDomainData(S._fbL);
      S.analyserR.getFloatTimeDomainData(S._fbR);
      const n = Math.min(count, S._fbL.length);
      outL.set(S._fbL.subarray(0, n)); outR.set(S._fbR.subarray(0, n));
      let silL = true, silR = true;
      for (let i = 0; i < n; i += 16) { if (Math.abs(outL[i]) > 1e-6) silL = false; if (Math.abs(outR[i]) > 1e-6) silR = false; if (!silL && !silR) break }
      if (silR && !silL) outR.set(outL.subarray(0, n));
      if (silL && !silR) outL.set(outR.subarray(0, n));
      return n;
    }
    return 0;
  }

  /* ═══════════════════════════════════════════════════════════════
     CHANNEL MIX + DC REMOVAL — v5: 状態引数で分離
     ═══════════════════════════════════════════════════════════════ */
  function mixChannels(out, l, r, mode, n) {
    switch (mode) {
      case 'left': for (let i = 0; i < n; i++)out[i] = l[i]; break;
      case 'right': for (let i = 0; i < n; i++)out[i] = r[i]; break;
      case 'mid': for (let i = 0; i < n; i++)out[i] = .5 * (l[i] + r[i]); break;
      case 'side': for (let i = 0; i < n; i++)out[i] = .5 * (l[i] - r[i]); break;
      default: for (let i = 0; i < n; i++)out[i] = .5 * (l[i] + r[i]);
    }
  }

  // v5: DC除去を独立関数化、状態は外部から渡す
  function removeDC(buf, n, stateKey) {
    const sr = S.ac ? S.ac.sampleRate : 48000;
    const fc = 5;
    const alpha = 1 - (2 * Math.PI * fc / sr);
    let prevX = S[stateKey + 'X'], prevY = S[stateKey + 'Y'];
    for (let i = 0; i < n; i++) {
      const x = buf[i];
      prevY = alpha * (prevY + x - prevX);
      prevX = x; buf[i] = prevY;
    }
    S[stateKey + 'X'] = prevX; S[stateKey + 'Y'] = prevY;
  }

  /* ═══════════════════════════════════════════════════════════════
     v5: トリガー結果読み取り（SAB経由でWorkletから受け取る）
     ═══════════════════════════════════════════════════════════════ */
  function readTriggerFromWorklet() {
    if (!S.useSAB) return;
    S.lastTrigIdx = Atomics.load(S.metaI32, 2);
    // Float値をビット転送で復元
    const periodI32 = Atomics.load(S.metaI32, 3);
    const confI32 = Atomics.load(S.metaI32, 4);
    const tmpI = new Int32Array([periodI32]);
    const tmpF = new Float32Array(tmpI.buffer);
    S.lastPeriod = tmpF[0] || 128;
    tmpI[0] = confI32;
    // confidence は現状stats表示用のみ
  }

  /* ═══════════════════════════════════════════════════════════════
     v5: メインスレッド用簡易トリガー（non-SAB環境フォールバック）
     ═══════════════════════════════════════════════════════════════ */
  function findTriggerFallback(sig, n) {
    if (S.trigMode === 'free') return 0;
    const slope = S.slope, thresh = S.threshNorm;
    if (S.trigMode === 'peak') {
      let bi = 0, bv = -1;
      for (let i = 8; i < n - 8; i++) { const a = Math.abs(sig[i]); if (a > bv && a >= thresh) { bv = a; bi = i } }
      return bi;
    }
    // 簡易ゼロクロストリガー（NSDF無し — Workletが担当するため）
    const scanCenter = n >> 2;
    const scanRange = Math.min(512, n >> 1);
    const scanStart = Math.max(1, scanCenter - scanRange);
    const scanEnd = Math.min(n - 2, scanCenter + scanRange);
    for (let i = scanStart; i < scanEnd; i++) {
      const p = sig[i - 1], c = sig[i];
      if (slope === 'rising' && p <= 0 && c > 0) return i;
      if (slope === 'falling' && p >= 0 && c < 0) return i;
      if (slope === 'both' && ((p <= 0 && c > 0) || (p >= 0 && c < 0))) return i;
    }
    return scanCenter;
  }

  /* ═══════════════════════════════════════════════════════════════
     SMOOTHING
     ═══════════════════════════════════════════════════════════════ */
  function smoothZeroPhase(src, dst, prev, n, amt) {
    if (amt < .005) { for (let i = 0; i < n; i++) { dst[i] = src[i]; prev[i] = src[i] } return }
    const b = 1 - clamp(amt, .005, .95);
    let v = prev[0] + (src[0] - prev[0]) * b;
    dst[0] = v;
    for (let i = 1; i < n; i++) { v += (src[i] - v) * b; dst[i] = v }
    v = dst[n - 1];
    for (let i = n - 2; i >= 0; i--) { v += (dst[i] - v) * b; dst[i] = v }
    for (let i = 0; i < n; i++)prev[i] = dst[i];
  }

  /* ═══════════════════════════════════════════════════════════════
     CATMULL-ROM + MIN/MAX ENVELOPE
     ═══════════════════════════════════════════════════════════════ */
  function catmull(buf, pos, len) {
    const i = pos | 0, f = pos - i;
    if (f < 1e-9) return (i >= 0 && i < len) ? buf[i] : 0;
    const i0 = Math.max(i - 1, 0), i1 = Math.min(i, len - 1), i2 = Math.min(i + 1, len - 1), i3 = Math.min(i + 2, len - 1);
    const v0 = buf[i0], v1 = buf[i1], v2 = buf[i2], v3 = buf[i3];
    return (((-.5 * v0 + 1.5 * v1 - 1.5 * v2 + .5 * v3) * f + (v0 - 2.5 * v1 + 2 * v2 - .5 * v3)) * f + (-.5 * v0 + .5 * v2)) * f + v1;
  }

  function resampleCR(src, srcStart, srcCount, dst, dstCount, srcLen) {
    if (srcCount <= 1) { dst.fill(src[srcStart] || 0, 0, dstCount); return }
    const scale = (srcCount - 1) / Math.max(1, dstCount - 1);
    for (let i = 0; i < dstCount; i++)dst[i] = catmull(src, srcStart + i * scale, srcLen);
  }

  // v5: min/max envelope — ズームアウト時にピーク保存
  function resampleMinMax(src, srcStart, srcCount, dstMin, dstMax, dstCount) {
    if (srcCount <= dstCount) {
      // サンプル密度≦表示密度→通常補間
      const scale = (srcCount - 1) / Math.max(1, dstCount - 1);
      for (let i = 0; i < dstCount; i++) {
        const idx = srcStart + ((i * scale) | 0);
        const v = idx < src.length ? src[idx] : 0;
        dstMin[i] = v; dstMax[i] = v;
      }
      return false; // envelopeモードではない
    }
    const ratio = srcCount / dstCount;
    for (let i = 0; i < dstCount; i++) {
      const bs = srcStart + ((i * ratio) | 0);
      const be = Math.min(srcStart + (((i + 1) * ratio + 1) | 0), srcStart + srcCount, src.length);
      let mn = 1e9, mx = -1e9;
      for (let j = bs; j < be; j++) { const v = src[j]; if (v < mn) mn = v; if (v > mx) mx = v; }
      if (mn > mx) { mn = 0; mx = 0; }
      dstMin[i] = mn; dstMax[i] = mx;
    }
    return true; // envelopeモードを使用
  }

  function rms(buf, n) { let s = 0; for (let i = 0; i < n; i++)s += buf[i] * buf[i]; return Math.sqrt(s / n) }

  /* ═══════════════════════════════════════════════════════════════
     ADAPTIVE QUALITY — v5: FPS監視による動的品質制御
     ═══════════════════════════════════════════════════════════════ */
  function updateAdaptive(dt) {
    S.fpsHistory[S.fpsHistIdx % 30] = dt;
    S.fpsHistIdx++;
    if (S.fpsHistIdx < 30) return;
    // 最近30フレームの平均dt
    let sum = 0;
    for (let i = 0; i < 30; i++)sum += S.fpsHistory[i];
    const avgDt = sum / 30;
    const avgFps = 1000 / avgDt;
    const targetFps = S.targetFrameMs > 0 ? 1000 / S.targetFrameMs : 60;
    if (avgFps < targetFps * 0.7 && S.adaptiveLevel < 3) {
      S.adaptiveLevel++;
      resize(); // DPRが変わる場合
    } else if (avgFps > targetFps * 0.95 && S.adaptiveLevel > 0) {
      S.adaptiveLevel--;
      resize();
    }
  }

  /* ═══════════════════════════════════════════════════════════════
     RENDER
     ═══════════════════════════════════════════════════════════════ */
  let frameCount = 0, fpsTimer = 0, measuredFps = 0;

  function render(now) {
    S.rafId = requestAnimationFrame(render);
    if (S.targetFrameMs > 0 && now - S.lastTs < S.targetFrameMs - .5) return;
    const dt = S.lastTs ? now - S.lastTs : 16.67;
    S.lastTs = now;

    frameCount++;
    if (now - fpsTimer >= 500) { measuredFps = (frameCount / ((now - fpsTimer) / 1000)) | 0; frameCount = 0; fpsTimer = now }

    // v5: 動的品質制御
    updateAdaptive(dt);

    const readCount = 4096;
    let got = readRing(S.workL, S.workR, readCount);
    // データ不足時はデモ波形を表示（音源なしでも真っ暗にならないように）
    if (got < 64) {
      const t = now / 1000;
      const n = 512;
      for (let i = 0; i < n; i++) {
        const ph = t * 2 + i / n * Math.PI * 8;
        const v = Math.sin(ph) * 0.35 + Math.sin(ph * 2.003) * 0.15 + Math.sin(ph * 3.007) * 0.05;
        S.workL[i] = v; S.workR[i] = v * (0.9 + Math.sin(ph * 0.5) * 0.1);
      }
      got = n;
    }

    // v5: Workletからトリガー結果を読む（SAB時）
    if (S.useSAB) {
      readTriggerFromWorklet();
    }

    // v5: トリガー用mix（専用バッファ+専用DC状態）
    mixChannels(S.mixBufTrig, S.workL, S.workR, S.channel, got);
    removeDC(S.mixBufTrig, got, 'dcTrigPrev');

    // トリガー位置決定
    let trigPos;
    if (S.useSAB) {
      trigPos = S.lastTrigIdx;
    } else {
      trigPos = findTriggerFallback(S.mixBufTrig, got);
      S.lastTrigIdx = trigPos;
    }

    // v5: 表示点数を動的品質制御と連動
    const baseVisSamples = Math.max(64, Math.min(MAX_POINTS, (2048 / S.zoom) | 0));
    const visSamples = S.adaptiveLevel >= 2 ? Math.max(64, baseVisSamples >> 1) : baseVisSamples;

    const trigInt = trigPos | 0;
    let start = Math.max(0, trigInt - Math.floor(visSamples * .15));
    start = Math.min(start, Math.max(0, got - visSamples - 2));
    const srcCount = Math.min(visSamples + 2, got - start);

    // v5: min/max envelope判定
    const useEnvL = resampleMinMax(S.workL, start, srcCount, S.envMin, S.envMax, visSamples);
    const useEnvR = resampleMinMax(S.workR, start, srcCount, S.envMinR, S.envMaxR, visSamples);

    if (!useEnvL) {
      resampleCR(S.workL, start, srcCount, S.dispL, visSamples, got);
    }
    if (!useEnvR) {
      resampleCR(S.workR, start, srcCount, S.dispR, visSamples, got);
    }

    // スムージング（非envelope時のみ）
    if (!useEnvL) smoothZeroPhase(S.dispL, S.smoothL, S.prevL, visSamples, S.smooth);
    else for (let i = 0; i < visSamples; i++)S.smoothL[i] = S.envMin[i]; // envelope時はmin使用
    if (!useEnvR) smoothZeroPhase(S.dispR, S.smoothR, S.prevR, visSamples, S.smooth);
    else for (let i = 0; i < visSamples; i++)S.smoothR[i] = S.envMinR[i];

    // v5: 表示用mix（専用バッファ+専用DC状態）
    mixChannels(S.mixBufDisp, S.smoothL, S.smoothR, S.channel, visSamples);
    removeDC(S.mixBufDisp, visSamples, 'dcDispPrev');

    const amp = rms(S.mixBufDisp, visSamples);
    S.lastAmp = amp;

    // ── WebGL Render ──
    const W = S.W, H = S.H;
    const persist = S.persist;
    const gain = S.gain;
    const thick = S.thick * S.currentDpr;

    // 1) Persistence decay (FBO ping-pong)
    const srcFbo = fboCur, dstFbo = 1 - fboCur;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbos[dstFbo]);
    gl.viewport(0, 0, W, H);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(progPersist);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, fboTexs[srcFbo]);
    gl.uniform1i(uPersist.tex, 0); gl.uniform1f(uPersist.decay, persist);
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.bindVertexArray(vaoQuad); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // 2) Draw waveforms — v5: GPU完結（Data Texture + gl_VertexID）

    const mode = S.mode;
    const useGrad = S.colorMode === 'gradient';
    let col = S.colorsSolid[S.colorMode] || S.colorsSolid.cyan;

    // v5: envelope時はmin/maxの両方をGPUに送って2本描画
    function prepareAndUpload(samples, nPts, gpuBuf, tex, gainMul) {
      for (let i = 0; i < nPts; i++)gpuBuf[i] = samples[i] * gainMul;
      uploadDataTex(tex, gpuBuf, nPts);
    }

    function drawPolyline(tex, nPts, color, offX, scX, offY, scY, thickness, isGrad) {
      const vertCount = nPts * 2;
      if (isGrad) {
        gl.useProgram(progGrad);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.uniform1i(uGrad.u_dataTex, 0);
        gl.uniform1i(uGrad.u_numPoints, nPts);
        gl.uniform2f(uGrad.u_res, W, H);
        gl.uniform1f(uGrad.u_thickness, thickness);
        gl.uniform1f(uGrad.u_offsetX, offX); gl.uniform1f(uGrad.u_scaleX, scX);
        gl.uniform1f(uGrad.u_offsetY, offY); gl.uniform1f(uGrad.u_scaleY, scY);
        gl.uniform4fv(uGrad.u_colorA, S.colorsGrad[0]);
        gl.uniform4fv(uGrad.u_colorB, S.colorsGrad[1]);
        gl.uniform4fv(uGrad.u_colorC, S.colorsGrad[2]);
        gl.uniform4fv(uGrad.u_colorD, S.colorsGrad[3]);
      } else {
        gl.useProgram(progSolid);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.uniform1i(uSolid.u_dataTex, 0);
        gl.uniform1i(uSolid.u_numPoints, nPts);
        gl.uniform2f(uSolid.u_res, W, H);
        gl.uniform1f(uSolid.u_thickness, thickness);
        gl.uniform4fv(uSolid.u_color, color);
        gl.uniform1f(uSolid.u_offsetX, offX); gl.uniform1f(uSolid.u_scaleX, scX);
        gl.uniform1f(uSolid.u_offsetY, offY); gl.uniform1f(uSolid.u_scaleY, scY);
      }
      gl.bindVertexArray(vaoEmpty);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, vertCount);
    }

    function drawLissajous(texL, texR, nPts, color, scY, thickness, isGrad) {
      const vertCount = nPts * 2;
      if (isGrad) {
        gl.useProgram(progLissGrad);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, texL);
        gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, texR);
        gl.uniform1i(uLissGrad.u_dataTexL, 0); gl.uniform1i(uLissGrad.u_dataTexR, 1);
        gl.uniform1i(uLissGrad.u_numPoints, nPts);
        gl.uniform2f(uLissGrad.u_res, W, H);
        gl.uniform1f(uLissGrad.u_thickness, thickness);
        gl.uniform1f(uLissGrad.u_scaleY, scY);
        gl.uniform4fv(uLissGrad.u_colorA, S.colorsGrad[0]);
        gl.uniform4fv(uLissGrad.u_colorB, S.colorsGrad[1]);
        gl.uniform4fv(uLissGrad.u_colorC, S.colorsGrad[2]);
        gl.uniform4fv(uLissGrad.u_colorD, S.colorsGrad[3]);
      } else {
        gl.useProgram(progLiss);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, texL);
        gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, texR);
        gl.uniform1i(uLiss.u_dataTexL, 0); gl.uniform1i(uLiss.u_dataTexR, 1);
        gl.uniform1i(uLiss.u_numPoints, nPts);
        gl.uniform2f(uLiss.u_res, W, H);
        gl.uniform1f(uLiss.u_thickness, thickness);
        gl.uniform1f(uLiss.u_scaleY, scY);
        gl.uniform4fv(uLiss.u_color, color);
      }
      gl.bindVertexArray(vaoEmpty);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, vertCount);
    }

    const glowEnabled = S.glowOn && S.adaptiveLevel < 1;

    if (mode === 'time' || mode === 'mirror') {
      // メインライン
      prepareAndUpload(S.mixBufDisp, visSamples, S.gpuBuf1, dataTex1, gain);
      if (glowEnabled) {
        drawPolyline(dataTex1, visSamples, [col[0], col[1], col[2], 0.15], 0, 1, 0, .7, thick * 3, false);
      }
      drawPolyline(dataTex1, visSamples, useGrad ? null : col, 0, 1, 0, .7, thick, useGrad);

      // v5: envelope時は max も描画（半透明で範囲を表示）
      if (useEnvL) {
        mixChannels(S.mixBufDisp, S.envMax, S.envMaxR, S.channel, visSamples);
        prepareAndUpload(S.mixBufDisp, visSamples, S.gpuBuf1, dataTex1, gain);
        drawPolyline(dataTex1, visSamples, [col[0], col[1], col[2], 0.3], 0, 1, 0, .7, Math.max(1, thick * 0.5), false);
      }

      if (mode === 'mirror') {
        prepareAndUpload(S.mixBufDisp, visSamples, S.gpuBuf1, dataTex1, gain);
        drawPolyline(dataTex1, visSamples, [col[0], col[1], col[2], 0.4], 0, 1, 0, -.7, thick, false);
      }
    } else if (mode === 'dual') {
      prepareAndUpload(S.smoothL, visSamples, S.gpuBuf1, dataTex1, gain);
      prepareAndUpload(S.smoothR, visSamples, S.gpuBuf2, dataTex2, gain);
      if (glowEnabled) {
        drawPolyline(dataTex1, visSamples, [.33, .84, 1, .12], 0, 1, .35, .3, thick * 3, false);
        drawPolyline(dataTex2, visSamples, [.69, .55, 1, .12], 0, 1, -.35, .3, thick * 3, false);
      }
      drawPolyline(dataTex1, visSamples, [.33, .84, 1, 1], 0, 1, .35, .3, thick, false);
      drawPolyline(dataTex2, visSamples, [.69, .55, 1, 1], 0, 1, -.35, .3, thick, false);
    } else if (mode === 'lissajous') {
      prepareAndUpload(S.smoothL, visSamples, S.gpuBuf1, dataTex1, gain);
      prepareAndUpload(S.smoothR, visSamples, S.gpuBuf2, dataTex2, gain);
      if (glowEnabled) {
        drawLissajous(dataTex1, dataTex2, visSamples, [.33, .84, 1, .1], .7, thick * 3, false);
      }
      drawLissajous(dataTex1, dataTex2, visSamples, useGrad ? null : [.33, .88, 1, 1], .7, thick, useGrad);
    }

    gl.disable(gl.BLEND);

    // 3) Composite to screen
    fboCur = dstFbo;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, W, H);
    gl.clearColor(.02, .027, .043, 1); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(progPersist);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, fboTexs[dstFbo]);
    gl.uniform1i(uPersist.tex, 0); gl.uniform1f(uPersist.decay, 1.0);
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.bindVertexArray(vaoQuad); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    gl.useProgram(progGrid);
    gl.uniform2f(uGrid.u_res, W, H);
    gl.uniform1f(uGrid.u_showGrid, S.gridOn ? 1 : 0);
    gl.bindVertexArray(vaoGrid); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.disable(gl.BLEND);

    // 4) Overlay + Stats (throttled)
    if (now - S.statsTimer > 500) {
      S.statsTimer = now;
      updateOverlay(visSamples);
      updateStats(dt);
      updateTransport();
    }
  }

  function updateOverlay(n) {
    const W = S.W, H = S.H;
    overCtx.clearRect(0, 0, W, H);
    if (!S.statsOn) return;
    overCtx.save();
    overCtx.fillStyle = 'rgba(6,10,18,0.45)';
    overCtx.beginPath(); overCtx.roundRect(6, 6, 200, 36, 6); overCtx.fill();
    overCtx.fillStyle = '#dce7ff';
    overCtx.font = `${Math.max(9, 10 * S.currentDpr)}px ui-monospace,monospace`;
    overCtx.fillText(`${S.mode.toUpperCase()} ${S.channel.toUpperCase()} Trig:${S.trigMode.toUpperCase()} Z:${S.zoom.toFixed(1)}x`, 12, 22);
    overCtx.fillText(`Sm:${(S.smooth * 100) | 0}% P:${(S.persist * 100) | 0}% G:${(S.gain * 100) | 0}% Q:${S.adaptiveLevel}`, 12, 36);
    overCtx.restore();
  }

  // v5: Dirty Check付きDOM更新
  function setTextIfChanged(el, key, val) {
    if (domPrev[key] !== val) { domPrev[key] = val; el.textContent = val }
  }

  function updateStats(dt) {
    setTextIfChanged(domCache.stFps, 'stFps', measuredFps + 'fps');
    setTextIfChanged(domCache.stLat, 'stLat', dt.toFixed(1) + 'ms');
    setTextIfChanged(domCache.stTrig, 'stTrig', 'T:' + (S.lastTrigIdx | 0));
    setTextIfChanged(domCache.stAmp, 'stAmp', 'A:' + (S.lastAmp * 100).toFixed(0) + '%');
    const mode = S.useSAB ? 'SAB' : S.workletReady ? 'WL+MP' : 'AN';
    setTextIfChanged(domCache.stSrc, 'stSrc', S.sourceType + ' [' + mode + ']');
  }

  function updateTransport() {
    if (S.sourceType !== 'file') return;
    const c = audioEl.currentTime || 0, d = audioEl.duration || 0;
    if (d && isFinite(d)) {
      const sv = c / d;
      if (Math.abs(domPrev.seekbar - sv) > 0.0002) { domPrev.seekbar = sv; domCache.seekbar.value = sv }
      const ts = fmtTime(c) + '/' + fmtTime(d);
      setTextIfChanged(domCache.timeDsp, 'timeDsp', ts);
    }
  }

  /* ═══════════════════════════════════════════════════════════════
     UI BINDINGS — 完全版
     ═══════════════════════════════════════════════════════════════ */
  function bind() {
    // v5: ハンバーガーメニュー
    domCache.menuToggle.onclick = () => {
      domCache.topBar.classList.toggle('expanded');
      domCache.topBar.classList.toggle('collapsed');
    };

    $('btn-audio').onclick = async () => { await ensureAC(); await S.ac.resume() };
    $('btn-file').onclick = () => $('file-input').click();
    $('file-input').onchange = e => { const f = e.target.files?.[0]; if (f) loadFile(f) };
    $('btn-mic').onclick = () => startMic().catch(e => console.warn(e));
    $('btn-sys').onclick = () => startSystem().catch(e => console.warn(e));

    const playToggle = () => {
      if (audioEl.paused) {
        ensureAC().then(() => { S.ac.resume(); audioEl.play() });
        domCache.btnPlay.textContent = '⏸'; domCache.btnTp.textContent = '⏸';
      } else {
        audioEl.pause();
        domCache.btnPlay.textContent = '▶'; domCache.btnTp.textContent = '▶';
      }
    };
    const stopFn = () => { audioEl.pause(); try { audioEl.currentTime = 0 } catch (e) { } domCache.btnPlay.textContent = '▶'; domCache.btnTp.textContent = '▶' };
    domCache.btnPlay.onclick = playToggle;
    domCache.btnStop.onclick = stopFn;
    domCache.btnTp.onclick = playToggle;
    domCache.seekbar.oninput = () => { if (audioEl.duration && isFinite(audioEl.duration)) audioEl.currentTime = domCache.seekbar.value * audioEl.duration };

    $('sel-fps').onchange = () => { const v = +$('sel-fps').value; S.targetFrameMs = v > 0 ? 1000 / v : 0 };
    $('sel-mode').onchange = () => { S.mode = $('sel-mode').value };
    $('sel-ch').onchange = () => { S.channel = $('sel-ch').value };
    $('sel-trig').onchange = () => { S.trigMode = $('sel-trig').value; sendTrigConfig() };
    $('sel-slope').onchange = () => { S.slope = $('sel-slope').value; sendTrigConfig() };
    $('rng-thresh').oninput = () => { S.threshNorm = +$('rng-thresh').value / 100; sendTrigConfig() };
    $('rng-holdoff').oninput = () => { S.holdoffMs = +$('rng-holdoff').value; sendTrigConfig() };
    $('rng-zoom').oninput = () => { S.zoom = +$('rng-zoom').value };
    $('rng-gain').oninput = () => { S.gain = +$('rng-gain').value / 100 };
    $('rng-smooth').oninput = () => { S.smooth = +$('rng-smooth').value / 100 };
    $('rng-persist').oninput = () => { S.persist = +$('rng-persist').value / 100 };
    $('rng-thick').oninput = () => { S.thick = +$('rng-thick').value };
    $('sel-color').onchange = () => { S.colorMode = $('sel-color').value };

    const tog = (id, key) => { $(id).onclick = () => { S[key] = !S[key]; $(id).classList.toggle('on', S[key]) } };
    tog('btn-grid', 'gridOn');
    tog('btn-glow', 'glowOn');
    $('btn-stats').onclick = () => {
      S.statsOn = !S.statsOn;
      $('btn-stats').classList.toggle('on', S.statsOn);
      domCache.statsBar.style.display = S.statsOn ? 'flex' : 'none';
      if (!S.statsOn) overCtx.clearRect(0, 0, S.W, S.H);
    };
    $('btn-fs').onclick = () => { document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen().catch(() => { }) };
    $('btn-reset').onclick = resetDefaults;

    domCache.mainEl.addEventListener('wheel', e => { e.preventDefault(); S.zoom = clamp(S.zoom + (e.deltaY > 0 ? -.5 : .5), 1, 16); $('rng-zoom').value = S.zoom }, { passive: false });

    // v5: タッチジェスチャー（ピンチでZoom）
    let touchDist = 0;
    domCache.mainEl.addEventListener('touchstart', e => {
      if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        touchDist = Math.sqrt(dx * dx + dy * dy);
      }
    }, { passive: true });
    domCache.mainEl.addEventListener('touchmove', e => {
      if (e.touches.length === 2) {
        e.preventDefault();
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const newDist = Math.sqrt(dx * dx + dy * dy);
        if (touchDist > 0) {
          const ratio = newDist / touchDist;
          S.zoom = clamp(S.zoom * ratio, 1, 16);
          $('rng-zoom').value = S.zoom;
        }
        touchDist = newDist;
      }
    }, { passive: false });
    domCache.mainEl.addEventListener('touchend', () => { touchDist = 0 }, { passive: true });

    // Drag & Drop
    document.addEventListener('dragover', e => { e.preventDefault(); domCache.dropOverlay.style.display = 'flex' });
    document.addEventListener('dragleave', e => { if (!e.relatedTarget) domCache.dropOverlay.style.display = 'none' });
    document.addEventListener('drop', e => { e.preventDefault(); domCache.dropOverlay.style.display = 'none'; const f = e.dataTransfer.files[0]; if (f) loadFile(f) });

    // Keyboard
    document.addEventListener('keydown', e => { if (e.code === 'Space' && S.sourceType === 'file') { e.preventDefault(); playToggle() } });

    // Resize
    window.addEventListener('resize', resize, { passive: true });
    window.addEventListener('orientationchange', resize, { passive: true });
    if ('ResizeObserver' in window) new ResizeObserver(resize).observe(domCache.mainEl);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) S.lastTs = 0 });
  }

  function resetDefaults() {
    const defs = { mode: 'time', channel: 'mix', trigMode: 'nsdf', slope: 'rising', threshNorm: .08, holdoffMs: 20, zoom: 1, gain: 1, smooth: .15, persist: .85, thick: 1.5, colorMode: 'gradient', gridOn: true, glowOn: true, statsOn: true, targetFrameMs: 0, adaptiveLevel: 0 };
    Object.assign(S, defs);
    S.dcTrigPrevX = 0; S.dcTrigPrevY = 0; S.dcDispPrevX = 0; S.dcDispPrevY = 0;
    $('sel-fps').value = '0'; $('sel-mode').value = 'time'; $('sel-ch').value = 'mix'; $('sel-trig').value = 'nsdf';
    $('sel-slope').value = 'rising'; $('rng-thresh').value = 8; $('rng-holdoff').value = 20; $('rng-zoom').value = 1;
    $('rng-gain').value = 100; $('rng-smooth').value = 15; $('rng-persist').value = 85; $('rng-thick').value = 1.5;
    $('sel-color').value = 'gradient';
    for (const id of ['btn-grid', 'btn-glow', 'btn-stats']) $(id).classList.add('on');
    domCache.statsBar.style.display = 'flex';
    sendTrigConfig();
    resize();
  }

  /* ═══════════════════════════════════════════════════════════════
     BOOT
     ═══════════════════════════════════════════════════════════════ */
  bind();
  resize();
  S.lastTs = performance.now();
  fpsTimer = S.lastTs;
  requestAnimationFrame(render);
})();