// parser.js — Python structural parser
// Extracts classes, attributes, methods, and relationships via line-by-line regex scanning.

const PATTERNS = {
  classDecl:    /^class\s+(\w+)\s*(?:\(([^)]*)\))?\s*:/,
  methodDecl:   /^def\s+(\w+)\s*\(([^)]*)\)\s*(?:->\s*([^:]+))?\s*:/,
  decorator:    /^@([\w.]+)/,
  instanceAttr: /self\.(\w+)\s*(?::\s*([A-Za-z_][\w\[\], |"']*))?\s*=/g,
  classAttr:    /^(\w+)\s*:\s*([A-Za-z_][\w\[\], |"']*)\s*(?:=.*)?$/,
  dunderName:   /^__\w+__$/,
};

const NON_CLASS_PARENTS = new Set([
  'object', 'Exception', 'BaseException', 'enum.Enum', 'Enum',
  'IntEnum', 'StrEnum', 'Flag', 'IntFlag',
  'str', 'int', 'float', 'bool', 'list', 'dict', 'tuple',
  'NamedTuple', 'typing.NamedTuple', 'TypedDict', 'typing.TypedDict',
]);

const ENUM_BASES = new Set(['Enum', 'IntEnum', 'StrEnum', 'Flag', 'IntFlag']);

function getIndent(line) {
  return line.match(/^(\s*)/)[1].length;
}

// Strip single-level type wrappers: ClassVar[X] → X, Optional[X] → X, etc.
function unwrapType(typeStr) {
  if (!typeStr) return typeStr;
  const wrapperRe = /^(?:ClassVar|Final|Optional|Required|NotRequired|Annotated|InitVar)\[(.+)\]$/;
  let t = typeStr.trim();
  let prev;
  do {
    prev = t;
    t = t.replace(wrapperRe, '$1').trim();
  } while (t !== prev);
  return t;
}

// Infer a type name from an assignment RHS expression.
function inferTypeFromRhs(rhs) {
  if (!rhs) return null;
  const s = rhs.trim();
  // Constructor call: ClassName(...)
  const ctorMatch = s.match(/^([A-Z][a-zA-Z_0-9]*)\s*\(/);
  if (ctorMatch) return ctorMatch[1];
  // Enum / constant access: EnumClass.MEMBER  (MEMBER must be ALL_CAPS)
  const enumRefMatch = s.match(/^([A-Z][a-zA-Z_0-9]*)\.([A-Z_][A-Z0-9_]*)\b/);
  if (enumRefMatch) return enumRefMatch[1];
  return null;
}

// Pre-process: join multi-line class/def signatures into a single line.
// Continuation lines are replaced with '' so the array length is preserved.
function joinDeclarationLines(lines) {
  const result = [...lines];
  for (let i = 0; i < result.length; i++) {
    const trimmed = result[i].trimStart();
    if (!trimmed.startsWith('class ') && !trimmed.startsWith('def ')) continue;

    // Count paren depth (strip strings/comments to avoid false counts)
    let depth = 0;
    const stripped = result[i]
      .replace(/(['"]).*?\1/g, '""')
      .replace(/#.*$/, '');
    for (const ch of stripped) {
      if ('([{'.includes(ch)) depth++;
      else if (')]}'.includes(ch)) depth = Math.max(0, depth - 1);
    }

    if (depth === 0) continue; // already balanced — nothing to join

    let j = i + 1;
    while (depth > 0 && j < result.length) {
      const cont = result[j]
        .replace(/(['"]).*?\1/g, '""')
        .replace(/#.*$/, '');
      for (const ch of cont) {
        if ('([{'.includes(ch)) depth++;
        else if (')]}'.includes(ch)) depth = Math.max(0, depth - 1);
      }
      result[i] = result[i] + ' ' + result[j].trim();
      result[j] = '';
      j++;
    }
  }
  return result;
}

// Build a class object from parsed parents + pending decorators
function makeClass(name, parentsRaw, pendingDecorators) {
  const parents = parentsRaw
    ? parentsRaw.split(',').map(p => p.trim()).filter(Boolean)
    : [];

  const filteredParents = parents.filter(p => !NON_CLASS_PARENTS.has(p));
  const bases = parents.map(p => (p.includes('.') ? p.split('.').pop() : p));

  return {
    name,
    parents: filteredParents,
    rawParents: parents,
    methods: [],
    attributes: [],
    isAbstract:   bases.some(b => ['ABC', 'ABCMeta'].includes(b)),
    isProtocol:   bases.some(b => b === 'Protocol'),
    isEnum:       bases.some(b => ENUM_BASES.has(b)),
    isNamedTuple: parents.some(p => p === 'NamedTuple' || p === 'typing.NamedTuple'),
    isTypedDict:  parents.some(p => p === 'TypedDict'  || p === 'typing.TypedDict'),
    isDataclass:  pendingDecorators.includes('dataclass'),
    decorators:   [...pendingDecorators],
  };
}

function parseClasses(code) {
  const lines = joinDeclarationLines(code.split('\n'));
  const classes = new Map();

  // Frame stack — each entry represents one active class scope.
  // { cls, classDeclarationIndent, classBodyIndent, currentMethodName, methodBodyIndent, seenAttrs }
  const stack = [];
  let pendingDecorators = [];

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const raw = lines[lineIdx];
    const trimmed = raw.trimStart();
    if (!trimmed || trimmed.startsWith('#')) {
      pendingDecorators = [];
      continue;
    }

    const indent = getIndent(raw);

    // Pop frames whose scope has ended: indent has returned to or above the
    // line where the class keyword itself appeared.
    while (stack.length > 0 && indent <= stack[stack.length - 1].classDeclarationIndent) {
      stack.pop();
    }

    const frame = stack.length > 0 ? stack[stack.length - 1] : null;

    // ── TOP-LEVEL CODE (no active frame) ────────────────────────────────
    if (!frame) {
      const decMatch = trimmed.match(PATTERNS.decorator);
      if (decMatch && indent === 0) {
        pendingDecorators.push(decMatch[1].split('.').pop());
        continue;
      }
      const classMatch = trimmed.match(PATTERNS.classDecl);
      if (classMatch && indent === 0) {
        const [, name, parentsRaw] = classMatch;
        const cls = makeClass(name, parentsRaw, pendingDecorators);
        cls.lineNumber = lineIdx;
        classes.set(name, cls);
        stack.push({
          cls,
          classDeclarationIndent: 0,
          classBodyIndent: null,
          currentMethodName: null,
          methodBodyIndent: null,
          seenAttrs: new Set(),
        });
        pendingDecorators = [];
        continue;
      }
      if (indent === 0) pendingDecorators = [];
      continue;
    }

    // ── INSIDE A CLASS FRAME ─────────────────────────────────────────────

    // 1. Establish classBodyIndent BEFORE the class-declaration check.
    //    (Required so nested class declarations can match indent === classBodyIndent)
    if (frame.classBodyIndent === null && indent > frame.classDeclarationIndent) {
      frame.classBodyIndent = indent;
    }

    const cbi = frame.classBodyIndent; // null or number

    // 2. Reset method tracking when indent steps back to class-body level.
    if (frame.currentMethodName && cbi !== null && indent <= cbi && trimmed.length > 0) {
      frame.currentMethodName = null;
      frame.methodBodyIndent = null;
    }

    // 3. Nested class declaration (directly at class-body indent, not inside a method).
    const classMatch = trimmed.match(PATTERNS.classDecl);
    if (classMatch && cbi !== null && indent === cbi && !frame.currentMethodName) {
      const [, name, parentsRaw] = classMatch;
      const cls = makeClass(name, parentsRaw, pendingDecorators);
      cls.lineNumber = lineIdx;
      classes.set(name, cls);
      stack.push({
        cls,
        classDeclarationIndent: indent,
        classBodyIndent: null,
        currentMethodName: null,
        methodBodyIndent: null,
        seenAttrs: new Set(),
      });
      pendingDecorators = [];
      continue;
    }

    // 4. Decorator at class-body level.
    const decMatch = trimmed.match(PATTERNS.decorator);
    if (decMatch && cbi !== null && indent === cbi) {
      pendingDecorators.push(decMatch[1].split('.').pop());
      continue;
    }

    // 5. Method declaration.
    const methodMatch = trimmed.match(PATTERNS.methodDecl);
    if (methodMatch && cbi !== null && indent === cbi) {
      const [, mname, params, returnType] = methodMatch;
      frame.cls.methods.push({
        name: mname,
        params: params || '',
        returnType: returnType ? returnType.trim() : null,
        visibility: (mname.startsWith('__') && !mname.endsWith('__')) ? '-'
                  : mname.startsWith('_') ? '#' : '+',
        isAbstract: pendingDecorators.includes('abstractmethod'),
        isStatic:   pendingDecorators.includes('staticmethod'),
        isClass:    pendingDecorators.includes('classmethod'),
        isProperty: pendingDecorators.includes('property'),
        isOverride: pendingDecorators.includes('override'),
      });
      frame.currentMethodName = mname;
      frame.methodBodyIndent = null;
      pendingDecorators = [];
      continue;
    }

    // 6. Establish method body indent.
    if (frame.currentMethodName && frame.methodBodyIndent === null && cbi !== null && indent > cbi) {
      frame.methodBodyIndent = indent;
    }

    // 7. Instance attributes — scans ALL methods.
    //    __init__ / __post_init__: always capture (typed, inferred, or bare).
    //    Other methods: capture only when a type is known (explicit or inferred).
    if (frame.currentMethodName) {
      const isInit = frame.currentMethodName === '__init__' ||
                     frame.currentMethodName === '__post_init__';
      for (const m of [...raw.matchAll(PATTERNS.instanceAttr)]) {
        const [, attrName, attrType] = m;
        if (PATTERNS.dunderName.test(attrName)) continue;
        if (frame.seenAttrs.has(attrName)) continue;

        let resolvedType = attrType ? unwrapType(attrType.trim()) : null;
        if (!resolvedType) {
          const eqIdx = raw.indexOf('=');
          if (eqIdx !== -1) resolvedType = inferTypeFromRhs(raw.slice(eqIdx + 1).trim());
        }

        if (!isInit && !resolvedType) continue; // non-init: skip bare untyped attrs

        frame.seenAttrs.add(attrName);
        frame.cls.attributes.push({
          name: attrName,
          type: resolvedType,
          visibility: (attrName.startsWith('__') && !attrName.endsWith('__')) ? '-'
                    : attrName.startsWith('_') ? '#' : '+',
        });
      }
    }

    // 8. Class-level attributes (at classBodyIndent, not a method/decorator line).
    if (cbi !== null && indent === cbi && !methodMatch && !decMatch) {
      // 8a. Type-annotated: name: Type [= value]
      const attrMatch = trimmed.match(PATTERNS.classAttr);
      if (attrMatch) {
        const [, attrName, attrType] = attrMatch;
        if (!PATTERNS.dunderName.test(attrName) && !frame.seenAttrs.has(attrName)) {
          frame.seenAttrs.add(attrName);
          frame.cls.attributes.push({
            name: attrName,
            type: unwrapType(attrType.trim()),
            visibility: attrName.startsWith('_') ? '#' : '+',
          });
        }
      } else {
        // 8b. Non-annotated assignment: name = value
        const eqMatch = trimmed.match(/^([a-zA-Z_]\w*)\s*=\s*(.*)$/);
        if (eqMatch) {
          const [, varName, rhs] = eqMatch;
          if (!PATTERNS.dunderName.test(varName) && !frame.seenAttrs.has(varName)) {
            const isAllCaps = /^[A-Z_][A-Z0-9_]*$/.test(varName);
            if (frame.cls.isEnum) {
              // Enum: only ALL_CAPS members
              if (isAllCaps) {
                frame.seenAttrs.add(varName);
                frame.cls.attributes.push({ name: varName, type: null, visibility: '+' });
              }
            } else {
              // Regular class: capture all (with RHS type inference where possible)
              frame.seenAttrs.add(varName);
              const vis = (varName.startsWith('__') && !varName.endsWith('__')) ? '-'
                        : varName.startsWith('_') ? '#' : '+';
              frame.cls.attributes.push({
                name: varName,
                type: inferTypeFromRhs(rhs.trim()),
                visibility: vis,
              });
            }
          }
        }
      }
    }

    pendingDecorators = [];
  }

  return classes;
}

function extractRelationships(classes) {
  const relationships = [];
  const seen = new Set();

  function addRel(rel) {
    const key = `${rel.type}:${rel.from}:${rel.to}`;
    if (!seen.has(key)) {
      seen.add(key);
      relationships.push(rel);
    }
  }

  // Extract class names from a type string like List[Engine], Optional[Driver], Engine | None
  function extractClassRefs(typeStr, knownClasses) {
    if (!typeStr) return [];
    return [...typeStr.matchAll(/\b([A-Z][a-zA-Z_0-9]*)\b/g)]
      .map(m => m[1])
      .filter(t => knownClasses.has(t));
  }

  for (const [className, cls] of classes) {
    // Inheritance
    for (const parent of cls.parents) {
      const parentName = parent.includes('.') ? parent.split('.').pop() : parent;
      if (classes.has(parentName) && parentName !== className) {
        addRel({ from: parentName, to: className, type: 'inheritance' });
      }
    }

    // Composition from typed attributes
    for (const attr of cls.attributes) {
      const refs = extractClassRefs(attr.type, classes).filter(r => r !== className);
      for (const ref of refs) {
        addRel({ from: className, to: ref, type: 'composition', label: attr.name });
      }
    }

    // Dependency from method params
    for (const method of cls.methods) {
      // Typed params (existing behaviour)
      const typedRefs = extractClassRefs(method.params, classes).filter(r => r !== className);
      for (const ref of typedRefs) {
        const alreadyComposed = relationships.some(
          r => r.from === className && r.to === ref && r.type === 'composition'
        );
        if (!alreadyComposed) addRel({ from: className, to: ref, type: 'dependency' });
      }

      // Untyped params: match lowercase param name against known class names
      if (method.params) {
        for (const tok of method.params.split(',')) {
          const p = tok.trim();
          if (!p || p === 'self' || p === 'cls' || p.startsWith('*')) continue;
          if (p.includes(':')) continue; // typed — already handled above
          const baseName = p.split('=')[0].trim();
          if (!baseName || baseName.length < 2) continue;
          for (const [knownClass] of classes) {
            if (knownClass !== className && knownClass.toLowerCase() === baseName.toLowerCase()) {
              const alreadyLinked = relationships.some(
                r => r.from === className && r.to === knownClass
              );
              if (!alreadyLinked) addRel({ from: className, to: knownClass, type: 'dependency' });
              break;
            }
          }
        }
      }
    }
  }

  return relationships;
}
