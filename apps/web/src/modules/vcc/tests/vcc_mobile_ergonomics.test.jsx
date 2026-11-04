import React, { useState } from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useVccMobileViewport } from '../hooks/useVccMobileViewport';
import { WorkOrderSideDrawer } from '../components/WorkOrderSideDrawer';
import { AnnualPlanSideInspector } from '../components/AnnualPlanSideInspector';
import { CreateWorkOrderModal } from '../components/WorkOrderModals';
import { RecordResultModal } from '../components/RecordResultModal';
import { WorkOrderRowActions } from '../components/WorkOrderTable';
import { AnnualPlanMonthCell } from '../components/AnnualPlanMonthCell';
import { DigitalRecordModal } from '../components/DigitalRecordModal';

// Helper hook test component
const ViewportTestHarness = ({ onDismiss }) => {
  const {
    isMobile,
    isKeyboardOpen,
    dragOffset,
    isDragging,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd
  } = useVccMobileViewport({ onDismiss });

  return (
    <div>
      <div data-testid="is-mobile">{isMobile ? 'MOBILE' : 'DESKTOP'}</div>
      <div data-testid="is-keyboard">{isKeyboardOpen ? 'KEYBOARD_OPEN' : 'KEYBOARD_CLOSED'}</div>
      <div data-testid="drag-offset">{dragOffset}</div>
      <div data-testid="is-dragging">{isDragging ? 'DRAGGING' : 'IDLE'}</div>
      <div
        data-testid="drag-handle"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        Handle
      </div>
    </div>
  );
};

describe('VCC Mobile Ergonomics Suite (Round D3)', () => {
  const originalInnerWidth = window.innerWidth;
  const originalInnerHeight = window.innerHeight;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    window.innerWidth = originalInnerWidth;
    window.innerHeight = originalInnerHeight;
  });

  describe('1. Responsive Viewport & useVccMobileViewport Hook', () => {
    it('accurately identifies mobile viewports across 320px, 375px, 390px, 414px', () => {
      const mobileWidths = [320, 375, 390, 414];
      mobileWidths.forEach((width) => {
        window.innerWidth = width;
        const { getByTestId, unmount } = render(<ViewportTestHarness />);
        expect(getByTestId('is-mobile').textContent).toBe('MOBILE');
        unmount();
      });
    });

    it('accurately identifies tablet & desktop viewports across 768px, 1024px, 1440px', () => {
      const desktopWidths = [768, 1024, 1440];
      desktopWidths.forEach((width) => {
        window.innerWidth = width;
        const { getByTestId, unmount } = render(<ViewportTestHarness />);
        expect(getByTestId('is-mobile').textContent).toBe('DESKTOP');
        unmount();
      });
    });

    it('dynamically adapts when window resizes between desktop and mobile', () => {
      window.innerWidth = 1024;
      const { getByTestId } = render(<ViewportTestHarness />);
      expect(getByTestId('is-mobile').textContent).toBe('DESKTOP');

      act(() => {
        window.innerWidth = 375;
        fireEvent(window, new Event('resize'));
      });
      expect(getByTestId('is-mobile').textContent).toBe('MOBILE');
    });

    it('detects virtual keyboard opening when visualViewport height shrinks', () => {
      window.innerHeight = 800;
      const mockVisualViewport = {
        width: 375,
        height: 800,
        offsetTop: 0,
        pageTop: 0,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn()
      };
      window.visualViewport = mockVisualViewport;

      const { getByTestId } = render(<ViewportTestHarness />);
      expect(getByTestId('is-keyboard').textContent).toBe('KEYBOARD_CLOSED');

      // Simulate keyboard open by reducing visualViewport height by > 140px
      act(() => {
        mockVisualViewport.height = 450;
        const resizeCallback = mockVisualViewport.addEventListener.mock.calls.find(
          ([evt]) => evt === 'resize'
        )?.[1];
        if (resizeCallback) resizeCallback();
      });
      expect(getByTestId('is-keyboard').textContent).toBe('KEYBOARD_OPEN');
    });

    it('triggers onDismiss when dragged down beyond threshold (>70px)', () => {
      window.innerWidth = 375;
      const onDismiss = vi.fn();
      const { getByTestId } = render(<ViewportTestHarness onDismiss={onDismiss} />);
      const handle = getByTestId('drag-handle');

      fireEvent.touchStart(handle, {
        touches: [{ clientY: 100 }]
      });

      fireEvent.touchMove(handle, {
        touches: [{ clientY: 190 }] // +90px down
      });

      expect(getByTestId('is-dragging').textContent).toBe('DRAGGING');
      expect(Number(getByTestId('drag-offset').textContent)).toBeGreaterThan(0);

      fireEvent.touchEnd(handle);
      expect(onDismiss).toHaveBeenCalledTimes(1);
    });

    it('cancels drag without dismissing when dragged under threshold (<70px)', () => {
      window.innerWidth = 375;
      const onDismiss = vi.fn();
      const { getByTestId } = render(<ViewportTestHarness onDismiss={onDismiss} />);
      const handle = getByTestId('drag-handle');

      fireEvent.touchStart(handle, {
        touches: [{ clientY: 100 }]
      });

      fireEvent.touchMove(handle, {
        touches: [{ clientY: 140 }] // only +40px down
      });

      fireEvent.touchEnd(handle);
      expect(onDismiss).not.toHaveBeenCalled();
      expect(getByTestId('drag-offset').textContent).toBe('0');
    });
  });

  describe('2. WorkOrderSideDrawer Bottom Sheet & Mobile Ergonomics', () => {
    const mockWorkOrder = {
      id: 'wo-1',
      wo_code: 'WO-2026-001',
      status: 'OPEN',
      asset_code: 'CAL-001',
      asset_name: 'Vernier Caliper',
      due_date: '2026-11-30',
      provider_name: 'Internal Lab'
    };

    it('renders responsive bottom sheet layout with 44px touch targets on mobile', () => {
      window.innerWidth = 375;
      const onClose = vi.fn();

      render(
        <WorkOrderSideDrawer
          workOrder={mockWorkOrder}
          onClose={onClose}
          thresholds={{}}
        />
      );

      // Verify drag handle is present on mobile with touch drag support
      const dragHandle = screen.getByTestId('vcc-drag-handle');
      expect(dragHandle).toBeInTheDocument();

      // Verify close button has touch target >= 44px
      const closeBtn = screen.getByLabelText(/ปิดหน้าต่างรายละเอียดใบสั่งงาน/i);
      expect(closeBtn.className).toContain('min-w-[44px]');
      expect(closeBtn.className).toContain('min-h-[44px]');

      // Test drag to dismiss
      fireEvent.touchStart(dragHandle, {
        touches: [{ clientY: 100 }]
      });
      fireEvent.touchMove(dragHandle, {
        touches: [{ clientY: 200 }]
      });
      fireEvent.touchEnd(dragHandle);

      expect(onClose).toHaveBeenCalled();
    });

    it('footer buttons meet 44px minimum touch targets and touch feedback', () => {
      window.innerWidth = 375;
      const onRecordResult = vi.fn();

      render(
        <WorkOrderSideDrawer
          workOrder={mockWorkOrder}
          onClose={vi.fn()}
          onRecordResult={onRecordResult}
          thresholds={{}}
        />
      );

      const recordBtn = screen.getByRole('button', { name: /บันทึกผลและใบรับรอง/i });
      expect(recordBtn.className).toContain('min-h-[44px]');
      expect(recordBtn.className).toContain('motion-safe:active:scale-[0.98]');
      expect(recordBtn.className).toContain('select-none');

      const closeDrawerBtn = screen.getByRole('button', { name: /^ปิดหน้าต่าง$/i });
      expect(closeDrawerBtn.className).toContain('min-h-[44px]');
      expect(closeDrawerBtn.className).toContain('select-none');
    });
  });

  describe('3. AnnualPlanSideInspector Bottom Sheet & Touch Ergonomics', () => {
    const mockPlanItem = {
      id: 'item-1',
      asset_id: 'a-1',
      asset_code: 'MIC-001',
      asset_name: 'Micrometer 0-25mm',
      provider_name: 'External NIMT',
      planned_months: [3, 9],
      responsible_dept: 'QC',
      responsible_label: 'แผนกควบคุมคุณภาพ'
    };

    it('renders bottom sheet on mobile and supports drag to dismiss', () => {
      window.innerWidth = 390;
      const onClose = vi.fn();

      render(
        <AnnualPlanSideInspector
          item={mockPlanItem}
          plan={{ id: 'plan-1', plan_year: 2026 }}
          workOrders={[]}
          onClose={onClose}
        />
      );

      const dragHandle = screen.getByTestId('vcc-drag-handle');
      expect(dragHandle).toBeInTheDocument();

      const closeBtn = screen.getByLabelText(/ปิดหน้าต่างสเปก/i);
      expect(closeBtn.className).toContain('min-w-[44px]');
      expect(closeBtn.className).toContain('min-h-[44px]');

      // Drag down to dismiss
      fireEvent.touchStart(dragHandle, {
        touches: [{ clientY: 50 }]
      });
      fireEvent.touchMove(dragHandle, {
        touches: [{ clientY: 150 }]
      });
      fireEvent.touchEnd(dragHandle);

      expect(onClose).toHaveBeenCalled();
    });
  });

  describe('4. Mobile Action Bar: Stacked Buttons & Safe Area Protection', () => {
    it('stacks buttons on mobile with Cancel on TOP (order-1) and Confirm on BOTTOM (order-2)', () => {
      window.innerWidth = 375;
      const onClose = vi.fn();
      const onSubmit = vi.fn((e) => e.preventDefault());

      const form = {
        mode: 'ADHOC',
        plan_id: '',
        plan_item_id: '',
        planned_month: 1,
        child_asset_id: '',
        asset_id: 'a-1',
        provider_name: 'Internal Lab',
        due_date: '2026-11-30'
      };

      render(
        <CreateWorkOrderModal
          open={true}
          onClose={onClose}
          form={form}
          setForm={vi.fn()}
          saving={false}
          onSubmit={onSubmit}
          approvedPlans={[]}
          planItems={[]}
          individualAssets={[{ id: 'a-1', asset_code: 'A-1', name: 'Asset 1' }]}
          providers={['Internal Lab']}
        />
      );

      const cancelBtn = screen.getByRole('button', { name: /^ยกเลิก$/i });
      const submitBtn = screen.getByRole('button', { name: /ยืนยันสร้างใบสั่งงาน/i });

      // Verify Cancel on TOP (order-1) and Submit on BOTTOM under thumb (order-2)
      expect(cancelBtn.className).toContain('order-1');
      expect(submitBtn.className).toContain('order-2');

      // Verify minimum 44px touch targets
      expect(cancelBtn.className).toContain('min-h-[44px]');
      expect(submitBtn.className).toContain('min-h-[44px]');

      // Verify active touch feedback and text selection safety
      expect(cancelBtn.className).toContain('motion-safe:active:scale-[0.98]');
      expect(submitBtn.className).toContain('motion-safe:active:scale-[0.98]');
      expect(cancelBtn.className).toContain('select-none');
      expect(submitBtn.className).toContain('select-none');
    });

    it('RecordResultModal enforces stacked order-1 Cancel and order-2 Submit with safe area padding', () => {
      window.innerWidth = 375;
      const onClose = vi.fn();
      const mockWo = {
        id: 'wo-1',
        wo_code: 'WO-2026-001',
        status: 'OPEN',
        asset_code: 'CAL-001',
        asset_name: 'Vernier Caliper',
        due_date: '2026-11-30',
        threshold_days: 30
      };

      const form = {
        performed_at: '2026-11-04',
        result_status: 'PASS',
        certificate_no: 'CERT-100',
        certificate_issue_date: '2026-11-04',
        certificate_valid_until: '2027-11-04',
        acceptance_criteria: '±0.05 mm',
        result_remarks: '',
        calibration_provider_name: 'Lab',
        calibration_method: 'ISO 17025',
        traceability_ref: 'STD-01',
        environmental_conditions: '20C',
        calibration_error_value: '0.01'
      };

      render(
        <RecordResultModal
          workOrder={mockWo}
          onClose={onClose}
          form={form}
          setForm={vi.fn()}
          onSubmit={vi.fn()}
          criteriaOptions={['±0.05 mm']}
        />
      );

      const cancelBtn = screen.getByRole('button', { name: /^ยกเลิก$/i });
      const submitBtn = screen.getByRole('button', { name: /ส่งผลให้ผู้ตรวจรับพิจารณา/i });

      expect(cancelBtn.className).toContain('order-1');
      expect(submitBtn.className).toContain('order-2');
      expect(cancelBtn.className).toContain('min-h-[44px]');
      expect(submitBtn.className).toContain('min-h-[44px]');

      // Check safe area inset presence in footer container
      const footerContainer = cancelBtn.closest('div').parentElement;
      expect(footerContainer.className).toContain('safe-area-inset-bottom');
    });

    it('Dirty Form Protection blocks accidental dismissal via swipe-to-dismiss drag gesture and preserves data', () => {
      window.innerWidth = 375;
      const onClose = vi.fn();

      const TestDirtyDismissHarness = () => {
        const [form, setForm] = useState({
          mode: 'ADHOC',
          plan_id: '',
          plan_item_id: '',
          planned_month: 1,
          child_asset_id: '',
          asset_id: 'a-1',
          provider_name: 'Internal Lab',
          due_date: '2026-11-30'
        });

        return (
          <div>
            <button
              data-testid="make-dirty"
              onClick={() => setForm((prev) => ({ ...prev, due_date: '2026-12-15' }))}
            >
              Dirty
            </button>
            <CreateWorkOrderModal
              open={true}
              onClose={onClose}
              form={form}
              setForm={setForm}
              saving={false}
              onSubmit={vi.fn()}
              approvedPlans={[]}
              planItems={[]}
              individualAssets={[{ id: 'a-1', asset_code: 'A-1', name: 'Asset 1' }]}
              providers={['Internal Lab']}
            />
          </div>
        );
      };

      render(<TestDirtyDismissHarness />);

      // Form is initially clean. Now dirty it.
      fireEvent.click(screen.getByTestId('make-dirty'));

      const dragHandle = screen.getByTestId('vcc-drag-handle');
      expect(dragHandle).toBeInTheDocument();

      // Trigger Swipe-to-Dismiss drag gesture down by 150px (exceeds 70px threshold)
      fireEvent.touchStart(dragHandle, { touches: [{ clientY: 50 }] });
      fireEvent.touchMove(dragHandle, { touches: [{ clientY: 200 }] });
      fireEvent.touchEnd(dragHandle);

      // Confirm dialog appears instead of immediately closing
      expect(screen.getByText('ข้อมูลใบสั่งงานยังไม่ได้บันทึก')).toBeInTheDocument();
      expect(onClose).not.toHaveBeenCalled();

      // Verify user's modified form data is still intact
      const dateInput = screen.getByLabelText(/วันครบกำหนด/i);
      expect(dateInput.value).toBe('2026-12-15');

      // Clicking "ยกเลิก / แก้ไขต่อ" in confirmation keeps modal open and preserves data
      const keepEditingBtn = screen.getByRole('button', { name: /แก้ไขต่อ/i });
      fireEvent.click(keepEditingBtn);
      expect(screen.queryByText('ข้อมูลใบสั่งงานยังไม่ได้บันทึก')).not.toBeInTheDocument();
      expect(onClose).not.toHaveBeenCalled();
      expect(dateInput.value).toBe('2026-12-15');

      // Swipe down again
      fireEvent.touchStart(dragHandle, { touches: [{ clientY: 50 }] });
      fireEvent.touchMove(dragHandle, { touches: [{ clientY: 200 }] });
      fireEvent.touchEnd(dragHandle);

      // This time, confirm discarding changes
      const confirmDiscardBtn = screen.getByRole('button', { name: /ละทิ้งข้อมูล/i });
      fireEvent.click(confirmDiscardBtn);
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('5. Touch Target Standards for Tables and Month Cells (WCAG & Apple HIG)', () => {
    it('WorkOrderTable row actions have minimum 44px touch targets on mobile', () => {
      window.innerWidth = 375;
      const mockWo = {
        id: 'wo-1',
        wo_code: 'WO-01',
        status: 'OPEN',
        result_status: null
      };

      render(
        <WorkOrderRowActions
          wo={mockWo}
          canReview={false}
          currentUser={{ is_dcc: true }}
          thresholds={{}}
          onRecordResult={vi.fn()}
          onReschedule={vi.fn()}
          onApprove={vi.fn()}
          onReject={vi.fn()}
          onReleaseHold={vi.fn()}
          onCancel={vi.fn()}
          onRowClick={vi.fn()}
        />
      );

      const primaryBtn = screen.getByRole('button', { name: /บันทึกผลและใบรับรอง/i });
      expect(primaryBtn.className).toContain('min-h-[44px]');
      expect(primaryBtn.className).toContain('motion-safe:active:scale-[0.98]');

      const moreBtn = screen.getByRole('button', { name: /การจัดการเพิ่มเติมสำหรับ WO-01/i });
      expect(moreBtn.className).toContain('min-w-[44px]');
      expect(moreBtn.className).toContain('min-h-[44px]');
      expect(moreBtn.className).toContain('motion-safe:active:scale-[0.96]');
    });

    it('AnnualPlanMonthCell badge triggers have touch ergonomics and min-h-[44px] touch container', () => {
      window.innerWidth = 375;
      const mockPlan = { id: 'p-1', plan_year: 2026, due_date_rule: 'END_OF_MONTH' };
      const mockItem = { id: 'it-1', asset_id: 'a-1', planned_months: [5] };

      render(
        <table>
          <tbody>
            <tr>
              <AnnualPlanMonthCell
                month={5}
                item={mockItem}
                plan={mockPlan}
                workOrders={[]}
                canEditPlan={false}
              />
            </tr>
          </tbody>
        </table>
      );

      const badgeBtn = screen.getByRole('button', { name: /เป้าหมายทวนสอบเดือน 5/i });
      expect(badgeBtn.className).toContain('min-h-[44px]');
      expect(badgeBtn.className).toContain('min-w-[44px]');
      expect(badgeBtn.className).toContain('motion-safe:active:scale-95');
      expect(badgeBtn.className).toContain('select-none');

      // The container wrapping the cell badge trigger must provide at least 44px height for mobile taps
      const cellContainer = badgeBtn.closest('div.min-h-\\[44px\\]') || badgeBtn.closest('div');
      expect(cellContainer.className).toContain('min-h-[44px]');
    });

    it('AnnualPlanMonthCell quick add button has minimum 44x44px touch target on mobile', () => {
      window.innerWidth = 375;
      const mockPlan = { id: 'p-1', plan_year: 2026, due_date_rule: 'END_OF_MONTH' };
      const mockItem = { id: 'it-1', asset_id: 'a-1', planned_months: [] };

      render(
        <table>
          <tbody>
            <tr>
              <AnnualPlanMonthCell
                month={5}
                item={mockItem}
                plan={mockPlan}
                workOrders={[]}
                canEditPlan={true}
              />
            </tr>
          </tbody>
        </table>
      );

      const addBtn = screen.getByRole('button', { name: /กำหนดเป้าหมายเดือน 5/i });
      expect(addBtn.className).toContain('min-w-[44px]');
      expect(addBtn.className).toContain('min-h-[44px]');
    });

    it('DigitalRecordModal handles multi-page print preview safety and mobile touch swipe', () => {
      window.innerWidth = 375;
      const onClose = vi.fn();
      const mockWo = {
        id: 'wo-1',
        wo_code: 'WO-2026-001',
        asset_code: 'CAL-01',
        asset_name: 'Digital Caliper',
        department: 'QA',
        status: 'CLOSED',
        result_status: 'PASS',
        performed_at: '2026-10-15',
        certificate_no: 'CERT-9988',
        acceptance_criteria: '±0.02 mm'
      };

      const { container } = render(
        <DigitalRecordModal
          workOrder={mockWo}
          onClose={onClose}
        />
      );

      // Print container ID must be present
      const printContainer = container.querySelector('#vcc-digital-record-print');
      expect(printContainer).toBeInTheDocument();
      expect(printContainer.className).toContain('print:overflow-visible');
      expect(printContainer.className).toContain('print:h-auto');
      expect(printContainer.className).toContain('overscroll-y-contain');

      // Print sections must contain page-break avoidance class
      const printSections = container.querySelectorAll('.vcc-print-section');
      expect(printSections.length).toBeGreaterThanOrEqual(4);

      // Mobile drag handle must be present and trigger dismissal on swipe
      const dragHandle = screen.getByTestId('vcc-drag-handle');
      expect(dragHandle).toBeInTheDocument();

      fireEvent.touchStart(dragHandle, { touches: [{ clientY: 40 }] });
      fireEvent.touchMove(dragHandle, { touches: [{ clientY: 160 }] });
      fireEvent.touchEnd(dragHandle);

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('useVccMobileViewport restricts focus scrolling to open modal and internal inputs', () => {
      window.innerWidth = 375;
      const modalRef = React.createRef();

      const FocusScrollHarness = ({ isOpen }) => {
        useVccMobileViewport({
          containerRef: modalRef,
          isOpen
        });

        return (
          <div>
            <input data-testid="outside-input" />
            <div ref={modalRef}>
              <input data-testid="inside-input" />
            </div>
          </div>
        );
      };

      const { rerender } = render(<FocusScrollHarness isOpen={true} />);

      const insideInput = screen.getByTestId('inside-input');
      const outsideInput = screen.getByTestId('outside-input');

      insideInput.scrollIntoView = vi.fn();
      outsideInput.scrollIntoView = vi.fn();

      // Focus outside input: must NOT scroll
      fireEvent.focusIn(outsideInput);
      expect(outsideInput.scrollIntoView).not.toHaveBeenCalled();

      // Focus inside input: must trigger scroll with center alignment
      vi.useFakeTimers();
      fireEvent.focusIn(insideInput);
      act(() => {
        vi.advanceTimersByTime(250);
      });
      expect(insideInput.scrollIntoView).toHaveBeenCalledWith({
        behavior: 'smooth',
        block: 'center',
        inline: 'nearest'
      });
      vi.useRealTimers();

      // When modal is closed, focus inside input must NOT scroll
      rerender(<FocusScrollHarness isOpen={false} />);
      insideInput.scrollIntoView.mockClear();
      fireEvent.focusIn(insideInput);
      expect(insideInput.scrollIntoView).not.toHaveBeenCalled();
    });
  });
});
