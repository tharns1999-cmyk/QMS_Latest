import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ActionConfirmModal from '../../../shared/components/common/ActionConfirmModal';

describe('Modal Summary, Typography Scale-Up & Thai Localization Tests', () => {
  it('renders ActionConfirmModal with scaled-up typography and Thai default submit button', () => {
    const summaryData = [
      { label: 'ผู้ร้องขอ / แผนก', value: 'สมชาย สายผลิต (PD)' },
      { label: 'รหัสเอกสาร', value: 'SOP-PD-001' },
      { label: 'ชื่อเอกสาร', value: 'คู่มือการปฏิบัติงานการผสมวัตถุดิบ' }
    ];

    render(
      <ActionConfirmModal
        isOpen={true}
        onClose={() => {}}
        onConfirm={() => {}}
        title="ยืนยันการส่งคำร้องขอขึ้นทะเบียนเอกสารใหม่"
        actionType="submit"
        summaryData={summaryData}
      />
    );

    // Verify Title and Subtitle
    expect(screen.getByText('ยืนยันการส่งคำร้องขอขึ้นทะเบียนเอกสารใหม่')).toBeInTheDocument();
    expect(screen.getByText('กรุณาตรวจสอบรายละเอียดสรุปก่อนดำเนินการยืนยัน')).toBeInTheDocument();

    // Verify Default Thai Buttons
    expect(screen.getByText('ยืนยันการส่งคำร้องขอ')).toBeInTheDocument();
    expect(screen.getByText('ยกเลิก / กลับไปแก้ไข')).toBeInTheDocument();

    // Verify Labels & Values
    expect(screen.getByText('ผู้ร้องขอ / แผนก')).toBeInTheDocument();
    expect(screen.getByText('สมชาย สายผลิต (PD)')).toBeInTheDocument();
    expect(screen.getByText('SOP-PD-001')).toBeInTheDocument();
  });

  it('renders correct Thai default button labels across all actionTypes', () => {
    const actions = [
      { type: 'approve', expected: 'ยืนยันการอนุมัติเอกสาร' },
      { type: 'reject', expected: 'ยืนยันการไม่อนุมัติ / ส่งกลับแก้ไข' },
      { type: 'obsolete', expected: 'ยืนยันการยกเลิกเอกสาร' },
      { type: 'acknowledge', expected: 'รับทราบและยอมรับ' },
      { type: 'distribute', expected: 'ยืนยันการแจกจ่ายสำเนา' }
    ];

    actions.forEach(({ type, expected }) => {
      const { unmount } = render(
        <ActionConfirmModal
          isOpen={true}
          onClose={() => {}}
          onConfirm={() => {}}
          title={`Action ${type}`}
          actionType={type}
          summaryData={[]}
        />
      );

      expect(screen.getByText(expected)).toBeInTheDocument();
      unmount();
    });
  });

  it('supports custom confirmText and cancelText overrides', () => {
    render(
      <ActionConfirmModal
        isOpen={true}
        onClose={() => {}}
        onConfirm={() => {}}
        title="Custom Modal"
        confirmText="ยืนยันบันทึกข้อมูลพิเศษ"
        cancelText="ย้อนกลับไปหน้าแรก"
        summaryData={[{ label: 'สถานะ', value: 'พร้อมใช้งาน' }]}
      />
    );

    expect(screen.getByText('ยืนยันบันทึกข้อมูลพิเศษ')).toBeInTheDocument();
    expect(screen.getByText('ย้อนกลับไปหน้าแรก')).toBeInTheDocument();
  });

  it('enforces typed confirmation in Thai for critical obsolete actions', () => {
    const handleConfirm = vi.fn();

    render(
      <ActionConfirmModal
        isOpen={true}
        onClose={() => {}}
        onConfirm={handleConfirm}
        title="ยืนยันการยกเลิกเอกสาร"
        actionType="obsolete"
        requireTypeToConfirm={true}
        summaryData={[{ label: 'รหัสเอกสาร', value: 'WI-QA-005' }]}
      />
    );

    // Verify warning prompt
    expect(screen.getByText(/นี่เป็นการดำเนินการสำคัญ กรุณาพิมพ์/)).toBeInTheDocument();
    expect(screen.getByPlaceholderText('พิมพ์ CONFIRM')).toBeInTheDocument();

    // Confirm button should be disabled initially
    const confirmBtn = screen.getByRole('button', { name: /ยืนยันการยกเลิกเอกสาร/i });
    expect(confirmBtn).toBeDisabled();

    // Type CONFIRM
    const input = screen.getByPlaceholderText('พิมพ์ CONFIRM');
    fireEvent.change(input, { target: { value: 'CONFIRM' } });
    expect(confirmBtn).not.toBeDisabled();
  });

  it('renders rich 10-section summary elements seamlessly (Badges, File, Routing)', () => {
    const summaryData = [
      { label: 'ผู้ร้องขอ / แผนก', value: <span data-testid="req">กิตติพงษ์ (PD)</span> },
      { label: 'รหัสเอกสาร', value: <span data-testid="code">SOP-PD-001</span> },
      { label: 'ชนิดและประเภทเอกสาร', value: <span>ระเบียบปฏิบัติงาน (SOP)</span> },
      { label: 'ชื่อเอกสาร', value: <span>คู่มือการตรวจสอบคุณภาพ</span> },
      { label: 'รายละเอียดคำร้องขอ', value: <div data-testid="detail">ขอขึ้นทะเบียนเอกสารใหม่เพื่อรองรับการตรวจประเมิน</div> },
      { label: 'เหตุผลการร้องขอ', value: <div data-testid="reason">ขยายกำลังการผลิตและปรับปรุงมาตรฐาน</div> },
      {
        label: 'มาตรฐานที่เกี่ยวข้อง',
        value: (
          <div data-testid="standards">
            <span>GHPs</span>
            <span>ISO 9001</span>
            <span>FSSC 22000</span>
          </div>
        )
      },
      {
        label: 'ไฟล์เอกสารแนบ',
        value: <span data-testid="file">SOP-PD-001_v1.pdf (2.45 MB)</span>
      },
      {
        label: 'จุดใช้งานและแผนกแจกจ่าย',
        value: (
          <div data-testid="stations">
            <span>Line 1 Mixing</span>
            <span>QC Lab</span>
          </div>
        )
      },
      {
        label: 'ขั้นตอนถัดไป / ผู้มีอำนาจทบทวน',
        value: <div data-testid="routing">ส่งต่อให้: สมพร ผู้จัดการฝ่าย (Reviewer Level 2)</div>
      }
    ];

    render(
      <ActionConfirmModal
        isOpen={true}
        onClose={() => {}}
        onConfirm={() => {}}
        title="ยืนยันการส่งคำร้องขอขึ้นทะเบียนเอกสารใหม่ (New Document DAR)"
        actionType="submit"
        summaryData={summaryData}
      />
    );

    expect(screen.getByTestId('req')).toHaveTextContent('กิตติพงษ์ (PD)');
    expect(screen.getByTestId('code')).toHaveTextContent('SOP-PD-001');
    expect(screen.getByTestId('detail')).toHaveTextContent('ขอขึ้นทะเบียนเอกสารใหม่เพื่อรองรับการตรวจประเมิน');
    expect(screen.getByTestId('reason')).toHaveTextContent('ขยายกำลังการผลิตและปรับปรุงมาตรฐาน');
    expect(screen.getByTestId('standards')).toHaveTextContent('GHPs');
    expect(screen.getByTestId('standards')).toHaveTextContent('ISO 9001');
    expect(screen.getByTestId('file')).toHaveTextContent('SOP-PD-001_v1.pdf (2.45 MB)');
    expect(screen.getByTestId('stations')).toHaveTextContent('Line 1 Mixing');
    expect(screen.getByTestId('routing')).toHaveTextContent('สมพร ผู้จัดการฝ่าย (Reviewer Level 2)');
  });
});
