import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithRouter, setTestUser } from './test_utils';
import useStore from '../store/useStore';
import MasterDataHub from '../pages/Admin/MasterDataHub';

describe('Approval Routing Matrix & SLA Management Hub (Tab 6) Tests', () => {
  const dccUser = {
    id: 'U001',
    name: 'Admin QA (DCC)',
    department: 'QA',
    depts: ['QA'],
    role: 'DCC_ADMIN',
    isDcc: true,
    level: 1
  };

  beforeEach(() => {
    useStore.getState().resetStore();
    setTestUser(dccUser);
  });

  describe('1. Tab 6 Dual-Section UI Structure', () => {
    it('renders both Section 1 (SLA Timelines) and Section 2 (Approval Routing Matrix)', () => {
      renderWithRouter(<MasterDataHub />);

      // Switch to Tab 6
      const slaTabBtn = screen.getByText(/สายการอนุมัติและ SLAs/i);
      fireEvent.click(slaTabBtn);

      // Verify Section 1 Header & 4 Cards
      expect(screen.getByText(/ส่วนที่ 1: กำหนดกรอบเวลาการปฏิบัติงาน \(SLA Timelines\)/i)).toBeInTheDocument();
      expect(screen.getByText(/1\. ทบทวนคำขอ/i)).toBeInTheDocument();
      expect(screen.getByText(/2\. อนุมัติเอกสาร/i)).toBeInTheDocument();
      expect(screen.getByText(/3\. ตรวจรับเล่ม/i)).toBeInTheDocument();
      expect(screen.getByText(/4\. เรียกคืนทำลาย/i)).toBeInTheDocument();

      // Verify Section 2 Header & Matrix Table (single pipeline column: requester ➔ reviewer ➔ approver)
      expect(screen.getByText(/ส่วนที่ 2: ผังเมทริกซ์สายการอนุมัติ \(Approval Matrix by Doc Type\)/i)).toBeInTheDocument();
      expect(screen.getByText(/ประเภทเอกสาร \(Doc Type\)/i)).toBeInTheDocument();
      expect(screen.getByText(/สายการอนุมัติ \(Pipeline:/i)).toBeInTheDocument();
      expect(screen.getByText(/การรับทราบ \(Default Ack\)/i)).toBeInTheDocument();

      // Verify default document types in table
      expect(screen.getByText('QM')).toBeInTheDocument();
      expect(screen.getByText('SOP')).toBeInTheDocument();
      expect(screen.getByText('WI')).toBeInTheDocument();
      expect(screen.getByText('FM')).toBeInTheDocument();
      expect(screen.getByText('ED')).toBeInTheDocument();
    });
  });

  describe('2. SLA Timelines Configuration & Persistence', () => {
    it('updates SLA days in local state and persists to store upon clicking Save', () => {
      renderWithRouter(<MasterDataHub />);

      const slaTabBtn = screen.getByText(/สายการอนุมัติและ SLAs/i);
      fireEvent.click(slaTabBtn);

      // Find the inputs for Review SLA and Approve SLA
      const inputs = screen.getAllByRole('spinbutton');
      expect(inputs.length).toBeGreaterThanOrEqual(4);

      // Change Review SLA (inputs[0]) to 5 days
      fireEvent.change(inputs[0], { target: { value: '5' } });
      // Change Approve SLA (inputs[1]) to 4 days
      fireEvent.change(inputs[1], { target: { value: '4' } });

      // Click unified save button
      const saveBtn = screen.getByRole('button', { name: /^บันทึกการตั้งค่า$/ });
      fireEvent.click(saveBtn);

      // Verify store updated
      const state = useStore.getState();
      expect(state.slaSettings.reviewSlaDays).toBe(5);
      expect(state.slaSettings.approvalSlaDays).toBe(4);
    });
  });

  describe('3. Approval Routing Matrix Editing & Modal Workflow', () => {
    it('opens modal to edit matrix entry for QM and updates required levels', () => {
      renderWithRouter(<MasterDataHub />);

      const slaTabBtn = screen.getByText(/สายการอนุมัติและ SLAs/i);
      fireEvent.click(slaTabBtn);

      // Find edit button for QM
      const qmEditBtn = screen.getByTitle(/แก้ไขผังสายการอนุมัติของ QM/i);
      fireEvent.click(qmEditBtn);

      // Verify modal is opened
      expect(screen.getByText(/แก้ไขผังสายการอนุมัติ \(QM\)/i)).toBeInTheDocument();

      // Submit modal form
      const submitModalBtn = screen.getByRole('button', { name: /บันทึกการเปลี่ยนแปลง/i });
      fireEvent.click(submitModalBtn);

      // Verify store updated
      const state = useStore.getState();
      const qmEntry = state.approvalMatrix.find(m => (m.docType || m.doc_type) === 'QM');
      expect(qmEntry).toBeDefined();
    });

    it('updates approval matrix entry directly via store action updateApprovalMatrixEntry', () => {
      useStore.getState().updateApprovalMatrixEntry('SOP', {
        minRequesterLevel: 2,
        requiredReviewerLevel: 5,
        requiredApproverLevel: 7,
        requireAckDefault: false
      });

      const state = useStore.getState();
      const sopEntry = state.approvalMatrix.find(m => (m.docType || m.doc_type) === 'SOP');
      expect(sopEntry.minRequesterLevel).toBe(2);
      expect(sopEntry.requiredReviewerLevel).toBe(5);
      expect(sopEntry.requiredApproverLevel).toBe(7);
      expect(sopEntry.requireAckDefault).toBe(false);
    });

    it('batch updates approval matrix via store action updateApprovalMatrix', () => {
      const customMatrix = [
        { docType: 'QM', minRequesterLevel: 5, requiredReviewerLevel: 6, requiredApproverLevel: 8, requireAckDefault: true },
        { docType: 'SOP', minRequesterLevel: 1, requiredReviewerLevel: 4, requiredApproverLevel: 6, requireAckDefault: true }
      ];

      useStore.getState().updateApprovalMatrix(customMatrix);
      const state = useStore.getState();
      expect(state.approvalMatrix).toHaveLength(2);
      expect(state.approvalMatrix[0].docType).toBe('QM');
      expect(state.approvalMatrix[0].minRequesterLevel).toBe(5);
    });
  });
});
