import test from 'node:test';
import assert from 'node:assert/strict';
import { createSceneRenderer } from '../js/render/scene-renderer.js';

function createBundle() {
  return {
    bounds: [-1, -1, 1, 1],
    attractors: [{
      id: 'A1',
      pos: [0, 0],
      strength: 0.6,
      radius: 0.75
    }],
    fields: [{
      type: 'gradient',
      dir: [1, 0],
      strength: 0.2
    }, {
      type: 'vortex',
      center: [0, 0],
      strength: 0.8,
      radius: 1
    }],
    frames: [
      {
        positions: [[-1, -1]],
        density: [
          [0, 0.6],
          [0.2, 0]
        ],
        clusters: [[1, 0, 3, 0.5]]
      },
      {
        positions: [[1, 1]],
        density: [
          [0, 0],
          [0, 1]
        ],
        clusters: []
      }
    ]
  };
}

function projectPoint(point, bounds, width, height, padding) {
  const [minX, minY, maxX, maxY] = bounds;
  const drawableWidth = Math.max(width - (padding * 2), 1);
  const drawableHeight = Math.max(height - (padding * 2), 1);
  const spanX = Math.max(maxX - minX, 1e-6);
  const spanY = Math.max(maxY - minY, 1e-6);

  return [
    padding + (((point[0] - minX) / spanX) * drawableWidth),
    height - padding - (((point[1] - minY) / spanY) * drawableHeight)
  ];
}

function normalizeDelta(dx, dy) {
  const length = Math.hypot(dx, dy);
  return [dx / length, dy / length];
}

function createCanvas(log) {
  return {
    width: 200,
    height: 100,
    getContext() {
      return {
        clearRect(...args) {
          log.push(['clearRect', ...args]);
        },
        fillRect(...args) {
          log.push(['fillRect', ...args]);
        },
        strokeRect(...args) {
          log.push(['strokeRect', ...args]);
        },
        beginPath() {
          log.push(['beginPath']);
        },
        arc(x, y, radius) {
          log.push(['arc', x, y, radius]);
        },
        moveTo(x, y) {
          log.push(['moveTo', x, y]);
        },
        lineTo(x, y) {
          log.push(['lineTo', x, y]);
        },
        stroke() {
          log.push(['stroke']);
        },
        fill() {
          log.push(['fill']);
        },
        set fillStyle(value) {},
        set strokeStyle(value) {},
        set lineWidth(value) {},
        set globalAlpha(value) {
          log.push(['globalAlpha', value]);
        }
      };
    }
  };
}

test('scene renderer clamps non-finite frame indexes before reading frames', () => {
  const log = [];
  const renderer = createSceneRenderer(createCanvas(log));

  renderer.render(createBundle(), { frameIndex: Number.NaN });
  renderer.render(createBundle(), { frameIndex: Number.POSITIVE_INFINITY });

  const particleArcs = log.filter((entry) => (
    entry[0] === 'arc'
      && entry[1] === 18
      && entry[2] === 82
  ));

  assert.equal(particleArcs.length, 2);
  assert.deepEqual(particleArcs[0].slice(1, 3), [18, 82]);
  assert.deepEqual(particleArcs[1].slice(1, 3), [18, 82]);
});

test('scene renderer skips malformed frame positions without throwing', () => {
  const log = [];
  const renderer = createSceneRenderer(createCanvas(log));
  const bundle = createBundle();
  bundle.frames[0].positions = null;

  assert.doesNotThrow(() => {
    renderer.render(bundle, { frameIndex: 0 });
  });

  const fieldLines = log.filter((entry) => entry[0] === 'lineTo');
  const attractorArcs = log.filter((entry) => entry[0] === 'arc');

  assert.ok(fieldLines.length > 0);
  assert.ok(attractorArcs.length > 0);
});

test('scene renderer projects field hints through asymmetric canvas and bounds', () => {
  const log = [];
  const renderer = createSceneRenderer(createCanvas(log));
  const bundle = {
    bounds: [-3, -1, 5, 3],
    attractors: [],
    fields: [{
      type: 'gradient',
      dir: [1, 1],
      strength: 1
    }],
    frames: [{
      positions: [],
      density: [[0]],
      clusters: [],
      observables: {}
    }]
  };

  renderer.render(bundle, { frameIndex: 0 });

  const firstMove = log.find((entry) => entry[0] === 'moveTo');
  const firstLine = log.find((entry, index) => index > log.indexOf(firstMove) && entry[0] === 'lineTo');

  assert.ok(firstMove);
  assert.ok(firstLine);

  const actualDelta = normalizeDelta(firstLine[1] - firstMove[1], firstLine[2] - firstMove[2]);
  const width = 200;
  const height = 100;
  const padding = Math.max(18, Math.round(Math.min(width, height) * 0.04));
  const bounds = bundle.bounds;
  const columns = Math.max(4, Math.round(width / 160));
  const rows = Math.max(3, Math.round(height / 180));
  const stepX = (bounds[2] - bounds[0]) / columns;
  const stepY = (bounds[3] - bounds[1]) / rows;
  const sample = [
    bounds[0] + (stepX * 0.5),
    bounds[1] + (stepY * 0.5)
  ];
  const direction = normalizeDelta(1, 1);
  const worldStep = Math.max(Math.min(stepX, stepY) * 0.38, 0.08);
  const projectedStart = projectPoint(sample, bounds, width, height, padding);
  const projectedEnd = projectPoint([
    sample[0] + (direction[0] * worldStep),
    sample[1] + (direction[1] * worldStep)
  ], bounds, width, height, padding);
  const expectedDelta = normalizeDelta(
    projectedEnd[0] - projectedStart[0],
    projectedEnd[1] - projectedStart[1]
  );

  assert.ok(Math.abs(actualDelta[0] - expectedDelta[0]) < 1e-6);
  assert.ok(Math.abs(actualDelta[1] - expectedDelta[1]) < 1e-6);
});

test('scene renderer skips malformed density rows without throwing', () => {
  const log = [];
  const renderer = createSceneRenderer(createCanvas(log));
  const bundle = createBundle();
  bundle.frames[0].density = [
    [0, 0.6],
    null,
    [0.2, 0]
  ];

  assert.doesNotThrow(() => {
    renderer.render(bundle, { frameIndex: 0 });
  });

  const densityRects = log.filter((entry) => entry[0] === 'fillRect').slice(1);

  assert.ok(densityRects.length > 0);
});

test('scene renderer composes attractor, field, and density overlays above particles', () => {
  const log = [];
  const renderer = createSceneRenderer(createCanvas(log));

  renderer.render(createBundle(), { frameIndex: 0 });

  const overlayArcs = log.filter((entry) => entry[0] === 'arc' && entry[3] >= 2);
  const fieldLines = log.filter((entry) => entry[0] === 'lineTo');
  const densityRects = log.filter((entry) => entry[0] === 'fillRect').slice(1);

  assert.ok(overlayArcs.length >= 2);
  assert.ok(fieldLines.length >= 4);
  assert.ok(densityRects.length >= 2);
});
