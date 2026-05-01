import test from 'node:test';
import assert from 'node:assert/strict';
import { mapFrameMetrics } from '../js/ui/metrics-panel.js';

test('mapFrameMetrics returns compact cards from observables', () => {
  const cards = mapFrameMetrics({
    observables: {
      energy_total: 299.5924,
      density_entropy: 5.6621,
      cluster_count: 3
    }
  });

  assert.deepEqual(cards.map((card) => card.key), [
    'energy_total',
    'density_entropy',
    'cluster_count'
  ]);
});

test('mapFrameMetrics rounds values and degrades missing optional values gracefully', () => {
  const cards = mapFrameMetrics({
    observables: {
      energy_total: 299.5924,
      density_entropy: 5.6621,
      cluster_count: 3
    }
  });

  assert.equal(cards[0].displayValue, '299.6');
  assert.equal(cards[1].displayValue, '5.7');
  assert.equal(cards[2].displayValue, '3');
});
