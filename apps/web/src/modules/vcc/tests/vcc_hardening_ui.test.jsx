import React, { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { RecordResultModal } from '../components/RecordResultModal';
import { WorkOrderActionModal, DigitalRecordModal } from '../components/WorkOrderModals';
import VccNotificationSettingsModal from '../components/VccNotificationSettingsModal';

describe('VCC Pre-UAT Product Hardening UI Tests (DEC-01 to DEC-04)', () => {
  // Test Harness for RecordResultModal
  const RecordResultHarness = ({ initialForm, onSubmit = vi.fn() }) => {
    const [form, setForm] = useState(initialForm || {
      performed_at: '2026-11-05',
      result_status: 'PASS',
      verification_type: 'QUANTITATIVE',
      actual_result: '',
      certificate_no: 'CERT-2026-TEST',
      acceptance_criteria: '± 0.5 °C',
      uncertainty_value: '0.05',
      calibration_error_value: '0.01'
    });

    const workOrder = {
      id: 'wo-test-01',
      wo_code: 'WO-2026-0099',
      asset_code: 'CAL-001',
      asset_name: 'Digital Caliper',
      status: 'SUBMITTED'
    };

    return (
      <RecordResultModal
        workOrder={workOrder}
        onClose={vi.fn()}
        form={form}
        setForm={setForm}
        error=""
        saving={false}
        onSubmit={onSubmit}
      />
    );
  };

  describe('DEC-01: Certificate Expiry Notification Tiers UI', () => {
    it('displays the 60, 30, 15 days tiering in notification settings modal', () => {
      render(
        <VccNotificationSettingsModal
          isOpen={true}
          onClose={vi.fn()}
          onSave={vi.fn()}
          saving={false}
          certExpiringDaysText="60, 30, 15"
          setCertExpiringDaysText={vi.fn()}
        />
      );

      // Verify the 60, 30, 15 days input and explanation are rendered
      const input = screen.getByLabelText(/แจ้งเตือนใบรับรองใกล้หมดอายุ/i);
      expect(input.value).toBe('60, 30, 15');
      expect(screen.getByText(/ระบบแจ้งเตือน 3 ลำดับ: 60 วัน \(Early Warning\) • 30 วัน \(Approaching Expiry\) • 15 วัน \(Critical Reminder/i)).toBeInTheDocument();
    });
  });

  describe('DEC-02: Work Order Rescheduling Governance UI', () => {
    it('renders Original Due Date, Current Due Date, Proposed Due Date, and mandatory reason in RESCHEDULE mode', () => {
      const workOrder = {
        id: 'wo-resched-1',
        wo_code: 'WO-2026-0501',
        due_date: '2026-11-20',
        original_due_date: '2026-11-10'
      };

      const [form, setForm] = [{ new_due_date: '2026-11-25', text: 'เลื่อนตามกำหนดการซ่อมบำรุง' }, vi.fn()];

      render(
        <WorkOrderActionModal
          modal={{ mode: 'RESCHEDULE', workOrder }}
          onClose={vi.fn()}
          form={form}
          setForm={setForm}
          error=""
          saving={false}
          onConfirm={vi.fn()}
        />
      );

      // Verify modal title
      expect(screen.getByText(/เลื่อนวันครบกำหนด \(WO-2026-0501\)/i)).toBeInTheDocument();

      // Verify Original Due Date immutable display
      expect(screen.getByText(/วันครบกำหนดเริ่มแรก \(Original Due Date\)/i)).toBeInTheDocument();
      expect(screen.getByText(/เก็บรักษาถาวรตามนโยบายตรวจสอบย้อนกลับ/i)).toBeInTheDocument();

      // Verify Proposed Due Date label & input
      expect(screen.getByLabelText(/วันครบกำหนดใหม่ที่เสนอ/i)).toBeInTheDocument();

      // Verify Reason input exists and has label
      expect(screen.getByLabelText(/เหตุผลในการขอเลื่อนวันครบกำหนด/i)).toBeInTheDocument();

      // Verify regulatory governance notice
      expect(screen.getByText(/การขอเลื่อนกำหนดต้องได้รับความเห็นชอบจากผู้มีอำนาจ \(หัวหน้าฝ่าย L4 ขึ้นไป หรือเจ้าหน้าที่ DCC\)/i)).toBeInTheDocument();
    });
  });

  describe('DEC-03: Qualitative Verification UI', () => {
    it('allows toggling between Quantitative and Qualitative verification types', () => {
      render(<RecordResultHarness />);

      // Verify Verification Type buttons exist
      const quantBtn = screen.getByText(/การวัดเชิงปริมาณ \(Quantitative\)/i);
      const qualBtn = screen.getByText(/การตรวจสอบเชิงคุณภาพ \(Qualitative\)/i);

      expect(quantBtn).toBeInTheDocument();
      expect(qualBtn).toBeInTheDocument();

      // Click Qualitative button
      fireEvent.click(qualBtn);

      // Verify qualitative explanation appears
      expect(screen.getByText(/การทวนสอบเชิงคุณภาพ \(เช่น ตรวจสอบด้วยสายตา, Go\/No-Go Gauge, Leak Test\)/i)).toBeInTheDocument();

      // Verify Actual Result field is present
      const actualResultInput = screen.getByLabelText(/ผลการตรวจสอบจริง/i);
      expect(actualResultInput).toBeInTheDocument();
    });
  });

  describe('DEC-04: Composite Set Digital Record UI', () => {
    it('renders the child equipment breakdown table in DigitalRecordModal for composite sets', () => {
      const compositeWorkOrder = {
        id: 'wo-comp-1',
        wo_code: 'WO-2026-0888',
        asset_code: 'SET-GAUGE-01',
        asset_name: 'ชุดบล็อกเกจมาตรฐาน (Gauge Block Set)',
        group_nature: 'COMPOSITE_SET',
        composite_details: 'ประกอบด้วยบล็อกเกจ 32 ชิ้น ความแม่นยำ Class 1',
        child_assets: [
          {
            id: 'c-1',
            asset_code: 'SET-GB-01-A',
            name: 'Block 1.005mm',
            serial_no: 'SN-GB-001',
            location: 'ตู้ควบคุมความชื้น C1',
            status: 'ACTIVE'
          },
          {
            id: 'c-2',
            asset_code: 'SET-GB-01-B',
            name: 'Block 1.010mm',
            serial_no: 'SN-GB-002',
            location: 'ตู้ควบคุมความชื้น C1',
            status: 'ACTIVE'
          }
        ],
        performed_at: '2026-11-04',
        result_status: 'PASS',
        certificate_no: 'NIMT-2026-7788',
        acceptance_criteria: 'สอดคล้องตามมาตรฐาน ISO 3650 Grade 1',
        actual_result: 'ผ่านเกณฑ์ความคลาดเคลื่อนยอมรับได้ทุกชิ้น',
        calibrated_by_name: 'นายสมชาย ตรวจสอบ',
        approved_by_name: 'นายมานะ อนุมัติ'
      };

      render(
        <DigitalRecordModal
          isOpen={true}
          onClose={vi.fn()}
          workOrder={compositeWorkOrder}
        />
      );

      // Check header
      expect(screen.getByText(/DIGITAL RECORD: WO-2026-0888/i)).toBeInTheDocument();

      // Check child assets breakdown section
      expect(screen.getByText(/รายการอุปกรณ์ในชุดเครื่องมือผสม \(Composite Equipment Set Breakdown\)/i)).toBeInTheDocument();
      expect(screen.getByText('SET-GB-01-A')).toBeInTheDocument();
      expect(screen.getByText('Block 1.005mm')).toBeInTheDocument();
      expect(screen.getByText('SN-GB-001')).toBeInTheDocument();
      expect(screen.getByText('SET-GB-01-B')).toBeInTheDocument();
      expect(screen.getByText('Block 1.010mm')).toBeInTheDocument();
      expect(screen.getByText('SN-GB-002')).toBeInTheDocument();
    });
  });
});
