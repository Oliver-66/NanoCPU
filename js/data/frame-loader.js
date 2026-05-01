const REQUIRED_META_FIELDS = [
  'scenarioId',
  'title',
  'description',
  'source',
  'phaseLabels'
];

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isPoint(value) {
  return Array.isArray(value) && value.length === 2 && value.every(isFiniteNumber);
}

function isDensityGrid(value) {
  if (!Array.isArray(value) || value.length === 0) {
    return false;
  }

  const firstRowLength = Array.isArray(value[0]) ? value[0].length : 0;
  if (firstRowLength === 0) {
    return false;
  }

  return value.every((row) => (
    Array.isArray(row)
      && row.length === firstRowLength
      && row.length > 0
      && row.every(isFiniteNumber)
  ));
}

function isClusterEntry(value) {
  return Array.isArray(value) && value.length === 4 && value.every(isFiniteNumber);
}

function validateMeta(meta) {
  const missingMetaFields = REQUIRED_META_FIELDS.filter((field) => meta?.[field] === undefined);
  if (missingMetaFields.length > 0) {
    throw new Error(`missing required meta fields: ${missingMetaFields.join(', ')}`);
  }

  for (const field of ['scenarioId', 'title', 'description', 'source']) {
    if (!isNonEmptyString(meta[field])) {
      throw new Error(`meta.${field} must be a non-empty string`);
    }
  }

  if (!Array.isArray(meta.phaseLabels) || meta.phaseLabels.length === 0) {
    throw new Error('meta.phaseLabels must be a non-empty array');
  }

  if (!meta.phaseLabels.every(isNonEmptyString)) {
    throw new Error('meta.phaseLabels must contain non-empty strings');
  }
}

function validateFrame(frame, index) {
  const requiredFields = ['step', 't', 'positions', 'density', 'clusters', 'observables'];
  const missingFields = requiredFields.filter((field) => frame?.[field] === undefined);

  if (missingFields.length > 0) {
    throw new Error(`frame ${index} missing required fields: ${missingFields.join(', ')}`);
  }

  if (!isFiniteNumber(frame.step) || !isFiniteNumber(frame.t)) {
    throw new Error(`frame ${index} must include finite step and t values`);
  }

  if (!Array.isArray(frame.positions)) {
    throw new Error(`frame ${index} positions must be an array`);
  }

  if (!frame.positions.every(isPoint)) {
    throw new Error(`frame ${index} positions must contain finite [x, y] points`);
  }

  if (!isDensityGrid(frame.density)) {
    throw new Error(`frame ${index} density must be a non-empty rectangular 2D array of finite numbers`);
  }

  if (!Array.isArray(frame.clusters)) {
    throw new Error(`frame ${index} clusters must be an array`);
  }

  if (!frame.clusters.every(isClusterEntry)) {
    throw new Error(`frame ${index} clusters must contain [cellX, cellY, count, radius] entries`);
  }

  if (!frame.observables || typeof frame.observables !== 'object' || Array.isArray(frame.observables)) {
    throw new Error(`frame ${index} observables must be an object`);
  }

  for (const [key, value] of Object.entries(frame.observables)) {
    if (value !== null && !isFiniteNumber(value)) {
      throw new Error(`frame ${index} observables.${key} must be finite or null`);
    }
  }
}

export function validateScenarioBundle(bundle) {
  if (!bundle || typeof bundle !== 'object') {
    throw new Error('scenario bundle must be an object');
  }

  if (!bundle.meta || typeof bundle.meta !== 'object') {
    throw new Error('missing required meta fields');
  }

  validateMeta(bundle.meta);

  if (!Array.isArray(bundle.bounds) || bundle.bounds.length !== 4 || !bundle.bounds.every(isFiniteNumber)) {
    throw new Error('bounds must be an array of four finite numbers');
  }

  if (!Array.isArray(bundle.attractors)) {
    throw new Error('attractors must be an array');
  }

  if (!Array.isArray(bundle.fields)) {
    throw new Error('fields must be an array');
  }

  if (!Array.isArray(bundle.frames) || bundle.frames.length === 0) {
    throw new Error('frames must contain at least one frame');
  }

  let expectedDensityHeight = null;
  let expectedDensityWidth = null;

  bundle.frames.forEach((frame, index) => {
    validateFrame(frame, index);

    const densityHeight = frame.density.length;
    const densityWidth = frame.density[0].length;

    if (index === 0) {
      expectedDensityHeight = densityHeight;
      expectedDensityWidth = densityWidth;
    } else if (densityHeight !== expectedDensityHeight || densityWidth !== expectedDensityWidth) {
      throw new Error('frames must keep consistent density grid dimensions');
    }

    if (index > 0) {
      const previousFrame = bundle.frames[index - 1];

      if (frame.step <= previousFrame.step) {
        throw new Error('frames must have strictly increasing step values');
      }

      if (frame.t <= previousFrame.t) {
        throw new Error('frames must have strictly increasing t values');
      }
    }
  });

  return bundle;
}

export async function loadScenarioBundle(url, options = {}) {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;

  if (typeof fetchImpl !== 'function') {
    throw new Error('fetch is not available');
  }

  const response = await fetchImpl(url);
  if (!response.ok) {
    throw new Error(`failed to load scenario bundle: ${response.status} ${response.statusText}`);
  }

  return validateScenarioBundle(await response.json());
}
