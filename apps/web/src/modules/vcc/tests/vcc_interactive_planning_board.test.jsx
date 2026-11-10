import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import useStore from '../../../store/useStore';
import AssetRegisterPage from '../pages/AssetRegisterPage';
import { resetVccLocalStore } from '../api/vccApi';

describe('VCC Interactive Planning Board (FM-QC-46 Redesign)', () => {
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

  it('1. แสดงตาราง 12 เดือนที่คลีน ไม่มีคอลัมน์วันครบกำหนดคั่นกลาง ไม่มีปุ่มซ้ำซ้อนใน Toolbar และสลับมุมมองรายไตรมาสจากด้านบนได้', async () => {
    render(<AssetRegisterPage />);

    // Go to Annual Plan tab
    fireEvent.click(await screen.findByRole('button', { name: /แผนการทวนสอบประจำปี \(FM-QC-46\)/i }));
    expect(await screen.findByText('V001')).toBeInTheDocument();

    // Redundant density/view buttons and middle due-date column are removed
    expect(screen.queryByRole('button', { name: 'กะทัดรัด' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'สบายตา' })).not.toBeInTheDocument();
    expect(screen.queryByText('วันครบกำหนด / สถานะหลักฐาน')).not.toBeInTheDocument();
    expect(screen.queryByText('ด.1')).not.toBeInTheDocument();

    // Clean 12 month headers exist
    expect(screen.getByRole('columnheader', { name: 'ม.ค.' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'ธ.ค.' })).toBeInTheDocument();

    // Switch to Quarterly view via top-level view switcher
    const quarterlyTab = screen.getByRole('button', { name: /มุมมองรายไตรมาส/i });
    fireEvent.click(quarterlyTab);

    // Switch back to 12-Month Matrix View
    const matrixTab = screen.getByRole('button', { name: /ตารางแผน 12 เดือน/i });
    fireEvent.click(matrixTab);
    expect(screen.getByRole('columnheader', { name: 'ม.ค.' })).toBeInTheDocument();
  }, 15000);

  it('2. คลิก Cell ที่มีแผนอยู่แล้ว จะเปิด Popover แสดงรายละเอียดวันครบกำหนดและ Quick Actions ได้', async () => {
    render(<AssetRegisterPage />);

    fireEvent.click(await screen.findByRole('button', { name: /แผนการทวนสอบประจำปี \(FM-QC-46\)/i }));
    expect(await screen.findByText('V001')).toBeInTheDocument();

    // Switch to 12-Month Matrix View to test cell popovers
    fireEvent.click(screen.getByRole('button', { name: /ตารางแผน 12 เดือน/i }));

    // V001 is planned in month 2 (P2)
    const p2Btns = screen.getAllByRole('button', { name: /P2/i });
    expect(p2Btns.length).toBeGreaterThan(0);

    // Click first P2 badge to open contextual popover
    fireEvent.click(p2Btns[0]);

    // Popover must show month info and equipment
    expect(await screen.findByText(/เดือนที่ 2 \(กุมภาพันธ์\)/i)).toBeInTheDocument();
    expect(screen.getByText(/รอบตามแผนประจำปี \(Plan\)/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /ยกเลิกรอบแผนเดือน 2/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /แก้ไขรายละเอียดรายการเต็ม/i })).toBeInTheDocument();

    // Clicking cancel plan month triggers confirmation state
    fireEvent.click(screen.getByRole('button', { name: /ยกเลิกรอบแผนเดือน 2/i }));
    expect(screen.getByText(/ยืนยันยกเลิกรอบเดือน 2 ออกจากแผน\?/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ยืนยันยกเลิก' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ไม่ยกเลิก' })).toBeInTheDocument();

    // Click "ไม่ยกเลิก" -> aborts delete
    fireEvent.click(screen.getByRole('button', { name: 'ไม่ยกเลิก' }));
    expect(screen.queryByText(/ยืนยันยกเลิกรอบเดือน 2 ออกจากแผน\?/i)).not.toBeInTheDocument();
  }, 15000);

  it('3. เปิด Side Inspector ดูรายละเอียดสเปกเครื่องมือ ข้อมูลสถานที่ และไทม์ไลน์ 12 เดือนแบบ On-demand', async () => {
    render(<AssetRegisterPage />);

    fireEvent.click(await screen.findByRole('button', { name: /แผนการทวนสอบประจำปี \(FM-QC-46\)/i }));
    expect(await screen.findByText('V001')).toBeInTheDocument();

    // Click asset code link or "สเปก" button
    const specButtons = screen.getAllByRole('button', { name: /สเปก/i });
    fireEvent.click(specButtons[0]);

    // Side Inspector drawer should open
    expect(await screen.findByText(/ข้อมูลจำเพาะและสถานที่ติดตั้ง/i)).toBeInTheDocument();
    expect(screen.getByText(/เกณฑ์การทวนสอบและวันครบกำหนด/i)).toBeInTheDocument();
    expect(screen.getByText(/กำหนดการตลอดทั้งปี \(ม\.ค\. - ธ\.ค\.\)/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ปิดหน้าต่าง' })).toBeInTheDocument();

    // Close Side Inspector
    fireEvent.click(screen.getByRole('button', { name: 'ปิดหน้าต่าง' }));
    await waitFor(() => {
      expect(screen.queryByText(/ข้อมูลจำเพาะและสถานที่ติดตั้ง/i)).not.toBeInTheDocument();
    });
  }, 15000);
});
