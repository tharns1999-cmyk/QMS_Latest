/**
 * vccDateUtils.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Centralized Thai Date & Buddhist Era (พ.ศ.) Utilities for VCC (Phase 3 UX Round D)
 * 
 * Compliant with Thai Industrial Localization & Asia/Bangkok Standard Time (GMT+7)
 * - Decouples display formatting from database/API storage (which stays ISO YYYY-MM-DD / ISO-8601).
 * - Avoids UTC timezone day-shift bugs on date-only strings ("YYYY-MM-DD").
 * - Formats all timestamps in strict Asia/Bangkok timezone.
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

  if (!dateInput || dateInput === '-' || dateInput === 'null' || dateInput === 'undefined') {
    return fallback;
  }

  // 1. Date-only pattern: YYYY-MM-DD (e.g. "2026-03-31")
  // Direct parsing avoids UTC midnight offset bugs in non-Bangkok environments
  if (typeof dateInput === 'string') {
    const trimmed = dateInput.trim();
    const dateOnlyMatch = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (dateOnlyMatch) {
      const year = parseInt(dateOnlyMatch[1], 10);
      const month = parseInt(dateOnlyMatch[2], 10);
      const day = parseInt(dateOnlyMatch[3], 10);
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
    const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
    if (isNaN(d.getTime())) {
      return String(dateInput);
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

    const parts = formatter.formatToParts(d);
    const getPart = (type) => parts.find((p) => p.type === type)?.value || '';

    const year = parseInt(getPart('year'), 10);
    const month = parseInt(getPart('month'), 10);
    const day = parseInt(getPart('day'), 10);
    const hour = getPart('hour');
    const minute = getPart('minute');
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
    return String(dateInput);
  }
};

/**
 * Format timestamp into Asia/Bangkok date and time (e.g. "28 ต.ค. 2569 09:00 น.")
 */
export const formatVccDateTime = (dateInput, fallback = '-') => {
  if (!dateInput || dateInput === '-') return fallback;
  const formatted = formatVccDate(dateInput, { includeTime: true, style: 'short', fallback });
  if (formatted === fallback) return fallback;
  return `${formatted} น.`;
};

/**
 * Format due date for work orders and annual plan cells.
 * e.g. "31 มี.ค. 2569"
 */
export const formatVccDueDate = (dateInput, fallback = '-') => {
  return formatVccDate(dateInput, { style: 'short', includeTime: false, fallback });
};

/**
 * Format year into Thai Buddhist Era with CE indicator for clarification.
 * e.g. 2026 -> "2569 (2026)"
 */
export const formatVccYearLabel = (year) => {
  const y = Number(year);
  if (!y || isNaN(y)) return String(year || '-');
  return `พ.ศ. ${y + 543} (${y})`;
};

/**
 * Format a list of due dates (e.g. ['2026-03-31', '2026-09-30']) into Thai dates.
 */
export const formatVccDueDatesList = (dates = [], limit = 0) => {
  if (!Array.isArray(dates) || dates.length === 0) return '-';
  const slice = limit > 0 ? dates.slice(0, limit) : dates;
  const formatted = slice.map((d) => formatVccDueDate(d)).join(', ');
  if (limit > 0 && dates.length > limit) {
    return `${formatted} (+${dates.length - limit} เดือน)`;
  }
  return formatted;
};
