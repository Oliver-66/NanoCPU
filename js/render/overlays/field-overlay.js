function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function isPoint(value) {
  return Array.isArray(value) && value.length === 2 && value.every(isFiniteNumber);
}

function normalize(vector) {
  const length = Math.hypot(vector[0], vector[1]);
  if (!Number.isFinite(length) || length <= 1e-6) {
    return [0, 0];
  }

  return [vector[0] / length, vector[1] / length];
}

function addScaled(target, vector, scale) {
  target[0] += vector[0] * scale;
  target[1] += vector[1] * scale;
}

function projectDelta(projector, startPoint, deltaPoint) {
  const projectedStart = projector(startPoint);
  const projectedEnd = projector(deltaPoint);

  if (
    !Array.isArray(projectedStart)
    || projectedStart.length !== 2
    || !Array.isArray(projectedEnd)
    || projectedEnd.length !== 2
  ) {
    return null;
  }

  return [
    projectedEnd[0] - projectedStart[0],
    projectedEnd[1] - projectedStart[1]
  ];
}

function accumulateGradient(field, vector) {
  if (!isPoint(field?.dir) || !isFiniteNumber(field?.strength)) {
    return;
  }

  addScaled(vector, normalize(field.dir), field.strength);
}

function accumulateVortex(field, sample, vector) {
  if (!isPoint(field?.center) || !isFiniteNumber(field?.strength) || !isFiniteNumber(field?.radius)) {
    return;
  }

  const offsetX = sample[0] - field.center[0];
  const offsetY = sample[1] - field.center[1];
  const distance = Math.hypot(offsetX, offsetY);

  if (!Number.isFinite(distance) || distance > field.radius || distance <= 1e-6) {
    return;
  }

  const tangent = normalize([-offsetY, offsetX]);
  const falloff = 1 - (distance / Math.max(field.radius, 1e-6));
  addScaled(vector, tangent, field.strength * falloff);
}

function sampleVector(fields, sample) {
  const vector = [0, 0];

  for (const field of fields) {
    if (field?.type === 'gradient') {
      accumulateGradient(field, vector);
    } else if (field?.type === 'vortex') {
      accumulateVortex(field, sample, vector);
    }
  }

  return vector;
}

function normalizeScreenDelta(delta) {
  const length = Math.hypot(delta[0], delta[1]);
  if (!Number.isFinite(length) || length <= 1e-6) {
    return null;
  }

  return [delta[0] / length, delta[1] / length];
}

export function renderFieldOverlay(context, bundle, renderState) {
  const fields = Array.isArray(bundle?.fields) ? bundle.fields : [];
  const bounds = Array.isArray(bundle?.bounds) ? bundle.bounds : null;
  const projector = renderState?.projectPoint;
  const width = renderState?.width ?? 0;
  const height = renderState?.height ?? 0;

  if (
    fields.length === 0
    || !bounds
    || typeof projector !== 'function'
    || typeof context?.beginPath !== 'function'
    || typeof context?.moveTo !== 'function'
    || typeof context?.lineTo !== 'function'
    || typeof context?.stroke !== 'function'
  ) {
    return;
  }

  const [minX, minY, maxX, maxY] = bounds;
  const columns = Math.max(4, Math.round(width / 160));
  const rows = Math.max(3, Math.round(height / 180));
  const stepX = (maxX - minX) / columns;
  const stepY = (maxY - minY) / rows;
  const worldStep = Math.max(Math.min(stepX, stepY) * 0.38, 0.08);

  context.strokeStyle = 'rgba(62, 98, 119, 0.45)';
  context.lineWidth = 1;

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const sample = [
        minX + ((column + 0.5) * stepX),
        minY + ((row + 0.5) * stepY)
      ];
      const vector = sampleVector(fields, sample);
      const magnitude = Math.hypot(vector[0], vector[1]);

      if (!Number.isFinite(magnitude) || magnitude <= 0.02) {
        continue;
      }

      const direction = normalize(vector);
      const screenDelta = projectDelta(
        projector,
        sample,
        [
          sample[0] + (direction[0] * worldStep * Math.max(Math.min(magnitude, 1.25), 0.35)),
          sample[1] + (direction[1] * worldStep * Math.max(Math.min(magnitude, 1.25), 0.35))
        ]
      );

      if (!screenDelta) {
        continue;
      }

      const [startX, startY] = projector(sample);
      const normalizedDelta = normalizeScreenDelta(screenDelta);
      if (!normalizedDelta) {
        continue;
      }

      const length = Math.max(8, Math.min(16, 7 + (magnitude * 12)));
      const endX = startX + (normalizedDelta[0] * length);
      const endY = startY + (normalizedDelta[1] * length);

      context.beginPath();
      context.moveTo(startX, startY);
      context.lineTo(endX, endY);
      context.stroke();

      const headX = normalizedDelta[0] * 3;
      const headY = normalizedDelta[1] * 3;

      context.beginPath();
      context.moveTo(endX, endY);
      context.lineTo(endX - headX + headY, endY - headY - headX);
      context.moveTo(endX, endY);
      context.lineTo(endX - headX - headY, endY - headY + headX);
      context.stroke();
    }
  }
}
