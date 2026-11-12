import React, { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import useStore from '../../../store/useStore';
import { RecordResultModal } from '../components/RecordResultModal';
import { WorkOrderActionModal, DigitalRecordModal } from '../components/WorkOrderModals';
import { WorkOrderTable } from '../components/WorkOrderTable';
import VccNotificationSettingsModal from '../components/VccNotificationSettingsModal';
import {
  canRequestReschedule,
  canDirectReschedule,
  getReschedulePermissionReason
} from '../utils/workOrderPermissions';

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

    it('renders REVIEW_RESCHEDULE modal and enforces Segregation of Duties (SoD) by disabling approve button for requester', () => {
      const workOrder = {
        id: 'wo-resched-pending',
        wo_code: 'WO-2026-0777',
        due_date: '2026-11-20',
        original_due_date: '2026-11-10',
        proposed_due_date: '2026-11-30',
        reschedule_status: 'REQUESTED',
        reschedule_requested_by: 'user-requester-01',
        reschedule_requested_by_name: 'นายสมศักดิ์ ผู้ขอ',
        reschedule_requested_at: '2026-11-05T08:00:00Z',
        reschedule_reason: 'รอชิ้นส่วนอะไหล่จากต่างประเทศ'
      };

      const [form, setForm] = [{ text: '' }, vi.fn()];
      const currentUserAsRequester = { id: 'user-requester-01', name: 'นายสมศักดิ์ ผู้ขอ', approval_level: 4 };

      // Render as requester (Self-Approval attempt)
      const { rerender } = render(
        <WorkOrderActionModal
          modal={{ mode: 'REVIEW_RESCHEDULE', workOrder }}
          onClose={vi.fn()}
          form={form}
          setForm={setForm}
          error=""
          saving={false}
          currentUser={currentUserAsRequester}
          onApproveReschedule={vi.fn()}
          onRejectReschedule={vi.fn()}
          onConfirm={vi.fn()}
        />
      );

      // Verify title and request details
      expect(screen.getByText(/พิจารณาคำขอเลื่อนวันครบกำหนด \(WO-2026-0777\)/i)).toBeInTheDocument();
      expect(screen.getByText(/รอชิ้นส่วนอะไหล่จากต่างประเทศ/i)).toBeInTheDocument();
      expect(screen.getByText(/นายสมศักดิ์ ผู้ขอ/i)).toBeInTheDocument();

      // Verify SoD warning is displayed
      expect(screen.getByText(/การคัดแยกหน้าที่ \(Segregation of Duties\)/i)).toBeInTheDocument();
      expect(screen.getByText(/ท่านเป็นผู้ยื่นคำขอเลื่อนกำหนดนี้ ระบบไม่อนุญาตให้อนุมัติตนเองได้/i)).toBeInTheDocument();

      // Verify Approve button is DISABLED for requester
      const approveBtn = screen.getByRole('button', { name: /อนุมัติการเลื่อนกำหนด/i });
      expect(approveBtn).toBeDisabled();

      // Now rerender as an independent authorized approver (e.g. Department Head user-approver-99)
      const independentApprover = { id: 'user-approver-99', name: 'นางสาวมานี หัวหน้าฝ่าย', approval_level: 4 };
      rerender(
        <WorkOrderActionModal
          modal={{ mode: 'REVIEW_RESCHEDULE', workOrder }}
          onClose={vi.fn()}
          form={form}
          setForm={setForm}
          error=""
          saving={false}
          currentUser={independentApprover}
          onApproveReschedule={vi.fn()}
          onRejectReschedule={vi.fn()}
          onConfirm={vi.fn()}
        />
      );

      // SoD warning should NOT be displayed for independent approver
      expect(screen.queryByText(/ท่านเป็นผู้ยื่นคำขอเลื่อนกำหนดนี้/i)).not.toBeInTheDocument();

      // Approve button should be ENABLED
      const approverApproveBtn = screen.getByRole('button', { name: /อนุมัติการเลื่อนกำหนด/i });
      expect(approverApproveBtn).not.toBeDisabled();
    });

    it('renders DCC Direct Override option when user is DCC', () => {
      const workOrder = {
        id: 'wo-resched-dcc',
        wo_code: 'WO-2026-0888',
        due_date: '2026-11-20',
        original_due_date: '2026-11-10'
      };

      const [form, setForm] = [{ new_due_date: '2026-11-25', text: 'DCC Override', is_direct_override: false }, vi.fn()];
      const dccUser = { id: 'u-dcc', isDcc: true, approval_level: 4 };

      render(
        <WorkOrderActionModal
          modal={{ mode: 'RESCHEDULE', workOrder }}
          onClose={vi.fn()}
          form={form}
          setForm={setForm}
          error=""
          saving={false}
          currentUser={dccUser}
          onConfirm={vi.fn()}
        />
      );

      // Verify DCC override checkbox is visible
      expect(screen.getByText(/ดำเนินการเลื่อนทันที \(DCC Administrative Direct Override\)/i)).toBeInTheDocument();
    });

    it('displays PENDING APPROVAL badge in WorkOrderTable when reschedule_status is REQUESTED', () => {
      const workOrders = [
        {
          id: 'wo-table-resched',
          wo_code: 'WO-2026-0999',
          asset_code: 'PRS-001',
          asset_name: 'Pressure Gauge',
          department: 'QC',
          provider_name: 'ห้องแล็บกลาง',
          due_date: '2026-11-20',
          original_due_date: '2026-11-10',
          proposed_due_date: '2026-11-30',
          reschedule_status: 'REQUESTED',
          reschedule_reason: 'เครื่องมืออยู่ระหว่างการส่งซ่อม',
          status: 'OPEN',
          result_status: 'PENDING'
        }
      ];

      render(
        <WorkOrderTable
          workOrders={workOrders}
          loading={false}
          error={null}
          activeTab="OPEN"
          onRowClick={vi.fn()}
        />
      );

      // Verify badge text and proposed date are in the table
      expect(screen.getByText(/รออนุมัติเลื่อนกำหนด/i)).toBeInTheDocument();
      expect(screen.getByText(/เสนอ:/i)).toBeInTheDocument();
    });
  });

  describe('DEC-03: Single-View Smart Form UI', () => {
    it('displays Segmented Pill for PASS/FAIL and side-by-side Acceptance Criteria & Actual Result', () => {
      render(<RecordResultHarness />);

      // Verify Segmented Pill buttons exist
      expect(screen.getByRole('button', { name: /ผ่านเกณฑ์ \(PASS\)/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /ไม่ผ่านเกณฑ์ \(FAIL\)/i })).toBeInTheDocument();

      // Verify Row 2: Acceptance Criteria and Actual Result
      const criteriaInput = screen.getByLabelText(/เกณฑ์ยอมรับ/i);
      const actualResultInput = screen.getByLabelText(/ผลการตรวจสอบจริง/i);
      expect(criteriaInput).toBeInTheDocument();
      expect(actualResultInput).toBeInTheDocument();

      // Verify submit button has new direct completion label
      expect(screen.getByRole('button', { name: /บันทึกผลและปิดใบงาน/i })).toBeInTheDocument();
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

    it('renders historical legacy notice when is_legacy_without_snapshot is true', () => {
      const legacyWorkOrder = {
        id: 'wo-legacy-1',
        wo_code: 'WO-LEGACY-001',
        asset_code: 'SET-LEGACY-01',
        asset_name: 'ชุดเครื่องแก้วทนความร้อน',
        group_nature: 'COMPOSITE_SET',
        composite_details: 'ประกอบด้วยบีกเกอร์และฟลาสค์ 10 ชิ้น',
        child_assets: [],
        is_legacy_without_snapshot: true,
        status: 'CLOSED',
        result_status: 'PASS',
        performed_at: '2025-05-10'
      };

      render(
        <DigitalRecordModal
          isOpen={true}
          onClose={vi.fn()}
          workOrder={legacyWorkOrder}
        />
      );

      // Verify legacy notice is displayed
      expect(screen.getByText(/ใบบันทึกนี้เป็นข้อมูลประวัติเดิมก่อนระบบจัดเก็บภาพถ่ายรายการเครื่องมือย่อย/i)).toBeInTheDocument();
      // Verify composite details are still rendered
      expect(screen.getByText(/ประกอบด้วยบีกเกอร์และฟลาสค์ 10 ชิ้น/i)).toBeInTheDocument();
    });
  });

  describe('E1.1 Requester Authorization Alignment (DEC-02 Refinement)', () => {
    const qcWorkOrder = {
      id: 'wo-qc-01',
      wo_code: 'WO-QC-2026-001',
      asset_code: 'QC-CAL-01',
      asset_name: 'QC Micrometer',
      department: 'QC',
      status: 'OPEN',
      due_date: '2026-11-20',
      original_due_date: '2026-11-20'
    };

    it('validates canRequestReschedule permission matrix correctly', () => {
      // 1. L1 in same department -> false
      const userL1SameDept = { id: 'u1', approval_level: 1, department: 'QC' };
      expect(canRequestReschedule(userL1SameDept, qcWorkOrder)).toBe(false);
      expect(getReschedulePermissionReason(userL1SameDept, qcWorkOrder)).toContain('ผู้ยื่นคำขอต้องมีระดับสิทธิ์ตั้งแต่ L2');

      // 2. L2 in same department -> true
      const userL2SameDept = { id: 'u2', approval_level: 2, department: 'QC' };
      expect(canRequestReschedule(userL2SameDept, qcWorkOrder)).toBe(true);

      // 3. L3 in same department -> true
      const userL3SameDept = { id: 'u3', approval_level: 3, department: 'QC' };
      expect(canRequestReschedule(userL3SameDept, qcWorkOrder)).toBe(true);

      // 4. L2/L4 in other department (QA) -> false
      const userL4OtherDept = { id: 'u4', approval_level: 4, department: 'QA' };
      expect(canRequestReschedule(userL4OtherDept, qcWorkOrder)).toBe(false);
      expect(getReschedulePermissionReason(userL4OtherDept, qcWorkOrder)).toContain('เฉพาะผู้ปฏิบัติงานในแผนก QC');

      // 5. QMR / L6 in other department (QA) -> false (cannot bypass department boundary to request)
      const userQmrOtherDept = { id: 'uqmr', approval_level: 6, isQmr: true, department: 'QA' };
      expect(canRequestReschedule(userQmrOtherDept, qcWorkOrder)).toBe(false);
      expect(getReschedulePermissionReason(userQmrOtherDept, qcWorkOrder)).toContain('สิทธิ์ผู้บริหาร QMR/L6 ไม่สามารถยื่นขอข้ามแผนกได้');

      // 6. DCC user -> true
      const userDcc = { id: 'udcc', approval_level: 3, isDcc: true, department: 'LB' };
      expect(canRequestReschedule(userDcc, qcWorkOrder)).toBe(true);
      expect(canDirectReschedule(userDcc, qcWorkOrder)).toBe(true);

      // 7. Non-DCC user cannot direct reschedule
      expect(canDirectReschedule(userL3SameDept, qcWorkOrder)).toBe(false);
    });

    it('disables reschedule button with informative tooltip in WorkOrderTable when user is unauthorized', () => {
      useStore.setState({
        currentUser: { id: 'u-unauth', approval_level: 1, department: 'QC', isDcc: false }
      });

      render(
        <WorkOrderTable
          workOrders={[qcWorkOrder]}
          loading={false}
          error={null}
          activeTab="OPEN"
          onRowClick={vi.fn()}
          onReschedule={vi.fn()}
        />
      );

      // Open the overflow menu
      const moreBtn = screen.getByRole('button', { name: /การจัดการเพิ่มเติมสำหรับ WO-QC-2026-001/i });
      fireEvent.click(moreBtn);

      // The reschedule button should be disabled with tooltip explaining L2 requirement
      const rescheduleBtn = screen.getByRole('button', { name: /ขอเลื่อนวันครบกำหนด/i });
      expect(rescheduleBtn).toBeDisabled();
      expect(rescheduleBtn).toHaveAttribute('title', expect.stringContaining('ผู้ยื่นคำขอต้องมีระดับสิทธิ์ตั้งแต่ L2'));
    });

    it('enables reschedule button in WorkOrderTable when user has L2+ in department', () => {
      useStore.setState({
        currentUser: { id: 'u-auth-l2', approval_level: 2, department: 'QC', isDcc: false }
      });

      render(
        <WorkOrderTable
          workOrders={[qcWorkOrder]}
          loading={false}
          error={null}
          activeTab="OPEN"
          onRowClick={vi.fn()}
          onReschedule={vi.fn()}
        />
      );

      // Open the overflow menu
      const moreBtn = screen.getByRole('button', { name: /การจัดการเพิ่มเติมสำหรับ WO-QC-2026-001/i });
      fireEvent.click(moreBtn);

      // The reschedule button should be enabled
      const rescheduleBtn = screen.getByRole('button', { name: /ขอเลื่อนวันครบกำหนด/i });
      expect(rescheduleBtn).not.toBeDisabled();
    });
  });
});
