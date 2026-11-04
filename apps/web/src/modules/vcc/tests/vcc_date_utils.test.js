import { describe, it, expect } from 'vitest';
import {
  formatVccDate,
  formatVccDateTime,
  formatVccDueDate,
  formatVccYearLabel,
  formatVccDueDatesList
} from '../utils/vccDateUtils';

describe('VCC Thai Date & Buddhist Year (พ.ศ.) Utilities', () => {
  describe('formatVccDate', () => {
    it('formats date-only strings without timezone day-shift', () => {
      expect(formatVccDate('2026-03-31')).toBe('31 มี.ค. 2569');
      expect(formatVccDate('2026-12-31')).toBe('31 ธ.ค. 2569');
      expect(formatVccDate('2027-01-01')).toBe('1 ม.ค. 2570');
      // Leap year
      expect(formatVccDate('2028-02-29')).toBe('29 ก.พ. 2571');
    });

    it('supports different formatting styles', () => {
      expect(formatVccDate('2026-03-31', { style: 'slash' })).toBe('31/03/2569');
      expect(formatVccDate('2026-03-31', { style: 'full' })).toBe('31 มีนาคม 2569');
      expect(formatVccDate('2026-03-31', { style: 'yearOnly' })).toBe('2569');
    });

    it('formats ISO timestamps with Asia/Bangkok GMT+7 time conversion', () => {
      // UTC 02:00 -> Bangkok 09:00 (+7 hrs)
      const iso = '2026-10-28T02:00:00.000Z';
      const formatted = formatVccDate(iso, { includeTime: true });
      expect(formatted).toBe('28 ต.ค. 2569 09:00');
    });

    it('handles falsy or invalid values gracefully', () => {
      expect(formatVccDate(null)).toBe('-');
      expect(formatVccDate('')).toBe('-');
      expect(formatVccDate('-')).toBe('-');
      expect(formatVccDate(undefined, { fallback: 'ไม่มีข้อมูล' })).toBe('ไม่มีข้อมูล');
    });
  });

  describe('formatVccDateTime', () => {
    it('appends "น." suffix in Asia/Bangkok time', () => {
      const iso = '2026-10-28T02:30:00.000Z';
      expect(formatVccDateTime(iso)).toBe('28 ต.ค. 2569 09:30 น.');
    });

    it('returns fallback for falsy input', () => {
      expect(formatVccDateTime(null)).toBe('-');
    });
  });

  describe('formatVccDueDate', () => {
    it('formats standard work order due date', () => {
      expect(formatVccDueDate('2026-03-31')).toBe('31 มี.ค. 2569');
    });
  });

  describe('formatVccYearLabel', () => {
    it('formats year with Buddhist Era and CE', () => {
      expect(formatVccYearLabel(2026)).toBe('พ.ศ. 2569 (2026)');
      expect(formatVccYearLabel('2027')).toBe('พ.ศ. 2570 (2027)');
      expect(formatVccYearLabel(null)).toBe('-');
    });
  });

  describe('formatVccDueDatesList', () => {
    it('formats array of dates with optional limit', () => {
      const list = ['2026-03-31', '2026-09-30'];
      expect(formatVccDueDatesList(list)).toBe('31 มี.ค. 2569, 30 ก.ย. 2569');

      const list3 = ['2026-03-31', '2026-06-30', '2026-09-30'];
      expect(formatVccDueDatesList(list3, 2)).toBe('31 มี.ค. 2569, 30 มิ.ย. 2569 (+1 เดือน)');
    });

    it('handles empty or non-array inputs', () => {
      expect(formatVccDueDatesList([])).toBe('-');
      expect(formatVccDueDatesList(null)).toBe('-');
    });
  });
});
