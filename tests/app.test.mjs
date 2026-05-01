import test from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp } from '../js/app.js';

function createBundle(times) {
  return {
    meta: {
      scenarioId: 'task-3-regression',
      title: 'Task 3 Regression',
      description: 'Task 3 regression fixture',
      source: 'test',
      phaseLabels: ['phase-a']
    },
    bounds: [-1, -1, 1, 1],
    attractors: [],
    fields: [],
    frames: times.map((time, index) => ({
      step: index,
      t: time,
      positions: [[index, index]],
      density: [[0]],
      clusters: [],
      observables: {}
    }))
  };
}

function createRoot(renderCalls) {
  return {
    getElementById(id) {
      if (id !== 'scene') {
        throw new Error(`unexpected element lookup: ${id}`);
      }

      return {
        width: 960,
        height: 540,
        getContext() {
          return {
            clearRect() {
              renderCalls.push('clearRect');
            },
            fillRect() {
              renderCalls.push('fillRect');
            },
            strokeRect() {
              renderCalls.push('strokeRect');
            },
            beginPath() {},
            arc() {},
            fill() {},
            set fillStyle(value) {},
            set strokeStyle(value) {},
            set lineWidth(value) {}
          };
        }
      };
    }
  };
}

function createDomEnvironment(renderCalls) {
  const documentMock = {
    createElement(tagName) {
      const element = createElementNode(tagName, documentMock);
      return element;
    },
    getElementById(id) {
      return id === 'scene' ? scene : null;
    }
  };

  const shell = createElementNode('div', documentMock);
  const stage = createElementNode('div', documentMock);
  const scene = createCanvasNode(renderCalls, documentMock, shell);

  stage.appendChild(scene);
  shell.appendChild(stage);

  return {
    document: documentMock,
    shell,
    stage,
    scene
  };
}

function createElementNode(tagName, ownerDocument) {
  const node = {
    tagName: String(tagName).toUpperCase(),
    ownerDocument,
    parentElement: null,
    children: [],
    style: {},
    textContent: '',
    appendChild(child) {
      if (child.parentElement) {
        child.parentElement.removeChild(child);
      }

      this.children.push(child);
      child.parentElement = this;
      return child;
    },
    append(...children) {
      for (const child of children) {
        this.appendChild(child);
      }
    },
    insertBefore(child, before) {
      if (!before) {
        return this.appendChild(child);
      }

      const index = this.children.indexOf(before);
      if (index === -1) {
        return this.appendChild(child);
      }

      if (child.parentElement) {
        child.parentElement.removeChild(child);
      }

      this.children.splice(index, 0, child);
      child.parentElement = this;
      return child;
    },
    removeChild(child) {
      const index = this.children.indexOf(child);
      if (index === -1) {
        return child;
      }

      this.children.splice(index, 1);
      child.parentElement = null;
      return child;
    },
    replaceChildren(...children) {
      for (const child of this.children) {
        child.parentElement = null;
      }

      this.children = [];
      for (const child of children) {
        this.appendChild(child);
      }
    },
    remove() {
      if (this.parentElement) {
        this.parentElement.removeChild(this);
      }
    }
  };

  Object.defineProperty(node, 'nextSibling', {
    configurable: true,
    enumerable: true,
    get() {
      if (!node.parentElement) {
        return null;
      }

      const siblings = node.parentElement.children;
      const index = siblings.indexOf(node);
      return index >= 0 ? siblings[index + 1] ?? null : null;
    }
  });

  return node;
}

function createCanvasNode(renderCalls, ownerDocument, shell) {
  const canvas = createElementNode('canvas', ownerDocument);
  canvas.width = 960;
  canvas.height = 540;
  canvas.closest = (selector) => (selector === '.app-shell' ? shell : null);
  canvas.getContext = () => ({
    clearRect() {
      renderCalls.push('clearRect');
    },
    fillRect() {
      renderCalls.push('fillRect');
    },
    strokeRect() {
      renderCalls.push('strokeRect');
    },
    beginPath() {},
    arc() {},
    fill() {},
    set fillStyle(value) {},
    set strokeStyle(value) {},
    set lineWidth(value) {}
  });

  return canvas;
}

test('initializeApp stops replay at the last frame without advancing past it', async () => {
  const renderCalls = [];
  const scheduledCallbacks = [];
  const app = initializeApp(createRoot(renderCalls), {
    fetchImpl: async () => ({
      ok: true,
      async json() {
        return createBundle([0, 0.2]);
      }
    }),
    requestAnimationFrame(callback) {
      scheduledCallbacks.push(callback);
      return scheduledCallbacks.length;
    },
    cancelAnimationFrame() {}
  });

  await app.ready;
  assert.equal(scheduledCallbacks.length, 1);

  scheduledCallbacks[0](1000);
  assert.equal(scheduledCallbacks.length, 2);

  scheduledCallbacks[1](1200);

  assert.equal(app.replayController.getState().frameIndex, 1);
  assert.equal(app.replayController.getState().isPlaying, false);
  assert.equal(scheduledCallbacks.length, 2);
  assert.ok(renderCalls.length > 0);
});

test('dispose before bundle load prevents later init render and raf scheduling', async () => {
  const renderCalls = [];
  let resolveFetch;
  const app = initializeApp(createRoot(renderCalls), {
    fetchImpl: async () => new Promise((resolve) => {
      resolveFetch = () => resolve({
        ok: true,
        async json() {
          return createBundle([0, 0.2]);
        }
      });
    }),
    requestAnimationFrame() {
      throw new Error('raf should not be scheduled after dispose');
    },
    cancelAnimationFrame() {}
  });

  app.dispose();
  resolveFetch();
  await app.ready;

  assert.deepEqual(renderCalls, []);
});

test('initializeApp and dispose tolerate missing requestAnimationFrame callbacks', async () => {
  const renderCalls = [];
  const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
  const originalCancelAnimationFrame = globalThis.cancelAnimationFrame;

  try {
    globalThis.requestAnimationFrame = undefined;
    globalThis.cancelAnimationFrame = undefined;

    const app = initializeApp(createRoot(renderCalls), {
      fetchImpl: async () => ({
        ok: true,
        async json() {
          return createBundle([0, 0.2]);
        }
      })
    });

    await app.ready;
    app.dispose();

    assert.ok(renderCalls.length > 0);
  } finally {
    globalThis.requestAnimationFrame = originalRequestAnimationFrame;
    globalThis.cancelAnimationFrame = originalCancelAnimationFrame;
  }
});

test('initializeApp cleans up cleanly when bundle loading fails', async () => {
  const renderCalls = [];
  const app = initializeApp(createRoot(renderCalls), {
    fetchImpl: async () => {
      throw new Error('boom');
    }
  });

  await assert.rejects(app.ready, /boom/);
  assert.equal(renderCalls.length, 0);
});

test('repeated init/dispose does not leak metrics DOM nodes', async () => {
  const renderCalls = [];
  const originalDocument = globalThis.document;
  const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
  const originalCancelAnimationFrame = globalThis.cancelAnimationFrame;
  const dom = createDomEnvironment(renderCalls);

  try {
    globalThis.document = dom.document;
    globalThis.requestAnimationFrame = undefined;
    globalThis.cancelAnimationFrame = undefined;

    const createOptions = () => ({
      fetchImpl: async () => ({
        ok: true,
        async json() {
          return createBundle([0, 0.2]);
        }
      })
    });

    const firstApp = initializeApp(dom.document, createOptions());
    await firstApp.ready;
    assert.equal(dom.shell.children.filter((child) => child.tagName === 'ASIDE').length, 1);
    firstApp.dispose();
    assert.equal(dom.shell.children.filter((child) => child.tagName === 'ASIDE').length, 0);

    const secondApp = initializeApp(dom.document, createOptions());
    await secondApp.ready;
    assert.equal(dom.shell.children.filter((child) => child.tagName === 'ASIDE').length, 1);
    secondApp.dispose();
    assert.equal(dom.shell.children.filter((child) => child.tagName === 'ASIDE').length, 0);
  } finally {
    globalThis.document = originalDocument;
    globalThis.requestAnimationFrame = originalRequestAnimationFrame;
    globalThis.cancelAnimationFrame = originalCancelAnimationFrame;
  }
});

test('repeated init/dispose does not leak controls DOM nodes', async () => {
  const renderCalls = [];
  const originalDocument = globalThis.document;
  const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
  const originalCancelAnimationFrame = globalThis.cancelAnimationFrame;
  const dom = createDomEnvironment(renderCalls);

  try {
    globalThis.document = dom.document;
    globalThis.requestAnimationFrame = undefined;
    globalThis.cancelAnimationFrame = undefined;

    const createOptions = () => ({
      fetchImpl: async () => ({
        ok: true,
        async json() {
          return createBundle([0, 0.2]);
        }
      })
    });

    const firstApp = initializeApp(dom.document, createOptions());
    await firstApp.ready;
    assert.equal(dom.shell.children.filter((child) => child.className === 'replay-controls').length, 1);
    firstApp.dispose();
    assert.equal(dom.shell.children.filter((child) => child.className === 'replay-controls').length, 0);

    const secondApp = initializeApp(dom.document, createOptions());
    await secondApp.ready;
    assert.equal(dom.shell.children.filter((child) => child.className === 'replay-controls').length, 1);
    secondApp.dispose();
    assert.equal(dom.shell.children.filter((child) => child.className === 'replay-controls').length, 0);
  } finally {
    globalThis.document = originalDocument;
    globalThis.requestAnimationFrame = originalRequestAnimationFrame;
    globalThis.cancelAnimationFrame = originalCancelAnimationFrame;
  }
});

test('dispose restores the original canvas getContext method', async () => {
  const renderCalls = [];
  const originalDocument = globalThis.document;
  const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
  const originalCancelAnimationFrame = globalThis.cancelAnimationFrame;
  const dom = createDomEnvironment(renderCalls);
  const originalGetContext = dom.scene.getContext;

  try {
    globalThis.document = dom.document;
    globalThis.requestAnimationFrame = undefined;
    globalThis.cancelAnimationFrame = undefined;

    const app = initializeApp(dom.document, {
      fetchImpl: async () => ({
        ok: true,
        async json() {
          return createBundle([0, 0.2]);
        }
      })
    });

    await app.ready;
    app.dispose();

    assert.equal(dom.scene.getContext, originalGetContext);
  } finally {
    globalThis.document = originalDocument;
    globalThis.requestAnimationFrame = originalRequestAnimationFrame;
    globalThis.cancelAnimationFrame = originalCancelAnimationFrame;
  }
});

test('DOMContentLoaded bootstrap does not create a second app after manual initializeApp', async () => {
  const renderCalls = [];
  const originalDocument = globalThis.document;
  const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
  const originalCancelAnimationFrame = globalThis.cancelAnimationFrame;
  const listeners = {};
  const shell = createElementNode('div', null);
  const stage = createElementNode('div', null);
  const scene = createCanvasNode(renderCalls, null, shell);

  stage.appendChild(scene);
  shell.appendChild(stage);

  const documentMock = {
    readyState: 'loading',
    createElement(tagName) {
      return createElementNode(tagName, documentMock);
    },
    addEventListener(type, handler, options) {
      listeners[type] = { handler, options };
    },
    getElementById(id) {
      return id === 'scene' ? scene : null;
    }
  };

  try {
    globalThis.document = documentMock;
    globalThis.requestAnimationFrame = undefined;
    globalThis.cancelAnimationFrame = undefined;

    const moduleUrl = new URL('../js/app.js', import.meta.url);
    moduleUrl.search = `bootstrap=${Date.now()}`;
    const appModule = await import(moduleUrl.href);

    const manualApp = appModule.initializeApp(documentMock, {
      fetchImpl: async () => ({
        ok: true,
        async json() {
          return createBundle([0, 0.2]);
        }
      })
    });

    await manualApp.ready;
    assert.equal(shell.children.filter((child) => child.tagName === 'ASIDE').length, 1);

    listeners.DOMContentLoaded.handler();
    assert.equal(shell.children.filter((child) => child.tagName === 'ASIDE').length, 1);

    manualApp.dispose();
  } finally {
    globalThis.document = originalDocument;
    globalThis.requestAnimationFrame = originalRequestAnimationFrame;
    globalThis.cancelAnimationFrame = originalCancelAnimationFrame;
  }
});

test('DOMContentLoaded bootstrap retries after a synchronous bootstrap failure', async () => {
  const renderCalls = [];
  const originalDocument = globalThis.document;
  const originalFetch = globalThis.fetch;
  const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
  const originalCancelAnimationFrame = globalThis.cancelAnimationFrame;
  const listeners = {};
  let sceneNode = null;
  const shell = createElementNode('div', null);
  const stage = createElementNode('div', null);

  shell.appendChild(stage);

  const documentMock = {
    readyState: 'loading',
    createElement(tagName) {
      return createElementNode(tagName, documentMock);
    },
    addEventListener(type, handler, options) {
      listeners[type] = { handler, options };
    },
    getElementById(id) {
      return id === 'scene' ? sceneNode : null;
    }
  };

  try {
    globalThis.document = documentMock;
    globalThis.fetch = async () => ({
      ok: true,
      async json() {
        return createBundle([0, 0.2]);
      }
    });
    globalThis.requestAnimationFrame = undefined;
    globalThis.cancelAnimationFrame = undefined;

    const moduleUrl = new URL('../js/app.js', import.meta.url);
    moduleUrl.search = `bootstrap-retry=${Date.now()}`;
    await import(moduleUrl.href);

    assert.doesNotThrow(() => listeners.DOMContentLoaded.handler());
    await new Promise((resolve) => setTimeout(resolve, 0));

    sceneNode = createCanvasNode(renderCalls, documentMock, shell);
    stage.appendChild(sceneNode);

    listeners.DOMContentLoaded.handler();
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.equal(shell.children.filter((child) => child.className === 'replay-controls').length, 1);
  } finally {
    globalThis.document = originalDocument;
    globalThis.fetch = originalFetch;
    globalThis.requestAnimationFrame = originalRequestAnimationFrame;
    globalThis.cancelAnimationFrame = originalCancelAnimationFrame;
  }
});

test('initializeApp derives stable timing from sparse irregular timestamps', async () => {
  const renderCalls = [];
  const scheduledCallbacks = [];
  const app = initializeApp(createRoot(renderCalls), {
    fetchImpl: async () => ({
      ok: true,
      async json() {
        return createBundle([0, 0.5, 2.5, 3.0]);
      }
    }),
    requestAnimationFrame(callback) {
      scheduledCallbacks.push(callback);
      return scheduledCallbacks.length;
    },
    cancelAnimationFrame() {}
  });

  await app.ready;

  assert.equal(app.replayController.getState().fps, 2);
  assert.equal(app.replayController.getState().isPlaying, true);
  assert.equal(scheduledCallbacks.length, 1);
  assert.ok(renderCalls.length > 0);
});

test('initializeApp uses a true median for even-sized positive timestamp deltas', async () => {
  const renderCalls = [];
  const scheduledCallbacks = [];
  const app = initializeApp(createRoot(renderCalls), {
    fetchImpl: async () => ({
      ok: true,
      async json() {
        return createBundle([0, 0.1, 0.4, 0.9, 1.8]);
      }
    }),
    requestAnimationFrame(callback) {
      scheduledCallbacks.push(callback);
      return scheduledCallbacks.length;
    },
    cancelAnimationFrame() {}
  });

  await app.ready;

  assert.equal(app.replayController.getState().fps, 2.5);
  assert.equal(scheduledCallbacks.length, 1);
  assert.ok(renderCalls.length > 0);
});
