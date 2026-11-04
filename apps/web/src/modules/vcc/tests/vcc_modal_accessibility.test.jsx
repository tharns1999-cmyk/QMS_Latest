import React, { useState, useRef } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { vccDialogStack } from '../hooks/useVccModalAccessibility';
import { VccModalShell } from '../components/VccModalShell';

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

describe('VCC UX/UI Round D2 — Enterprise Modal Accessibility Tests', () => {
  beforeEach(() => {
    // Reset any lingering dialog stack
    vccDialogStack.length = 0;
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
});
