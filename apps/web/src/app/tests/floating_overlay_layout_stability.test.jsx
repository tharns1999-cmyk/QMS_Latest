import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { useRef, useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import FloatingOverlay from '../../shared/components/ui/FloatingOverlay';
import AnnualPlanSideInspector from '../../modules/vcc/components/AnnualPlanSideInspector';
import WorkOrderSideDrawer from '../../modules/vcc/components/WorkOrderSideDrawer';

// Test harness component simulating a high-density table cell with a popover
function TestTableWithPopover({ keepMounted = false, initialOpen = false }) {
  const [isOpen, setIsOpen] = useState(initialOpen);
  const triggerRef = useRef(null);

  return (
    <div className="overflow-x-auto w-96 border border-slate-200" data-testid="table-container">
      <table className="w-full text-left">
        <thead>
          <tr>
            <th className="p-2">Asset Code</th>
            <th className="p-2">Action</th>
          </tr>
        </thead>
        <tbody>
          <tr data-testid="table-row">
            <td className="p-2" data-testid="code-cell">CAL-001</td>
            <td className="p-2 relative" data-testid="action-cell">
              <button
                ref={triggerRef}
                type="button"
                data-testid="trigger-btn"
                onClick={() => setIsOpen((prev) => !prev)}
                className="px-2 py-1 bg-slate-100 rounded text-xs"
              >
                เมนูจัดการ
              </button>

              <FloatingOverlay
                isOpen={isOpen}
                onClose={() => setIsOpen(false)}
                triggerRef={triggerRef}
                keepMounted={keepMounted}
                className="w-48 bg-white shadow-xl rounded-xl border border-slate-200 p-2"
                data-testid="floating-menu"
              >
                <div data-testid="menu-content">
                  <button
                    type="button"
                    data-testid="action-btn-1"
                    onClick={() => setIsOpen(false)}
                  >
                    ดูประวัติการทวนสอบ
                  </button>
                  <button
                    type="button"
                    data-testid="action-btn-2"
                    onClick={() => setIsOpen(false)}
                  >
                    ออกใบสั่งงาน
                  </button>
                </div>
              </FloatingOverlay>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

describe('System-Wide Floating Overlay & Layout Stability Verification', () => {
  beforeEach(() => {
    document.body.style.overflow = '';
  });

  afterEach(() => {
    document.body.style.overflow = '';
  });

  it('1. FloatingOverlay portals to document.body and prevents table cell layout deformation', () => {
    render(<TestTableWithPopover initialOpen={false} />);

    const actionCell = screen.getByTestId('action-cell');
    const triggerBtn = screen.getByTestId('trigger-btn');

    // Before click: only trigger button is inside cell
    expect(actionCell.children.length).toBe(1);
    expect(screen.queryByTestId('floating-menu')).toBeNull();

    // Trigger open
    fireEvent.click(triggerBtn);

    const floatingMenu = screen.getByTestId('floating-menu');
    expect(floatingMenu).toBeDefined();

    // Must be portaled directly to document.body
    expect(floatingMenu.parentElement).toBe(document.body);
    // Action cell must still only have 1 direct child (trigger button), avoiding table expansion
    expect(actionCell.children.length).toBe(1);
    expect(floatingMenu.style.position).toBe('fixed');
  });

  it('2. FloatingOverlay dismisses on Escape key and outside click', () => {
    render(<TestTableWithPopover initialOpen={true} />);

    expect(screen.getByTestId('floating-menu')).toBeDefined();

    // Escape key press dismisses menu
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('floating-menu')).toBeNull();

    // Reopen menu
    fireEvent.click(screen.getByTestId('trigger-btn'));
    expect(screen.getByTestId('floating-menu')).toBeDefined();

    // Click outside dismisses menu
    fireEvent.mouseDown(document.body);
    expect(screen.queryByTestId('floating-menu')).toBeNull();
  });

  it('3. FloatingOverlay keepMounted preserves testability offscreen without layout shift', () => {
    render(<TestTableWithPopover keepMounted={true} initialOpen={false} />);

    const menu = screen.getByTestId('floating-menu');
    expect(menu).toBeDefined();
    // When closed with keepMounted, it is safely positioned offscreen
    expect(menu.style.left).toBe('-9999px');
    expect(menu.style.top).toBe('-9999px');
    expect(menu.style.opacity).toBe('0');

    // Open menu
    fireEvent.click(screen.getByTestId('trigger-btn'));
    expect(menu.style.opacity).toBe('1');
    expect(menu.style.left).not.toBe('-9999px');
  });

  it('4. AnnualPlanSideInspector portals to body, locks scroll, and handles Escape', () => {
    const handleClose = vi.fn();
    const mockItem = {
      id: 'item-1',
      asset_code: 'CAL-001',
      asset_name: 'Digital Caliper',
      asset_type: 'EQUIPMENT',
      model: 'CD-6"CSX',
      serial_number: 'SN-998877',
      planned_months: [1, 6]
    };

    const { unmount } = render(
      <AnnualPlanSideInspector
        item={mockItem}
        onClose={handleClose}
      />
    );

    const dialog = screen.getByRole('dialog', { name: /รายละเอียดเครื่องมือวัด/i });
    expect(dialog).toBeDefined();
    // Verify rendered directly at document.body
    expect(dialog.parentElement).toBe(document.body);
    // Body scroll locked
    expect(document.body.style.overflow).toBe('hidden');

    // Escape closes inspector
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(handleClose).toHaveBeenCalledTimes(1);

    // Unmount restores body overflow
    unmount();
    expect(document.body.style.overflow).toBe('');
  });

  it('5. WorkOrderSideDrawer portals to body, locks scroll, and handles Escape', () => {
    const handleClose = vi.fn();
    const mockWo = {
      id: 'wo-101',
      wo_code: 'WO-2026-0001',
      status: 'OPEN',
      planned_month: 3,
      plan_year: 2026
    };

    const { unmount } = render(
      <WorkOrderSideDrawer
        workOrder={mockWo}
        onClose={handleClose}
      />
    );

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeDefined();
    expect(dialog.parentElement).toBe(document.body);
    expect(document.body.style.overflow).toBe('hidden');

    // Escape closes drawer
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(handleClose).toHaveBeenCalledTimes(1);

    // Unmount restores body overflow
    unmount();
    expect(document.body.style.overflow).toBe('');
  });
});
