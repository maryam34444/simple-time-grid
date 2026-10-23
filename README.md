# simple-time-grid

Generates an array of evenly spaced time slots between two datetimes at a fixed interval, excluding any slot whose start falls inside a defined break window.

```js
import { generateTimeGrid } from 'simple-time-grid';

const slots = generateTimeGrid({
  start: Date.parse('2024-01-01T09:00:00Z'),
  end:   Date.parse('2024-01-01T17:00:00Z'),
  intervalMs: 60 * 60 * 1000, // 1 hour
  breaks: [
    { start: Date.parse('2024-01-01T12:00:00Z'),
      end:   Date.parse('2024-01-01T13:00:00Z') }, // lunch
  ],
});

// slots === [ {start:..09:00, end:..10:00}, ..., {start:..16:00, end:..17:00} ]
```

## Why

The specific problem: you have a working window (a day, a shift, a service period) and you need to carve it into fixed-width appointment slots, minus the breaks. Doing this inline with `Date` arithmetic and a filter is easy to get wrong at the edges — does the slot that starts exactly when lunch begins count? Does the slot at `end` appear with zero width? — and getting it wrong means double-bookings or phantom slots.

The trade-off: this library takes epoch milliseconds as input and returns epoch milliseconds as output. It does not parse ISO strings, format dates, or understand time zones. That keeps it zero-dependency and free of the environment-specific parsing quirks that make `Date` unreliable across runtimes. If you need human-readable times, convert before and after.

## The awkward edge

Half-open intervals throughout: a slot is generated when its start is in `[start, end)`, and a slot is excluded when its start is in `[breakStart, breakEnd)`. The practical consequence is that a slot starting exactly at `end` never appears (no zero-width slot), and a slot starting exactly when a break ends IS kept. If you wanted a grid that includes a slot whose start equals `end`, this is not that library — adjust your `end` by one interval.

A slot is also kept even if its width (`intervalMs`) pushes its `end` past the grid's `end`. The library does not truncate; truncate yourself if you need to.

## API

### `generateTimeGrid(opts)` → `Array<{start: number, end: number}>`

- `opts.start` (number, epoch ms) — grid start, inclusive.
- `opts.end` (number, epoch ms) — grid end, exclusive for slot starts.
- `opts.intervalMs` (number, ms) — spacing between slot starts; must be > 0.
- `opts.breaks` (optional, array of `{start: number, end: number}`) — half-open break windows. Overlaps are harmless.

Throws on: non-number inputs, `NaN`, `start > end`, `intervalMs <= 0`, or a break with `start > end`.

### `isWithinBreak(ts, breakStart, breakEnd)` → `boolean`

Returns `true` if `breakStart <= ts < breakEnd`. Exposed because it's the same predicate the grid uses internally and you may want it for ad-hoc checks.
