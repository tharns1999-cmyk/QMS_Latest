import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import useStore from '../../../store/useStore';
import AssetRegisterPage from '../pages/AssetRegisterPage';
import { resetVccLocalStore } from '../api/vccApi';

const openPlanPage = async () => {
  render(<AssetRegisterPage />);
  fireEvent.click(await screen.findByRole('button', { name: /แผนการทวนสอบประจำปี \(FM-QC-46\)/i }));
  await screen.findByText('V001');
};

describe('VCC FM-QC-46 — สถาปัตยกรรมข้อมูลส่วนบนของหน้า (Information Architecture)', () => {
  beforeEach(() => {
    resetVccLocalStore();
    useStore.setState({
      currentUser: {
        id: 'dc4',
        name: 'DC หัวหน้า (DCC)',
        email: 'dc4@qms.local',
        role: 'STAFF',
        department: 'DC',
        approval_level: 4,
        approvalLevel: 4,
        isDcc: true,
        isQmr: false
      },
      masterDepartments: [
        { code: 'QC', name_th: 'ควบคุมคุณภาพ', status: 'ACTIVE' },
        { code: 'WH', name_th: 'คลังสินค้า', status: 'ACTIVE' }
      ],
      approvalMatrix: [{ docType: 'FM', minRequesterLevel: 1, requiredReviewerLevel: 4, requiredApproverLevel: 5 }]
    });
  });

  it('1. ใช้ข้อความไทยเป็นหลัก ไม่แสดงค่า enum ภายใน และไม่ซ้ำชื่อแผนในหัวหน้าเพจ', async () => {
    await openPlanPage();

    expect(screen.getByText(/สถานะ: ร่างแผน/, { selector: 'span' })).toBeInTheDocument();
    expect(screen.getByText(/ครบกำหนดวันสิ้นเดือน/)).toBeInTheDocument();
    expect(screen.queryByText(/END_OF_MONTH/)).toBeNull();
    expect(screen.queryByText(/สถานะ: DRAFT/)).toBeNull();

    // ชื่อแผน (ข้อมูลจริงของแผนที่เลือก) แสดงครั้งเดียว
    const planTitles = screen.getAllByRole('heading', { level: 2 });
    expect(planTitles).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('แผนการทวนสอบเครื่องมือประจำปี');
  });

  it('2. ตัวกรองสถานะเป็นตัวเลือกเดียว (ไม่มีแท็บ 5 ปุ่ม) และยังเลือกดูแผนตามสถานะจริงได้', async () => {
    await openPlanPage();

    expect(screen.queryByRole('tab')).toBeNull();
    const status = screen.getByLabelText('กรองตามสถานะแผน');
    expect(within(status).getAllByRole('option')).toHaveLength(5);

    fireEvent.change(status, { target: { value: 'PENDING_REVIEW' } });
    expect(await screen.findByText(/ไม่พบแผนการทวนสอบประจำปีในสถานะ “รอทบทวน”/)).toBeInTheDocument();
    // เมื่อไม่มีแผน ยังสร้างแผนใหม่ได้จากหน้านี้
    expect(screen.getByRole('button', { name: /สร้างแผนประจำปีใหม่/ })).toBeInTheDocument();
  });

  it('3. ปีและแผนกรวมอยู่ในตัวกรองเสริมเดียว และตัวเลือกแผนระบุปี/แผนก/ฉบับ', async () => {
    await openPlanPage();

    const planSelect = screen.getByLabelText('เลือกแผนประจำปี');
    expect(planSelect.selectedOptions[0]).toHaveTextContent(/ปี 2026 · แผนก QC · FM-QC-46 Rev\.01/);

    expect(screen.queryByLabelText('กรองตามปีของแผน')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /กรองปี\/แผนก/ }));
    expect(screen.getByLabelText('กรองตามปีของแผน')).toBeInTheDocument();
    expect(screen.getByLabelText('กรองแผนตามแผนก')).toBeInTheDocument();
  });

  it('4. งานรองทั้งหมดยังเข้าถึงได้ผ่านเมนู "เพิ่มเติม" (แก้ไขหัวแผน, สร้างแผน, ประวัติ, ตั้งค่า, ข้อกำหนด)', async () => {
    await openPlanPage();

    expect(screen.queryByRole('menuitem')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'เมนูเพิ่มเติมของแผน' }));
    const names = screen.getAllByRole('menuitem').map((el) => el.textContent);
    expect(names).toEqual([
      'แก้ไขหัวแผน',
      'สร้างแผนประจำปีใหม่',
      'ประวัติการอนุมัติ',
      'ตั้งค่าแผนและเกณฑ์อนุมัติ',
      'ข้อกำหนดการใช้แผน'
    ]);

    fireEvent.click(screen.getByRole('menuitem', { name: 'ประวัติการอนุมัติ' }));
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('5. ปุ่มเพิ่มเครื่องมือจากทะเบียนอยู่ที่แถบเครื่องมือของตาราง และแผนที่ไม่ใช่ร่างจะไม่มีปุ่มแก้ไข', async () => {
    await openPlanPage();

    const matrix = screen.getByRole('table');
    const toolbarAdd = screen.getByRole('button', { name: /เพิ่มเครื่องมือจากทะเบียน/ });
    expect(toolbarAdd).toBeInTheDocument();
    expect(matrix.contains(toolbarAdd)).toBe(false);
    // ไม่มีปุ่มเน้นสีหลักซ้ำใน header เดิม
    expect(screen.queryByRole('button', { name: /เพิ่มเครื่องมือเข้าแผน/ })).toBeNull();

    // ส่งทบทวนแล้ว แผนถูกล็อก ปุ่มเพิ่มต้องหายไป
    fireEvent.click(screen.getByRole('button', { name: 'ส่งทบทวนแผน' }));
    expect(await screen.findByRole('button', { name: 'ยืนยันการทบทวน' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /เพิ่มเครื่องมือจากทะเบียน/ })).toBeNull();
  });

  it('6. สรุปสถานะบอกขั้นตอนถัดไป และรายละเอียดผู้ทบทวน/ผู้อนุมัติขยายดูได้', async () => {
    await openPlanPage();

    expect(screen.getByText(/เพิ่มรายการเครื่องมือให้ครบ แล้วส่งทบทวนแผน/)).toBeInTheDocument();
    expect(screen.queryByText(/ผู้ทบทวน \(L4\+\)/)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /ผู้เกี่ยวข้อง/ }));
    expect(screen.getByText(/ผู้จัดทำ \(L1\+\)/)).toBeInTheDocument();
    expect(screen.getByText(/ผู้ทบทวน \(L4\+\)/)).toBeInTheDocument();
    expect(screen.getByText(/ผู้อนุมัติ \(L5\+\)/)).toBeInTheDocument();
  });
});

