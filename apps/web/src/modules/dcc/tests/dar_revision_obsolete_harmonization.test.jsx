import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import DarRevisionForm from '../pages/DarWorkflow/DarRevisionForm';
import DarObsoleteForm from '../pages/DarWorkflow/DarObsoleteForm';
import useStore from '../../../store/useStore';

vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn()
  }
}));

const renderWithRouter = (ui) => render(<BrowserRouter>{ui}</BrowserRouter>);

describe('Enterprise Form Layout Harmonization Tests (DAR Revision & Obsolete)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useStore.setState({
      currentUser: {
        id: 'u1',
        name: 'ธนาวุฒิ สมควรกิจดำรง',
        department: 'PD',
        role: 'STAFF',
        position_level: 4,
        isDcc: false
      },
      documentTypes: [
        { code: 'SOP', name: 'Standard Operating Procedure', nameTh: 'ระเบียบปฏิบัติงาน', status: 'ACTIVE', namingPattern: 'SOP-{Dept}-{###}', is_form_type: false },
        { code: 'WI', name: 'Work Instruction', nameTh: 'คู่มือการปฏิบัติงาน', status: 'ACTIVE', namingPattern: 'WI-{Dept}-{###}', is_form_type: false },
        { code: 'FM', name: 'Form', nameTh: 'แบบฟอร์ม', status: 'ACTIVE', namingPattern: 'FM-{Dept}-{###}', is_form_type: true }
      ],
      masterUsers: [
        { id: 'u1', name: 'ธนาวุฒิ สมควรกิจดำรง', department: 'PD', position_level: 4, role: 'STAFF' },
        { id: 'u2', name: 'กัลยาณี พลไกร', department: 'PD', position_level: 5, role: 'MANAGER' },
        { id: 'u3', name: 'วิชัย ผู้บริหาร', department: 'PD', position_level: 6, role: 'DIRECTOR' }
      ],
      reviewUsers: [
        { id: 'u2', name: 'กัลยาณี พลไกร', department: 'PD', position_level: 5, role: 'MANAGER' }
      ],
      approveUsers: [
        { id: 'u3', name: 'วิชัย ผู้บริหาร', department: 'PD', position_level: 6, role: 'DIRECTOR' }
      ],
      documents: [
        {
          id: 'doc-pd-01',
          title: 'SOP-PD-01',
          name: 'ขั้นตอนการผลิตสาย 1',
          rev: '00',
          department: 'PD',
          status: 'EFFECTIVE',
          controlledCopy: 3,
          relatedStandards: ['ISO 9001']
        },
        {
          id: 'doc-pd-02',
          title: 'FM-PD-01',
          name: 'แบบฟอร์มบันทึกการผลิต',
          rev: '01',
          department: 'PD',
          status: 'EFFECTIVE',
          controlledCopy: 0,
          relatedStandards: ['GHPs / HACCP']
        }
      ],
      dars: [],
      simulatedDate: '2026-08-26T00:00:00.000Z'
    });
  });

  describe('1. DarRevisionForm Harmonized Layout', () => {
    it('renders unified canvas with Section 1 header strip, 4-col Section 2, and 50/50 Section 3', () => {
      const { container } = renderWithRouter(<DarRevisionForm />);

      // Section 1 Header Strip
      expect(screen.getByText(/ส่วนที่ 1: ข้อมูลผู้ร้องขอ/i)).toBeInTheDocument();
      expect(screen.getByText('ธนาวุฒิ สมควรกิจดำรง')).toBeInTheDocument();
      expect(screen.getByText('ขอแก้ไข (REVISION)')).toBeInTheDocument();

      // Section 2: 4-Column Grid
      expect(screen.getByText(/ส่วนที่ 2: เลือกเอกสารและกำหนดวันบังคับใช้/i)).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/ระบุชื่อเอกสาร \(สามารถใช้ชื่อเดิมได้\)/i)).toBeInTheDocument();
      expect(container.querySelector('input[type="date"]')).toBeInTheDocument();

      // Section 3: 50/50 Symmetrical Grid
      expect(screen.getByText(/ส่วนที่ 3: รายละเอียดการขอแก้ไขเอกสารและเอกสารแนบ/i)).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/ระบุข้อความ หัวข้อ หรือขั้นตอนที่ทำการแก้ไข/i)).toBeInTheDocument();
      expect(screen.getByText(/ระบบมาตรฐานที่เกี่ยวข้อง/i)).toBeInTheDocument();
      expect(screen.getByText(/อัปโหลดไฟล์เอกสารฉบับแก้ไข \(PDF เท่านั้น\)/i)).toBeInTheDocument();
      expect(screen.getByText(/การรับทราบเอกสาร/i)).toBeInTheDocument();

      // Ensure no Section 4
      expect(screen.queryByText(/ส่วนที่ 4: กำหนดวันมีผลบังคับใช้/i)).toBeNull();
    });

    it('calculates auto-increment revision and handles full submission flow', async () => {
      const { container } = renderWithRouter(<DarRevisionForm />);

      // Search and select SOP-PD-01
      const searchInput = screen.getByPlaceholderText(/ค้นหารหัส หรือชื่อ/i);
      fireEvent.focus(searchInput);
      fireEvent.change(searchInput, { target: { value: 'SOP-PD-01' } });

      const docOption = await screen.findByText('ขั้นตอนการผลิตสาย 1');
      fireEvent.click(docOption);

      // Verify Auto Revision calculation
      expect(screen.getByText('Rev.00')).toBeInTheDocument();
      expect(screen.getAllByText('Rev.01').length).toBeGreaterThanOrEqual(1);

      // Fill Change Reason & Change Summary
      const reasonInput = screen.getByPlaceholderText(/ระบุวัตถุประสงค์และเหตุผลในการขอดำเนินการ/);
      fireEvent.change(reasonInput, { target: { value: 'ปรับปรุงกระบวนการผลิต (Process Change)' } });

      const changeSummary = screen.getByPlaceholderText(/ระบุข้อความ หัวข้อ หรือขั้นตอนที่ทำการแก้ไข/i);
      fireEvent.change(changeSummary, { target: { value: 'ปรับปรุงขั้นตอนการตรวจสอบคุณภาพก่อนบรรจุ' } });

      // Effective Date
      const dateInput = container.querySelector('input[type="date"]');
      fireEvent.change(dateInput, { target: { value: '2026-08-30' } });

      // File
      const fileInput = container.querySelector('input[type="file"]');
      const fakePdf = new File(['%PDF-1.4...'], 'sop_pd_01_rev01.pdf', { type: 'application/pdf' });
      fireEvent.change(fileInput, { target: { files: [fakePdf] } });

      // Submit
      const submitBtn = screen.getByRole('button', { name: /ส่งคำขอ Revision \(Submit DAR\)/i });
      fireEvent.click(submitBtn);

      // Confirm Modal
      await waitFor(() => {
        expect(screen.getByText(/ยืนยันการส่งคำร้องขอแก้ไขเอกสาร/i)).toBeInTheDocument();
        expect(screen.getAllByText('SOP-PD-01').length).toBeGreaterThan(0);
      });
    });
  });

  describe('2. DarObsoleteForm Harmonized Layout', () => {
    it('renders unified canvas with Section 1 header strip, Section 2 Target Doc, and 50/50 Section 3', () => {
      const { container } = renderWithRouter(<DarObsoleteForm />);

      // Section 1 Header Strip
      expect(screen.getByText(/ส่วนที่ 1: ข้อมูลผู้ร้องขอ/i)).toBeInTheDocument();
      expect(screen.getByText('ธนาวุฒิ สมควรกิจดำรง')).toBeInTheDocument();
      expect(screen.getByText('ขอยกเลิก (OBSOLETE)')).toBeInTheDocument();

      // Section 2: Target Document & Date
      expect(screen.getByText(/ส่วนที่ 2: เอกสารเป้าหมายและวันที่มีผลยกเลิก/i)).toBeInTheDocument();
      expect(screen.getByText(/-- เลือกเอกสารที่ต้องการยกเลิก --/i)).toBeInTheDocument();
      expect(container.querySelector('input[type="date"]')).toBeInTheDocument();

      // Section 3: 50/50 Grid
      expect(screen.getByText(/ส่วนที่ 3: เหตุผลและความจำเป็นในการยกเลิกและแผนการจัดการสำเนา/i)).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/อธิบายเหตุผลและผลกระทบของการยกเลิกเอกสารนี้/i)).toBeInTheDocument();
      expect(screen.getByText(/แผนการจัดการและเรียกคืนสำเนาเดิม/i)).toBeInTheDocument();
      expect(screen.getByText(/การรับทราบการยกเลิก/i)).toBeInTheDocument();

      // Ensure no standalone Section 4
      expect(screen.queryByText(/ส่วนที่ 4: กำหนดวันมีผลยกเลิก/i)).toBeNull();
    });

    it('enforces recall plan for documents with controlled copies and handles obsolete submission', async () => {
      const { container } = renderWithRouter(<DarObsoleteForm />);

      // Select SOP-PD-01 (which has 3 controlled copies)
      const docSelect = screen.getByDisplayValue('-- เลือกเอกสารที่ต้องการยกเลิก --');
      fireEvent.change(docSelect, { target: { value: 'doc-pd-01' } });

      // Notice controlled copy warning
      expect(screen.getAllByText(/3 ฉบับ/i).length).toBeGreaterThan(0);

      // Fill Reason & Detail
      const reasonInput = screen.getByPlaceholderText(/ระบุวัตถุประสงค์และเหตุผลในการขอดำเนินการ/);
      fireEvent.change(reasonInput, { target: { value: 'ยกเลิกกระบวนการ (Process Removed)' } });

      const detailInput = screen.getByPlaceholderText(/อธิบายเหตุผลและผลกระทบของการยกเลิกเอกสารนี้/i);
      fireEvent.change(detailInput, { target: { value: 'ยกเลิกสายการผลิต 1 เปลี่ยนเป็นระบบอัตโนมัติ' } });

      const recallPlan = screen.getByPlaceholderText(/ระบุวิธีการสื่อสารและระยะเวลาที่จะเรียกคืนเอกสารกลับมาทำลาย/i);
      fireEvent.change(recallPlan, { target: { value: 'แจ้งหัวหน้าแผนกส่งคืนสำเนา 3 ฉบับให้ DCC ภายใน 7 วัน' } });

      // Date
      const dateInput = container.querySelector('input[type="date"]');
      fireEvent.change(dateInput, { target: { value: '2026-08-30' } });

      // Submit
      const submitBtn = screen.getByRole('button', { name: /ส่งคำขอยกเลิก \(Submit Obsolete\)/i });
      expect(submitBtn.className).toContain('bg-rose-600');
      fireEvent.click(submitBtn);

      // Confirm Modal
      await waitFor(() => {
        expect(screen.getByText(/ยืนยันการส่งคำร้องขอยกเลิกเอกสาร/i)).toBeInTheDocument();
        expect(screen.getAllByText('SOP-PD-01').length).toBeGreaterThan(0);
      });
    });
  });
});
