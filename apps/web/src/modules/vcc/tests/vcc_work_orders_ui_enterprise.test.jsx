import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import useStore from '../../../store/useStore';
import AssetRegisterPage from '../pages/AssetRegisterPage';
import { resetVccLocalStore } from '../api/vccApi';

describe('VCC Work Orders — Enterprise UI/UX Redesign Tests', () => {
  beforeEach(() => {
    resetVccLocalStore();
    useStore.setState({
      currentUser: {
        id: 'dc4',
        name: 'DC หัวหน้า (DCC)',
        email: 'dc4@qms.local',
        role: 'STAFF',
        department: 'DC',
        position: 'Document Control Supervisor',
        approval_level: 4,
        approvalLevel: 4,
        isDcc: true,
        isQmr: false
      },
      masterDepartments: [
        { code: 'QC', name_th: 'ควบคุมคุณภาพ', status: 'ACTIVE' },
        { code: 'WH', name_th: 'คลังสินค้า', status: 'ACTIVE' }
      ],
      approvalMatrix: [
        {
          docType: 'FM',
          minRequesterLevel: 1,
          requiredReviewerLevel: 4,
          requiredApproverLevel: 5
        }
      ]
    });
  });

  it('1. Information Bar สามารถกดขยายและพับเก็บกติกาได้ พร้อมคงข้อความกติกาครบถ้วน', async () => {
    render(<AssetRegisterPage />);
    fireEvent.click(await screen.findByRole('button', { name: /ใบสั่งงานและบันทึกผล \(Work Orders\)/i }));

    const infoBarToggle = await screen.findByRole('button', {
      name: /กติกาใบสั่งงานทวนสอบ\/สอบเทียบ การตรวจรับผล และการระงับใช้ \(ON_HOLD\)/i
    });
    expect(infoBarToggle).toHaveAttribute('aria-expanded', 'false');

    // Rule details should initially be collapsed
    expect(screen.queryByText(/ใบสั่งงานต้องผูกกับ/i)).not.toBeInTheDocument();

    // Click to expand
    fireEvent.click(infoBarToggle);
    expect(infoBarToggle).toHaveAttribute('aria-expanded', 'true');
    expect(await screen.findByText(/ใบสั่งงานต้องผูกกับ/i)).toBeInTheDocument();
    expect(screen.getByText(/ผู้ตรวจรับผล/i)).toBeInTheDocument();
    expect(screen.getByText(/เมื่อผลเป็น/i)).toBeInTheDocument();

    // Click to collapse again
    fireEvent.click(infoBarToggle);
    expect(infoBarToggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText(/ใบสั่งงานต้องผูกกับ/i)).not.toBeInTheDocument();
  });

  it('2. Status Navigation แสดงแท็บสถานะครบ 5 แท็บพร้อมจำนวนรายการ (Badge Count) และอัปเดตสถานะแบบ Single Row', async () => {
    render(<AssetRegisterPage />);
    fireEvent.click(await screen.findByRole('button', { name: /ใบสั่งงานและบันทึกผล \(Work Orders\)/i }));

    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(5);

    // Initial seed WO is in OPEN tab (1 item)
    const openTab = screen.getByRole('tab', { name: /เปิดงาน \/ รอบันทึกผล \(OPEN\)/i });
    expect(openTab).toHaveAttribute('aria-selected', 'true');
    await waitFor(() => {
      expect(openTab).toHaveTextContent('1');
    });

    const closedTab = screen.getByRole('tab', { name: /ตรวจรับปิดงานแล้ว \(CLOSED\)/i });
    expect(closedTab).toHaveAttribute('aria-selected', 'false');
    expect(closedTab).toHaveTextContent('0');
  });

  it('3. Toolbar Search กรองข้อมูลตามเลขใบงาน/เครื่องมือ และมีปุ่มล้างตัวกรองเมื่อค้นหา', async () => {
    render(<AssetRegisterPage />);
    fireEvent.click(await screen.findByRole('button', { name: /ใบสั่งงานและบันทึกผล \(Work Orders\)/i }));

    expect(await screen.findByText('WO-2026-001')).toBeInTheDocument();

    const searchInput = screen.getByPlaceholderText(/ค้นหาเลขที่ใบงาน/i);

    // Search for non-existent item
    fireEvent.change(searchInput, { target: { value: 'NONEXISTENT-999' } });
    expect(await screen.findByText(/ไม่พบรายการใบสั่งงานในแท็บ OPEN/i)).toBeInTheDocument();
    expect(screen.queryByText('WO-2026-001')).not.toBeInTheDocument();

    // Click Clear filter button
    const clearBtn = screen.getAllByRole('button', { name: /ล้างตัวกรอง/i })[0];
    fireEvent.click(clearBtn);

    // Restores original list
    expect(await screen.findByText('WO-2026-001')).toBeInTheDocument();
  });

  it('4. คลิกแถวใบสั่งงานเพื่อเปิด Side Drawer ตรวจสอบรายละเอียดและปิดได้', async () => {
    render(<AssetRegisterPage />);
    fireEvent.click(await screen.findByRole('button', { name: /ใบสั่งงานและบันทึกผล \(Work Orders\)/i }));

    // Click on row to open Side Drawer
    const rowWo = await screen.findByText('WO-2026-001');
    fireEvent.click(rowWo);

    // Side Drawer opens
    const drawerTitle = await screen.findByRole('heading', { name: 'WO-2026-001' });
    expect(drawerTitle).toBeInTheDocument();
    expect(screen.getByText(/เครื่องมือวัดและอุปกรณ์/i)).toBeInTheDocument();
    expect(screen.getByText(/ข้อมูลแผนงานและกำหนดการ/i)).toBeInTheDocument();

    // Close Side Drawer
    const closeBtn = screen.getByRole('button', { name: /ปิดหน้าต่างรายละเอียดใบสั่งงาน/i });
    fireEvent.click(closeBtn);

    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: 'WO-2026-001' })).not.toBeInTheDocument();
    });
  });
});
