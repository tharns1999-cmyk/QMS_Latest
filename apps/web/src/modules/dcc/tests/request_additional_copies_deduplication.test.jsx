import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import useStore, { getActivePhysicalCopies } from '../../../store/useStore';
import RequestAdditionalCopiesModal from '../components/workflow/RequestAdditionalCopiesModal';

const renderWithRouter = (ui) => {
  return render(
    <BrowserRouter>
      {ui}
    </BrowserRouter>
  );
};

describe('Request Additional Copies Deduplication & UX Refactor', () => {
  const sampleDoc = {
    id: 'doc-sop-test-01',
    title: 'SOP-PD-001',
    name: 'Standard Operating Procedure for Biscuit Baking',
    rev: '02',
    status: 'EFFECTIVE',
    department: 'PD'
  };

  const pdUser = {
    id: 'U-PD-01',
    name: 'สมชาย ผลิตดี',
    role: 'DEPT_STAFF',
    department: 'PD',
    primary_department: 'PD',
    affiliated_departments: ['PD']
  };

  beforeEach(() => {
    useStore.setState({
      currentUser: pdUser,
      documents: [sampleDoc],
      distributionLocations: [
        { id: 'PD-MASTER', name: 'PD Head Office (จุดคุมงานหลัก Master)', departmentId: 'PD', status: 'ACTIVE' },
        { id: 'PD-LINE-1', name: 'Line 1 - Mixing (ห้องผสม)', departmentId: 'PD', status: 'ACTIVE' },
        { id: 'PD-LINE-2', name: 'Line 2 - Baking (เตาอบ)', departmentId: 'PD', status: 'ACTIVE' }
      ]
    });
  });

  describe('1. Selector Logic: getActivePhysicalCopies & Next Copy Number', () => {
    it('deduplicates multiple instances sharing Copy 01 and excludes retired/destroyed/void copies', () => {
      const dirtyCopies = [
        // Old Rev.01 copy superseded & retired
        {
          id: 'copy-rev1',
          doc_id: 'doc-sop-test-01',
          doc_code: 'SOP-PD-001',
          docTitle: 'SOP-PD-001',
          copy_no: '01',
          status: 'RETIRED',
          location: 'PD Old Archives',
          holder_dept: 'PD'
        },
        // Old copy damaged and marked REPLACED_VOID
        {
          id: 'copy-void',
          doc_id: 'doc-sop-test-01',
          doc_code: 'SOP-PD-001',
          docTitle: 'SOP-PD-001',
          copy_no: '01',
          status: 'REPLACED_VOID',
          location: 'PD Old Station',
          holder_dept: 'PD'
        },
        // Active genuine physical Copy 01
        {
          id: 'copy-active-1',
          doc_id: 'doc-sop-test-01',
          doc_code: 'SOP-PD-001',
          docTitle: 'SOP-PD-001',
          copy_no: '01',
          status: 'ISSUED_ACTIVE',
          location: 'PD Head Office (จุดคุมงานหลัก Master)',
          locationId: 'PD-MASTER',
          holder_dept: 'PD'
        },
        // Duplicate entry pushed into state by issue request log
        {
          id: 'copy-dup-log',
          doc_id: 'doc-sop-test-01',
          doc_code: 'SOP-PD-001',
          docTitle: 'SOP-PD-001',
          copy_no: '01',
          status: 'ISSUED_ACTIVE',
          location: 'PD Head Office (จุดคุมงานหลัก Master)',
          locationId: 'PD-MASTER',
          holder_dept: 'PD'
        }
      ];

      const active = getActivePhysicalCopies(dirtyCopies, sampleDoc);

      // Exactly 1 pure physical copy should remain
      expect(active).toHaveLength(1);
      expect(active[0].copy_no).toBe('01');
      expect(active[0].status).toBe('ISSUED_ACTIVE');
      expect(active[0].location).toBe('PD Head Office (จุดคุมงานหลัก Master)');

      // Next Copy Number calculation
      const copyNumbers = active.map(c => parseInt(c.copy_no || '0', 10));
      const nextCopyNo = Math.max(...copyNumbers, 0) + 1;
      expect(nextCopyNo).toBe(2);
    });
  });

  describe('2. Modal UI/UX Rendering & Header Count', () => {
    it('displays exactly 1 unique copy card, correct header count (1 เล่ม), and Current Max: Copy 01', () => {
      // Setup state with 2 duplicated Copy 01 entries in store
      useStore.setState({
        controlledCopyInstances: [
          {
            id: 'cc-01-inst1',
            doc_id: 'doc-sop-test-01',
            doc_code: 'SOP-PD-001',
            docTitle: 'SOP-PD-001',
            copy_no: '01',
            status: 'ISSUED_ACTIVE',
            location: 'PD Head Office (จุดคุมงานหลัก Master)',
            locationId: 'PD-MASTER',
            holder_dept: 'PD'
          },
          {
            id: 'cc-01-inst2',
            doc_id: 'doc-sop-test-01',
            doc_code: 'SOP-PD-001',
            docTitle: 'SOP-PD-001',
            copy_no: '01',
            status: 'ISSUED_ACTIVE',
            location: 'PD Head Office (จุดคุมงานหลัก Master)',
            locationId: 'PD-MASTER',
            holder_dept: 'PD'
          }
        ]
      });

      renderWithRouter(
        <RequestAdditionalCopiesModal
          isOpen={true}
          onClose={() => {}}
          document={sampleDoc}
        />
      );

      // 1. Verify Header displays "(1 เล่ม)" NOT "(2 เล่ม)"
      expect(screen.getByText(/สำเนาควบคุมที่ถือครองปัจจุบัน \(1 เล่ม\)/i)).toBeInTheDocument();

      // 2. Verify Right Badge shows Current Max: Copy 01
      expect(screen.getByText(/Current Max: Copy 01/i)).toBeInTheDocument();

      // 3. Verify exactly ONE Copy 01 badge rendered in Section A
      const copy01Badges = screen.getAllByText('Copy 01');
      expect(copy01Badges).toHaveLength(1);

      // 4. Verify Point of use, Dept code, and Active status badge
      expect(screen.getAllByText('PD Head Office (จุดคุมงานหลัก Master)').length).toBeGreaterThan(0);
      expect(screen.getByText(/รหัสแผนก:/i)).toBeInTheDocument();
      expect(screen.getByText('Active')).toBeInTheDocument();

      // 5. Verify Section B has disabled the deployed station
      const deployedBadge = screen.getByText('ติดตั้งแล้ว');
      expect(deployedBadge).toBeInTheDocument();
    });

    it('displays "รอยืนยันรับ (Pending)" badge for pending copy', () => {
      useStore.setState({
        controlledCopyInstances: [
          {
            id: 'cc-01-pending',
            doc_id: 'doc-sop-test-01',
            doc_code: 'SOP-PD-001',
            docTitle: 'SOP-PD-001',
            copy_no: '01',
            status: 'PENDING_ISSUE',
            location: 'Line 1 - Mixing (ห้องผสม)',
            locationId: 'PD-LINE-1',
            holder_dept: 'PD'
          }
        ]
      });

      renderWithRouter(
        <RequestAdditionalCopiesModal
          isOpen={true}
          onClose={() => {}}
          document={sampleDoc}
        />
      );

      expect(screen.getByText('รอยืนยันรับ (Pending)')).toBeInTheDocument();
      expect(screen.getByText(/Current Max: Copy 01/i)).toBeInTheDocument();
    });

    it('previews sequential copy number Copy 02 when adding a new station', () => {
      useStore.setState({
        controlledCopyInstances: [
          {
            id: 'cc-01-inst1',
            doc_id: 'doc-sop-test-01',
            doc_code: 'SOP-PD-001',
            docTitle: 'SOP-PD-001',
            copy_no: '01',
            status: 'ISSUED_ACTIVE',
            location: 'PD Head Office (จุดคุมงานหลัก Master)',
            locationId: 'PD-MASTER',
            holder_dept: 'PD'
          }
        ]
      });

      renderWithRouter(
        <RequestAdditionalCopiesModal
          isOpen={true}
          onClose={() => {}}
          document={sampleDoc}
        />
      );

      // Click on available station Line 2 - Baking
      const line2Station = screen.getByText(/Line 2 - Baking \(เตาอบ\)/i);
      fireEvent.click(line2Station);

      // Realtime preview should show Copy 02
      expect(screen.getByText('Copy 02')).toBeInTheDocument();
      expect(screen.getByText(/\+1 เล่ม/i)).toBeInTheDocument();
    });
  });
});
