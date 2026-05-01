function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function isDensityRow(value) {
  return Array.isArray(value);
}

function projectRect(projectPoint, left, bottom, right, top) {
  const projectedA = projectPoint([left, bottom]);
  const projectedB = projectPoint([right, top]);

  if (
    !Array.isArray(projectedA)
    || projectedA.length !== 2
    || !Array.isArray(projectedB)
    || projectedB.length !== 2
  ) {
    return null;
  }

  const [x1, y1] = projectedA;
  const [x2, y2] = projectedB;

  return {
    x: Math.min(x1, x2),
    y: Math.min(y1, y2),
    width: Math.max(Math.abs(x2 - x1), 1),
    height: Math.max(Math.abs(y2 - y1), 1)
  };
}

export function renderDensityOverlay(context, bundle, frame, renderState) {
  const density = Array.isArray(frame?.density) ? frame.density : [];
  const clusters = Array.isArray(frame?.clusters) ? frame.clusters : [];
  const bounds = Array.isArray(bundle?.bounds) ? bundle.bounds : null;
  const projector = renderState?.projectPoint;

  if (!context || !bounds || typeof projector !== 'function' || density.length === 0) {
    return;
  }

  const [minX, minY, maxX, maxY] = bounds;
  const rows = density.length;
  const validRows = density.filter(isDensityRow);
  const columns = validRows.reduce((max, row) => Math.max(max, row.length), 0);

  if (columns === 0 || typeof context.fillRect !== 'function') {
    return;
  }

  let maxDensity = 0;
  for (const row of validRows) {
    for (const value of row) {
      if (isFiniteNumber(value) && value > maxDensity) {
        maxDensity = value;
      }
    }
  }

  const cellWidth = (maxX - minX) / columns;
  const cellHeight = (maxY - minY) / rows;
  const densityScale = maxDensity > 0 ? maxDensity : 1;

  for (let rowIndex = 0; rowIndex < rows; rowIndex += 1) {
    const row = density[rowIndex];
    if (!isDensityRow(row)) {
      continue;
    }

    for (let columnIndex = 0; columnIndex < columns; columnIndex += 1) {
      const value = row[columnIndex];
      if (!isFiniteNumber(value) || value <= 0) {
        continue;
      }

      const left = minX + (columnIndex * cellWidth);
      const right = left + cellWidth;
      const bottom = minY + (rowIndex * cellHeight);
      const top = bottom + cellHeight;
      const rect = projectRect(projector, left, bottom, right, top);
      if (!rect) {
        continue;
      }
      const alpha = Math.min(0.18, (value / densityScale) * 0.12);

      context.fillStyle = `rgba(53, 104, 136, ${alpha.toFixed(3)})`;
      context.fillRect(rect.x, rect.y, rect.width, rect.height);
    }
  }

  if (
    typeof context.beginPath !== 'function'
    || typeof context.arc !== 'function'
    || typeof context.fill !== 'function'
  ) {
    return;
  }

  for (const cluster of clusters) {
    if (!Array.isArray(cluster) || cluster.length !== 4 || !cluster.every(isFiniteNumber)) {
      continue;
    }

    const [cellX, cellY, count, radius] = cluster;
    const center = [
      minX + ((cellX + 0.5) * cellWidth),
      minY + ((cellY + 0.5) * cellHeight)
    ];
    const projected = projector(center);
    if (!Array.isArray(projected) || projected.length !== 2) {
      continue;
    }

    const [x, y] = projected;
    const markerRadius = Math.max(3, Math.min(18, 3 + radius + (count * 0.35)));

    context.beginPath();
    context.arc(x, y, markerRadius, 0, Math.PI * 2);
    context.fillStyle = 'rgba(233, 171, 73, 0.18)';
    context.fill();

    if (typeof context.stroke === 'function') {
      context.strokeStyle = 'rgba(183, 121, 34, 0.45)';
      context.lineWidth = 1;
      context.stroke();
    }
  }
}
