/**
 * dateFormatter.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Unified QMS Date & Buddhist Era (พ.ศ.) Formatter
 * Compliant with ISO 9001:2015 Document Control Standards & Thai Localization
 *
 * Single Source of Truth for all date display and stamping across the QMS portal.
 * Centralizes the Buddhist Era formula (+ 543) so that individual components
 * and stamper utilities do not write ad-hoc date transformations.
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
 * Format timestamp / date input to standardized QMS Date string.
 *
 * @param {Date|string|number} timestamp
 * @param {Object} [options]
 * @param {boolean} [options.includeTime=false] - Whether to append HH:mm
 * @param {string} [options.locale='th-TH']     - 'th-TH' (Buddhist Era +543) or 'en-US' (CE)
 * @param {'slash'|'short'|'full'|'iso'} [options.style='slash'] - Display format:
 *   - 'slash': DD/MM/YYYY (e.g. 26/09/2569)
 *   - 'short': D MMM YYYY (e.g. 26 ก.ย. 2569)
 *   - 'full': D MMMM YYYY (e.g. 26 กันยายน 2569)
 *   - 'iso': YYYY-MM-DD
 * @returns {string}
 */
export const formatQmsDate = (timestamp, options = {}) => {
  if (!timestamp || timestamp === '-') return '-';
  try {
    const d = timestamp instanceof Date ? timestamp : new Date(timestamp);
    if (isNaN(d.getTime())) return String(timestamp);

    const {
      includeTime = false,
      locale = 'th-TH',
      style = 'slash'
    } = options;

    const isThai = locale === 'th-TH' || (typeof locale === 'string' && locale.startsWith('th'));
    const day = d.getDate();
    const dayPad = String(day).padStart(2, '0');
    const month = d.getMonth();
    const monthPad = String(month + 1).padStart(2, '0');
    const rawYear = d.getFullYear();
    const year = isThai ? rawYear + 543 : rawYear;

    let datePart = '';
    if (style === 'short') {
      datePart = `${day} ${THAI_MONTHS_SHORT[month]} ${year}`;
    } else if (style === 'full') {
      datePart = `${day} ${THAI_MONTHS_FULL[month]} ${year}`;
    } else if (style === 'iso') {
      datePart = `${rawYear}-${monthPad}-${dayPad}`;
    } else {
      // Default 'slash' -> DD/MM/YYYY
      datePart = `${dayPad}/${monthPad}/${year}`;
    }

    if (!includeTime) {
      return datePart;
    }

    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');

    // If both hours and minutes are 00 and style was slash, omit time
    if (hours === '00' && minutes === '00' && style === 'slash') {
      return datePart;
    }

    return `${datePart} ${hours}:${minutes}`;
  } catch {
    return String(timestamp);
  }
};

/**
 * Format timestamp specifically for digital signatures and audit stamping.
 * Returns DD/MM/BBBB HH:mm or DD/MM/BBBB.
 *
 * @param {Date|string|number} timestamp
 * @returns {string}
 */
export const formatSignOffDate = (timestamp) => {
  return formatQmsDate(timestamp, { includeTime: true, locale: 'th-TH', style: 'slash' });
};

/**
 * Format timestamp to DD/MM/BBBB without time.
 *
 * @param {Date|string|number} timestamp
 * @returns {string}
 */
export const formatSignatoryDate = (timestamp) => {
  if (!timestamp || timestamp === '-') return '';
  return formatQmsDate(timestamp, { includeTime: false, locale: 'th-TH', style: 'slash' });
};

/**
 * Format Thai date with abbreviated month name (e.g. 26 ก.ย. 2569)
 *
 * @param {Date|string|number} timestamp
 * @param {boolean} [includeTime=false]
 * @returns {string}
 */
export const formatThaiReadableDate = (timestamp, includeTime = false) => {
  return formatQmsDate(timestamp, { includeTime, locale: 'th-TH', style: 'short' });
};

/**
 * Standardize display date with international CE year (e.g. "9 ต.ค. 2028" or "2028-10-09")
 * Avoids confusion between Buddhist Era (2571) and CE (2028).
 *
 * @param {Date|string|number} timestamp
 * @param {boolean} [isoFormat=false]
 * @returns {string}
 */
export const formatQmsDisplayDate = (timestamp, isoFormat = false) => {
  if (!timestamp || timestamp === '-') return '-';
  try {
    const d = timestamp instanceof Date ? timestamp : new Date(timestamp);
    if (isNaN(d.getTime())) return String(timestamp);
    const day = d.getDate();
    const month = d.getMonth();
    const year = d.getFullYear();
    if (isoFormat) {
      const monthPad = String(month + 1).padStart(2, '0');
      const dayPad = String(day).padStart(2, '0');
      return `${year}-${monthPad}-${dayPad}`;
    }
    return `${day} ${THAI_MONTHS_SHORT[month]} ${year}`;
  } catch {
    return String(timestamp);
  }
};

/**
 * Format date/time to Thailand local time (Asia/Bangkok - GMT+7) in YYYY-MM-DD HH:mm format
 * @param {Date|string|number} [dateInput=new Date()]
 * @returns {string} e.g. "2026-08-24 10:58"
 */
export const getBangkokFormattedTimestamp = (dateInput = new Date()) => {
  if (!dateInput) return '';
  const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (isNaN(date.getTime())) return String(dateInput);

  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });

  const parts = formatter.formatToParts(date);
  const getPart = (type) => parts.find(p => p.type === type)?.value || '';

  const year = getPart('year');
  const month = getPart('month');
  const day = getPart('day');
  const hour = getPart('hour');
  const minute = getPart('minute');

  return `${year}-${month}-${day} ${hour}:${minute}`;
};

export default formatQmsDate;
