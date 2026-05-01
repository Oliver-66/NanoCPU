import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('public README contains required project framing', () => {
  const readme = fs.readFileSync('public/README.md', 'utf8');
  assert.match(readme, /Synapse NanoCPU/);
  assert.match(readme, /attractor-based solver/i);
  assert.match(readme, /future Synapse Research Foundation initiative/i);
});
