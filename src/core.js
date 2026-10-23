/**
 * Generate evenly spaced time slots between two datetimes at a fixed interval,
 * skipping any slot that falls inside a break window.
 *
 * Key decisions (pick-one, documented):
 *
 * 1. Exclusivity of endpoints: a slot is generated only if its start is
 *    strictly inside [start, end). This means the very last slot starts exactly
 *    at `end` and has zero width — we exclude it, so no zero-width slot ever
 *    appears in the result. A slot at `start` IS included.
 *
 * 2. Break matching: a slot is excluded if its start time is inside any break
 *    window [breakStart, breakEnd). Half-open, same as the main range. A slot
 *    starting exactly when a break ends is NOT excluded.
 *
 * 3. Slot width vs interval: a slot has width `intervalMs`. If that pushes
 *    past `end`, the slot is still kept (the caller asked for it). We do not
 *    truncate. If you need truncation, slice afterwards.
 *
 * 4. Overlapping breaks: we don't merge them. If a slot start is inside ANY
 *    break, it's excluded once. Overlap is harmless.
 *
 * 5. Breaks outside the grid: ignored. Only the start point matters.
 *
 * 6. Type of inputs: all times are epoch milliseconds (number). Parsing of
 *    ISO strings is the caller's job. This keeps the library zero-dependency
 *    and avoids Date string parsing quirks across environments.
 *
 * 7. Negative intervals throw. They don't make sense for a forward grid.
 *    Zero interval throws too — it would produce an infinite loop.
 *
 * 8. start > end throws. Useless input.
 *
 * Returns an array of slot objects: { start: number, end: number }.
 * Sorted ascending by start.
 */

/**
 * Check whether a timestamp falls within a half-open break window.
 *
 * @param {number} ts       - epoch ms timestamp to test
 * @param {number} brkStart - epoch ms break start (inclusive)
 * @param {number} brkEnd   - epoch ms break end (exclusive)
 * @returns {boolean} true if brkStart <= ts < brkEnd
 */
export function isWithinBreak(ts, brkStart, brkEnd) {
  if (typeof ts !== 'number' || typeof brkStart !== 'number' || typeof brkEnd !== 'number') {
    throw new TypeError('isWithinBreak: all arguments must be numbers (epoch ms)');
  }
  if (Number.isNaN(ts) || Number.isNaN(brkStart) || Number.isNaN(brkEnd)) {
    throw new RangeError('isWithinBreak: NaN is not a valid timestamp');
  }
  return ts >= brkStart && ts < brkEnd;
}

/**
 * @typedef {Object} BreakWindow
 * @property {number} start - epoch ms, inclusive
 * @property {number} end   - epoch ms, exclusive
 */

/**
 * @typedef {Object} TimeSlot
 * @property {number} start - epoch ms
 * @property {number} end   - epoch ms (start + intervalMs)
 */

/**
 * Generate evenly spaced time slots between `start` and `end`.
 *
 * @param {Object}   opts
 * @param {number}   opts.start       - epoch ms, grid start (inclusive)
 * @param {number}   opts.end         - epoch ms, grid end (exclusive for slot starts)
 * @param {number}   opts.intervalMs  - spacing between slot starts, in ms
 * @param {BreakWindow[]} [opts.breaks=[]] - break windows to exclude
 * @returns {TimeSlot[]}
 */
export function generateTimeGrid(opts) {
  if (opts === null || typeof opts !== 'object') {
    throw new TypeError('generateTimeGrid: opts must be an object');
  }

  const { start, end, intervalMs, breaks = [] } = opts;

  // Validate types before anything else. We fail loudly rather than coerce,
  // because silent coercion of "90" to 90 or undefined to NaN produces grids
  // that look fine but are wrong.
  if (typeof start !== 'number' || typeof end !== 'number' || typeof intervalMs !== 'number') {
    throw new TypeError('generateTimeGrid: start, end, intervalMs must be numbers (epoch ms)');
  }
  if (Number.isNaN(start) || Number.isNaN(end) || Number.isNaN(intervalMs)) {
    throw new RangeError('generateTimeGrid: start, end, intervalMs must not be NaN');
  }
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    throw new RangeError('generateTimeGrid: start and end must be finite');
  }

  // An inverted range is meaningless for a forward grid. Reject it.
  if (start > end) {
    throw new RangeError('generateTimeGrid: start must be <= end');
  }

  // Zero or negative interval would either infinite-loop or run backwards.
  // Neither is a sensible grid.
  if (intervalMs <= 0) {
    throw new RangeError('generateTimeGrid: intervalMs must be > 0');
  }

  if (!Number.isFinite(intervalMs)) {
    throw new RangeError('generateTimeGrid: intervalMs must be finite');
  }

  // Validate breaks. We accept any iterable, but require the right shape.
  // We don't sort breaks — we iterate them per slot, so order is irrelevant.
  const breakList = Array.isArray(breaks) ? breaks : Array.from(breaks);
  for (const b of breakList) {
    if (b === null || typeof b !== 'object') {
      throw new TypeError('generateTimeGrid: each break must be an object with start and end');
    }
    const bs = b.start;
    const be = b.end;
    if (typeof bs !== 'number' || typeof be !== 'number') {
      throw new TypeError('generateTimeGrid: break.start and break.end must be numbers');
    }
    if (Number.isNaN(bs) || Number.isNaN(be)) {
      throw new RangeError('generateTimeGrid: break start/end must not be NaN');
    }
    if (bs > be) {
      throw new RangeError('generateTimeGrid: break.start must be <= break.end');
    }
  }

  const slots = [];

  // Guard against pathological infinite loops. If intervalMs is so small
  // relative to the range that we'd produce more than 1,000,000 slots, bail.
  // This is a safety net, not a feature — a real grid will never hit this.
  const range = end - start;
  if (range > 0) {
    const maxSlots = 1_000_000;
    const estimated = Math.floor(range / intervalMs) + 1;
    if (estimated > maxSlots) {
      throw new RangeError(
        'generateTimeGrid: interval too small for the range; refusing to produce > 1,000,000 slots'
      );
    }
  }

  // Walk forward. A slot is generated when its start is in [start, end).
  // That's the half-open contract documented above.
  for (let t = start; t < end; t += intervalMs) {
    let inBreak = false;
    for (const b of breakList) {
      if (isWithinBreak(t, b.start, b.end)) {
        inBreak = true;
        break;
      }
    }
    if (!inBreak) {
      slots.push({ start: t, end: t + intervalMs });
    }
  }

  return slots;
}
