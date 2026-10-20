import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import useStore from '../../../store/useStore';
import {
  isThaiText,
  resolveDocCode,
  resolveDocTitle,
  resolveDocVersion,
  resolveOwnerDept,
  resolveCopyDoc
} from '../utils/documentUtils';
import DarRevisionForm from '../pages/DarWorkflow/DarRevisionForm';
import DarObsoleteForm from '../pages/DarWorkflow/DarObsoleteForm';

describe('DAR Document Code Resolution & Form Standardization', () => {
  const mockDocs = [
    {
      id: 'DOC-QC-001',
      title: 'WI-QC-01',
      name: 'ขั้นตอนการตรวจสอบคุณภาพวัตถุดิบรับเข้า',
      department: 'QC',
      rev: '01',
      status: 'Effective',
      docType: 'WI'
    },
    {
      id: 'DOC-PD-002',
      docNo: 'SOP-PD-002',
      title: 'ขั้นตอนการปฏิบัติงานสายการผลิตผสม',
      name: 'ขั้นตอนการปฏิบัติงานสายการผลิตผสม',
      department: 'PD',
      rev: '02',
      status: 'Effective',
      docType: 'SOP'
    },
    {
      id: 'DOC-QA-003',
      doc_code: 'QP-QA-003',
      docName: 'คู่มือการประกันคุณภาพ',
      title: 'Quality Manual',
      department: 'QA',
      rev: '00',
      status: 'Effective',
      docType: 'QP'
    }
  ];

  beforeEach(() => {
    useStore.setState({
      currentUser: {
        id: 'U-QC-01',
        name: 'นายตรวจ สมาร์ท',
        role: 'STAFF',
        department: 'QC',
        dept: 'QC'
      },
      documents: mockDocs,
      dars: [],
      darRequests: [],
      documentTypes: [
        { id: 'WI', code: 'WI', nameTh: 'วิธีปฏิบัติงาน', name: 'Work Instruction', status: 'ACTIVE' },
        { id: 'SOP', code: 'SOP', nameTh: 'ระเบียบปฏิบัติ', name: 'Standard Procedure', status: 'ACTIVE' },
        { id: 'QP', code: 'QP', nameTh: 'คู่มือคุณภาพ', name: 'Quality Procedure', status: 'ACTIVE' }
      ],
      masterUsers: [],
      reviewUsers: [],
      approveUsers: [],
      documentControlledCopies: [],
      controlledCopyInstances: []
    });
  });

  describe('1. Unit Tests for Resolution Helpers in documentUtils.js', () => {
    it('correctly identifies Thai text', () => {
      expect(isThaiText('ขั้นตอนการตรวจสอบ')).toBe(true);
      expect(isThaiText('WI-QC-01')).toBe(false);
      expect(isThaiText('WI-QC-01 (คู่มือ)')).toBe(true);
      expect(isThaiText('')).toBe(false);
      expect(isThaiText(null)).toBe(false);
    });

    it('resolves genuine docCode when title contains the code and name contains Thai title', () => {
      const doc = {
        id: 'DOC-QC-001',
        title: 'WI-QC-01',
        name: 'ขั้นตอนการตรวจสอบคุณภาพวัตถุดิบรับเข้า'
      };
      expect(resolveDocCode(doc)).toBe('WI-QC-01');
      expect(resolveDocTitle(doc)).toBe('ขั้นตอนการตรวจสอบคุณภาพวัตถุดิบรับเข้า');
    });

    it('resolves genuine docCode when docNo contains code and title contains Thai title', () => {
      const doc = {
        id: 'DOC-PD-002',
        docNo: 'SOP-PD-002',
        title: 'ขั้นตอนการปฏิบัติงานสายการผลิตผสม',
        name: 'ขั้นตอนการปฏิบัติงานสายการผลิตผสม'
      };
      expect(resolveDocCode(doc)).toBe('SOP-PD-002');
      expect(resolveDocTitle(doc)).toBe('ขั้นตอนการปฏิบัติงานสายการผลิตผสม');
    });

    it('supports dual signature resolveDocCode(copy, doc) when copy doc_code is missing', () => {
      const copy = {
        id: 'CC-001',
        doc_id: 'DOC-QC-001',
        doc_code: null,
        docTitle: 'ขั้นตอนการตรวจสอบคุณภาพ'
      };
      const doc = {
        id: 'DOC-QC-001',
        title: 'WI-QC-01',
        name: 'ขั้นตอนการตรวจสอบคุณภาพวัตถุดิบรับเข้า'
      };
      expect(resolveDocCode(copy, doc)).toBe('WI-QC-01');
      expect(resolveDocTitle(copy, doc)).toBe('ขั้นตอนการตรวจสอบคุณภาพวัตถุดิบรับเข้า');
    });

    it('normalizes revisions and departments', () => {
      expect(resolveDocVersion({ rev: '01' })).toBe('Rev.01');
      expect(resolveDocVersion({ revision: '2' })).toBe('Rev.2');
      expect(resolveOwnerDept({ department: 'QC' })).toBe('QC');
    });

    it('resolves linked copy doc', () => {
      const copy = { doc_id: 'DOC-QC-001' };
      const found = resolveCopyDoc(copy, mockDocs, []);
      expect(found?.title).toBe('WI-QC-01');
    });
  });

  describe('2. DAR Revision Form UI: Dropdown & Selected State', () => {
    it('renders genuine document code in the dropdown option header and title underneath', async () => {
      render(
        <MemoryRouter>
          <DarRevisionForm />
        </MemoryRouter>
      );

      // Open the dropdown by focusing the search input
      const searchInput = screen.getByPlaceholderText(/ค้นหารหัส หรือชื่อ/i);
      fireEvent.focus(searchInput);

      // Dropdown option header should display WI-QC-01
      const docCodeElement = screen.getByText('WI-QC-01');
      expect(docCodeElement).toBeInTheDocument();
      expect(docCodeElement.className).toContain('text-[#0D99FF]');

      // Dropdown option sub-line should display the Thai name
      expect(screen.getByText('ขั้นตอนการตรวจสอบคุณภาพวัตถุดิบรับเข้า')).toBeInTheDocument();
    });

    it('updates Selected State box with blue code badge and title upon selecting a document', async () => {
      render(
        <MemoryRouter>
          <DarRevisionForm />
        </MemoryRouter>
      );

      // Focus search input to show dropdown
      const searchInput = screen.getByPlaceholderText(/ค้นหารหัส หรือชื่อ/i);
      fireEvent.focus(searchInput);

      // Click the document option
      const docOption = screen.getByText('ขั้นตอนการตรวจสอบคุณภาพวัตถุดิบรับเข้า').closest('div[class*="cursor-pointer"]');
      expect(docOption).toBeInTheDocument();
      fireEvent.click(docOption);

      // Verify Selected State Box:
      // Badge with blue styling containing WI-QC-01
      const selectedBadge = screen.getByText('WI-QC-01');
      expect(selectedBadge).toBeInTheDocument();
      expect(selectedBadge.className).toContain('bg-[#E5F4FF]');
      expect(selectedBadge.className).toContain('text-[#0D99FF]');

      // Title beside the badge
      const titleSpan = screen.getByText('ขั้นตอนการตรวจสอบคุณภาพวัตถุดิบรับเข้า');
      expect(titleSpan).toBeInTheDocument();

      // Clear button exists and can deselect the document
      const clearBtn = screen.getByTitle('เปลี่ยนเอกสาร');
      expect(clearBtn).toBeInTheDocument();
      fireEvent.click(clearBtn);

      // Dropdown search input should reappear
      expect(screen.getByPlaceholderText(/ค้นหารหัส หรือชื่อ/i)).toBeInTheDocument();
    });

    it('filters documents in dropdown by both document code and document title', () => {
      render(
        <MemoryRouter>
          <DarRevisionForm />
        </MemoryRouter>
      );

      const searchInput = screen.getByPlaceholderText(/ค้นหารหัส หรือชื่อ/i);

      // Search by code: "WI"
      fireEvent.change(searchInput, { target: { value: 'WI' } });
      expect(screen.getByText('WI-QC-01')).toBeInTheDocument();

      // Search by Thai name: "วัตถุดิบ"
      fireEvent.change(searchInput, { target: { value: 'วัตถุดิบ' } });
      expect(screen.getByText('WI-QC-01')).toBeInTheDocument();

      // Search non-existent
      fireEvent.change(searchInput, { target: { value: 'NONEXISTENT-CODE-999' } });
      expect(screen.getByText(/ไม่พบเอกสารที่มีผลบังคับใช้/i)).toBeInTheDocument();
    });
  });

  describe('3. DAR Obsolete Form: Select Options & Preview', () => {
    it('renders standardized document code in obsolete select options and preview', () => {
      render(
        <MemoryRouter>
          <DarObsoleteForm />
        </MemoryRouter>
      );

      // Select dropdown option should be formatted with [CODE] TITLE (Rev. XX)
      const selectElement = screen.getByDisplayValue(/-- เลือกเอกสารที่ต้องการยกเลิก --/i);
      expect(selectElement).toBeInTheDocument();

      const option = screen.getByRole('option', { name: /\[WI-QC-01\] ขั้นตอนการตรวจสอบคุณภาพวัตถุดิบรับเข้า/i });
      expect(option).toBeInTheDocument();

      // Selecting the document renders preview card with badge and title
      fireEvent.change(selectElement, { target: { value: 'DOC-QC-001' } });

      const badges = screen.getAllByText('WI-QC-01');
      expect(badges.length).toBeGreaterThan(0);
      expect(screen.getAllByText('ขั้นตอนการตรวจสอบคุณภาพวัตถุดิบรับเข้า').length).toBeGreaterThan(0);
    });

    it('renders standardized document code in obsolete search autocomplete dropdown options', () => {
      render(
        <MemoryRouter>
          <DarObsoleteForm />
        </MemoryRouter>
      );

      // Open the dropdown by focusing the search input
      const searchInput = screen.getByPlaceholderText(/ค้นหารหัส หรือชื่อ/i);
      fireEvent.focus(searchInput);

      // Dropdown option header should display WI-QC-01 with blue styling
      const docCodeElement = screen.getByText('WI-QC-01');
      expect(docCodeElement).toBeInTheDocument();
      expect(docCodeElement.className).toContain('text-[#0D99FF]');

      // Dropdown option sub-line should display the Thai name
      expect(screen.getByText('ขั้นตอนการตรวจสอบคุณภาพวัตถุดิบรับเข้า')).toBeInTheDocument();
    });

    it('updates Selected State box, transition badge, and clear button upon selecting a document in obsolete form', async () => {
      render(
        <MemoryRouter>
          <DarObsoleteForm />
        </MemoryRouter>
      );

      // Focus search input to show dropdown
      const searchInput = screen.getByPlaceholderText(/ค้นหารหัส หรือชื่อ/i);
      fireEvent.focus(searchInput);

      // Click the document option
      const docOption = screen.getByText('ขั้นตอนการตรวจสอบคุณภาพวัตถุดิบรับเข้า').closest('div[class*="cursor-pointer"]');
      expect(docOption).toBeInTheDocument();
      fireEvent.click(docOption);

      // Verify Selected State Box:
      const selectedBadge = screen.getAllByText('WI-QC-01')[0];
      expect(selectedBadge).toBeInTheDocument();
      expect(selectedBadge.className).toContain('bg-[#E5F4FF]');
      expect(selectedBadge.className).toContain('text-[#0D99FF]');

      // Transition Badge
      expect(screen.getByText(/OBSOLETE \(ยกเลิกถาวร\)/i)).toBeInTheDocument();
      expect(screen.getByText(/สถานะหลังการอนุมัติ:/i)).toBeInTheDocument();

      // Clear button exists and can deselect the document
      const clearBtn = screen.getByTitle('เปลี่ยนเอกสาร');
      expect(clearBtn).toBeInTheDocument();
      fireEvent.click(clearBtn);

      // Dropdown search input should reappear
      expect(screen.getByPlaceholderText(/ค้นหารหัส หรือชื่อ/i)).toBeInTheDocument();
    });

    it('filters obsolete documents in dropdown by both document code and document title', () => {
      render(
        <MemoryRouter>
          <DarObsoleteForm />
        </MemoryRouter>
      );

      const searchInput = screen.getByPlaceholderText(/ค้นหารหัส หรือชื่อ/i);

      // Search by code: "WI"
      fireEvent.change(searchInput, { target: { value: 'WI' } });
      expect(screen.getByText('WI-QC-01')).toBeInTheDocument();

      // Search by Thai name: "วัตถุดิบ"
      fireEvent.change(searchInput, { target: { value: 'วัตถุดิบ' } });
      expect(screen.getByText('WI-QC-01')).toBeInTheDocument();

      // Search non-existent
      fireEvent.change(searchInput, { target: { value: 'NONEXISTENT-CODE-999' } });
      expect(screen.getByText(/ไม่พบเอกสารที่มีผลบังคับใช้/i)).toBeInTheDocument();
    });
  });
});
