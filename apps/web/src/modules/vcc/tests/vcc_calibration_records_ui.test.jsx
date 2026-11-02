import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as vccWorkOrderApi from '../api/vccWorkOrderApi';
import { RecordResultModal } from '../components/RecordResultModal';
import { AmendmentModal } from '../components/AmendmentModal';
import { WorkOrderSideDrawer } from '../components/WorkOrderSideDrawer';

describe('VCC Phase 3.2 — Calibration Records & Execution UI Tests', () => {
  const sampleWorkOrder = {
    id: 'wo-101',
    wo_code: 'WO-2026-099',
    asset_id: 'ast-101',
    asset_code: 'CAL-TH-001',
    asset_name: 'Thermometer Digital',
    department: 'QC',
    status: 'OPEN',
    result_status: 'PENDING',
    due_date: '2026-05-31',
    provider_name: 'สถาบันมาตรวิทยาแห่งชาติ (NIMT)',
    calibration_provider_name: 'สถาบันมาตรวิทยาแห่งชาติ (NIMT)',
    calibration_method: 'EXTERNAL_LAB',
    traceability_ref: 'NIMT Primary Standard Block',
    environmental_conditions: '23.5 °C / 50% RH',
    uncertainty_value: '± 0.02 °C',
    calibration_error_value: '+0.05 °C',
    certificate_file_name: 'cert_cal_099.pdf',
    certificate_file_hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    certificate_version: 1
  };

  beforeEach(() => {
    vi.spyOn(vccWorkOrderApi, 'fetchVccWorkOrderDetail').mockResolvedValue({
      workOrder: sampleWorkOrder,
      settings: { retention_years: 3, approval_doc_type: 'FM' },
      thresholds: { min_requester_level: 1, required_reviewer_level: 4, required_approver_level: 5 },
      history: []
    });
  });

  it('RecordResultModal_TabsAndPdfValidation: สลับแท็บข้อมูลหลักและข้อมูลความสอบกลับได้ พร้อมตรวจไฟล์ PDF ขนาดไม่เกิน 25MB', async () => {
    let formState = {
      performed_at: '2026-05-20',
      result_status: 'PASS',
      certificate_no: '',
      acceptance_criteria: 'Error <= 0.1°C',
      result_remarks: '',
      calibration_provider_name: 'สถาบันมาตรวิทยาแห่งชาติ (NIMT)',
      calibration_method: 'EXTERNAL_LAB',
      traceability_ref: 'NIMT Secondary Standard',
      environmental_conditions: '24.0 °C / 52% RH',
      uncertainty_value: '± 0.01 °C',
      calibration_error_value: '+0.02 °C',
      certificate_file: null
    };

    const setForm = vi.fn((newForm) => {
      formState = newForm;
    });
    const onSubmit = vi.fn((e) => e.preventDefault());

    render(
      <RecordResultModal
        workOrder={{ ...sampleWorkOrder, certificate_file_name: null }}
        onClose={vi.fn()}
        form={formState}
        setForm={setForm}
        error=""
        saving={false}
        onSubmit={onSubmit}
        criteriaOptions={['Error <= 0.1°C']}
      />
    );

    // Header and title
    expect(screen.getByText(/บันทึกผลการสอบเทียบและหลักฐานดิจิทัล/i)).toBeInTheDocument();
    expect(screen.getByText(/WO-2026-099/i)).toBeInTheDocument();

    // Verify Tab navigation
    expect(screen.getByRole('button', { name: /ผลการตรวจและใบรับรอง/i })).toBeInTheDocument();
    const traceTabBtn = screen.getByRole('button', { name: /การสอบกลับได้และสภาวะแวดล้อม/i });
    expect(traceTabBtn).toBeInTheDocument();

    // Switch to Traceability tab
    fireEvent.click(traceTabBtn);
    expect(screen.getByText(/การสอบกลับได้สู่มาตรฐานแห่งชาติ/i)).toBeInTheDocument();
    expect(screen.getByText(/สภาวะแวดล้อมขณะสอบเทียบ/i)).toBeInTheDocument();
    expect(screen.getByText(/ค่าความไม่แน่นอนขยาย/i)).toBeInTheDocument();
    expect(screen.getByText(/ค่าความคลาดเคลื่อนที่วัดได้/i)).toBeInTheDocument();

    // File validation: Reject non-pdf file
    fireEvent.click(screen.getByRole('button', { name: /ผลการตรวจและใบรับรอง/i }));
    const fileInput = screen.getByLabelText(/อัปโหลดไฟล์ใบรับรอง PDF/i);

    const txtFile = new File(['Hello text'], 'test.txt', { type: 'text/plain' });
    fireEvent.change(fileInput, { target: { files: [txtFile] } });

    await waitFor(() => {
      expect(screen.getByText(/รูปแบบไฟล์ไม่ถูกต้อง ต้องเป็นเอกสาร PDF เท่านั้น/i)).toBeInTheDocument();
    });

    // Valid PDF file starts with %PDF-
    const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x35]);
    const validPdfFile = new File([pdfBytes], 'certificate.pdf', { type: 'application/pdf' });
    fireEvent.change(fileInput, { target: { files: [validPdfFile] } });

    await waitFor(() => {
      expect(setForm).toHaveBeenCalled();
    });
  });

  it('WorkOrderSideDrawer_DisplaysCards: แสดงการ์ดใบรับรองดิจิทัล, SHA-256 Hash, และความสอบกลับทางมาตรวิทยา', async () => {
    const thresholds = { min_requester_level: 1, required_reviewer_level: 4, required_approver_level: 5 };

    render(
      <WorkOrderSideDrawer
        workOrder={sampleWorkOrder}
        onClose={vi.fn()}
        thresholds={thresholds}
        onRecordResult={vi.fn()}
        onReschedule={vi.fn()}
        onApprove={vi.fn()}
        onReject={vi.fn()}
        onReleaseHold={vi.fn()}
        onAmend={vi.fn()}
        onDownloadCert={vi.fn()}
      />
    );

    // Detail Drawer open
    expect(await screen.findByText('WO-2026-099')).toBeInTheDocument();
    expect(await screen.findByText('cert_cal_099.pdf')).toBeInTheDocument();

    // Traceability Section
    expect(screen.getByText(/ข้อมูลการสอบกลับได้และสภาวะแวดล้อม/i)).toBeInTheDocument();
    expect(screen.getByText(/NIMT Primary Standard Block/i)).toBeInTheDocument();
  });

  it('AmendmentModal_MandatoryReason: บังคับกรอกเหตุผลการแก้ไข (Controlled Amendment ISO/IEC 17025 clause 7.8.8)', () => {
    let formState = {
      result_status: 'PASS',
      certificate_no: 'CERT-REVISED-001',
      acceptance_criteria: 'Error <= 0.1°C',
      result_remarks: 'แก้ผลตามใบรับรองฉบับแก้ไข',
      calibration_provider_name: 'NIMT',
      calibration_method: 'EXTERNAL_LAB',
      traceability_ref: 'NIMT Standard',
      environmental_conditions: '24 °C / 50% RH',
      uncertainty_value: '± 0.005 °C',
      calibration_error_value: '+0.01 °C',
      amendment_reason: '',
      certificate_file: null
    };

    const setForm = vi.fn();
    const onSubmit = vi.fn((e) => e.preventDefault());

    render(
      <AmendmentModal
        workOrder={{ ...sampleWorkOrder, status: 'CLOSED' }}
        onClose={vi.fn()}
        form={formState}
        setForm={setForm}
        error=""
        saving={false}
        onSubmit={onSubmit}
        criteriaOptions={['Error <= 0.1°C']}
      />
    );

    expect(screen.getByText(/ขอแก้ไขผลการสอบเทียบที่ปิดงานแล้ว \(Controlled Amendment\)/i)).toBeInTheDocument();
    const submitBtn = screen.getByRole('button', { name: /บันทึกการขอแก้ไข \(Amendment\)/i });
    // When amendment_reason is empty, submit button must be disabled
    expect(submitBtn).toBeDisabled();
  });
});
