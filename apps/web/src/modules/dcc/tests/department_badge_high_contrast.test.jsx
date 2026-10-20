import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { getDeptBadgeStyle } from '../../../shared/utils/departmentColors';
import DepartmentBadge from '../../../shared/components/ui/DepartmentBadge';

describe('Department Badge High-Contrast Modern Pastel Pill Palette Tests', () => {
  it('1. QC / QA: maps to soft emerald-50 bg, emerald-800 dark text, emerald-200 border and emerald-600 icon', () => {
    const styleQC = getDeptBadgeStyle('QC');
    expect(styleQC.badge).toContain('bg-emerald-50');
    expect(styleQC.badge).toContain('text-emerald-800');
    expect(styleQC.badge).toContain('border-emerald-200');
    expect(styleQC.icon).toContain('text-emerald-600');

    const styleQA = getDeptBadgeStyle('QA');
    expect(styleQA.badge).toContain('bg-emerald-50');
    expect(styleQA.badge).toContain('text-emerald-800');
  });

  it('2. PD / Production: maps to soft amber-50 bg, amber-800 dark text, amber-200 border and amber-600 icon', () => {
    const stylePD = getDeptBadgeStyle('PD');
    expect(stylePD.badge).toContain('bg-amber-50');
    expect(stylePD.badge).toContain('text-amber-800');
    expect(stylePD.badge).toContain('border-amber-200');
    expect(stylePD.icon).toContain('text-amber-600');
  });

  it('3. EN / Engineering: maps to soft sky-50 bg, sky-800 dark text, sky-200 border and sky-600 icon', () => {
    const styleEN = getDeptBadgeStyle('EN');
    expect(styleEN.badge).toContain('bg-sky-50');
    expect(styleEN.badge).toContain('text-sky-800');
    expect(styleEN.badge).toContain('border-sky-200');
    expect(styleEN.icon).toContain('text-sky-600');
  });

  it('4. DC / DCC / QMS: maps to soft blue-50 bg, blue-800 dark text, blue-200 border and blue-600 icon', () => {
    const styleDC = getDeptBadgeStyle('DC');
    expect(styleDC.badge).toContain('bg-blue-50');
    expect(styleDC.badge).toContain('text-blue-800');
    expect(styleDC.badge).toContain('border-blue-200');
    expect(styleDC.icon).toContain('text-blue-600');

    const styleDCC = getDeptBadgeStyle('DCC');
    expect(styleDCC.badge).toContain('bg-blue-50');
    expect(styleDCC.badge).toContain('text-blue-800');
  });

  it('5. Default / Other Departments: maps to slate-100 bg, slate-700 text, slate-200 border', () => {
    const styleOther = getDeptBadgeStyle('UNKNOWN_DEPT');
    expect(styleOther.badge).toContain('bg-slate-100');
    expect(styleOther.badge).toContain('text-slate-700');
    expect(styleOther.badge).toContain('border-slate-200');
    expect(styleOther.icon).toContain('text-slate-500');
  });

  it('6. DepartmentBadge Component: renders pill with Building2 icon, typography and classes', () => {
    render(
      <DepartmentBadge 
        department="QC" 
        deptName="QC - ฝ่ายประกันและควบคุมคุณภาพ" 
      />
    );

    const badge = screen.getByText('QC - ฝ่ายประกันและควบคุมคุณภาพ');
    expect(badge).toBeInTheDocument();
    
    // Check parent container has modern pastel pill classes
    const pillContainer = badge.closest('span.inline-flex');
    expect(pillContainer).toHaveClass('bg-emerald-50');
    expect(pillContainer).toHaveClass('text-emerald-800');
    expect(pillContainer).toHaveClass('text-xs');
    expect(pillContainer).toHaveClass('font-semibold');
    expect(pillContainer).toHaveClass('rounded-md');
  });
});
