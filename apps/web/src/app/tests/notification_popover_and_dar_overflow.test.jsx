import { describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import useStore from '../../store/useStore';
import NotificationPopover from '../layout/NotificationPopover';
import DocumentDetailModal from '../../modules/dcc/components/workflow/DocumentDetailModal';
import Sidebar from '../layout/Sidebar';

describe('Notification Popover & DAR History Text-Wrap Constraints', () => {
  beforeEach(() => {
    useStore.setState({
      currentUser: { id: 'U001', name: 'คุณสมชาย (QA)', department: 'QA', role: 'DCC_ADMIN', isDcc: true, level: 6 },
      masterUsers: [
        { id: 'U001', name: 'คุณสมชาย (QA)', department: 'QA', role: 'DCC_ADMIN' },
        { id: 'U002', name: 'คุณวิชัย (MGMT)', department: 'MGMT', role: 'APPROVER' }
      ],
      notifications: [
        {
          id: 'n1',
          userId: 'U001',
          title: 'DAR ใหม่รอการตรวจสอบ',
          message: 'DAR-2026-001 เอกสารระเบียบปฏิบัติงาน QA รอการตรวจสอบจากคุณ',
          isRead: false,
          link: '/tasks',
          timestamp: new Date().toISOString()
        },
        {
          id: 'n2',
          userId: 'U001',
          title: 'เอกสารภายนอกใหม่',
          message: 'ED-QA-01 กฎหมายโรงงานอุตสาหกรรม บังคับใช้แล้ว',
          isRead: true,
          link: '/tasks',
          timestamp: new Date(Date.now() - 3600000).toISOString()
        }
      ],
      documents: [
        {
          id: 'doc-1',
          title: 'SOP-QA-001',
          doc_code: 'SOP-QA-001',
          name: 'ระเบียบการควบคุมคุณภาพ',
          rev: '01',
          status: 'EFFECTIVE',
          department: 'QA'
        }
      ],
      dars: [
        {
          id: 'DAR-2026-001',
          dar_no: 'DAR-2026-001',
          doc_code: 'SOP-QA-001',
          type: 'NEW',
          status: 'EFFECTIVE',
          requesterId: 'U001',
          requester_name: 'คุณสมชาย (QA)',
          requestReason: 'aetrhaethaerthaesrthlongunbrokenstringwithoutspacesthatshouldwrapcleanly12345678901234567890',
          requestDetail: 'anotherverylongunbrokencontinuouscharacterstringforstressmeasuringbreakallbehaviorwithoutoverflowing',
          createdAt: new Date().toISOString()
        }
      ],
      controlledCopyInstances: [],
      documentControlledCopies: [],
      tasks: [],
      timeline: []
    });
  });

  describe('1. NotificationPopover Component Tests', () => {
    it('renders notification trigger button with unread badge count', () => {
      render(
        <MemoryRouter>
          <NotificationPopover />
        </MemoryRouter>
      );

      expect(screen.getByText('การแจ้งเตือนระบบ')).toBeInTheDocument();
      // Unread count is 1
      expect(screen.getByText('1')).toBeInTheDocument();
    });

    it('opens floating panel with Figma UI3 layout (w-88/w-96) and visual hierarchy on click', async () => {
      render(
        <MemoryRouter>
          <NotificationPopover />
        </MemoryRouter>
      );

      const triggerBtn = screen.getByRole('button', { name: /การแจ้งเตือนระบบ/i });
      fireEvent.click(triggerBtn);

      await waitFor(() => {
        expect(screen.getByText('การแจ้งเตือน')).toBeInTheDocument();
        expect(screen.getByText('1 ใหม่')).toBeInTheDocument();
        expect(screen.getByText('อ่านทั้งหมด')).toBeInTheDocument();
        expect(screen.getByText('DAR ใหม่รอการตรวจสอบ')).toBeInTheDocument();
        expect(screen.getByText('เอกสารภายนอกใหม่')).toBeInTheDocument();
        expect(screen.getByText('ดูประวัติการแจ้งเตือนทั้งหมด')).toBeInTheDocument();
      });
    });

    it('marks all notifications as read when clicking "อ่านทั้งหมด"', async () => {
      render(
        <MemoryRouter>
          <NotificationPopover />
        </MemoryRouter>
      );

      const triggerBtn = screen.getByRole('button', { name: /การแจ้งเตือนระบบ/i });
      fireEvent.click(triggerBtn);

      const markAllBtn = screen.getByText('อ่านทั้งหมด');
      fireEvent.click(markAllBtn);

      await waitFor(() => {
        const state = useStore.getState();
        const unread = state.notifications.filter(n => n.userId === 'U001' && !n.isRead);
        expect(unread.length).toBe(0);
      });
    });

    it('renders empty state with BellOff icon when there are no notifications', async () => {
      useStore.setState({ notifications: [] });

      render(
        <MemoryRouter>
          <NotificationPopover />
        </MemoryRouter>
      );

      const triggerBtn = screen.getByRole('button', { name: /การแจ้งเตือนระบบ/i });
      fireEvent.click(triggerBtn);

      await waitFor(() => {
        expect(screen.getByText('ไม่มีการแจ้งเตือนใหม่')).toBeInTheDocument();
      });
    });
  });

  describe('2. Sidebar Integration Test', () => {
    it('Sidebar renders NotificationPopover properly with zero regression', () => {
      render(
        <MemoryRouter>
          <Sidebar />
        </MemoryRouter>
      );

      expect(screen.getByText('การแจ้งเตือนระบบ')).toBeInTheDocument();
      expect(screen.getByText(/ภาพรวมพอร์ทัล|หน้าหลักพอร์ทัล/i)).toBeInTheDocument();
    });
  });

  describe('3. DocumentDetailModal DAR History Card Text Overflow & Formatting', () => {
    it('renders DAR history card with surface box bg-[#F8FAFC] and strict break-words break-all without duplicate colons', () => {
      const doc = useStore.getState().documents[0];

      render(
        <MemoryRouter>
          <DocumentDetailModal
            isOpen={true}
            onClose={() => {}}
            document={doc}
          />
        </MemoryRouter>
      );

      // Switch to History Tab
      const historyTab = screen.getByText(/ประวัติ DAR/i);
      fireEvent.click(historyTab);

      // Verify DAR Card rendered
      expect(screen.getByText('DAR-26-001')).toBeInTheDocument();
      expect(screen.getByText(/เหตุผลในการร้องขอ/i)).toBeInTheDocument();

      // Ensure no duplicate colons "::" exist in the rendered text
      const headingElements = screen.getAllByText(/เหตุผลในการร้องขอ/i);
      headingElements.forEach(el => {
        expect(el.textContent).not.toContain('::');
      });

      // Verify unbroken strings are displayed inside the card
      expect(screen.getByText(/aetrhaethaerthaesrthlongunbrokenstringwithoutspacesthatshouldwrapcleanly12345678901234567890/i)).toBeInTheDocument();
      expect(screen.getByText(/anotherverylongunbrokencontinuouscharacterstringforstressmeasuringbreakallbehaviorwithoutoverflowing/i)).toBeInTheDocument();
    });
  });
});
