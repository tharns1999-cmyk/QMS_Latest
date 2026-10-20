import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import useStore from '../../../store/useStore';
import DarNewForm from '../pages/DarWorkflow/DarNewForm';
import ExternalDocFormModal from '../pages/ExternalDocs/ExternalDocFormModal';
import { 
  calculateNextDocumentSequence, 
  calculateNextExternalDocSequence, 
  generateDocumentCode,
  formatDocumentRunningNumber,
  checkDocumentCodeCollision
} from '../services/numberingService';

const renderWithRouter = (ui) => {
  return render(
    <MemoryRouter>
      {ui}
    </MemoryRouter>
  );
};

describe('Monotonic Non-Recycling Document Code Sequence Engine (ISO 9001 DCC Compliance)', () => {
  beforeEach(() => {
    useStore.getState().resetStore();
    useStore.setState({
      currentUser: {
        id: 'U001',
        name: 'Admin QA (DCC)',
        department: 'QA',
        depts: ['QA', 'QC', 'PD'],
        isDcc: true,
        role: 'DCC_ADMIN',
        level: 1
      },
      documents: [],
      masterDocuments: [],
      dars: [],
      darRequests: [],
      externalDocuments: [],
      externalRequests: [],
      tasks: [],
      notifications: []
    });
  });

  describe('1. Scenario 1 (External Documents): ED-QC-01 is OBSOLETE -> Must Generate ED-QC-02', () => {
    it('pure function calculateNextExternalDocSequence scans OBSOLETE document and returns sequence 2', () => {
      const externalDocs = [
        {
          id: 'EXT-QC-01',
          edCode: 'ED-QC-01',
          doc_code: 'ED-QC-01',
          title: 'คู่มือการตรวจสอบคุณภาพวัตถุดิบเดิม',
          department: 'QC',
          status: 'OBSOLETE'
        }
      ];

      const nextSeq = calculateNextExternalDocSequence('QC', externalDocs);
      expect(nextSeq).toBe(2);
      expect(formatDocumentRunningNumber(nextSeq)).toBe('02');
      expect(generateDocumentCode('ED-{Dept}-{##}', 'ED', 'QC', nextSeq)).toBe('ED-QC-02');
    });

    it('ExternalDocFormModal displays ED-QC-02 when ED-QC-01 is OBSOLETE in store', () => {
      useStore.setState({
        currentUser: {
          id: 'U-QC-01',
          name: 'QC Specialist',
          department: 'QC',
          depts: ['QC'],
          role: 'USER'
        },
        externalDocuments: [
          {
            id: 'EXT-QC-01',
            edCode: 'ED-QC-01',
            title: 'QC Manual Old',
            department: 'QC',
            status: 'OBSOLETE'
          }
        ]
      });

      renderWithRouter(
        <ExternalDocFormModal isOpen={true} onClose={() => {}} />
      );

      // Must display ED-QC-02 and NEVER recycle ED-QC-01
      expect(screen.getByText('ED-QC-02')).toBeDefined();
      expect(screen.queryByText('ED-QC-01')).toBeNull();
    });

    it('registerExternalDoc in useStore persists ED-QC-02 monotonically', () => {
      useStore.setState({
        externalDocuments: [
          {
            id: 'EXT-QC-01',
            edCode: 'ED-QC-01',
            title: 'QC Manual Old',
            department: 'QC',
            status: 'OBSOLETE'
          }
        ]
      });

      act(() => {
        useStore.getState().registerExternalDoc({
          department: 'QC',
          title: 'มาตรฐานข้อกำหนดคุณภาพผลิตภัณฑ์ฉบับใหม่ 2026',
          source: 'ISO',
          reviewerId: 'U005',
          approverId: 'U004'
        });
      });

      const requests = useStore.getState().externalRequests;
      const createdRequest = requests[0];
      expect(createdRequest.edCode).toBe('ED-QC-02');
      expect(createdRequest.doc_code).toBe('ED-QC-02');
    });
  });

  describe('2. Scenario 2 (Internal Documents): SOP-PD-01 (Active) & SOP-PD-02 (Obsolete) -> Must Generate SOP-PD-03', () => {
    it('pure function calculateNextDocumentSequence scans Active & Obsolete documents and returns sequence 3', () => {
      const historicalDocs = [
        {
          id: 'DOC-PD-01',
          docCode: 'SOP-PD-01',
          title: 'ขั้นตอนการผสมวัตถุดิบ (Active)',
          department: 'PD',
          status: 'EFFECTIVE'
        },
        {
          id: 'DOC-PD-02',
          docCode: 'SOP-PD-02',
          title: 'ขั้นตอนการล้างเตาอบ (Obsolete)',
          department: 'PD',
          status: 'OBSOLETE'
        }
      ];

      const nextSeq = calculateNextDocumentSequence('SOP', 'PD', historicalDocs);
      expect(nextSeq).toBe(3);
      expect(formatDocumentRunningNumber(nextSeq)).toBe('03');
      expect(generateDocumentCode('SOP-{Dept}-{##}', 'SOP', 'PD', nextSeq)).toBe('SOP-PD-03');
    });

    it('DarNewForm preview renders SOP-PD-03 when SOP-PD-01 is Active and SOP-PD-02 is Obsolete', () => {
      useStore.setState({
        currentUser: {
          id: 'U-PD-01',
          name: 'Production Leader',
          department: 'PD',
          role: 'USER'
        },
        documents: [
          {
            id: 'DOC-PD-01',
            docCode: 'SOP-PD-01',
            title: 'SOP Line 1',
            department: 'PD',
            status: 'EFFECTIVE'
          },
          {
            id: 'DOC-PD-02',
            docCode: 'SOP-PD-02',
            title: 'SOP Line 2 Old',
            department: 'PD',
            status: 'OBSOLETE'
          }
        ],
        documentTypes: [
          { id: 'SOP', code: 'SOP', name: 'Standard Operating Procedure', namingPattern: 'SOP-{Dept}-{##}', status: 'ACTIVE', category: 'INTERNAL', allowDar: true }
        ]
      });

      renderWithRouter(<DarNewForm />);

      // Select SOP
      const docTypeSelect = screen.getAllByRole('combobox')[0];
      fireEvent.change(docTypeSelect, { target: { value: 'SOP' } });

      // Must display SOP-PD-03 and NEVER recycle 01 or 02
      expect(screen.getByText('SOP-PD-03')).toBeDefined();
    });

    it('addDar in useStore generates SOP-PD-03 when SOP-PD-01 & SOP-PD-02 exist', () => {
      useStore.setState({
        documents: [
          { id: 'DOC-PD-01', docCode: 'SOP-PD-01', department: 'PD', status: 'ACTIVE' },
          { id: 'DOC-PD-02', docCode: 'SOP-PD-02', department: 'PD', status: 'OBSOLETE' }
        ],
        documentTypes: [
          { id: 'SOP', code: 'SOP', namingPattern: 'SOP-{Dept}-{##}', status: 'ACTIVE', allowDar: true }
        ]
      });

      act(() => {
        useStore.getState().addDar({
          type: 'NEW',
          docType: 'SOP',
          department: 'PD',
          title: 'ขั้นตอนการแพ็คสินค้าอัตโนมัติ',
          requesterId: 'U001',
          requesterName: 'Admin QA (DCC)'
        });
      });

      const dars = useStore.getState().dars;
      expect(dars[0].docIdInput).toBe('SOP-PD-03');
    });
  });

  describe('3. In-Flight Requests Reservation (Race Condition Prevention)', () => {
    it('includes in-flight externalRequests when calculating next external document sequence', () => {
      const activeDocs = [
        { id: 'EXT-QA-01', edCode: 'ED-QA-01', department: 'QA', status: 'ACTIVE' }
      ];
      const inFlightRequests = [
        { id: 'EDR-001', edCode: 'ED-QA-02', department: 'QA', status: 'PENDING_EXT_REVIEW' }
      ];

      // Even though ED-QA-02 is only in externalRequests (not yet approved into externalDocuments),
      // the next sequence must reserve 03
      const nextSeq = calculateNextExternalDocSequence('QA', activeDocs, inFlightRequests);
      expect(nextSeq).toBe(3);
      expect(generateDocumentCode('ED-{Dept}-{##}', 'ED', 'QA', nextSeq)).toBe('ED-QA-03');
    });

    it('includes in-flight DAR requests and tasks when calculating next internal document sequence', () => {
      const activeDocs = [
        { id: 'DOC-1', docCode: 'FM-QA-01', department: 'QA', status: 'EFFECTIVE' }
      ];
      const inFlightDars = [
        { id: 'DAR-01', type: 'NEW', docType: 'FM', department: 'QA', docIdInput: 'FM-QA-02', status: 'PENDING_REVIEW' }
      ];
      const inFlightTasks = [
        { id: 'T-01', docCode: 'FM-QA-03', department: 'QA', status: 'PENDING' }
      ];

      const nextSeq = calculateNextDocumentSequence('FM', 'QA', activeDocs, inFlightDars, inFlightTasks);
      expect(nextSeq).toBe(4);
      expect(generateDocumentCode('FM-{Dept}-{##}', 'FM', 'QA', nextSeq)).toBe('FM-QA-04');
    });
  });

  describe('4. Omni-Status Collision Guard', () => {
    it('detects collision with existing active, obsolete, or in-flight document codes', () => {
      const pool = [
        { edCode: 'ED-QC-01', status: 'OBSOLETE' },
        { docCode: 'SOP-PD-02', status: 'SUPERSEDED' },
        { edCode: 'ED-QA-05', status: 'PENDING_EXT_REVIEW' }
      ];

      expect(checkDocumentCodeCollision('ED-QC-01', pool)).toBe(true);
      expect(checkDocumentCodeCollision('ed-qc-01', pool)).toBe(true);
      expect(checkDocumentCodeCollision('SOP-PD-02', pool)).toBe(true);
      expect(checkDocumentCodeCollision('ED-QA-05', pool)).toBe(true);
      expect(checkDocumentCodeCollision('ED-QC-02', pool)).toBe(false);
      expect(checkDocumentCodeCollision('SOP-PD-03', pool)).toBe(false);
    });

    it('registerExternalDoc re-routes to next monotonic sequence if manual payload collides with existing code', () => {
      useStore.setState({
        externalDocuments: [
          { id: 'EXT-QC-01', edCode: 'ED-QC-01', department: 'QC', status: 'OBSOLETE' }
        ]
      });

      // Intentionally supply collided edCode: ED-QC-01
      act(() => {
        useStore.getState().registerExternalDoc({
          department: 'QC',
          edCode: 'ED-QC-01',
          title: 'Manual Collided Code Attempt',
          reviewerId: 'U005'
        });
      });

      const requests = useStore.getState().externalRequests;
      // Must be safely auto-incremented to ED-QC-02
      expect(requests[0].edCode).toBe('ED-QC-02');
    });
  });

  describe('5. Reactive Department & Type Switching in UI', () => {
    it('reactively updates external doc preview code when department changes in ExternalDocFormModal', () => {
      useStore.setState({
        externalDocuments: [
          { id: 'EXT-QC-01', edCode: 'ED-QC-01', department: 'QC', status: 'OBSOLETE' },
          { id: 'EXT-QA-01', edCode: 'ED-QA-01', department: 'QA', status: 'ACTIVE' },
          { id: 'EXT-QA-02', edCode: 'ED-QA-02', department: 'QA', status: 'ACTIVE' }
        ],
        masterDepartments: [
          { id: 'QC', nameTh: 'แผนกควบคุมคุณภาพ', name: 'Quality Control' },
          { id: 'QA', nameTh: 'แผนกประกันคุณภาพ', name: 'Quality Assurance' }
        ]
      });

      renderWithRouter(
        <ExternalDocFormModal isOpen={true} onClose={() => {}} />
      );

      // Initially with QA: ED-QA-03 (01, 02 exist)
      expect(screen.getByText('ED-QA-03')).toBeDefined();

      // Change department select to QC (first combobox is department)
      const deptSelect = screen.getAllByRole('combobox')[0];
      fireEvent.change(deptSelect, { target: { value: 'QC' } });

      // After switching to QC: ED-QC-02 (01 was OBSOLETE)
      expect(screen.getByText('ED-QC-02')).toBeDefined();
    });
  });
});
