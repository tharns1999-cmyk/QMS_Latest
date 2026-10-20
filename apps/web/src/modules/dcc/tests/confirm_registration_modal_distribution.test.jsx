import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import ConfirmRegistrationModal, { PointOfUseSection } from '../components/modals/ConfirmRegistrationModal';
import DarSubmitConfirmModal from '../components/modals/DarSubmitConfirmModal';

describe('ConfirmRegistrationModal & PointOfUseSection Distribution Redesign', () => {
  it('1. Tokenizes distribution into Copy badge, Dept tag, and Location with MapPin icon', () => {
    const testList = [
      {
        copyNo: 'Copy 01',
        locationName: 'QC Laboratory Office',
        department: 'QC',
        locationDetail: 'สำนักงานประกันและควบคุมคุณภาพ ชั้น 2'
      }
    ];

    const { container } = render(<PointOfUseSection distributionList={testList} />);

    // Copy Badge
    const copyBadge = screen.getByText('Copy 01');
    expect(copyBadge).toBeInTheDocument();
    expect(copyBadge.className).toContain('bg-indigo-50');
    expect(copyBadge.className).toContain('text-indigo-700');

    // Target Dept Tag
    const deptTag = screen.getByText('QC');
    expect(deptTag).toBeInTheDocument();
    expect(deptTag.className).toContain('bg-emerald-50');
    expect(deptTag.className).toContain('text-emerald-700');

    // Location Name
    const locName = screen.getByText('QC Laboratory Office');
    expect(locName).toBeInTheDocument();
    expect(locName.className).toContain('break-words');

    // MapPin Icon & Location Detail
    const detail = screen.getByText('สำนักงานประกันและควบคุมคุณภาพ ชั้น 2');
    expect(detail).toBeInTheDocument();
    expect(container.querySelector('.lucide-map-pin')).toBeInTheDocument();
  });

  it('2. Fixes overflow with min-w-0 and break-words for long station names', () => {
    const testList = [
      {
        copyNo: 'Copy 02',
        locationName: 'Production-Super-Long-Line-Zone-A-B-C-Very-Long-Location-Name-Without-Spaces-1234567890',
        department: 'PD',
        locationDetail: 'อาคารผลิตหลัก 1 ห้องควบคุมอุณหภูมิและความชื้นพิเศษ'
      }
    ];

    const { container } = render(<PointOfUseSection distributionList={testList} />);

    // Outer card has min-w-0
    const card = container.querySelector('.min-w-0');
    expect(card).toBeInTheDocument();

    const longLoc = screen.getByText(/Production-Super-Long-Line/);
    expect(longLoc.className).toContain('break-words');
    expect(longLoc.className).toContain('line-clamp-2');
  });

  it('3. Scalably renders multi-copy distribution list as clean stacked cards', () => {
    const multiList = [
      { copyNo: '01', locationName: 'Main Office', department: 'QA' },
      { copyNo: '02', locationName: 'Packaging Station', department: 'PD' },
      { copyNo: '03', locationName: 'Incoming Inspection', department: 'QC' }
    ];

    render(<PointOfUseSection distributionList={multiList} />);

    expect(screen.getByText('Copy 01')).toBeInTheDocument();
    expect(screen.getByText('Copy 02')).toBeInTheDocument();
    expect(screen.getByText('Copy 03')).toBeInTheDocument();
    expect(screen.getByText('QA')).toBeInTheDocument();
    expect(screen.getByText('PD')).toBeInTheDocument();
    expect(screen.getByText('QC')).toBeInTheDocument();
  });

  it('4. Renders digital-only banner for FM form documents', () => {
    render(<PointOfUseSection isFormDocument={true} />);

    expect(screen.getByText(/แบบฟอร์มเปล่า \(FM\) ดิจิทัล - Bypass การออกเล่มสำเนาควบคุม/i)).toBeInTheDocument();
  });

  it('5. Renders seamlessly inside ConfirmRegistrationModal and DarSubmitConfirmModal', () => {
    const handleClose = vi.fn();
    const handleConfirm = vi.fn();

    const { rerender } = render(
      <ConfirmRegistrationModal
        isOpen={true}
        onClose={handleClose}
        onConfirm={handleConfirm}
        distributionList={[
          { copyNo: 'Copy 01', locationName: 'Lab 1', department: 'QC' }
        ]}
      />
    );

    expect(screen.getByText('Copy 01')).toBeInTheDocument();
    expect(screen.getByText('Lab 1')).toBeInTheDocument();
    expect(screen.getByText('QC')).toBeInTheDocument();

    // Verify alias DarSubmitConfirmModal works equivalently
    rerender(
      <DarSubmitConfirmModal
        isOpen={true}
        onClose={handleClose}
        onConfirm={handleConfirm}
        distributionList={[
          { copyNo: 'Copy 02', locationName: 'Warehouse 3', department: 'WH' }
        ]}
      />
    );

    expect(screen.getByText('Copy 02')).toBeInTheDocument();
    expect(screen.getByText('Warehouse 3')).toBeInTheDocument();
    expect(screen.getByText('WH')).toBeInTheDocument();
  });
});
