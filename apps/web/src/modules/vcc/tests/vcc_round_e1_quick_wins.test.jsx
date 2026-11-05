import React, { useState } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, useLocation } from 'react-router-dom';
import toast from 'react-hot-toast';
import useStore from '../../../store/useStore';
import AssetRegisterPage from '../pages/AssetRegisterPage';
import WorkOrderSection from '../components/WorkOrderSection';
import { resetVccLocalStore } from '../api/vccApi';
import * as dashApi from '../api/vccDashboardApi';
import { AssetFormModal } from '../components/AssetRegisterModals';
import { RecordResultModal } from '../components/RecordResultModal';
import { CreateWorkOrderModal } from '../components/WorkOrderModals';
import VccDashboardSection from '../components/VccDashboardSection';

const SAMPLE_DEPTS = [
  { code: 'QC', name_th: 'ควบคุมคุณภาพ', status: 'ACTIVE' },
  { code: 'WH', name_th: 'คลังสินค้า', status: 'ACTIVE' },
  { code: 'DC', name_th: 'ควบคุมเอกสาร', status: 'ACTIVE' }
];

// Spy component to inspect search params and path changes in MemoryRouter
let currentTestLocation = null;
const LocationTracker = () => {
  currentTestLocation = useLocation();
  return null;
};

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

describe('VCC Refinement Round E1 — Quick Wins Integration & Quality Fixes', () => {
  beforeEach(() => {
    resetVccLocalStore();
    currentTestLocation = null;
    vi.restoreAllMocks();
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

  describe('P1-1: Real Component Provider Selection & Validation (Ad-hoc Work Order)', () => {
    it('initializes provider_name as empty string and blocks submission with placeholder or empty provider via real handler', async () => {
      render(
        <MemoryRouter initialEntries={['/vcc/work-orders']}>
          <WorkOrderSection activeDepartments={SAMPLE_DEPTS} />
        </MemoryRouter>
      );

      // Wait for table data to finish loading
      expect(await screen.findByText('WO-2026-001')).toBeInTheDocument();

      // Open create work order modal
      const createBtn = screen.getByRole('button', { name: /สร้างใบสั่งงาน/i });
      fireEvent.click(createBtn);

      expect(screen.getByRole('dialog')).toBeInTheDocument();

      // Switch to Ad-hoc mode
      const adhocRadio = screen.getByLabelText(/ใบสั่งงานนอกแผน/i);
      fireEvent.click(adhocRadio);

      // Verify Provider dropdown starts with placeholder option selected and empty value
      const providerSelect = screen.getByLabelText(/หน่วยงานที่ทวนสอบ/i);
      expect(providerSelect.value).toBe('');
      expect(screen.getByText('-- เลือกหน่วยงานที่ทวนสอบ --')).toBeInTheDocument();

      // Select an asset
      const assetSelect = screen.getByLabelText(/เลือกเครื่องมือรายตัว/i);
      fireEvent.change(assetSelect, { target: { value: 'vcc-seed-st002' } });

      // Attempt submit without choosing provider (leaving it empty / placeholder)
      const form = screen.getByRole('dialog').querySelector('form');
      expect(form).toBeTruthy();
      fireEvent.submit(form);

      // Real handleCreateSubmit validates and displays Thai error
      expect(await screen.findByText('กรุณาระบุสถาบัน/หน่วยงานที่ทวนสอบ')).toBeInTheDocument();

      // Select a valid provider
      fireEvent.change(providerSelect, { target: { value: 'ห้องปฏิบัติการภายนอก' } });

      // Submit again with valid provider -> modal closes and work order is created
      fireEvent.submit(form);

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
    });

    it('CreateWorkOrderModal provides disabled placeholder prompt option', () => {
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
      const placeholderOpt = screen.getByText('-- เลือกหน่วยงานที่ทวนสอบ --');
      expect(placeholderOpt).toBeInTheDocument();
      expect(placeholderOpt).toHaveAttribute('disabled');
    });
  });

  describe('P1-2: RecordResultModal Provider Quick Chips & Datalist', () => {
    it('renders datalist options and quick chips for configured providers', async () => {
      const providersList = ['สถาบันมาตรวิทยาแห่งชาติ (NIMT)', 'บจก. แคลิเบรชั่น แล็บ'];
      render(<RecordResultModalHarness providers={providersList} />);

      // Switch to TRACEABILITY tab
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

  describe('P1-3: Deep-link & Dashboard Alert Fallbacks', () => {
    it('opens drawer on matching UUID, retains ?wo in URL, and removes param upon drawer close', async () => {
      render(
        <MemoryRouter initialEntries={['/vcc/work-orders?wo=vcc-wo-seed-st002']}>
          <LocationTracker />
          <WorkOrderSection activeDepartments={SAMPLE_DEPTS} />
        </MemoryRouter>
      );

      // Drawer opens for matching work order
      expect(await screen.findByRole('heading', { name: 'WO-2026-001' })).toBeInTheDocument();

      // Query parameter is NOT prematurely deleted — maintains position for refresh & direct URL
      expect(currentTestLocation.search).toBe('?wo=vcc-wo-seed-st002');

      // Closing drawer removes ?wo from search params
      const closeDrawerBtn = screen.getByLabelText(/ปิดหน้าต่างรายละเอียด/i);
      fireEvent.click(closeDrawerBtn);

      await waitFor(() => {
        expect(screen.queryByRole('heading', { name: 'WO-2026-001' })).not.toBeInTheDocument();
      });
      expect(currentTestLocation.search).toBe('');
    });

    it('opens drawer on matching Work Order Code deep-link', async () => {
      render(
        <MemoryRouter initialEntries={['/vcc/work-orders?wo=WO-2026-001']}>
          <WorkOrderSection activeDepartments={SAMPLE_DEPTS} />
        </MemoryRouter>
      );

      expect(await screen.findByRole('heading', { name: 'WO-2026-001' })).toBeInTheDocument();
    });

    it('shows toast error and cleans up invalid param when deep-linked work order does not exist', async () => {
      const toastSpy = vi.spyOn(toast, 'error');
      render(
        <MemoryRouter initialEntries={['/vcc/work-orders?wo=non-existent-wo-xyz']}>
          <LocationTracker />
          <WorkOrderSection activeDepartments={SAMPLE_DEPTS} />
        </MemoryRouter>
      );

      expect(await screen.findByText('WO-2026-001')).toBeInTheDocument();
      expect(toastSpy).toHaveBeenCalledWith('ไม่พบใบสั่งงานที่ระบุ หรือคุณไม่มีสิทธิ์ดูใบสั่งงานนี้');
      await waitFor(() => {
        expect(currentTestLocation.search).toBe('');
      });
    });

    it('handles Certificate Expiry alert without wo_id by navigating to asset details rather than wrong work order', async () => {
      const handleNavigateWo = vi.fn();
      const handleNavigateAsset = vi.fn();

      vi.spyOn(dashApi, 'fetchVccDashboard').mockResolvedValue({
        equipment_kpi: {},
        work_order_kpi: {},
        certificate_kpi: {},
        monthly_comparison: [],
        department_breakdown: [],
        alerts: [
          {
            dedupe_key: 'alert-cert-1',
            alert_type: 'CERT_EXPIRED',
            severity: 'CRITICAL',
            asset_id: 'vcc-seed-st002',
            asset_code: 'ST002',
            asset_name: 'เทอร์โมมิเตอร์มาตรฐาน',
            department: 'QC',
            certificate_no: 'CERT-EXP-99',
            message: 'ใบรับรองการสอบเทียบหมดอายุแล้ว',
            recommended_action: 'ดำเนินการสอบเทียบใหม่'
          },
          {
            dedupe_key: 'alert-wo-1',
            alert_type: 'OVERDUE',
            severity: 'HIGH',
            wo_id: 'vcc-wo-seed-st002',
            wo_code: 'WO-2026-001',
            asset_id: 'vcc-seed-st002',
            asset_code: 'ST002',
            asset_name: 'เทอร์โมมิเตอร์มาตรฐาน',
            department: 'QC',
            message: 'เลยกำหนดสอบเทียบ',
            recommended_action: 'เร่งส่งเครื่องมือ'
          }
        ]
      });

      render(
        <MemoryRouter>
          <VccDashboardSection
            onNavigateToWorkOrders={handleNavigateWo}
            onNavigateToAsset={handleNavigateAsset}
          />
        </MemoryRouter>
      );

      // Verify certificate alert displays "ดูข้อมูลเครื่องมือ" button
      const viewAssetBtn = await screen.findByRole('button', { name: /ดูข้อมูลเครื่องมือ/i });
      expect(viewAssetBtn).toBeInTheDocument();

      fireEvent.click(viewAssetBtn);
      expect(handleNavigateAsset).toHaveBeenCalledWith('vcc-seed-st002');
      expect(handleNavigateWo).not.toHaveBeenCalled();

      // Verify work order alert displays "จัดการใบงาน" button
      const manageWoBtn = screen.getByRole('button', { name: /จัดการใบงาน/i });
      expect(manageWoBtn).toBeInTheDocument();

      fireEvent.click(manageWoBtn);
      expect(handleNavigateWo).toHaveBeenCalledWith('vcc-wo-seed-st002');
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

      // Press Escape
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
