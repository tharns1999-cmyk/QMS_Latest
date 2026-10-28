import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import useStore from '../../../store/useStore';
import DarNewForm from '../pages/DarWorkflow/DarNewForm';
import ExternalDocFormModal from '../pages/ExternalDocs/ExternalDocFormModal';
import { formatDocumentRunningNumber, generateDocumentCode } from '../services/MasterDataService';

const renderWithRouter = (ui) => {
  return render(
    <MemoryRouter>
      {ui}
    </MemoryRouter>
  );
};

describe('2-Digit Base Document Running Number Standard (01-99 ➔ 100+) Tests', () => {
  beforeEach(() => {
    useStore.getState().resetStore();
    useStore.setState({
      currentUser: {
        id: 'U001',
        name: 'Admin QA (DCC)',
        department: 'QA',
        depts: ['QA'],
        isDcc: true,
        role: 'DCC_ADMIN',
        level: 1
      },
      documents: [],
      dars: [],
      externalDocuments: [],
      tasks: [],
      notifications: []
    });
  });

  describe('1. formatDocumentRunningNumber & generateDocumentCode Helper Units', () => {
    it('formats numbers 1-99 as 2 digits with leading zero, and 100+ as natural 3+ digits', () => {
      expect(formatDocumentRunningNumber(1)).toBe('01');
      expect(formatDocumentRunningNumber(2)).toBe('02');
      expect(formatDocumentRunningNumber(9)).toBe('09');
      expect(formatDocumentRunningNumber(10)).toBe('10');
      expect(formatDocumentRunningNumber(45)).toBe('45');
      expect(formatDocumentRunningNumber(99)).toBe('99');
      expect(formatDocumentRunningNumber(100)).toBe('100');
      expect(formatDocumentRunningNumber(101)).toBe('101');
      expect(formatDocumentRunningNumber(999)).toBe('999');
      expect(formatDocumentRunningNumber(1000)).toBe('1000');
    });

    it('handles edge cases (strings, null, undefined, 0)', () => {
      expect(formatDocumentRunningNumber('1')).toBe('01');
      expect(formatDocumentRunningNumber('09')).toBe('09');
      expect(formatDocumentRunningNumber('99')).toBe('99');
      expect(formatDocumentRunningNumber('100')).toBe('100');
      expect(formatDocumentRunningNumber(null)).toBe('01');
      expect(formatDocumentRunningNumber(undefined)).toBe('01');
      expect(formatDocumentRunningNumber('invalid')).toBe('01');
    });

    it('replaces both {##} and {###} patterns seamlessly', () => {
      // 2-digit pattern {##}
      expect(generateDocumentCode('SOP-{Dept}-{##}', 'SOP', 'PD', 1)).toBe('SOP-PD-01');
      expect(generateDocumentCode('SOP-{Dept}-{##}', 'SOP', 'PD', 9)).toBe('SOP-PD-09');
      expect(generateDocumentCode('SOP-{Dept}-{##}', 'SOP', 'PD', 10)).toBe('SOP-PD-10');
      expect(generateDocumentCode('SOP-{Dept}-{##}', 'SOP', 'PD', 99)).toBe('SOP-PD-99');
      expect(generateDocumentCode('SOP-{Dept}-{##}', 'SOP', 'PD', 100)).toBe('SOP-PD-100');
      expect(generateDocumentCode('SOP-{Dept}-{##}', 'SOP', 'PD', 105)).toBe('SOP-PD-105');

      // 3-digit pattern {###} (legacy compatibility)
      expect(generateDocumentCode('WI-{Dept}-{###}', 'WI', 'EN', 1)).toBe('WI-EN-01');
      expect(generateDocumentCode('WI-{Dept}-{###}', 'WI', 'EN', 99)).toBe('WI-EN-99');
      expect(generateDocumentCode('WI-{Dept}-{###}', 'WI', 'EN', 100)).toBe('WI-EN-100');
    });
  });

  describe('2. Internal DAR Document Code Auto-Generation (DarNewForm & useStore)', () => {
    it('generates SOP-QA-01 for 1st document and scales to SOP-QA-10 and SOP-QA-100', () => {
      // 1. First document -> SOP-QA-01
      act(() => {
        useStore.getState().addDar({
          type: 'NEW',
          docType: 'SOP',
          department: 'QA',
          title: 'QA Master Operating Procedure',
          requesterId: 'U001',
          requesterName: 'Admin QA (DCC)',
          isDraft: false
        });
      });

      const dars1 = useStore.getState().dars;
      expect(dars1[0].docIdInput).toBe('SOP-QA-01');

      // Seed store with 9 existing QA SOPs up to 09
      const mockDocs = Array.from({ length: 9 }, (_, i) => ({
        id: `doc-sop-qa-${i + 1}`,
        title: `SOP-QA-${String(i + 1).padStart(2, '0')}`,
        department: 'QA'
      }));

      useStore.setState({ documents: mockDocs, dars: [] });

      // 10th document -> SOP-QA-10
      act(() => {
        useStore.getState().addDar({
          type: 'NEW',
          docType: 'SOP',
          department: 'QA',
          title: 'Tenth Procedure',
          requesterId: 'U001',
          requesterName: 'Admin QA (DCC)',
          isDraft: false
        });
      });

      const dars10 = useStore.getState().dars;
      expect(dars10[0].docIdInput).toBe('SOP-QA-10');

      // Seed store with 99 existing QA SOPs up to 99
      const mockDocs99 = Array.from({ length: 99 }, (_, i) => ({
        id: `doc-sop-qa-${i + 1}`,
        title: `SOP-QA-${i < 99 ? String(i + 1).padStart(2, '0') : String(i + 1)}`,
        department: 'QA'
      }));

      useStore.setState({ documents: mockDocs99, dars: [] });

      // 100th document -> SOP-QA-100
      act(() => {
        useStore.getState().addDar({
          type: 'NEW',
          docType: 'SOP',
          department: 'QA',
          title: 'Hundredth Procedure',
          requesterId: 'U001',
          requesterName: 'Admin QA (DCC)',
          isDraft: false
        });
      });

      const dars100 = useStore.getState().dars;
      expect(dars100[0].docIdInput).toBe('SOP-QA-100');
    });

    it('renders 2-digit preview in DarNewForm UI (e.g. FM-QA-01)', () => {
      renderWithRouter(<DarNewForm />);

      const selects = screen.getAllByRole('combobox');
      const docTypeSelect = selects[0];

      // Select FM
      fireEvent.change(docTypeSelect, { target: { value: 'FM' } });

      expect(screen.getByText('FM-QA-01')).toBeDefined();
    });
  });

  describe('3. External Document Code Auto-Generation (ExternalDocFormModal & useStore)', () => {
    it('generates ED-QA-01 for 1st external document and scales to ED-QA-100', () => {
      // 1st external document -> ED-QA-01
      act(() => {
        useStore.getState().registerExternalDoc({
          department: 'QA',
          title: 'Codex Standard',
          source: 'Codex',
          reviewerId: 'U005',
          approverId: 'U004'
        });
      });

      const extDocs1 = useStore.getState().externalDocuments;
      expect(extDocs1[0].edCode).toBe('ED-QA-01');

      // Seed 99 external documents in QA
      const mockExt99 = Array.from({ length: 99 }, (_, i) => ({
        id: `ext-qa-${i + 1}`,
        edCode: `ED-QA-${i < 99 ? String(i + 1).padStart(2, '0') : String(i + 1)}`,
        department: 'QA',
        status: 'ACTIVE'
      }));

      useStore.setState({ externalDocuments: mockExt99 });

      // 100th external document -> ED-QA-100
      act(() => {
        useStore.getState().registerExternalDoc({
          department: 'QA',
          title: 'Century External Regulation',
          source: 'ISO',
          reviewerId: 'U005',
          approverId: 'U004'
        });
      });

      const extDocs100 = useStore.getState().externalDocuments;
      const doc100 = extDocs100.find(d => d.title === 'Century External Regulation');
      expect(doc100.edCode).toBe('ED-QA-100');
    });

    it('renders 2-digit preview badge in ExternalDocFormModal UI (e.g. ED-QA-01)', () => {
      renderWithRouter(
        <ExternalDocFormModal isOpen={true} onClose={() => {}} />
      );

      expect(screen.getByText('ED-QA-01')).toBeDefined();
    });
  });
});
