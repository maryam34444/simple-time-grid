import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateTimeGrid, isWithinBreak } from '../src/core.js';

// All tests use fixed epoch-ms timestamps. Nothing depends on wall-clock time.

const T0 = 1_700_000_000_000; // arbitrary fixed base

function ts(h) {
  return T0 + h * 3600_000;
}

function tsMin(m) {
  return T0 + m * 60_000;
}

const HOUR = 3600_000;
const HALF = 1800_000;
const TEN  = 600_000;

test('generateTimeGrid: basic grid with no breaks', () => {
  const slots = generateTimeGrid({ start: ts(0), end: ts(4), intervalMs: HOUR });
  assert.equal(slots.length, 4);
  assert.deepEqual(slots[0], { start: ts(0), end: ts(1) });
  assert.deepEqual(slots[1], { start: ts(1), end: ts(2) });
  assert.deepEqual(slots[2], { start: ts(2), end: ts(3) });
  assert.deepEqual(slots[3], { start: ts(3), end: ts(4) });
});

test('generateTimeGrid: endpoint excluded (half-open)', () => {
  // start==end yields empty grid
  const empty = generateTimeGrid({ start: ts(0), end: ts(0), intervalMs: HOUR });
  assert.deepEqual(empty, []);
});

test('generateTimeGrid: slot start equal to end is NOT included', () => {
  // Range [0, 2h) with 1h slots → starts at 0 and 1h, not 2h
  const slots = generateTimeGrid({ start: ts(0), end: ts(2), intervalMs: HOUR });
  assert.equal(slots.length, 2);
  assert.equal(slots[0].start, ts(0));
  assert.equal(slots[1].start, ts(1));
});

test('generateTimeGrid: slot at start IS included', () => {
  const slots = generateTimeGrid({ start: ts(5), end: ts(7), intervalMs: HOUR });
  assert.equal(slots.length, 2);
  assert.equal(slots[0].start, ts(5));
});

test('generateTimeGrid: excludes slots inside a break window', () => {
  // Grid 0..6h hourly, break 2h..3h
  const slots = generateTimeGrid({
    start: ts(0),
    end: ts(6),
    intervalMs: HOUR,
    breaks: [{ start: ts(2), end: ts(3) }],
  });
  const starts = slots.map((s) => s.start);
  assert.deepEqual(starts, [ts(0), ts(1), ts(3), ts(4), ts(5)]);
});

test('generateTimeGrid: slot starting exactly at break end is NOT excluded', () => {
  // break [2h, 3h). Slot at 3h is kept.
  const slots = generateTimeGrid({
    start: ts(0),
    end: ts(5),
    intervalMs: HOUR,
    breaks: [{ start: ts(2), end: ts(3) }],
  });
  const starts = slots.map((s) => s.start);
  assert.ok(starts.includes(ts(3)));
});

test('generateTimeGrid: slot starting exactly at break start IS excluded', () => {
  const slots = generateTimeGrid({
    start: ts(0),
    end: ts(5),
    intervalMs: HOUR,
    breaks: [{ start: ts(2), end: ts(3) }],
  });
  const starts = slots.map((s) => s.start);
  assert.ok(!starts.includes(ts(2)));
});

test('generateTimeGrid: multiple breaks', () => {
  const slots = generateTimeGrid({
    start: ts(0),
    end: ts(8),
    intervalMs: HOUR,
    breaks: [
      { start: ts(2), end: ts(3) },
      { start: ts(5), end: ts(6) },
    ],
  });
  const starts = slots.map((s) => s.start);
  assert.deepEqual(starts, [ts(0), ts(1), ts(3), ts(4), ts(6), ts(7)]);
});

test('generateTimeGrid: overlapping breaks are harmless', () => {
  // Two breaks overlapping — slot at 2h excluded once, still absent
  const slots = generateTimeGrid({
    start: ts(0),
    end: ts(5),
    intervalMs: HOUR,
    breaks: [
      { start: ts(2), end: ts(3) },
      { start: ts(2), end: ts(4) }, // overlaps
    ],
  });
  const starts = slots.map((s) => s.start);
  assert.deepEqual(starts, [ts(0), ts(1), ts(4)]);
});

test('generateTimeGrid: breaks entirely outside grid are ignored', () => {
  const slots = generateTimeGrid({
    start: ts(0),
    end: ts(4),
    intervalMs: HOUR,
    breaks: [{ start: ts(10), end: ts(12) }],
  });
  assert.equal(slots.length, 4);
});

test('generateTimeGrid: fractional interval works', () => {
  // 30-min intervals over 2 hours → 4 slots
  const slots = generateTimeGrid({ start: ts(0), end: ts(2), intervalMs: HALF });
  assert.equal(slots.length, 4);
  assert.equal(slots[0].start, ts(0));
  assert.equal(slots[1].start, ts(0) + HALF);
  assert.equal(slots[2].start, ts(1));
  assert.equal(slots[3].start, ts(1) + HALF);
});

test('generateTimeGrid: negative interval throws', () => {
  assert.throws(
    () => generateTimeGrid({ start: ts(0), end: ts(2), intervalMs: -HOUR }),
    /intervalMs must be > 0/
  );
});

test('generateTimeGrid: zero interval throws', () => {
  assert.throws(
    () => generateTimeGrid({ start: ts(0), end: ts(2), intervalMs: 0 }),
    /intervalMs must be > 0/
  );
});

test('generateTimeGrid: start > end throws', () => {
  assert.throws(
    () => generateTimeGrid({ start: ts(5), end: ts(0), intervalMs: HOUR }),
    /start must be <= end/
  );
});

test('generateTimeGrid: NaN interval throws', () => {
  assert.throws(
    () => generateTimeGrid({ start: ts(0), end: ts(2), intervalMs: NaN }),
    /must not be NaN/
  );
});

test('generateTimeGrid: non-number start throws', () => {
  assert.throws(
    () => generateTimeGrid({ start: 'x', end: ts(2), intervalMs: HOUR }),
    /must be numbers/
  );
});

test('generateTimeGrid: break with start > end throws', () => {
  assert.throws(
    () => generateTimeGrid({
      start: ts(0),
      end: ts(2),
      intervalMs: HOUR,
      breaks: [{ start: ts(3), end: ts(2) }],
    }),
    /break.start must be <= break.end/
  );
});

test('generateTimeGrid: opts null throws', () => {
  assert.throws(
    () => generateTimeGrid(null),
    /opts must be an object/
  );
});

test('generateTimeGrid: empty breaks array works', () => {
  const slots = generateTimeGrid({
    start: ts(0),
    end: ts(2),
    intervalMs: HOUR,
    breaks: [],
  });
  assert.equal(slots.length, 2);
});

test('isWithinBreak: basic cases', () => {
  assert.equal(isWithinBreak(ts(2), ts(2), ts(3)), true);  // start edge
  assert.equal(isWithinBreak(ts(3), ts(2), ts(3)), false);  // end edge (excluded)
  assert.equal(isWithinBreak(ts(2).valueOf() + 1, ts(2), ts(3)), true);
  assert.equal(isWithinBreak(ts(1), ts(2), ts(3)), false); // before
});

test('isWithinBreak: NaN throws', () => {
  assert.throws(
    () => isWithinBreak(NaN, ts(0), ts(1)),
    /NaN/
  );
});

test('isWithinBreak: non-number throws', () => {
  assert.throws(
    () => isWithinBreak('x', ts(0), ts(1)),
    /must be numbers/
  );
});
