/**
 * Utility for generating internal DAR running numbers in the format: DAR-YYYY-XXX
 * (e.g. DAR-2026-001, DAR-2026-002)
 */

export const generateInternalDarNumber = (existingDars = [], targetYear = new Date().getFullYear()) => {
  const prefix = `DAR-${targetYear}-`;

  const currentYearNumbers = (existingDars || [])
    .filter(dar => {
      if (!dar) return false;
      if (typeof dar === 'string') {
        return dar.startsWith(prefix);
      }
      if (dar.isDraft || dar.status === 'DRAFT') {
        return false;
      }
      const num = dar.darNumber || dar.dar_no || dar.darNo || (dar.id && String(dar.id).startsWith(prefix) ? dar.id : null);
      return num && String(num).startsWith(prefix);
    })
    .map(dar => {
      const num = typeof dar === 'string' ? dar : (dar.darNumber || dar.dar_no || dar.darNo || dar.id);
      const parts = String(num).split('-');
      return parseInt(parts[2], 10) || 0;
    });

  const nextSequence = currentYearNumbers.length > 0 ? Math.max(...currentYearNumbers) + 1 : 1;
  const paddedSequence = String(nextSequence).padStart(3, '0');

  return `${prefix}${paddedSequence}`;
};
