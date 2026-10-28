import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ApproveConfirmModal from '../components/modals/ApproveConfirmModal';
import ActionConfirmModal from '../../../shared/components/common/ActionConfirmModal';

describe('Modal Zero-Flicker & Immediate Render Tests', () => {
  it('ApproveConfirmModal returns null when isOpen is false', () => {
    const { container } = render(
      <ApproveConfirmModal
        isOpen={false}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('ApproveConfirmModal renders immediately on frame 0 with hardware-accelerated CSS animation classes', () => {
    const mockOnClose = vi.fn();
    const mockOnConfirm = vi.fn();
    const mockDar = {
      darNumber: 'DAR-2026-001',
      title: 'ขั้นตอนการควบคุมคุณภาพ (QC Procedure)'
    };

    const { container } = render(
      <ApproveConfirmModal
        isOpen={true}
        onClose={mockOnClose}
        onConfirm={mockOnConfirm}
        dar={mockDar}
        comment="ตรวจสอบแล้วผ่านเกณฑ์"
      />
    );

    // Verify Title & DAR Info
    expect(screen.getByText('ยืนยันการอนุมัติเอกสาร')).toBeDefined();
    expect(screen.getByText('DAR-26-001')).toBeDefined();
    expect(screen.getByText('ขั้นตอนการควบคุมคุณภาพ (QC Procedure)')).toBeDefined();
    expect(screen.getByText('ตรวจสอบแล้วผ่านเกณฑ์')).toBeDefined();

    // Check Backdrop animation classes (zero flicker, immediate animate-in)
    const backdrop = container.querySelector('.bg-slate-900\\/50');
    expect(backdrop).not.toBeNull();
    expect(backdrop.className).toContain('animate-in');
    expect(backdrop.className).toContain('fade-in');
    expect(backdrop.className).toContain('duration-150');

    // Check Dialog Card animation classes
    const dialogCard = container.querySelector('.rounded-3xl');
    expect(dialogCard).not.toBeNull();
    expect(dialogCard.className).toContain('animate-in');
    expect(dialogCard.className).toContain('fade-in');
    expect(dialogCard.className).toContain('zoom-in-95');
    expect(dialogCard.className).toContain('ease-out');

    // Test actions
    fireEvent.click(screen.getByRole('button', { name: /ยืนยันการอนุมัติ/i }));
    expect(mockOnConfirm).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: /ยกเลิก/i }));
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('ActionConfirmModal renders on frame 0 with zero-flicker CSS animations', () => {
    const mockOnClose = vi.fn();
    const mockOnConfirm = vi.fn();

    const { container } = render(
      <ActionConfirmModal
        isOpen={true}
        onClose={mockOnClose}
        onConfirm={mockOnConfirm}
        title="ยืนยันการอนุมัติเอกสาร (Approve DAR)"
        actionType="approve"
        summaryData={[
          { label: 'ผู้อนุมัติ', value: 'สมชาย รักชาติ' },
          { label: 'เอกสาร', value: '[SOP-QC-001] ข้อกำหนดคุณภาพ' }
        ]}
      />
    );

    // Backdrop check
    const backdrop = container.querySelector('.bg-slate-900\\/50');
    expect(backdrop).not.toBeNull();
    expect(backdrop.className).toContain('animate-in');
    expect(backdrop.className).toContain('fade-in');

    // Dialog card check
    const dialogCard = container.querySelector('.max-w-2xl');
    expect(dialogCard).not.toBeNull();
    expect(dialogCard.className).toContain('animate-in');
    expect(dialogCard.className).toContain('fade-in');
    expect(dialogCard.className).toContain('zoom-in-95');
  });
});
