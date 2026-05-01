import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadScenarioBundle, validateScenarioBundle } from '../js/data/frame-loader.js';

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const SCENARIO_FIXTURE_PATH = path.resolve(TEST_DIR, '../data/scenario-main.json');

function createValidBundle() {
  return {
    meta: {
      scenarioId: 'smoke-test',
      title: 'Smoke Test',
      description: 'Contract fixture',
      source: 'generated from local test fixture',
      phaseLabels: ['phase-a']
    },
    bounds: [-1, -1, 1, 1],
    attractors: [],
    fields: [],
    frames: [{
      step: 0,
      t: 0,
      positions: [[0, 0]],
      density: [[0]],
      clusters: [],
      observables: { energy_total: 1, recovery_steps: null }
    }]
  };
}

test('validateScenarioBundle requires scenario metadata and timeline', () => {
  assert.throws(
    () => validateScenarioBundle({
      frames: [{ step: 1, t: 0.02, particles: [] }]
    }),
    /missing required meta fields/
  );
});

test('validateScenarioBundle reaches frame schema validation when meta is present', () => {
  const bundle = createValidBundle();
  bundle.frames[0].positions = [0, 1];

  assert.throws(
    () => validateScenarioBundle(bundle),
    /positions must contain finite \[x, y\] points/
  );
});

test('validateScenarioBundle rejects empty or ragged density grids', () => {
  const emptyRowBundle = createValidBundle();
  emptyRowBundle.frames[0].density = [[]];

  assert.throws(
    () => validateScenarioBundle(emptyRowBundle),
    /density must be a non-empty rectangular 2D array of finite numbers/
  );

  const raggedBundle = createValidBundle();
  raggedBundle.frames[0].density = [[0, 1], [2]];

  assert.throws(
    () => validateScenarioBundle(raggedBundle),
    /density must be a non-empty rectangular 2D array of finite numbers/
  );
});

test('validateScenarioBundle rejects non-monotonic frame steps', () => {
  const bundle = createValidBundle();
  bundle.frames.push({
    step: 0,
    t: 1,
    positions: [[1, 1]],
    density: [[1]],
    clusters: [],
    observables: { energy_total: 2, recovery_steps: null }
  });

  assert.throws(
    () => validateScenarioBundle(bundle),
    /frames must have strictly increasing step values/
  );
});

test('validateScenarioBundle rejects non-monotonic frame times', () => {
  const bundle = createValidBundle();
  bundle.frames.push({
    step: 1,
    t: 0,
    positions: [[1, 1]],
    density: [[1]],
    clusters: [],
    observables: { energy_total: 2, recovery_steps: null }
  });

  assert.throws(
    () => validateScenarioBundle(bundle),
    /frames must have strictly increasing t values/
  );
});

test('validateScenarioBundle rejects density dimension changes across frames', () => {
  const bundle = createValidBundle();
  bundle.frames.push({
    step: 1,
    t: 1,
    positions: [[1, 1]],
    density: [[1, 2]],
    clusters: [],
    observables: { energy_total: 2, recovery_steps: null }
  });

  assert.throws(
    () => validateScenarioBundle(bundle),
    /frames must keep consistent density grid dimensions/
  );
});

test('validateScenarioBundle accepts the real generated scenario fixture', () => {
  const bundle = JSON.parse(fs.readFileSync(SCENARIO_FIXTURE_PATH, 'utf8'));

  assert.equal(validateScenarioBundle(bundle), bundle);
});

test('validateScenarioBundle preserves attractors and fields for overlay consumers', () => {
  const attractors = [{
    id: 'A1',
    pos: [0.25, -0.5],
    strength: 0.6,
    radius: 1.5
  }];
  const fields = [{
    type: 'gradient',
    dir: [1, 0],
    strength: 0.2
  }];
  const bundle = createValidBundle();
  bundle.attractors = attractors;
  bundle.fields = fields;

  const validated = validateScenarioBundle(bundle);

  assert.equal(validated.attractors, attractors);
  assert.equal(validated.fields, fields);
  assert.deepEqual(validated.attractors[0], attractors[0]);
  assert.deepEqual(validated.fields[0], fields[0]);
});

test('loadScenarioBundle validates fetched JSON without a browser', async () => {
  const bundle = createValidBundle();
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    return {
      ok: true,
      async json() {
        return bundle;
      }
    };
  };

  const loadedBundle = await loadScenarioBundle('/data/scenario-main.json', { fetchImpl });

  assert.equal(calls.length, 1);
  assert.equal(calls[0], '/data/scenario-main.json');
  assert.equal(loadedBundle, bundle);
});
