import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import useStore from '../store/useStore';
import ExternalDocsList from '../pages/ExternalDocs/ExternalDocsList';
import DarNewForm from '../pages/DarWorkflow/DarNewForm';
import MasterDataHub from '../pages/Admin/MasterDataHub';
import UniversalWatermarkService, { WATERMARK_TYPES } from '../services/UniversalWatermarkService';
import { formatDocumentRunningNumber, generateDocumentCode } from '../services/MasterDataService';

const renderWithRouter = (ui) => {
  return render(
    <MemoryRouter>
      {ui}
    </MemoryRouter>
  );
};

describe('External Documents Management Module (ED-Control) Tests', () => {
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
      externalDocuments: [],
      tasks: [],
      notifications: []
    });
  });

  describe('1. Master Data & Auto Code Generation (2-Digit Base 01-99 ➔ 100+)', () => {
    it('has ED type in MASTER_DOCUMENT_TYPES with category: EXTERNAL and allowDar: false', () => {
      const docTypes = useStore.getState().documentTypes;
      const edType = docTypes.find(t => t.code === 'ED' || t.id === 'ED');
      expect(edType).toBeDefined();
      expect(edType.namingPattern).toMatch(/ED-{Dept}-{(##|###)}/);
      expect(edType.reviewCycleMonths).toBe(12);
      expect(edType.category).toBe('EXTERNAL');
      expect(edType.allowDar).toBe(false);

      // Verify internal types
      const internalTypes = docTypes.filter(t => t.code !== 'ED');
      expect(internalTypes.every(t => t.category === 'INTERNAL')).toBe(true);
      expect(internalTypes.every(t => t.allowDar === true)).toBe(true);
    });

    it('isolates ED from DarNewForm dropdown (DarNewForm shows ONLY internal types)', () => {
      renderWithRouter(<DarNewForm />);

      const selects = screen.getAllByRole('combobox');
      const docTypeSelect = selects[0];
      const codes = Array.from(docTypeSelect.querySelectorAll('option')).map(o => o.value).filter(Boolean);

      // All 6 internal types present, zero ED in DAR New Form
      expect(codes).toEqual(expect.arrayContaining(['QM', 'SOP', 'WI', 'FM', 'SD', 'SPEC']));
      expect(codes).not.toContain('ED');
    });

    it('auto-generates sequential ED code with 2-digit base (01-99 ➔ 100+) per department upon registration', () => {
      // Register first QA external document -> ED-QA-01
      act(() => {
        useStore.getState().registerExternalDoc({
          department: 'QA',
          title: 'ISO 9001:2015 Standard',
          source: 'ISO',
          sourceVersion: 'Edition 5',
          effectiveDate: '2026-01-01',
          reviewCycleMonths: 12,
          reviewerId: 'U005',
          approverId: 'U004',
          accessScope: 'General'
        });
      });

      const docsAfterFirst = useStore.getState().externalDocuments;
      expect(docsAfterFirst).toHaveLength(1);
      expect(docsAfterFirst[0].edCode).toBe('ED-QA-01');
      expect(docsAfterFirst[0].rev).toBe('00'); // internal sequence starts at 00 (edition text lives in sourceVersion)
      expect(docsAfterFirst[0].status).toBe('PENDING_EXT_REVIEW');

      // Register second QA external document -> ED-QA-02
      act(() => {
        useStore.getState().registerExternalDoc({
          department: 'QA',
          title: 'FSSC 22000 Version 6.0',
          source: 'FSSC',
          sourceVersion: 'V6',
          effectiveDate: '2026-02-01',
          reviewCycleMonths: 12,
          reviewerId: 'U005',
          approverId: 'U004',
          accessScope: 'General'
        });
      });

      const docsAfterSecond = useStore.getState().externalDocuments;
      expect(docsAfterSecond).toHaveLength(2);
      expect(docsAfterSecond[0].edCode).toBe('ED-QA-02');

      // Register PD external document -> ED-PD-01
      act(() => {
        useStore.getState().registerExternalDoc({
          department: 'PD',
          title: 'Tetra Pak Machine Manual',
          source: 'Tetra Pak',
          sourceVersion: 'Rev 4',
          effectiveDate: '2026-03-01',
          reviewCycleMonths: 24,
          reviewerId: 'U002',
          approverId: 'U004',
          accessScope: 'Department',
          accessDepartments: ['PD', 'EN']
        });
      });

      const docsAfterPd = useStore.getState().externalDocuments;
      expect(docsAfterPd).toHaveLength(3);
      expect(docsAfterPd[0].edCode).toBe('ED-PD-01');
      expect(docsAfterPd[0].reviewCycleMonths).toBe(24);
    });

    it('correctly expands to 3 digits when running index reaches 100+', () => {
      expect(formatDocumentRunningNumber(1)).toBe('01');
      expect(formatDocumentRunningNumber(9)).toBe('09');
      expect(formatDocumentRunningNumber(10)).toBe('10');
      expect(formatDocumentRunningNumber(99)).toBe('99');
      expect(formatDocumentRunningNumber(100)).toBe('100');
      expect(formatDocumentRunningNumber(101)).toBe('101');
      expect(formatDocumentRunningNumber(250)).toBe('250');

      expect(generateDocumentCode('SOP-{Dept}-{##}', 'SOP', 'PD', 1)).toBe('SOP-PD-01');
      expect(generateDocumentCode('SOP-{Dept}-{##}', 'SOP', 'PD', 99)).toBe('SOP-PD-99');
      expect(generateDocumentCode('SOP-{Dept}-{##}', 'SOP', 'PD', 100)).toBe('SOP-PD-100');
      expect(generateDocumentCode('SOP-{Dept}-{###}', 'SOP', 'PD', 1)).toBe('SOP-PD-01');
      expect(generateDocumentCode('SOP-{Dept}-{###}', 'SOP', 'PD', 105)).toBe('SOP-PD-105');
    });
  });

  describe('2. Master Data Hub Tab 3: Scope & DAR Badges', () => {
    it('renders [📑 ภายใน (DAR)] and [🌐 ภายนอก (External)] badges in Document Types table', () => {
      renderWithRouter(<MasterDataHub />);

      // Switch to Document Types tab
      const typeTabButton = screen.getByRole('button', { name: /ประเภทเอกสาร/i });
      act(() => {
        fireEvent.click(typeTabButton);
      });

      // Check badges in table
      const internalBadges = screen.getAllByText(/📑 ภายใน \(DAR\)/i);
      expect(internalBadges.length).toBeGreaterThanOrEqual(6);

      const externalBadges = screen.getAllByText(/🌐 ภายนอก \(External\)/i);
      expect(externalBadges.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('3. Periodic Validity Review & Access Scope Control', () => {
    it('calculates nextReviewDate accurately from effectiveDate and reviewCycleMonths', () => {
      act(() => {
        useStore.getState().registerExternalDoc({
          department: 'EN',
          title: 'Boiler Safety Regulation 2026',
          source: 'Ministry of Industry',
          effectiveDate: '2026-05-10',
          reviewCycleMonths: 12,
          reviewerId: 'U006',
          approverId: 'U004',
          accessScope: 'General'
        });
      });

      const doc = useStore.getState().externalDocuments[0];
      expect(doc.nextReviewDate).toBe('2027-05-10');
    });

    it('filters documents correctly based on user role and accessScope', () => {
      // Seed store with 3 documents: General, Department (PD only), Restricted (U005 only)
      act(() => {
        useStore.setState({
          externalDocuments: [
            {
              id: 'EXT-GEN',
              edCode: 'ED-QA-01',
              title: 'General Document',
              department: 'QA',
              accessScope: 'General',
              status: 'ACTIVE',
              rev: '01'
            },
            {
              id: 'EXT-DEPT',
              edCode: 'ED-PD-01',
              title: 'PD Department Document',
              department: 'PD',
              accessScope: 'Department',
              accessDepartments: ['PD'],
              status: 'ACTIVE',
              rev: '01'
            },
            {
              id: 'EXT-RES',
              edCode: 'ED-EXEC-01',
              title: 'Restricted Confidential Policy',
              department: 'EXEC',
              accessScope: 'Restricted',
              accessUsers: ['U005'],
              status: 'ACTIVE',
              rev: '01'
            }
          ]
        });
      });

      // 1. DCC Admin (U001) sees ALL 3 documents
      useStore.setState({
        currentUser: { id: 'U001', role: 'DCC_ADMIN', isDcc: true, department: 'QA' }
      });
      const { rerender } = renderWithRouter(<ExternalDocsList />);
      expect(screen.getByText('ED-QA-01')).toBeDefined();
      expect(screen.getByText('ED-PD-01')).toBeDefined();
      expect(screen.getByText('ED-EXEC-01')).toBeDefined();

      // 2. Production User (U002, PD dept) sees General & PD only (NOT Restricted)
      act(() => {
        useStore.setState({
          currentUser: { id: 'U002', role: 'DEPT_ADMIN', isDcc: false, department: 'PD' }
        });
      });
      rerender(<MemoryRouter><ExternalDocsList /></MemoryRouter>);
      expect(screen.getByText('ED-PD-01')).toBeDefined();
      expect(screen.queryByText('ED-EXEC-01')).toBeNull();
      // Another dept's General doc lives in the General tab, not My Dept
      fireEvent.click(screen.getByRole('button', { name: /เอกสารทั่วไป/ }));
      expect(screen.getByText('ED-QA-01')).toBeDefined();
      expect(screen.queryByText('ED-EXEC-01')).toBeNull();
    });
  });

  describe('4. Lifecycle: Revision & Obsolete Workflow', () => {
    it('creates Rev.02 and links previousDocId when updateExternalDoc is invoked', () => {
      act(() => {
        useStore.setState({
          currentUser: { id: 'U005', name: 'บีม', department: 'QA', role: 'DEPT_ADMIN' },
          externalDocuments: [
            {
              id: 'EXT-ORIGINAL',
              edCode: 'ED-QA-01',
              title: 'GHPs & HACCP Guidelines',
              source: 'Codex',
              sourceVersion: 'Rev 2020',
              rev: '01',
              status: 'ACTIVE',
              department: 'QA',
              reviewerId: 'U005',
              approverId: 'U004'
            }
          ]
        });
      });

      act(() => {
        useStore.getState().updateExternalDoc('EXT-ORIGINAL', {
          sourceVersion: 'Rev 2026 Updated',
          reason: 'ปรับปรุงเกณฑ์การควบคุมสารก่อภูมิแพ้ใหม่'
        });
      });

      const docs = useStore.getState().externalDocuments;
      expect(docs).toHaveLength(2);

      const newRev = docs[0];
      expect(newRev.edCode).toBe('ED-QA-01');
      expect(newRev.rev).toBe('02');
      expect(newRev.status).toBe('PENDING_EXT_REVIEW');
      expect(newRev.previousDocId).toBe('EXT-ORIGINAL');

      // Check Task created for Reviewer U005
      const tasks = useStore.getState().tasks;
      expect(tasks.some(t => t.referenceId === newRev.id && /^EXT(ERNAL)?_REVIEW$/.test(t.type))).toBe(true);

      // Approve task through processExternalTask
      const reviewTask = tasks.find(t => t.referenceId === newRev.id && /^EXT(ERNAL)?_REVIEW$/.test(t.type));
      act(() => {
        useStore.getState().processExternalTask(reviewTask.id, 'APPROVE', 'ตรวจสอบผ่านแล้ว');
      });

      // Now pending approval
      const appTask = useStore.getState().tasks.find(t => t.referenceId === newRev.id && /^EXT(ERNAL)?_APPROVAL$/.test(t.type));
      expect(appTask).toBeDefined();

      // Final approve by Approver U004
      act(() => {
        useStore.getState().processExternalTask(appTask.id, 'APPROVE', 'อนุมัติบังคับใช้');
      });

      const finalDocs = useStore.getState().externalDocuments;
      const activeRev2 = finalDocs.find(d => d.rev === '02');
      const oldRev1 = finalDocs.find(d => d.rev === '01');

      expect(activeRev2.status).toBe('ACTIVE');
      expect(oldRev1.status).toBe('SUPERSEDED');
    });

    it('sets document to OBSOLETE when obsoleteExternalDoc is approved', () => {
      act(() => {
        useStore.setState({
          currentUser: { id: 'U002', name: 'ธนาวุฒิ', department: 'PD', role: 'DEPT_ADMIN' },
          externalDocuments: [
            {
              id: 'EXT-OBS-TEST',
              edCode: 'ED-PD-05',
              title: 'Old Packaging Standard',
              rev: '01',
              status: 'ACTIVE',
              department: 'PD'
            }
          ]
        });
      });

      act(() => {
        useStore.getState().obsoleteExternalDoc('EXT-OBS-TEST', {
          reason: 'ยกเลิกการผลิตรุ่นเก่า',
          reviewerId: 'U002',
          approverId: 'U004'
        });
      });

      // Stays officially ACTIVE until the obsolete request is approved
      const doc = useStore.getState().externalDocuments.find(d => d.id === 'EXT-OBS-TEST');
      expect(doc.status).toBe('ACTIVE');
      expect(doc.pendingObsolete).toBe(true);

      const reviewTask = useStore.getState().tasks.find(t => t.referenceId === 'EXT-OBS-TEST' && /^EXT(ERNAL)?_REVIEW$/.test(t.type));
      act(() => {
        useStore.getState().processExternalTask(reviewTask.id, 'APPROVE', 'เห็นชอบให้ยกเลิก');
      });

      const appTask = useStore.getState().tasks.find(t => t.referenceId === 'EXT-OBS-TEST' && /^EXT(ERNAL)?_APPROVAL$/.test(t.type));
      act(() => {
        useStore.getState().processExternalTask(appTask.id, 'APPROVE', 'อนุมัติการยกเลิก');
      });

      const finalDoc = useStore.getState().externalDocuments.find(d => d.id === 'EXT-OBS-TEST');
      expect(finalDoc.status).toBe('OBSOLETE_ARCHIVED');
    });
  });

  describe('5. Universal Watermark Engine Integration', () => {
    it('triggers UniversalWatermarkService with correct watermark preset for active vs obsolete docs', async () => {
      const spyWatermark = vi.spyOn(UniversalWatermarkService, 'downloadWatermarkedPdf').mockResolvedValue(true);

      const activeDoc = {
        id: 'EXT-W1',
        edCode: 'ED-QA-01',
        title: 'Active Standard',
        rev: '01',
        department: 'QA',
        status: 'ACTIVE',
        accessScope: 'General'
      };

      const obsoleteDoc = {
        id: 'EXT-W2',
        edCode: 'ED-QA-02',
        title: 'Obsolete Standard',
        rev: '01',
        department: 'QA',
        status: 'OBSOLETE',
        accessScope: 'General'
      };

      act(() => {
        useStore.setState({
          externalDocuments: [activeDoc, obsoleteDoc]
        });
      });

      renderWithRouter(<ExternalDocsList />);

      const downloadButtons = screen.getAllByTitle('ดาวน์โหลด PDF พร้อมลายน้ำ (Watermarked PDF)');
      expect(downloadButtons).toHaveLength(1); // Active tab shows only the active doc
      
      // Download active doc
      await act(async () => {
        fireEvent.click(downloadButtons[0]);
      });
      expect(spyWatermark).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'ED-QA-01' }),
        WATERMARK_TYPES.UNCONTROLLED_COPY,
        expect.anything(),
        false
      );

      // Obsolete tab lists the retired doc but offers no row download (prevents unintended use, ISO 7.5.3)
      fireEvent.click(screen.getByRole('button', { name: /ยกเลิกถาวร/ }));
      expect(screen.getByText('ED-QA-02')).toBeInTheDocument();
      expect(screen.queryByTitle('ดาวน์โหลด PDF พร้อมลายน้ำ (Watermarked PDF)')).not.toBeInTheDocument();
      expect(spyWatermark).toHaveBeenCalledTimes(1);

      spyWatermark.mockRestore();
    });
  });

  describe('6. Hybrid Digital-Physical External Document (ED) Controlled Lifecycle', () => {
    it('creates controlled copies in PENDING_ISSUE and DCC distribution task when ED with physical copies is approved', () => {
      act(() => {
        useStore.getState().registerExternalDoc({
          department: 'QA',
          title: 'Codex Alimentarius Standard',
          source: 'FAO/WHO',
          sourceVersion: 'CXS 1-1985',
          effectiveDate: '2026-01-01',
          reviewerId: 'U005',
          approverId: 'U004',
          accessScope: 'General',
          isPhysicalCopy: true,
          distributions: [
            { departmentId: 'QA', locationId: 'QA-LOC-1', locationName: 'QC Chemistry Lab' },
            { departmentId: 'PD', locationId: 'PD-LOC-1', locationName: 'PD - ขนม 1' }
          ]
        });
      });

      const registeredDoc = useStore.getState().externalDocuments[0];
      expect(registeredDoc.is_physical_copy).toBe(true);
      expect(registeredDoc.distributions).toHaveLength(2);

      // Reviewer approves
      const reviewTask = useStore.getState().tasks.find(t => t.referenceId === registeredDoc.id && /^EXT(ERNAL)?_REVIEW$/.test(t.type));
      act(() => {
        useStore.getState().processExternalTask(reviewTask.id, 'APPROVE', 'Review passed');
      });

      // Approver approves -> Doc becomes ACTIVE
      const appTask = useStore.getState().tasks.find(t => t.referenceId === registeredDoc.id && /^EXT(ERNAL)?_APPROVAL$/.test(t.type));
      act(() => {
        useStore.getState().processExternalTask(appTask.id, 'APPROVE', 'Approval granted');
      });

      const activeDoc = useStore.getState().externalDocuments.find(d => d.id === registeredDoc.id);
      expect(activeDoc.status).toBe('ACTIVE');

      // Verify controlled copy instances created
      const copies = useStore.getState().documentControlledCopies;
      const docCopies = copies.filter(c => c.doc_code === registeredDoc.edCode || c.external_doc_id === registeredDoc.id);
      expect(docCopies).toHaveLength(2);
      expect(docCopies[0].copy_no).toBe('01');
      expect(docCopies[0].ccNumber).toBe('CC-001');
      expect(docCopies[0].locationName).toBe('QC Chemistry Lab');
      expect(docCopies[0].status).toBe('PENDING_ISSUE');
      expect(docCopies[0].is_external).toBe(true);

      expect(docCopies[1].copy_no).toBe('02');
      expect(docCopies[1].ccNumber).toBe('CC-002');
      expect(docCopies[1].locationName).toBe('PD - ขนม 1');

      // Verify DCC Distribution Task created
      const dccTask = useStore.getState().tasks.find(t => t.taskType === 'DCC_ISSUE_CONTROLLED_COPIES' && t.externalDocId === registeredDoc.id);
      expect(dccTask).toBeDefined();
      expect(dccTask.title).toContain(registeredDoc.edCode);
    });

    it('triggers automatic recall of previous physical copies when revised ED is approved', () => {
      // Setup active V1 document with an active physical copy
      const v1Doc = {
        id: 'EXT-V1-TEST',
        edCode: 'ED-QA-05',
        title: 'Halal Assurance System Standard',
        rev: '01',
        department: 'QA',
        status: 'ACTIVE',
        accessScope: 'General',
        distributions: [{ departmentId: 'QA', locationId: 'QA-LOC-1', locationName: 'QC Lab' }]
      };

      const v1ActiveCopy = {
        id: 'cc-ext-EXT-V1-TEST-01',
        doc_id: 'EXT-V1-TEST',
        external_doc_id: 'EXT-V1-TEST',
        doc_code: 'ED-QA-05',
        docTitle: 'Halal Assurance System Standard',
        doc_version: '01',
        copy_no: '01',
        ccNumber: 'CC-001',
        holder_dept: 'QA',
        location: 'QC Lab',
        locationName: 'QC Lab',
        status: 'ISSUED_ACTIVE',
        is_external: true
      };

      act(() => {
        useStore.setState({
          externalDocuments: [v1Doc],
          documentControlledCopies: [v1ActiveCopy],
          controlledCopyInstances: [v1ActiveCopy]
        });
      });

      // Submit Revision V2
      act(() => {
        useStore.getState().updateExternalDoc('EXT-V1-TEST', {
          title: 'Halal Assurance System Standard (Updated 2026)',
          sourceVersion: 'Rev 2',
          reviewerId: 'U005',
          approverId: 'U004',
          isPhysicalCopy: true,
          distributions: [{ departmentId: 'QA', locationId: 'QA-LOC-1', locationName: 'QC Lab' }]
        });
      });

      const v2Doc = useStore.getState().externalDocuments.find(d => d.previousDocId === 'EXT-V1-TEST');
      expect(v2Doc).toBeDefined();
      expect(v2Doc.rev).toBe('02');

      // Review & Approve V2
      const revTask = useStore.getState().tasks.find(t => t.referenceId === v2Doc.id && /^EXT(ERNAL)?_REVIEW$/.test(t.type));
      act(() => {
        useStore.getState().processExternalTask(revTask.id, 'APPROVE', 'Review passed');
      });

      const appTask = useStore.getState().tasks.find(t => t.referenceId === v2Doc.id && /^EXT(ERNAL)?_APPROVAL$/.test(t.type));
      act(() => {
        useStore.getState().processExternalTask(appTask.id, 'APPROVE', 'Approve V2');
      });

      // Previous copy should transition to PENDING_RECALL
      const copiesAfterRev = useStore.getState().documentControlledCopies;
      const oldCopy = copiesAfterRev.find(c => c.id === 'cc-ext-EXT-V1-TEST-01');
      expect(oldCopy.status).toBe('PENDING_RECALL');

      // New V2 copy should be created in PENDING_ISSUE
      const newV2Copy = copiesAfterRev.find(c => c.external_doc_id === v2Doc.id);
      expect(newV2Copy).toBeDefined();
      expect(newV2Copy.status).toBe('PENDING_ISSUE');
      expect(newV2Copy.doc_version).toBe('02');

      // Recall checklist task generated for DCC
      const recallTask = useStore.getState().tasks.find(t => t.taskType === 'DCC_RECALL_WITH_CHECKLIST' && t.docCode === 'ED-QA-05'); // task points at the immutable SUPERSEDED snapshot id
      expect(recallTask).toBeDefined();
      expect(recallTask.title).toContain('ED-QA-05');
    });

    it('supports ad-hoc physical controlled copy requests on active external documents', () => {
      const activeEd = {
        id: 'EXT-ADHOC-TEST',
        edCode: 'ED-EN-01',
        title: 'Compressor Maintenance Manual',
        rev: '01',
        department: 'EN',
        status: 'ACTIVE',
        distributions: []
      };

      act(() => {
        useStore.setState({
          externalDocuments: [activeEd],
          documentControlledCopies: [],
          controlledCopyInstances: []
        });
      });

      // Request ad-hoc copy for EN Workshop
      act(() => {
        useStore.getState().requestAdditionalControlledCopies('EXT-ADHOC-TEST', [
          { departmentId: 'EN', locationId: 'EN-LOC-1', locationName: 'EN Workshop Main' }
        ], 'Need hardcopy for maintenance technicians');
      });

      const copies = useStore.getState().documentControlledCopies;
      expect(copies).toHaveLength(1);
      expect(copies[0].doc_code).toBe('ED-EN-01');
      expect(copies[0].is_external).toBe(true);
      expect(copies[0].locationName).toBe('EN Workshop Main');
      expect(copies[0].status).toBe('PENDING_ISSUE');

      const dccTask = useStore.getState().tasks.find(t => t.taskType === 'DCC_ISSUE_CONTROLLED_COPIES' && t.externalDocId === 'EXT-ADHOC-TEST');
      expect(dccTask).toBeDefined();
    });

    it('renders Physical Copy button in ExternalDocsList for active documents', () => {
      const activeDoc = {
        id: 'EXT-LIST-1',
        edCode: 'ED-QA-01',
        title: 'Active Standard For Copy Request',
        rev: '01',
        department: 'QA',
        status: 'ACTIVE',
        accessScope: 'General'
      };

      act(() => {
        useStore.setState({
          externalDocuments: [activeDoc]
        });
      });

      renderWithRouter(<ExternalDocsList />);

      fireEvent.click(screen.getByTitle('เมนูการจัดการเพิ่มเติม (Row-Level Actions)'));
      const copyBtn = screen.getByTitle('ขอสำเนาควบคุมหน้างาน (Request Physical Copy)');
      expect(copyBtn).toBeDefined();

      // Click button opens RequestAdditionalCopiesModal
      fireEvent.click(copyBtn);
      expect(screen.getByText(/ขอสำเนาควบคุมเพิ่มเติม/)).toBeDefined();
    });
  });
});
