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

  // ── Python lint helper ────────────────────────────────────────────────────
  // Checks class/def lines for missing ':' when brackets are balanced.
  CodeMirror.registerHelper('lint', 'python', function(text) {
    const found = [];
    const lines  = text.split('\n');
    let parenDepth = 0;

    lines.forEach((rawLine, i) => {
      // Strip string literals (rough) and inline comments so we don't
      // count parens inside strings/comments.
      const stripped = rawLine
        .replace(/(['"]).*?\1/g, '""')   // simple single/double quoted strings
        .replace(/#.*$/, '');             // inline comments

      for (const ch of stripped) {
        if ('([{'.includes(ch)) parenDepth++;
        else if (')]}'.includes(ch)) parenDepth = Math.max(0, parenDepth - 1);
      }

      const trimmed = rawLine.trim();
      if (!trimmed || trimmed.startsWith('#')) return;

      // class / def with balanced parens must end with ':'
      if (/^(class|def)\s+/.test(trimmed) && parenDepth === 0) {
        const clean = stripped.trimEnd();
        if (clean && !clean.endsWith(':')) {
          found.push({
            from:     CodeMirror.Pos(i, 0),
            to:       CodeMirror.Pos(i, rawLine.length),
            message:  trimmed.startsWith('class')
              ? "Class definition is missing ':'"
              : "Function definition is missing ':'",
            severity: 'error',
          });
        }
      }
    });

    return found;
  });

  // ── Python autocomplete hint function ─────────────────────────────────────
  // Merges anyword-from-document with Python + LLD keyword list.
  const PY_KEYWORDS = [
    // Python core
    'class','def','self','super','return','pass','None','True','False',
    'import','from','as','if','else','elif','for','while','in','not','and','or',
    'with','raise','try','except','finally','lambda','yield','assert','del',
    // Magic methods
    '__init__','__str__','__repr__','__len__','__eq__','__hash__',
    '__call__','__enter__','__exit__','__iter__','__next__','__new__',
    // Type hints
    'str','int','float','bool','list','dict','tuple','set',
    'Optional','List','Dict','Tuple','Set','Union','Any','Callable',
    // abc / decorators
    'ABC','abstractmethod','property','staticmethod','classmethod',
    // Common builtins
    'append','remove','extend','insert','pop','update','get',
    'isinstance','hasattr','getattr','setattr','len','range','print',
    // LLD / design-pattern words
    'Observer','Subject','Strategy','Context','Factory','Creator','Product',
    'Singleton','Decorator','Component','Builder','Director','Command',
    'Receiver','Invoker','Handler','Client','Adapter','Facade','Proxy',
  ];

  function pythonHint(cm) {
    const cursor = cm.getCursor();
    const token  = cm.getTokenAt(cursor);

    // Don't hint inside comments or string literals
    if (token.type === 'comment' || token.type === 'string') return;

    const anyResult = CodeMirror.hint.anyword(cm) || {
      list: [], from: cursor, to: cursor,
    };

    const word = token.string.toLowerCase();
    const inDoc = new Set(anyResult.list);

    const extra = PY_KEYWORDS.filter(k =>
      k.toLowerCase().startsWith(word) && k !== token.string && !inDoc.has(k)
    );

    return {
      list: [...anyResult.list, ...extra],
      from: anyResult.from,
      to:   anyResult.to,
    };
  }

  // ── Two-way class highlighting: editor ↔ diagram ────────────────────────
  //
  // Editor → Diagram (live): as the cursor moves, the class box that contains
  //   the current line glows in the diagram.
  //
  // Diagram → Editor (click): clicking a class box highlights that class's
  //   entire code block in the editor (persistent, not fading) and scrolls to it.
  //
  // Both directions share a single "active class" state so they stay in sync.

  let activeClassName   = null;        // which class is currently active
  let activeLineHandles = [];          // CodeMirror line handles for editor highlight
  let lastClasses       = new Map();   // class map from last successful render
  let diagramBoxMap     = new Map();   // className → SVG <g> element

  // ── Compute start/end line ranges for each class ─────────────────────────
  // endLine = line before the next peer class at the same or lower indent,
  // or the last line of the file.
  function computeClassRanges(classes, code) {
    const lines = code.split('\n');
    for (const [, cls] of classes) {
      if (cls.lineNumber === undefined) continue;
      const classIndent = getIndent(lines[cls.lineNumber] || '');
      let endLine = lines.length - 1;
      for (let j = cls.lineNumber + 1; j < lines.length; j++) {
        const t = lines[j].trimStart();
        if (!t) continue; // blank line — keep scanning
        if (getIndent(lines[j]) <= classIndent) { endLine = j - 1; break; }
      }
      cls.endLine = endLine;
    }
  }

  // ── Which class does line `n` belong to? ─────────────────────────────────
  // Returns the innermost class whose [lineNumber, endLine] range contains n.
  function classAtLine(lineNum) {
    let best = null;
    let bestStart = -1;
    for (const [name, cls] of lastClasses) {
      if (cls.lineNumber === undefined || cls.endLine === undefined) continue;
      if (lineNum >= cls.lineNumber && lineNum <= cls.endLine) {
        // Prefer the innermost (latest start = most nested)
        if (cls.lineNumber > bestStart) { best = name; bestStart = cls.lineNumber; }
      }
    }
    return best;
  }

  // ── Diagram highlight ─────────────────────────────────────────────────────
  // We inject a <rect> overlay directly into the class-box group using getBBox()
  // so we don't rely on CSS filter (which gets clipped by the SVG viewport).
  function clearDiagramHighlight() {
    if (!lastSvgEl) return;
    lastSvgEl.querySelectorAll('.lld-highlight-overlay').forEach(el => el.remove());
  }

  function applyDiagramHighlight(name) {
    if (!name) return;
    const box = diagramBoxMap.get(name);
    if (!box) return;

    // Remove any stale overlay on this box
    box.querySelector('.lld-highlight-overlay')?.remove();

    // Use getBBox() to get the tight bounding box of the class group's content,
    // then draw a highlight rect on top (in the group's own coordinate space).
    let bb;
    try { bb = box.getBBox(); } catch { return; }
    if (!bb || bb.width === 0) return;

    const NS = 'http://www.w3.org/2000/svg';
    const overlay = document.createElementNS(NS, 'rect');
    overlay.setAttribute('x',      bb.x - 3);
    overlay.setAttribute('y',      bb.y - 3);
    overlay.setAttribute('width',  bb.width  + 6);
    overlay.setAttribute('height', bb.height + 6);
    overlay.setAttribute('rx', '6');
    overlay.setAttribute('fill', 'none');
    overlay.setAttribute('stroke', '#ff674d');
    overlay.setAttribute('stroke-width', '2.5');
    overlay.setAttribute('class', 'lld-highlight-overlay');
    overlay.style.pointerEvents = 'none';
    box.appendChild(overlay);
  }

  // ── Editor highlight ──────────────────────────────────────────────────────
  function clearEditorHighlight() {
    activeLineHandles.forEach(h => editor.removeLineClass(h, 'wrap', 'lld-editor-active'));
    activeLineHandles = [];
  }

  function applyEditorHighlight(name) {
    if (!lastClasses.has(name)) return;
    const cls = lastClasses.get(name);
    if (cls.lineNumber === undefined) return;
    const end = cls.endLine !== undefined ? cls.endLine : cls.lineNumber;
    for (let i = cls.lineNumber; i <= end; i++) {
      activeLineHandles.push(editor.addLineClass(i, 'wrap', 'lld-editor-active'));
    }
  }

  // ── Set the active class (both sides update together) ─────────────────────
  function setActiveClass(name, { scrollEditor = false } = {}) {
    if (name === activeClassName && !scrollEditor) return;
    activeClassName = name;

    clearDiagramHighlight();
    clearEditorHighlight();

    if (name) {
      applyDiagramHighlight(name);
      applyEditorHighlight(name);
      if (scrollEditor && lastClasses.has(name)) {
        const cls = lastClasses.get(name);
        editor.focus();
        editor.setCursor(cls.lineNumber, 0);
        editor.scrollIntoView({ line: cls.lineNumber, ch: 0 }, 100);
      }
    }
  }

  // ── Wire click handlers onto the SVG after each render ───────────────────
  function wireClassClicks(svgEl, classes) {
    diagramBoxMap.clear();
    const classNames = new Set(classes.keys());

    svgEl.querySelectorAll('text').forEach(textEl => {
      const name = textEl.textContent.trim();
      if (!classNames.has(name)) return;
      if (diagramBoxMap.has(name)) return; // only register first match per class

      // Walk up to the class-box <g>: the one with <rect> direct children.
      let box = textEl;
      for (let i = 0; i < 8; i++) {
        const p = box.parentElement;
        if (!p || p === svgEl) break;
        box = p;
        if (box.tagName.toLowerCase() === 'g' &&
            Array.from(box.children).some(c => c.tagName.toLowerCase() === 'rect')) break;
      }

      diagramBoxMap.set(name, box);
      box.style.cursor = 'pointer';

      box.addEventListener('click', () => setActiveClass(name, { scrollEditor: true }));
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
    gutters: ['CodeMirror-lint-markers'],
    lint: { lintOnChange: true, delay: 400 },
    extraKeys: {
      // Smart indent: indent current line(s) respecting Python context
      Tab: cm => {
        if (cm.somethingSelected()) {
          cm.indentSelection('add');
        } else {
          cm.execCommand('indentMore');
        }
      },
      'Shift-Tab': cm => cm.indentSelection('subtract'),
      'Ctrl-Enter': () => render(true),
      'Cmd-Enter':  () => render(true),
      'Ctrl-Space': cm => CodeMirror.showHint(cm, pythonHint, { completeSingle: false }),
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

  // ── Editor → Diagram: highlight class box as cursor moves ────────────────
  editor.on('cursorActivity', () => {
    const name = classAtLine(editor.getCursor().line);
    setActiveClass(name);
  });

  // Auto-trigger autocomplete while typing (skip navigation/modifier keys)
  const NO_HINT_KEYS = new Set([
    'ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Enter','Escape','Tab',
    'Backspace','Delete','Home','End','PageUp','PageDown',
    'Shift','Control','Alt','Meta','CapsLock',
    'F1','F2','F3','F4','F5','F6','F7','F8','F9','F10','F11','F12',
  ]);
  editor.on('keyup', (cm, event) => {
    if (NO_HINT_KEYS.has(event.key)) return;
    if (cm.state.completionActive) return;
    const cursor = cm.getCursor();
    const token  = cm.getTokenAt(cursor);
    if (token.type === 'comment' || token.type === 'string') return;
    // Trigger after 2+ characters of a word
    if (token.string && token.string.trim().length >= 2 && /\w/.test(token.string)) {
      CodeMirror.showHint(cm, pythonHint, { completeSingle: false });
    }
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
        wireClassClicks(svgEl, classes);
        lastSvgEl = svgEl;
        applyZoom();
      }

      // Store classes with line ranges so cursorActivity can use them
      lastClasses = classes;
      computeClassRanges(lastClasses, code);

      // Re-apply active highlight (diagram was just re-rendered from scratch)
      activeClassName = null; // force refresh
      const cursorLine = editor.getCursor().line;
      setActiveClass(classAtLine(cursorLine));

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

  // ── Syntax reference panel ────────────────────────────────────────────────
  const refPanel   = document.getElementById('syntax-ref-panel');
  const btnRef     = document.getElementById('btn-syntax-ref');
  const btnRefClose = document.getElementById('btn-ref-close');

  btnRef.addEventListener('click', () => {
    const isHidden = refPanel.hidden;
    refPanel.hidden = !isHidden;
    btnRef.classList.toggle('ref-toggle-active', isHidden);
  });
  btnRefClose.addEventListener('click', () => {
    refPanel.hidden = true;
    btnRef.classList.remove('ref-toggle-active');
  });

  editor.setValue(STARTER);
  render(true);

})();
