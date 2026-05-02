// app.js — Main application: editor init, live rendering, UX controls

(function () {

  // ── Mermaid theme configs ─────────────────────────────────────────────────
  // Palette: Glaucous #7776bc · Periwinkle #cdc7e5 · Light Yellow #fffbdb
  //          Banana Cream #ffec51 · Tomato #ff674d
  const MERMAID_LIGHT = {
    startOnLoad: false,
    theme: 'base',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, monospace',
    fontSize: 13,
    classDiagram: { diagramPadding: 32, htmlLabels: false },
    securityLevel: 'loose',
    themeVariables: {
      primaryColor:        '#7776bc',  // Glaucous — class header fill
      primaryTextColor:    '#FFFFFF',  // white on Glaucous header
      primaryBorderColor:  '#ff674d',  // Tomato border
      lineColor:           '#ff674d',  // Tomato arrows
      secondaryColor:      '#fffbdb',  // Light Yellow — body bg
      tertiaryColor:       '#fff5c0',  // slightly deeper yellow
      background:          '#fffbdb',
      mainBkg:             '#fffbdb',
      nodeBorder:          '#7776bc',
      clusterBkg:          '#fffbdb',
      titleColor:          '#2a2860',
      edgeLabelBackground: '#fffbdb',
      attributeBackgroundColorEven: '#fffbdb',
      attributeBackgroundColorOdd:  '#fff5c0',
      classText:           '#2a2860',
    },
  };

  const MERMAID_DARK = {
    startOnLoad: false,
    theme: 'base',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, monospace',
    fontSize: 13,
    classDiagram: { diagramPadding: 32, htmlLabels: false },
    securityLevel: 'loose',
    themeVariables: {
      primaryColor:        '#2D1B4E',
      primaryTextColor:    '#E2E8F0',
      primaryBorderColor:  '#6366F1',
      lineColor:           '#818CF8',
      secondaryColor:      '#1A1A2E',
      tertiaryColor:       '#0F0F1A',
      background:          '#0F0F1A',
      mainBkg:             '#1A1A2E',
      nodeBorder:          '#6366F1',
      clusterBkg:          '#16213E',
      titleColor:          '#E2E8F0',
      edgeLabelBackground: '#16213E',
      classText:           '#E2E8F0',
    },
  };

  // ── Colorize method vs attribute text in rendered SVG ────────────────────
  // Runs after Mermaid injects the SVG into the DOM.
  function colorizeDiagram(svgEl, dark) {
    const C = dark ? {
      method:    '#93C5FD',   // blue-300 — pops on dark bg
      attribute: '#FBB97B',   // amber-300 — warm on dark bg
      stereotype:'#C4B5FD',  // purple-300
      priv:      '#64748B',   // slate — de-emphasized
    } : {
      method:    '#7776bc',   // Glaucous — methods
      attribute: '#ff674d',   // Tomato — attributes
      stereotype:'#5a59a0',  // dark Glaucous — stereotypes
      priv:      '#a8a6cc',   // muted Periwinkle — private
    };

    svgEl.querySelectorAll('text').forEach(el => {
      const raw = el.textContent || '';
      const t = raw.trim();

      // Stereotype labels  <<Abstract>> etc.
      if (t.startsWith('<<') && t.endsWith('>>')) {
        el.style.fill = C.stereotype;
        el.setAttribute('font-style', 'italic');
        return;
      }

      // Member lines start with visibility marker
      if (/^[+\-#]/.test(t)) {
        const isPrivate = t.startsWith('-');
        if (isPrivate) {
          el.style.fill = C.priv;
        } else if (t.includes('(')) {
          // Method — has parentheses
          el.style.fill = C.method;
        } else {
          // Attribute — no parentheses
          el.style.fill = C.attribute;
        }
      }
    });
  }

  // ── Mermaid init ──────────────────────────────────────────────────────────
  mermaid.initialize(MERMAID_LIGHT);

  // ── CodeMirror editor init ────────────────────────────────────────────────
  const editor = CodeMirror.fromTextArea(document.getElementById('code-editor'), {
    mode: 'python',
    theme: 'dracula',
    lineNumbers: true,
    indentUnit: 4,
    tabSize: 4,
    indentWithTabs: false,
    matchBrackets: true,
    autoCloseBrackets: true,
    lineWrapping: false,
    extraKeys: {
      Tab: cm => {
        if (cm.somethingSelected()) cm.indentSelection('add');
        else cm.replaceSelection('    ', 'end');
      },
      'Ctrl-Enter': () => render(true),
      'Cmd-Enter':  () => render(true),
    },
  });

  // ── State ─────────────────────────────────────────────────────────────────
  let debounceTimer = null;
  let renderCounter = 0;
  let lastCode = '';
  let isDark = false;
  let lastSvgEl = null;

  const diagramOutput  = document.getElementById('diagram-output');
  const statusEl       = document.getElementById('status');
  const badgeEl        = document.getElementById('pattern-badges');
  const splitContainer = document.getElementById('split-container');
  let   splitPos       = 50;

  // ── Live rendering ────────────────────────────────────────────────────────
  editor.on('change', () => {
    clearTimeout(debounceTimer);
    setStatus('typing…', 'idle');
    debounceTimer = setTimeout(() => render(false), 400);
  });

  async function render(force = false) {
    const code = editor.getValue();
    if (!force && code === lastCode) return;
    lastCode = code;

    if (!code.trim()) {
      diagramOutput.innerHTML = '<div class="empty-state">Start typing Python classes<br>to see the diagram here.</div>';
      badgeEl.innerHTML = '';
      lastSvgEl = null;
      setStatus('ready', 'idle');
      return;
    }

    setStatus('rendering…', 'busy');

    try {
      const classes       = parseClasses(code);
      const relationships = extractRelationships(classes);
      const patterns      = detectPatterns(classes, relationships);
      const mermaidSrc    = generateMermaid(classes, relationships, patterns, isDark);

      if (!mermaidSrc) {
        diagramOutput.innerHTML = '<div class="empty-state">No classes detected yet.</div>';
        badgeEl.innerHTML = '';
        lastSvgEl = null;
        setStatus('ready', 'idle');
        return;
      }

      const id = `mermaid-render-${++renderCounter}`;
      const { svg } = await mermaid.render(id, mermaidSrc);

      diagramOutput.innerHTML = svg;
      const svgEl = diagramOutput.querySelector('svg');

      if (svgEl) {
        svgEl.style.maxWidth = '100%';
        svgEl.style.height = 'auto';
        svgEl.style.display = 'block';
        svgEl.style.margin = '0 auto';
        colorizeDiagram(svgEl, isDark);
        lastSvgEl = svgEl;
        // Reapply current zoom
        applyZoom();
      }

      updatePatternBadges(patterns);
      setStatus(
        `${classes.size} class${classes.size !== 1 ? 'es' : ''} · ${relationships.length} relationship${relationships.length !== 1 ? 's' : ''}`,
        'ok'
      );
    } catch (err) {
      setStatus('diagram error — check console', 'error');
      console.error('[LLD Viz] Mermaid render error:', err);
    }
  }

  function setStatus(msg, type) {
    statusEl.textContent = msg;
    statusEl.className = `status status-${type}`;
  }

  function updatePatternBadges(patterns) {
    if (patterns.size === 0) { badgeEl.innerHTML = ''; return; }
    const unique = [...new Set(patterns.values())];
    badgeEl.innerHTML = unique.map(p => `<span class="badge">${p}</span>`).join('');
  }

  // ── Example loader ────────────────────────────────────────────────────────
  document.getElementById('example-select').addEventListener('change', async function () {
    const val = this.value;
    if (!val) return;
    try {
      const res = await fetch(`./examples/${val}.py`);
      if (!res.ok) throw new Error('not found');
      const text = await res.text();
      editor.setValue(text);
      editor.clearHistory();
      render(true);
    } catch {
      setStatus(`Could not load example: ${val}`, 'error');
    }
    this.value = '';
  });

  // ── Export SVG ────────────────────────────────────────────────────────────
  document.getElementById('btn-export').addEventListener('click', () => {
    const svgEl = diagramOutput.querySelector('svg');
    if (!svgEl) return;
    const content = '<?xml version="1.0" encoding="UTF-8"?>\n' + svgEl.outerHTML;
    const blob = new Blob([content], { type: 'image/svg+xml' });
    triggerDownload(blob, 'lld-diagram.svg');
  });

  // ── Download ZIP (Python + SVG) ───────────────────────────────────────────
  document.getElementById('btn-download').addEventListener('click', async () => {
    const code  = editor.getValue();
    const svgEl = diagramOutput.querySelector('svg');

    if (!code.trim() && !svgEl) {
      setStatus('nothing to download yet', 'error');
      return;
    }

    try {
      const zip = new JSZip();

      if (code.trim()) {
        zip.file('design.py', code);
      }
      if (svgEl) {
        const svgContent = '<?xml version="1.0" encoding="UTF-8"?>\n' + svgEl.outerHTML;
        zip.file('diagram.svg', svgContent);
      }

      const blob = await zip.generateAsync({ type: 'blob' });
      triggerDownload(blob, 'lld-design.zip');
      setStatus('downloaded lld-design.zip', 'ok');
    } catch (err) {
      setStatus('zip failed — check console', 'error');
      console.error('[LLD Viz] ZIP error:', err);
    }
  });

  function triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a   = document.createElement('a');
    a.href    = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Theme (dark mode commented out — always light) ────────────────────────
  // function applyTheme(dark) {
  //   isDark = dark;
  //   document.body.classList.toggle('dark', dark);
  //   editor.setOption('theme', dark ? 'dracula' : 'eclipse');
  //   document.getElementById('btn-theme').textContent = dark ? '☀ Light' : '☾ Dark';
  //   mermaid.initialize(dark ? MERMAID_DARK : MERMAID_LIGHT);
  //   render(true);
  //   localStorage.setItem('lldviz-dark', dark ? '1' : '0');
  // }
  // document.getElementById('btn-theme').addEventListener('click', () => applyTheme(!isDark));
  // applyTheme(localStorage.getItem('lldviz-dark') === '1');

  // Always light mode for now
  isDark = false;
  editor.setOption('theme', 'eclipse');
  mermaid.initialize(MERMAID_LIGHT);

  // ── Draggable splitter ────────────────────────────────────────────────────
  const splitter = document.getElementById('splitter');
  let dragging = false;

  splitter.addEventListener('mousedown', e => {
    dragging = true;
    e.preventDefault();
    splitter.classList.add('dragging');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  });

  document.addEventListener('mousemove', e => {
    if (!dragging) return;
    const rect = splitContainer.getBoundingClientRect();
    let pct = ((e.clientX - rect.left) / rect.width) * 100;
    pct = Math.max(20, Math.min(80, pct));
    splitPos = pct;
    splitContainer.style.gridTemplateColumns = `${pct}fr 6px ${100 - pct}fr`;
  });

  document.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    splitter.classList.remove('dragging');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  });

  // ── Zoom (exposed so render() can reapply after re-render) ───────────────
  window._lldZoom = 1.0;

  function applyZoom() {
    const svg = diagramOutput.querySelector('svg');
    if (svg) {
      svg.style.transform = `scale(${window._lldZoom})`;
      svg.style.transformOrigin = 'top center';
    }
    document.getElementById('zoom-level').textContent =
      Math.round(window._lldZoom * 100) + '%';
  }

  document.getElementById('btn-zoom-in').addEventListener('click', () => {
    window._lldZoom = Math.min(3, window._lldZoom + 0.15);
    applyZoom();
  });
  document.getElementById('btn-zoom-out').addEventListener('click', () => {
    window._lldZoom = Math.max(0.3, window._lldZoom - 0.15);
    applyZoom();
  });
  document.getElementById('btn-zoom-fit').addEventListener('click', () => {
    window._lldZoom = 1.0;
    applyZoom();
  });

  diagramOutput.addEventListener('wheel', e => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      window._lldZoom += e.deltaY < 0 ? 0.1 : -0.1;
      window._lldZoom = Math.max(0.3, Math.min(3, window._lldZoom));
      applyZoom();
    }
  }, { passive: false });

  // ── Starter code ──────────────────────────────────────────────────────────
  const STARTER = `# Start typing your LLD design below
# The diagram updates live as you type!

from abc import ABC, abstractmethod
from typing import List


class Animal(ABC):
    def __init__(self, name: str, age: int):
        self.name: str = name
        self.age: int = age

    @abstractmethod
    def make_sound(self) -> str:
        pass

    def describe(self) -> str:
        return f"{self.name}, age {self.age}"


class Dog(Animal):
    def __init__(self, name: str, age: int, breed: str):
        super().__init__(name, age)
        self.breed: str = breed

    def make_sound(self) -> str:
        return "Woof!"

    def fetch(self) -> None:
        pass


class Cat(Animal):
    def __init__(self, name: str, age: int):
        super().__init__(name, age)
        self._indoor: bool = True

    def make_sound(self) -> str:
        return "Meow!"


class Shelter:
    def __init__(self):
        self.animals: List[Animal] = []

    def add_animal(self, animal: Animal) -> None:
        self.animals.append(animal)

    def remove_animal(self, animal: Animal) -> None:
        self.animals.remove(animal)

    def list_animals(self) -> List[Animal]:
        return self.animals
`;

  editor.setValue(STARTER);
  render(true);

})();
