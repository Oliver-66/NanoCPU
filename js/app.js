import { createReplayController } from './state/replay-controller.js';
import { loadScenarioBundle } from './data/frame-loader.js';
import { createSceneRenderer } from './render/scene-renderer.js';
import { createMetricsPanel } from './ui/metrics-panel.js';
import { createControls } from './ui/controls.js';

let autoBootstrapHandled = false;
let manualInitializeCount = 0;

function requireElement(root, id) {
  const element = root.getElementById(id);

  if (!element) {
    throw new Error(`Missing required DOM node: #${id}`);
  }

  return element;
}

function derivePlaybackFps(bundle, defaultFps = 24) {
  const frames = Array.isArray(bundle?.frames) ? bundle.frames : [];

  if (frames.length < 2) {
    return defaultFps;
  }

  const deltas = [];

  for (let index = 1; index < frames.length; index += 1) {
    const previousTime = frames[index - 1]?.t;
    const currentTime = frames[index]?.t;
    const delta = currentTime - previousTime;

    if (Number.isFinite(delta) && delta > 0) {
      deltas.push(delta);
    }
  }

  if (deltas.length === 0) {
    return defaultFps;
  }

  const sortedDeltas = [...deltas].sort((left, right) => left - right);
  const upperMedianIndex = Math.floor(sortedDeltas.length / 2);
  const lowerMedianIndex = Math.ceil((sortedDeltas.length / 2) - 1);
  const medianDelta = sortedDeltas.length % 2 === 0
    ? (sortedDeltas[lowerMedianIndex] + sortedDeltas[upperMedianIndex]) / 2
    : sortedDeltas[upperMedianIndex];

  if (!Number.isFinite(medianDelta) || medianDelta <= 0) {
    return defaultFps;
  }

  return 1 / Math.max(medianDelta, 1 / 60);
}

function isCallable(value) {
  return typeof value === 'function';
}

function createLayerAwareContext(context, getReplayState) {
  const getLayers = () => getReplayState()?.layers ?? {};
  let phase = 'frame';

  function isVisible(layerName) {
    return getLayers()[layerName] !== false;
  }

  function nextMethod(target, methodName) {
    const value = target[methodName];
    return isCallable(value) ? value.bind(target) : null;
  }

  return new Proxy(context, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);

      if (typeof value !== 'function') {
        return value;
      }

      return (...args) => {
        switch (prop) {
          case 'clearRect':
            phase = 'frame';
            break;
          case 'fillRect':
            if (phase === 'frame') {
              phase = 'background';
              return value.apply(target, args);
            }

            if (phase === 'particles') {
              phase = 'density';
              if (!isVisible('density')) {
                return undefined;
              }
              return value.apply(target, args);
            }

            if (phase === 'density') {
              if (!isVisible('density')) {
                return undefined;
              }
              return value.apply(target, args);
            }
            break;
          case 'strokeRect':
            if (phase === 'frame' || phase === 'background') {
              phase = 'particles';
            }
            break;
          case 'moveTo':
          case 'lineTo':
            if (phase === 'particles' || phase === 'density') {
              phase = 'field';
            }

            if (phase === 'field' && !isVisible('field')) {
              return undefined;
            }
            break;
          case 'stroke':
            if (phase === 'field' && !isVisible('field')) {
              return undefined;
            }
            break;
          case 'arc':
            if (phase === 'field') {
              phase = 'attractors';
              if (!isVisible('attractors')) {
                return undefined;
              }
              return value.apply(target, args);
            }

            if (phase === 'particles') {
              if (!isVisible('particles')) {
                return undefined;
              }
              return value.apply(target, args);
            }

            if (phase === 'density') {
              if (!isVisible('density')) {
                return undefined;
              }
              return value.apply(target, args);
            }

            if (phase === 'attractors') {
              if (!isVisible('attractors')) {
                return undefined;
              }
              return value.apply(target, args);
            }
            break;
          case 'fill':
            if (phase === 'particles') {
              if (!isVisible('particles')) {
                return undefined;
              }
              return value.apply(target, args);
            }

            if (phase === 'density') {
              if (!isVisible('density')) {
                return undefined;
              }
              return value.apply(target, args);
            }

            if (phase === 'attractors') {
              if (!isVisible('attractors')) {
                return undefined;
              }
              return value.apply(target, args);
            }
            break;
          default:
            return value.apply(target, args);
        }

        return value.apply(target, args);
      };
    },
    set(target, prop, value) {
      target[prop] = value;
      return true;
    }
  });
}

function detachNode(node) {
  if (!node) {
    return false;
  }

  if (isCallable(node.remove)) {
    node.remove();
    return true;
  }

  const parent = node.parentElement;
  if (parent && isCallable(parent.removeChild)) {
    parent.removeChild(node);
    return true;
  }

  return false;
}

export function initializeApp(root = document, options = {}) {
  const scene = requireElement(root, 'scene');
  if (!options.autoBootstrap) {
    manualInitializeCount += 1;
  }
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const requestFrame = options.requestAnimationFrame ?? globalThis.requestAnimationFrame;
  const cancelFrame = options.cancelAnimationFrame ?? globalThis.cancelAnimationFrame;
  const canRequestFrame = isCallable(requestFrame);
  const canCancelFrame = isCallable(cancelFrame);
  const stage = scene.parentElement ?? null;
  const shell = scene.closest?.('.app-shell') ?? stage?.parentElement ?? null;
  const originalGetContextMethod = isCallable(scene.getContext) ? scene.getContext : null;
  const originalGetContext = originalGetContextMethod ? originalGetContextMethod.bind(scene) : null;

  let replayController = createReplayController({ isPlaying: false });
  const controlsPanel = createControls(null, {
    onTogglePlayback() {
      const isPlaying = replayController.togglePlayback();
      lastTimestamp = null;

      if (!isPlaying) {
        if (animationFrameId !== null && canCancelFrame) {
          cancelFrame(animationFrameId);
        }
        animationFrameId = null;
        return;
      }

      if (animationFrameId === null && canRequestFrame) {
        animationFrameId = requestFrame(update);
      }
    },
    onScrub(frameIndex) {
      replayController.setFrameIndex(frameIndex);
      lastTimestamp = null;
      renderCurrentFrame();
    },
    onLayerToggle(layerName, visible) {
      replayController.setLayer(layerName, visible);
      renderCurrentFrame();
    }
  });

  if (originalGetContext) {
    const context = originalGetContext('2d');
    if (context) {
      const layerAwareContext = createLayerAwareContext(context, () => replayController.getState());
      scene.getContext = () => layerAwareContext;
    }
  }

  const sceneRenderer = createSceneRenderer(scene);
  const metricsPanel = createMetricsPanel();
  let animationFrameId = null;
  let lastTimestamp = null;
  let bundle = null;
  let disposed = false;

  const app = {
    get replayController() {
      return replayController;
    },
    controls: controlsPanel,
    sceneRenderer,
    metricsPanel,
    ready: null,
    dispose() {
      disposed = true;

      if (animationFrameId !== null) {
        if (canCancelFrame) {
          cancelFrame(animationFrameId);
        }
        animationFrameId = null;
      }

      controlsPanel.dispose?.();
      detachNode(controlsPanel.container);
      detachNode(metricsPanel.container);

      if (originalGetContextMethod) {
        scene.getContext = originalGetContextMethod;
      }
    }
  };

  function mountControls() {
    if (!controlsPanel.container || !shell || controlsPanel.container.parentElement) {
      return;
    }

    if (stage?.nextSibling) {
      shell.insertBefore(controlsPanel.container, stage.nextSibling);
    } else {
      shell.appendChild(controlsPanel.container);
    }
  }

  function mountMetricsPanel() {
    if (!metricsPanel.container || !shell || metricsPanel.container.parentElement) {
      return;
    }

    const insertBeforeNode = controlsPanel.container?.parentElement && controlsPanel.container.parentElement === shell
      ? controlsPanel.container.nextSibling
      : stage?.nextSibling;

    if (insertBeforeNode) {
      shell.insertBefore(metricsPanel.container, insertBeforeNode);
    } else {
      shell.appendChild(metricsPanel.container);
    }
  }

  function renderCurrentFrame() {
    if (disposed || !bundle) {
      return;
    }

    const replayState = replayController.getState();
    const frameIndex = Number.isFinite(replayState.frameIndex)
      ? Math.min(Math.max(Math.floor(replayState.frameIndex), 0), bundle.frames.length - 1)
      : 0;
    const frame = bundle.frames[frameIndex];

    sceneRenderer.render(bundle, replayState);
    metricsPanel.update(frame);
    controlsPanel.update(replayState);
  }

  function update(timestamp) {
    if (disposed) {
      animationFrameId = null;
      return;
    }

    animationFrameId = null;

    if (lastTimestamp === null) {
      lastTimestamp = timestamp;
    }

    const deltaSeconds = (timestamp - lastTimestamp) / 1000;
    lastTimestamp = timestamp;
    replayController.tick(deltaSeconds);
    renderCurrentFrame();

    if (!disposed && replayController.getState().isPlaying && canRequestFrame) {
      animationFrameId = requestFrame(update);
    }
  }

  app.ready = loadScenarioBundle('./data/scenario-main.json', { fetchImpl }).then((loadedBundle) => {
    if (disposed) {
      return loadedBundle;
    }

    bundle = loadedBundle;
    const frames = Array.isArray(bundle.frames) ? bundle.frames : [];
    const fps = derivePlaybackFps(bundle);

    replayController = createReplayController({
      frameCount: frames.length,
      fps,
      frameIndex: 0,
      isPlaying: frames.length > 1,
      layer: 'particles'
    });

    mountControls();
    mountMetricsPanel();
    renderCurrentFrame();

    if (!disposed && replayController.getState().isPlaying && canRequestFrame) {
      animationFrameId = requestFrame(update);
    }

    return bundle;
  }).catch((error) => {
    if (!disposed) {
      controlsPanel.dispose?.();
      detachNode(controlsPanel.container);
      detachNode(metricsPanel.container);
    }

    throw error;
  });

  return app;
}

function bootstrapDefaultApp() {
  if (autoBootstrapHandled || manualInitializeCount > 0) {
    return;
  }

  Promise.resolve()
    .then(() => initializeApp(document, { autoBootstrap: true }))
    .then((app) => {
      autoBootstrapHandled = true;
      if (app?.ready && isCallable(app.ready.catch)) {
        app.ready.catch(() => {});
      }
    })
    .catch((error) => {
      autoBootstrapHandled = false;
      console.error(error);
    });
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrapDefaultApp, { once: true });
  } else {
    bootstrapDefaultApp();
  }
}
