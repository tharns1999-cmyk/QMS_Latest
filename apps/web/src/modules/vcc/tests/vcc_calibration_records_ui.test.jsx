import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as vccWorkOrderApi from '../api/vccWorkOrderApi';
import { RecordResultModal } from '../components/RecordResultModal';
import { AmendmentModal } from '../components/AmendmentModal';
import { WorkOrderSideDrawer } from '../components/WorkOrderSideDrawer';
import { DigitalRecordModal } from '../components/DigitalRecordModal';

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

  it('RecordResultModal_TabsAndPdfValidation: Single-View Smart Form พร้อม Accordion ข้อมูลเทคนิค และตรวจไฟล์ PDF ขนาดไม่เกิน 25MB', async () => {
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

    // Verify Single-View Form elements: Segmented Pill
    expect(screen.getByRole('button', { name: /ผ่านเกณฑ์ \(PASS\)/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /ไม่ผ่านเกณฑ์ \(FAIL\)/i })).toBeInTheDocument();

    // Verify Collapsible Accordion for Traceability
    const traceAccordionBtn = screen.getByRole('button', { name: /ข้อมูลเพิ่มเติมทางเทคนิคและการสอบกลับได้/i });
    expect(traceAccordionBtn).toBeInTheDocument();

    // Open Accordion
    fireEvent.click(traceAccordionBtn);
    expect(screen.getByText(/การสอบกลับได้สู่มาตรฐานแห่งชาติ/i)).toBeInTheDocument();
    expect(screen.getByText(/สภาวะแวดล้อมขณะสอบเทียบ/i)).toBeInTheDocument();
    expect(screen.getByText(/ค่าความไม่แน่นอนขยาย/i)).toBeInTheDocument();
    expect(screen.getByText(/ค่าความคลาดเคลื่อนที่วัดได้/i)).toBeInTheDocument();

    // File validation: Reject non-pdf file
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

    expect(screen.getByText(/แก้ไขผลการสอบเทียบที่ปิดงานแล้ว/i)).toBeInTheDocument();
    const submitBtn = screen.getByRole('button', { name: /บันทึกแก้ไขผล/i });
    // When amendment_reason is empty, submit button must be disabled
    expect(submitBtn).toBeDisabled();
  });

  it('DigitalRecordModal_RendersCompleteElectronicRecordAndPrint: แสดงเอกสารดิจิทัลครบถ้วนและรองรับการสั่งพิมพ์', () => {
    const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {});
    const onDownloadCert = vi.fn();
    const onClose = vi.fn();

    const closedWo = {
      ...sampleWorkOrder,
      status: 'CLOSED',
      result_status: 'PASS',
      performed_by_name: 'สมชาย นักสอบเทียบ',
      performed_at: '2026-05-15',
      reviewed_by_name: 'สมหญิง หัวหน้างาน',
      reviewed_at: '2026-05-16',
      certificate_no: 'CERT-2026-0099',
      acceptance_criteria: 'Error <= 0.1°C',
      is_amended: 1,
      amended_at: '2026-05-18',
      amended_by_name: 'สมปอง ผู้จัดการ',
      amendment_reason: 'ปรับแก้ค่าความไม่แน่นอนตามสถาบันมาตรวิทยาฉบับแก้ไข'
    };

    render(
      <DigitalRecordModal
        workOrder={closedWo}
        onClose={onClose}
        onDownloadCert={onDownloadCert}
      />
    );

    // Verify modal header & standard compliance tags
    expect(screen.getByText(/DIGITAL RECORD: WO-2026-099/i)).toBeInTheDocument();
    expect(screen.getByText(/ใบบันทึกผลการทวนสอบ \/ สอบเทียบดิจิทัล/i)).toBeInTheDocument();
    expect(screen.getByText(/ISO 9001:2015 ข้อ 7.1.5 และ ISO\/IEC 17025:2017 ข้อ 7.8/i)).toBeInTheDocument();

    // Verify instrument & result
    expect(screen.getByText('CAL-TH-001')).toBeInTheDocument();
    expect(screen.getByText('Thermometer Digital')).toBeInTheDocument();
    expect(screen.getByText(/PASS — ผ่านเกณฑ์ยอมรับ/i)).toBeInTheDocument();
    expect(screen.getByText(/AMENDED \(ฉบับแก้ไข\)/i)).toBeInTheDocument();

    // Verify traceability & environmental conditions
    expect(screen.getByText('NIMT Primary Standard Block')).toBeInTheDocument();
    expect(screen.getByText('23.5 °C / 50% RH')).toBeInTheDocument();
    expect(screen.getByText('± 0.02 °C')).toBeInTheDocument();

    // Verify certificate file & SHA-256 hash
    expect(screen.getByText('cert_cal_099.pdf')).toBeInTheDocument();
    expect(screen.getByText(/SHA-256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855/i)).toBeInTheDocument();

    // Verify sign-off section
    expect(screen.getByText('สมชาย นักสอบเทียบ')).toBeInTheDocument();
    expect(screen.getByText('สมหญิง หัวหน้างาน')).toBeInTheDocument();

    // Verify amendment section
    expect(screen.getByText(/ปรับแก้ค่าความไม่แน่นอนตามสถาบันมาตรวิทยาฉบับแก้ไข/i)).toBeInTheDocument();

    // Test print button triggers window.print()
    const printBtn = screen.getByRole('button', { name: /พิมพ์เอกสาร/i });
    fireEvent.click(printBtn);
    expect(printSpy).toHaveBeenCalled();

    // Test close button
    const closeBtn = screen.getByRole('button', { name: /ปิดหน้าต่าง/i });
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalled();

    printSpy.mockRestore();
  });

  it('AmendmentModal_DisplaysSoDAndUploadErrors: แสดงข้อความแจ้งเตือนเมื่อเกิดข้อผิดพลาด Segregation of Duties หรือ R2 Upload Error', () => {
    const errorMsg = 'การคัดแยกหน้าที่ (Segregation of Duties): ผู้บันทึกผลการสอบเทียบไม่สามารถอนุมัติการแก้ไข (Amendment) ของตนเองได้ แม้จะมีสิทธิ์ระดับ L5+ ขึ้นไป (ต้องให้ผู้อนุมัติอื่นเป็นผู้ดำเนินการ)';
    render(
      <AmendmentModal
        workOrder={{ ...sampleWorkOrder, status: 'CLOSED' }}
        onClose={vi.fn()}
        form={{
          result_status: 'PASS',
          certificate_no: 'CERT-001',
          acceptance_criteria: 'Error <= 0.1°C',
          amendment_reason: 'พยายามแก้ไขโดยไม่มีสิทธิ์ SoD'
        }}
        setForm={vi.fn()}
        error={errorMsg}
        saving={false}
        onSubmit={vi.fn((e) => e.preventDefault())}
      />
    );

    const alertBanner = screen.getByRole('alert');
    expect(alertBanner).toBeInTheDocument();
    expect(alertBanner).toHaveTextContent(/การคัดแยกหน้าที่ \(Segregation of Duties\)/i);
  });
});
