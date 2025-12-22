let audioFile;
let fft;
let amplitude;
let isPlaying = false;

// 呼吸するエネルギー体のパラメータ
let particles = [];
let energyField = [];
let prevLevels = [];
let breathPhase = 0;
let globalEnergy = 0;
let energyHistory = [];

// Kick/Snare用のアタック検出
let kickEnergy = 0;
let snareEnergy = 0;
let lastKickLevel = 0;
let lastSnareLevel = 0;
let kickDecay = 0;
let snareDecay = 0;
let impactRipples = [];

// 背景用
let bgStars = [];
let bgNebulas = [];
let bgDepthLayers = [];

// 光の糸
let flowLines = [];

const NUM_PARTICLES = 300;
const NUM_ENERGY_RINGS = 8;
const HISTORY_LENGTH = 60;
const NUM_FLOW_LINES = 12;
const NUM_BG_STARS = 200;
const NUM_NEBULAS = 5;

function setup() {
  createCanvas(windowWidth, windowHeight);
  colorMode(HSB, 360, 100, 100, 100);
  fft = new p5.FFT(0.8, 2048);
  amplitude = new p5.Amplitude();
  
  for (let i = 0; i < 8; i++) {
    prevLevels[i] = 0;
  }
  
  for (let i = 0; i < HISTORY_LENGTH; i++) {
    energyHistory[i] = 0;
  }
  
  // パーティクル初期化
  for (let i = 0; i < NUM_PARTICLES; i++) {
    particles.push({
      angle: random(TWO_PI),
      radius: random(50, 300),
      baseRadius: random(50, 300),
      z: random(-1, 1),
      speed: random(0.001, 0.005),
      size: random(1, 4),
      hue: random(180, 280),
      phase: random(TWO_PI),
      life: random(0.5, 1)
    });
  }
  
  // エネルギーリング
  for (let i = 0; i < NUM_ENERGY_RINGS; i++) {
    energyField.push({
      radius: 80 + i * 35,
      phase: i * 0.3,
      energy: 0,
      targetEnergy: 0
    });
  }
  
  // 光の糸
  for (let i = 0; i < NUM_FLOW_LINES; i++) {
    flowLines.push({
      points: [],
      hue: random(200, 260),
      maxPoints: floor(random(30, 60)),
      speed: random(0.02, 0.05),
      radius: random(120, 280),
      angle: random(TWO_PI),
      zOffset: random(1000)
    });
  }
  
  // 背景の星
  for (let i = 0; i < NUM_BG_STARS; i++) {
    bgStars.push({
      x: random(-width, width * 2),
      y: random(-height, height * 2),
      z: random(0.1, 1), // 深度
      size: random(0.5, 2.5),
      twinkleSpeed: random(0.01, 0.05),
      twinklePhase: random(TWO_PI),
      hue: random(200, 280)
    });
  }
  
  // 背景の星雲
  for (let i = 0; i < NUM_NEBULAS; i++) {
    bgNebulas.push({
      x: random(-200, 200),
      y: random(-200, 200),
      z: random(0.2, 0.8),
      size: random(300, 600),
      hue: random(220, 300),
      noiseOffset: random(1000),
      rotation: random(TWO_PI)
    });
  }
  
  // 奥行きレイヤー
  for (let i = 0; i < 4; i++) {
    bgDepthLayers.push({
      z: 0.2 + i * 0.2,
      particles: [],
      hue: 220 + i * 20
    });
    
    for (let j = 0; j < 30; j++) {
      bgDepthLayers[i].particles.push({
        x: random(-width * 0.8, width * 0.8),
        y: random(-height * 0.8, height * 0.8),
        size: random(2, 8) * (1 - bgDepthLayers[i].z * 0.5),
        drift: random(0.0005, 0.002)
      });
    }
  }
  
  setupFileInput();
  noStroke();
}

function draw() {
  // 完全に黒でクリア（背景は別で描く）
  background(0);
  
  let spectrum = fft.analyze();
  let level = amplitude.getLevel();
  
  // 周波数分析
  let subBass = getSmoothedBand(spectrum, 20, 60, 0, 0.12);
  let bass = getSmoothedBand(spectrum, 60, 150, 1, 0.12);
  let lowMid = getSmoothedBand(spectrum, 150, 400, 2, 0.10);
  let mid = getSmoothedBand(spectrum, 400, 1000, 3, 0.08);
  let highMid = getSmoothedBand(spectrum, 1000, 2500, 4, 0.07);
  let presence = getSmoothedBand(spectrum, 2500, 6000, 5, 0.05);
  let brilliance = getSmoothedBand(spectrum, 6000, 14000, 6, 0.04);
  
  // === Kick検出（急激な低音の立ち上がり）===
  let kickRaw = getInstantBand(spectrum, 40, 100);
  let kickDelta = kickRaw - lastKickLevel;
  lastKickLevel = lerp(lastKickLevel, kickRaw, 0.3);
  
  if (kickDelta > 0.15 && kickRaw > 0.3) {
    kickDecay = 1.0;
    // インパクト波紋を追加
    impactRipples.push({
      radius: 50,
      maxRadius: 400 + kickRaw * 300,
      alpha: 80,
      speed: 8 + kickRaw * 10,
      hue: 220,
      thickness: 4
    });
  }
  kickDecay *= 0.85; // 急速減衰
  kickEnergy = kickDecay;
  
  // === Snare検出（中高域のトランジェント）===
  let snareRaw = getInstantBand(spectrum, 150, 400);
  let snareHighRaw = getInstantBand(spectrum, 2000, 8000);
  let snareCombined = snareRaw * 0.6 + snareHighRaw * 0.4;
  let snareDelta = snareCombined - lastSnareLevel;
  lastSnareLevel = lerp(lastSnareLevel, snareCombined, 0.25);
  
  if (snareDelta > 0.12 && snareCombined > 0.25) {
    snareDecay = 1.0;
    // スネア用の鋭い波紋
    impactRipples.push({
      radius: 80,
      maxRadius: 350 + snareRaw * 200,
      alpha: 60,
      speed: 12 + snareHighRaw * 8,
      hue: 280,
      thickness: 2
    });
  }
  snareDecay *= 0.88;
  snareEnergy = snareDecay;
  
  // グローバルエネルギー
  let targetEnergy = subBass * 0.3 + bass * 0.3 + lowMid * 0.2 + mid * 0.1 + level * 0.1;
  globalEnergy = lerp(globalEnergy, targetEnergy, 0.06);
  
  energyHistory.unshift(globalEnergy);
  energyHistory.pop();
  
  breathPhase += 0.015 + globalEnergy * 0.025;
  
  push();
  translate(width / 2, height / 2);
  
  // ===== 背景レイヤー（奥から手前へ）=====
  drawBackgroundNebulas();
  drawBackgroundDepthLayers();
  drawBackgroundStars();
  drawBackgroundGlow(bass, lowMid);
  
  // ===== メインビジュアライザー =====
  drawAbyssLight(bass);
  drawDeepMist(bass, lowMid);
  drawAuraWaves(bass, lowMid);
  drawEnergyField(bass, lowMid, mid);
  
  // Kick/Snareインパクト
  drawImpactRipples();
  drawKickImpact(kickEnergy, bass);
  drawSnareImpact(snareEnergy);
  
  drawFlowLines(bass, mid);
  drawCore(bass, level, kickEnergy, snareEnergy);
  drawParticles(spectrum, mid, highMid, presence, kickEnergy);
  drawPulsingNodes(spectrum, presence);
  drawBrillianceSparkles(brilliance, presence);
  
  pop();
}

// ===== 背景：星雲 =====
function drawBackgroundNebulas() {
  for (let nebula of bgNebulas) {
    push();
    translate(nebula.x, nebula.y);
    rotate(nebula.rotation + frameCount * 0.0001);
    
    let breathOffset = sin(breathPhase * 0.3 + nebula.noiseOffset) * 20;
    
    for (let layer = 0; layer < 4; layer++) {
      let size = nebula.size * (1 - layer * 0.15) + breathOffset;
      let alpha = map(layer, 0, 4, 3, 1) * nebula.z;
      let hue = (nebula.hue + layer * 15 + globalEnergy * 20) % 360;
      
      // ノイズベースの形状
      fill(hue, 30 - layer * 5, 30 + layer * 5, alpha);
      beginShape();
      for (let a = 0; a < TWO_PI; a += 0.15) {
        let noiseVal = noise(
          cos(a) * 2 + nebula.noiseOffset,
          sin(a) * 2 + nebula.noiseOffset,
          frameCount * 0.002 + layer * 0.5
        );
        let r = size * 0.3 + noiseVal * size * 0.4;
        vertex(r * cos(a), r * sin(a));
      }
      endShape(CLOSE);
    }
    pop();
  }
}

// ===== 背景：奥行きレイヤー =====
function drawBackgroundDepthLayers() {
  for (let layer of bgDepthLayers) {
    let parallax = 1 - layer.z * 0.5;
    let alpha = (1 - layer.z) * 8;
    
    for (let p of layer.particles) {
      // 非常にゆっくりドリフト
      p.x += sin(frameCount * p.drift + p.y * 0.01) * 0.1;
      p.y += cos(frameCount * p.drift + p.x * 0.01) * 0.05;
      
      let x = p.x * parallax;
      let y = p.y * parallax;
      
      // 呼吸で微妙にサイズ変化
      let size = p.size * (1 + sin(breathPhase * 0.5 + p.x * 0.01) * 0.2);
      
      // グロー
      fill(layer.hue, 20, 40, alpha * 0.3);
      ellipse(x, y, size * 3, size * 3);
      
      fill(layer.hue, 30, 60, alpha);
      ellipse(x, y, size, size);
    }
  }
}

// ===== 背景：星 =====
function drawBackgroundStars() {
  for (let star of bgStars) {
    star.twinklePhase += star.twinkleSpeed;
    
    let twinkle = sin(star.twinklePhase) * 0.5 + 0.5;
    let parallax = star.z;
    
    let x = (star.x - width / 2) * parallax;
    let y = (star.y - height / 2) * parallax;
    
    // グローバルエネルギーで微妙に明るく
    let baseBrightness = 3 + globalEnergy * 3;
    let alpha = baseBrightness * twinkle * star.z;
    
    // 小さなグロー
    fill(star.hue, 15, 70, alpha * 0.5);
    ellipse(x, y, star.size * 3, star.size * 3);
    
    fill(star.hue, 10, 90, alpha);
    ellipse(x, y, star.size, star.size);
  }
}

// ===== 背景：中心からの淡いグロー =====
function drawBackgroundGlow(bass, lowMid) {
  let glowIntensity = 0.3 + bass * 0.3 + lowMid * 0.2;
  
  for (let i = 5; i > 0; i--) {
    let size = 300 + i * 150 + sin(breathPhase * 0.5) * 30;
    let alpha = (6 - i) * glowIntensity * 0.8;
    let hue = 230 + globalEnergy * 30;
    
    fill(hue, 40 - i * 5, 20 + i * 5, alpha);
    ellipse(0, 0, size, size);
  }
}

// ===== Kick/Snare：インパクト波紋 =====
function drawImpactRipples() {
  for (let i = impactRipples.length - 1; i >= 0; i--) {
    let ripple = impactRipples[i];
    
    ripple.radius += ripple.speed;
    ripple.alpha *= 0.92;
    ripple.thickness *= 0.97;
    
    if (ripple.alpha < 1 || ripple.radius > ripple.maxRadius) {
      impactRipples.splice(i, 1);
      continue;
    }
    
    noFill();
    stroke(ripple.hue, 60, 90, ripple.alpha);
    strokeWeight(ripple.thickness);
    ellipse(0, 0, ripple.radius * 2, ripple.radius * 2);
  }
  noStroke();
}

// ===== Kick：衝撃エフェクト =====
function drawKickImpact(kickEnergy, bass) {
  if (kickEnergy < 0.01) return;
  
  // 中心からの爆発的な光
  let intensity = kickEnergy * kickEnergy; // 二乗でより急激に
  
  // フラッシュ
  for (let i = 6; i > 0; i--) {
    let size = 80 + i * 40 + intensity * 200;
    let alpha = intensity * (7 - i) * 12;
    fill(220, 50, 100, alpha);
    ellipse(0, 0, size, size);
  }
  
  // 放射状の光線
  let numRays = 16;
  for (let i = 0; i < numRays; i++) {
    let angle = (TWO_PI / numRays) * i + frameCount * 0.02;
    let length = 100 + intensity * 350;
    let thickness = 2 + intensity * 8;
    
    stroke(210, 60, 100, intensity * 60);
    strokeWeight(thickness);
    
    let x1 = 50 * cos(angle);
    let y1 = 50 * sin(angle);
    let x2 = length * cos(angle);
    let y2 = length * sin(angle);
    
    line(x1, y1, x2, y2);
  }
  noStroke();
  
  // 衝撃で粒子を外側に押し出す効果
  for (let p of particles) {
    p.radius += kickEnergy * 30;
  }
}

// ===== Snare：鋭い衝撃エフェクト =====
function drawSnareImpact(snareEnergy) {
  if (snareEnergy < 0.01) return;
  
  let intensity = snareEnergy * snareEnergy;
  
  // 鋭いクロス状のフラッシュ
  stroke(280, 50, 100, intensity * 80);
  strokeWeight(2 + intensity * 6);
  
  let crossSize = 150 + intensity * 300;
  
  // メインクロス
  line(-crossSize, 0, crossSize, 0);
  line(0, -crossSize, 0, crossSize);
  
  // 斜めクロス（少し小さく）
  let diagSize = crossSize * 0.7;
  stroke(300, 40, 100, intensity * 50);
  strokeWeight(1 + intensity * 3);
  line(-diagSize, -diagSize, diagSize, diagSize);
  line(-diagSize, diagSize, diagSize, -diagSize);
  
  noStroke();
  
  // 中心の鋭い光
  for (let i = 4; i > 0; i--) {
    let size = 30 + i * 20 + intensity * 80;
    let alpha = intensity * (5 - i) * 20;
    fill(280, 30, 100, alpha);
    ellipse(0, 0, size, size);
  }
  
  // 散らばるスパーク
  let numSparks = floor(intensity * 30);
  for (let i = 0; i < numSparks; i++) {
    let angle = random(TWO_PI);
    let dist = random(50, 200) * intensity;
    let x = dist * cos(angle);
    let y = dist * sin(angle);
    
    fill(280 + random(-20, 20), 50, 100, intensity * 60);
    let size = random(1, 4);
    ellipse(x, y, size, size);
  }
}

// ===== 即時バンド取得（スムージングなし、アタック検出用）=====
function getInstantBand(spectrum, lowFreq, highFreq) {
  let nyquist = 44100 / 2;
  let lowIndex = floor(lowFreq / nyquist * spectrum.length);
  let highIndex = floor(highFreq / nyquist * spectrum.length);
  
  let sum = 0;
  let count = 0;
  
  for (let i = lowIndex; i < highIndex && i < spectrum.length; i++) {
    sum += spectrum[i];
    count++;
  }
  
  return count > 0 ? sum / count / 255 : 0;
}

function getSmoothedBand(spectrum, lowFreq, highFreq, index, smoothing) {
  let nyquist = 44100 / 2;
  let lowIndex = floor(lowFreq / nyquist * spectrum.length);
  let highIndex = floor(highFreq / nyquist * spectrum.length);
  
  let sum = 0;
  let count = 0;
  
  for (let i = lowIndex; i < highIndex && i < spectrum.length; i++) {
    sum += spectrum[i];
    count++;
  }
  
  let current = count > 0 ? sum / count / 255 : 0;
  
  let diff = current - prevLevels[index];
  let adaptiveSmooth = diff > 0 ? smoothing : smoothing * 2.5;
  prevLevels[index] = lerp(prevLevels[index], current, adaptiveSmooth);
  
  return prevLevels[index];
}

function drawDeepMist(bass, lowMid) {
  for (let i = 0; i < 5; i++) {
    let mistRadius = 200 + i * 80 + sin(breathPhase * 0.5 + i) * 30;
    mistRadius += bass * 100 + lowMid * 50;
    mistRadius += kickEnergy * 80; // Kickで膨張
    
    let alpha = map(i, 0, 5, 8, 2);
    fill(220 + i * 10, 30, 40, alpha);
    
    beginShape();
    for (let a = 0; a < TWO_PI; a += 0.1) {
      let noiseVal = noise(
        cos(a) * 2 + frameCount * 0.005,
        sin(a) * 2 + frameCount * 0.005,
        i * 0.5
      );
      let r = mistRadius + noiseVal * 100 - 50;
      let x = r * cos(a);
      let y = r * sin(a);
      vertex(x, y);
    }
    endShape(CLOSE);
  }
}

function drawEnergyField(bass, lowMid, mid) {
  for (let ring of energyField) {
    ring.targetEnergy = bass * 0.6 + lowMid * 0.3 + mid * 0.1;
    ring.energy = lerp(ring.energy, ring.targetEnergy, 0.05);
    ring.phase += 0.01 + ring.energy * 0.02;
    
    let baseRadius = ring.radius + sin(breathPhase + ring.phase) * 20;
    baseRadius += ring.energy * 80;
    baseRadius += kickEnergy * 60; // Kickで拡大
    
    for (let layer = 0; layer < 3; layer++) {
      let layerRadius = baseRadius + layer * 8;
      let alpha = map(layer, 0, 3, 15, 5) * (0.5 + ring.energy * 0.5);
      let hue = 200 + ring.energy * 60 + layer * 10;
      
      // Snareで色相シフト
      hue += snareEnergy * 60;
      
      stroke(hue, 50 - layer * 10, 80, alpha);
      strokeWeight(2 + ring.energy * 3 + kickEnergy * 4);
      noFill();
      
      beginShape();
      for (let a = 0; a < TWO_PI; a += 0.05) {
        let noiseScale = 3;
        let noiseVal = noise(
          cos(a) * noiseScale + frameCount * 0.008 + ring.phase,
          sin(a) * noiseScale + frameCount * 0.008,
          ring.radius * 0.01
        );
        
        let r = layerRadius + (noiseVal - 0.5) * 60 * (1 + ring.energy);
        r += kickEnergy * 30 * sin(a * 8); // Kickで波打つ
        vertex(r * cos(a), r * sin(a));
      }
      endShape(CLOSE);
    }
  }
  noStroke();
}

function drawCore(bass, level, kickEnergy, snareEnergy) {
  let coreSize = 60 + bass * 80 + sin(breathPhase) * 20;
  let corePulse = 1 + level * 0.5;
  
  // Kickで急激に膨張
  coreSize += kickEnergy * 100;
  
  // Snareで色が白く飛ぶ
  let coreSaturation = 40 - snareEnergy * 30;
  let coreBrightness = 70 + snareEnergy * 30;
  
  // グロー効果
  for (let i = 10; i > 0; i--) {
    let glowSize = coreSize * corePulse + i * 15 + kickEnergy * 50;
    let alpha = map(i, 10, 0, 1, 8) + kickEnergy * 5;
    let hue = 220 + bass * 40;
    fill(hue, coreSaturation, coreBrightness, alpha);
    ellipse(0, 0, glowSize, glowSize);
  }
  
  // 核の中心
  fill(220, coreSaturation * 0.5, 90 + snareEnergy * 10, 30 + kickEnergy * 20);
  ellipse(0, 0, coreSize * 0.6, coreSize * 0.6);
}

function drawParticles(spectrum, mid, highMid, presence, kickEnergy) {
  for (let p of particles) {
    let energyInfluence = mid * 0.5 + highMid * 0.3 + presence * 0.2;
    
    p.angle += p.speed * (1 + energyInfluence * 2);
    p.phase += 0.02;
    
    // Kickで押し出された後、ゆっくり戻る
    p.radius = lerp(p.radius, p.baseRadius, 0.02);
    
    let breathInfluence = sin(breathPhase + p.phase) * 30;
    let currentRadius = p.radius + breathInfluence + energyInfluence * 100;
    
    let noiseOffset = noise(p.angle * 2 + frameCount * 0.01, p.z * 10) * 40 - 20;
    currentRadius += noiseOffset;
    
    let x = currentRadius * cos(p.angle);
    let y = currentRadius * sin(p.angle) * (0.8 + p.z * 0.2);
    
    let depthAlpha = map(p.z, -1, 1, 20, 60);
    let energyAlpha = depthAlpha * (0.3 + energyInfluence * 0.7);
    
    // Kickで一瞬明るく
    energyAlpha += kickEnergy * 30;
    
    let hue = (p.hue + globalEnergy * 30 + frameCount * 0.1) % 360;
    // Snareで色相シフト
    hue = (hue + snareEnergy * 40) % 360;
    
    fill(hue, 60, 80, energyAlpha * p.life);
    let size = p.size * (1 + energyInfluence * 0.5 + kickEnergy * 0.8);
    ellipse(x, y, size, size);
  }
}

function drawBrillianceSparkles(brilliance, presence) {
  let numSparkles = floor(brilliance * 50 + presence * 30);
  numSparkles += floor(snareEnergy * 40); // Snareで増加
  
  for (let i = 0; i < numSparkles; i++) {
    let angle = random(TWO_PI);
    let radius = random(100, 350) + globalEnergy * 50;
    let x = radius * cos(angle);
    let y = radius * sin(angle);
    
    let alpha = random(10, 40) * brilliance + snareEnergy * 30;
    let hue = random(180, 300);
    
    fill(hue, 30, 100, alpha);
    let size = random(1, 3) + snareEnergy * 2;
    ellipse(x, y, size, size);
  }
}

function drawPulsingNodes(spectrum, presence) {
  let numNodes = 5 + floor(presence * 10);
  
  for (let i = 0; i < numNodes; i++) {
    let seed = i * 1000;
    let baseAngle = noise(seed) * TWO_PI;
    let baseRadius = 100 + noise(seed + 100) * 200;
    
    let pulse = sin(breathPhase * 2 + i * 0.5);
    let r = baseRadius + pulse * 20 + globalEnergy * 50;
    r += kickEnergy * 50;
    
    let x = r * cos(baseAngle + frameCount * 0.002);
    let y = r * sin(baseAngle + frameCount * 0.002);
    
    for (let g = 5; g > 0; g--) {
      let size = (10 + pulse * 5 + presence * 15) + g * 8;
      size += kickEnergy * 15;
      let alpha = map(g, 5, 0, 2, 15) * (0.5 + presence);
      alpha += kickEnergy * 10;
      fill(240 + snareEnergy * 40, 40, 90, alpha);
      ellipse(x, y, size, size);
    }
  }
}

function drawFlowLines(bass, mid) {
  for (let fl of flowLines) {
    fl.angle += fl.speed * (1 + bass * 2 + kickEnergy * 3);
    
    let noiseVal = noise(
      fl.angle * 2,
      frameCount * 0.01,
      fl.zOffset
    );
    
    let r = fl.radius + (noiseVal - 0.5) * 100 + bass * 80;
    r += kickEnergy * 60;
    
    let x = r * cos(fl.angle);
    let y = r * sin(fl.angle);
    
    fl.points.unshift({ x, y, age: 0 });
    
    if (fl.points.length > fl.maxPoints) {
      fl.points.pop();
    }
    
    noFill();
    for (let i = 1; i < fl.points.length; i++) {
      let p = fl.points[i];
      let prevP = fl.points[i - 1];
      
      let alpha = map(i, 0, fl.points.length, 40, 0);
      alpha *= (0.3 + mid * 0.7);
      alpha += kickEnergy * 20;
      
      let hue = (fl.hue + globalEnergy * 40 + snareEnergy * 30) % 360;
      stroke(hue, 50, 80, alpha);
      strokeWeight(map(i, 0, fl.points.length, 3 + kickEnergy * 2, 0.5));
      
      line(prevP.x, prevP.y, p.x, p.y);
    }
  }
  noStroke();
}


function drawAuraWaves(bass, lowMid) {
  stroke(220, 40, 60, 5);
  strokeWeight(2);
  noFill();
  
  for (let i = 0; i < energyHistory.length; i += 3) {
    let historyEnergy = energyHistory[i];
    let waveRadius = 150 + i * 8 + historyEnergy * 100;
    waveRadius += kickEnergy * 40;
    
    let alpha = map(i, 0, energyHistory.length, 10, 0);
    alpha += kickEnergy * 5;
    
    stroke(220 + historyEnergy * 30 + snareEnergy * 20, 30, 70, alpha);
    
    beginShape();
    for (let a = 0; a < TWO_PI; a += 0.1) {
      let r = waveRadius + sin(a * 6 + breathPhase - i * 0.1) * 10;
      vertex(r * cos(a), r * sin(a));
    }
    endShape(CLOSE);
  }
  noStroke();
}

function drawAbyssLight(bass) {
  let numRays = 24;
  let kickBoost = kickEnergy * kickEnergy;
  
  for (let i = 0; i < numRays; i++) {
    let angle = (TWO_PI / numRays) * i + frameCount * 0.001;
    let length = 150 + bass * 200 + sin(breathPhase + i * 0.3) * 50;
    length += kickBoost * 250;
    
    for (let j = 0; j < length; j += 5) {
      let alpha = map(j, 0, length, 8, 0) * (0.3 + bass * 0.7);
      alpha += kickBoost * 15;
      
      let x = j * cos(angle);
      let y = j * sin(angle);
      
      fill(220 + snareEnergy * 40, 30, 70 + kickBoost * 30, alpha);
      let size = map(j, 0, length, 8 + kickBoost * 6, 2);
      ellipse(x, y, size, size);
    }
  }
}

// ===== ファイル入力設定 =====
function setupFileInput() {
  let container = document.createElement('div');
  container.style.cssText = `
    position: fixed;
    top: 20px;
    left: 20px;
    z-index: 1000;
    font-family: 'Arial', sans-serif;
  `;
  container.innerHTML = `
    <div style="background: rgba(0,0,0,0.7); padding: 15px; border-radius: 10px; backdrop-filter: blur(10px);">
      <input type="file" id="audioFile" accept="audio/*" 
        style="color: white; margin-bottom: 12px; display: block; font-size: 14px;">
      <div style="display: flex; gap: 10px;">
        <button id="playBtn" style="
          padding: 10px 24px;
          cursor: pointer;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          border: none;
          border-radius: 6px;
          color: white;
          font-weight: bold;
          transition: transform 0.1s;
        ">▶ Play</button>
        <button id="pauseBtn" style="
          padding: 10px 24px;
          cursor: pointer;
          background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
          border: none;
          border-radius: 6px;
          color: white;
          font-weight: bold;
          transition: transform 0.1s;
        ">⏸ Pause</button>
      </div>
    </div>
  `;
  document.body.appendChild(container);
  
  // ホバーエフェクト
  let buttons = container.querySelectorAll('button');
  buttons.forEach(btn => {
    btn.addEventListener('mouseenter', () => btn.style.transform = 'scale(1.05)');
    btn.addEventListener('mouseleave', () => btn.style.transform = 'scale(1)');
  });
  
  document.getElementById('audioFile').addEventListener('change', function(e) {
    let file = e.target.files[0];
    if (file) {
      loadSound(URL.createObjectURL(file), sound => {
        if (audioFile) {
          audioFile.stop();
          audioFile.disconnect();
        }
        audioFile = sound;
      
        // 重要：一度再生してから接続
        audioFile.play();
        audioFile.pause();
        audioFile.jump(0);
        
        fft.setInput(audioFile);
        amplitude.setInput(audioFile);
      
        console.log('Audio loaded and connected:', file.name);
        console.log('Sound duration:', audioFile.duration());
      }, err => {
        console.error('Error loading audio:', err);
      });
    }
  });
  
  document.getElementById('playBtn').addEventListener('click', () => {
    if (audioFile && !isPlaying) {
      audioFile.play();
      isPlaying = true;
    }
  });
  
  document.getElementById('pauseBtn').addEventListener('click', () => {
    if (audioFile && isPlaying) {
      audioFile.pause();
      isPlaying = false;
    }
  });
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  
  // 背景の星を再配置
  for (let star of bgStars) {
    star.x = random(-width, width * 2);
    star.y = random(-height, height * 2);
  }
}

function keyPressed() {
  if (key === ' ') {
    if (audioFile) {
      if (isPlaying) {
        audioFile.pause();
        isPlaying = false;
      } else {
        audioFile.play();
        isPlaying = true;
      }
    }
    return false; // スクロール防止
  }
}
