const LAYER_DEFINITIONS = [
  { key: 'particles', shortLabel: 'Pt', title: 'Particles' },
  { key: 'density', shortLabel: 'Dn', title: 'Density' },
  { key: 'attractors', shortLabel: 'At', title: 'Attractors' },
  { key: 'field', shortLabel: 'Fld', title: 'Field influence' }
];

function isCallable(value) {
  return typeof value === 'function';
}

function formatFrameLabel(frameIndex, frameCount) {
  if (!Number.isFinite(frameCount) || frameCount <= 0) {
    return '0 / 0';
  }

  const current = Number.isFinite(frameIndex) ? Math.min(Math.max(Math.floor(frameIndex) + 1, 1), frameCount) : 1;
  return `${current} / ${frameCount}`;
}

function getDocumentFromTarget(target) {
  return target?.ownerDocument ?? (typeof document !== 'undefined' ? document : null);
}

function setNodeAttribute(node, name, value) {
  if (isCallable(node?.setAttribute)) {
    node.setAttribute(name, value);
    return;
  }

  node[name] = value;
}

function bindNodeEvent(node, eventName, handler) {
  if (isCallable(node?.addEventListener)) {
    node.addEventListener(eventName, handler);
    return true;
  }

  return false;
}

function unbindNodeEvent(node, eventName, handler) {
  if (isCallable(node?.removeEventListener)) {
    node.removeEventListener(eventName, handler);
  }
}

export function createControls(mountTarget = null, handlers = {}) {
  const doc = getDocumentFromTarget(mountTarget);

  if (!doc) {
    return {
      container: null,
      update() {
        return null;
      }
    };
  }

  const container = doc.createElement('div');
  const playbackGroup = doc.createElement('div');
  const timelineGroup = doc.createElement('div');
  const layerGroup = doc.createElement('div');
  const playButton = doc.createElement('button');
  const timeline = doc.createElement('input');
  const frameLabel = doc.createElement('span');
  const layerButtons = new Map();
  const layerHandlers = new Map();
  const layerVisibility = new Map(LAYER_DEFINITIONS.map((layer) => [layer.key, true]));
  let controlsDisabled = false;

  container.className = 'replay-controls';
  setNodeAttribute(container, 'role', 'toolbar');
  setNodeAttribute(container, 'aria-label', 'Replay controls');

  playbackGroup.className = 'replay-controls__group';
  timelineGroup.className = 'replay-controls__group replay-controls__timeline';
  layerGroup.className = 'replay-controls__group replay-controls__layers';

  playButton.type = 'button';
  playButton.className = 'replay-controls__button replay-controls__play';
  playButton.textContent = 'Play';
  setNodeAttribute(playButton, 'aria-pressed', 'false');

  timeline.type = 'range';
  timeline.min = '0';
  timeline.max = '0';
  timeline.step = '1';
  timeline.value = '0';
  timeline.className = 'replay-controls__timeline-input';
  setNodeAttribute(timeline, 'aria-label', 'Frame timeline');

  frameLabel.className = 'replay-controls__frame-label';
  frameLabel.textContent = '0 / 0';

  for (const layer of LAYER_DEFINITIONS) {
    const button = doc.createElement('button');
    button.type = 'button';
    button.className = 'replay-controls__button replay-controls__layer';
    button.textContent = layer.shortLabel;
    button.title = layer.title;
    setNodeAttribute(button, 'aria-label', layer.title);
    setNodeAttribute(button, 'aria-pressed', 'true');
    layerButtons.set(layer.key, button);
    layerGroup.appendChild(button);
  }

  const handlePlayToggle = () => {
    if (isCallable(handlers.onTogglePlayback)) {
      handlers.onTogglePlayback();
    }
  };

  const handleTimelineInput = () => {
    if (!isCallable(handlers.onScrub)) {
      return;
    }

    const nextFrameIndex = Number.parseInt(timeline.value, 10);
    handlers.onScrub(Number.isFinite(nextFrameIndex) ? nextFrameIndex : 0);
  };

  const handleLayerToggle = (layerName) => {
    if (!isCallable(handlers.onLayerToggle)) {
      return;
    }

    const nextVisible = !(layerVisibility.get(layerName) ?? true);
    layerVisibility.set(layerName, nextVisible);
    handlers.onLayerToggle(layerName, nextVisible);
  };

  bindNodeEvent(playButton, 'click', handlePlayToggle);
  bindNodeEvent(timeline, 'input', handleTimelineInput);

  for (const [layerName, button] of layerButtons.entries()) {
    const handler = () => handleLayerToggle(layerName);
    layerHandlers.set(layerName, handler);
    bindNodeEvent(button, 'click', handler);
  }

  playbackGroup.append(playButton);
  timelineGroup.append(timeline, frameLabel);
  container.append(playbackGroup, timelineGroup, layerGroup);

  if (mountTarget?.appendChild) {
    mountTarget.appendChild(container);
  }

  return {
    container,
    elements: {
      playButton,
      timeline,
      frameLabel,
      layerButtons
    },
    update(state = {}) {
      const isPlaying = Boolean(state.isPlaying);
      const frameCount = Number.isFinite(state.frameCount) ? Math.max(0, Math.floor(state.frameCount)) : 0;
      const frameIndex = Number.isFinite(state.frameIndex) ? Math.floor(state.frameIndex) : 0;
      const layers = state.layers ?? {};

      playButton.textContent = isPlaying ? 'Pause' : 'Play';
      setNodeAttribute(playButton, 'aria-pressed', String(isPlaying));

      timeline.max = String(Math.max(frameCount - 1, 0));
      timeline.value = String(Math.min(Math.max(frameIndex, 0), Math.max(frameCount - 1, 0)));
      timeline.disabled = controlsDisabled || frameCount <= 1;
      frameLabel.textContent = formatFrameLabel(frameIndex, frameCount);

      for (const [layerName, button] of layerButtons.entries()) {
        const visible = layers[layerName] !== false;
        layerVisibility.set(layerName, visible);
        setNodeAttribute(button, 'aria-pressed', String(visible));
      }

      return {
        isPlaying,
        frameCount,
        frameIndex,
        layers: { ...layers }
      };
    },
    setDisabled(disabled) {
      const nextDisabled = Boolean(disabled);
      controlsDisabled = nextDisabled;
      playButton.disabled = nextDisabled;
      timeline.disabled = nextDisabled || Number.parseInt(timeline.max, 10) <= 0;

      for (const button of layerButtons.values()) {
        button.disabled = nextDisabled;
      }
    },
    dispose() {
      unbindNodeEvent(playButton, 'click', handlePlayToggle);
      unbindNodeEvent(timeline, 'input', handleTimelineInput);
      for (const [layerName, button] of layerButtons.entries()) {
        const handler = layerHandlers.get(layerName);
        if (handler) {
          unbindNodeEvent(button, 'click', handler);
        }
      }
      container.remove();
    }
  };
}
