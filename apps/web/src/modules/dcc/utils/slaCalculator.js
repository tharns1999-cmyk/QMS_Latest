/**
 * Dynamic SLA & Task Due Date Calculator (ISO 9001 Compliance)
 * Single Source of Truth for task deadlines, urgent fast-track capping,
 * and grace period / cancellation dates.
 */

/**
 * Format a Date object to YYYY-MM-DD
 * @param {Date} d 
 * @returns {string}
 */
export const formatDateToYMD = (d) => {
  if (!d || isNaN(d.getTime())) return '';
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * Parse date string or Date object into a local Date with time stripped (00:00:00)
 * Prevents UTC timezone drift when dealing with YYYY-MM-DD strings.
 * @param {string|Date} dateInput 
 * @returns {Date|null}
 */
export const parseToLocalMidnight = (dateInput) => {
  if (!dateInput) return null;
  if (dateInput instanceof Date) {
    const d = new Date(dateInput.getTime());
    d.setHours(0, 0, 0, 0);
    return d;
  }
  if (typeof dateInput === 'string') {
    const trimmed = dateInput.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      const [y, m, d] = trimmed.split('-').map(Number);
      return new Date(y, m - 1, d, 0, 0, 0, 0);
    }
    const d = new Date(trimmed);
    if (!isNaN(d.getTime())) {
      d.setHours(0, 0, 0, 0);
      return d;
    }
  }
  return null;
};

/**
 * Calculate dynamic task due date capped by document effective date.
 * Enforces Fast-Track SLA when document effectiveDate <= standardDueDate.
 * 
 * @param {Object} params
 * @param {string|Date} [params.submissionDate] - Date of submission or step initiation
 * @param {string|Date} [params.effectiveDate] - Target document effective date
 * @param {number} [params.stepSlaDays=3] - Standard SLA days for this step
 * @param {number} [params.mockDateOffset=0] - Simulated system date offset (days)
 * @returns {{
 *   dueDate: string,
 *   cancelDate: string,
 *   isUrgent: boolean,
 *   isFastTrack: boolean,
 *   slaType: 'FAST_TRACK' | 'STANDARD',
 *   standardDueDate: string,
 *   effectiveDate: string | null
 * }}
 */
export const calculateTaskDueDate = ({
  submissionDate,
  effectiveDate,
  stepSlaDays = 3,
  mockDateOffset = 0
} = {}) => {
  const today = new Date();
  today.setDate(today.getDate() + (Number(mockDateOffset) || 0));
  today.setHours(0, 0, 0, 0);

  const subDate = parseToLocalMidnight(submissionDate) || new Date(today);
  const slaDaysNum = Number(stepSlaDays) > 0 ? Number(stepSlaDays) : 3;

  const standardDueDate = new Date(subDate);
  standardDueDate.setDate(standardDueDate.getDate() + slaDaysNum);
  standardDueDate.setHours(0, 0, 0, 0);

  const targetEffective = parseToLocalMidnight(effectiveDate);

  let finalDueDate = standardDueDate;
  let isUrgent = false;
  let slaType = 'STANDARD';
  let cancelDate;

  if (targetEffective && targetEffective.getTime() <= standardDueDate.getTime()) {
    isUrgent = true;
    slaType = 'FAST_TRACK';
    // If effective date is today or past, must finish within today
    finalDueDate = targetEffective.getTime() < today.getTime() ? today : targetEffective;
    // cancelDate cannot exceed effective date; if effective date is today/past, cancelDate matches finalDueDate
    cancelDate = new Date(finalDueDate);
    if (targetEffective.getTime() > finalDueDate.getTime()) {
      const candidateCancel = new Date(finalDueDate);
      candidateCancel.setDate(candidateCancel.getDate() + 1);
      cancelDate = candidateCancel.getTime() <= targetEffective.getTime() ? candidateCancel : targetEffective;
    }
  } else {
    isUrgent = false;
    slaType = 'STANDARD';
    finalDueDate = standardDueDate;
    cancelDate = new Date(finalDueDate);
    cancelDate.setDate(cancelDate.getDate() + 1);
  }

  return {
    dueDate: formatDateToYMD(finalDueDate),
    cancelDate: formatDateToYMD(cancelDate),
    isUrgent,
    isFastTrack: isUrgent,
    slaType,
    standardDueDate: formatDateToYMD(standardDueDate),
    effectiveDate: targetEffective ? formatDateToYMD(targetEffective) : null
  };
};
