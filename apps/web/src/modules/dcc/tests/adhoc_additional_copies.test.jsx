import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithRouter, setTestUser } from '../../../test/test_utils';
import useStore from '../../../store/useStore';
import DocumentDetailModal from '../components/workflow/DocumentDetailModal';
import RequestAdditionalCopiesModal from '../components/workflow/RequestAdditionalCopiesModal';
import ControlledCopyRegister from '../pages/ControlledCopy/ControlledCopyRegister';
import Library from '../pages/Library/Library';

describe('Ad-Hoc Additional Controlled Copy Request System Tests', () => {
  const pdOwnerUser = {
    id: 'u1',
    name: 'สมชาย สายผลิต (PD Owner)',
    department: 'PD',
    depts: ['PD'],
    role: 'USER',
    isDcc: false,
    level: 3
  };

  const whNonOwnerUser = {
    id: 'u3',
    name: 'สมบัติ คลังสินค้า (WH User)',
    department: 'WH',
    depts: ['WH'],
    role: 'USER',
    isDcc: false,
    level: 2
  };

  const dccAdminUser = {
    id: 'u5',
    name: 'Admin QA (DCC)',
    department: 'QA',
    depts: ['QA'],
    role: 'DCC_ADMIN',
    isDcc: true,
    level: 5
  };

  const sampleDoc = {
    id: 'doc-sop-001',
    title: 'SOP-PD-001',
    name: 'Standard Operating Procedure for Biscuit Baking',
    rev: '03',
    status: 'EFFECTIVE',
    department: 'PD',
    owner_dept: 'PD',
    effectiveDate: '2026-08-01',
    distributions: [
      { departmentId: 'PD', locationId: 'PD-MASTER', locationName: 'PD Head Office (Master)' },
      { departmentId: 'PD', locationId: 'PD-L1', locationName: 'Line 1 - Mixing (ห้องผสม)' }
    ]
  };

  beforeEach(() => {
    useStore.setState({
      currentUser: pdOwnerUser,
      documents: [sampleDoc],
      documentControlledCopies: [
        {
          id: 'cc-1',
          doc_id: 'doc-sop-001',
          doc_code: 'SOP-PD-001',
          docTitle: 'SOP-PD-001',
          docName: 'Standard Operating Procedure for Biscuit Baking',
          doc_version: '03',
          copy_no: '01',
          issue_no: '01',
          holder_dept: 'PD',
          location: 'PD Head Office (Master)',
          locationId: 'PD-MASTER',
          status: 'ISSUED_ACTIVE'
        },
        {
          id: 'cc-2',
          doc_id: 'doc-sop-001',
          doc_code: 'SOP-PD-001',
          docTitle: 'SOP-PD-001',
          docName: 'Standard Operating Procedure for Biscuit Baking',
          doc_version: '03',
          copy_no: '02',
          issue_no: '01',
          holder_dept: 'PD',
          location: 'Line 1 - Mixing (ห้องผสม)',
          locationId: 'PD-L1',
          status: 'ISSUED_ACTIVE'
        }
      ],
      controlledCopyInstances: [
        {
          id: 'cc-1',
          doc_id: 'doc-sop-001',
          doc_code: 'SOP-PD-001',
          docTitle: 'SOP-PD-001',
          docName: 'Standard Operating Procedure for Biscuit Baking',
          doc_version: '03',
          copy_no: '01',
          issue_no: '01',
          holder_dept: 'PD',
          location: 'PD Head Office (Master)',
          locationId: 'PD-MASTER',
          status: 'ISSUED_ACTIVE'
        },
        {
          id: 'cc-2',
          doc_id: 'doc-sop-001',
          doc_code: 'SOP-PD-001',
          docTitle: 'SOP-PD-001',
          docName: 'Standard Operating Procedure for Biscuit Baking',
          doc_version: '03',
          copy_no: '02',
          issue_no: '01',
          holder_dept: 'PD',
          location: 'Line 1 - Mixing (ห้องผสม)',
          locationId: 'PD-L1',
          status: 'ISSUED_ACTIVE'
        }
      ],
      tasks: [],
      notifications: [],
      controlledCopyAuditTrail: [],
      actionLog: []
    });
  });

  describe('1. Entry Point & Permissions Check in DocumentDetailModal', () => {
    it('shows [➕ ขอแจกจ่ายสำเนาเพิ่ม] button for Owner Department on Effective document', () => {
      setTestUser(pdOwnerUser);

      renderWithRouter(
        <DocumentDetailModal
          isOpen={true}
          onClose={() => {}}
          document={sampleDoc}
        />
      );

      const requestBtn = screen.getByRole('button', { name: /ขอสำเนาควบคุมเพิ่มเติม/i });
      expect(requestBtn).toBeInTheDocument();
    });

    it('shows [➕ ขอแจกจ่ายสำเนาเพิ่ม] button for DCC Admin on Effective document', () => {
      setTestUser(dccAdminUser);

      renderWithRouter(
        <DocumentDetailModal
          isOpen={true}
          onClose={() => {}}
          document={sampleDoc}
        />
      );

      const requestBtn = screen.getByRole('button', { name: /ขอสำเนาควบคุมเพิ่มเติม/i });
      expect(requestBtn).toBeInTheDocument();
    });

    it('HIDES [➕ ขอแจกจ่ายสำเนาเพิ่ม] button for non-owner department user', () => {
      setTestUser(whNonOwnerUser);

      renderWithRouter(
        <DocumentDetailModal
          isOpen={true}
          onClose={() => {}}
          document={sampleDoc}
        />
      );

      const requestBtn = screen.queryByRole('button', { name: /ขอสำเนาควบคุมเพิ่มเติม/i });
      expect(requestBtn).not.toBeInTheDocument();
    });

    it('HIDES [➕ ขอแจกจ่ายสำเนาเพิ่ม] button if document is Obsolete / not Effective', () => {
      setTestUser(pdOwnerUser);
      const obsoleteDoc = { ...sampleDoc, status: 'OBSOLETE_ARCHIVED' };

      renderWithRouter(
        <DocumentDetailModal
          isOpen={true}
          onClose={() => {}}
          document={obsoleteDoc}
        />
      );

      const requestBtn = screen.queryByRole('button', { name: /ขอสำเนาควบคุมเพิ่มเติม/i });
      expect(requestBtn).not.toBeInTheDocument();
    });
  });

  describe('2. RequestAdditionalCopiesModal Form & Live Numbering Preview', () => {
    it('renders existing copies table and current max copy number (Copy 02)', () => {
      renderWithRouter(
        <RequestAdditionalCopiesModal
          isOpen={true}
          onClose={() => {}}
          document={sampleDoc}
        />
      );

      expect(screen.getByText(/Current Max: Copy 02/i)).toBeInTheDocument();
      expect(screen.getAllByText(/PD Head Office \(Master\)/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/Line 1 - Mixing \(ห้องผสม\)/i).length).toBeGreaterThan(0);
    });

    it('filters out already deployed stations and indicates "ติดตั้งแล้ว"', () => {
      renderWithRouter(
        <RequestAdditionalCopiesModal
          isOpen={true}
          onClose={() => {}}
          document={sampleDoc}
        />
      );

      // Station PD-L1 is already deployed
      const deployedBadges = screen.getAllByText('ติดตั้งแล้ว');
      expect(deployedBadges.length).toBeGreaterThan(0);
    });

    it('selects new stations and previews next sequential copy numbers (Copy 03, Copy 04...)', async () => {
      renderWithRouter(
        <RequestAdditionalCopiesModal
          isOpen={true}
          onClose={() => {}}
          document={sampleDoc}
        />
      );

      // Click on Line 2 - Baking (available station)
      const line2Btn = screen.getByText(/Line 2 - Baking/i);
      fireEvent.click(line2Btn);

      // Verify real-time numbering preview shows Copy 03
      expect(screen.getByText('Copy 03')).toBeInTheDocument();
      expect(screen.getByText(/\+1 เล่ม/i)).toBeInTheDocument();

      // Click on Line 3 - Fruit Line
      const line3Btn = screen.getByText(/Line 3 - Fruit Line/i);
      fireEvent.click(line3Btn);

      // Verify real-time numbering preview shows Copy 04
      expect(screen.getByText('Copy 04')).toBeInTheDocument();
      expect(screen.getByText(/\+2 เล่ม/i)).toBeInTheDocument();
    });

    it('adds custom ad-hoc location and numbers sequentially', async () => {
      const user = userEvent.setup();

      renderWithRouter(
        <RequestAdditionalCopiesModal
          isOpen={true}
          onClose={() => {}}
          document={sampleDoc}
        />
      );

      const customInput = screen.getByPlaceholderText(/ระบุจุดติดตั้งพิเศษเฉพาะกิจสำหรับแผนก PD/i);
      await user.type(customInput, 'Line 5 Automation Conveyor');

      const addBtn = screen.getByRole('button', { name: /เพิ่มจุดพิเศษ/i });
      await user.click(addBtn);

      // Custom location should appear with Copy 03
      expect(screen.getByText('Line 5 Automation Conveyor')).toBeInTheDocument();
      expect(screen.getByText('Copy 03')).toBeInTheDocument();
    });
  });

  describe('3. State Action: requestAdditionalControlledCopies', () => {
    it('creates new copy records in PENDING_ISSUE state, updates document target_depts, and generates DCC task', () => {
      const newLocations = [
        { departmentId: 'PD', locationId: 'PD-L2', locationName: 'Line 2 - Baking (เตาอบ)' },
        { departmentId: 'WH', locationId: 'WH-FG', locationName: 'Finished Goods Warehouse', isCustom: true }
      ];

      useStore.getState().requestAdditionalControlledCopies(
        'doc-sop-001',
        newLocations,
        'ขยายไลน์การผลิตเตาอบใหม่ และจัดเก็บคู่มือที่คลังสินค้าสำเร็จรูป'
      );

      const state = useStore.getState();

      // 1. Verify New Controlled Copy Instances
      const copies = state.controlledCopyInstances.filter(c => c.doc_id === 'doc-sop-001');
      expect(copies).toHaveLength(4); // 2 existing + 2 new

      const copy3 = copies.find(c => c.copy_no === '03');
      const copy4 = copies.find(c => c.copy_no === '04');

      expect(copy3).toBeDefined();
      expect(copy3.status).toBe('PENDING_ISSUE');
      expect(copy3.location).toBe('Line 2 - Baking (เตาอบ)');
      expect(copy3.is_adhoc).toBe(true);

      expect(copy4).toBeDefined();
      expect(copy4.status).toBe('PENDING_ISSUE');
      expect(copy4.holder_dept).toBe('WH');
      expect(copy4.location).toBe('Finished Goods Warehouse');

      // 2. Verify Document target_depts automatically updated with 'WH'
      const updatedDoc = state.documents.find(d => d.id === 'doc-sop-001');
      expect(updatedDoc.target_depts).toContain('WH');
      expect(updatedDoc.target_depts).toContain('PD');

      // 3. Verify DCC Task created
      const dccTask = state.tasks.find(t => t.taskType === 'DCC_ISSUE_CONTROLLED_COPIES' || t.title.includes('ขอออกสำเนาควบคุมเพิ่มเติม'));
      expect(dccTask).toBeDefined();
      expect(dccTask.assignedToRole).toBe('DCC_ADMIN');
      expect(dccTask.status).toBe('PENDING');

      // 4. Verify copies appear in DCC Control Portal PENDING_ISSUE queue
      setTestUser(dccAdminUser);
      renderWithRouter(<ControlledCopyRegister />, { route: '/controlled-copy?tab=PENDING_ISSUE' });
      expect(screen.getByText('Line 2 - Baking (เตาอบ)')).toBeInTheDocument();
      expect(screen.getByText('Finished Goods Warehouse')).toBeInTheDocument();
    });
  });

  describe('4. Library Table Row Action Matrix & RBAC Isolation', () => {
    it('shows Request Additional Copies button in Library for Owner Dept and hides it for Recipient Dept', () => {
      // 1. PD Owner viewing PD document
      setTestUser(pdOwnerUser);
      const { unmount } = renderWithRouter(<Library />);
      const ownerAdhocBtn = screen.queryByTitle(/ขอสำเนาควบคุมเพิ่มเติม/i);
      expect(ownerAdhocBtn).toBeInTheDocument();
      unmount();

      // 2. WH Non-Owner viewing PD document
      setTestUser(whNonOwnerUser);
      renderWithRouter(<Library />);
      const recipientAdhocBtn = screen.queryByTitle(/ขอสำเนาควบคุมเพิ่มเติม/i);
      expect(recipientAdhocBtn).not.toBeInTheDocument();
    });
  });
});
