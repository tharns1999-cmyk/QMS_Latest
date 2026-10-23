/**
 * DAR running numbers are DAR-YY-XXX (e.g. DAR-26-001): two-digit year, then a 3-digit number that restarts each year.
 */

const yy = (year) => String(year).slice(-2);

/** Show any stored DAR reference (3, DAR-4, DAR-2026-003, DAR-26-003) as DAR-YY-XXX. */
export const formatDarNumber = (idOrNum, year = new Date().getFullYear()) => {
  if (idOrNum === undefined || idOrNum === null || idOrNum === '') return '-';
  const raw = String(idOrNum).trim();
  if (/^DAR-\d{2}-\d{3,}$/.test(raw)) return raw;
  const longYear = raw.match(/^DAR-(\d{4})-(\d+)$/i);
  if (longYear) return `DAR-${yy(longYear[1])}-${longYear[2].padStart(3, '0')}`;
  const cleanNum = raw.replace(/^DAR-?/i, '');
  if (!/^\d+$/.test(cleanNum)) return raw;
  return `DAR-${yy(year)}-${cleanNum.padStart(3, '0')}`;
};

export const generateInternalDarNumber = (existingDars = [], targetYear = new Date().getFullYear()) => {
  const prefix = `DAR-${yy(targetYear)}-`;
  // Numbers stored before the YY format (DAR-2026-001) still count toward the same year.
  const sequenceOf = (value) => {
    const text = formatDarNumber(value, targetYear);
    return text.startsWith(prefix) ? parseInt(text.slice(prefix.length), 10) || 0 : null;
  };

  const used = (existingDars || [])
    .map((dar) => {
      if (!dar) return null;
      if (typeof dar === 'string') return sequenceOf(dar);
      if (dar.isDraft || dar.status === 'DRAFT') return null;
      const num = dar.darNumber || dar.dar_no || dar.darNo || dar.id;
      return num && /^DAR-/i.test(String(num)) ? sequenceOf(num) : null;
    })
    .filter((n) => n !== null);

  return `${prefix}${String((used.length ? Math.max(...used) : 0) + 1).padStart(3, '0')}`;
};
