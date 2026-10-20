/**
 * periodic_review_lifecycle.test.jsx
 *
 * ISO 9001 Clause 7.5.3 � Periodic Document Review Lifecycle Engine Tests
 * ------------------------------------------------------------------------
 * Covers:
 *   1. calculateNextReviewDate  � pure date arithmetic (+1 year)
 *   2. getReviewStatus          � urgency bucket classification
 *   3. recordPeriodicReview     � CONFIRM_CONTINUE log + date roll
 *   4. recordPeriodicReview     � REVISION_REQUIRED log stamp (no roll)
 *   5. recordPeriodicReview     � revision number invariance
 *   6. reviewLog accumulation   � multiple reviews on same schedule
 *   7. internal vs external doc separation
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import useStore from '../../../store/useStore';
import { calculateNextReviewDate, getReviewStatus } from '../utils/documentUtils';

// -- Pure Utility: calculateNextReviewDate -------------------------------------

describe('calculateNextReviewDate()', () => {
  it('adds exactly 1 year to a YYYY-MM-DD string', () => {
    expect(calculateNextReviewDate('2026-09-20')).toBe('2027-09-20');
  });

  it('handles leap-year edge: 2024-02-29 -> 2025-02-28', () => {
    expect(calculateNextReviewDate('2024-02-29')).toBe('2025-02-28');
  });

  it('returns empty string for falsy input', () => {
    expect(calculateNextReviewDate('')).toBe('');
    expect(calculateNextReviewDate(null)).toBe('');
    expect(calculateNextReviewDate(undefined)).toBe('');
  });

  it('returns empty string for invalid date string', () => {
    expect(calculateNextReviewDate('not-a-date')).toBe('');
  });

  it('handles ISO timestamp strings (uses only date part)', () => {
    expect(calculateNextReviewDate('2025-03-15T10:00:00Z')).toBe('2026-03-15');
  });
});

// -- Pure Utility: getReviewStatus ---------------------------------------------

describe('getReviewStatus()', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-09-24T00:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns UP_TO_DATE when due date is >30 days away', () => {
    expect(getReviewStatus('2027-09-24')).toBe('UP_TO_DATE');
  });

  it('returns UPCOMING when due date is <=30 days away', () => {
    expect(getReviewStatus('2026-10-10')).toBe('UPCOMING');
  });

  it('returns UPCOMING when due date is today (0 days)', () => {
    expect(getReviewStatus('2026-09-24')).toBe('UPCOMING');
  });

  it('returns OVERDUE when due date is in the past', () => {
    expect(getReviewStatus('2026-09-23')).toBe('OVERDUE');
    expect(getReviewStatus('2025-01-01')).toBe('OVERDUE');
  });

  it('returns UP_TO_DATE for falsy input', () => {
    expect(getReviewStatus('')).toBe('UP_TO_DATE');
    expect(getReviewStatus(null)).toBe('UP_TO_DATE');
    expect(getReviewStatus(undefined)).toBe('UP_TO_DATE');
  });
});

// -- Store Action: recordPeriodicReview ---------------------------------------

describe('recordPeriodicReview store action', () => {
  const SCHEDULE_ID = 'SCH-TEST-001';
  const NEXT_REVIEW = '2026-09-24';

  const mockSchedule = {
    id: SCHEDULE_ID,
    documentId: 'DOC-TEST-001',
    documentCategory: 'INTERNAL',
    documentNumber: 'SOP-QC-01',
    frequencyMonths: 12,
    originalReviewAnchorDate: '2025-09-24',
    nextReviewDate: NEXT_REVIEW,
    currentScheduledReviewDate: NEXT_REVIEW,
    status: 'DUE',
    isActive: true,
    reviewLogs: [],
  };

  beforeEach(() => {
    useStore.setState({
      periodicReviewSchedules: [mockSchedule],
      periodicReviewRecords: [],
      actionLog: [],
      currentUser: { id: 'U001', name: 'Test User' },
    });
  });

  it('CONFIRM_CONTINUE: stamps reviewLog with newNextReviewDate', () => {
    useStore.getState().recordPeriodicReview({
      scheduleId: SCHEDULE_ID,
      outcome: 'CONFIRM_CONTINUE',
      comment: '??????????????? ???????????????????',
      reviewer: '????? ?????',
      reviewDate: '2026-09-24',
    });

    const sch = useStore.getState().periodicReviewSchedules.find(s => s.id === SCHEDULE_ID);
    expect(sch.reviewLogs).toHaveLength(1);
    const log = sch.reviewLogs[0];
    expect(log.outcome).toBe('CONFIRM_CONTINUE');
    expect(log.reviewer).toBe('????? ?????');
    expect(log.comment).toBe('??????????????? ???????????????????');
    expect(log.reviewDate).toBe('2026-09-24');
    expect(log.newNextReviewDate).toBe('2027-09-24');
    expect(log.previousNextReviewDate).toBe(NEXT_REVIEW);
  });

  it('CONFIRM_CONTINUE: advances nextReviewDate by exactly 1 year', () => {
    useStore.getState().recordPeriodicReview({
      scheduleId: SCHEDULE_ID,
      outcome: 'CONFIRM_CONTINUE',
      reviewDate: '2026-09-24',
    });

    const sch = useStore.getState().periodicReviewSchedules.find(s => s.id === SCHEDULE_ID);
    expect(sch.nextReviewDate).toBe('2027-09-24');
    expect(sch.currentScheduledReviewDate).toBe('2027-09-24');
    expect(sch.lastReviewedDate).toBe('2026-09-24');
    expect(sch.status).toBe('UPCOMING');
  });

  it('CONFIRM_CONTINUE: adds to periodicReviewRecords', () => {
    useStore.getState().recordPeriodicReview({
      scheduleId: SCHEDULE_ID,
      outcome: 'CONFIRM_CONTINUE',
      comment: 'Test',
      reviewDate: '2026-09-24',
    });

    const records = useStore.getState().periodicReviewRecords;
    expect(records).toHaveLength(1);
    expect(records[0].outcome).toBe('CONFIRM_CONTINUE');
    expect(records[0].scheduleId).toBe(SCHEDULE_ID);
  });

  it('CONFIRM_CONTINUE: appends PERIODIC_REVIEW_CONFIRMED to actionLog', () => {
    useStore.getState().recordPeriodicReview({
      scheduleId: SCHEDULE_ID,
      outcome: 'CONFIRM_CONTINUE',
      reviewDate: '2026-09-24',
    });

    const actionLog = useStore.getState().actionLog;
    expect(actionLog[0].actionType).toBe('PERIODIC_REVIEW_CONFIRMED');
  });

  it('REVISION_REQUIRED: stamps reviewLog entry without rolling date', () => {
    useStore.getState().recordPeriodicReview({
      scheduleId: SCHEDULE_ID,
      outcome: 'REVISION_REQUIRED',
      comment: 'Found issue',
      reviewDate: '2026-09-24',
    });

    const sch = useStore.getState().periodicReviewSchedules.find(s => s.id === SCHEDULE_ID);
    expect(sch.reviewLogs).toHaveLength(1);
    expect(sch.reviewLogs[0].outcome).toBe('REVISION_REQUIRED');
    // Date NOT rolled
    expect(sch.nextReviewDate).toBe(NEXT_REVIEW);
  });

  it('document revision number is NOT modified by CONFIRM_CONTINUE', () => {
    const docsBefore = useStore.getState().documents;
    useStore.getState().recordPeriodicReview({
      scheduleId: SCHEDULE_ID,
      outcome: 'CONFIRM_CONTINUE',
      reviewDate: '2026-09-24',
    });
    expect(useStore.getState().documents).toStrictEqual(docsBefore);
  });

  it('accumulates multiple reviewLog entries on the same schedule', () => {
    useStore.getState().recordPeriodicReview({
      scheduleId: SCHEDULE_ID,
      outcome: 'CONFIRM_CONTINUE',
      comment: 'Round 1',
      reviewDate: '2026-09-24',
    });
    useStore.getState().recordPeriodicReview({
      scheduleId: SCHEDULE_ID,
      outcome: 'CONFIRM_CONTINUE',
      comment: 'Round 2',
      reviewDate: '2027-09-24',
    });

    const sch = useStore.getState().periodicReviewSchedules.find(s => s.id === SCHEDULE_ID);
    expect(sch.reviewLogs).toHaveLength(2);
    expect(sch.reviewLogs[0].comment).toBe('Round 1');
    expect(sch.reviewLogs[1].comment).toBe('Round 2');
    expect(sch.nextReviewDate).toBe('2028-09-24');
  });

  it('does NOT affect schedules of other documents', () => {
    const otherSchedule = {
      id: 'SCH-EXT-002',
      externalDocumentId: 'EXT-001',
      documentCategory: 'EXTERNAL',
      nextReviewDate: '2027-01-01',
      reviewLogs: [],
      isActive: true,
    };

    useStore.setState({
      periodicReviewSchedules: [
        useStore.getState().periodicReviewSchedules[0],
        otherSchedule,
      ],
    });

    useStore.getState().recordPeriodicReview({
      scheduleId: SCHEDULE_ID,
      outcome: 'CONFIRM_CONTINUE',
      reviewDate: '2026-09-24',
    });

    const other = useStore.getState().periodicReviewSchedules.find(s => s.id === 'SCH-EXT-002');
    expect(other.reviewLogs).toHaveLength(0);
    expect(other.nextReviewDate).toBe('2027-01-01');
  });

  it('silently no-ops for unknown scheduleId', () => {
    const before = useStore.getState().periodicReviewSchedules;
    useStore.getState().recordPeriodicReview({
      scheduleId: 'SCH-NONEXISTENT',
      outcome: 'CONFIRM_CONTINUE',
      reviewDate: '2026-09-24',
    });
    expect(useStore.getState().periodicReviewSchedules).toStrictEqual(before);
  });
});
