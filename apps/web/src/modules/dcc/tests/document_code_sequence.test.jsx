import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { 
  calculateNextDocumentSequence, 
  calculateNextExternalDocSequence, 
  generateDocumentCode,
  formatDocumentRunningNumber 
} from '../services/MasterDataService';
import DarNewForm from '../pages/DarWorkflow/DarNewForm';
import useStore from '../../../store/useStore';

describe('ISO 9001 Document Code Sequence Integrity & Obsolete ID Non-Recycling Tests', () => {
  
  describe('1. Pure Logic Tests (calculateNextDocumentSequence)', () => {
    it('returns sequence 1 when there are no existing documents or DARs', () => {
      const nextSeq = calculateNextDocumentSequence('SOP', 'PD', [], []);
      expect(nextSeq).toBe(1);
      expect(formatDocumentRunningNumber(nextSeq)).toBe('01');
      expect(generateDocumentCode('SOP-{Dept}-{##}', 'SOP', 'PD', nextSeq)).toBe('SOP-PD-01');
    });

    it('Scenario 1: With SOP-PD-01 to SOP-PD-50 and SOP-PD-47 OBSOLETE, generates SOP-PD-51 (Never recycles 47)', () => {
      // Simulate 50 historical documents with SOP-PD-47 being OBSOLETE
      const historicalDocs = Array.from({ length: 50 }, (_, i) => {
        const num = i + 1;
        const seqStr = formatDocumentRunningNumber(num);
        return {
          id: `DOC-PD-${seqStr}`,
          title: `SOP-PD-${seqStr}`,
          docCode: `SOP-PD-${seqStr}`,
          status: num === 47 ? 'OBSOLETE' : 'EFFECTIVE',
          department: 'PD'
        };
      });

      const nextSeq = calculateNextDocumentSequence('SOP', 'PD', historicalDocs, []);
      
      // Must be 51, NOT 47 (Recycling) and NOT 50 (Length count)
      expect(nextSeq).toBe(51);
      expect(formatDocumentRunningNumber(nextSeq)).toBe('51');
      expect(generateDocumentCode('SOP-{Dept}-{##}', 'SOP', 'PD', nextSeq)).toBe('SOP-PD-51');
    });

    it('Scenario 2: Scans across all statuses (EFFECTIVE, ACTIVE, OBSOLETE, SUPERSEDED, ARCHIVED)', () => {
      const mixedStatusDocs = [
        { id: '1', title: 'WI-EN-01', status: 'SUPERSEDED', department: 'EN' },
        { id: '2', title: 'WI-EN-02', status: 'OBSOLETE', department: 'EN' },
        { id: '3', title: 'WI-EN-03', status: 'EFFECTIVE', department: 'EN' },
        { id: '4', title: 'WI-EN-04', status: 'ARCHIVED', department: 'EN' },
        { id: '5', title: 'WI-EN-05', status: 'OBSOLETE', department: 'EN' }
      ];

      const nextSeq = calculateNextDocumentSequence('WI', 'EN', mixedStatusDocs, []);
      expect(nextSeq).toBe(6);
      expect(generateDocumentCode('WI-{Dept}-{##}', 'WI', 'EN', nextSeq)).toBe('WI-EN-06');
    });

    it('Scenario 3: Includes in-progress and draft DAR requests to prevent race condition duplicates', () => {
      const existingDocs = [
        { id: '1', title: 'FM-QA-01', status: 'EFFECTIVE', department: 'QA' },
        { id: '2', title: 'FM-QA-02', status: 'EFFECTIVE', department: 'QA' }
      ];

      const pendingDars = [
        { id: 'DAR-01', type: 'NEW', docType: 'FM', department: 'QA', docIdInput: 'FM-QA-03', status: 'PENDING_REVIEW' },
        { id: 'DAR-02', type: 'NEW', docType: 'FM', department: 'QA', docIdInput: 'FM-QA-04', status: 'DRAFT' }
      ];

      const nextSeq = calculateNextDocumentSequence('FM', 'QA', existingDocs, pendingDars);
      expect(nextSeq).toBe(5);
      expect(generateDocumentCode('FM-{Dept}-{##}', 'FM', 'QA', nextSeq)).toBe('FM-QA-05');
    });

    it('Scenario 4: Department and Document Type isolation (PD does not collide with QA; SOP does not collide with WI)', () => {
      const documents = [
        { id: '1', title: 'SOP-PD-01', department: 'PD' },
        { id: '2', title: 'SOP-PD-02', department: 'PD' },
        { id: '3', title: 'SOP-PD-99', department: 'PD' },
        { id: '4', title: 'WI-PD-01', department: 'PD' }
      ];

      // SOP in PD has max 99 => next is 100
      expect(calculateNextDocumentSequence('SOP', 'PD', documents, [])).toBe(100);
      expect(generateDocumentCode('SOP-{Dept}-{##}', 'SOP', 'PD', 100)).toBe('SOP-PD-100');

      // WI in PD has max 1 => next is 2
      expect(calculateNextDocumentSequence('WI', 'PD', documents, [])).toBe(2);
      expect(generateDocumentCode('WI-{Dept}-{##}', 'WI', 'PD', 2)).toBe('WI-PD-02');

      // SOP in QA has 0 docs => next is 1
      expect(calculateNextDocumentSequence('SOP', 'QA', documents, [])).toBe(1);
      expect(generateDocumentCode('SOP-{Dept}-{##}', 'SOP', 'QA', 1)).toBe('SOP-QA-01');
    });
  });

  describe('2. External Documents Sequence Integrity (calculateNextExternalDocSequence)', () => {
    it('calculates Max + 1 for External Documents and never recycles obsolete ED numbers', () => {
      const externalDocs = [
        { id: '1', edCode: 'ED-QA-01', status: 'ACTIVE', department: 'QA' },
        { id: '2', edCode: 'ED-QA-02', status: 'OBSOLETE', department: 'QA' },
        { id: '3', edCode: 'ED-QA-03', status: 'OBSOLETE', department: 'QA' }
      ];

      const nextSeq = calculateNextExternalDocSequence('QA', externalDocs);
      expect(nextSeq).toBe(4);
      expect(generateDocumentCode('ED-{Dept}-{##}', 'ED', 'QA', nextSeq)).toBe('ED-QA-04');
    });
  });

  describe('3. React Form & Store Integration', () => {
    beforeEach(() => {
      // Set up 50 documents with #47 OBSOLETE
      const docs50 = Array.from({ length: 50 }, (_, i) => {
        const num = i + 1;
        const seqStr = formatDocumentRunningNumber(num);
        return {
          id: `DOC-PD-${seqStr}`,
          title: `SOP-PD-${seqStr}`,
          docCode: `SOP-PD-${seqStr}`,
          status: num === 47 ? 'OBSOLETE' : 'EFFECTIVE',
          department: 'PD'
        };
      });

      useStore.setState({
        currentUser: { id: 'U002', name: 'ธนาวุฒิ', department: 'PD', role: 'DEPT_ADMIN', level: 4 },
        documents: docs50,
        dars: [],
        documentTypes: [
          { id: 'SOP', code: 'SOP', name: 'Standard Operating Procedure', namingPattern: 'SOP-{Dept}-{##}', status: 'ACTIVE', category: 'INTERNAL', allowDar: true }
        ]
      });
    });

    it('DarNewForm renders SOP-PD-51 preview when 50 documents exist with #47 OBSOLETE', () => {
      render(
        <BrowserRouter>
          <DarNewForm />
        </BrowserRouter>
      );

      // Select SOP
      const docTypeSelect = screen.getAllByRole('combobox')[0];
      expect(docTypeSelect).toBeInTheDocument();
      
      // Select SOP
      fireEvent.change(docTypeSelect, { target: { value: 'SOP' } });

      // Output should be SOP-PD-51
      expect(screen.getByText('SOP-PD-51')).toBeInTheDocument();
    });

    it('Store addDar generates SOP-PD-51 for new DAR when 50 documents exist with #47 OBSOLETE', () => {
      const state = useStore.getState();
      
      state.addDar({
        type: 'NEW',
        docType: 'SOP',
        department: 'PD',
        title: 'ขั้นตอนการทำงานระบบอัตโนมัติไลน์ 5',
        requesterId: 'U002'
      });

      const updatedDars = useStore.getState().dars;
      const createdDar = updatedDars[0];
      
      expect(createdDar.docIdInput).toBe('SOP-PD-51');
    });

    it('Preserves original document code on DAR Revision (Never assigns new running number)', () => {
      const state = useStore.getState();

      // Revision for existing document SOP-PD-47 (Even if Obsolete or revising)
      state.addDar({
        type: 'REVISE',
        docType: 'SOP',
        department: 'PD',
        targetDocId: 'DOC-PD-47',
        targetDocCode: 'SOP-PD-47',
        docIdInput: 'SOP-PD-47',
        title: 'แก้ไขขั้นตอนการทำงานเดิม',
        requesterId: 'U002'
      });

      const createdRevisionDar = useStore.getState().dars[0];
      // Code MUST stay SOP-PD-47
      expect(createdRevisionDar.docIdInput).toBe('SOP-PD-47');
    });
  });
});
