/**
 * vccDateUtils.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Centralized Thai Date & Buddhist Era (พ.ศ.) Utilities for VCC (Phase 3 UX Round D)
 * 
 * Compliant with Thai Industrial Localization & Asia/Bangkok Standard Time (GMT+7):
 * - Decouples display formatting from database/API storage (which stays ISO YYYY-MM-DD / ISO-8601).
 * - Avoids UTC timezone day-shift bugs on date-only strings ("YYYY-MM-DD").
 * - Validates true calendar dates (leap years, month days, invalid months/days).
 * - Enforces SQLite UTC contract for timestamps without timezone suffix.
 * - Prevents string concatenation or double-addition on Buddhist Year conversion.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export const THAI_MONTHS_SHORT = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'
];

export const THAI_MONTHS_FULL = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
];

/**
 * Determine if a given Common Era (CE) year is a leap year (ปีอธิกสุรทิน).
 * Rules: Divisible by 4, not by 100 unless divisible by 400.
 *
 * @param {number|string} year
 * @returns {boolean}
 */
export const isLeapYear = (year) => {
  const y = typeof year === 'number' ? year : parseInt(String(year).trim(), 10);
  if (isNaN(y) || y <= 0) return false;
  return (y % 4 === 0 && y % 100 !== 0) || (y % 400 === 0);
};

/**
 * Validates that year, month, and day form a real, valid calendar date.
 * Rejects impossible dates such as 2026-02-31, 2026-13-01, or 2026-02-29 (non-leap).
 *
 * @param {number|string} year
 * @param {number|string} month - 1-indexed (1 to 12)
 * @param {number|string} day - 1 to 31
 * @returns {boolean}
 */
export const isValidCalendarDate = (year, month, day) => {
  const y = typeof year === 'number' ? year : parseInt(String(year).trim(), 10);
  const m = typeof month === 'number' ? month : parseInt(String(month).trim(), 10);
  const d = typeof day === 'number' ? day : parseInt(String(day).trim(), 10);

  if (isNaN(y) || isNaN(m) || isNaN(d)) return false;
  if (y <= 0 || m < 1 || m > 12 || d < 1 || d > 31) return false;

  const leap = isLeapYear(y);
  const daysInMonth = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

  return d <= daysInMonth[m - 1];
};

/**
 * Convert a CE year to Buddhist Era (พ.ศ.) safely.
 * Prevents string concatenation ("2026" + 543) and double-addition if already BE (>= 2400).
 *
 * @param {number|string} year
 * @returns {number|null}
 */
export const toBuddhistYear = (year) => {
  if (year == null || year === '' || year === '-') return null;
  const y = typeof year === 'number' ? year : parseInt(String(year).trim(), 10);
  if (isNaN(y) || y <= 0) return null;
  // If year is already in Buddhist Era range (>= 2400 in modern calendar)
  if (y >= 2400) return y;
  return y + 543;
};

/**
 * Convert a Buddhist Era or CE year to Common Era (ค.ศ.) safely.
 *
 * @param {number|string} year
 * @returns {number|null}
 */
export const toCommonEraYear = (year) => {
  if (year == null || year === '' || year === '-') return null;
  const y = typeof year === 'number' ? year : parseInt(String(year).trim(), 10);
  if (isNaN(y) || y <= 0) return null;
  if (y >= 2400) return y - 543;
  return y;
};

/**
 * Format a date-only ("YYYY-MM-DD") or ISO timestamp string to Thai Buddhist Year format.
 *
 * @param {string|number|Date} dateInput
 * @param {Object} [options]
 * @param {'short'|'slash'|'full'|'yearOnly'} [options.style='short'] -
 *   - 'short': '31 มี.ค. 2569'
 *   - 'slash': '31/03/2569'
 *   - 'full': '31 มีนาคม 2569'
 *   - 'yearOnly': '2569'
 * @param {boolean} [options.includeTime=false] - Whether to append HH:mm in Asia/Bangkok
 * @param {string} [options.fallback='-']
 * @returns {string}
 */
export const formatVccDate = (dateInput, options = {}) => {
  const {
    style = 'short',
    includeTime = false,
    fallback = '-'
  } = options;

  if (
    dateInput == null ||
    dateInput === '' ||
    dateInput === '-' ||
    dateInput === 'null' ||
    dateInput === 'undefined'
  ) {
    return fallback;
  }

  // 1. Date-only pattern: YYYY-MM-DD (e.g. "2026-03-31")
  // Direct calendar validation and arithmetic parsing avoids UTC midnight offset bugs
  if (typeof dateInput === 'string') {
    const trimmed = dateInput.trim();
    const dateOnlyMatch = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (dateOnlyMatch) {
      const year = parseInt(dateOnlyMatch[1], 10);
      const month = parseInt(dateOnlyMatch[2], 10);
      const day = parseInt(dateOnlyMatch[3], 10);

      // Validate actual calendar correctness (e.g. leap years, 2026-02-31, 2026-13-01)
      if (!isValidCalendarDate(year, month, day)) {
        return fallback;
      }

      const thaiYear = year + 543;

      if (style === 'yearOnly') return String(thaiYear);
      if (style === 'slash') {
        return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${thaiYear}`;
      }
      if (style === 'full') {
        const fullMonth = THAI_MONTHS_FULL[month - 1] || String(month);
        return `${day} ${fullMonth} ${thaiYear}`;
      }
      // Default: 'short'
      const shortMonth = THAI_MONTHS_SHORT[month - 1] || String(month);
      return `${day} ${shortMonth} ${thaiYear}`;
    }
  }

  // 2. Timestamp or Date Object with potential Time component
  try {
    let dateObj;

    if (dateInput instanceof Date) {
      dateObj = dateInput;
    } else if (typeof dateInput === 'string') {
      const trimmed = dateInput.trim();

      // Check if string is a datetime without explicit timezone offset (e.g. "2026-04-15 14:30:00" from SQLite)
      // Contract: SQLite stores timestamps in UTC. If no timezone indicator (Z or +HH:mm), normalize to UTC ('Z')
      const noTzMatch = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?$/);
      if (noTzMatch) {
        const year = parseInt(noTzMatch[1], 10);
        const month = parseInt(noTzMatch[2], 10);
        const day = parseInt(noTzMatch[3], 10);
        if (!isValidCalendarDate(year, month, day)) {
          return fallback;
        }
        const hour = noTzMatch[4];
        const min = noTzMatch[5];
        const sec = noTzMatch[6] || '00';
        dateObj = new Date(
          `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${hour}:${min}:${sec}Z`
        );
      } else {
        dateObj = new Date(trimmed);
      }
    } else if (typeof dateInput === 'number') {
      dateObj = new Date(dateInput);
    } else {
      return fallback;
    }

    if (isNaN(dateObj.getTime())) {
      return fallback;
    }

    const formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Bangkok',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });

    const parts = formatter.formatToParts(dateObj);
    const getPart = (type) => parts.find((p) => p.type === type)?.value || '';

    const year = parseInt(getPart('year'), 10);
    const month = parseInt(getPart('month'), 10);
    const day = parseInt(getPart('day'), 10);
    const hour = getPart('hour');
    const minute = getPart('minute');

    if (!isValidCalendarDate(year, month, day)) {
      return fallback;
    }

    const thaiYear = year + 543;

    let formattedDate = '';
    if (style === 'yearOnly') return String(thaiYear);
    if (style === 'slash') {
      formattedDate = `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${thaiYear}`;
    } else if (style === 'full') {
      const fullMonth = THAI_MONTHS_FULL[month - 1] || String(month);
      formattedDate = `${day} ${fullMonth} ${thaiYear}`;
    } else {
      // Default: 'short'
      const shortMonth = THAI_MONTHS_SHORT[month - 1] || String(month);
      formattedDate = `${day} ${shortMonth} ${thaiYear}`;
    }

    if (includeTime && hour && minute) {
      return `${formattedDate} ${hour}:${minute}`;
    }

    return formattedDate;
  } catch {
    return fallback;
  }
};

/**
 * Format timestamp into Asia/Bangkok date and time.
 * If input contains no time information (e.g. date-only "YYYY-MM-DD"),
 * it outputs the Thai date alone WITHOUT appending " น.".
 *
 * e.g. "2026-10-28T09:00:00Z" -> "28 ต.ค. 2569 16:00 น."
 * e.g. "2026-10-28"           -> "28 ต.ค. 2569"
 *
 * @param {string|number|Date} dateInput
 * @param {string} [fallback='-']
 * @returns {string}
 */
export const formatVccDateTime = (dateInput, fallback = '-') => {
  if (dateInput == null || dateInput === '' || dateInput === '-') return fallback;

  // If input is purely a date-only string (e.g. "2026-04-15"), do not include time or "น."
  if (typeof dateInput === 'string' && /^\d{4}-\d{1,2}-\d{1,2}$/.test(dateInput.trim())) {
    return formatVccDate(dateInput, { style: 'short', includeTime: false, fallback });
  }

  const formatted = formatVccDate(dateInput, { includeTime: true, style: 'short', fallback });
  if (formatted === fallback) return fallback;

  // Append ' น.' ONLY if time was actually formatted (ends with HH:mm)
  if (/\b\d{2}:\d{2}$/.test(formatted)) {
    return `${formatted} น.`;
  }

  return formatted;
};

/**
 * Format due date for work orders and annual plan cells.
 * e.g. "31 มี.ค. 2569"
 *
 * @param {string|number|Date} dateInput
 * @param {string} [fallback='-']
 * @returns {string}
 */
export const formatVccDueDate = (dateInput, fallback = '-') => {
  return formatVccDate(dateInput, { style: 'short', includeTime: false, fallback });
};

/**
 * Format year into Thai Buddhist Era with CE indicator for clarification.
 * Handles both number and string inputs safely.
 * e.g. 2026 -> "พ.ศ. 2569 (2026)"
 * e.g. 2569 -> "พ.ศ. 2569 (2026)"
 *
 * @param {number|string} year
 * @param {string} [fallback='-']
 * @returns {string}
 */
export const formatVccYearLabel = (year, fallback = '-') => {
  if (year == null || year === '' || year === '-') return fallback;
  const be = toBuddhistYear(year);
  const ce = toCommonEraYear(year);
  if (!be || !ce) return fallback;
  return `พ.ศ. ${be} (${ce})`;
};

/**
 * Format a list of due dates (e.g. ['2026-03-31', '2026-09-30']) into Thai dates.
 *
 * @param {Array<string>} [dates=[]]
 * @param {number} [limit=0]
 * @returns {string}
 */
export const formatVccDueDatesList = (dates = [], limit = 0) => {
  if (!Array.isArray(dates) || dates.length === 0) return '-';
  const validDates = dates.filter((d) => Boolean(d) && d !== '-');
  if (validDates.length === 0) return '-';

  const slice = limit > 0 ? validDates.slice(0, limit) : validDates;
  const formatted = slice.map((d) => formatVccDueDate(d)).join(', ');

  if (limit > 0 && validDates.length > limit) {
    return `${formatted} (+${validDates.length - limit} เดือน)`;
  }
  return formatted;
};
