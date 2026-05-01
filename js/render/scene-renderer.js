import { renderAttractorsOverlay } from './overlays/attractors-overlay.js';
import { renderFieldOverlay } from './overlays/field-overlay.js';
import { renderDensityOverlay } from './overlays/density-overlay.js';

function getContext(canvas) {
  if (!canvas || typeof canvas.getContext !== 'function') {
    return null;
  }

  return canvas.getContext('2d');
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function isPoint(value) {
  return Array.isArray(value) && value.length === 2 && value.every(isFiniteNumber);
}

function isBounds(value) {
  return Array.isArray(value) && value.length === 4 && value.every(isFiniteNumber);
}

function projectPoint(point, bounds, width, height, padding) {
  if (!isPoint(point) || !isBounds(bounds)) {
    return null;
  }

  const [minX, minY, maxX, maxY] = bounds;
  const drawableWidth = Math.max(width - (padding * 2), 1);
  const drawableHeight = Math.max(height - (padding * 2), 1);
  const spanX = Math.max(maxX - minX, 1e-6);
  const spanY = Math.max(maxY - minY, 1e-6);
  const x = padding + (((point[0] - minX) / spanX) * drawableWidth);
  const y = height - padding - (((point[1] - minY) / spanY) * drawableHeight);

  return [x, y];
}

export function createSceneRenderer(canvas = null) {
  const context = getContext(canvas);

  return {
    canvas,
    render(bundle, replayState) {
      if (!canvas || !context || !bundle || !Array.isArray(bundle.frames) || bundle.frames.length === 0) {
        return;
      }

      const width = canvas.width;
      const height = canvas.height;
      const requestedFrameIndex = replayState?.frameIndex;
      const frameIndex = Number.isFinite(requestedFrameIndex)
        ? Math.min(Math.max(Math.floor(requestedFrameIndex), 0), bundle.frames.length - 1)
        : 0;
      const frame = bundle.frames[frameIndex];
      const bounds = isBounds(bundle.bounds) ? bundle.bounds : null;
      const padding = Math.max(18, Math.round(Math.min(width, height) * 0.04));
      const radius = Math.max(1.2, Math.min(width, height) / 320);
      const projector = bounds
        ? (point) => projectPoint(point, bounds, width, height, padding)
        : null;

      context.clearRect(0, 0, width, height);
      context.fillStyle = '#edf1f3';
      context.fillRect(0, 0, width, height);
      context.strokeStyle = '#cfd7dc';
      context.lineWidth = 1;
      context.strokeRect(0.5, 0.5, width - 1, height - 1);

      context.fillStyle = '#16313d';
      if (projector && Array.isArray(frame?.positions)) {
        for (const point of frame.positions) {
          const projected = projector(point);
          if (!projected) {
            continue;
          }

          const [x, y] = projected;
          context.beginPath();
          context.arc(x, y, radius, 0, Math.PI * 2);
          context.fill();
        }
      }

      renderDensityOverlay(context, bundle, frame, {
        width,
        height,
        padding,
        projectPoint: projector
      });
      renderFieldOverlay(context, bundle, {
        width,
        height,
        padding,
        projectPoint: projector
      });
      renderAttractorsOverlay(context, bundle, {
        width,
        height,
        padding,
        projectPoint: projector
      });
    }
  };
}
