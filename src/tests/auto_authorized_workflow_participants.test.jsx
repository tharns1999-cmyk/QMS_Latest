import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { hasDocumentAccess, canUserAccessDocument } from '../utils/accessControl';
import useStore from '../store/useStore';
import AuthorizedUsersSelector from '../components/workflow/AuthorizedUsersSelector';
import DocumentAccessControlSelector from '../components/workflow/DocumentAccessControlSelector';

describe('Auto-Authorize Workflow Participants in Restricted Document Access', () => {
  describe('1. Store & Permission Logic (canUserAccessDocument / hasDocumentAccess)', () => {
    const restrictedDoc = {
      id: 'DOC-CONFIDENTIAL-001',
      title: 'SOP-RESTRICTED-001',
      department: 'PD',
      created_by: 'U-REQUESTER-1',
      reviewerId: 'U-REVIEWER-2',
      approvers: ['U-APPROVER-3'],
      access_control: {
        scope: 'RESTRICTED',
        authorized_users: ['U-OTHER-99'],
        min_access_level: 6
      }
    };

    it('auto-authorizes requester even if restricted to Level 6 and not in whitelist', () => {
      const requesterUser = { id: 'U-REQUESTER-1', name: 'Requester Staff', level: 2, role: 'GENERAL_USER' };
      expect(canUserAccessDocument(restrictedDoc, requesterUser)).toBe(true);
      expect(hasDocumentAccess(restrictedDoc, requesterUser)).toBe(true);
    });

    it('auto-authorizes reviewer even if restricted to Level 6 and reviewer is Level 4', () => {
      const reviewerUser = { id: 'U-REVIEWER-2', name: 'Reviewer Lead', level: 4, role: 'GENERAL_USER' };
      expect(canUserAccessDocument(restrictedDoc, reviewerUser)).toBe(true);
    });

    it('auto-authorizes approvers even if restricted to Level 6 and approver is Level 5', () => {
      const approverUser = { id: 'U-APPROVER-3', name: 'Approver Mgr', level: 5, role: 'GENERAL_USER' };
      expect(canUserAccessDocument(restrictedDoc, approverUser)).toBe(true);
    });

    it('auto-authorizes DCC Admin unconditionally', () => {
      const dccAdminUser = { id: 'U-DCC-01', name: 'DCC Admin', level: 4, role: 'DCC_ADMIN', isDcc: true };
      expect(canUserAccessDocument(restrictedDoc, dccAdminUser)).toBe(true);
    });

    it('denies access to an uninvolved user who does not meet minLevel and is not in whitelist', () => {
      const strangerUser = { id: 'U-STRANGER', name: 'Regular Staff', level: 2, role: 'GENERAL_USER', department: 'PD' };
      expect(canUserAccessDocument(restrictedDoc, strangerUser)).toBe(false);
    });

    it('exposes canUserAccessDocument directly on Zustand useStore', () => {
      const storeState = useStore.getState();
      expect(typeof storeState.canUserAccessDocument).toBe('function');
      const requesterUser = { id: 'U-REQUESTER-1', level: 2, role: 'GENERAL_USER' };
      expect(storeState.canUserAccessDocument(restrictedDoc, requesterUser)).toBe(true);
    });
  });

  describe('2. UX/UI Improvements in Restricted Member Picker', () => {
    const mockUsers = [
      { id: 'EMP-001', name: 'ธนาวุฒิ สมควรกิจดำรง', department: 'DC', role: 'DCC Admin', level: 5, active: true },
      { id: 'EMP-002', name: 'ศิริพร วงศ์สุวรรณ', department: 'QA', role: 'QA Supervisor', level: 4, active: true },
      { id: 'EMP-003', name: 'วิชัย สมบูรณ์ดี', department: 'PD', role: 'Production Tech', level: 2, active: true },
      { id: 'EMP-004', name: 'สุรศักดิ์ กล้าหาญ', department: 'PD', role: 'Line Leader', level: 3, active: true },
    ];

    const workflowParticipants = [
      { id: 'EMP-001', name: 'ธนาวุฒิ สมควรกิจดำรง', department: 'DC', role: 'REQUESTER', roleTitle: 'ผู้จัดทำ (Requester)' },
      { id: 'EMP-002', name: 'ศิริพร วงศ์สุวรรณ', department: 'QA', role: 'REVIEWER', roleTitle: 'ผู้ทบทวน (Reviewer)' },
      { id: 'EMP-004', name: 'สุรศักดิ์ กล้าหาญ', department: 'PD', role: 'APPROVER', roleTitle: 'ผู้อนุมัติ (Approver)' }
    ];

    it('renders Auto-Included Badges Strip with locked chips and explanation subtext', () => {
      render(
        <AuthorizedUsersSelector
          selectedUserIds={[]}
          onChange={vi.fn()}
          users={mockUsers}
          workflowParticipants={workflowParticipants}
        />
      );

      // Auto-authorized strip header and subtext
      expect(screen.getByText(/สิทธิ์เข้าถึงอัตโนมัติตามสายอนุมัติ \(Auto-Authorized\):/i)).toBeInTheDocument();
      expect(screen.getByText(/บุคคลในสายการจัดทำ ทบทวน และอนุมัติจะได้รับสิทธิ์เข้าถึงเอกสารนี้โดยอัตโนมัติ/i)).toBeInTheDocument();

      // Check locked chips role badges
      expect(screen.getByText(/ผู้จัดทำ \(Requester\)/)).toBeInTheDocument();
      expect(screen.getByText(/ผู้ทบทวน \(Reviewer\)/)).toBeInTheDocument();
      expect(screen.getByText(/ผู้อนุมัติ \(Approver\)/)).toBeInTheDocument();
    });

    it('renders "ผู้ร่วมสายงาน (Auto)" badge and locked disabled button for workflow participants in the directory grid', () => {
      const handleToggle = vi.fn();
      render(
        <AuthorizedUsersSelector
          selectedUserIds={[]}
          onChange={handleToggle}
          onToggleUser={handleToggle}
          users={mockUsers}
          workflowParticipants={workflowParticipants}
        />
      );

      // Verify "ผู้ร่วมสายงาน (Auto)" badge is present
      const autoBadges = screen.getAllByText('ผู้ร่วมสายงาน (Auto)');
      expect(autoBadges.length).toBeGreaterThanOrEqual(3);

      // EMP-001 (Workflow participant) should have disabled action button with lock
      const lockedButton = screen.getByRole('button', { name: /ธนาวุฒิ สมควรกิจดำรง/ });
      expect(lockedButton).toHaveAttribute('aria-disabled', 'true');

      // Clicking on the workflow participant card should not invoke toggle
      fireEvent.click(lockedButton);
      expect(handleToggle).not.toHaveBeenCalled();

      // Non-workflow participant (EMP-003: วิชัย สมบูรณ์ดี) should have normal toggle
      const nonParticipantName = screen.getByRole('button', { name: /วิชัย สมบูรณ์ดี/ });
      fireEvent.click(nonParticipantName);
      expect(handleToggle).toHaveBeenCalledWith('EMP-003');
    });

    it('propagates workflowParticipants through DocumentAccessControlSelector seamlessly', () => {
      render(
        <DocumentAccessControlSelector
          value={{
            scope: 'RESTRICTED',
            restricted_mode: 'WHITELIST',
            min_access_level: 4,
            authorized_users: []
          }}
          onChange={vi.fn()}
          masterUsers={mockUsers}
          workflowParticipants={workflowParticipants}
        />
      );

      // Strip should appear in DocumentAccessControlSelector under RESTRICTED whitelist mode
      expect(screen.getByText(/สิทธิ์เข้าถึงอัตโนมัติตามสายอนุมัติ \(Auto-Authorized\):/i)).toBeInTheDocument();
      expect(screen.getByText(/ผู้ทบทวน \(Reviewer\)/)).toBeInTheDocument();
    });
  });
});
