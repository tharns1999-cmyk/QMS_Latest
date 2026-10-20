import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import useStore from '../../../store/useStore';
import ControlledCopyRegister, {
  resolveDocCode,
  resolveDocTitle,
  resolveDocVersion
} from '../pages/ControlledCopy/ControlledCopyRegister';

describe('Controlled Copy Master-Detail Accordion & DocCode Resolution', () => {
  beforeEach(() => {
    useStore.setState({
      currentUser: { id: 'U001', name: 'DCC Officer', role: 'DCC_ADMIN', isDcc: true },
      documents: [
        {
          id: 'DOC-QC-001',
          title: 'WI-QC-01',
          name: 'ขั้นตอนการตรวจสอบคุณภาพวัตถุดิบรับเข้า',
          department: 'QC',
          rev: '01'
        },
        {
          id: 'DOC-PD-001',
          title: 'SOP-PD-001',
          name: 'มาตรฐานการผลิตและควบคุมเครื่องจักร',
          department: 'PD',
          rev: '02'
        }
      ],
      externalDocuments: [],
      documentControlledCopies: [
        {
          id: 'CC-001',
          doc_id: 'DOC-QC-001',
          doc_code: 'WI-QC-01',
          docTitle: 'ขั้นตอนการตรวจสอบคุณภาพวัตถุดิบรับเข้า',
          docName: 'ขั้นตอนการตรวจสอบคุณภาพวัตถุดิบรับเข้า',
          doc_version: '01',
          copy_no: '01',
          holder_dept: 'QC',
          department: 'QC',
          location: 'Lab QC 1',
          status: 'ISSUED_ACTIVE',
          receipt_confirmed_at: '2026-08-01T10:00:00Z',
          receipt_confirmed_by: 'สมชาย ควบคุมคุณภาพ'
        },
        {
          id: 'CC-002',
          doc_id: 'DOC-QC-001',
          // doc_code intentionally missing to test resolution & bugfix
          doc_code: null,
          docTitle: 'ขั้นตอนการตรวจสอบคุณภาพวัตถุดิบรับเข้า',
          docName: 'ขั้นตอนการตรวจสอบคุณภาพวัตถุดิบรับเข้า',
          doc_version: '01',
          copy_no: '02',
          holder_dept: 'PD',
          department: 'PD',
          location: 'Mixing Station Line 2',
          status: 'ISSUED_ACTIVE',
          receipt_confirmed_at: '2026-08-02T11:00:00Z',
          receipt_confirmed_by: 'สมศักดิ์ ฝ่ายผลิต'
        },
        {
          id: 'CC-003',
          doc_id: 'DOC-PD-001',
          doc_code: 'SOP-PD-001',
          docTitle: 'มาตรฐานการผลิตและควบคุมเครื่องจักร',
          docName: 'มาตรฐานการผลิตและควบคุมเครื่องจักร',
          doc_version: '02',
          copy_no: '01',
          holder_dept: 'PD',
          department: 'PD',
          location: 'Production Line 1 Office',
          status: 'ISSUED_ACTIVE',
          receipt_confirmed_at: '2026-08-05T09:00:00Z',
          receipt_confirmed_by: 'วิชัย หัวหน้างาน'
        }
      ],
      controlledCopyInstances: []
    });
  });

  describe('1. Resolution Helpers (Bugfix Guardrails)', () => {
    it('resolves genuine document code when copy.doc_code is populated', () => {
      const copy = { doc_code: 'WI-QC-01', docTitle: 'ขั้นตอนการตรวจสอบ' };
      expect(resolveDocCode(copy)).toBe('WI-QC-01');
    });

    it('resolves genuine document code from linked parent document when copy.doc_code is missing and docTitle is Thai', () => {
      const copy = { doc_id: 'DOC-QC-001', docTitle: 'ขั้นตอนการตรวจสอบคุณภาพวัตถุดิบรับเข้า' };
      const doc = { id: 'DOC-QC-001', title: 'WI-QC-01', name: 'ขั้นตอนการตรวจสอบคุณภาพวัตถุดิบรับเข้า' };
      
      const resolvedCode = resolveDocCode(copy, doc);
      expect(resolvedCode).toBe('WI-QC-01');
      expect(resolvedCode).not.toContain('ขั้นตอน');
    });

    it('resolves genuine title without repeating code in title', () => {
      const copy = { doc_code: 'WI-QC-01', docTitle: 'ขั้นตอนการตรวจสอบคุณภาพวัตถุดิบรับเข้า' };
      const doc = { id: 'DOC-QC-001', title: 'WI-QC-01', name: 'ขั้นตอนการตรวจสอบคุณภาพวัตถุดิบรับเข้า' };

      expect(resolveDocTitle(copy, doc)).toBe('ขั้นตอนการตรวจสอบคุณภาพวัตถุดิบรับเข้า');
    });

    it('normalizes revisions into standard Rev.XX format', () => {
      expect(resolveDocVersion({ rev: '01' })).toBe('Rev.01');
      expect(resolveDocVersion({ doc_version: 'Rev.02' })).toBe('Rev.02');
      expect(resolveDocVersion({}, { rev: '03' })).toBe('Rev.03');
    });
  });

  describe('2. Master-Detail Accordion Table in Tab 4', () => {
    it('groups copies under the same document code into 1 master row with summary pills', () => {
      render(
        <MemoryRouter initialEntries={['/controlled-copy?tab=ACTIVE_REGISTER']}>
          <ControlledCopyRegister />
        </MemoryRouter>
      );

      // Header indicates total physical copies
      expect(screen.getByText(/ทะเบียนสำเนาควบคุมที่ใช้งานอยู่จริง \(3 เล่ม\)/i)).toBeInTheDocument();

      // Master rows: WI-QC-01 and SOP-PD-001
      const qcPill = screen.getByText(/2 เล่มในจุดใช้งาน/i);
      expect(qcPill).toBeInTheDocument();

      const pdPill = screen.getByText(/1 เล่มในจุดใช้งาน/i);
      expect(pdPill).toBeInTheDocument();

      // First column badge renders monospace code WI-QC-01 and not duplicated Thai text
      const qcCodeBadges = screen.getAllByText('WI-QC-01');
      expect(qcCodeBadges.length).toBeGreaterThan(0);
      expect(screen.getByText('ขั้นตอนการตรวจสอบคุณภาพวัตถุดิบรับเข้า')).toBeInTheDocument();

      // Sub-table should NOT be visible before expanding
      expect(screen.queryByText('Lab QC 1')).not.toBeInTheDocument();
      expect(screen.queryByText('Mixing Station Line 2')).not.toBeInTheDocument();
    });

    it('expands sub-table when clicking master row, displaying Copy 01 and Copy 02 details', () => {
      render(
        <MemoryRouter initialEntries={['/controlled-copy?tab=ACTIVE_REGISTER']}>
          <ControlledCopyRegister />
        </MemoryRouter>
      );

      // Click on master row of WI-QC-01
      const qcMasterRow = screen.getByText('WI-QC-01').closest('tr');
      expect(qcMasterRow).toBeInTheDocument();
      fireEvent.click(qcMasterRow);

      // Now sub-table contents are revealed
      expect(screen.getByText('Copy 01')).toBeInTheDocument();
      expect(screen.getByText('Copy 02')).toBeInTheDocument();
      expect(screen.getByText('เล่มควบคุมจุดต้นทาง')).toBeInTheDocument();
      expect(screen.getByText('Lab QC 1')).toBeInTheDocument();
      expect(screen.getByText('Mixing Station Line 2')).toBeInTheDocument();
      expect(screen.getByText('สมชาย ควบคุมคุณภาพ')).toBeInTheDocument();
      expect(screen.getByText('สมศักดิ์ ฝ่ายผลิต')).toBeInTheDocument();

      // Action buttons to report damage/lost are present
      const reportButtons = screen.getAllByTitle('แจ้งชำรุด หรือสูญหาย');
      expect(reportButtons.length).toBe(2);

      // Clicking action button opens the report modal
      fireEvent.click(reportButtons[0]);
      expect(screen.getByText(/รายงานเอกสารชำรุด \/ สูญหาย/i)).toBeInTheDocument();
    });

    it('supports expand all and collapse all toggles', () => {
      render(
        <MemoryRouter initialEntries={['/controlled-copy?tab=ACTIVE_REGISTER']}>
          <ControlledCopyRegister />
        </MemoryRouter>
      );

      const expandAllBtn = screen.getByText('ขยายรายละเอียดทั้งหมด');
      expect(expandAllBtn).toBeInTheDocument();

      // Expand all
      fireEvent.click(expandAllBtn);
      expect(screen.getByText('Lab QC 1')).toBeInTheDocument();
      expect(screen.getByText('Production Line 1 Office')).toBeInTheDocument();

      // Toggle to collapse all
      const collapseAllBtn = screen.getByText('ยุบรายละเอียดทั้งหมด');
      expect(collapseAllBtn).toBeInTheDocument();
      fireEvent.click(collapseAllBtn);

      expect(screen.queryByText('Lab QC 1')).not.toBeInTheDocument();
      expect(screen.queryByText('Production Line 1 Office')).not.toBeInTheDocument();
    });

    it('auto-expands matching groups when searching', () => {
      render(
        <MemoryRouter initialEntries={['/controlled-copy?tab=ACTIVE_REGISTER']}>
          <ControlledCopyRegister />
        </MemoryRouter>
      );

      const searchInput = screen.getByPlaceholderText(/ค้นหารหัส, ชื่อเอกสาร/i);
      fireEvent.change(searchInput, { target: { value: 'Mixing' } });

      // Group WI-QC-01 contains a copy with location 'Mixing Station Line 2'
      // It should auto-expand and reveal the copy
      expect(screen.getByText('Mixing Station Line 2')).toBeInTheDocument();
      expect(screen.queryByText('Production Line 1 Office')).not.toBeInTheDocument();
    });
  });
});
