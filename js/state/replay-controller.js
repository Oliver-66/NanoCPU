function clampFrameIndex(frameIndex, frameCount) {
  if (!Number.isFinite(frameIndex) || frameCount <= 0) {
    return 0;
  }

  return Math.min(Math.max(Math.floor(frameIndex), 0), frameCount - 1);
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function createDefaultLayers() {
  return {
    particles: true,
    density: true,
    attractors: true,
    field: true
  };
}

export function createReplayController(initialState = {}) {
  const frameCount = Number.isFinite(initialState.frameCount) ? Math.max(0, Math.floor(initialState.frameCount)) : 0;
  const fps = Number.isFinite(initialState.fps) && initialState.fps > 0 ? initialState.fps : 24;
  const layers = {
    ...createDefaultLayers(),
    ...(isPlainObject(initialState.layers) ? initialState.layers : {})
  };
  const state = {
    frameCount,
    fps,
    frameIndex: clampFrameIndex(initialState.frameIndex ?? 0, frameCount),
    isPlaying: initialState.isPlaying ?? true,
    layer: initialState.layer ?? 'particles',
    layers
  };
  let frameAccumulator = 0;

  return {
    tick(deltaSeconds = 0) {
      if (!state.isPlaying || !Number.isFinite(deltaSeconds) || deltaSeconds <= 0) {
        return state.frameIndex;
      }

      if (state.frameCount <= 1) {
        state.frameIndex = clampFrameIndex(state.frameIndex, state.frameCount);
        state.isPlaying = false;
        frameAccumulator = 0;
        return state.frameIndex;
      }

      frameAccumulator += deltaSeconds * state.fps;
      const nextFrames = Math.floor(frameAccumulator);

      if (nextFrames <= 0) {
        return state.frameIndex;
      }

      frameAccumulator -= nextFrames;
      state.frameIndex = clampFrameIndex(state.frameIndex + nextFrames, state.frameCount);

      if (state.frameIndex >= state.frameCount - 1) {
        state.frameIndex = Math.max(0, state.frameCount - 1);
        state.isPlaying = false;
        frameAccumulator = 0;
      }

      return state.frameIndex;
    },
    setFrameIndex(frameIndex) {
      state.frameIndex = clampFrameIndex(frameIndex, state.frameCount);
      frameAccumulator = 0;
      return state.frameIndex;
    },
    togglePlayback(forceValue) {
      state.isPlaying = typeof forceValue === 'boolean' ? forceValue : !state.isPlaying;
      frameAccumulator = 0;
      return state.isPlaying;
    },
    setLayer(layer) {
      if (typeof layer !== 'string' || layer.length === 0) {
        return state.layer;
      }

      const visible = arguments.length > 1 ? Boolean(arguments[1]) : true;
      state.layers[layer] = visible;

      if (visible) {
        state.layer = layer;
      } else if (state.layer === layer) {
        state.layer = Object.keys(state.layers).find((key) => state.layers[key]) ?? layer;
      }

      return state.layers[layer];
    },
    getState() {
      return {
        ...state,
        layers: { ...state.layers }
      };
    }
  };
}
