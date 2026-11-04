import { describe, it, expect } from 'vitest';
import {
  formatVccDate,
  formatVccDateTime,
  formatVccDueDate,
  formatVccYearLabel,
  formatVccDueDatesList,
  isLeapYear,
  isValidCalendarDate,
  toBuddhistYear,
  toCommonEraYear
} from '../utils/vccDateUtils';

describe('VCC Thai Date & Buddhist Year (พ.ศ.) Utilities', () => {
  describe('isLeapYear and isValidCalendarDate', () => {
    it('accurately identifies leap years according to standard astronomical rules', () => {
      expect(isLeapYear(2024)).toBe(true);
      expect(isLeapYear('2028')).toBe(true);
      expect(isLeapYear(2000)).toBe(true); // divisible by 400
      expect(isLeapYear(2026)).toBe(false);
      expect(isLeapYear(2100)).toBe(false); // century not divisible by 400
      expect(isLeapYear('invalid')).toBe(false);
      expect(isLeapYear(null)).toBe(false);
    });

    it('rejects impossible calendar dates like 2026-02-31 and 2026-13-01', () => {
      expect(isValidCalendarDate(2026, 2, 31)).toBe(false);
      expect(isValidCalendarDate(2026, 13, 1)).toBe(false);
      expect(isValidCalendarDate(2026, 0, 15)).toBe(false);
      expect(isValidCalendarDate(2026, 4, 31)).toBe(false); // April has 30 days
      expect(isValidCalendarDate(2026, 4, 30)).toBe(true);
      expect(isValidCalendarDate(2026, 2, 29)).toBe(false); // 2026 is not a leap year
      expect(isValidCalendarDate(2024, 2, 29)).toBe(true); // 2024 is a leap year
      expect(isValidCalendarDate(2028, 2, 29)).toBe(true); // 2028 is a leap year
      expect(isValidCalendarDate(2100, 2, 29)).toBe(false);
    });
  });

  describe('formatVccDate', () => {
    it('formats valid date-only strings without timezone day-shift', () => {
      expect(formatVccDate('2026-03-31')).toBe('31 มี.ค. 2569');
      expect(formatVccDate('2026-12-31')).toBe('31 ธ.ค. 2569');
      expect(formatVccDate('2027-01-01')).toBe('1 ม.ค. 2570');
      // Leap year
      expect(formatVccDate('2028-02-29')).toBe('29 ก.พ. 2571');
    });

    it('returns fallback for impossible or invalid calendar dates', () => {
      expect(formatVccDate('2026-02-31')).toBe('-');
      expect(formatVccDate('2026-13-01')).toBe('-');
      expect(formatVccDate('2026-02-29')).toBe('-'); // non-leap year
      expect(formatVccDate('2026-04-31')).toBe('-'); // April has 30 days
      expect(formatVccDate('not-a-date')).toBe('-');
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

    it('handles UTC boundary crossings across midnight and across year boundaries', () => {
      // UTC 2026-12-31 20:30 -> Bangkok 2027-01-01 03:30
      const newYearUtc = '2026-12-31T20:30:00Z';
      expect(formatVccDate(newYearUtc, { includeTime: true })).toBe('1 ม.ค. 2570 03:30');
    });

    it('handles timestamps without timezone as SQLite UTC contract', () => {
      // SQLite datetime string without Z: "2026-04-15 14:30:00" -> UTC 14:30 -> Bangkok 21:30
      expect(formatVccDate('2026-04-15 14:30:00', { includeTime: true })).toBe('15 เม.ย. 2569 21:30');
    });

    it('handles falsy or invalid values gracefully', () => {
      expect(formatVccDate(null)).toBe('-');
      expect(formatVccDate('')).toBe('-');
      expect(formatVccDate('-')).toBe('-');
      expect(formatVccDate('null')).toBe('-');
      expect(formatVccDate('undefined')).toBe('-');
      expect(formatVccDate(undefined, { fallback: 'ไม่มีข้อมูล' })).toBe('ไม่มีข้อมูล');
    });
  });

  describe('formatVccDateTime', () => {
    it('appends "น." suffix when input contains a time component', () => {
      const iso = '2026-10-28T02:30:00.000Z';
      expect(formatVccDateTime(iso)).toBe('28 ต.ค. 2569 09:30 น.');

      const sqliteUtc = '2026-04-15 09:00:00';
      expect(formatVccDateTime(sqliteUtc)).toBe('15 เม.ย. 2569 16:00 น.');
    });

    it('normalizes SQLite UTC datetime strings without timezone suffix', () => {
      // Contract: SQLite stores timestamps in UTC. 14:30 UTC -> 21:30 Asia/Bangkok (+7h)
      expect(formatVccDateTime('2026-04-15 14:30:00')).toBe('15 เม.ย. 2569 21:30 น.');
      expect(formatVccDateTime('2026-04-15T14:30:00')).toBe('15 เม.ย. 2569 21:30 น.');
      expect(formatVccDateTime('2026-04-15 14:30:00.500')).toBe('15 เม.ย. 2569 21:30 น.');
    });

    it('strictly rejects impossible ISO timestamps with time and timezone without automatic rollover', () => {
      // 2026-02-31 does not exist; JavaScript Date must NOT silently roll over to March 3rd!
      expect(formatVccDate('2026-02-31T14:30:00Z')).toBe('-');
      expect(formatVccDate('2026-02-31T14:30:00+07:00')).toBe('-');
      expect(formatVccDateTime('2026-02-31T14:30:00Z')).toBe('-');
      expect(formatVccDateTime('2026-02-31T14:30:00+07:00')).toBe('-');

      // Month 13 or invalid day in month
      expect(formatVccDate('2026-13-01T10:00:00Z')).toBe('-');
      expect(formatVccDate('2026-04-31T10:00:00Z')).toBe('-'); // April only has 30 days
      expect(formatVccDateTime('2026-04-31T10:00:00Z')).toBe('-');

      // Non-leap year Feb 29
      expect(formatVccDate('2026-02-29T10:00:00Z')).toBe('-');
      expect(formatVccDateTime('2026-02-29T10:00:00Z')).toBe('-');

      // Leap year Feb 29 is valid
      expect(formatVccDate('2024-02-29T10:00:00Z')).toBe('29 ก.พ. 2567');
      expect(formatVccDateTime('2024-02-29T10:00:00Z')).toBe('29 ก.พ. 2567 17:00 น.');
    });

    it('does NOT append "น." if input has NO time component (date-only)', () => {
      expect(formatVccDateTime('2026-04-15')).toBe('15 เม.ย. 2569');
      expect(formatVccDateTime('2026-12-31')).toBe('31 ธ.ค. 2569');
    });

    it('returns fallback for falsy or invalid input', () => {
      expect(formatVccDateTime(null)).toBe('-');
      expect(formatVccDateTime('')).toBe('-');
      expect(formatVccDateTime('-')).toBe('-');
      expect(formatVccDateTime('2026-02-31')).toBe('-');
    });
  });

  describe('Year Conversion (toBuddhistYear, toCommonEraYear, formatVccYearLabel)', () => {
    it('safely converts year number and string without string concatenation', () => {
      expect(toBuddhistYear(2026)).toBe(2569);
      expect(toBuddhistYear('2026')).toBe(2569);
      expect(toCommonEraYear(2026)).toBe(2026);
      expect(toCommonEraYear('2026')).toBe(2026);
    });

    it('prevents double-addition when year is already in Buddhist Era (>= 2400)', () => {
      expect(toBuddhistYear(2569)).toBe(2569); // NOT 3112
      expect(toBuddhistYear('2569')).toBe(2569);
      expect(toCommonEraYear(2569)).toBe(2026);
      expect(toCommonEraYear('2569')).toBe(2026);
    });

    it('formats year label with Buddhist Era and CE indicators', () => {
      expect(formatVccYearLabel(2026)).toBe('พ.ศ. 2569 (2026)');
      expect(formatVccYearLabel('2027')).toBe('พ.ศ. 2570 (2027)');
      expect(formatVccYearLabel(2569)).toBe('พ.ศ. 2569 (2026)');
      expect(formatVccYearLabel('2570')).toBe('พ.ศ. 2570 (2027)');
      expect(formatVccYearLabel(null)).toBe('-');
      expect(formatVccYearLabel('')).toBe('-');
      expect(formatVccYearLabel('invalid')).toBe('-');
    });
  });

  describe('formatVccDueDate', () => {
    it('formats standard work order due date', () => {
      expect(formatVccDueDate('2026-03-31')).toBe('31 มี.ค. 2569');
      expect(formatVccDueDate('2026-02-31')).toBe('-'); // invalid date returns fallback
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
      expect(formatVccDueDatesList(['-'])).toBe('-');
    });
  });
});
