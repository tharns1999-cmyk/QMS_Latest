import { describe, it, expect } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { PeriodicReviewAuditCard, PeriodicReviewHistoryTab } from '../components/workflow/PeriodicReviewHistoryTab';
import { syncCompletedDarToMasterDocuments } from '../../../store/useStore';

describe('Periodic Review History Display, 1-Level Approval & Lifecycle Traceability', () => {
  describe('Criteria 1 & 2: Rich Review Audit Card UI & 1-Level Sign-off', () => {
    it('renders all review details, outcome badge, and 1-level approved sign-off', () => {
      const mockReviewItem = {
        id: 'REV-HIST-101',
        round: 1,
        reviewed_at: '2026-10-12T09:00:00.000Z',
        result: 'NO_CHANGE',
        reason: 'เนื้อหาและข้อกำหนดการปฏิบัติงานยังคงสอดคล้องกับมาตรฐานปัจจุบัน',
        findings: 'ไม่พบข้อบกพร่องหรือการเปลี่ยนแปลงในกระบวนการ',
        standard_clause: 'ISO 9001:2015 ข้อ 7.5.3',
        evidence_reference: 'Audit Report 2026-Q3',
        additional_comment: 'ให้ดำเนินการตาม SOP เดิมต่อไป',
        
        // Reviewer (Staff)
        reviewer_id: 'USR-01',
        reviewer_name: 'สมชาย ผู้ทบทวน',
        reviewer_role: 'QA Staff',
        
        // Approver (HOD - 1 Level)
        approver_id: 'HOD-01',
        approver_name: 'สมศักดิ์ หัวหน้าแผนก',
        approver_role: 'QA Manager',
        approved_at: '2026-10-12T10:30:00.000Z',
        approval_status: 'APPROVED',
        approval_remarks: 'อนุมัติการใช้งานต่อ'
      };

      render(<PeriodicReviewAuditCard item={mockReviewItem} index={0} />);

      // Verify Round and Outcome Badge
      expect(screen.getByText('รอบที่ 1')).toBeDefined();
      expect(screen.getByText('ยืนยันใช้งานต่อ')).toBeDefined();
      expect(screen.getByText('อนุมัติแล้ว')).toBeDefined();

      // Verify Content Box & 2-column Grid
      expect(screen.getByText('เหตุผลการประเมิน')).toBeDefined();
      expect(screen.getByText('เนื้อหาและข้อกำหนดการปฏิบัติงานยังคงสอดคล้องกับมาตรฐานปัจจุบัน')).toBeDefined();
      expect(screen.getByText('ไม่พบข้อบกพร่องหรือการเปลี่ยนแปลงในกระบวนการ')).toBeDefined();
      expect(screen.getByText('ISO 9001:2015 ข้อ 7.5.3')).toBeDefined();
      expect(screen.getByText('Audit Report 2026-Q3')).toBeDefined();
      expect(screen.getByText('ให้ดำเนินการตาม SOP เดิมต่อไป')).toBeDefined();

      // Verify 1-Level Sign-off Footer
      expect(screen.getByText(/สมชาย ผู้ทบทวน/)).toBeDefined();
      expect(screen.queryByText(/QA Staff/)).toBeNull(); // role codes are not shown, only the person
      expect(screen.getByText(/สมศักดิ์ หัวหน้าแผนก/)).toBeDefined();
      expect(screen.queryByText(/QA Manager/)).toBeNull();
    });

    it('renders pending approval badge and placeholder for HOD approval when PENDING_APPROVAL', () => {
      const mockPendingItem = {
        id: 'REV-HIST-102',
        round: 2,
        reviewed_at: '2026-10-12T11:00:00.000Z',
        result: 'REVISE',
        reason: 'พบว่าข้อกำหนดเครื่องจักรเปลี่ยนใหม่ ต้องปรับปรุง Rev',
        findings: 'เครื่องจักรโมเดลใหม่เริ่มใช้งาน',
        standard_clause: 'ISO 9001:2015 ข้อ 8.5.1',
        evidence_reference: 'MOC-2026-004',
        additional_comment: 'เปิดคำร้อง DAR เพื่อแก้ไข',
        
        reviewer_name: 'วิภาวรรณ เจ้าหน้าที่',
        reviewer_role: 'Production Engineer',
        
        approver_name: null,
        approver_role: null,
        approval_status: 'PENDING_APPROVAL'
      };

      render(<PeriodicReviewAuditCard item={mockPendingItem} index={1} />);

      // Check Revise Badge & Pending Status
      expect(screen.getByText('ต้องแก้ไขเอกสาร')).toBeDefined();
      expect(screen.getAllByText('รออนุมัติจาก HOD').length).toBeGreaterThan(0);
      expect(screen.getByText(/วิภาวรรณ เจ้าหน้าที่/)).toBeDefined();
    });

    it('renders empty state in PeriodicReviewHistoryTab when no reviews exist', () => {
      render(<PeriodicReviewHistoryTab reviews={[]} nextReviewDate="2027-10-12" />);
      expect(screen.getByText('ยังไม่มีประวัติการทบทวนตามรอบ')).toBeDefined();
    });
  });

  describe('Criteria 3: Lifecycle Traceability for Revise & Superseded Documents', () => {
    it('preserves periodic_reviews on superseded Rev.00 while resetting Rev.01 to empty review list', () => {
      const initialReviewHistory = [
        {
          id: 'REV-HIST-001',
          round: 1,
          result: 'REVISE',
          reason: 'Periodic review พบข้อกำหนดเปลี่ยนแปลง ต้องออก Rev.01',
          reviewer_name: 'ผู้ตรวจทบทวน',
          approver_name: 'ผู้อนุมัติ HOD',
          approval_status: 'APPROVED'
        }
      ];

      const currentDocs = [
        {
          id: 'DOC-SOP-001',
          docNo: 'SOP-QA-001',
          doc_code: 'SOP-QA-001',
          title: 'SOP การควบคุมคุณภาพ',
          rev: '00',
          revision: '00',
          status: 'EFFECTIVE',
          is_active: true,
          periodic_reviews: initialReviewHistory,
          review_cycle_years: 1,
          next_review_date: '2026-10-12'
        }
      ];

      const completedReviseDar = {
        id: 'DAR-2026-001',
        darNo: 'DAR-2026-001',
        type: 'REVISE',
        docNo: 'SOP-QA-001',
        docTitle: 'SOP การควบคุมคุณภาพ',
        currentRevision: '00',
        targetRevision: '01',
        effectiveDate: '2026-10-15',
        reason: 'ปรับปรุงตามผลการทบทวนตามรอบ'
      };

      const updatedDocs = syncCompletedDarToMasterDocuments(completedReviseDar, currentDocs);

      // Verify that old document (Rev.00) is preserved as SUPERSEDED with its periodic_reviews intact
      const supersededDoc = updatedDocs.find(d => d.status === 'SUPERSEDED');
      expect(supersededDoc).toBeDefined();
      expect(supersededDoc.is_superseded).toBe(true);
      expect(supersededDoc.is_active).toBe(false);
      expect(supersededDoc.superseded_by).toContain('Rev.01');
      expect(supersededDoc.periodic_reviews).toBeDefined();
      expect(supersededDoc.periodic_reviews.length).toBe(1);
      expect(supersededDoc.periodic_reviews[0].reason).toContain('Periodic review พบข้อกำหนดเปลี่ยนแปลง');

      // Verify that newly created document (Rev.01) is EFFECTIVE with reset periodic_reviews
      const newRevDoc = updatedDocs.find(d => d.status === 'EFFECTIVE' && d.rev === '01');
      expect(newRevDoc).toBeDefined();
      expect(newRevDoc.origin_dar_id).toBe('DAR-2026-001');
      expect(newRevDoc.periodic_reviews).toEqual([]);
      expect(newRevDoc.next_review_date).toBeDefined();
      // Next review date should be +1 year from effectiveDate 2026-10-15 -> 2027-10-15
      expect(newRevDoc.next_review_date).toBe('2027-10-15');
    });
  });

  describe('Criteria 4: Lifecycle Traceability for Obsolete Documents', () => {
    it('marks document as OBSOLETE and preserves periodic_reviews containing obsolete decision and justification', () => {
      const initialReviewHistory = [
        {
          id: 'REV-HIST-OBS',
          round: 1,
          result: 'OBSOLETE',
          reason: 'ยกเลิกเนื่องจากยกเลิกสายการผลิต ไม่มีความจำเป็นต้องใช้คู่มือฉบับนี้อีก',
          reviewer_name: 'หัวหน้างานผลิต',
          approver_name: 'ผู้จัดการโรงงาน',
          approval_status: 'APPROVED'
        }
      ];

      const currentDocs = [
        {
          id: 'DOC-WI-999',
          docNo: 'WI-PD-999',
          doc_code: 'WI-PD-999',
          title: 'WI การใช้งานเครื่องจักรเก่า',
          rev: '02',
          revision: '02',
          status: 'EFFECTIVE',
          is_active: true,
          periodic_reviews: initialReviewHistory
        }
      ];

      const completedObsoleteDar = {
        id: 'DAR-OBS-001',
        darNo: 'DAR-OBS-001',
        type: 'OBSOLETE',
        docNo: 'WI-PD-999',
        reason: 'ขอยกเลิกตามผลการทบทวนรอบประจำปี'
      };

      const updatedDocs = syncCompletedDarToMasterDocuments(completedObsoleteDar, currentDocs);

      const obsoleteDoc = updatedDocs.find(d => d.docNo === 'WI-PD-999');
      expect(obsoleteDoc).toBeDefined();
      expect(obsoleteDoc.status).toBe('OBSOLETE');
      expect(obsoleteDoc.is_active).toBe(false);
      expect(obsoleteDoc.is_obsolete).toBe(true);
      expect(obsoleteDoc.obsoleteReason).toBe('ขอยกเลิกตามผลการทบทวนรอบประจำปี');
      // Must strictly preserve the periodic_reviews audit trail!
      expect(obsoleteDoc.periodic_reviews).toBeDefined();
      expect(obsoleteDoc.periodic_reviews.length).toBe(1);
      expect(obsoleteDoc.periodic_reviews[0].result).toBe('OBSOLETE');
      expect(obsoleteDoc.periodic_reviews[0].reason).toContain('ยกเลิกเนื่องจากยกเลิกสายการผลิต');
    });
  });
});
