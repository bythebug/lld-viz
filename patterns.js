// patterns.js — Design pattern detection heuristics
// Returns a Map of className -> patternLabel based on structural signals.

function detectPatterns(classes, relationships) {
  const patterns = new Map();

  for (const [name, cls] of classes) {
    const methodNames = cls.methods.map(m => m.name);
    const attrNames   = cls.attributes.map(a => a.name);
    const attrTypes   = cls.attributes.map(a => a.type || '');

    // --- Singleton ---
    // Has a class-level _instance attribute AND get_instance / __new__ method
    const hasSingletonAttr = attrNames.some(a =>
      ['_instance', '__instance', 'instance', '_singleton'].includes(a));
    const hasSingletonMethod = methodNames.some(m =>
      ['get_instance', 'getInstance', '__new__'].includes(m));
    if (hasSingletonAttr && hasSingletonMethod) {
      patterns.set(name, 'Singleton');
      continue;
    }

    // --- Observer / Subject ---
    const hasObserverList = attrTypes.some(t => t && (
      t.includes('List') || t.includes('list') || t.includes('Set') || t.includes('set')
    ));
    const hasNotify = methodNames.some(m =>
      ['notify', 'notify_all', 'notify_observers', 'emit'].includes(m));
    const hasAttach = methodNames.some(m =>
      ['subscribe', 'attach', 'register', 'add_observer', 'add_listener', 'listen'].includes(m));
    const hasDetach = methodNames.some(m =>
      ['unsubscribe', 'detach', 'remove_observer', 'remove_listener'].includes(m));
    if (hasObserverList && hasNotify && (hasAttach || hasDetach)) {
      patterns.set(name, 'Subject');
      continue;
    }

    // --- Observer (listener side) ---
    const hasUpdate = methodNames.some(m => ['update', 'on_event', 'handle', 'on_notify'].includes(m));
    const isObserverChild = cls.parents.some(p => {
      const lp = p.toLowerCase();
      return lp.includes('observer') || lp.includes('listener') || lp.includes('handler');
    });
    if (isObserverChild || (cls.isAbstract && hasUpdate && methodNames.length <= 3)) {
      if (!patterns.has(name)) {
        // only if it looks like a pure observer interface
        const abstractCount = cls.methods.filter(m => m.isAbstract).length;
        if (abstractCount === 1 && hasUpdate) {
          patterns.set(name, 'Observer');
          continue;
        }
      }
    }

    // --- Strategy ---
    // Abstract class with a single abstract execute-like method
    const abstractMethods = cls.methods.filter(m => m.isAbstract);
    const executeNames = ['execute', 'run', 'apply', 'sort', 'handle', 'process',
                          'calculate', 'compute', 'perform', 'do'];
    if (cls.isAbstract && abstractMethods.length === 1 &&
        executeNames.includes(abstractMethods[0].name)) {
      patterns.set(name, 'Strategy');
      continue;
    }

    // --- Template Method ---
    // Has a final template method + multiple abstract steps
    const hasTemplateMethod = methodNames.some(m =>
      ['template_method', 'run', 'execute', 'process'].includes(m));
    if (cls.isAbstract && abstractMethods.length >= 2 && hasTemplateMethod) {
      patterns.set(name, 'Template');
      continue;
    }

    // --- Factory Method ---
    // Abstract class with abstract create_* method
    const abstractCreateMethods = abstractMethods.filter(m =>
      m.name.startsWith('create_') || m.name.startsWith('make_') ||
      m.name === 'create' || m.name === 'build' || m.name === 'get_product');
    if (cls.isAbstract && abstractCreateMethods.length > 0) {
      patterns.set(name, 'Factory');
      continue;
    }

    // --- Concrete Factory / Builder ---
    const hasCreateMethod = methodNames.some(m =>
      m.startsWith('create_') || m.startsWith('make_') ||
      m === 'create' || m === 'build' || m === 'get_result');
    if (!cls.isAbstract && hasCreateMethod && cls.methods.length <= 6) {
      // Only label if no parent is already labeled as factory
      const parentIsFactory = cls.parents.some(p => {
        const pc = classes.get(p);
        return pc && patterns.get(p) === 'Factory';
      });
      if (!parentIsFactory) {
        patterns.set(name, 'Factory');
        continue;
      }
    }

    // --- Decorator Pattern ---
    // Inherits from something AND stores a reference of the same type as parent
    for (const parent of cls.parents) {
      if (classes.has(parent)) {
        const composesParent = attrTypes.some(t => t && t.includes(parent));
        if (composesParent) {
          patterns.set(name, 'Decorator');
          break;
        }
      }
    }
    if (patterns.has(name)) continue;

    // --- Command Pattern ---
    const hasExecute = methodNames.includes('execute');
    const hasUndo    = methodNames.some(m => ['undo', 'rollback', 'revert'].includes(m));
    if (hasExecute && hasUndo) {
      patterns.set(name, 'Command');
      continue;
    }
    if (cls.isAbstract && hasExecute && abstractMethods.some(m => m.name === 'execute')) {
      patterns.set(name, 'Command');
      continue;
    }

    // --- Builder ---
    const builderMethods = methodNames.filter(m =>
      m.startsWith('set_') || m.startsWith('with_') || m.startsWith('add_'));
    const hasBuildMethod = methodNames.some(m => ['build', 'get_result', 'construct'].includes(m));
    if (builderMethods.length >= 2 && hasBuildMethod) {
      patterns.set(name, 'Builder');
      continue;
    }

    // --- Facade ---
    // Non-abstract class that composes several other classes and has few public methods
    const composedCount = relationships.filter(r =>
      r.from === name && r.type === 'composition').length;
    const publicMethods = cls.methods.filter(m =>
      m.visibility === '+' && !m.name.startsWith('__'));
    if (!cls.isAbstract && composedCount >= 3 && publicMethods.length <= 5) {
      patterns.set(name, 'Facade');
      continue;
    }

    // --- Proxy / Adapter ---
    const hasProxyNames = ['request', 'forward', 'proxy', 'delegate', 'adapt', 'translate'];
    if (composedCount === 1 && cls.parents.length > 0 &&
        methodNames.some(m => hasProxyNames.includes(m))) {
      patterns.set(name, 'Proxy');
      continue;
    }

    // --- State ---
    const hasStateParent = cls.parents.some(p => p.toLowerCase().includes('state'));
    const stateMethodNames = ['handle', 'on_enter', 'on_exit', 'transition'];
    if (hasStateParent && methodNames.some(m => stateMethodNames.includes(m))) {
      patterns.set(name, 'State');
      continue;
    }
    if (cls.isAbstract) {
      const isStateLike = methodNames.some(m => stateMethodNames.includes(m));
      const classNameLower = name.toLowerCase();
      if (isStateLike && classNameLower.includes('state')) {
        patterns.set(name, 'State');
        continue;
      }
    }
  }

  return patterns;
}
