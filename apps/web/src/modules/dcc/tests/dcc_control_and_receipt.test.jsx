import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Routes, Route } from 'react-router-dom';
import { renderWithRouter, setTestUser } from '../../../test/test_utils';
import useStore from '../../../store/useStore';
import ControlledCopyRegister from '../pages/ControlledCopy/ControlledCopyRegister';
import TaskConfirmHardcopyReceipt from '../pages/Tasks/TaskConfirmHardcopyReceipt';
import { UniversalWatermarkService, WATERMARK_TYPES } from '../services/UniversalWatermarkService';

describe('DCC Control Portal & E-Signature Hardcopy Receipt Tests', () => {
  const dccUser = {
    id: 'u5',
    name: 'Admin QA (DCC)',
    department: 'QA',
    role: 'DCC_ADMIN',
    isDcc: true,
    level: 5
  };

  const pdUser = {
    id: 'u1',
    name: 'สมชาย สายผลิต (PD User)',
    department: 'PD',
    role: 'USER',
    isDcc: false,
    level: 3
  };

  beforeEach(() => {
    useStore.setState({
      currentUser: dccUser,
      documents: [
        { id: 'doc-101', title: 'SOP-PD-001', name: 'Standard Procedure for Mixing', rev: '02', status: 'EFFECTIVE', department: 'PD' },
        { id: 'doc-old', title: 'SOP-PD-001', name: 'Standard Procedure for Mixing', rev: '01', status: 'SUPERSEDED_ARCHIVED', department: 'PD' }
      ],
      documentControlledCopies: [
        {
          id: 'cc-pending-1',
          doc_id: 'doc-101',
          doc_code: 'SOP-PD-001',
          docName: 'Standard Procedure for Mixing',
          doc_version: '02',
          copy_no: '01',
          issue_no: '01',
          holder_dept: 'PD',
          location: 'Line 1 Mixing Station',
          status: 'PENDING_ISSUE'
        },
        {
          id: 'cc-dispatched-1',
          doc_id: 'doc-101',
          doc_code: 'SOP-PD-001',
          docName: 'Standard Procedure for Mixing',
          doc_version: '02',
          copy_no: '02',
          issue_no: '01',
          holder_dept: 'PD',
          location: 'Line 2 Packaging Station',
          status: 'DISPATCHED_PENDING_RECEIPT',
          dispatched_at: '2026-08-23T10:00:00.000Z',
          dispatched_by: 'Admin QA (DCC)'
        },
        {
          id: 'cc-recall-1',
          doc_id: 'doc-old',
          doc_code: 'SOP-PD-001',
          docName: 'Standard Procedure for Mixing',
          doc_version: '01',
          copy_no: '01',
          issue_no: '01',
          holder_dept: 'PD',
          location: 'Line 1 Mixing Station',
          status: 'PENDING_RECALL'
        },
        {
          id: 'cc-recall-2',
          doc_id: 'doc-old',
          doc_code: 'SOP-PD-001',
          docName: 'Standard Procedure for Mixing',
          doc_version: '01',
          copy_no: '02',
          issue_no: '01',
          holder_dept: 'PD',
          location: 'Line 2 Packaging Station',
          status: 'PENDING_RECALL'
        }
      ],
      controlledCopyInstances: [
        {
          id: 'cc-pending-1',
          doc_id: 'doc-101',
          doc_code: 'SOP-PD-001',
          docName: 'Standard Procedure for Mixing',
          doc_version: '02',
          copy_no: '01',
          issue_no: '01',
          holder_dept: 'PD',
          location: 'Line 1 Mixing Station',
          status: 'PENDING_ISSUE'
        },
        {
          id: 'cc-dispatched-1',
          doc_id: 'doc-101',
          doc_code: 'SOP-PD-001',
          docName: 'Standard Procedure for Mixing',
          doc_version: '02',
          copy_no: '02',
          issue_no: '01',
          holder_dept: 'PD',
          location: 'Line 2 Packaging Station',
          status: 'DISPATCHED_PENDING_RECEIPT',
          dispatched_at: '2026-08-23T10:00:00.000Z',
          dispatched_by: 'Admin QA (DCC)'
        },
        {
          id: 'cc-recall-1',
          doc_id: 'doc-old',
          doc_code: 'SOP-PD-001',
          docName: 'Standard Procedure for Mixing',
          doc_version: '01',
          copy_no: '01',
          issue_no: '01',
          holder_dept: 'PD',
          location: 'Line 1 Mixing Station',
          status: 'PENDING_RECALL'
        },
        {
          id: 'cc-recall-2',
          doc_id: 'doc-old',
          doc_code: 'SOP-PD-001',
          docName: 'Standard Procedure for Mixing',
          doc_version: '01',
          copy_no: '02',
          issue_no: '01',
          holder_dept: 'PD',
          location: 'Line 2 Packaging Station',
          status: 'PENDING_RECALL'
        }
      ],
      tasks: [
        {
          id: 'task-receipt-cc-dispatched-1',
          type: 'DEPT_CONFIRM_HARDCOPY_RECEIPT',
          title: 'ตรวจรับเอกสารควบคุมฉบับพิมพ์: SOP-PD-001 (Copy 02)',
          copy_id: 'cc-dispatched-1',
          doc_code: 'SOP-PD-001',
          doc_version: '02',
          copy_no: '02',
          location: 'Line 2 Packaging Station',
          assignedToDept: 'PD',
          status: 'PENDING'
        },
        {
          id: 'task-recall-doc-old',
          type: 'DCC_RECALL_WITH_CHECKLIST',
          title: 'เรียกคืนเอกสาร Controlled Copy (Rev.01)',
          doc_id: 'doc-old',
          status: 'PENDING'
        }
      ],
      controlledCopyAuditTrail: []
    });
  });

  describe('1. DCC Control Portal (ControlledCopyRegister.jsx)', () => {
    it('renders the 3 primary workflow tabs (Pending Issue, Dispatched Tracking, Recall Checklist)', () => {
      renderWithRouter(<ControlledCopyRegister />, { route: '/controlled-copy' });

      expect(screen.getByText(/1\. รายการรอออกสำเนา/i)).toBeInTheDocument();
      expect(screen.getByText(/2\. ติดตามการส่งมอบ/i)).toBeInTheDocument();
      expect(screen.getByText(/3\. เช็กลิสต์เรียกคืนเอกสาร/i)).toBeInTheDocument();
    });

    it('Tab 1: Shows pending issue copies with Single Print and Dispatch buttons', async () => {
      renderWithRouter(<ControlledCopyRegister />, { route: '/controlled-copy?tab=PENDING_ISSUE' });

      expect(screen.getByText('Line 1 Mixing Station')).toBeInTheDocument();
      expect(screen.getByText('พิมพ์สำเนา')).toBeInTheDocument();
      expect(screen.getByText('บันทึกส่งมอบ')).toBeInTheDocument();
    });

    it('Tab 1: Invokes UniversalWatermarkService.downloadWatermarkedPdf with copy location on Single Print', async () => {
      const spyPrint = vi.spyOn(UniversalWatermarkService, 'downloadWatermarkedPdf').mockResolvedValue('blob:url');

      renderWithRouter(<ControlledCopyRegister />, { route: '/controlled-copy?tab=PENDING_ISSUE' });

      const printBtn = screen.getByText('พิมพ์สำเนา');
      fireEvent.click(printBtn);

      await waitFor(() => {
        expect(spyPrint).toHaveBeenCalledTimes(1);
        expect(spyPrint).toHaveBeenCalledWith(
          expect.anything(),
          WATERMARK_TYPES.CONTROLLED_COPY,
          expect.objectContaining({
            copyNo: '01',
            location: 'Line 1 Mixing Station'
          })
        );
      });

      spyPrint.mockRestore();
    });

    it('Tab 1: Dispatches a copy and creates DEPT_CONFIRM_HARDCOPY_RECEIPT task', () => {
      renderWithRouter(<ControlledCopyRegister />, { route: '/controlled-copy?tab=PENDING_ISSUE' });

      fireEvent.click(screen.getByText('บันทึกส่งมอบ'));
      // Unprinted copy triggers the poka-yoke guard; DCC confirms dispatch explicitly
      fireEvent.click(screen.getByText('ยืนยันส่งมอบ (ข้ามการพิมพ์)'));

      const state = useStore.getState();
      const dispatched = state.controlledCopyInstances.find(c => c.id === 'cc-pending-1');
      expect(dispatched.status).toBe('DISPATCHED_PENDING_RECEIPT');
      expect(dispatched.dispatched_at).toBeDefined();

      const receiptTask = state.tasks.find(t => String(t.copy_id) === 'cc-pending-1');
      expect(receiptTask).toBeDefined();
      expect(receiptTask.type).toBe('DEPT_CONFIRM_HARDCOPY_RECEIPT');
    });

    it('Tab 2: Displays dispatched copies in tracking mode with pending receipt badge', () => {
      renderWithRouter(<ControlledCopyRegister />, { route: '/controlled-copy?tab=DISPATCHED_TRACKING' });

      expect(screen.getByText(/รอยืนยันรับเล่ม/i)).toBeInTheDocument();
      expect(screen.getByText('Line 2 Packaging Station')).toBeInTheDocument();
    });

    it('Tab 3: Shows recall checklist and opens DccRecallActionModal on trigger click', async () => {
      renderWithRouter(<ControlledCopyRegister />, { route: '/controlled-copy?tab=RECALL_CHECKLIST' });

      // Document title and version
      expect(screen.getByText(/Rev\.01 \(ฉบับเดิม\)/i)).toBeInTheDocument();

      // The new unified modal trigger button replaces the old bare action buttons
      const recallModalBtn = screen.getByRole('button', { name: /จัดการเรียกคืนสำเนา/i });
      expect(recallModalBtn).toBeInTheDocument();
      expect(recallModalBtn).not.toBeDisabled();

      // Clicking it should open the modal
      fireEvent.click(recallModalBtn);

      // Modal heading visible
      expect(screen.getByText(/จัดการเรียกคืนสำเนาควบคุม/i)).toBeInTheDocument();

      // Confirm button in modal is disabled (no copies checked, no disposition)
      const allButtons = screen.getAllByRole('button');
      const confirmBtn = allButtons.find(b => b.textContent?.includes('บันทึกการเรียกคืน'));
      expect(confirmBtn).toBeDefined();
      expect(confirmBtn.disabled).toBe(true);
    });

  });

  describe('2. E-Signature Hardcopy Receipt Page (TaskConfirmHardcopyReceipt.jsx)', () => {
    beforeEach(() => {
      setTestUser(pdUser);
    });

    it('renders document metadata, Copy No, Location, and Active Session badge without PIN or 21 CFR 11', () => {
      renderWithRouter(
        <Routes>
          <Route path="/tasks/confirm-receipt/:id" element={<TaskConfirmHardcopyReceipt />} />
        </Routes>,
        { route: '/tasks/confirm-receipt/task-receipt-cc-dispatched-1' }
      );

      expect(screen.getByText(/ตรวจรับเอกสารควบคุมฉบับจริง/i)).toBeInTheDocument();
      // 21 CFR Part 11 must be removed
      expect(screen.queryByText(/21 CFR Part 11/i)).not.toBeInTheDocument();
      // Verified with Active User Session
      expect(screen.getByText(/Department-Pooled Task/i)).toBeInTheDocument();
      expect(screen.getAllByText(/Active User Session/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/Line 2 Packaging Station/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/Copy 02/i).length).toBeGreaterThan(0);
      expect(screen.getByText(/สมชาย สายผลิต \(PD User\)/i)).toBeInTheDocument();

      // No password inputs for PIN
      const passwordInputs = screen.queryAllByDisplayValue('').filter(el => el.type === 'password');
      expect(passwordInputs).toHaveLength(0);
    });

    it('acknowledges terms, enters remarks, and confirms receipt eliminating the task and recording audit trail', async () => {
      const user = userEvent.setup();

      renderWithRouter(
        <Routes>
          <Route path="/tasks/confirm-receipt/:id" element={<TaskConfirmHardcopyReceipt />} />
          <Route path="/tasks" element={<div>Task Inbox Screen</div>} />
        </Routes>,
        { route: '/tasks/confirm-receipt/task-receipt-cc-dispatched-1' }
      );

      // Check acknowledgment terms
      const checkbox = screen.getByRole('checkbox');
      await user.click(checkbox);

      // Enter remarks
      const remarksInput = screen.getByPlaceholderText(/ตรวจสอบตราประทับ/i);
      await user.type(remarksInput, 'ได้รับเล่มจริงพร้อมตรวจสอบตราประทับครบถ้วน');

      // Click Confirm Receipt (without needing any PIN)
      const submitBtn = screen.getByRole('button', { name: /ยืนยันตรวจรับเอกสาร/i });
      expect(submitBtn).not.toBeDisabled();
      await user.click(submitBtn);

      // Verify Store State
      const state = useStore.getState();
      const confirmedCopy = state.controlledCopyInstances.find(c => c.id === 'cc-dispatched-1');
      expect(confirmedCopy.status).toBe('ISSUED_ACTIVE');
      expect(confirmedCopy.receipt_confirmed_at).toBeDefined();
      expect(confirmedCopy.receipt_confirmed_by).toBe('สมชาย สายผลิต (PD User)');

      // Verify Task Dismissal
      expect(state.tasks.find(t => t.id === 'task-receipt-cc-dispatched-1')).toBeUndefined();

      // Verify Audit Trail Entry in Store
      const auditLogs = state.physicalCopyAuditLogs || [];
      const log = auditLogs.find(l => l.copy_identifier === 'Copy 02' || l.copy_identifier?.includes('02'));
      expect(log).toBeDefined();
      expect(log.action).toBe('PHYSICAL_COPY_RECEIVED');
      expect(log.actor_user_id).toBe('u1');
      expect(log.actor_name).toBe('สมชาย สายผลิต (PD User)');
      expect(log.target_department).toBe('PD');
      expect(log.remarks).toBe('ได้รับเล่มจริงพร้อมตรวจสอบตราประทับครบถ้วน');
    });
  });
});
