import { describe, it, expect } from 'vitest';
import { 
  resolveReviewOwnerDepartmentId,
  canViewPeriodicReview,
  canPerformPeriodicReview,
  getUserDepartmentMembership,
  normalizePeriodicReviewRecord,
  getPeriodicReviewForUser
} from './PeriodicReviewAccessService';

describe('PeriodicReviewAccessService', () => {
  const dccAdmin = { id: 'U1', role: 'DCC_ADMIN', isDcc: true, depts: ['DCC'] };
  const dccMonitor = { id: 'U2', role: 'USER', isDcc: true, depts: ['DCC'] };
  
  // Legacy Mock Fallback Users (uses user.depts and user.level)
  const hrManager = { id: 'U3', role: 'USER', isDcc: false, depts: ['HR'], level: 4 };
  const itStaff = { id: 'U5', role: 'USER', isDcc: false, depts: ['IT'], level: 2 };
  
  // New Multi-Department Membership Users
  const multiDeptManager = {
    id: 'U7',
    role: 'USER',
    isDcc: false,
    departmentMemberships: [
      { departmentId: 'PD', positionLevel: 4, isActive: true },
      { departmentId: 'QA', positionLevel: 2, isActive: true },
      { departmentId: 'ENG', positionLevel: 4, isActive: false }
    ]
  };

  const distributionStaff = { id: 'U8', role: 'USER', isDcc: false, depts: ['SALE'], level: 2 };

  const reviewRecord = {
    id: 'PR-1',
    ownerDepartmentId: 'QA',
    ownerUserId: 'U6',
    status: 'IN_PROGRESS',
    documentNumber: 'DOC-001',
    documentName: 'QA Manual'
  };
  
  const distributionReviewRecord = {
    id: 'PR-2',
    ownerDepartmentId: 'QA',
    ownerUserId: 'U6',
    status: 'IN_PROGRESS'
  };
  const distributionDoc = {
    department: 'QA', // Legacy fallback or canonical
    distributionList: ['SALE'] // user is in SALE
  };

  it('resolves canonical owner department correctly', () => {
    expect(resolveReviewOwnerDepartmentId(reviewRecord, null, null)).toBe('QA');
  });

  describe('getUserDepartmentMembership', () => {
    it('compatibility fallback works only for legacy mock users', () => {
      const membership = getUserDepartmentMembership(hrManager, 'HR');
      expect(membership.positionLevel).toBe(4);
    });

    it('returns specific position level from departmentMemberships array', () => {
      // High level in PD
      expect(getUserDepartmentMembership(multiDeptManager, 'PD').positionLevel).toBe(4);
      // Low level in QA
      expect(getUserDepartmentMembership(multiDeptManager, 'QA').positionLevel).toBe(2);
    });

    it('inactive membership grants no authority', () => {
      expect(getUserDepartmentMembership(multiDeptManager, 'ENG')).toBeNull();
    });
  });

  describe('canViewPeriodicReview', () => {
    it('allows DCC admin and monitors to view any review', () => {
      expect(canViewPeriodicReview(dccAdmin, reviewRecord, null)).toBe(true);
      expect(canViewPeriodicReview(dccMonitor, reviewRecord, null)).toBe(true);
    });

    it('blocks unrelated department members from viewing', () => {
      expect(canViewPeriodicReview(itStaff, reviewRecord, null)).toBe(false);
    });

    it('distribution department does not grant access', () => {
      expect(canViewPeriodicReview(distributionStaff, distributionReviewRecord, distributionDoc)).toBe(false);
    });
  });

  describe('canPerformPeriodicReview', () => {
    it('high level in PD does not grant authority in QA', () => {
      // U7 is Level 4 in PD, but Level 2 in QA. The record is owned by QA.
      expect(canPerformPeriodicReview(multiDeptManager, reviewRecord, null)).toBe(false);
    });

    it('active QA membership with insufficient level cannot submit', () => {
      expect(canPerformPeriodicReview(multiDeptManager, reviewRecord, null)).toBe(false);
    });

    it('allows department members with level >= 4 (Manager/Supervisor) to perform review (fallback)', () => {
      const hrRecord = { ...reviewRecord, ownerDepartmentId: 'HR' };
      expect(canPerformPeriodicReview(hrManager, hrRecord, null)).toBe(true);
    });
  });
  
  describe('Service-Level Detail Security (Metadata Leakage)', () => {
    it('blocks unauthorized access and does not leak metadata', () => {
      const scheduleList = [reviewRecord];
      const result = getPeriodicReviewForUser('PR-1', itStaff, scheduleList, []);
      
      expect(result.status).toBe('ACCESS_DENIED');
      expect(result.data).toBeUndefined(); // No document data leaked
      expect(result.document).toBeUndefined();
      expect(result.message).toContain('ไม่มีสิทธิ์เข้าถึงข้อมูล');
    });
    
    it('returns normalized data for authorized users', () => {
      const scheduleList = [reviewRecord];
      const result = getPeriodicReviewForUser('PR-1', multiDeptManager, scheduleList, []);
      
      expect(result.status).toBe('SUCCESS');
      expect(result.data.documentNumber).toBe('DOC-001');
    });
  });
  
  describe('normalizePeriodicReviewRecord DUE dates', () => {
    const today = new Date('2026-07-14T12:00:00Z');
    
    const getNormalizedStatus = (offsetDays) => {
      const nextDate = new Date(today);
      nextDate.setDate(today.getDate() + offsetDays);
      const record = { nextReviewDate: nextDate.toISOString() };
      return normalizePeriodicReviewRecord(record, today).status;
    };

    it('31 days remaining = UPCOMING', () => {
      expect(getNormalizedStatus(31)).toBe('UPCOMING');
    });
    
    it('30 days remaining = DUE_SOON', () => {
      expect(getNormalizedStatus(30)).toBe('DUE_SOON');
    });
    
    it('1 day remaining = DUE_SOON', () => {
      expect(getNormalizedStatus(1)).toBe('DUE_SOON');
    });
    
    it('due today = DUE', () => {
      expect(getNormalizedStatus(0)).toBe('DUE');
    });
    
    it('past due = OVERDUE', () => {
      expect(getNormalizedStatus(-1)).toBe('OVERDUE');
      expect(getNormalizedStatus(-5)).toBe('OVERDUE');
    });
  });
});


