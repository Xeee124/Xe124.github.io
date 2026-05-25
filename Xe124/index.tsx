
/**
 * VISUALIZER SELECT - REFACTORED ENGINE
 * Responsibilities:
 * - App: Boot & Sequence management
 * - UIController: Real-time UI updates (Clock, Frame, Cursor)
 * - Environment: Background generative visuals
 * - GlitchSystem: Interactive & Random visual glitches
 * - Navigator: Navigation & Transition effects
 */

class UIController {
  init() {
    this.startClock();
    this.startFrameCounter();
    this.initCustomCursor();
  }

  startClock() {
    const update = () => {
      const el = document.getElementById('timeDisplay');
      if (el) el.textContent = new Date().toTimeString().split(' ')[0];
    };
    setInterval(update, 1000);
    update();
  }

  startFrameCounter() {
    let frame = 0;
    const update = () => {
      frame = (frame + 1) % 10000;
      const el = document.getElementById('frameCount');
      if (el) el.textContent = 'FRM: ' + String(frame).padStart(4, '0');
      requestAnimationFrame(update);
    };
    update();
  }

  initCustomCursor() {
    const cursor = document.createElement('div');
    const cursorDot = document.createElement('div');
    
    const baseStyle = "position:fixed; pointer-events:none; z-index:99998; mix-blend-mode:difference; background:var(--blue);";
    cursor.style.cssText = `${baseStyle} width:20px; height:20px; border:2px solid var(--blue); background:transparent; transition:transform 0.1s, border-color 0.1s;`;
    cursorDot.style.cssText = `${baseStyle} width:4px; height:4px;`;
    
    document.body.appendChild(cursor);
    document.body.appendChild(cursorDot);

    document.addEventListener('mousemove', (e) => {
      cursor.style.left = `${e.clientX - 10}px`;
      cursor.style.top = `${e.clientY - 10}px`;
      cursorDot.style.left = `${e.clientX - 2}px`;
      cursorDot.style.top = `${e.clientY - 2}px`;
    });

    document.querySelectorAll('.card, a, button').forEach(el => {
      el.addEventListener('mouseenter', () => {
        cursor.style.transform = 'scale(2) rotate(45deg)';
        cursor.style.borderColor = '#FFF';
      });
      el.addEventListener('mouseleave', () => {
        cursor.style.transform = 'scale(1) rotate(0deg)';
        cursor.style.borderColor = 'var(--blue)';
      });
    });
  }
}

class Environment {
  init() {
    this.createBinaryRain();
    this.createFloatingSymbols();
  }

  createBinaryRain() {
    const container = document.getElementById('digitalBg');
    if (!container) return;
    const columns = Math.floor(window.innerWidth / 30);
    
    for (let i = 0; i < columns; i++) {
      const rain = document.createElement('div');
      rain.className = 'binary-rain';
      rain.style.left = `${i * 30}px`;
      rain.style.animationDelay = `${Math.random() * 20}s`;
      rain.style.animationDuration = `${15 + Math.random() * 10}s`;
      
      let binary = '';
      for (let j = 0; j < 50; j++) {
        binary += Math.random() > 0.5 ? '1' : '0';
        if (Math.random() > 0.8) binary += ' ';
      }
      rain.textContent = binary;
      container.appendChild(rain);
    }
  }

  createFloatingSymbols() {
    const container = document.getElementById('floatingSymbols');
    if (!container) return;
    const symbols = ['◆', '◇', '▣', '▤', '◈', '⬡', '⬢', '△', '▽', '○', '●', '□', '■'];
    
    for (let i = 0; i < 15; i++) {
      const symbol = document.createElement('div');
      symbol.className = 'float-symbol';
      symbol.textContent = symbols[Math.floor(Math.random() * symbols.length)];
      symbol.style.left = `${Math.random() * 100}%`;
      symbol.style.animationDelay = `${Math.random() * 15}s`;
      symbol.style.animationDuration = `${10 + Math.random() * 10}s`;
      symbol.style.fontSize = `${1 + Math.random() * 2}rem`;
      container.appendChild(symbol);
    }
  }
}

class GlitchSystem {
  init() {
    this.startRandomScreenGlitch();
    this.initMouseGlitch();
    this.initLogoInteractive();
    this.initKonamiCode();
    this.spawnRandomGlitchText();
  }

  spawnRandomGlitchText() {
    const container = document.getElementById('glitch-text-container');
    if (!container) return;
    const texts = ['ERROR_0x00FF', 'SYS_OVERRIDE', 'DATA_CORRUPT'];
    texts.forEach((txt, i) => {
      const el = document.createElement('div');
      el.className = 'glitch-text';
      el.textContent = txt;
      el.style.animationDelay = `${i * 2.5}s`;
      container.appendChild(el);
    });
  }

  startRandomScreenGlitch() {
    const trigger = () => {
      if (Math.random() > 0.7) {
        const container = document.querySelector('.container') as HTMLElement;
        if (container) {
          container.style.transform = `translateX(${(Math.random() - 0.5) * 10}px)`;
          container.style.filter = `hue-rotate(${Math.random() * 20 - 10}deg)`;
          setTimeout(() => {
            container.style.transform = 'translateX(0)';
            container.style.filter = 'none';
          }, 50);
        }
      }
      setTimeout(trigger, 3000 + Math.random() * 5000);
    };
    trigger();
  }

  initMouseGlitch() {
    document.addEventListener('mousemove', (e) => {
      if (Math.random() > 0.98) {
        const glitch = document.createElement('div');
        glitch.style.cssText = `position:fixed; left:${e.clientX}px; top:${e.clientY}px; width:${Math.random() * 100 + 20}px; height:2px; background:var(--blue); pointer-events:none; z-index:9999; opacity:0.8; transition: transform 0.05s, opacity 0.15s;`;
        document.body.appendChild(glitch);
        setTimeout(() => {
          glitch.style.transform = `translateX(${(Math.random() - 0.5) * 50}px)`;
          glitch.style.opacity = '0';
          setTimeout(() => glitch.remove(), 200);
        }, 50);
      }
    });
  }

  initLogoInteractive() {
    const logo = document.getElementById('mainLogo');
    if (!logo) return;
    logo.addEventListener('mouseenter', () => {
      const original = 'SELECT';
      const chars = original.split('');
      const glitchChars = '!@#$%^&*()_+-=[]{}|;:,.<>?/~`░▒▓█▀▄';
      let iterations = 0;
      const interval = setInterval(() => {
        logo.textContent = chars.map((char, i) => {
          if (i < iterations) return chars[i];
          return glitchChars[Math.floor(Math.random() * glitchChars.length)];
        }).join('');
        iterations += 1/3;
        if (iterations >= chars.length) {
          clearInterval(interval);
          logo.textContent = original;
        }
      }, 30);
    });
  }

  initKonamiCode() {
    let konamiCode = [];
    const konamiSequence = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
    document.addEventListener('keydown', (e) => {
      konamiCode.push(e.key);
      konamiCode = konamiCode.slice(-10);
      if (konamiCode.join(',') === konamiSequence.join(',')) {
        this.activateUltraGlitch();
      }
    });
  }

  activateUltraGlitch() {
    document.body.style.animation = 'ultraGlitch 0.1s infinite';
    const style = document.createElement('style');
    style.id = 'ultra-glitch-style';
    style.textContent = `@keyframes ultraGlitch { 0%, 100% { filter: none; transform: translate(0); } 10% { filter: invert(1); transform: translate(-5px, 5px); } 20% { filter: hue-rotate(90deg); transform: translate(5px, -5px); } 30% { filter: invert(1) hue-rotate(180deg); transform: translate(-3px, -3px); } 40% { filter: saturate(5); transform: translate(3px, 3px); } 50% { filter: contrast(2) brightness(1.5); transform: translate(-2px, 2px); } 60% { filter: invert(1) saturate(2); transform: translate(2px, -2px); } 70% { filter: hue-rotate(270deg); transform: translate(-4px, 0); } 80% { filter: invert(1) contrast(1.5); transform: translate(4px, 0); } 90% { filter: saturate(0); transform: translate(0, -3px); } }`;
    document.head.appendChild(style);
    setTimeout(() => {
      document.body.style.animation = 'none';
      style.remove();
    }, 3000);
  }
}

// Renamed from Navigator to AppNavigator to avoid conflict with the built-in Navigator interface
class AppNavigator {
  init() {
    this.bindLinks();
    this.runIntroSequence();
  }

  bindLinks() {
    document.querySelectorAll('.card').forEach(card => {
      card.addEventListener('click', (e) => {
        e.preventDefault();
        const href = card.getAttribute('href');
        if (href) this.executeTransition(href);
      });
    });
  }

  executeTransition(targetUrl: string) {
    const effect = document.getElementById('clickEffect');
    if (!effect) return;
    
    effect.classList.add('active');
    let flashCount = 0;
    const flashInterval = setInterval(() => {
      document.body.style.filter = flashCount % 2 === 0 ? 'invert(1) hue-rotate(180deg)' : 'none';
      flashCount++;
      if (flashCount > 6) {
        clearInterval(flashInterval);
        document.body.style.filter = 'none';
        window.location.href = targetUrl;
      }
    }, 50);
  }

  runIntroSequence() {
    const overlay = document.createElement('div');
    overlay.style.cssText = "position:fixed; top:0; left:0; width:100%; height:100%; background:#000; z-index:99999; display:flex; align-items:center; justify-content:center; font-family:'Share Tech Mono', monospace; color:var(--blue); font-size:1rem; letter-spacing:0.3em;";
    overlay.innerHTML = '<span id="loadText">INITIALIZING</span>';
    document.body.appendChild(overlay);
    
    const messages = ['INITIALIZING...', 'LOADING ASSETS...', 'SYSTEM CHECK...', 'AUDIO ENGINE READY', 'VISUAL CORE ONLINE', 'WELCOME'];
    let idx = 0;
    const interval = setInterval(() => {
      const el = document.getElementById('loadText');
      if (idx < messages.length) {
        if (el) {
          el.textContent = messages[idx];
          el.style.textShadow = '0 0 10px var(--blue)';
        }
        idx++;
      } else {
        clearInterval(interval);
        this.fadeIntroOverlay(overlay);
      }
    }, 200);
  }

  fadeIntroOverlay(el: HTMLElement) {
    let count = 0;
    const interval = setInterval(() => {
      el.style.transform = `translateX(${(Math.random() - 0.5) * 20}px)`;
      el.style.opacity = String(1 - (count * 0.1));
      el.style.background = count % 2 === 0 ? 'var(--blue)' : '#000';
      count++;
      if (count > 10) {
        clearInterval(interval);
        el.remove();
      }
    }, 50);
  }
}

// APP CORE - Sequencer
class App {
  static init() {
    console.log('%c ◆ AUDIO VISUALIZER SYSTEM initialized ◆ ', 'background: #0000FF; color: #FFF; font-size: 16px; padding: 5px;');
    
    const ui = new UIController();
    const env = new Environment();
    const glitch = new GlitchSystem();
    // Instantiating AppNavigator instead of Navigator
    const nav = new AppNavigator();

    // Start UI Processes
    ui.init();
    
    // Start Background Processes
    env.init();
    
    // Start Glitch Logic
    glitch.init();
    
    // Start Navigation & Intro
    nav.init();
  }
}

// Boot up
window.addEventListener('load', App.init);
