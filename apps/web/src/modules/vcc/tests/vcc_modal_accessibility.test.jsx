import React, { useState, useRef } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { vccDialogStack, vccDialogElements, syncInertState } from '../hooks/useVccModalAccessibility';
import { VccModalShell } from '../components/VccModalShell';
import { RecordResultModal } from '../components/RecordResultModal';
import { CreateWorkOrderModal } from '../components/WorkOrderModals';
import VccNotificationSettingsModal from '../components/VccNotificationSettingsModal';

// Test component simulating a real-world enterprise form modal
const TestFormModal = ({ isOpen, onClose, isDirty = false }) => {
  return (
    <VccModalShell
      isOpen={isOpen}
      onClose={onClose}
      title="ฟอร์มบันทึกข้อมูลการทวนสอบ"
      subtitle="กรุณากรอกข้อมูลให้ครบถ้วน"
      isDirty={isDirty}
      discardTitle="ละทิ้งข้อมูลที่แก้ไข?"
      discardMessage="คุณมีข้อมูลที่ยังไม่ได้บันทึก ต้องการยกเลิกใช่หรือไม่?"
    >
      <div className="p-4 space-y-3">
        <label htmlFor="field-1">ชื่อเครื่องมือ</label>
        <input id="field-1" data-testid="input-1" type="text" />

        <label htmlFor="field-2">หมายเหตุ</label>
        <input id="field-2" data-testid="input-2" type="text" />

        <div className="flex gap-2">
          <button type="button" data-testid="btn-cancel" onClick={onClose}>
            ยกเลิก
          </button>
          <button type="submit" data-testid="btn-save">
            บันทึก
          </button>
        </div>
      </div>
    </VccModalShell>
  );
};

// Parent host harness testing focus restoration
const Harness = ({ isDirty = false }) => {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef(null);

  return (
    <div>
      <button
        ref={triggerRef}
        data-testid="open-modal-btn"
        onClick={() => setOpen(true)}
      >
        เปิดหน้าต่าง
      </button>

      <TestFormModal
        isOpen={open}
        onClose={() => setOpen(false)}
        isDirty={isDirty}
      />
    </div>
  );
};

// Real Form Harnesses for Integration Tests
const RealRecordResultHarness = ({ initialWorkOrder, onClose }) => {
  const [workOrder, setWorkOrder] = useState(initialWorkOrder);
  const [form, setForm] = useState({
    performed_at: '2026-11-04',
    result_status: 'PASS',
    certificate_no: 'CERT-001',
    certificate_issue_date: '2026-11-04',
    certificate_valid_until: '2027-11-04',
    acceptance_criteria: '±0.5 mm',
    result_remarks: '',
    calibration_provider_name: 'NIMT',
    calibration_method: 'WI-01',
    traceability_ref: 'STD-01',
    environmental_conditions: '23C, 50%RH',
    uncertainty_value: '±0.01',
    calibration_error_value: '0.00',
    certificate_file: null
  });

  return (
    <div>
      <button
        data-testid="switch-wo-btn"
        onClick={() => setWorkOrder({ id: 'wo-2', wo_code: 'WO-2026-0002', asset_code: 'ASSET-2', asset_name: 'Micrometer' })}
      >
        Switch WO
      </button>
      <button
        data-testid="parent-close-btn"
        onClick={() => setWorkOrder(null)}
      >
        Parent Close
      </button>
      <RecordResultModal
        workOrder={workOrder}
        onClose={onClose}
        onCancelSwitch={(activeWo) => setWorkOrder(activeWo)}
        form={form}
        setForm={setForm}
        onSubmit={(e) => { e.preventDefault(); }}
        criteriaOptions={['±0.5 mm', '±1.0 mm']}
      />
    </div>
  );
};

const RealCreateWorkOrderHarness = ({ onClose }) => {
  const [form, setForm] = useState({
    mode: 'PLAN',
    plan_id: 'plan-1',
    plan_item_id: 'item-1',
    planned_month: 3,
    child_asset_id: '',
    asset_id: 'asset-1',
    provider_name: 'Internal DCC',
    due_date: '2026-12-01'
  });

  return (
    <CreateWorkOrderModal
      open={true}
      onClose={onClose}
      form={form}
      setForm={setForm}
      approvedPlans={[{ id: 'plan-1', plan_year: 2026, department: 'QA', title: 'Plan QA' }]}
      planItems={[{ id: 'item-1', asset_id: 'asset-1', asset_code: 'V-01', asset_name: 'Vernier', planned_months: [3] }]}
      individualAssets={[{ id: 'asset-1', asset_code: 'V-01', name: 'Vernier' }]}
      providers={['Internal DCC', 'External Lab']}
    />
  );
};

const RealNotificationSettingsHarness = ({ onClose }) => {
  const [monthlyDueSoonText, setMonthlyDueSoonText] = useState('7, 3');
  const [monthlyOverdueText, setMonthlyOverdueText] = useState('1, 3');
  const [annualDueSoonText, setAnnualDueSoonText] = useState('30, 14');
  const [annualOverdueText, setAnnualOverdueText] = useState('1, 7');
  const [reviewSlaDays, setReviewSlaDays] = useState(3);

  return (
    <VccNotificationSettingsModal
      isOpen={true}
      onClose={onClose}
      onSubmit={(e) => { e.preventDefault(); }}
      monthlyDueSoonText={monthlyDueSoonText}
      setMonthlyDueSoonText={setMonthlyDueSoonText}
      monthlyOverdueText={monthlyOverdueText}
      setMonthlyOverdueText={setMonthlyOverdueText}
      annualDueSoonText={annualDueSoonText}
      setAnnualDueSoonText={setAnnualDueSoonText}
      annualOverdueText={annualOverdueText}
      setAnnualOverdueText={setAnnualOverdueText}
      reviewSlaDays={reviewSlaDays}
      setReviewSlaDays={setReviewSlaDays}
    />
  );
};

describe('VCC UX/UI Round D2 — Enterprise Modal Accessibility Tests', () => {
  beforeEach(() => {
    // Reset any lingering dialog stack and inert states
    vccDialogStack.length = 0;
    vccDialogElements.clear();
    syncInertState();
    document.body.style.overflow = '';
    document.body.style.paddingRight = '';
  });

  it('1. ARIA_Semantics: Modal renders role="dialog", aria-modal="true", and linked aria-labelledby', () => {
    render(<TestFormModal isOpen={true} onClose={vi.fn()} isDirty={false} />);

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeTruthy();
    expect(dialog.getAttribute('aria-modal')).toBe('true');

    const title = screen.getByText('ฟอร์มบันทึกข้อมูลการทวนสอบ');
    expect(title.id).toBeTruthy();
    expect(dialog.getAttribute('aria-labelledby')).toBe(title.id);

    // Accessible close button
    const closeBtn = screen.getByLabelText('ปิดหน้าต่าง');
    expect(closeBtn).toBeTruthy();
  });

  it('2. Focus_Trap: Keyboard Tab and Shift+Tab wrap within modal focusable elements', () => {
    render(<TestFormModal isOpen={true} onClose={vi.fn()} isDirty={false} />);

    const closeBtn = screen.getByLabelText('ปิดหน้าต่าง');
    const saveBtn = screen.getByTestId('btn-save');

    // Simulate Tab on last focusable element (saveBtn) -> Wraps to first (closeBtn)
    saveBtn.focus();
    expect(document.activeElement).toBe(saveBtn);

    fireEvent.keyDown(window, { key: 'Tab' });
    expect(document.activeElement).toBe(closeBtn);

    // Simulate Shift+Tab on first focusable element (closeBtn) -> Wraps to last (saveBtn)
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(saveBtn);
  });

  it('3. Escape_Key_Handling: Clean form closes immediately on Escape key', () => {
    const handleClose = vi.fn();
    render(<TestFormModal isOpen={true} onClose={handleClose} isDirty={false} />);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('4. Dirty_Form_Protection: Intercepts Escape and triggers Discard Confirmation Dialog', () => {
    const handleClose = vi.fn();
    render(<TestFormModal isOpen={true} onClose={handleClose} isDirty={true} />);

    // Press Escape -> Must NOT close modal; must open confirmation dialog
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(handleClose).not.toHaveBeenCalled();

    // Confirmation dialog appears with role="alertdialog"
    const alertDialog = screen.getByRole('alertdialog');
    expect(alertDialog).toBeTruthy();
    expect(alertDialog.getAttribute('aria-modal')).toBe('true');
    expect(screen.getByText('ละทิ้งข้อมูลที่แก้ไข?')).toBeTruthy();
  });

  it('5. Discard_Confirmation_Default_Safe_Action: Focus defaults to "แก้ไขต่อ" to prevent accidental data loss', async () => {
    const handleClose = vi.fn();
    render(<TestFormModal isOpen={true} onClose={handleClose} isDirty={true} />);

    // Trigger discard dialog via close button
    const closeBtn = screen.getByLabelText('ปิดหน้าต่าง');
    fireEvent.click(closeBtn);

    expect(screen.getByRole('alertdialog')).toBeTruthy();

    // Safe button ("แก้ไขต่อ") must be present and focused
    const cancelDiscardBtn = screen.getByRole('button', { name: /แก้ไขต่อ/i });
    expect(cancelDiscardBtn).toBeTruthy();

    await waitFor(() => {
      expect(document.activeElement).toBe(cancelDiscardBtn);
    });

    // Pressing Enter or clicking "แก้ไขต่อ" cancels discard and stays on modal
    fireEvent.click(cancelDiscardBtn);
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(handleClose).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('6. Discard_Confirmation_Confirm: Clicking "ละทิ้งข้อมูล" confirms discard and calls onClose', () => {
    const handleClose = vi.fn();
    render(<TestFormModal isOpen={true} onClose={handleClose} isDirty={true} />);

    const closeBtn = screen.getByLabelText('ปิดหน้าต่าง');
    fireEvent.click(closeBtn);

    const confirmBtn = screen.getByRole('button', { name: /ละทิ้งข้อมูล/i });
    fireEvent.click(confirmBtn);

    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('7. Nested_Dialog_Stack: Topmost dialog exclusively intercepts Escape', () => {
    const handleClose = vi.fn();
    render(<TestFormModal isOpen={true} onClose={handleClose} isDirty={true} />);

    // Trigger nested alertdialog
    fireEvent.click(screen.getByLabelText('ปิดหน้าต่าง'));
    expect(screen.getByRole('alertdialog')).toBeTruthy();

    // Verify dialog stack depth
    expect(vccDialogStack.length).toBe(2);

    // Pressing Escape while alertdialog is open closes ONLY the alertdialog
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(handleClose).not.toHaveBeenCalled();
    expect(vccDialogStack.length).toBe(1);
  });

  it('8. Body_Scroll_Lock_And_Restoration: Body overflow locked while open and restored when closed', () => {
    const { rerender } = render(<TestFormModal isOpen={true} onClose={vi.fn()} isDirty={false} />);
    expect(document.body.style.overflow).toBe('hidden');

    rerender(<TestFormModal isOpen={false} onClose={vi.fn()} isDirty={false} />);
    expect(document.body.style.overflow).toBe('');
  });

  it('9. Focus_Restoration: Focus returns to triggering element when modal closes', async () => {
    render(<Harness isDirty={false} />);

    const openBtn = screen.getByTestId('open-modal-btn');
    openBtn.focus();
    expect(document.activeElement).toBe(openBtn);

    // Open modal
    fireEvent.click(openBtn);
    expect(screen.getByRole('dialog')).toBeTruthy();

    // Close modal via Escape
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();

    // Focus restored back to open button
    await waitFor(() => {
      expect(document.activeElement).toBe(openBtn);
    });
  });

  /* ─────────────────────────────────────────────────────────────────────────────
   * REAL FORM INTEGRATION & REGRESSION TESTS
   * ───────────────────────────────────────────────────────────────────────────── */

  it('10. RealForm_RecordResultModal: Clean initial state dismisses immediately on Escape', () => {
    const handleClose = vi.fn();
    const wo = { id: 'wo-1', wo_code: 'WO-2026-0001', asset_code: 'ASSET-1', asset_name: 'Caliper' };
    render(<RealRecordResultHarness initialWorkOrder={wo} onClose={handleClose} />);

    expect(screen.getByRole('dialog')).toBeTruthy();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(handleClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('11. RealForm_RecordResultModal: Editing certificate_no triggers dirty form protection on Escape and Backdrop', () => {
    const handleClose = vi.fn();
    const wo = { id: 'wo-1', wo_code: 'WO-2026-0001', asset_code: 'ASSET-1', asset_name: 'Caliper' };
    render(<RealRecordResultHarness initialWorkOrder={wo} onClose={handleClose} />);

    const certInput = screen.getByLabelText('เลขที่ใบรับรอง');
    fireEvent.change(certInput, { target: { value: 'CERT-MODIFIED-999' } });

    // Press Escape -> Should be blocked and open alertdialog
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(handleClose).not.toHaveBeenCalled();

    const alertDialog = screen.getByRole('alertdialog');
    expect(alertDialog).toBeTruthy();
    expect(screen.getByText('ข้อมูลผลการสอบเทียบยังไม่ได้บันทึก')).toBeTruthy();

    // Clicking "แก้ไขต่อ" cancels discard and preserves form
    const cancelDiscardBtn = screen.getByRole('button', { name: /แก้ไขต่อ/i });
    fireEvent.click(cancelDiscardBtn);
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(handleClose).not.toHaveBeenCalled();

    // Clicking close "X" also triggers discard prompt
    fireEvent.click(screen.getByLabelText('ปิดหน้าต่าง'));
    expect(screen.getByRole('alertdialog')).toBeTruthy();

    // Confirm discard
    const confirmBtn = screen.getByRole('button', { name: /ละทิ้งข้อมูลและปิด/i });
    fireEvent.click(confirmBtn);
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('12. RealForm_CreateWorkOrderModal: Initial state with prefilled data is NOT dirty; closes cleanly', () => {
    const handleClose = vi.fn();
    render(<RealCreateWorkOrderHarness onClose={handleClose} />);

    expect(screen.getByRole('dialog')).toBeTruthy();
    // Clean escape without modifying anything
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(handleClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('13. RealForm_CreateWorkOrderModal: Modifying form values activates discard prompt', () => {
    const handleClose = vi.fn();
    render(<RealCreateWorkOrderHarness onClose={handleClose} />);

    // Switch mode to ADHOC
    const adhocRadio = screen.getByLabelText(/ใบสั่งงานนอกแผน/i);
    fireEvent.click(adhocRadio);

    // Try closing via Cancel button
    const cancelBtn = screen.getByRole('button', { name: 'ยกเลิก' });
    fireEvent.click(cancelBtn);

    expect(handleClose).not.toHaveBeenCalled();
    const alertDialog = screen.getByRole('alertdialog');
    expect(alertDialog).toBeTruthy();
    expect(screen.getByText('ข้อมูลใบสั่งงานยังไม่ได้บันทึก')).toBeTruthy();

    // Confirm discard
    fireEvent.click(screen.getByRole('button', { name: /ละทิ้งข้อมูลและปิด/i }));
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('14. RealForm_VccNotificationSettingsModal: Clean settings close cleanly; edited values trigger discard prompt', () => {
    const handleClose = vi.fn();
    render(<RealNotificationSettingsHarness onClose={handleClose} />);

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeTruthy();

    // Edit monthly due soon field
    const input = screen.getByLabelText('งานรายเดือน แจ้งเตือนล่วงหน้า');
    fireEvent.change(input, { target: { value: '14, 7, 3' } });

    // Press Escape
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(handleClose).not.toHaveBeenCalled();

    // Prompt shown
    expect(screen.getByRole('alertdialog')).toBeTruthy();
    expect(screen.getByText('การตั้งค่าการแจ้งเตือนยังไม่ได้บันทึก')).toBeTruthy();

    // Click "แก้ไขต่อ"
    fireEvent.click(screen.getByRole('button', { name: /แก้ไขต่อ/i }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(handleClose).not.toHaveBeenCalled();

    // Click cancel button on form
    fireEvent.click(screen.getByRole('button', { name: 'ยกเลิก' }));
    expect(screen.getByRole('alertdialog')).toBeTruthy();

    // Confirm discard
    fireEvent.click(screen.getByRole('button', { name: /ละทิ้งข้อมูลและปิด/i }));
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('15. RealForm_RecordResultModal: Switching workOrder while dirty prompts confirmation; user can cancel or confirm', async () => {
    const handleClose = vi.fn();
    const wo1 = { id: 'wo-1', wo_code: 'WO-2026-0001', asset_code: 'ASSET-1', asset_name: 'Caliper' };
    render(<RealRecordResultHarness initialWorkOrder={wo1} onClose={handleClose} />);

    // Modify certificate_no on WO 1
    const certInput = screen.getByLabelText('เลขที่ใบรับรอง');
    fireEvent.change(certInput, { target: { value: 'CERT-MODIFIED' } });

    // Try switching to WO 2 while dirty
    fireEvent.click(screen.getByTestId('switch-wo-btn'));

    // Confirmation prompt must appear immediately
    expect(screen.getByRole('alertdialog')).toBeTruthy();
    expect(screen.getByText('คุณมีข้อมูลผลการสอบเทียบที่กำลังจัดทำ ต้องการยกเลิกและเปลี่ยนไปทำใบสั่งงานอื่นใช่หรือไม่?')).toBeTruthy();
    // Modal still displays WO 1 underneath
    expect(screen.getByText('WO-2026-0001')).toBeTruthy();

    // Cancel switch ("แก้ไขต่อ") -> remains on WO 1 with un-saved edit
    fireEvent.click(screen.getByRole('button', { name: /แก้ไขต่อ/i }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.getByText('WO-2026-0001')).toBeTruthy();
    expect(certInput.value).toBe('CERT-MODIFIED');

    // Click switch again and this time confirm discard
    fireEvent.click(screen.getByTestId('switch-wo-btn'));
    expect(screen.getByRole('alertdialog')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /ละทิ้งข้อมูลและปิด/i }));

    // Now switches to WO 2
    await waitFor(() => {
      expect(screen.getByText('WO-2026-0002')).toBeTruthy();
    });
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('16. RealForm_RecordResultModal: Parent-driven close while dirty prompts confirmation; prevents unannounced close', () => {
    const handleClose = vi.fn();
    const wo1 = { id: 'wo-1', wo_code: 'WO-2026-0001', asset_code: 'ASSET-1', asset_name: 'Caliper' };
    render(<RealRecordResultHarness initialWorkOrder={wo1} onClose={handleClose} />);

    // Modify form
    const certInput = screen.getByLabelText('เลขที่ใบรับรอง');
    fireEvent.change(certInput, { target: { value: 'CERT-DIRTY-WO1' } });

    // Parent attempts to close modal by setting workOrder = null
    fireEvent.click(screen.getByTestId('parent-close-btn'));

    // Modal does NOT vanish; alertdialog appears to prevent data loss (dialog is inert while alertdialog is active)
    expect(screen.getByRole('alertdialog')).toBeTruthy();
    expect(screen.getByRole('dialog', { hidden: true })).toBeTruthy();
    expect(handleClose).not.toHaveBeenCalled();

    // Clicking "แก้ไขต่อ" keeps modal open
    fireEvent.click(screen.getByRole('button', { name: /แก้ไขต่อ/i }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(handleClose).not.toHaveBeenCalled();

    // Clicking parent close again and confirming discard
    fireEvent.click(screen.getByTestId('parent-close-btn'));
    fireEvent.click(screen.getByRole('button', { name: /ละทิ้งข้อมูลและปิด/i }));
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('17. Background_Inertness: App background is inert when modal opens; lower modal is inert when nested alertdialog opens', async () => {
    // Create an app container simulating #root
    const rootEl = document.createElement('div');
    rootEl.id = 'root';
    const bgButton = document.createElement('button');
    bgButton.textContent = 'Background Action';
    rootEl.appendChild(bgButton);
    document.body.appendChild(rootEl);

    const { unmount } = render(<TestFormModal isOpen={true} onClose={vi.fn()} isDirty={true} />);

    // App root is marked inert and aria-hidden
    expect(rootEl.hasAttribute('inert')).toBe(true);
    expect(rootEl.getAttribute('aria-hidden')).toBe('true');

    const modalDialog = screen.getByRole('dialog');
    // Topmost modal is NOT inert
    expect(modalDialog.hasAttribute('inert')).toBe(false);

    // Open nested alertdialog
    fireEvent.click(screen.getByLabelText('ปิดหน้าต่าง'));
    expect(screen.getByRole('alertdialog')).toBeTruthy();

    // Lower-layer modal is now inert while alertdialog is active
    expect(modalDialog.hasAttribute('inert')).toBe(true);
    expect(modalDialog.getAttribute('aria-hidden')).toBe('true');

    // Dismiss alertdialog ("แก้ไขต่อ")
    fireEvent.click(screen.getByRole('button', { name: /แก้ไขต่อ/i }));
    expect(screen.queryByRole('alertdialog')).toBeNull();

    // Modal is topmost again -> inert removed
    expect(modalDialog.hasAttribute('inert')).toBe(false);
    expect(modalDialog.hasAttribute('aria-hidden')).toBe(false);

    // Unmount modal -> app root inert cleanly removed
    unmount();
    expect(rootEl.hasAttribute('inert')).toBe(false);
    expect(rootEl.hasAttribute('aria-hidden')).toBe(false);

    document.body.removeChild(rootEl);
  });

  it('18. SPA_History_Navigation: PopState (browser back button) triggers dirty form discard confirmation', () => {
    const handleClose = vi.fn();
    render(<TestFormModal isOpen={true} onClose={handleClose} isDirty={true} />);

    expect(screen.queryByRole('alertdialog')).toBeNull();

    // User presses browser back button (fires popstate)
    fireEvent(window, new PopStateEvent('popstate'));

    // Discard confirmation alertdialog opens; close does not bypass protection
    expect(screen.getByRole('alertdialog')).toBeTruthy();
    expect(handleClose).not.toHaveBeenCalled();
  });
});
