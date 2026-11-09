import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { vccDialogStack, vccDialogElements, syncInertState } from '../hooks/useVccModalAccessibility';
import { PlanFormModal, PlanItemModal, PlanSettingsModal, PlanHistoryModal } from '../components/AnnualPlanModals';
import { CreateWorkOrderModal } from '../components/WorkOrderModals';
import { AssetFormModal, AssetStatusModal } from '../components/AssetRegisterModals';
import { AssetDetailDrawer } from '../components/AssetDetailDrawer';

describe('VCC Critical UX Bugfix — Modal Interaction Verification Inside #root', () => {
  let rootEl;

  beforeEach(() => {
    // Reset global dialog stacks
    vccDialogStack.length = 0;
    vccDialogElements.clear();

    // Create a realistic DOM root simulating apps/web/index.html
    rootEl = document.createElement('div');
    rootEl.id = 'root';
    document.body.appendChild(rootEl);
    syncInertState();
  });

  afterEach(() => {
    vccDialogStack.length = 0;
    vccDialogElements.clear();
    syncInertState();
    if (rootEl && rootEl.parentNode) {
      rootEl.parentNode.removeChild(rootEl);
    }
  });

  it('1. PlanFormModal: Can type inputs, change selects, and click buttons without being frozen by inert on #root', () => {
    const handleClose = vi.fn();
    const handleSubmit = vi.fn((e) => e.preventDefault());
    const setForm = vi.fn();

    // Clean form so clicking cancel calls onClose directly
    const form = {
      plan_year: '',
      department: '',
      document_code: '',
      revision: '',
      title: '',
      due_date_rule: 'END_OF_MONTH'
    };

    render(
      <PlanFormModal
        open={true}
        onClose={handleClose}
        form={form}
        setForm={setForm}
        error={null}
        saving={false}
        onSubmit={handleSubmit}
        activeDepartments={[{ code: 'QC', name: 'ฝ่ายควบคุมคุณภาพ' }]}
      />,
      { container: rootEl }
    );

    // #root MUST NOT be inert because it contains an active dialog!
    expect(rootEl.hasAttribute('inert')).toBe(false);
    expect(rootEl.hasAttribute('aria-hidden')).toBe(false);

    // Dialog must not be inert
    const dialog = screen.getByRole('dialog');
    expect(dialog.hasAttribute('inert')).toBe(false);

    // Inputs can be typed into
    const yearInput = rootEl.querySelector('#plan_year');
    expect(yearInput).toBeTruthy();
    fireEvent.change(yearInput, { target: { value: '2026' } });
    expect(setForm).toHaveBeenCalled();

    // Buttons can be clicked
    const cancelBtn = screen.getByRole('button', { name: /ยกเลิก/i });
    fireEvent.click(cancelBtn);
    expect(handleClose).toHaveBeenCalled();
  });

  it('2. PlanItemModal: Can select asset, toggle planned month buttons, and submit without interaction blocking', () => {
    const handleClose = vi.fn();
    const handleSubmit = vi.fn((e) => e.preventDefault());
    const setItemForm = vi.fn();

    const itemForm = {
      asset_id: 'a1',
      provider_name: 'NIMT',
      responsible_dept: 'QC',
      frequency_label: 'รายปี',
      planned_months: [3, 9],
      remarks: 'ทวนสอบรอบพิเศษ',
      mpe: '±0.05 mm',
      calibration_points: '0, 25, 50, 75, 100 mm',
      acceptance_criteria: 'Error ≤ MPE'
    };

    const plan = {
      id: 'p1',
      plan_year: 2026,
      department: 'QC',
      due_date_rule: 'END_OF_MONTH'
    };

    const activeAssets = [
      { id: 'a1', asset_code: 'CAL-001', name: 'Vernier Caliper', department: 'QC' }
    ];

    render(
      <PlanItemModal
        open={true}
        onClose={handleClose}
        plan={plan}
        itemForm={itemForm}
        setItemForm={setItemForm}
        error={null}
        saving={false}
        onSubmit={handleSubmit}
        activeAssets={activeAssets}
        providers={['NIMT']}
        activeDepartments={[{ code: 'QC', name: 'QC', nameTh: 'ฝ่ายควบคุมคุณภาพ' }]}
      />,
      { container: rootEl }
    );

    expect(rootEl.hasAttribute('inert')).toBe(false);

    // Month toggle buttons can be clicked
    const month3Btn = screen.getByRole('button', { name: 'เดือน 3' });
    expect(month3Btn).toBeTruthy();
    fireEvent.click(month3Btn);
    expect(setItemForm).toHaveBeenCalled();

    // Form inputs can be typed
    const mpeInput = screen.getByDisplayValue('±0.05 mm');
    fireEvent.change(mpeInput, { target: { value: '±0.02 mm' } });
    expect(setItemForm).toHaveBeenCalled();

    // Submit button can be clicked and form submitted
    const saveBtn = screen.getByRole('button', { name: /บันทึกรายการในแผน/i });
    expect(saveBtn).not.toBeDisabled();
    const formEl = screen.getByRole('dialog').querySelector('form');
    fireEvent.submit(formEl);
    expect(handleSubmit).toHaveBeenCalled();
  });

  it('3. PlanSettingsModal: Can switch tabs between general and configured profiles, and type in fields', async () => {
    const handleClose = vi.fn();
    const onSave = vi.fn();

    render(
      <PlanSettingsModal
        open={true}
        onClose={handleClose}
        draftProviders={['NIMT', 'SGS']}
        setDraftProviders={vi.fn()}
        newProvider=""
        setNewProvider={vi.fn()}
        draftSettings={{}}
        setDraftSettings={vi.fn()}
        saving={false}
        onSave={onSave}
      />,
      { container: rootEl }
    );

    expect(rootEl.hasAttribute('inert')).toBe(false);

    // Tabs can be switched
    const profilesTab = screen.getByRole('button', { name: /แบบฟอร์มและผู้รับผิดชอบตามแผนก/i });
    fireEvent.click(profilesTab);
    expect(await screen.findByLabelText('แผนกที่ตั้งค่าแล้ว')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'QC' })).toBeInTheDocument();

    const generalTab = screen.getByRole('button', { name: /ทั่วไปและหน่วยงานทวนสอบ/i });
    fireEvent.click(generalTab);
    expect(screen.getByText(/รายชื่อสถาบัน \/ หน่วยงานที่ทวนสอบ/i)).toBeInTheDocument();
  });

  it('4. CreateWorkOrderModal: Can select mode, plan, asset, and click buttons inside #root', () => {
    const handleClose = vi.fn();
    const handleSubmit = vi.fn((e) => e.preventDefault());
    const setForm = vi.fn();

    const form = {
      mode: 'PLAN_BASED',
      plan_id: 'p1',
      plan_item_id: 'pi1',
      planned_month: 3,
      asset_id: 'a1',
      provider_name: 'NIMT',
      due_date: '2026-03-31'
    };

    render(
      <CreateWorkOrderModal
        open={true}
        onClose={handleClose}
        form={form}
        setForm={setForm}
        error={null}
        saving={false}
        onSubmit={handleSubmit}
        approvedPlans={[{ id: 'p1', plan_year: 2026, department: 'QC', title: 'แผน 2026' }]}
        planItems={[{ id: 'pi1', plan_id: 'p1', asset_id: 'a1', asset_code: 'CAL-01', asset_name: 'Caliper' }]}
        individualAssets={[]}
        providers={['NIMT']}
      />,
      { container: rootEl }
    );

    expect(rootEl.hasAttribute('inert')).toBe(false);

    const dialog = screen.getByRole('dialog');
    expect(dialog.hasAttribute('inert')).toBe(false);

    // Cancel button clickable
    const cancelBtn = screen.getByRole('button', { name: /ยกเลิก/i });
    fireEvent.click(cancelBtn);
    expect(handleClose).toHaveBeenCalled();
  });

  it('5. AssetFormModal: Can interact with inputs, dropdowns and action buttons inside #root', () => {
    const setFormOpen = vi.fn();
    const setForm = vi.fn();
    const handleSaveAsset = vi.fn((e) => e.preventDefault());

    const assetForm = {
      asset_code: 'MIC-001',
      name: 'Digital Micrometer',
      asset_type: 'MICROMETER',
      serial_no: 'SN123456',
      model: 'MD-50',
      location: 'LAB Room 1',
      department: 'QC',
      is_group: false
    };

    render(
      <AssetFormModal
        formOpen={true}
        setFormOpen={setFormOpen}
        form={assetForm}
        setForm={setForm}
        formError={null}
        savingForm={false}
        handleSaveAsset={handleSaveAsset}
        formTypeOptions={['MICROMETER', 'CALIPER']}
        assetTypes={['MICROMETER', 'CALIPER']}
        activeDepartments={[{ code: 'QC', name: 'ควบคุมคุณภาพ' }]}
      />,
      { container: rootEl }
    );

    expect(rootEl.hasAttribute('inert')).toBe(false);

    const codeInput = screen.getByDisplayValue('MIC-001');
    fireEvent.change(codeInput, { target: { value: 'MIC-002' } });
    expect(setForm).toHaveBeenCalled();
  });

  it('6. AssetStatusModal: Can type retirement reason and submit', () => {
    const setStatusModal = vi.fn();
    const setStatusReason = vi.fn();
    const handleConfirmStatus = vi.fn();

    render(
      <AssetStatusModal
        statusModal={{ mode: 'RETIRE', asset: { id: 'a1', asset_code: 'MIC-001', name: 'Micrometer' } }}
        setStatusModal={setStatusModal}
        statusReason=""
        setStatusReason={setStatusReason}
        statusError={null}
        statusImpact={null}
        savingStatus={false}
        handleConfirmStatusChange={handleConfirmStatus}
      />,
      { container: rootEl }
    );

    expect(rootEl.hasAttribute('inert')).toBe(false);

    const reasonInput = screen.getByPlaceholderText(/ระบุสาเหตุ เช่น ชำรุดไม่สามารถซ่อมได้/i);
    fireEvent.change(reasonInput, { target: { value: 'ชำรุดเกินซ่อม' } });
    expect(setStatusReason).toHaveBeenCalled();
  });

  it('7. PlanHistoryModal & AssetDetailDrawer: Drawers and modals allow clicking close and inspecting contents', () => {
    const handleClose = vi.fn();
    const { unmount } = render(
      <PlanHistoryModal
        open={true}
        onClose={handleClose}
        history={[{ id: 'h1', action: 'VCC_PLAN_CREATED', created_at: '2026-11-01T10:00:00Z', actor_name: 'Admin' }]}
      />,
      { container: rootEl }
    );

    expect(rootEl.hasAttribute('inert')).toBe(false);
    expect(screen.getByText(/ประวัติการอนุมัติและแก้ไขแผน/i)).toBeInTheDocument();

    const closeBtn = screen.getByLabelText('ปิดหน้าต่าง');
    fireEvent.click(closeBtn);
    expect(handleClose).toHaveBeenCalled();

    unmount();

    // AssetDetailDrawer
    const handleDrawerClose = vi.fn();
    render(
      <AssetDetailDrawer
        isOpen={true}
        onClose={handleDrawerClose}
        data={{ asset: { id: 'a1', asset_code: 'VER-001', name: 'Caliper' }, history: [] }}
      />
    );

    // Portaled drawer should be rendered and interactive
    expect(screen.getByText(/VER-001/)).toBeInTheDocument();
  });

  it('8. Multi-layer interaction: Dirty modal opens VccDiscardConfirmDialog; lower modal becomes inert, confirm dialog is clickable, dismissing restores interaction', () => {
    const handleClose = vi.fn();

    const form = {
      plan_year: 2026,
      department: 'QC',
      document_code: 'FM-QC-46',
      revision: '01',
      title: 'แผนทดสอบ',
      due_date_rule: 'END_OF_MONTH'
    };

    // Render dirty PlanFormModal inside #root
    render(
      <PlanFormModal
        open={true}
        onClose={handleClose}
        form={form}
        setForm={vi.fn()}
        error={null}
        saving={false}
        onSubmit={vi.fn()}
        activeDepartments={[{ code: 'QC', name: 'QC' }]}
      />,
      { container: rootEl }
    );

    const dialog = screen.getByRole('dialog');
    expect(dialog.hasAttribute('inert')).toBe(false);
    expect(rootEl.hasAttribute('inert')).toBe(false);

    // Simulate click on close button (or X) when dirty -> triggers VccDiscardConfirmDialog
    const xBtn = screen.getByLabelText('ปิดหน้าต่าง');
    fireEvent.click(xBtn);

    // VccDiscardConfirmDialog (role="alertdialog") is now open
    const alertDialog = screen.getByRole('alertdialog');
    expect(alertDialog).toBeTruthy();
    expect(alertDialog.hasAttribute('inert')).toBe(false);

    // The lower modal is now inert to prevent concurrent interaction
    expect(dialog.hasAttribute('inert')).toBe(true);

    // Click "แก้ไขต่อ" (Cancel Discard) in VccDiscardConfirmDialog
    const resumeBtn = screen.getByRole('button', { name: /แก้ไขต่อ/i });
    fireEvent.click(resumeBtn);

    // Alert dialog is closed
    expect(screen.queryByRole('alertdialog')).toBeNull();

    // Lower modal is restored to interactive (inert removed)
    expect(dialog.hasAttribute('inert')).toBe(false);
    expect(rootEl.hasAttribute('inert')).toBe(false);
  });
});
