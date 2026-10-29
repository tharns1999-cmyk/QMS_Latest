import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import useStore from '../../../store/useStore';
import AssetRegisterPage from '../pages/AssetRegisterPage';
import { resetVccLocalStore } from '../api/vccApi';
import { computeDueDateForMonth, computeDueDates, createVccPlan, fetchVccPlans } from '../api/vccPlanApi';

const openPlanPage = async () => {
  render(<AssetRegisterPage />);
  fireEvent.click(await screen.findByRole('button', { name: /แผนการทวนสอบประจำปี \(FM-QC-46\)/i }));
  await screen.findByText('V001');
};

describe('VCC FM-QC-46 — ประสบการณ์การเลือกและสร้างแผนประจำปี (Plan Year Experience & Validation)', () => {
  beforeEach(() => {
    resetVccLocalStore();
    useStore.setState({
      currentUser: {
        id: 'dc4',
        name: 'DC หัวหน้า (DCC)',
        email: 'dc4@qms.local',
        role: 'STAFF',
        department: 'QC',
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

  it('1. แยกการเลือกแผนที่มีอยู่ออกจากปุ่มสร้างแผนใหม่อย่างชัดเจน และมองเห็นปุ่มสร้างแผนใหม่ได้ทันที', async () => {
    await openPlanPage();

    // ตัวเลือกแผนหลักแสดงแผนที่มีอยู่ในระบบ
    const planSelect = screen.getByLabelText('เลือกแผนประจำปี');
    expect(planSelect).toBeInTheDocument();
    expect(planSelect.value).toBeTruthy();

    // ปุ่มสร้างแผนใหม่แสดงเด่นชัดข้างตัวเลือกแผนโดยไม่ต้องกดเปิดเมนู ...
    const createBtn = screen.getByRole('button', { name: 'สร้างแผนใหม่' });
    expect(createBtn).toBeInTheDocument();

    // เมนูรอง ... ยังมีทางเลือก "สร้างแผนประจำปีใหม่" คงเดิม
    fireEvent.click(screen.getByRole('button', { name: 'เมนูเพิ่มเติมของแผน' }));
    expect(screen.getByRole('menuitem', { name: 'สร้างแผนประจำปีใหม่' })).toBeInTheDocument();
  });

  it('2. สามารถสร้างแผนสำหรับปีอนาคต (เช่น 2028/2029) ได้ โดยแสดงปี พ.ศ. ตรงกันและคำนวณวันครบกำหนดถูกต้อง', async () => {
    await openPlanPage();

    // เปิด Modal สร้างแผนใหม่
    fireEvent.click(screen.getByRole('button', { name: 'สร้างแผนใหม่' }));
    expect(await screen.findByText('สร้างแผนการทวนสอบเครื่องมือประจำปีใหม่')).toBeInTheDocument();

    // กรอกปี 2028 (ปีอธิกสุรทิน)
    const yearInput = screen.getByLabelText(/ปี ค\.ศ\. ของแผน/i);
    fireEvent.change(yearInput, { target: { value: '2028' } });

    // แสดงปี พ.ศ. 2571 ตรงกันอัตโนมัติ
    expect(screen.getByText(/ตรงกับ พ\.ศ\. 2571/)).toBeInTheDocument();

    // แสดงตัวอย่างวันครบกำหนดสิ้นเดือน ก.พ. ของปี 2028 เป็น 2028-02-29
    expect(screen.getByText(/2028-02-29/)).toBeInTheDocument();

    // บันทึกแผนปี 2028
    fireEvent.click(screen.getByRole('button', { name: 'บันทึกแผนประจำปี' }));

    // แผนปี 2028 ถูกบันทึกและแสดงในตัวเลือกแผน
    await waitFor(() => {
      const planSelect = screen.getByLabelText('เลือกแผนประจำปี');
      expect(planSelect.selectedOptions[0]).toHaveTextContent(/2028/);
    });
  });

  it('3. เมื่อกรองปีที่ยังไม่มีแผน แสดง Empty State ชัดเจนพร้อมปุ่มสร้างแผนที่กรอกปีนั้นให้อัตโนมัติ', async () => {
    await openPlanPage();

    // เปิดตัวกรองปี/แผนก
    fireEvent.click(screen.getByRole('button', { name: /กรองปี\/แผนก/ }));
    const yearFilter = screen.getByLabelText('กรองตามปีของแผน');

    // กรองปี 2029 (ที่ยังไม่มีแผน)
    fireEvent.change(yearFilter, { target: { value: '2029' } });

    // ตรวจสอบ Empty State พร้อมข้อความแนะนำภาษาไทยที่ระบุปีและ พ.ศ. ชัดเจน
    expect(await screen.findByText(/ไม่พบแผนการทวนสอบประจำปี 2029 ในสถานะ “ร่างแผน”/)).toBeInTheDocument();
    expect(screen.getByText(/ยังไม่มีแผนสำหรับปี 2029 \(พ\.ศ\. 2572\) คุณสามารถสร้างแผนใหม่ได้ทันที/)).toBeInTheDocument();

    // กดปุ่มสร้างแผนประจำปีใหม่จากหน้า Empty State
    fireEvent.click(screen.getByRole('button', { name: 'สร้างแผนประจำปีใหม่' }));

    // ฟอร์มเปิดขึ้นมาโดยกรอกปี 2029 ให้อัตโนมัติ
    expect(await screen.findByText('สร้างแผนการทวนสอบเครื่องมือประจำปีใหม่')).toBeInTheDocument();
    const yearInput = screen.getByLabelText(/ปี ค\.ศ\. ของแผน/i);
    expect(yearInput.value).toBe('2029');
    expect(screen.getByText(/ตรงกับ พ\.ศ\. 2572/)).toBeInTheDocument();
  });

  it('4. คำนวณวันครบกำหนดถูกต้องสำหรับปีอนาคต ปีอธิกสุรทิน และปีที่ไกลกว่าค่าเริ่มต้น', () => {
    // ปีปกติ 2026 (ก.พ. 28 วัน)
    expect(computeDueDateForMonth(2026, 2, 'END_OF_MONTH')).toBe('2026-02-28');

    // ปีอธิกสุรทิน 2028 (ก.พ. 29 วัน)
    expect(computeDueDateForMonth(2028, 2, 'END_OF_MONTH')).toBe('2028-02-29');

    // ปีอนาคต 2035 (ก.พ. 28 วัน, เม.ย. 30 วัน, ธ.ค. 31 วัน)
    expect(computeDueDateForMonth(2035, 2, 'END_OF_MONTH')).toBe('2035-02-28');
    expect(computeDueDateForMonth(2035, 4, 'END_OF_MONTH')).toBe('2035-04-30');
    expect(computeDueDateForMonth(2035, 12, 'END_OF_MONTH')).toBe('2035-12-31');

    // คำนวณแบบ START_OF_MONTH
    expect(computeDueDateForMonth(2028, 2, 'START_OF_MONTH')).toBe('2028-02-01');

    // คำนวณหลายเดือนพร้อมกัน
    const dueDates2028 = computeDueDates(2028, [2, 4, 12], 'END_OF_MONTH');
    expect(dueDates2028).toEqual(['2028-02-29', '2028-04-30', '2028-12-31']);
  });

  it('5. ป้องกันการสร้างแผนซ้ำตามปี แผนก และ Revision (UNIQUE Constraint)', async () => {
    // แผนปี 2026 QC Rev.01 มีอยู่แล้วในระบบ
    const existing = await fetchVccPlans({ status: 'DRAFT', year: 2026, department: 'QC' });
    expect(existing.length).toBeGreaterThan(0);

    // พยายามสร้างแผนซ้ำปี 2026 แผนก QC Rev.01
    await expect(
      createVccPlan({
        plan_year: 2026,
        department: 'QC',
        revision: '01',
        title: 'แผนซ้ำ'
      })
    ).rejects.toThrow(/แผนประจำปี 2026 ของแผนก QC \(Rev\.01\) มีอยู่ในระบบแล้ว/);

    // แต่ถ้าต่าง Revision เช่น Rev.02 สามารถสร้างได้
    const newRev = await createVccPlan({
      plan_year: 2026,
      department: 'QC',
      revision: '02',
      title: 'แผนฉบับแก้ไข 02'
    });
    expect(newRev.id).toBeTruthy();
    expect(newRev.revision).toBe('02');

    // หรือต่างปี เช่น 2030 สามารถสร้างได้
    const futurePlan = await createVccPlan({
      plan_year: 2030,
      department: 'QC',
      revision: '01',
      title: 'แผนล่วงหน้าปี 2030'
    });
    expect(futurePlan.plan_year).toBe(2030);
  });

  it('6. ปฏิเสธปีที่อยู่นอกขอบเขต 2000–2100', async () => {
    // ปฏิเสธปี < 2000
    await expect(
      createVccPlan({
        plan_year: 1999,
        department: 'QC',
        revision: '01',
        title: 'ปีในอดีต'
      })
    ).rejects.toThrow(/ระบุปีของแผนประจำปีให้ถูกต้อง/);

    // ปฏิเสธปี > 2100
    await expect(
      createVccPlan({
        plan_year: 2101,
        department: 'QC',
        revision: '01',
        title: 'ปีในอนาคตไกลเกิน'
      })
    ).rejects.toThrow(/ระบุปีของแผนประจำปีให้ถูกต้อง/);
  });
});

