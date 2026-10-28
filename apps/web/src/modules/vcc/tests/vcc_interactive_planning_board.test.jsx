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

  it('1. สลับมุมมองความหนาแน่น (สบายตา / กะทัดรัด) และโหมดแสดงผล (12 เดือนเต็ม / รายไตรมาส Q1-Q4) ได้อย่างถูกต้อง', async () => {
    render(<AssetRegisterPage />);

    // Go to Annual Plan tab
    fireEvent.click(await screen.findByRole('button', { name: /แผนการทวนสอบประจำปี \(FM-QC-46\)/i }));
    expect(await screen.findByText('V001')).toBeInTheDocument();

    // Toggle Density
    const compactBtn = screen.getByRole('button', { name: 'กะทัดรัด' });
    const comfortableBtn = screen.getByRole('button', { name: 'สบายตา' });
    expect(comfortableBtn).toBeInTheDocument();
    expect(compactBtn).toBeInTheDocument();

    fireEvent.click(compactBtn);
    expect(compactBtn).toHaveClass('bg-white');

    fireEvent.click(comfortableBtn);
    expect(comfortableBtn).toHaveClass('bg-white');

    // Toggle View Mode: Quarterly
    const quarterlyBtn = screen.getByRole('button', { name: /รายไตรมาส \(Q1-Q4\)/i });
    fireEvent.click(quarterlyBtn);
    expect(screen.getByText('Q1 (ม.ค.-มี.ค.)')).toBeInTheDocument();
    expect(screen.getByText('Q4 (ต.ค.-ธ.ค.)')).toBeInTheDocument();

    // Switch back to 12 Months
    const full12Btn = screen.getByRole('button', { name: /12 เดือน \(เต็ม\)/i });
    fireEvent.click(full12Btn);
    expect(screen.getByText('ด.1')).toBeInTheDocument();
    expect(screen.getByText('ด.12')).toBeInTheDocument();
  });

  it('2. คลิก Cell ที่มีแผนอยู่แล้ว จะเปิด Popover แสดงรายละเอียดวันครบกำหนดและ Quick Actions ได้', async () => {
    render(<AssetRegisterPage />);

    fireEvent.click(await screen.findByRole('button', { name: /แผนการทวนสอบประจำปี \(FM-QC-46\)/i }));
    expect(await screen.findByText('V001')).toBeInTheDocument();

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
  });

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
  });
});
