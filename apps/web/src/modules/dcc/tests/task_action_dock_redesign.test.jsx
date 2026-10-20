import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import TaskActionDock from '../components/workflow/TaskActionDock';

describe('TaskActionDock Redesign & Visual Hierarchy Verification', () => {
  it('Criterion 1 & 2: APPROVE mode renders equal 3-column grid, h-10 buttons, and clean "อนุมัติ" text without awkward English subtext', () => {
    const handleAction = vi.fn();
    render(
      <TaskActionDock
        mode="APPROVE"
        hasReadToBottom={true}
        onAction={handleAction}
      />
    );

    // 1. Check all 3 buttons are present
    const rejectBtn = screen.getByRole('button', { name: /ไม่อนุมัติ/i });
    const returnBtn = screen.getByRole('button', { name: /ส่งกลับแก้ไข/i });
    const approveBtn = screen.getByRole('button', { name: /^อนุมัติ/i });

    expect(rejectBtn).toBeInTheDocument();
    expect(returnBtn).toBeInTheDocument();
    expect(approveBtn).toBeInTheDocument();

    // 2. Verify rightmost button text is clean "อนุมัติ" (no "(Approve)" subtext in visible span)
    const approveSpan = approveBtn.querySelector('span');
    expect(approveSpan).toBeInTheDocument();
    expect(approveSpan.textContent.trim()).toBe('อนุมัติ');

    // 3. Verify consistent h-10 height across all 3 buttons
    expect(rejectBtn.className).toContain('h-10');
    expect(returnBtn.className).toContain('h-10');
    expect(approveBtn.className).toContain('h-10');

    // 4. Verify modern soft tones + crisp primary
    expect(rejectBtn.className).toContain('bg-rose-50');
    expect(rejectBtn.className).toContain('text-rose-700');
    expect(returnBtn.className).toContain('bg-amber-50');
    expect(returnBtn.className).toContain('text-amber-800');
    expect(approveBtn.className).toContain('bg-emerald-600');
    expect(approveBtn.className).toContain('text-white');

    // 5. Verify action callback with comment
    const textarea = screen.getByPlaceholderText(/ระบุเหตุผล ข้อเสนอแนะ หรือสิ่งที่ต้องปรับปรุง/i);
    fireEvent.change(textarea, { target: { value: 'เอกสารสมบูรณ์พร้อมประกาศใช้' } });

    fireEvent.click(approveBtn);
    expect(handleAction).toHaveBeenCalledWith('APPROVE', 'เอกสารสมบูรณ์พร้อมประกาศใช้');
  });

  it('Criterion 4: REVIEW mode renders 2-column grid ("ส่งกลับแก้ไข" + "ผ่านการทบทวน") with h-10 buttons', () => {
    const handleAction = vi.fn();
    render(
      <TaskActionDock
        mode="REVIEW"
        hasReadToBottom={true}
        onAction={handleAction}
      />
    );

    const returnBtn = screen.getByRole('button', { name: /ส่งกลับแก้ไข/i });
    const passBtn = screen.getByRole('button', { name: /ผ่านการทบทวน/i });

    expect(returnBtn).toBeInTheDocument();
    expect(passBtn).toBeInTheDocument();

    expect(returnBtn.className).toContain('h-10');
    expect(passBtn.className).toContain('h-10');
    expect(passBtn.className).toContain('bg-blue-600');
    expect(passBtn.className).toContain('text-white');

    fireEvent.click(passBtn);
    expect(handleAction).toHaveBeenCalledWith('APPROVE', '');
  });

  it('verifies Obsolete approval button displays contextual "อนุมัติยกเลิกเอกสาร" in rose palette', () => {
    render(
      <TaskActionDock
        mode="APPROVE"
        isObsolete={true}
        hasReadToBottom={true}
        onAction={() => {}}
      />
    );

    const obsoleteBtn = screen.getByRole('button', { name: /อนุมัติยกเลิกเอกสาร/i });
    expect(obsoleteBtn).toBeInTheDocument();
    expect(obsoleteBtn.className).toContain('bg-rose-600');
    expect(obsoleteBtn.className).toContain('h-10');

    const span = obsoleteBtn.querySelector('span');
    expect(span.textContent.trim()).toBe('อนุมัติยกเลิกเอกสาร');
  });

  it('verifies disabled guardrail when hasReadToBottom is false', () => {
    render(
      <TaskActionDock
        mode="APPROVE"
        hasReadToBottom={false}
        onAction={() => {}}
      />
    );

    expect(screen.getByText(/กรุณาเลื่อนอ่านเอกสารทางขวาให้จบเพื่อปลดล็อคปุ่ม/i)).toBeInTheDocument();

    const rejectBtn = screen.getByRole('button', { name: /ไม่อนุมัติ/i });
    const returnBtn = screen.getByRole('button', { name: /ส่งกลับแก้ไข/i });
    const approveBtn = screen.getByRole('button', { name: /^อนุมัติ/i });

    expect(rejectBtn).toBeDisabled();
    expect(returnBtn).toBeDisabled();
    expect(approveBtn).toBeDisabled();
  });
});
