import React, { useState } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import useStore from '../../../store/useStore';
import AssetRegisterPage from '../pages/AssetRegisterPage';
import { resetVccLocalStore } from '../api/vccApi';
import { AssetFormModal } from '../components/AssetRegisterModals';
import { RecordResultModal } from '../components/RecordResultModal';
import { CreateWorkOrderModal } from '../components/WorkOrderModals';
import VccDashboardSection from '../components/VccDashboardSection';

const SAMPLE_DEPTS = [
  { code: 'QC', name_th: 'ควบคุมคุณภาพ', status: 'ACTIVE' },
  { code: 'WH', name_th: 'คลังสินค้า', status: 'ACTIVE' },
  { code: 'DC', name_th: 'ควบคุมเอกสาร', status: 'ACTIVE' }
];

// Harness for AssetFormModal to test dirty tracking on existing vs modified asset
const AssetFormModalHarness = ({ initialAsset, onClose }) => {
  const [open, setOpen] = useState(true);
  const [form, setForm] = useState(initialAsset || {
    asset_code: '',
    name: '',
    asset_type: 'VERNIER_CALIPER',
    serial_no: '',
    model: '',
    location: '',
    department: 'QC'
  });

  const handleClose = (nextOpen) => {
    if (!nextOpen) {
      setOpen(false);
      if (onClose) onClose();
    }
  };

  return (
    <div>
      <button type="button" onClick={() => setForm({ ...form, name: form.name + ' [MODIFIED]' })}>
        แก้ไขชื่อ
      </button>
      <AssetFormModal
        formOpen={open}
        setFormOpen={handleClose}
        editingAsset={initialAsset}
        form={form}
        setForm={setForm}
        savingForm={false}
        handleSaveAsset={() => {}}
        formTypeOptions={['VERNIER_CALIPER', 'MICROMETER']}
        assetTypes={['VERNIER_CALIPER', 'MICROMETER']}
        activeDepartments={[{ code: 'QC', name_th: 'ควบคุมคุณภาพ' }]}
        canTransfer={true}
      />
    </div>
  );
};

// Harness for RecordResultModal with quick chips & datalist
const RecordResultModalHarness = ({ providers, initialProvider = '', onSubmit }) => {
  const [open, setOpen] = useState(true);
  const [form, setForm] = useState({
    result_status: 'PASS',
    calibration_provider_name: initialProvider,
    evidence_type: 'CERTIFICATE_ONLY',
    certificate_no: 'CERT-001'
  });

  return (
    <RecordResultModal
      isOpen={open}
      onClose={() => setOpen(false)}
      workOrder={{ id: 'wo-1', wo_code: 'WO-2026-0001', asset_name: 'Caliper' }}
      form={form}
      setForm={setForm}
      error=""
      saving={false}
      onSubmit={onSubmit || (() => {})}
      criteriaOptions={[]}
      providers={providers}
    />
  );
};

// Test component testing the ad-hoc work order validation flow
const AdHocWorkOrderValidationHarness = () => {
  const [form, setForm] = useState({
    mode: 'PLAN',
    asset_id: '',
    provider_name: 'Lab A',
    due_date: '2026-12-31'
  });
  const [error, setError] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (form.mode !== 'PLAN') {
      if (!form.asset_id) {
        setError('กรุณาเลือกเครื่องมือวัด');
        return;
      }
      if (!form.provider_name || !form.provider_name.trim()) {
        setError('กรุณาระบุสถาบัน/หน่วยงานที่ทวนสอบ');
        return;
      }
      if (!form.due_date || !form.due_date.trim()) {
        setError('กรุณาระบุวันครบกำหนด');
        return;
      }
    }
  };

  return (
    <CreateWorkOrderModal
      open={true}
      onClose={() => {}}
      form={form}
      setForm={setForm}
      error={error}
      saving={false}
      onSubmit={handleSubmit}
      approvedPlans={[]}
      planItems={[]}
      individualAssets={[{ id: 'a1', asset_code: 'CAL-01', name: 'Vernier' }]}
      providers={['Lab A', 'Lab B']}
    />
  );
};

describe('VCC Refinement Round E1 — Quick Wins', () => {
  beforeEach(() => {
    resetVccLocalStore();
    useStore.setState({
      currentUser: {
        id: 'dc4',
        name: 'DC หัวหน้า (DCC)',
        email: 'dc4@qms.local',
        role: 'STAFF',
        department: 'DC',
        position: 'Document Control Supervisor',
        approval_level: 4,
        approvalLevel: 4,
        isDcc: true,
        isQmr: false
      },
      departments: SAMPLE_DEPTS,
      masterDepartments: SAMPLE_DEPTS,
      approvalMatrix: [
        {
          docType: 'FM',
          minRequesterLevel: 1,
          requiredReviewerLevel: 4,
          requiredApproverLevel: 5
        }
      ]
    });
  });

  describe('P1-1: Ad-hoc Work Order Provider & Asset Validation', () => {
    it('shows validation error when ad-hoc work order lacks required asset or provider', async () => {
      render(<AdHocWorkOrderValidationHarness />);

      // Switch to ad-hoc mode
      const adhocRadio = screen.getByLabelText(/ใบสั่งงานนอกแผน/i);
      fireEvent.click(adhocRadio);

      const form = screen.getByRole('dialog').querySelector('form');
      expect(form).toBeTruthy();

      // Submit without selecting an asset -> shows error
      fireEvent.submit(form);
      expect(screen.getByText('กรุณาเลือกเครื่องมือวัด')).toBeInTheDocument();

      // Select an asset, but empty provider
      const assetSelect = screen.getByLabelText(/เลือกเครื่องมือรายตัว/i);
      fireEvent.change(assetSelect, { target: { value: 'a1' } });

      const providerSelect = screen.getByLabelText(/หน่วยงานที่ทวนสอบ/i);
      fireEvent.change(providerSelect, { target: { value: '' } });

      // Submit again -> shows provider error
      fireEvent.submit(form);
      expect(screen.getByText('กรุณาระบุสถาบัน/หน่วยงานที่ทวนสอบ')).toBeInTheDocument();
    });

    it('CreateWorkOrderModal provides standard provider dropdown with fallback prompt', () => {
      const mockSetForm = vi.fn();
      render(
        <CreateWorkOrderModal
          open={true}
          onClose={() => {}}
          form={{ mode: 'ADHOC', asset_id: 'a1', provider_name: '', due_date: '2026-12-31' }}
          setForm={mockSetForm}
          saving={false}
          error=""
          onSubmit={() => {}}
          approvedPlans={[]}
          planItems={[]}
          individualAssets={[{ id: 'a1', asset_code: 'CAL-01', name: 'Vernier' }]}
          providers={['สถาบันมาตรวิทยาแห่งชาติ (NIMT)', 'บจก. เทสท์แล็บ']}
        />
      );

      const providerSelect = screen.getByLabelText(/หน่วยงานที่ทวนสอบ/i);
      expect(providerSelect).toBeInTheDocument();
      expect(screen.getByText('-- เลือกหน่วยงานที่ทวนสอบ --')).toBeInTheDocument();
    });
  });

  describe('P1-2: RecordResultModal Provider Quick Chips & Datalist', () => {
    it('renders datalist options and quick chips for configured providers', async () => {
      const providersList = ['สถาบันมาตรวิทยาแห่งชาติ (NIMT)', 'บจก. แคลิเบรชั่น แล็บ'];
      render(<RecordResultModalHarness providers={providersList} />);

      // Switch to TRACEABILITY tab (button with icon and traceability text)
      const traceabilityBtn = screen.getByRole('button', { name: /การสอบกลับได้/i });
      fireEvent.click(traceabilityBtn);

      const providerInput = screen.getByLabelText(/สถาบัน \/ ห้องปฏิบัติการสอบเทียบ/i);
      expect(providerInput).toHaveAttribute('list', 'vcc-record-providers-list');

      // Verify quick chips exist
      const chipsContainer = screen.getByTestId('record-provider-quick-chips');
      expect(chipsContainer).toBeInTheDocument();

      const nimtChip = screen.getByRole('button', { name: /เลือกหน่วยงาน สถาบันมาตรวิทยาแห่งชาติ \(NIMT\)/i });
      expect(nimtChip).toBeInTheDocument();

      // Clicking quick chip updates the input value
      fireEvent.click(nimtChip);
      expect(providerInput).toHaveValue('สถาบันมาตรวิทยาแห่งชาติ (NIMT)');
    });

    it('supports typing custom laboratory name without restriction', async () => {
      const providersList = ['NIMT'];
      render(<RecordResultModalHarness providers={providersList} />);

      const traceabilityBtn = screen.getByRole('button', { name: /การสอบกลับได้/i });
      fireEvent.click(traceabilityBtn);

      const providerInput = screen.getByLabelText(/สถาบัน \/ ห้องปฏิบัติการสอบเทียบ/i);
      fireEvent.change(providerInput, { target: { value: 'Custom In-house Metrology Lab' } });
      expect(providerInput).toHaveValue('Custom In-house Metrology Lab');
    });
  });

  describe('P1-3: Dashboard Deep-link to Work Order', () => {
    it('VccDashboardSection alert button triggers onNavigateToWorkOrders with target wo_id', async () => {
      const handleNavigate = vi.fn();
      render(<VccDashboardSection onNavigateToWorkOrders={handleNavigate} />);

      const manageButtons = await screen.findAllByRole('button', { name: /จัดการใบงาน/i });
      expect(manageButtons.length).toBeGreaterThan(0);

      fireEvent.click(manageButtons[0]);
      expect(handleNavigate).toHaveBeenCalledWith(expect.any(String));
    });
  });

  describe('P1-4: AssetFormModal Clean Inspection & Dirty Snapshot State', () => {
    it('closing an existing asset without changes does NOT trigger discard prompt', () => {
      const handleClose = vi.fn();
      const existingAsset = {
        id: 'asset-101',
        asset_code: 'EQ-2026-001',
        name: 'Digital Micrometer 0-25mm',
        asset_type: 'MICROMETER',
        serial_no: 'SN-998877',
        model: 'Mitutoyo 293',
        location: 'Lab Room A',
        department: 'QC',
        is_group: false,
        group_nature: 'LOGICAL_GROUP',
        composite_details: ''
      };

      render(<AssetFormModalHarness initialAsset={existingAsset} onClose={handleClose} />);

      expect(screen.getByRole('dialog')).toBeInTheDocument();

      // Press Escape without editing
      fireEvent.keyDown(window, { key: 'Escape' });

      // Modal closes cleanly without prompt
      expect(handleClose).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });

    it('modifying existing asset attributes activates discard prompt upon close attempt', () => {
      const handleClose = vi.fn();
      const existingAsset = {
        id: 'asset-101',
        asset_code: 'EQ-2026-001',
        name: 'Digital Micrometer 0-25mm',
        asset_type: 'MICROMETER',
        serial_no: 'SN-998877',
        model: 'Mitutoyo 293',
        location: 'Lab Room A',
        department: 'QC',
        is_group: false,
        group_nature: 'LOGICAL_GROUP',
        composite_details: ''
      };

      render(<AssetFormModalHarness initialAsset={existingAsset} onClose={handleClose} />);

      // Modify name via harness button
      fireEvent.click(screen.getByRole('button', { name: 'แก้ไขชื่อ' }));

      // Press Escape or click cancel
      fireEvent.keyDown(window, { key: 'Escape' });

      // Discard confirmation alertdialog must appear
      expect(handleClose).not.toHaveBeenCalled();
      const alertdialog = screen.getByRole('alertdialog');
      expect(alertdialog).toBeInTheDocument();
      expect(screen.getByText('ข้อมูลเครื่องมือวัดยังไม่ได้บันทึก')).toBeInTheDocument();

      // Clicking "แก้ไขต่อ" cancels discard and stays open
      fireEvent.click(screen.getByRole('button', { name: /แก้ไขต่อ/i }));
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
      expect(handleClose).not.toHaveBeenCalled();

      // Attempt close again and confirm discard
      fireEvent.keyDown(window, { key: 'Escape' });
      expect(screen.getByRole('alertdialog')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: /ละทิ้งข้อมูลและปิด/i }));
      expect(handleClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('P2-1: Empty State Status Label in Asset Register', () => {
    it('displays accurate status label for ON_HOLD when no assets match', async () => {
      render(<AssetRegisterPage initialEntries={['/vcc/assets']} />);

      // Initial load: ACTIVE tab
      expect(await screen.findByText('ST002')).toBeInTheDocument();

      // Switch to ON_HOLD tab
      const onHoldTab = screen.getByRole('tab', { name: /^ระงับใช้$/i });
      fireEvent.click(onHoldTab);

      // In initial mock state without ON_HOLD assets, it should show label from getAssetStatusLabel
      expect(
        await screen.findByText(/ไม่พบรายการเครื่องมือในสถานะ ระงับใช้/i)
      ).toBeInTheDocument();

      // Must NOT display "ปลดออกแล้ว" in ON_HOLD tab
      expect(screen.queryByText(/ไม่พบรายการเครื่องมือในสถานะ ปลดออกแล้ว/i)).not.toBeInTheDocument();
    });
  });
});
