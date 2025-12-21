let audioFile;
let fft;
let canvas;
let amplitude;
let isPlaying = false;
let fps = 60;
let canvasWidth = window.innerWidth;
let canvasHeight = window.innerHeight;
let BandWidth_1 = 2;
let BandHeight1 = 100;
let BandMaxRadius_1 = 200;
let BandMinRadius_1 = 100;
let HSV_h_1 = 256
let HSV_s_1 = 256;
let HSV_v_1 = 256;
let BandWidth_2 = 3;
let DotHeight2 = -800;
let DotFactor = 2;
let DotHeight3 = -600;
let DotHeight4 = -400;
let DotDensity = 0;
let TurbFactor = 0;
let AI_SmoothingFactor = 0.92;
let AI_RotationSpeed = 0.5;
let AI_PulseIntensity = 1;
let AI_ColorShift = 0;
let n = 15;
let sliders = {};

function setup()
{
  canvas = createCanvas(canvasWidth, canvasHeight);
  frameRate(fps);
  fft = new p5.FFT(AI_SmoothingFactor, 2048);
  amplitude = new p5.Amplitude();
  createUIControls();
  setupFileInput();
}

function draw()
{
  background(0);
  let spectrum = fft.analyze();
  push();
  translate(width / 2, height / 2);
  rotate(frameCount * AI_RotationSpeed * 0.01);
  drawSpectrum1(spectrum);
  for (let i = 0; i < n; i++)
  {
    push();
    rotate(radians(2 * i));
    drawSpectrum2(spectrum, i);
    pop();
  }
  for (let i = 0; i < n; i++)
  {
    push();
    rotate(radians(2 * i));
    drawSpectrum3(spectrum, i);
    pop();
  }
  for (let i = 0; i < n; i++)
  {
    push();
    rotate(radians(2 * i));
    drawSpectrum4(spectrum, i);
    pop();
  }
  pop();
}

function drawSpectrum1(spectrum)
{
  let startFreq = 20;
  let endFreq = 500;
  let numBands = 256;
  let level = amplitude.getLevel();
  let currentRadius = map(level * AI_PulseIntensity, 0, 1, BandMinRadius_1, BandMaxRadius_1);
  push();
  noFill();
  strokeWeight(BandWidth_1);
  for (let i = 0; i < numBands; i++)
  {
    let angle = map(i, 0, numBands, 0, TWO_PI);
    let freqIndex = floor(map(i, 0, numBands, 
    freqToIndex(startFreq), freqToIndex(endFreq)));
    let amp = spectrum[freqIndex];
    let r = currentRadius + map(amp, 0, 255, 0, BandHeight1);
    let hue = (HSV_h_1 + i * AI_ColorShift) % 360;
    stroke(hue, HSV_s_1, HSV_v_1);
    let x1 = currentRadius * cos(angle);
    let y1 = currentRadius * sin(angle);
    let x2 = r * cos(angle);
    let y2 = r * sin(angle);
    line(x1, y1, x2, y2);
  }
  pop();
}

function drawSpectrum2(spectrum, index)
{
  let startFreq = 500;
  let endFreq = 700;
  let numBands = 150;
  
  push();
  noStroke();
  fill(100, 80, 100);
  
  for (let i = 0; i < numBands; i++)
  {
    let angle = map(i, 0, numBands, 0, TWO_PI);
    let freqIndex = floor(map(i, 0, numBands, 
    freqToIndex(startFreq), freqToIndex(endFreq)));
    let amp = spectrum[freqIndex];
    let dotAmp = DotHeight2 - index * DotFactor;
    let r = BandMinRadius_1 - map(amp, 0, 255, 0, dotAmp);
    let x = r * cos(angle);
    let y = r * sin(angle);
    circle(x, y, BandWidth_2);
  }
  pop();
}

function drawSpectrum3(spectrum, index)
{
  let startFreq = 1000;
  let endFreq = 1200;
  let numBands = 150;
  push();
  noStroke();
  fill(200, 60, 100);
  for (let i = 0; i < numBands; i++)
  {
    let angle = map(i, 0, numBands, 0, TWO_PI);
    let freqIndex = floor(map(i, 0, numBands, 
    freqToIndex(startFreq), freqToIndex(endFreq)));
    let amp = spectrum[freqIndex];
    let dotAmp = DotHeight3 - index * DotFactor;
    let r = BandMinRadius_1 - 20 - map(amp, 0, 255, 0, dotAmp);
    let x = r * cos(angle);
    let y = r * sin(angle);
    circle(x, y, 2);
  }
  pop();
}

function drawSpectrum4(spectrum, index)
{
  let startFreq = 1200;
  let endFreq = 1500;
  let numBands = 150;
  push();
  noStroke();
  fill(300, 40, 100);
  for (let i = 0; i < numBands; i++)
  {
    let angle = map(i, 0, numBands, 0, TWO_PI);
    let freqIndex = floor(map(i, 0, numBands, 
    freqToIndex(startFreq), freqToIndex(endFreq)));
    let amp = spectrum[freqIndex];
    let dotAmp = DotHeight4 - index * DotFactor;
    let r = BandMinRadius_1 - 40 - map(amp, 0, 255, 0, dotAmp);
    let x = r * cos(angle);
    let y = r * sin(angle);
    circle(x, y, 2);
  }
  pop();
}

function drawDotSphere(spectrum)
{
  push();
  noStroke();
  let level = amplitude.getLevel();
  let currentRadius = map(level * AI_PulseIntensity, 0, 1, BandMinRadius_1, BandMaxRadius_1);
  for (let i = 0; i < DotDensity; i++)
  {
    let phi = random(TWO_PI);
    let theta = random(PI);
    
    let turbulence = noise
    (
      phi * 3 + frameCount * TurbFactor,
      theta * 3 + frameCount * TurbFactor
    )* 20 - 10;
    let r = currentRadius + turbulence;
    let x = r * sin(theta) * cos(phi);
    let y = r * sin(theta) * sin(phi);
    let z = r * cos(theta);
    let alpha = map(z, -currentRadius, currentRadius, 30, 100);
    fill(180, 50, alpha);
    circle(x, y, 1);
  }
  pop();
}

function freqToIndex(freq)
{
  return floor(freq / (44100 / fft.bins));
}

function setupFileInput()
{
  document.getElementById('audioFile').addEventListener
  (
    'change', function(e)
    {
      let file = e.target.files[0];
      if (file)
      {
        let objectURL = URL.createObjectURL(file);
        loadSound(objectURL, soundLoaded, soundError, soundLoading);
      }
    }
  );
  
  document.getElementById('playBtn').addEventListener
  (
    'click', function()
    {
    if (audioFile && !isPlaying)
      {
        audioFile.play();
        isPlaying = true;
      }
    }
  );
  
  document.getElementById('pauseBtn').addEventListener
  (
    'click', function()
    {
      if (audioFile && isPlaying)
      {
        audioFile.pause();
        isPlaying = false;
      }
    }
  );
}

function soundLoaded(sound)
{
  console.log("サウンド読み込み成功", sound);
  if (audioFile)
  {
    audioFile.stop();
  }
  audioFile = sound;
  fft.setInput(audioFile);
  console.log('音声ファイルが読み込まれました');
}

function soundError(err)
{
  console.error('音声ファイルの読み込みエラー:', err);
}

function soundLoading(progress)
{
  console.log('読み込み中...', progress * 100 + '%');
}

function createUIControls()
{
  let container = document.getElementById('controls-container');
  let params =
  [
    { name: 'BandWidth_1', min: 1, max: 10, step: 0.5, category: ' ' },
    { name: 'BandHeight1', min: 0, max: 200, step: 1, category: ' ' },
    { name: 'BandMaxRadius_1', min: 100, max: 300, step: 1, category: ' ' },
    { name: 'BandMinRadius_1', min: 50, max: 200, step: 1, category: ' ' },
    { name: 'HSV_h_1', min: 0, max: 360, step: 1, category: ' ' },
    { name: 'HSV_s_1', min: 0, max: 100, step: 1, category: ' ' },
    { name: 'HSV_v_1', min: 0, max: 100, step: 1, category: ' ' },
    { name: 'BandWidth_2', min: 1, max: 10, step: 0.5, category: ' ' },
    { name: 'DotHeight2', min: 0, max: 150, step: 1, category: ' ' },
    { name: 'DotHeight3', min: 0, max: 150, step: 1, category: ' ' },
    { name: 'DotHeight4', min: 0, max: 150, step: 1, category: ' ' },
    { name: 'DotFactor', min: 0, max: 10, step: 0.1, category: ' ' },
    { name: 'DotDensity', min: 100, max: 1000, step: 10, category: ' ' },
    { name: 'TurbFactor', min: 0, max: 0.1, step: 0.001, category: ' ' },
    { name: 'n', min: 1, max: 30, step: 1, category: ' ' },
    { name: 'AI_SmoothingFactor', min: 0, max: 1, step: 0.01, category: ' ' },
    { name: 'AI_RotationSpeed', min: 0, max: 2, step: 0.01, category: ' ' },
    { name: 'AI_PulseIntensity', min: 0, max: 1, step: 0.01, category: ' ' },
    { name: 'AI_ColorShift', min: 0, max: 5, step: 0.1, category: ' ' }
  ];
  
  let categories = {};
  params.forEach
  (
    param =>
    {
      if (!categories[param.category])
      {
        categories[param.category] = [];
      }
      categories[param.category].push(param);
    }
  );
  
  Object.keys(categories).forEach
  (
    category =>
    {
      let categoryDiv = document.createElement('div');
      categoryDiv.innerHTML = `<h3 style="color: white; margin: 10px 0;">${category}</h3>`;
      container.appendChild(categoryDiv);
      categories[category].forEach
      (
        param =>
        {
          createSlider(param, container);
        }
      );
    }
  );
}

function createSlider(param, container)
{
  let sliderContainer = document.createElement('div');
  sliderContainer.className = 'slider-container';
  
  let label = document.createElement('div');
  label.className = 'slider-label';
  label.textContent = param.name;
  
  let wrapper = document.createElement('div');
  wrapper.className = 'slider-wrapper';
  
  let minLabel = document.createElement('span');
  minLabel.className = 'slider-min';
  minLabel.textContent = param.min;
  
  let slider = document.createElement('input');
  slider.type = 'range';
  slider.className = 'slider';
  slider.min = param.min;
  slider.max = param.max;
  slider.step = param.step;
  slider.value = window[param.name];
  
  let valueLabel = document.createElement('span');
  valueLabel.className = 'slider-value';
  valueLabel.textContent = window[param.name];
  
  let maxLabel = document.createElement('span');
  maxLabel.className = 'slider-max';
  maxLabel.textContent = param.max;
  
  slider.addEventListener
  (
    'input', function()
    {
      window[param.name] = parseFloat(this.value);
      valueLabel.textContent = this.value;
      if (param.name === 'AI_SmoothingFactor')
      {
        fft = new p5.FFT(window[param.name], 2048);
        if (audioFile)
        {
          fft.setInput(audioFile);
        }
      }
      if (param.name === 'fps')
      {
        frameRate(window[param.name]);
      }
    }
  );
  
  wrapper.appendChild(minLabel);
  wrapper.appendChild(slider);
  wrapper.appendChild(valueLabel);
  wrapper.appendChild(maxLabel);
  
  sliderContainer.appendChild(label);
  sliderContainer.appendChild(wrapper);
  container.appendChild(sliderContainer);
  
  sliders[param.name] =
  {
    slider: slider,
    valueLabel: valueLabel
  };
}

function windowResized()
{
  resizeCanvas(windowWidth, windowHeight);
}

function keyPressed()
{
  if (key === ' ')
  {
    if (audioFile)
    {
      if (isPlaying)
      {
        audioFile.pause();
        isPlaying = false;
      }
      else
      {
        audioFile.play();
        isPlaying = true;
      }
    }
  }
  
  if (key === 'r' || key === 'R')
  {
    resetParameters();
  }
  
  if (key === 's' || key === 'S')
  {
    // Sキーで現在のフレームを画像として保存
    saveCanvas('visualizer', 'png');
  }
}

function resetParameters()
{
  BandWidth_1 = 2;
  BandHeight1 = 100;
  BandMaxRadius_1 = 150;
  BandMinRadius_1 = 100;
  HSV_h_1 = 200;
  HSV_s_1 = 100;
  HSV_v_1 = 100;
  BandWidth_2 = 3;
  DotHeight2 = 80;
  DotHeight3 = 60;
  DotHeight4 = 40;
  DotFactor = 2;
  DotDensity = 500;
  TurbFactor = 0.01;
  n = 15;
  AI_SmoothingFactor = 0.8;
  AI_RotationSpeed = 0.5;
  AI_PulseIntensity = 0.3;
  AI_ColorShift = 0.5;
  
  Object.keys(sliders).forEach
  (
    name =>
    {
      if (sliders[name] && window[name] !== undefined)
      {
        sliders[name].slider.value = window[name];
        sliders[name].valueLabel.textContent = window[name];
      }
    }
  );
  
  fft = new p5.FFT(AI_SmoothingFactor, 2048);
  if (audioFile)
  {
    fft.setInput(audioFile);
  }
}
