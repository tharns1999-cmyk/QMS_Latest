import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  saveVccPdfFile,
  getVccPdfBlobUrl,
  getVccPdfBlob,
  deleteVccPdfFile,
  generateFallbackPdfBlob
} from '../utils/vccFileStorage';
import { RecordResultModal } from '../components/RecordResultModal';
import { DigitalRecordModal } from '../components/DigitalRecordModal';
import { WorkOrderTable } from '../components/WorkOrderTable';
import { WorkOrderSideDrawer } from '../components/WorkOrderSideDrawer';
import { AnnualPlanSideInspector } from '../components/AnnualPlanSideInspector';
import { AssetDetailDrawer } from '../components/AssetDetailDrawer';
import * as vccWorkOrderApi from '../api/vccWorkOrderApi';

describe('VCC Digital Record Inspector & PDF Preview Engine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    if (!URL.createObjectURL) {
      URL.createObjectURL = vi.fn(() => `blob:mock-url-${Math.random().toString(36).substring(7)}`);
    } else {
      vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:mock-url-${Math.random().toString(36).substring(7)}`);
    }
    if (!URL.revokeObjectURL) {
      URL.revokeObjectURL = vi.fn();
    } else {
      vi.spyOn(URL, 'revokeObjectURL').mockImplementation(vi.fn());
    }
    window.open = vi.fn();
  });

  describe('Part 1: vccFileStorage - Real PDF Storage & Web Crypto Engine', () => {
    it('rejects files exceeding 25 MB quota limit', async () => {
      const largeFile = new File([new Uint8Array(26 * 1024 * 1024)], 'too-large.pdf', { type: 'application/pdf' });
      await expect(saveVccPdfFile('key-oversized', largeFile)).rejects.toThrow(/25 MB/i);
    });

    it('rejects files without valid PDF magic bytes (%PDF-)', async () => {
      const textFile = new File(['Hello, I am a plain text file pretending to be PDF'], 'fake.pdf', { type: 'application/pdf' });
      await expect(saveVccPdfFile('key-fake', textFile)).rejects.toThrow(/รูปแบบไฟล์ไม่ถูกต้อง/i);
    });

    it('successfully validates magic bytes, computes SHA-256, and saves PDF blob', async () => {
      // Valid PDF signature %PDF-1.4 followed by dummy bytes
      const validPdfHeader = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2D, 0x31, 0x2E, 0x34, 0x0A, 0x25, 0xC4, 0xE5, 0xF2, 0xE5]);
      const validPdfFile = new File([validPdfHeader], 'genuine_certificate.pdf', { type: 'application/pdf' });

      const result = await saveVccPdfFile('key-genuine-001', validPdfFile);
      expect(result.fileKey).toBe('key-genuine-001');
      expect(result.fileName).toBe('genuine_certificate.pdf');
      expect(result.fileSize).toBe(validPdfHeader.byteLength);
      expect(result.mimeType).toBe('application/pdf');
      expect(result.sha256).toBeDefined();
      expect(result.sha256.length).toBe(64); // SHA-256 hex string

      // Retrieve blob URL
      const blobUrl = await getVccPdfBlobUrl('key-genuine-001');
      expect(blobUrl).toContain('blob:');

      // Direct blob access
      const blob = await getVccPdfBlob('key-genuine-001');
      expect(blob).toBeTruthy();
      expect(blob.type).toBe('application/pdf');

      // Delete file
      await deleteVccPdfFile('key-genuine-001');
      const blobAfterDelete = await getVccPdfBlob('key-genuine-001');
      expect(blobAfterDelete).toBeNull();
    });

    it('accepts raw ArrayBuffer and Uint8Array without error and computes valid SHA-256', async () => {
      const validPdfHeader = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2D, 0x31, 0x2E, 0x34, 0x0A, 0x25, 0xC4, 0xE5, 0xF2, 0xE5]);
      const resBuffer = await saveVccPdfFile('key-arraybuffer', validPdfHeader.buffer);
      expect(resBuffer.fileKey).toBe('key-arraybuffer');
      expect(resBuffer.fileSize).toBe(validPdfHeader.byteLength);
      expect(resBuffer.sha256).toBeDefined();

      const resView = await saveVccPdfFile('key-uint8array', validPdfHeader);
      expect(resView.fileKey).toBe('key-uint8array');
      expect(resView.fileSize).toBe(validPdfHeader.byteLength);
      expect(resView.sha256).toBe(resBuffer.sha256);
    });

    it('normalizes MIME type to application/pdf when uploaded file has empty or generic octet-stream MIME type', async () => {
      const validPdfHeader = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2D, 0x31, 0x2E, 0x34, 0x0A, 0x25, 0xC4, 0xE5, 0xF2, 0xE5]);
      const rawOctetFile = new File([validPdfHeader], 'cert_raw.pdf', { type: '' });
      const res = await saveVccPdfFile('key-octet-mime', rawOctetFile);
      expect(res.mimeType).toBe('application/pdf');

      const retrievedBlob = await getVccPdfBlob('key-octet-mime');
      expect(retrievedBlob).toBeTruthy();
      expect(retrievedBlob.type).toBe('application/pdf');
    });

    it('generates a full-featured authentic calibration certificate PDF (size > 2000 bytes) with Thai seed data without WinAnsi errors', async () => {
      const thaiSeedRecord = {
        wo_code: 'WO-2025-088',
        asset_code: 'ST002',
        asset_name: '[ข้อมูลทดสอบ] เทอร์โมมิเตอร์มาตรฐาน ST002',
        certificate_no: 'CERT-NIMT-2025-088',
        result_status: 'PASS',
        actual_measurement: '0.005 C error (0.0 C -> 0.005 C)',
        acceptance_criteria: '± 0.01 C',
        provider_name: 'สถาบันมาตรวิทยาแห่งชาติ (NIMT)',
        department_name_th: 'ฝ่ายควบคุมคุณภาพ (QC)',
        performed_at: '2025-11-20'
      };

      const fallbackBlob = await generateFallbackPdfBlob(thaiSeedRecord);
      expect(fallbackBlob).toBeInstanceOf(Blob);
      // Valid multi-section metrology document with tables and seal box is ~2800+ bytes, NOT the 400-byte emergency stub
      expect(fallbackBlob.size).toBeGreaterThan(2000);

      const arrayBuffer = await fallbackBlob.arrayBuffer();
      const header = new TextDecoder().decode(new Uint8Array(arrayBuffer.slice(0, 5)));
      expect(header).toBe('%PDF-');

      // getVccPdfBlobUrl with fallback
      const generatedUrl = await getVccPdfBlobUrl('seed-st002-test-key', thaiSeedRecord);
      expect(generatedUrl).toBeTruthy();
    });

    it('generates a valid fallback PDF for Seed Data (ST002) with correct calibration record content', async () => {
      const fallbackRecord = {
        wo_code: 'WO-2025-088',
        asset_code: 'ST002',
        asset_name: 'Weighing Scale 0.01g',
        certificate_no: 'CERT-NIMT-2025-088',
        result_status: 'PASS',
        actual_measurement: '0.005 g error',
        acceptance_criteria: '± 0.01 g',
        provider_name: 'สถาบันมาตรวิทยาแห่งชาติ (NIMT)',
        performed_at: '2025-11-20'
      };

      const fallbackBlob = await generateFallbackPdfBlob(fallbackRecord);
      expect(fallbackBlob).toBeInstanceOf(Blob);
      expect(fallbackBlob.size).toBeGreaterThan(2000);

      const arrayBuffer = await fallbackBlob.arrayBuffer();
      const header = new TextDecoder().decode(new Uint8Array(arrayBuffer.slice(0, 5)));
      expect(header).toBe('%PDF-');

      // getVccPdfBlobUrl with fallback
      const generatedUrl = await getVccPdfBlobUrl('non-existent-seed-key', fallbackRecord);
      expect(generatedUrl).toBeTruthy();
    });
  });

  describe('Part 2: RecordResultModal - Real PDF Attachment & Instant Preview', () => {
    it('allows attaching real PDF, displays metadata + SHA-256, provides instant preview and remove button', async () => {
      let formState = {
        performed_at: '2026-11-12',
        result_status: 'PASS',
        actual_measurement: '0.02 mm',
        acceptance_criteria: '± 0.05 mm',
        result_remarks: 'Normal wear, calibrated fine',
        certificate_no: 'CERT-2026-X',
        certificate_file: null,
        certificate_file_name: null,
        certificate_file_size: null,
        certificate_file_hash: null,
        certificate_file_key: null
      };

      const setForm = vi.fn((updater) => {
        if (typeof updater === 'function') {
          formState = updater(formState);
        } else {
          formState = updater;
        }
      });

      const { rerender } = render(
        <RecordResultModal
          workOrder={{
            id: 'wo-mock-1',
            wo_code: 'WO-2026-M01',
            asset_code: 'CAL-01',
            asset_name: 'Vernier Caliper',
            calibration_method: 'EXTERNAL_LAB',
            provider_name: 'External Calibration Center'
          }}
          onClose={vi.fn()}
          form={formState}
          setForm={setForm}
          onSubmit={vi.fn((e) => e.preventDefault())}
        />
      );

      // Verify drag and drop prompt exists
      expect(screen.getByText(/ลากไฟล์ PDF มาวางที่นี่/i)).toBeInTheDocument();

      // Simulate valid PDF file drop / selection
      const validPdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2D, 0x31, 0x2E, 0x35, 0x0A, 0x25, 0xC4, 0xE5]);
      const mockPdfFile = new File([validPdfBytes], 'test_lab_certificate.pdf', { type: 'application/pdf' });

      const fileInput = screen.getByLabelText(/อัปโหลดไฟล์ใบรับรอง PDF/i);
      await fireEvent.change(fileInput, { target: { files: [mockPdfFile] } });

      await waitFor(() => {
        expect(setForm).toHaveBeenCalled();
      });

      // Update props with the updated form state
      rerender(
        <RecordResultModal
          workOrder={{
            id: 'wo-mock-1',
            wo_code: 'WO-2026-M01',
            asset_code: 'CAL-01',
            asset_name: 'Vernier Caliper',
            calibration_method: 'EXTERNAL_LAB',
            provider_name: 'External Calibration Center'
          }}
          onClose={vi.fn()}
          form={formState}
          setForm={setForm}
          onSubmit={vi.fn((e) => e.preventDefault())}
        />
      );

      // File info card should now display file name and verification status
      await waitFor(() => {
        expect(screen.getByText('test_lab_certificate.pdf')).toBeInTheDocument();
      });
      expect(screen.getByText(/ตรวจสอบไฟล์ PDF สมบูรณ์พร้อมบันทึก/i)).toBeInTheDocument();
      // Ensure SHA-256 is kept internally in form state
      expect(formState.cert_sha256_hash.length).toBe(64);

      // Check preview button [ 👁️ ดูไฟล์ตัวอย่าง ]
      const previewBtn = screen.getByRole('button', { name: /ดูไฟล์ตัวอย่าง/i });
      expect(previewBtn).toBeInTheDocument();
      fireEvent.click(previewBtn);
      expect(window.open).toHaveBeenCalled();

      // Check change file button [ 🗑️ เปลี่ยนไฟล์ ]
      const changeBtn = screen.getByRole('button', { name: /เปลี่ยนไฟล์/i });
      expect(changeBtn).toBeInTheDocument();
      fireEvent.click(changeBtn);
      expect(setForm).toHaveBeenCalled();
    });
  });

  describe('Part 3: DigitalRecordModal - Desktop Split-View & Embedded PDF Viewer', () => {
    const sampleRecord = {
      id: 'wo-closed-01',
      wo_code: 'WO-2026-050',
      asset_code: 'ST002',
      asset_name: 'Analytical Balance 0.0001g',
      department: 'QC',
      status: 'CLOSED',
      result_status: 'PASS',
      performed_at: '2026-10-15',
      actual_measurement: '0.0002 g',
      acceptance_criteria: '± 0.0005 g',
      result_remarks: 'All 5 weighing points within tolerance',
      calibration_type: 'EXTERNAL_CALIBRATION',
      calibration_method: 'EXTERNAL_LAB',
      provider_name: 'National Metrology Institute',
      certificate_no: 'CERT-NIMT-2026-050',
      certificate_issue_date: '2026-10-16',
      certificate_expiry_date: '2027-10-15',
      traceability_ref: 'NIMT Standard E2 Weight Set',
      environmental_conditions: '20.0 °C, 50% RH',
      uncertainty_value: '± 0.00008 g',
      calibration_error_value: '+0.0001 g',
      certificate_file_name: 'analytical_cert_2026.pdf',
      certificate_file_hash: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
      reviewed_by_name: 'QC Manager Jane',
      reviewed_at: '2026-10-16T09:00:00Z',
      approved_by_name: 'QMR John',
      approved_at: '2026-10-16T11:00:00Z'
    };

    it('renders Desktop Split-View with record details on left and embedded PDF iframe on right', async () => {
      const onEditResult = vi.fn();
      const onClose = vi.fn();

      render(
        <DigitalRecordModal
          isOpen={true}
          onClose={onClose}
          record={sampleRecord}
          onEditResult={onEditResult}
        />
      );

      // Verify Header
      expect(screen.getByText(/ใบบันทึกผลการทวนสอบ \/ สอบเทียบดิจิทัล/i)).toBeInTheDocument();
      expect(screen.getAllByText(/WO-2026-050/i).length).toBeGreaterThan(0);

      // Verify Left Column: Status badge, type, actual measurement
      expect(screen.getByText(/✓ ผ่านเกณฑ์ \(PASS\)/i)).toBeInTheDocument();
      expect(screen.getByText(/0.0002 g/i)).toBeInTheDocument();
      expect(screen.getByText(/CERT-NIMT-2026-050/i)).toBeInTheDocument();
      expect(screen.getByText(/NIMT Standard E2 Weight Set/i)).toBeInTheDocument();

      // Verify Right Column: Embedded PDF iframe
      await waitFor(() => {
        const iframe = screen.getByTestId('pdf-preview-iframe');
        expect(iframe).toBeInTheDocument();
      });

      // Verify PDF buttons
      expect(screen.getByRole('button', { name: /เปิดในแท็บใหม่/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /ดาวน์โหลด PDF/i })).toBeInTheDocument();

      // Verify Footer action: Edit result / replace PDF
      const editBtn = screen.getByRole('button', { name: /แก้ไขข้อมูลผล \/ เปลี่ยนไฟล์ PDF/i });
      expect(editBtn).toBeInTheDocument();
      fireEvent.click(editBtn);
      expect(onEditResult).toHaveBeenCalledWith(sampleRecord);

      // Verify Footer close button
      const closeBtn = screen.getByRole('button', { name: /ปิดหน้าต่าง/i });
      expect(closeBtn).toBeInTheDocument();
      expect(closeBtn.className).toContain('whitespace-nowrap shrink-0');
      fireEvent.click(closeBtn);
      expect(onClose).toHaveBeenCalled();
    });

    it('renders Digital Verification Summary Card when record is internal verification without PDF', () => {
      const internalRecord = {
        id: 'wo-internal-01',
        wo_code: 'WO-2026-INT',
        asset_code: 'VN001',
        asset_name: 'Standard Caliper',
        calibration_type: 'INTERNAL_VERIFICATION',
        status: 'CLOSED',
        result_status: 'PASS',
        performed_at: '2026-11-01',
        actual_measurement: '25.00 mm',
        acceptance_criteria: '± 0.02 mm',
        master_reference: 'Gauge Block Set M-01',
        internal_record_ref: 'VR-2026-11-01',
        certificate_file_name: null
      };

      render(
        <DigitalRecordModal
          isOpen={true}
          onClose={vi.fn()}
          record={internalRecord}
        />
      );

      // Left column shows internal verification details
      expect(screen.getByText(/🏠 ทวนสอบภายใน/i)).toBeInTheDocument();
      expect(screen.getByText(/Gauge Block Set M-01/i)).toBeInTheDocument();
      expect(screen.getByText(/VR-2026-11-01/i)).toBeInTheDocument();

      // Right column shows Digital Verification Summary Card
      expect(screen.getByText(/สรุปผลการทวนสอบดิจิทัลภายในระบบ/i)).toBeInTheDocument();
      expect(screen.getByText(/บันทึกการทวนสอบนี้ได้รับการรับรองผ่านระบบดิจิทัล/i)).toBeInTheDocument();
    });

    it('renders single signer card "ผู้บันทึกผลและปิดใบสั่งงาน" and removes duplicate reviewer card when performed_by closed directly', () => {
      const singleSignerRecord = {
        id: 'wo-single-signer',
        wo_code: 'WO-2026-SINGLE',
        asset_code: 'VN002',
        asset_name: 'Vernier Caliper',
        department: 'QC',
        department_name_th: 'ฝ่ายควบคุมคุณภาพ (QC)',
        status: 'CLOSED',
        result_status: 'PASS',
        performed_at: '2026-11-12T10:00:00Z',
        performed_by: 'U-BEAM',
        performed_by_name: 'บีม (QC Officer)',
        recorded_by: 'U-BEAM',
        recorded_by_name: 'บีม (QC Officer)',
        closed_by: 'U-BEAM',
        closed_by_name: 'บีม (QC Officer)',
        // Even if old bug set reviewed_by to the same person:
        reviewed_by: 'U-BEAM',
        reviewed_by_name: 'บีม (QC Officer)',
        verified_by: null,
        certificate_file_name: null,
        calibration_type: 'INTERNAL_VERIFICATION'
      };

      render(
        <DigitalRecordModal
          isOpen={true}
          onClose={vi.fn()}
          record={singleSignerRecord}
        />
      );

      // Verify single card exists
      const singleCard = screen.getByTestId('vcc-single-signer-card');
      expect(singleCard).toBeInTheDocument();
      expect(singleCard.textContent).toContain('ผู้บันทึกผลและปิดใบสั่งงาน (Recorded & Closed By)');
      expect(singleCard.textContent).toContain('บีม (QC Officer)');
      expect(singleCard.textContent).toContain('ฝ่ายควบคุมคุณภาพ (QC)');

      // Verify duplicate reviewer card is NOT rendered
      expect(screen.queryByText(/ผู้ตรวจรับและปิดใบสั่งงาน \(Reviewer \/ Approver\)/i)).not.toBeInTheDocument();
    });

    it('supports backward compatibility by displaying reviewer card when verified_by has value and is distinct from recorded_by', () => {
      const dualSignerRecord = {
        id: 'wo-dual-signer',
        wo_code: 'WO-2026-DUAL',
        asset_code: 'VN003',
        asset_name: 'Micrometer',
        department_name_th: 'ฝ่ายควบคุมคุณภาพ (QC)',
        status: 'CLOSED',
        result_status: 'PASS',
        performed_at: '2026-10-10',
        performed_by: 'U-PERF',
        performed_by_name: 'บีม (QC Officer)',
        recorded_by: 'U-PERF',
        recorded_by_name: 'บีม (QC Officer)',
        verified_by: 'U-REV',
        verified_by_name: 'หัวหน้าสมชาย (QC Supervisor)',
        reviewed_by: 'U-REV',
        reviewed_by_name: 'หัวหน้าสมชาย (QC Supervisor)',
        reviewed_at: '2026-10-11',
        certificate_file_name: null,
        calibration_type: 'INTERNAL_VERIFICATION'
      };

      render(
        <DigitalRecordModal
          isOpen={true}
          onClose={vi.fn()}
          record={dualSignerRecord}
        />
      );

      // Both boxes must be present
      expect(screen.getByText(/ผู้บันทึกผลการสอบเทียบ \(Recorded By\)/i)).toBeInTheDocument();
      expect(screen.getByText(/ผู้ตรวจรับและปิดใบสั่งงาน \(Reviewer \/ Approver\)/i)).toBeInTheDocument();
      expect(screen.getAllByText('บีม (QC Officer)').length).toBeGreaterThan(0);
      expect(screen.getAllByText('หัวหน้าสมชาย (QC Supervisor)').length).toBeGreaterThan(0);
      expect(screen.queryByTestId('vcc-single-signer-card')).not.toBeInTheDocument();
    });

    it('renders backup buttons [ ↗ เปิดไฟล์ PDF ในแท็บใหม่ ] and [ ⬇ ดาวน์โหลด ] and handles click interactions', async () => {
      const onDownloadCert = vi.fn();
      render(
        <DigitalRecordModal
          isOpen={true}
          onClose={vi.fn()}
          record={sampleRecord}
          onDownloadCert={onDownloadCert}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('pdf-preview-iframe')).toBeInTheDocument();
      });

      // Verify backup buttons overlaying the iframe
      const openBtn = screen.getByRole('button', { name: /เปิดไฟล์ PDF ในแท็บใหม่/i });
      const dlBtn = screen.getByRole('button', { name: /^ดาวน์โหลด$/i });
      expect(openBtn).toBeInTheDocument();
      expect(dlBtn).toBeInTheDocument();

      // Click open in new tab
      fireEvent.click(openBtn);
      expect(window.open).toHaveBeenCalledWith(expect.stringContaining('blob:'), '_blank', 'noopener,noreferrer');

      // Click download button
      fireEvent.click(dlBtn);
      expect(onDownloadCert).toHaveBeenCalledWith(sampleRecord, { purpose: 'download' });
    });

    it('collapses into single signer card when user IDs are identical despite differing name formatting', () => {
      const sameIdDifferingNames = {
        id: 'wo-same-id-diff-names',
        wo_code: 'WO-2026-SAMEID',
        asset_code: 'VN-009',
        department_name_th: 'ฝ่ายควบคุมคุณภาพ (QC)',
        status: 'CLOSED',
        result_status: 'PASS',
        performed_at: '2026-11-12T10:00:00Z',
        performed_by: 'U-BEAM',
        performed_by_name: 'บีม',
        reviewed_by: 'U-BEAM',
        reviewed_by_name: 'บีม (QC Officer)'
      };

      render(
        <DigitalRecordModal
          isOpen={true}
          onClose={vi.fn()}
          record={sameIdDifferingNames}
        />
      );

      // Must collapse to single signer card based on identical ID
      const singleCard = screen.getByTestId('vcc-single-signer-card');
      expect(singleCard).toBeInTheDocument();
      expect(singleCard.textContent).toContain('ผู้บันทึกผลและปิดใบสั่งงาน (Recorded & Closed By)');
      expect(screen.queryByText(/ผู้ตรวจรับและปิดใบสั่งงาน/i)).not.toBeInTheDocument();
    });

    it('gracefully handles missing/null performed_by_name with fallback to "-" without throwing', () => {
      const nullPerformerRecord = {
        id: 'wo-null-perf',
        wo_code: 'WO-2026-NULLPERF',
        asset_code: 'VN-010',
        status: 'CLOSED',
        result_status: 'PASS',
        performed_at: '2026-11-12T10:00:00Z',
        performed_by: null,
        performed_by_name: null,
        reviewed_by: null,
        reviewed_by_name: null
      };

      render(
        <DigitalRecordModal
          isOpen={true}
          onClose={vi.fn()}
          record={nullPerformerRecord}
        />
      );

      const singleCard = screen.getByTestId('vcc-single-signer-card');
      expect(singleCard).toBeInTheDocument();
      expect(singleCard.textContent).toContain('-');
    });
  });

  describe('Part 4: Cross-Screen Integration Buttons', () => {
    it('WorkOrderTable renders actual measurement and [ 📄 ดูผล / ใบรับรอง ] button for closed work orders', () => {
      const onViewRecord = vi.fn();
      const closedWo = {
        id: 'wo-closed-table',
        wo_code: 'WO-2026-900',
        asset_code: 'CAL-09',
        asset_name: 'Pressure Gauge',
        status: 'CLOSED',
        result_status: 'PASS',
        actual_measurement: '10.02 bar',
        certificate_no: 'CERT-PG-900',
        due_date: '2026-06-30'
      };

      render(
        <WorkOrderTable
          workOrders={[closedWo]}
          loading={false}
          onSelect={vi.fn()}
          onViewRecord={onViewRecord}
        />
      );

      // Check result column displays actual measurement
      expect(screen.getByText(/10.02 bar/i)).toBeInTheDocument();
      expect(screen.getByText(/CERT-PG-900/i)).toBeInTheDocument();

      // Check action button [ 📄 ดูผล / ใบรับรอง ]
      const viewBtn = screen.getByRole('button', { name: /ดูผล \/ ใบรับรอง/i });
      expect(viewBtn).toBeInTheDocument();
      fireEvent.click(viewBtn);
      expect(onViewRecord).toHaveBeenCalledWith(closedWo);
    });

    it('WorkOrderSideDrawer renders [ 📄 ดูผล / ใบรับรอง ] button in header and details', () => {
      const onViewRecord = vi.fn();
      const closedWo = {
        id: 'wo-closed-drawer',
        wo_code: 'WO-2026-901',
        asset_code: 'CAL-10',
        asset_name: 'Digital Scale',
        status: 'CLOSED',
        result_status: 'PASS',
        actual_measurement: '100.01 g',
        acceptance_criteria: '± 0.05 g',
        certificate_no: 'CERT-DS-901'
      };

      render(
        <WorkOrderSideDrawer
          isOpen={true}
          onClose={vi.fn()}
          workOrder={closedWo}
          onViewRecord={onViewRecord}
        />
      );

      const viewBtns = screen.getAllByRole('button', { name: /ดูผล \/ ใบรับรอง/i });
      expect(viewBtns.length).toBeGreaterThan(0);
      fireEvent.click(viewBtns[0]);
      expect(onViewRecord).toHaveBeenCalledWith(closedWo);
    });

    it('WorkOrderSideDrawer renders single card "ผู้บันทึกผลและปิดใบสั่งงาน" for closed work order', () => {
      const closedWo = {
        id: 'wo-closed-drawer-signer',
        wo_code: 'WO-2026-999',
        asset_code: 'CAL-99',
        asset_name: 'Pressure Sensor',
        department_name_th: 'แผนกสอบเทียบ',
        status: 'CLOSED',
        result_status: 'PASS',
        performed_at: '2026-11-12T12:00:00Z',
        performed_by_name: 'บีม (QC)',
        reviewed_by_name: 'บีม (QC)',
        actual_measurement: '50.0 bar'
      };

      render(
        <WorkOrderSideDrawer
          isOpen={true}
          onClose={vi.fn()}
          workOrder={closedWo}
        />
      );

      const signerCard = screen.getByTestId('vcc-side-drawer-signer-card');
      expect(signerCard).toBeInTheDocument();
      expect(signerCard.textContent).toContain('ผู้บันทึกผลและปิดใบสั่งงาน (Recorded & Closed By)');
      expect(signerCard.textContent).toContain('บีม (QC)');
      expect(signerCard.textContent).toContain('แผนกสอบเทียบ');
      expect(screen.queryByText(/ผู้ตรวจรับและปิดใบสั่งงาน/i)).not.toBeInTheDocument();
    });

    it('WorkOrderSideDrawer supports backward compatibility by rendering dual signers without ReferenceError when verified_by is distinct', () => {
      const legacyDualWo = {
        id: 'wo-legacy-drawer-dual',
        wo_code: 'WO-2026-LEGACY',
        asset_code: 'CAL-100',
        asset_name: 'Pressure Transmitter',
        department_name_th: 'ฝ่ายควบคุมคุณภาพ (QC)',
        status: 'CLOSED',
        result_status: 'PASS',
        performed_at: '2026-10-10',
        performed_by: 'U-PERF',
        performed_by_name: 'บีม (QC Officer)',
        verified_by: 'U-SUP',
        verified_by_name: 'หัวหน้าสมชาย (QC Supervisor)',
        reviewed_by: 'U-SUP',
        reviewed_by_name: 'หัวหน้าสมชาย (QC Supervisor)',
        reviewed_at: '2026-10-11',
        actual_measurement: '100.0 kPa'
      };

      render(
        <WorkOrderSideDrawer
          isOpen={true}
          onClose={vi.fn()}
          workOrder={legacyDualWo}
        />
      );

      // Verify both signers are present and drawerVerifiedByName is rendered without ReferenceError
      expect(screen.getByText('ผู้บันทึกผลการสอบเทียบ')).toBeInTheDocument();
      expect(screen.getByText('ผู้ตรวจรับและปิดใบสั่งงาน')).toBeInTheDocument();
      expect(screen.getByText('บีม (QC Officer)')).toBeInTheDocument();
      expect(screen.getByText('หัวหน้าสมชาย (QC Supervisor)')).toBeInTheDocument();
      expect(screen.queryByTestId('vcc-side-drawer-signer-card')).not.toBeInTheDocument();
    });

    it('WorkOrderSideDrawer collapses into single card when IDs match despite different name strings', () => {
      const sameIdWo = {
        id: 'wo-drawer-same-id',
        wo_code: 'WO-2026-SAMEID-DRAWER',
        asset_code: 'CAL-101',
        asset_name: 'Pressure Gauge',
        status: 'CLOSED',
        result_status: 'PASS',
        performed_at: '2026-11-12T10:00:00Z',
        performed_by: 'U-SAME',
        performed_by_name: 'บีม',
        reviewed_by: 'U-SAME',
        reviewed_by_name: 'บีม (QC Officer)'
      };

      render(
        <WorkOrderSideDrawer
          isOpen={true}
          onClose={vi.fn()}
          workOrder={sameIdWo}
        />
      );

      const signerCard = screen.getByTestId('vcc-side-drawer-signer-card');
      expect(signerCard).toBeInTheDocument();
      expect(screen.queryByText(/ผู้ตรวจรับและปิดใบสั่งงาน/i)).not.toBeInTheDocument();
    });

    it('AnnualPlanSideInspector renders actual measurement and [ 📄 เปิดดูผลและใบรับรอง PDF ] for completed month', () => {
      const onViewDigitalRecord = vi.fn();
      const planItem = {
        id: 'plan-item-01',
        asset_code: 'ST002',
        asset_name: 'Weighing Scale',
        equipment_type: 'Scale',
        department: 'QC',
        planned_months: [5]
      };
      const mockWo = {
        id: 'wo-plan-01',
        plan_item_id: 'plan-item-01',
        asset_code: 'ST002',
        planned_month: 5,
        status: 'CLOSED',
        result_status: 'PASS',
        actual_measurement: '0.002 g error',
        performed_at: '2026-05-15'
      };

      render(
        <AnnualPlanSideInspector
          item={planItem}
          workOrders={[mockWo]}
          onClose={vi.fn()}
          onViewDigitalRecord={onViewDigitalRecord}
        />
      );

      // Verify completed measurement display
      expect(screen.getByText(/0.002 g error/i)).toBeInTheDocument();

      // Verify button
      const viewBtn = screen.getByRole('button', { name: /เปิดดูผลและใบรับรอง PDF/i });
      expect(viewBtn).toBeInTheDocument();
      fireEvent.click(viewBtn);
      expect(onViewDigitalRecord).toHaveBeenCalledWith(mockWo);
    });

    it('AssetDetailDrawer renders closed work order calibration history with [ 📄 ดูผล / ใบรับรอง ] button', async () => {
      const closedWo = {
        id: 'wo-asset-hist-01',
        wo_code: 'WO-2025-088',
        asset_id: 'ast-st002',
        asset_code: 'ST002',
        status: 'CLOSED',
        result_status: 'PASS',
        performed_at: '2025-11-20',
        actual_measurement: '0.005 g error',
        certificate_no: 'CERT-NIMT-2025-088'
      };

      vi.spyOn(vccWorkOrderApi, 'fetchVccWorkOrders').mockResolvedValue([closedWo]);

      render(
        <AssetDetailDrawer
          isOpen={true}
          onClose={vi.fn()}
          data={{
            asset: {
              id: 'ast-st002',
              asset_code: 'ST002',
              asset_name: 'Precision Scale',
              department: 'QC'
            },
            history: []
          }}
        />
      );

      // Wait for work orders to load and appear in the drawer
      await waitFor(() => {
        expect(screen.getByText('WO-2025-088')).toBeInTheDocument();
      });

      expect(screen.getByText(/0.005 g error/i)).toBeInTheDocument();

      const viewBtn = screen.getByRole('button', { name: /ดูผล \/ ใบรับรอง/i });
      expect(viewBtn).toBeInTheDocument();
      fireEvent.click(viewBtn);

      // DigitalRecordModal should open
      await waitFor(() => {
        expect(screen.getByText(/ใบบันทึกผลการทวนสอบ \/ สอบเทียบดิจิทัล/i)).toBeInTheDocument();
      });
    });

    it('supports polymorphic downloadVccWorkOrderCertificate call with string filename argument', async () => {
      const mockWo = {
        id: 'wo-download-test',
        wo_code: 'WO-DL-001',
        asset_code: 'ST002',
        certificate_no: 'CERT-DL-01',
        certificate_file_name: 'sample_cert.pdf'
      };
      vi.spyOn(vccWorkOrderApi, 'getLocalWos').mockReturnValue([mockWo]);
      const blob = await vccWorkOrderApi.downloadVccWorkOrderCertificate('wo-download-test', 'custom_name.pdf');
      expect(blob).toBeTruthy();
    });
  });
});
