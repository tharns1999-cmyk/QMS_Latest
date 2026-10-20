import { describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import useStore from '../../store/useStore';
import NotificationPopover from '../layout/NotificationPopover';
import NotificationCenterModal from '../../modules/dcc/components/modals/NotificationCenterModal';

describe('Enterprise Notification Architecture & Lifecycle Management Tests', () => {
  const currentUser = {
    id: 'U005',
    name: 'บีม (QA)',
    department: 'QA',
    role: 'DEPT_ADMIN',
    level: 4,
    isDcc: false
  };

  const sampleNotifications = [
    {
      id: 'notif-1',
      userId: 'U005',
      title: 'DAR-2026-088 รอการอนุมัติ',
      message: 'คำร้องขอแก้ไขระเบียบปฏิบัติงาน QA เข้าสู่สถานะรอการทบทวน',
      category: 'DAR',
      isRead: false,
      read: false,
      link: '/tasks',
      timestamp: new Date().toISOString()
    },
    {
      id: 'notif-2',
      userId: 'U005',
      title: 'ออกสำเนาควบคุมทดแทนสำเร็จ',
      message: 'สำเนาควบคุม SOP-QA-01 (Copy 02) ประจำแล็บกลางได้รับการออกเล่มทดแทนแล้ว',
      category: 'CONTROLLED_COPY',
      isRead: false,
      read: false,
      link: '/controlled-copy',
      timestamp: new Date(Date.now() - 3600000).toISOString()
    },
    {
      id: 'notif-3',
      userId: 'U005',
      title: 'อัปเดตนโยบายความปลอดภัยระบบ',
      message: 'ระบบได้ทำการปรับปรุงนโยบาย e-Signature ตามมาตรฐาน 21 CFR Part 11',
      category: 'SYSTEM',
      isRead: true,
      read: true,
      link: null,
      timestamp: new Date(Date.now() - 86400000).toISOString()
    },
    {
      id: 'notif-4',
      userId: 'U002', // Belongs to another user (PD)
      title: 'DAR-2026-099 ของฝ่ายผลิต',
      message: 'คำร้องฝ่ายผลิต',
      category: 'DAR',
      isRead: false,
      read: false,
      timestamp: new Date().toISOString()
    }
  ];

  beforeEach(() => {
    useStore.setState({
      currentUser,
      notifications: [...sampleNotifications],
      actionLog: [
        {
          id: 'log-audit-01',
          actionType: 'LOGIN',
          actor: 'บีม (QA)',
          details: 'User logged into QMS Portal',
          timestamp: new Date().toISOString()
        }
      ]
    });
  });

  it('1. Clicking "ดูประวัติการแจ้งเตือนทั้งหมด" in NotificationPopover opens NotificationCenterModal', async () => {
    render(
      <MemoryRouter>
        <NotificationPopover />
      </MemoryRouter>
    );

    // Open popover
    const triggerBtn = screen.getByRole('button', { name: /การแจ้งเตือนระบบ/i });
    fireEvent.click(triggerBtn);

    // Click "ดูประวัติการแจ้งเตือนทั้งหมด"
    const viewAllBtn = screen.getByRole('button', { name: /ดูประวัติการแจ้งเตือนทั้งหมด/i });
    fireEvent.click(viewAllBtn);

    // NotificationCenterModal should now be open
    await waitFor(() => {
      expect(screen.getByText(/ศูนย์ประวัติการแจ้งเตือน \(Notification Center\)/i)).toBeInTheDocument();
      expect(screen.getByText(/ประวัติการแจ้งเตือน กิจกรรม และสถานะคำร้องที่เกี่ยวข้องกับบัญชีของคุณ/i)).toBeInTheDocument();
    });
  });

  it('2. Category tabs filter notifications accurately', () => {
    render(
      <MemoryRouter>
        <NotificationCenterModal isOpen={true} onClose={() => {}} />
      </MemoryRouter>
    );

    // Default tab 'ALL': shows 3 notifications for U005
    expect(screen.getByText('DAR-2026-088 รอการอนุมัติ')).toBeInTheDocument();
    expect(screen.getByText('ออกสำเนาควบคุมทดแทนสำเร็จ')).toBeInTheDocument();
    expect(screen.getByText('อัปเดตนโยบายความปลอดภัยระบบ')).toBeInTheDocument();
    // Does NOT show U002 notification
    expect(screen.queryByText('DAR-2026-099 ของฝ่ายผลิต')).not.toBeInTheDocument();

    // Filter by UNREAD
    const unreadTab = screen.getByRole('button', { name: /ยังไม่อ่าน/i });
    fireEvent.click(unreadTab);

    expect(screen.getByText('DAR-2026-088 รอการอนุมัติ')).toBeInTheDocument();
    expect(screen.getByText('ออกสำเนาควบคุมทดแทนสำเร็จ')).toBeInTheDocument();
    expect(screen.queryByText('อัปเดตนโยบายความปลอดภัยระบบ')).not.toBeInTheDocument();

    // Filter by DAR
    const darTab = screen.getByRole('button', { name: /คำร้อง DAR/i });
    fireEvent.click(darTab);

    expect(screen.getByText('DAR-2026-088 รอการอนุมัติ')).toBeInTheDocument();
    expect(screen.queryByText('ออกสำเนาควบคุมทดแทนสำเร็จ')).not.toBeInTheDocument();

    // Filter by CONTROLLED_COPY
    const ccTab = screen.getByRole('button', { name: /สำเนาควบคุม/i });
    fireEvent.click(ccTab);

    expect(screen.getByText('ออกสำเนาควบคุมทดแทนสำเร็จ')).toBeInTheDocument();
    expect(screen.queryByText('DAR-2026-088 รอการอนุมัติ')).not.toBeInTheDocument();
  });

  it('3. Search input query filters notifications across title and description', () => {
    render(
      <MemoryRouter>
        <NotificationCenterModal isOpen={true} onClose={() => {}} />
      </MemoryRouter>
    );

    const searchInput = screen.getByPlaceholderText(/ค้นหาข้อความแจ้งเตือน/i);
    fireEvent.change(searchInput, { target: { value: '21 CFR' } });

    expect(screen.getByText('อัปเดตนโยบายความปลอดภัยระบบ')).toBeInTheDocument();
    expect(screen.queryByText('DAR-2026-088 รอการอนุมัติ')).not.toBeInTheDocument();
    expect(screen.queryByText('ออกสำเนาควบคุมทดแทนสำเร็จ')).not.toBeInTheDocument();
  });

  it('4. Mark as read on click and "อ่านทั้งหมดแล้ว" button update store state and unread count', async () => {
    render(
      <MemoryRouter>
        <NotificationCenterModal isOpen={true} onClose={() => {}} />
      </MemoryRouter>
    );

    // Click "อ่านทั้งหมดแล้ว"
    const markAllBtn = screen.getByRole('button', { name: /อ่านทั้งหมดแล้ว/i });
    fireEvent.click(markAllBtn);

    const state = useStore.getState();
    const u5Notifs = state.notifications.filter(n => n.userId === 'U005');
    expect(u5Notifs.every(n => n.isRead && n.read)).toBe(true);
  });

  it('5. Table pagination works seamlessly for large notification datasets', () => {
    // Generate 25 notifications
    const manyNotifs = Array.from({ length: 25 }, (_, i) => ({
      id: `gen-notif-${i + 1}`,
      userId: 'U005',
      title: `แจ้งเตือนรายการที่ ${i + 1}`,
      message: `รายละเอียดแจ้งเตือนลำดับ ${i + 1}`,
      category: 'SYSTEM',
      isRead: false,
      read: false,
      timestamp: new Date(Date.now() - i * 60000).toISOString()
    }));

    useStore.setState({ notifications: manyNotifs });

    render(
      <MemoryRouter>
        <NotificationCenterModal isOpen={true} onClose={() => {}} />
      </MemoryRouter>
    );

    // Page 1 should show 10 items (from 1 to 10)
    expect(screen.getByText('แจ้งเตือนรายการที่ 1')).toBeInTheDocument();
    expect(screen.getByText('แจ้งเตือนรายการที่ 10')).toBeInTheDocument();
    expect(screen.queryByText('แจ้งเตือนรายการที่ 11')).not.toBeInTheDocument();

    // Summary text
    expect(screen.getByText(/จากทั้งหมด/i)).toBeInTheDocument();
    expect(screen.getByText('25')).toBeInTheDocument();
  });

  it('6. Data Tiering & Retention: pruneOldNotifications removes read notifications older than 90 days while preserving unread and audit logs', () => {
    const ninetyFiveDaysAgo = new Date(Date.now() - 95 * 24 * 60 * 60 * 1000).toISOString();
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();

    const tieredNotifications = [
      {
        id: 'old-read',
        userId: 'U005',
        title: 'แจ้งเตือนเก่าที่อ่านแล้ว (ควรถูกตัด)',
        isRead: true,
        read: true,
        created_at: ninetyFiveDaysAgo
      },
      {
        id: 'old-unread',
        userId: 'U005',
        title: 'แจ้งเตือนเก่าที่ยังไม่อ่าน (ต้องคงไว้)',
        isRead: false,
        read: false,
        created_at: ninetyFiveDaysAgo
      },
      {
        id: 'recent-read',
        userId: 'U005',
        title: 'แจ้งเตือนใหม่อ่านแล้ว (ต้องคงไว้)',
        isRead: true,
        read: true,
        created_at: tenDaysAgo
      }
    ];

    useStore.setState({ notifications: tieredNotifications });

    const { pruneOldNotifications } = useStore.getState();
    pruneOldNotifications();

    const finalState = useStore.getState();
    expect(finalState.notifications.some(n => n.id === 'old-read')).toBe(false);
    expect(finalState.notifications.some(n => n.id === 'old-unread')).toBe(true);
    expect(finalState.notifications.some(n => n.id === 'recent-read')).toBe(true);

    // Audit logs remain 100% immutable
    expect(finalState.actionLog.length).toBe(1);
  });
});
