import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import useStore from '../../../store/useStore';
import DarList from '../pages/DarWorkflow/DarList';
import Dashboard from '../pages/Dashboard/Dashboard';
import DarObsoleteForm from '../pages/DarWorkflow/DarObsoleteForm';
import { formatDarDocumentDisplay, getDarStatusBadgeMeta } from '../utils/darHelper';

describe('DAR Table Title Standardization, [OBSOLETE] Strip, & Status Badge Localization', () => {
  const currentUser = {
    id: 'U005',
    name: 'บีม',
    department: 'QC',
    role: 'STAFF',
    isDcc: false
  };

  const sampleDoc = {
    id: 'DOC-QC-SOP-01',
    code: 'SOP-QC-01',
    document_code: 'SOP-QC-01',
    name: 'ระเบียบปฏิบัติการควบคุมคุณภาพและการสุ่มตัวอย่าง',
    title: 'SOP-QC-01',
    department: 'QC',
    status: 'EFFECTIVE',
    rev: '01'
  };

  const obsoleteDarWithPrefix = {
    id: 'DAR-2026-004',
    darNumber: 'DAR-2026-004',
    dar_no: 'DAR-2026-004',
    type: 'OBSOLETE',
    status: 'PENDING_REVIEW',
    isDraft: false,
    requesterId: 'U005',
    requester_id: 'U005',
    document_code: 'SOP-QC-01',
    doc_code: 'SOP-QC-01',
    title: '[OBSOLETE] SOP-QC-01',
    document_title: '[OBSOLETE] ระเบียบปฏิบัติการควบคุมคุณภาพและการสุ่มตัวอย่าง',
    department: 'QC',
    date: '2026-10-08',
    targetDocumentId: 'DOC-QC-SOP-01'
  };

  const newDar = {
    id: 'DAR-2026-001',
    darNumber: 'DAR-2026-001',
    dar_no: 'DAR-2026-001',
    type: 'NEW',
    status: 'COMPLETED',
    isDraft: false,
    requesterId: 'U005',
    requester_id: 'U005',
    document_code: 'WI-QC-001',
    title: 'คู่มือการใช้งานเครื่องชั่งสารความละเอียดสูง',
    document_title: 'คู่มือการใช้งานเครื่องชั่งสารความละเอียดสูง',
    department: 'QC',
    date: '2026-10-01'
  };

  const revisionDar = {
    id: 'DAR-2026-002',
    darNumber: 'DAR-2026-002',
    dar_no: 'DAR-2026-002',
    type: 'REVISION',
    status: 'APPROVED',
    isDraft: false,
    requesterId: 'U005',
    requester_id: 'U005',
    document_code: 'SOP-QC-01',
    title: '[REVISION] ระเบียบปฏิบัติการควบคุมคุณภาพและการสุ่มตัวอย่าง',
    document_title: '[REVISION] ระเบียบปฏิบัติการควบคุมคุณภาพและการสุ่มตัวอย่าง',
    department: 'QC',
    date: '2026-10-05',
    targetDocumentId: 'DOC-QC-SOP-01'
  };

  beforeEach(() => {
    useStore.setState({
      currentUser,
      documents: [sampleDoc],
      dars: [obsoleteDarWithPrefix, newDar, revisionDar],
      tasks: [],
      masterUsers: [currentUser]
    });
  });

  describe('1. formatDarDocumentDisplay Data Sanitization', () => {
    it('strips redundant [OBSOLETE] prefix and resolves docCode and docTitle cleanly', () => {
      const display = formatDarDocumentDisplay(obsoleteDarWithPrefix, [sampleDoc]);
      expect(display.docCode).toBe('SOP-QC-01');
      expect(display.docTitle).not.toContain('[OBSOLETE]');
      expect(display.docTitle).toBe('ระเบียบปฏิบัติการควบคุมคุณภาพและการสุ่มตัวอย่าง');
    });

    it('strips redundant [REVISION] and [NEW] prefixes correctly', () => {
      const displayRev = formatDarDocumentDisplay(revisionDar, [sampleDoc]);
      expect(displayRev.docCode).toBe('SOP-QC-01');
      expect(displayRev.docTitle).not.toContain('[REVISION]');
      expect(displayRev.docTitle).toBe('ระเบียบปฏิบัติการควบคุมคุณภาพและการสุ่มตัวอย่าง');

      const rawNew = { ...newDar, title: '[NEW] คู่มือการใช้งานเครื่องชั่งสารความละเอียดสูง' };
      const displayNew = formatDarDocumentDisplay(rawNew, []);
      expect(displayNew.docTitle).not.toContain('[NEW]');
      expect(displayNew.docTitle).toBe('คู่มือการใช้งานเครื่องชั่งสารความละเอียดสูง');
    });

    it('falls back gracefully when docCode is missing but title has obsolete prefix', () => {
      const legacyObsolete = {
        title: '[OBSOLETE] SOP-QC-01'
      };
      const display = formatDarDocumentDisplay(legacyObsolete, [sampleDoc]);
      expect(display.docCode).toBe('SOP-QC-01');
      expect(display.docTitle).toBe('ระเบียบปฏิบัติการควบคุมคุณภาพและการสุ่มตัวอย่าง');
    });
  });

  describe('2. DarList Table Display Standards', () => {
    it('renders 2-line layout without [OBSOLETE] prefix for DAR-2026-004 in DarList', () => {
      render(
        <MemoryRouter initialEntries={['/dcc/dar/list']}>
          <DarList />
        </MemoryRouter>
      );

      // Verify DAR-2026-004 row is present
      expect(screen.getByText('DAR-26-004')).toBeInTheDocument();

      // Ensure "[OBSOLETE]" is NOT in any document cell text
      expect(screen.queryByText(/\[OBSOLETE\]/i)).not.toBeInTheDocument();

      // Document Code should be present
      expect(screen.getAllByText('SOP-QC-01').length).toBeGreaterThanOrEqual(1);

      // Document Title should be present
      expect(screen.getAllByText('ระเบียบปฏิบัติการควบคุมคุณภาพและการสุ่มตัวอย่าง').length).toBeGreaterThanOrEqual(1);
    });

    it('verifies 2-line typography classes on document column', () => {
      const { container } = render(
        <MemoryRouter initialEntries={['/dcc/dar/list']}>
          <DarList />
        </MemoryRouter>
      );

      const tableRows = container.querySelectorAll('tbody tr');
      expect(tableRows.length).toBeGreaterThanOrEqual(3);

      // First row (DAR-2026-004)
      const firstRow = tableRows[0];
      const docCodeSpan = firstRow.querySelector('.font-semibold.text-slate-800');
      const docTitleSpan = firstRow.querySelector('.text-xs.text-slate-500.line-clamp-1');

      expect(docCodeSpan).toBeInTheDocument();
      expect(docTitleSpan).toBeInTheDocument();
      expect(docTitleSpan.textContent).not.toContain('[OBSOLETE]');
    });
  });

  describe('3. Dashboard Recent DAR Table Display Standards', () => {
    it('renders 2-line layout without [OBSOLETE] prefix in Dashboard', () => {
      render(
        <MemoryRouter initialEntries={['/dashboard']}>
          <Dashboard />
        </MemoryRouter>
      );

      // Verify DAR-2026-004 row is present
      expect(screen.getByText('DAR-26-004')).toBeInTheDocument();

      // Ensure "[OBSOLETE]" text is NOT displayed anywhere
      expect(screen.queryByText(/\[OBSOLETE\]/i)).not.toBeInTheDocument();

      // Clean Title is rendered
      expect(screen.getAllByText('ระเบียบปฏิบัติการควบคุมคุณภาพและการสุ่มตัวอย่าง').length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('4. Status Badge Localization Consistency', () => {
    it('translates PENDING_REVIEW to "รอการทบทวน" with badge-pending class', () => {
      const meta = getDarStatusBadgeMeta('PENDING_REVIEW');
      expect(meta.label).toBe('รอการทบทวน');
      expect(meta.className).toBe('badge-pending');
    });

    it('translates COMPLETED to "เสร็จสมบูรณ์" with badge-active class', () => {
      const meta = getDarStatusBadgeMeta('COMPLETED');
      expect(meta.label).toBe('เสร็จสมบูรณ์');
      expect(meta.className).toBe('badge-active');
    });

    it('translates APPROVED to "อนุมัติแล้ว" with badge-active class', () => {
      const meta = getDarStatusBadgeMeta('APPROVED');
      expect(meta.label).toBe('อนุมัติแล้ว');
      expect(meta.className).toBe('badge-active');
    });

    it('translates REJECTED to "ไม่อนุมัติ" with badge-rejected class', () => {
      const meta = getDarStatusBadgeMeta('REJECTED');
      expect(meta.label).toBe('ไม่อนุมัติ');
      expect(meta.className).toBe('badge-rejected');
    });

    it('displays Thai labels for all statuses in DarList table', () => {
      render(
        <MemoryRouter initialEntries={['/dcc/dar/list']}>
          <DarList />
        </MemoryRouter>
      );

      // PENDING_REVIEW -> รอการทบทวน
      expect(screen.getByText('รอการทบทวน')).toBeInTheDocument();
      // COMPLETED -> เสร็จสมบูรณ์
      expect(screen.getByText('เสร็จสมบูรณ์')).toBeInTheDocument();
      // APPROVED -> อนุมัติแล้ว
      expect(screen.getByText('อนุมัติแล้ว')).toBeInTheDocument();
    });
  });

  describe('5. DarObsoleteForm Presets and Submission Payload', () => {
    it('sets clean title without [OBSOLETE] prefix when creating an obsolete DAR', () => {
      useStore.setState({
        addDar: () => ({ id: 'DAR-NEW-OBS-01' })
      });

      render(
        <MemoryRouter initialEntries={['/dar/new/obsolete?docCode=SOP-QC-01']}>
          <DarObsoleteForm />
        </MemoryRouter>
      );

      // Selected document display box & summary strip
      expect(screen.getAllByText('SOP-QC-01').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('ระเบียบปฏิบัติการควบคุมคุณภาพและการสุ่มตัวอย่าง').length).toBeGreaterThanOrEqual(1);
    });
  });
});
