const METRIC_DEFINITIONS = [
  {
    key: 'energy_total',
    label: 'Total energy',
    decimals: 1
  },
  {
    key: 'density_entropy',
    label: 'Density entropy',
    decimals: 1
  },
  {
    key: 'cluster_count',
    label: 'Cluster count',
    decimals: 0
  },
];

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function formatNumber(value, decimals) {
  if (!isFiniteNumber(value)) {
    return 'Not available';
  }

  if (decimals <= 0) {
    return String(Math.round(value));
  }

  return value.toFixed(decimals).replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
}

function createCardElement(doc, metric) {
  const card = doc.createElement('article');
  const label = doc.createElement('div');
  const value = doc.createElement('div');

  card.style.border = '1px solid #c6d0d5';
  card.style.borderRadius = '10px';
  card.style.padding = '10px 12px';
  card.style.background = '#fbfcfc';
  card.style.boxShadow = '0 4px 12px rgba(17, 30, 39, 0.04)';
  card.style.minWidth = '0';

  label.textContent = metric.label;
  label.style.fontSize = '0.78rem';
  label.style.letterSpacing = '0.01em';
  label.style.color = '#4b5963';
  label.style.marginBottom = '4px';
  label.style.textTransform = 'none';

  value.textContent = metric.displayValue;
  value.style.fontSize = '1rem';
  value.style.fontWeight = '600';
  value.style.color = '#1f252c';
  value.style.fontVariantNumeric = 'tabular-nums';
  value.style.overflow = 'hidden';
  value.style.textOverflow = 'ellipsis';
  value.style.whiteSpace = 'nowrap';

  card.append(label, value);
  return card;
}

export function mapFrameMetrics(frame = {}) {
  const observables = frame?.observables && typeof frame.observables === 'object'
    ? frame.observables
    : {};

  return METRIC_DEFINITIONS.map((definition) => {
    const rawValue = observables[definition.key];

    return {
      key: definition.key,
      label: definition.label,
      rawValue,
      displayValue: rawValue === null || rawValue === undefined
        ? 'Not available'
        : formatNumber(rawValue, definition.decimals)
    };
  });
}

export function createMetricsPanel(mountTarget = null) {
  const doc = mountTarget?.ownerDocument ?? (typeof document !== 'undefined' ? document : null);

  if (!doc) {
    return {
      container: null,
      update() {
        return [];
      }
    };
  }

  const panel = doc.createElement('aside');
  const heading = doc.createElement('h2');
  const grid = doc.createElement('div');

  panel.style.marginTop = '14px';
  panel.style.border = '1px solid #c6d0d5';
  panel.style.borderRadius = '14px';
  panel.style.padding = '12px';
  panel.style.background = '#f8fafb';
  panel.style.boxShadow = '0 10px 30px rgba(17, 30, 39, 0.05)';

  heading.textContent = 'Frame metrics';
  heading.style.margin = '0 0 10px';
  heading.style.fontSize = '0.95rem';
  heading.style.fontWeight = '600';
  heading.style.letterSpacing = '0.01em';
  heading.style.color = '#1f252c';

  grid.style.display = 'grid';
  grid.style.gridTemplateColumns = 'repeat(auto-fit, minmax(150px, 1fr))';
  grid.style.gap = '10px';

  panel.append(heading, grid);

  if (mountTarget?.appendChild) {
    mountTarget.appendChild(panel);
  }

  return {
    container: panel,
    update(frame = {}) {
      const metrics = mapFrameMetrics(frame);
      const cards = metrics.map((metric) => createCardElement(doc, metric));
      grid.replaceChildren(...cards);
      return metrics;
    }
  };
}
