function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function isPoint(value) {
  return Array.isArray(value) && value.length === 2 && value.every(isFiniteNumber);
}

function drawCircle(context, x, y, radius, fillStyle, strokeStyle = null) {
  if (
    !context
    || typeof context.beginPath !== 'function'
    || typeof context.arc !== 'function'
    || typeof context.fill !== 'function'
  ) {
    return;
  }

  context.beginPath();
  context.arc(x, y, radius, 0, Math.PI * 2);
  context.fillStyle = fillStyle;
  context.fill();

  if (strokeStyle && typeof context.stroke === 'function') {
    context.strokeStyle = strokeStyle;
    context.lineWidth = 1.25;
    context.stroke();
  }
}

export function renderAttractorsOverlay(context, bundle, renderState) {
  const attractors = Array.isArray(bundle?.attractors) ? bundle.attractors : [];
  const projector = renderState?.projectPoint;

  if (!context || typeof projector !== 'function') {
    return;
  }

  for (const attractor of attractors) {
    if (!isPoint(attractor?.pos)) {
      continue;
    }

    const projected = projector(attractor.pos);
    if (!Array.isArray(projected) || projected.length !== 2) {
      continue;
    }

    const [x, y] = projected;
    const radius = Math.max(4, Math.min(12, 4 + ((attractor.radius ?? 0) * 2)));

    drawCircle(context, x, y, radius, 'rgba(255, 244, 214, 0.9)', 'rgba(152, 111, 42, 0.85)');
    drawCircle(context, x, y, Math.max(1.5, radius * 0.28), 'rgba(118, 77, 18, 0.92)');
  }
}
