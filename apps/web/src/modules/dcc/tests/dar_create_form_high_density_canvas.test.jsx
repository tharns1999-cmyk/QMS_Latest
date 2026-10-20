import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import DarNewForm from '../pages/DarWorkflow/DarNewForm';
import DarCreateForm from '../pages/DarWorkflow/DarCreateForm';
import useStore from '../../../store/useStore';
import toast from 'react-hot-toast';

vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn()
  }
}));

const renderWithRouter = (ui) => render(<BrowserRouter>{ui}</BrowserRouter>);

describe('High-Density Unified DAR Create Form Canvas Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useStore.setState({
      currentUser: {
        id: 'u1',
        name: 'ธนาวุฒิ สมควรกิจดำรง',
        department: 'MKT',
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
        { id: 'u1', name: 'ธนาวุฒิ สมควรกิจดำรง', department: 'MKT', position_level: 4, role: 'STAFF' },
        { id: 'u2', name: 'กัลยาณี พลไกร', department: 'MKT', position_level: 5, role: 'MANAGER' },
        { id: 'u3', name: 'วิชัย ผู้บริหาร', department: 'MKT', position_level: 6, role: 'DIRECTOR' }
      ],
      reviewUsers: [
        { id: 'u2', name: 'กัลยาณี พลไกร', department: 'MKT', position_level: 5, role: 'MANAGER' }
      ],
      approveUsers: [
        { id: 'u3', name: 'วิชัย ผู้บริหาร', department: 'MKT', position_level: 6, role: 'DIRECTOR' }
      ],
      dars: [],
      documents: [],
      simulatedDate: '2026-08-26T00:00:00.000Z'
    });
  });

  it('1. Renders DarCreateForm and DarNewForm equivalently (aliased component export)', () => {
    expect(DarCreateForm).toBeDefined();
    expect(DarCreateForm).toEqual(DarNewForm);
  });

  it('2. Renders compact metadata strip with requester, dept, request date, and draft badge', () => {
    renderWithRouter(<DarNewForm />);

    expect(screen.getByText('ธนาวุฒิ สมควรกิจดำรง')).toBeInTheDocument();
    expect(screen.getAllByText('MKT').length).toBeGreaterThan(0);
    expect(screen.getByText('ร่างคำร้อง DAR ใหม่')).toBeInTheDocument();
  });

  it('3. Renders 4-column document identification grid with Effective Date integrated', async () => {
    const { container } = renderWithRouter(<DarNewForm />);

    // Check selects & inputs in Section 2
    const docTypeSelect = screen.getAllByRole('combobox')[0];
    expect(docTypeSelect).toBeInTheDocument();

    const titleInput = screen.getByPlaceholderText(/ระบุชื่อเอกสารภาษาไทย หรืออังกฤษ/i);
    expect(titleInput).toBeInTheDocument();

    const dateInput = container.querySelector('input[type="date"]');
    expect(dateInput).toBeInTheDocument();

    // Select SOP
    fireEvent.change(docTypeSelect, { target: { value: 'SOP' } });

    // Generated Code should show SOP-MKT-01
    expect(screen.getByText('SOP-MKT-01')).toBeInTheDocument();
    expect(screen.getByText('Rev. 00')).toBeInTheDocument();
  });

  it('4. Renders 50/50 balanced symmetrical layout in Section 3 and eliminates Section 5', () => {
    renderWithRouter(<DarNewForm />);

    // Textareas on the left (flex-1 and min-h-[125px])
    const descInput = screen.getByPlaceholderText(/ระบุขอบเขตและเนื้อหาสำคัญของเอกสารฉบับนี้/i);
    const reasonInput = screen.getByPlaceholderText(/ระบุเหตุผลความจำเป็นในการจัดทำ หรือการอ้างอิงข้อกำหนด ISO/i);
    expect(descInput).toBeInTheDocument();
    expect(reasonInput).toBeInTheDocument();
    expect(descInput.className).toContain('min-h-[125px]');
    expect(reasonInput.className).toContain('min-h-[125px]');

    // Right column elements: file upload & standards
    expect(screen.getByText(/ระบบมาตรฐานที่เกี่ยวข้อง/i)).toBeInTheDocument();
    expect(screen.getByText(/อัปโหลดไฟล์เอกสาร \(PDF เท่านั้น\)/i)).toBeInTheDocument();
    expect(screen.getByText(/การรับทราบเอกสาร/i)).toBeInTheDocument();

    // Ensure standalone Section 5 is completely eliminated
    expect(screen.queryByText(/ส่วนที่ 5: กำหนดวันมีผลบังคับใช้/i)).toBeNull();
  });

  it('5. Enforces form validation and file type checking', async () => {
    renderWithRouter(<DarNewForm />);

    const submitBtn = screen.getByRole('button', { name: /ส่งคำขอ \(Submit DAR\)/i });
    fireEvent.click(submitBtn);

    expect(toast.error).toHaveBeenCalledWith('กรุณากรอกข้อมูลให้ครบถ้วนและถูกต้อง');
    expect(screen.getByText('กรุณาเลือกชนิดเอกสาร')).toBeInTheDocument();
    expect(screen.getByText('กรุณาระบุชื่อเอกสาร')).toBeInTheDocument();
    expect(screen.getByText('กรุณาระบุรายละเอียดคำร้องขอ')).toBeInTheDocument();
    expect(screen.getByText('กรุณาระบุเหตุผลที่ร้องขอ')).toBeInTheDocument();
    expect(screen.getByText('กรุณาระบุวันที่มีผลบังคับใช้')).toBeInTheDocument();
    expect(screen.getByText('กรุณาแนบไฟล์ PDF')).toBeInTheDocument();
  });

  it('6. Handles valid submission and shows ActionConfirmModal', async () => {
    const { container } = renderWithRouter(<DarNewForm />);

    // Fill form
    const docTypeSelect = screen.getAllByRole('combobox')[0];
    fireEvent.change(docTypeSelect, { target: { value: 'SOP' } });

    const titleInput = screen.getByPlaceholderText(/ระบุชื่อเอกสารภาษาไทย หรืออังกฤษ/i);
    fireEvent.change(titleInput, { target: { value: 'ระเบียบปฏิบัติการตลาดดิจิทัล' } });

    const descInput = screen.getByPlaceholderText(/ระบุขอบเขตและเนื้อหาสำคัญของเอกสารฉบับนี้/i);
    fireEvent.change(descInput, { target: { value: 'กำหนดแนวทางการทำการตลาดออนไลน์และโฆษณา' } });

    const reasonInput = screen.getByPlaceholderText(/ระบุเหตุผลความจำเป็นในการจัดทำ หรือการอ้างอิงข้อกำหนด ISO/i);
    fireEvent.change(reasonInput, { target: { value: 'สอดคล้องกับกลยุทธ์ประจำปี 2026' } });

    const dateInput = container.querySelector('input[type="date"]');
    fireEvent.change(dateInput, { target: { value: '2026-08-30' } });

    const fileInput = container.querySelector('input[type="file"]');
    const fakePdf = new File(['%PDF-1.4...'], 'marketing_sop.pdf', { type: 'application/pdf' });
    fireEvent.change(fileInput, { target: { files: [fakePdf] } });

    // Submit
    const submitBtn = screen.getByRole('button', { name: /ส่งคำขอ \(Submit DAR\)/i });
    fireEvent.click(submitBtn);

    // Confirmation Modal should appear
    await waitFor(() => {
      expect(screen.getByText(/ยืนยันการส่งคำร้องขอขึ้นทะเบียนเอกสารใหม่/i)).toBeInTheDocument();
      expect(screen.getByText('ระเบียบปฏิบัติการตลาดดิจิทัล')).toBeInTheDocument();
    });
  });
});
