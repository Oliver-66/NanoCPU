import test from 'node:test';
import assert from 'node:assert/strict';
import { createReplayController } from '../js/state/replay-controller.js';

test('replay controller advances and clamps active frame index', () => {
  const controller = createReplayController({ frameCount: 3, fps: 10 });
  controller.tick(0.2);
  controller.tick(0.2);
  controller.tick(0.2);
  assert.equal(controller.getState().frameIndex, 2);
});

test('replay controller stops playback when it reaches the last frame', () => {
  const controller = createReplayController({ frameCount: 2, fps: 10 });

  controller.tick(0.2);

  assert.deepEqual(controller.getState(), {
    frameCount: 2,
    fps: 10,
    frameIndex: 1,
    isPlaying: false,
    layer: 'particles',
    layers: {
      particles: true,
      density: true,
      attractors: true,
      field: true
    }
  });
});

test('replay controller stops playback for a single-frame replay', () => {
  const controller = createReplayController({ frameCount: 1, fps: 10 });

  controller.tick(0.2);

  assert.equal(controller.getState().frameIndex, 0);
  assert.equal(controller.getState().isPlaying, false);
});

test('replay controller rejects non-finite frame indexes', () => {
  const controller = createReplayController({
    frameCount: 4,
    fps: 10,
    frameIndex: Number.NaN
  });

  assert.equal(controller.getState().frameIndex, 0);
  assert.equal(controller.setFrameIndex(Number.POSITIVE_INFINITY), 0);
  assert.equal(controller.setFrameIndex(Number.NaN), 0);
  assert.equal(controller.getState().frameIndex, 0);
});

test('replay controller toggles named layers', () => {
  const controller = createReplayController({ frameCount: 10, fps: 12 });
  controller.setLayer('density', false);
  assert.equal(controller.getState().layers.density, false);
});
