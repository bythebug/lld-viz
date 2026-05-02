// renderer.js — Converts parsed class map + relationships into Mermaid classDiagram DSL

function simplifyParams(paramsStr) {
  if (!paramsStr) return '';
  return paramsStr
    .split(',')
    .map(p => p.trim())
    .filter(p => p !== 'self' && p !== 'cls' && p !== '*' && p !== '' && !p.startsWith('**'))
    .map(p => {
      const noDefault = p.split('=')[0].trim();
      const colonIdx = noDefault.indexOf(':');
      if (colonIdx !== -1) {
        const pname = noDefault.slice(0, colonIdx).trim().replace(/^\*/, '');
        const ptype = noDefault.slice(colonIdx + 1).trim();
        const shortType = ptype.replace(/\[.*\]/, '').trim();
        return `${pname}: ${shortType}`;
      }
      return noDefault.replace(/^\*/, '');
    })
    .join(', ');
}

function sanitizeMermaidLabel(str) {
  return str
    .replace(/</g, '')
    .replace(/>/g, '')
    .replace(/\[/g, '')
    .replace(/\]/g, '')
    .replace(/\|/g, ' or ')
    .replace(/"/g, '')
    .replace(/\*/g, '')
    .trim();
}

function sanitizeClassName(name) {
  return name.replace(/[^a-zA-Z0-9_]/g, '_');
}

// Color palettes for Mermaid `style` directives — warm light vs dark
// Palette: Glaucous #7776bc · Periwinkle #cdc7e5 · Light Yellow #fffbdb
//          Banana Cream #ffec51 · Tomato #ff674d
const DIAGRAM_COLORS = {
  light: {
    // Abstract  → Periwinkle fill, Glaucous border
    abstract:  { fill: '#cdc7e5', stroke: '#7776bc', sw: '2.5px' },
    // Protocol  → Banana Cream fill, Tomato border
    protocol:  { fill: '#ffec51', stroke: '#ff674d', sw: '2px' },
    // Pattern   → Banana Cream fill, Tomato border (stronger)
    pattern:   { fill: '#ffec51', stroke: '#ff674d', sw: '2.5px' },
    // Concrete  → Light Yellow fill, Periwinkle border
    concrete:  { fill: '#fffbdb', stroke: '#cdc7e5', sw: '1.5px' },
  },
  dark: {
    abstract:  { fill: '#2E2060', stroke: '#cdc7e5', sw: '2px' },
    protocol:  { fill: '#3A2D00', stroke: '#ffec51', sw: '2px' },
    pattern:   { fill: '#3A2D00', stroke: '#ffec51', sw: '2.5px' },
    concrete:  { fill: '#1E1A0A', stroke: '#7776bc', sw: '1.5px' },
  },
};

function generateMermaid(classes, relationships, patterns, isDark = false) {
  if (classes.size === 0) return null;

  const lines = ['classDiagram'];
  const classNameMap = new Map();
  const COLORS = isDark ? DIAGRAM_COLORS.dark : DIAGRAM_COLORS.light;

  for (const name of classes.keys()) {
    classNameMap.set(name, sanitizeClassName(name));
  }

  // ── Class definitions ────────────────────────────────────────────────
  for (const [name, cls] of classes) {
    const safeName = classNameMap.get(name);
    const pattern = patterns.get(name);
    const bodyLines = [];

    // Stereotype
    if (cls.isProtocol) {
      bodyLines.push('<<Protocol>>');
    } else if (cls.isAbstract) {
      bodyLines.push('<<Abstract>>');
    } else if (pattern) {
      bodyLines.push(`<<${pattern}>>`);
    }

    // Attributes (cap at 8)
    const attrs = cls.attributes.slice(0, 8);
    for (const attr of attrs) {
      const typePart = attr.type ? sanitizeMermaidLabel(attr.type) + ' ' : '';
      const attrName = sanitizeMermaidLabel(attr.name);
      if (attrName) bodyLines.push(`${attr.visibility}${typePart}${attrName}`);
    }
    if (cls.attributes.length > 8) {
      bodyLines.push(`+...${cls.attributes.length - 8} more`);
    }

    // Methods (cap at 10, skip dunder display methods)
    const methods = cls.methods
      .filter(m => m.name !== '__str__' && m.name !== '__repr__')
      .slice(0, 10);

    for (const method of methods) {
      const abstractMark = method.isAbstract ? '*' : '';
      const staticMark   = method.isStatic   ? '$' : '';
      const params       = sanitizeMermaidLabel(simplifyParams(method.params));
      const ret          = method.returnType
        ? ' ' + sanitizeMermaidLabel(method.returnType.replace(/\[.*\]/, '').trim())
        : '';
      const mname = sanitizeMermaidLabel(method.name);
      if (mname) {
        bodyLines.push(`${method.visibility}${mname}(${params})${abstractMark}${staticMark}${ret}`);
      }
    }
    if (cls.methods.length > 10) {
      bodyLines.push(`+...${cls.methods.length - 10} more`);
    }

    if (bodyLines.length > 0) {
      lines.push(`  class ${safeName} {`);
      for (const bl of bodyLines) lines.push(`    ${bl}`);
      lines.push('  }');
    } else {
      lines.push(`  class ${safeName}`);
    }
  }

  // ── Relationships ────────────────────────────────────────────────────
  for (const rel of relationships) {
    const from = classNameMap.get(rel.from);
    const to   = classNameMap.get(rel.to);
    if (!from || !to) continue;

    if (rel.type === 'inheritance') {
      lines.push(`  ${from} <|-- ${to}`);
    } else if (rel.type === 'composition') {
      const label = rel.label ? ` : ${sanitizeMermaidLabel(rel.label)}` : '';
      lines.push(`  ${from} o-- ${to}${label}`);
    } else if (rel.type === 'dependency') {
      lines.push(`  ${from} ..> ${to}`);
    }
  }

  // ── Per-class style directives (warm color-coded by type) ────────────
  for (const [name, cls] of classes) {
    const safeName = classNameMap.get(name);
    const pat = patterns.get(name);
    let c;
    if (cls.isAbstract || cls.isProtocol) {
      c = cls.isProtocol ? COLORS.protocol : COLORS.abstract;
    } else if (pat) {
      c = COLORS.pattern;
    } else {
      c = COLORS.concrete;
    }
    lines.push(`  style ${safeName} fill:${c.fill},stroke:${c.stroke},stroke-width:${c.sw}`);
  }

  return lines.join('\n');
}
