import { expect, it } from 'vitest';
import { RAIL_WIDTH_DEFAULT, RAIL_WIDTH_MAX, RAIL_WIDTH_MIN, nextRailDrag } from './layout-context';

it('opens at the Computer sidebar width and follows a drag', () => {
  expect(RAIL_WIDTH_DEFAULT).toBe(256);
  expect(nextRailDrag(256, 40)).toEqual({ expanded: true, width: 296 });
  expect(nextRailDrag(256, 400).width).toBe(RAIL_WIDTH_MAX);
  expect(nextRailDrag(256, -80).expanded).toBe(false);
  expect(nextRailDrag(52, RAIL_WIDTH_MIN - 52)).toEqual({ expanded: true, width: RAIL_WIDTH_MIN });
  expect(nextRailDrag(52, 40).expanded).toBe(false);
});
