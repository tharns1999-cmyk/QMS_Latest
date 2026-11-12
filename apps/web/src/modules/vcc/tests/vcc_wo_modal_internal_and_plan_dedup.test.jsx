import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { CreateWorkOrderModal } from '../components/WorkOrderModals';
import { RecordResultModal } from '../components/RecordResultModal';
import { getLocalWos } from '../api/vccWorkOrderApi';

describe('VCC: Work Order Modals, Plan Deduplication & Internal Verification Tests', () => {
  describe('1. Plan Deduplication in CreateWorkOrderModal', () => {
    it('กรองแผนที่อนุมัติแล้วให้แสดงเฉพาะ Revision สูงสุดของปี/แผนกนั้น และแสดง Badge Rev.XX', () => {
      const mockApprovedPlans = [
        {
          id: 'plan-qc-rev1',
          plan_year: 2026,
          department: 'QC',
          plan_code: 'VCC-AP-QC-2026',
          title: 'แผนสอบเทียบ QC 2026 Rev.01',
          revision_no: 1,
          status: 'APPROVED',
          is_current: 0,
          effective_status: 'SUPERSEDED'
        },
        {
          id: 'plan-qc-rev2',
          plan_year: 2026,
          department: 'QC',
          plan_code: 'VCC-AP-QC-2026',
          title: 'แผนสอบเทียบ QC 2026 Rev.02 (ปัจจุบัน)',
          revision_no: 2,
          status: 'APPROVED',
          is_current: 1,
          effective_status: 'EFFECTIVE'
        },
        {
          id: 'plan-qa-rev1',
          plan_year: 2026,
          department: 'QA',
          plan_code: 'VCC-AP-QA-2026',
          title: 'แผนสอบเทียบ QA 2026 Rev.01',
          revision_no: 1,
          status: 'APPROVED',
          is_current: 1,
          effective_status: 'EFFECTIVE'
        }
      ];

      const createForm = {
        mode: 'PLAN',
        plan_id: '',
        plan_item_id: '',
        planned_month: 1,
        child_asset_id: '',
        asset_id: '',
        provider_name: '',
        due_date: '2026-11-30'
      };

      const { container } = render(
        <CreateWorkOrderModal
          open={true}
          onClose={vi.fn()}
          form={createForm}
          setForm={vi.fn()}
          error=""
          saving={false}
          onSubmit={vi.fn()}
          approvedPlans={mockApprovedPlans}
          planItems={[]}
          individualAssets={[]}
          providers={[]}
        />
      );

      const planSelect = container.querySelector('select[aria-label="แผนประจำปีที่อนุมัติแล้ว"]');
      expect(planSelect).toBeInTheDocument();
      const options = Array.from(planSelect.querySelectorAll('option'));

      // Option 0 is placeholder ("-- เลือกแผนที่อนุมัติแล้ว --")
      expect(options.length).toBe(3); // placeholder + QC (Rev.02 only) + QA (Rev.01)

      const optionTexts = options.map((opt) => opt.textContent);
      expect(optionTexts.some((t) => t.includes('QC') && t.includes('Rev.02'))).toBe(true);
      expect(optionTexts.some((t) => t.includes('QA') && t.includes('Rev.01'))).toBe(true);
      // Ensure Rev.01 for QC is NOT present in dropdown
      expect(optionTexts.some((t) => t.includes('QC') && t.includes('Rev.01'))).toBe(false);
    });
  });

  describe('2. Smart RecordResultModal for Internal Verification vs External Lab', () => {
    it('กรณี "ทวนสอบภายใน" (Internal Verification): แสดง Badge ทวนสอบภายใน, มี Master Reference, ไม่บังคับ Cert No., และส่งผลได้โดยไม่ต้องกรอกเลข Cert', async () => {
      const internalWo = {
        id: 'wo-int-001',
        wo_code: 'WO-2026-001',
        asset_code: 'TC001',
        asset_name: 'เทอร์โมมิเตอร์ห้องเย็น 1',
        provider_name: 'ทวนสอบภายใน',
        provider_type: 'INTERNAL',
        status: 'OPEN',
        result_status: 'PENDING'
      };

      let formState = {
        performed_at: '2026-11-12',
        result_status: 'PASS',
        verification_type: 'QUANTITATIVE',
        actual_result: '100.1 °C',
        certificate_no: '', // empty on purpose
        acceptance_criteria: '± 0.5 °C',
        result_remarks: '',
        traceability_ref: '',
        calibration_provider_name: '',
        calibration_method: ''
      };

      const setForm = vi.fn((newForm) => {
        formState = typeof newForm === 'function' ? newForm(formState) : newForm;
      });
      const onSubmit = vi.fn((e) => e.preventDefault());

      render(
        <RecordResultModal
          workOrder={internalWo}
          onClose={vi.fn()}
          form={formState}
          setForm={setForm}
          error=""
          saving={false}
          onSubmit={onSubmit}
          criteriaOptions={['± 0.5 °C']}
        />
      );

      // Verify internal verification badge
      expect(screen.getByText(/🏠 ทวนสอบภายในองค์กร \(เทียบกับเครื่องมือมาตรฐาน\)/i)).toBeInTheDocument();

      // Verify Master Reference field exists
      expect(screen.getByLabelText(/เครื่องมือมาตรฐานที่ใช้เทียบ/i)).toBeInTheDocument();

      // Verify Internal Record No. field exists and is NOT marked with mandatory red *
      const certNoInput = screen.getByLabelText(/เลขที่ใบบันทึกการทวนสอบภายใน/i);
      expect(certNoInput).toBeInTheDocument();
      expect(certNoInput).not.toBeRequired();

      // Verify External cert date fields are hidden
      expect(screen.queryByLabelText(/วันที่ออกใบรับรอง/i)).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/วันที่หมดอายุใบรับรอง/i)).not.toBeInTheDocument();

      // Verify PDF upload label is customized for internal records
      expect(screen.getByText(/แนบไฟล์ใบบันทึกการทวนสอบ \/ หลักฐานภาพถ่าย/i)).toBeInTheDocument();

      // Verify Submit button is ENABLED even with empty certificate_no
      const submitBtn = screen.getByRole('button', { name: /✓ บันทึกผลและปิดใบงาน/i });
      expect(submitBtn).toBeEnabled();

      // Click submit and verify certificate_no auto-populates with WO code
      fireEvent.click(submitBtn);
      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalled();
        expect(formState.certificate_no).toBe('WO-2026-001');
        expect(formState.calibration_method).toBe('IN_HOUSE');
      });
    });

    it('กรณี "สอบเทียบภายนอก" (External Lab): แสดง Badge สอบเทียบภายนอก, บังคับเลขที่ใบรับรอง *, และปุ่ม Submit ถูก disable หากยังไม่กรอก Cert No.', () => {
      const externalWo = {
        id: 'wo-ext-002',
        wo_code: 'WO-2026-002',
        asset_code: 'CAL-001',
        asset_name: 'Vernier Caliper',
        provider_name: 'บริษัท สอบเทียบไทยแลนด์ จำกัด',
        provider_type: 'EXTERNAL',
        status: 'OPEN',
        result_status: 'PENDING'
      };

      const formState = {
        performed_at: '2026-11-12',
        result_status: 'PASS',
        verification_type: 'QUANTITATIVE',
        actual_result: '0.00 mm',
        certificate_no: '', // empty
        acceptance_criteria: '± 0.02 mm',
        result_remarks: '',
        traceability_ref: '',
        calibration_provider_name: 'บริษัท สอบเทียบไทยแลนด์ จำกัด',
        calibration_method: 'EXTERNAL_LAB'
      };

      render(
        <RecordResultModal
          workOrder={externalWo}
          onClose={vi.fn()}
          form={formState}
          setForm={vi.fn()}
          error=""
          saving={false}
          onSubmit={vi.fn()}
          criteriaOptions={['± 0.02 mm']}
        />
      );

      // Verify external badge
      expect(screen.getByText(/🌐 สอบเทียบโดยห้องปฏิบัติการภายนอก/i)).toBeInTheDocument();

      // Verify Cert No. is required with red asterisk
      const certNoInput = screen.getByLabelText(/เลขที่ใบรับรอง/i);
      expect(certNoInput).toBeRequired();

      // Verify cert issue and validity dates are rendered
      expect(screen.getByLabelText(/วันที่ออกใบรับรอง/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/วันที่หมดอายุใบรับรอง/i)).toBeInTheDocument();

      // Verify Submit button is DISABLED because cert_no is missing
      const submitBtn = screen.getByRole('button', { name: /✓ บันทึกผลและปิดใบงาน/i });
      expect(submitBtn).toBeDisabled();
    });
  });

  describe('3. Footer Layout & Text Truncation Prevention', () => {
    it('ปุ่มยกเลิกและปุ่ม Submit มีคลาส whitespace-nowrap shrink-0 และข้อความซ้ายมือมี flex-1 min-w-0', () => {
      const wo = {
        id: 'wo-layout-001',
        wo_code: 'WO-2026-088',
        asset_code: 'TC001',
        asset_name: 'Thermo',
        provider_name: 'ทวนสอบภายใน',
        status: 'OPEN'
      };

      const form = {
        performed_at: '2026-11-12',
        result_status: 'PASS',
        certificate_no: 'CERT-088',
        acceptance_criteria: '± 0.5 °C',
        result_remarks: ''
      };

      render(
        <RecordResultModal
          workOrder={wo}
          onClose={vi.fn()}
          form={form}
          setForm={vi.fn()}
          onSubmit={vi.fn()}
          criteriaOptions={['± 0.5 °C']}
        />
      );

      const cancelBtn = screen.getByRole('button', { name: /^ยกเลิก$/i });
      const submitBtn = screen.getByRole('button', { name: /✓ บันทึกผลและปิดใบงาน/i });

      // Buttons have whitespace-nowrap and shrink-0
      expect(cancelBtn.className).toContain('whitespace-nowrap');
      expect(cancelBtn.className).toContain('shrink-0');
      expect(submitBtn.className).toContain('whitespace-nowrap');
      expect(submitBtn.className).toContain('shrink-0');

      // Left note has flex-1 min-w-0
      const note = screen.getByText(/\* บันทึกผลแล้วระบบจะปิดใบงานและอัปเดตสถานะเครื่องมือทันที/i);
      expect(note.className).toContain('flex-1');
      expect(note.className).toContain('min-w-0');
    });
  });

  describe('4. TC001 Synchronization to Internal Verification and Month 11', () => {
    it('WO-2026-001 สำหรับ TC001 ซิงค์รอบเดือนเป็นเดือน 11 และประเภทเป็น ทวนสอบภายใน / INTERNAL', async () => {
      const wos = await getLocalWos();
      const tc001Wo = wos.find((w) => w.asset_code === 'TC001' || w.wo_code === 'WO-2026-001');

      expect(tc001Wo).toBeDefined();
      expect(tc001Wo.planned_month).toBe(11);
      expect(tc001Wo.due_date).toBe('2026-11-30');
      expect(tc001Wo.provider_name).toContain('ทวนสอบภายใน');
      expect(tc001Wo.provider_type).toBe('INTERNAL');
      expect(tc001Wo.calibration_type).toBe('INTERNAL');
    });
  });
});
