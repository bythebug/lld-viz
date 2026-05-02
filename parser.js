// parser.js — Python structural parser
// Extracts classes, attributes, methods, and relationships via line-by-line regex scanning.

const PATTERNS = {
  classDecl:    /^class\s+(\w+)\s*(?:\(([^)]*)\))?\s*:/,
  methodDecl:   /^def\s+(\w+)\s*\(([^)]*)\)\s*(?:->\s*([^:]+))?\s*:/,
  decorator:    /^@(\w+)/,
  instanceAttr: /self\.(\w+)\s*(?::\s*([A-Za-z_][\w\[\], |"']*))?\s*=/g,
  classAttr:    /^(\w+)\s*:\s*([A-Za-z_][\w\[\], |"']*)\s*(?:=.*)?$/,
  dunderName:   /^__\w+__$/,
};

function getIndent(line) {
  return line.match(/^(\s*)/)[1].length;
}

function parseClasses(code) {
  const lines = code.split('\n');
  const classes = new Map();

  let currentClass = null;
  let classBodyIndent = null;
  let currentMethodName = null;
  let methodBodyIndent = null;
  let pendingDecorators = [];
  let seenAttrs = new Set();

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trimStart();
    if (!trimmed || trimmed.startsWith('#')) {
      pendingDecorators = [];
      continue;
    }
    const indent = getIndent(raw);

    // --- Left class scope ---
    if (currentClass && indent === 0 && trimmed.length > 0) {
      currentClass = null;
      classBodyIndent = null;
      currentMethodName = null;
      methodBodyIndent = null;
      seenAttrs = new Set();
    }

    // --- Class declaration (top-level only) ---
    const classMatch = trimmed.match(PATTERNS.classDecl);
    if (classMatch && indent === 0) {
      const [, name, parentsRaw] = classMatch;
      const parents = parentsRaw
        ? parentsRaw.split(',').map(p => p.trim()).filter(Boolean)
        : [];

      // Filter out known non-class parents
      const filteredParents = parents.filter(p =>
        !['object', 'Exception', 'BaseException', 'enum.Enum', 'Enum',
          'IntEnum', 'str', 'int', 'float', 'bool', 'list', 'dict', 'tuple'].includes(p)
      );

      currentClass = {
        name,
        parents: filteredParents,
        rawParents: parents,
        methods: [],
        attributes: [],
        isAbstract: parents.some(p => ['ABC', 'ABCMeta', 'abc.ABC', 'abc.ABCMeta'].includes(p)),
        isProtocol: parents.some(p => p === 'Protocol' || p === 'typing.Protocol'),
        isDataclass: false,
        decorators: [...pendingDecorators],
      };

      if (pendingDecorators.includes('dataclass')) {
        currentClass.isDataclass = true;
      }

      classes.set(name, currentClass);
      classBodyIndent = null;
      currentMethodName = null;
      methodBodyIndent = null;
      pendingDecorators = [];
      seenAttrs = new Set();
      continue;
    }

    if (!currentClass) {
      const decMatch = trimmed.match(PATTERNS.decorator);
      if (decMatch && indent === 0) {
        pendingDecorators.push(decMatch[1]);
      } else if (indent === 0) {
        pendingDecorators = [];
      }
      continue;
    }

    // Establish class body indent from first real line
    if (classBodyIndent === null && indent > 0) {
      classBodyIndent = indent;
    }

    // --- Decorator inside class ---
    const decMatch = trimmed.match(PATTERNS.decorator);
    if (decMatch && indent === classBodyIndent) {
      pendingDecorators.push(decMatch[1]);
      continue;
    }

    // --- Method declaration ---
    const methodMatch = trimmed.match(PATTERNS.methodDecl);
    if (methodMatch && indent === classBodyIndent) {
      const [, mname, params, returnType] = methodMatch;
      const isAbstract = pendingDecorators.includes('abstractmethod');
      const isStatic   = pendingDecorators.includes('staticmethod');
      const isClass    = pendingDecorators.includes('classmethod');
      const isProperty = pendingDecorators.includes('property');
      const isOverride = pendingDecorators.includes('override');

      const visibility = (mname.startsWith('__') && !mname.endsWith('__')) ? '-'
                       : mname.startsWith('_') ? '#'
                       : '+';

      currentClass.methods.push({
        name: mname,
        params: params || '',
        returnType: returnType ? returnType.trim() : null,
        visibility,
        isAbstract,
        isStatic,
        isClass,
        isProperty,
        isOverride,
      });

      currentMethodName = mname;
      methodBodyIndent = null;
      pendingDecorators = [];
      continue;
    }

    // Establish method body indent
    if (currentMethodName && methodBodyIndent === null && indent > classBodyIndent) {
      methodBodyIndent = indent;
    }

    // Reset method if we step back to class indent
    if (currentMethodName && indent <= classBodyIndent && trimmed.length > 0) {
      currentMethodName = null;
      methodBodyIndent = null;
    }

    // --- Instance attributes from __init__ ---
    if (currentMethodName === '__init__' || currentMethodName === '__post_init__') {
      const attrMatches = [...raw.matchAll(PATTERNS.instanceAttr)];
      for (const m of attrMatches) {
        const [, attrName, attrType] = m;
        if (!PATTERNS.dunderName.test(attrName) && !seenAttrs.has(attrName)) {
          seenAttrs.add(attrName);
          const vis = (attrName.startsWith('__') && !attrName.endsWith('__')) ? '-'
                    : attrName.startsWith('_') ? '#'
                    : '+';
          currentClass.attributes.push({
            name: attrName,
            type: attrType ? attrType.trim() : null,
            visibility: vis,
          });
        }
      }
    }

    // --- Class-level attributes (type-annotated) ---
    if (indent === classBodyIndent && !methodMatch) {
      const attrMatch = trimmed.match(PATTERNS.classAttr);
      if (attrMatch) {
        const [, attrName, attrType] = attrMatch;
        if (!PATTERNS.dunderName.test(attrName) && !seenAttrs.has(attrName)) {
          seenAttrs.add(attrName);
          const vis = attrName.startsWith('_') ? '#' : '+';
          currentClass.attributes.push({
            name: attrName,
            type: attrType ? attrType.trim() : null,
            visibility: vis,
          });
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
      // parent might be "module.ClassName" — take last part
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

    // Dependency from method parameter types (excluding already-composed)
    for (const method of cls.methods) {
      const refs = extractClassRefs(method.params, classes).filter(r => r !== className);
      for (const ref of refs) {
        const alreadyComposed = relationships.some(
          r => r.from === className && r.to === ref && r.type === 'composition'
        );
        if (!alreadyComposed) {
          addRel({ from: className, to: ref, type: 'dependency' });
        }
      }
    }
  }

  return relationships;
}
