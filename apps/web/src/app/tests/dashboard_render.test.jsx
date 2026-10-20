import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import Dashboard from '../../modules/dcc/pages/Dashboard/Dashboard';
import ExternalDocDetailModal from '../../modules/dcc/pages/ExternalDocs/ExternalDocDetailModal';
import ExternalDocsList from '../../modules/dcc/pages/ExternalDocs/ExternalDocsList';
import PeriodicReviewDashboard from '../../modules/dcc/pages/PeriodicReviews/PeriodicReviewDashboard';
import PeriodicReviewDetail from '../../modules/dcc/pages/PeriodicReviews/PeriodicReviewDetail';
import { getDetailStatusLabel } from '../../modules/dcc/pages/PeriodicReviews/reviewDetailStatus';
import Sidebar from '../layout/Sidebar';
import useStore from '../../store/useStore';
import { normalizeDept, getDarStatusBadgeMeta } from '../../modules/dcc/utils/darHelper';
import { DarStatusBadge } from '../../modules/dcc/components/ui/StatusBadge';
import { hasDocumentAccess } from '../../modules/dcc/utils/accessControl';
import { extractDeptCode, standardizeDepartmentCode } from '../../modules/dcc/services/darService';
import { generateDynamicWorkflow } from '../../modules/dcc/utils/workflowEngine';
import { canPerformPeriodicReview } from '../../modules/dcc/services/PeriodicReviewAccessService';
import { normalizeCanonicalDept, isSameDepartment } from '../../modules/dcc/utils/taskFilter';
import { saveFile, resolveFileBlob } from '../../modules/dcc/utils/fileStorage';
import { getPeriodicReviewStatus, getDocumentReviewMetrics } from '../../modules/dcc/utils/documentUtils';

describe('Dashboard & Lean Refactor Verification', () => {
  it('uses the live due date and keeps workflow intent above date status', () => {
    const schedule = { status: 'OVERDUE', nextReviewDate: '2027-10-13' };
    expect(getDetailStatusLabel(schedule, {}, '', false, new Date('2026-10-14')).label).toBe('ยังไม่ถึงกำหนด');
    expect(getDetailStatusLabel(schedule, { review_status: 'AWAITING_ACTION' }, '', false, new Date('2026-10-14')).label).toBe('รอดำเนินการ (แก้ไข/ยกเลิก)');
    expect(getDetailStatusLabel(schedule, {}, 'REVISION_REQUIRED', false, new Date('2026-10-14')).label).toBe('ต้องแก้ไขเอกสาร');
  });
  it('renders Dashboard without ReferenceError (useMemo properly imported)', () => {
    useStore.setState({
      currentUser: { id: 'U001', name: 'Test User', role: 'DCC_ADMIN', isDcc: true },
      tasks: [],
      dars: [],
      documents: [],
      controlledCopyInstances: [],
      masterUsers: []
    });

    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    );

    expect(screen.getByText(/ภาพรวมระบบ/i) || screen.getByRole('heading', { level: 1 })).toBeTruthy();
  });

  it('removes 17 deprecated store aliases while preserving all canonical store actions', () => {
    const s = useStore.getState();
    const removedAliases = [
      'withdrawExternalDoc', 'reviseExternalDoc', 'createDar', 'submitDarRequest',
      'completeTask', 'advanceWorkflowStage', 'dispatchCopy', 'dispatchAllCopies',
      'finalApproveDar', 'approveTask', 'reportCopyDamaged', 'reportDamagedCopy',
      'requestCopyReplacement', 'reportCopyIssue', 'markCopyRecalled',
      'receiveRecallCopy', 'recordCopyDestroyed'
    ];
    for (const name of removedAliases) {
      expect(s[name]).toBeUndefined();
    }

    const canonicalActions = [
      'addDar', 'submitDar', 'processWorkflow', 'approveDar',
      'dispatchControlledCopy', 'dispatchControlledCopies',
      'reportCcDamagedLost', 'recordCopyRecalled', 'destroyControlledCopy'
    ];
    for (const name of canonicalActions) {
      expect(typeof s[name]).toBe('function');
    }
  });

  it('normalizes raw department codes identically via shared normalizeDept', () => {
    expect(normalizeDept({ id: ' pd ' })).toBe('PD');
    expect(normalizeDept({ department: ' qc ' })).toBe('QC');
    expect(normalizeDept('qa')).toBe('QC');
    expect(normalizeDept(null)).toBe('');
  });

  it('renders DarStatusBadge matching getDarStatusBadgeMeta className and label', () => {
    const meta = getDarStatusBadgeMeta('APPROVED');
    const { container } = render(<DarStatusBadge status="APPROVED" />);
    const span = container.querySelector('span');
    expect(span.textContent).toBe(meta.label);
    expect(span.className).toBe(meta.className);
  });
});

describe('QA/QC Canonical Normalization, RBAC & Document Prefix Extraction', () => {
  it('Criterion 1: grants DEPT_ONLY access for QA/QC/QA-QC users on WI-QC-01 and QC-WI-01 and extracts QC prefix/code', () => {
    expect(extractDeptCode('WI-QC-01')).toBe('QC');
    expect(extractDeptCode('QC-01-01')).toBe('QC');
    expect(extractDeptCode('QC-WI-02')).toBe('QC');

    const docMiddlePrefix = { id: 'doc-1', code: 'WI-QC-01', department: '', access_control: { scope: 'DEPT_ONLY' } };
    const docLeadingPrefix = { id: 'doc-2', code: 'QC-WI-01', department: '', access_control: { scope: 'DEPT_ONLY' } };

    for (const dept of ['QA', 'QC', 'QA/QC']) {
      const user = { id: `U-${dept}`, name: `Staff ${dept}`, department: dept, role: 'GENERAL_USER', level: 2 };
      expect(hasDocumentAccess(docMiddlePrefix, user)).toBe(true);
      expect(hasDocumentAccess(docLeadingPrefix, user)).toBe(true);
    }

    const pdUser = { id: 'U-PD', name: 'Staff PD', department: 'PD', role: 'GENERAL_USER', level: 2 };
    expect(hasDocumentAccess(docMiddlePrefix, pdUser)).toBe(false);
    expect(hasDocumentAccess(docLeadingPrefix, pdUser)).toBe(false);
  });

  it('Criterion 2: matches Level 5 QA / QA/QC Manager for QC document workflow and periodic review without falling back to QMR', () => {
    const requester = { id: 'U-REQ', name: 'QC Staff', department: 'QC', level: 2, status: 'ACTIVE' };
    const qaManager = { id: 'U-QA-MGR', name: 'QA Manager', department: 'QA', level: 5, role: 'MANAGER', status: 'ACTIVE' };
    const qmrUser = { id: 'U-QMR', name: 'QMR Exec', department: 'MGMT', level: 6, role: 'QMR', isQmr: true, status: 'ACTIVE' };
    const masterUsers = [requester, qaManager, qmrUser];

    const steps = generateDynamicWorkflow(requester, 'QC', masterUsers);
    expect(steps[1].role).toBe('REVIEWER');
    expect(steps[1].userId).toBe('U-QA-MGR');
    expect(steps[2].role).toBe('APPROVER');
    expect(steps[2].userId).toBe('U-QMR');

    const qaqcManager = { id: 'U-QAQC-MGR', name: 'QA/QC Manager', department: 'QA/QC', level: 5, role: 'MANAGER', status: 'ACTIVE' };
    // WI: approval-matrix approver level is L5
    const qcDoc = { id: 'DOC-QC-01', code: 'WI-QC-01', title: 'WI-QC-01', department: 'QC' };
    const reviewForQcDoc = { id: 'PRS-QC-01', documentId: 'DOC-QC-01', documentNumber: 'WI-QC-01', ownerDepartmentId: 'QC', status: 'ACTION_REQUIRED', documentCategory: 'INTERNAL' };

    expect(canPerformPeriodicReview(qaManager, reviewForQcDoc, qcDoc)).toBe(true);
    expect(canPerformPeriodicReview(qaqcManager, reviewForQcDoc, qcDoc)).toBe(true);

    useStore.setState({
      currentUser: qaManager,
      documents: [qcDoc],
      periodicReviewSchedules: [reviewForQcDoc],
      periodicReviewTasks: [],
      periodicReviewRecords: [],
      tasks: []
    });

    const res = useStore.getState().submitPeriodicReview({
      scheduleId: 'PRS-QC-01',
      docId: 'DOC-QC-01',
      docCode: 'WI-QC-01',
      outcome: 'NO_CHANGE',
      currentUser: qaManager,
      reviewDetails: { reason: 'Annual QA/QC check passed' }
    });

    expect(res?.fastTrack).toBe(true);
    expect(res?.status).toBe('COMPLETED');
    const updatedSchedule = useStore.getState().periodicReviewSchedules.find(s => s.id === 'PRS-QC-01');
    expect(updatedSchedule.status).toBe('UPCOMING');

    // Also verify 2-step approval routing when QC Staff submits -> assigns to Level 5 QA Manager
    const reviewForStaff = { id: 'PRS-QC-02', documentId: 'DOC-QC-01', documentNumber: 'WI-QC-01', ownerDepartmentId: 'QC', status: 'ACTION_REQUIRED', documentCategory: 'INTERNAL' };
    useStore.setState({
      currentUser: requester,
      users: masterUsers,
      masterUsers,
      documents: [qcDoc],
      periodicReviewSchedules: [reviewForStaff],
      periodicReviewTasks: [],
      tasks: []
    });

    useStore.getState().submitPeriodicReview({
      scheduleId: 'PRS-QC-02',
      docId: 'DOC-QC-01',
      docCode: 'WI-QC-01',
      outcome: 'NO_CHANGE',
      currentUser: requester,
      reviewDetails: { reason: 'Staff review' }
    });

    const approvalTask = useStore.getState().tasks.find(t => t.type === 'PERIODIC_REVIEW_APPROVAL');
    expect(approvalTask?.assignee_id).toBe('U-QA-MGR');
  });

  it('Criterion 3: normalizes QA, QA/QC, and QA Super to canonical QC and treats QA <-> QC as same department', () => {
    expect(standardizeDepartmentCode('QA')).toBe('QC');
    expect(standardizeDepartmentCode('QA/QC')).toBe('QC');
    expect(normalizeCanonicalDept('QA Super')).toBe('QC');
    expect(isSameDepartment('QA', 'QC')).toBe(true);
  });

  it('Criterion 4: isolates SUPERSEDED edition files from Active Edition in resolveFileBlob and External Doc update lifecycle', async () => {
    const blobV1 = new Blob(['PDF CONTENT EDITION 1'], { type: 'application/pdf' });
    const blobV2 = new Blob(['PDF CONTENT EDITION 2'], { type: 'application/pdf' });

    await saveFile('FILE_ED-QC-01_ED_1.0', blobV1);
    await saveFile('FILE_ED-QC-01_ED_2.0', blobV2);
    await saveFile('ED-QC-01', blobV2);

    const file1 = await resolveFileBlob({ doc_code: 'ED-QC-01', edition: '1.0' });
    const file2 = await resolveFileBlob({ doc_code: 'ED-QC-01', edition: '2.0' });

    expect(await file1.text()).toBe('PDF CONTENT EDITION 1');
    expect(await file2.text()).toBe('PDF CONTENT EDITION 2');

    // End-to-end store test: Register Edition 1.0, then revise to Edition 2.0 and approve
    const fileIdV1 = 'file_test_ed1_pdf';
    const fileIdV2 = 'file_test_ed2_pdf';
    await saveFile(fileIdV1, blobV1);
    await saveFile(fileIdV2, blobV2);

    useStore.setState({
      currentUser: { id: 'U-DCC', name: 'DCC Admin', department: 'QC', role: 'DCC_ADMIN', isDcc: true },
      externalDocuments: [],
      externalRequests: [],
      tasks: [],
      notifications: []
    });

    useStore.getState().registerExternalDoc({
      id: 'ED-QC-77',
      edCode: 'ED-QC-77',
      title: 'ISO 9001 Standard',
      department: 'QC',
      edition: '1.0',
      sourceVersion: '1.0',
      fileId: fileIdV1,
      rawFileId: fileIdV1,
      attachedFile: { fileId: fileIdV1, rawFileId: fileIdV1, name: 'iso_v1.pdf' }
    });

    // Wait a tick for async saveFile promises in registerExternalDoc
    await new Promise(r => setTimeout(r, 20));

    // Revise to Edition 2.0 with a new file
    useStore.getState().updateExternalDoc('ED-QC-77', {
      edCode: 'ED-QC-77',
      title: 'ISO 9001 Standard',
      department: 'QC',
      edition: '2.0',
      sourceVersion: '2.0',
      approverId: 'U-QMR',
      fileId: fileIdV2,
      rawFileId: fileIdV2,
      attachedFile: { fileId: fileIdV2, rawFileId: fileIdV2, name: 'iso_v2.pdf' },
      reason: 'Updated to 2.0'
    });

    await new Promise(r => setTimeout(r, 20));

    const approvalTask = useStore.getState().tasks.find(t => t.docCode === 'ED-QC-77');
    expect(approvalTask).toBeTruthy();

    useStore.getState().processExternalTask(approvalTask.id, 'APPROVE', 'Approved Edition 2.0');
    await new Promise(r => setTimeout(r, 20));

    const extDocs = useStore.getState().externalDocuments.filter(d => (d.edCode || d.doc_code) === 'ED-QC-77');
    const supersededEd1 = extDocs.find(d => d.status === 'SUPERSEDED' || d.is_superseded);
    const activeEd2 = extDocs.find(d => d.status === 'ACTIVE' && !d.is_superseded);

    expect(supersededEd1).toBeTruthy();
    expect(activeEd2).toBeTruthy();
    expect(supersededEd1.edition).toBe('1.0');
    expect(activeEd2.edition).toBe('2.0');

    const resolvedSupersededBlob = await resolveFileBlob(supersededEd1, supersededEd1.id);
    const resolvedActiveBlob = await resolveFileBlob(activeEd2, activeEd2.id);

    expect(await resolvedSupersededBlob.text()).toBe('PDF CONTENT EDITION 1');
    expect(await resolvedActiveBlob.text()).toBe('PDF CONTENT EDITION 2');
  });

  it('sorts ExternalDocDetailModal version history in strict reverse chronological order without false (ล่าสุด) badge and supports collapsible toggle', () => {
    const activeDoc = {
      id: 'ED-ACT-9',
      edCode: 'ED-QC-01',
      title: 'Test Method Standard',
      department: 'QC',
      status: 'ACTIVE',
      edition: '9.0',
      sourceVersion: '9.0',
      effectiveDate: '2026-04-01',
      darId: 'EDR-2026-0006',
      previousDocId: 'ED-SUP-8'
    };
    const supDoc8 = {
      id: 'ED-SUP-8',
      edCode: 'ED-QC-01',
      title: 'Test Method Standard',
      department: 'QC',
      status: 'SUPERSEDED',
      is_superseded: true,
      edition: 'Issue8.01',
      sourceVersion: 'Issue8.01',
      effectiveDate: '2026-03-01',
      darId: 'EDR-2026-0005',
      supersededByDocId: 'ED-ACT-9'
    };
    const supDoc7 = {
      id: 'ED-SUP-7',
      edCode: 'ED-QC-01',
      title: 'Test Method Standard',
      department: 'QC',
      status: 'SUPERSEDED',
      is_superseded: true,
      edition: 'Issue7.0',
      sourceVersion: 'Issue7.0',
      effectiveDate: '2026-02-15',
      darId: 'EDR-2026-0004'
    };
    const supDoc6 = {
      id: 'ED-SUP-6',
      edCode: 'ED-QC-01',
      title: 'Test Method Standard',
      department: 'QC',
      status: 'SUPERSEDED',
      is_superseded: true,
      edition: 'Issue6.0',
      sourceVersion: 'Issue6.0',
      effectiveDate: '2026-02-01',
      darId: 'EDR-2026-0002'
    };
    // Oldest version with a high numeric string "11021" that previously hijacked index 0
    const supDocOldest = {
      id: 'ED-SUP-1',
      edCode: 'ED-QC-01',
      title: 'Test Method Standard',
      department: 'QC',
      status: 'SUPERSEDED',
      is_superseded: true,
      edition: '11021',
      sourceVersion: '11021',
      effectiveDate: '2026-01-01',
      darId: 'EDR-2026-0001'
    };

    useStore.setState({
      currentUser: { id: 'U-DCC', name: 'DCC Admin', role: 'DCC', department: 'DC', isDcc: true },
      externalDocuments: [supDocOldest, supDoc8, activeDoc, supDoc6, supDoc7]
    });

    const { container } = render(
      <ExternalDocDetailModal
        isOpen={true}
        onClose={() => {}}
        document={activeDoc}
      />
    );

    // Switch to Version History tab
    const historyTabBtn = screen.getByRole('button', { name: /ประวัติทุกเวอร์ชัน/i });
    fireEvent.click(historyTabBtn);

    // 1. No false "(ล่าสุด)" badge anywhere
    expect(screen.queryByText('(ล่าสุด)')).toBeNull();

    // 2. Active version is displayed with "ใช้งานปัจจุบัน"
    expect(screen.getByText('ใช้งานปัจจุบัน')).toBeTruthy();

    // 3. Only 3 superseded versions shown initially (Issue8.01, Issue7.0, Issue6.0); oldest "11021" is collapsed
    expect(screen.getByText('Edition Issue8.01')).toBeTruthy();
    expect(screen.getByText('Edition Issue7.0')).toBeTruthy();
    expect(screen.getByText('Edition Issue6.0')).toBeTruthy();
    expect(screen.queryByText('Edition 11021')).toBeNull();

    // 4. Expand collapsible toggle to reveal the 4th superseded version ("11021")
    const toggleBtn = screen.getByRole('button', { name: /ดูประวัติฉบับตกรุ่นเพิ่มเติม \(1 รายการ\)/i });
    fireEvent.click(toggleBtn);

    expect(screen.getByText('Edition 11021')).toBeTruthy();
    expect(screen.getByRole('button', { name: /ซ่อนประวัติเก่า/i })).toBeTruthy();

    // 5. Verify DOM order: Edition 9.0 (Active) -> Edition Issue8.01 -> Edition Issue7.0 -> Edition Issue6.0 -> Edition 11021
    const fullText = container.textContent;
    const posActive = fullText.indexOf('Edition 9.0');
    const posIssue8 = fullText.indexOf('Edition Issue8.01');
    const pos11021 = fullText.indexOf('Edition 11021');
    expect(posActive).toBeGreaterThan(-1);
    expect(posIssue8).toBeGreaterThan(posActive);
    expect(pos11021).toBeGreaterThan(posIssue8);
  });

  it('End-to-End External Document Controlled Copy workflow: renders button with 0 copies, opens RequestAdditionalCopiesModal with Edition, creates ED-QC-01-C01 + DCC task + distributionList, and renders in Circulation table', () => {
    const activeExtDoc = {
      id: 'ED-ACT-9',
      edCode: 'ED-QC-01',
      doc_code: 'ED-QC-01',
      code: 'ED-QC-01',
      title: 'ISO 17025 Lab Standard',
      department: 'QC',
      status: 'ACTIVE',
      edition: '9.0',
      sourceVersion: '9.0',
      effectiveDate: '2026-04-01',
      distributionList: [],
      controlledCopies: []
    };

    useStore.setState({
      currentUser: { id: 'U-QC-STAFF', name: 'QC Staff', role: 'GENERAL_USER', department: 'QC', level: 2 },
      externalDocuments: [activeExtDoc],
      controlledCopyInstances: [],
      documentControlledCopies: [],
      tasks: [],
      notifications: []
    });

    const { rerender } = render(
      <ExternalDocDetailModal
        isOpen={true}
        onClose={() => {}}
        document={activeExtDoc}
      />
    );

    // 1. Renders "+ ขอสำเนาควบคุมเพิ่มเติม" button even with 0 initial copies
    const requestBtn = screen.getByRole('button', { name: /ขอสำเนาควบคุมเพิ่มเติม/i });
    expect(requestBtn).toBeTruthy();

    // 2. Clicking button opens RequestAdditionalCopiesModal showing ED-QC-01 and Edition 9.0 (not Rev.)
    fireEvent.click(requestBtn);
    expect(screen.getAllByText('ED-QC-01').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('Edition 9.0').length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText('Rev.9.0')).toBeNull();

    // 3. Submit ad-hoc copy request via store action
    useStore.getState().requestAdditionalControlledCopies(
      'ED-ACT-9',
      [
        {
          departmentId: 'QC',
          department: 'QC',
          target_department: 'QC',
          locationId: 'QC-LAB-01',
          locationName: 'ห้องปฏิบัติการทดสอบเคมี (QC Lab 1)',
          is_external: true,
          doc_type: 'EXTERNAL'
        }
      ],
      'ใช้ประจำจุดตรวจวิเคราะห์ QC Lab 1',
      {
        documentId: 'ED-ACT-9',
        docCode: 'ED-QC-01',
        docTitle: 'ISO 17025 Lab Standard',
        edition: '9.0',
        is_external: true,
        doc_type: 'EXTERNAL'
      }
    );

    const stateAfter = useStore.getState();
    const createdCopy = stateAfter.controlledCopyInstances.find(c => c.copyCode === 'ED-QC-01-C01');
    expect(createdCopy).toBeTruthy();
    expect(createdCopy.is_external).toBe(true);
    expect(createdCopy.doc_type).toBe('EXTERNAL');
    expect(createdCopy.edition).toBe('9.0');

    // Verify DCC task created
    const dccTask = stateAfter.tasks.find(t => t.taskType === 'DCC_ISSUE_CONTROLLED_COPIES' && t.docCode === 'ED-QC-01');
    expect(dccTask).toBeTruthy();
    expect(dccTask.is_external).toBe(true);
    expect(dccTask.copyCodes).toContain('ED-QC-01-C01');

    // Verify externalDocuments[].distributionList updated
    const updatedExtDoc = stateAfter.externalDocuments.find(d => d.id === 'ED-ACT-9');
    expect(updatedExtDoc.distributionList.some(d => d.copyCode === 'ED-QC-01-C01')).toBe(true);

    // 4. Re-render ExternalDocDetailModal and verify ED-QC-01-C01 appears in Controlled Copies in Circulation table
    rerender(
      <ExternalDocDetailModal
        isOpen={true}
        onClose={() => {}}
        document={updatedExtDoc}
      />
    );

    expect(screen.getByText('ED-QC-01-C01')).toBeTruthy();
    expect(screen.getAllByText(/ห้องปฏิบัติการทดสอบเคมี \(QC Lab 1\)/i).length).toBeGreaterThanOrEqual(1);
  });

  it('Criterion 7: Periodic Review fixes false DUE_SOON for 2027-10-13, Sidebar badge overcounting, and Rev.Rev/Edition formatting', () => {
    const refToday = new Date('2026-10-13T00:00:00.000Z');
    const status2027 = getPeriodicReviewStatus('2027-10-13', refToday);
    expect(status2027.status).toBe('NORMAL');
    expect(status2027.label).toBe('ยังไม่ถึงกำหนด');
    expect(status2027.days).toBe(365);

    const qcUser = {
      id: 'U-QC-01',
      name: 'สมศรี (ผู้ขอแก้ไข)',
      department: 'QC',
      level: 1,
      role: 'STAFF',
      managedDepartments: ['*']
    };

    const supersededExtDoc = {
      id: 'ED-QC-01-SUPERSEDED-1',
      edCode: 'ED-QC-01',
      doc_code: 'ED-QC-01',
      title: 'Test-ED-01.02',
      department: 'QC',
      status: 'SUPERSEDED',
      is_superseded: true,
      is_external: true,
      edition: 'Issue8.01',
      sourceVersion: 'Issue8.01',
      revision: 'Rev.01',
      nextReviewDate: '2026-10-13',
      next_review_date: '2026-10-13',
      review_status: 'DUE_SOON'
    };

    const activeExtDoc = {
      id: 'ED-QC-01-ACTIVE-2',
      edCode: 'ED-QC-01',
      doc_code: 'ED-QC-01',
      title: 'Test-ED-01.02',
      department: 'QC',
      status: 'ACTIVE',
      is_superseded: false,
      is_obsolete: false,
      is_external: true,
      edition: 'Issue8.02',
      sourceVersion: 'Issue8.02',
      revision: 'Rev.02',
      nextReviewDate: '2027-10-13',
      next_review_date: '2026-10-13' // Even if stale snake_case existed, active nextReviewDate wins
    };

    const activeInternalDoc = {
      id: 'INT-QC-01',
      code: 'SOP-QC-01',
      doc_code: 'SOP-QC-01',
      title: 'SOP-QC-01',
      name: 'การตรวจสอบคุณภาพ',
      department: 'QC',
      status: 'EFFECTIVE',
      revision: 'Rev.02',
      next_review_date: '2027-10-13'
    };

    useStore.setState({
      currentUser: qcUser,
      simulatedSystemDate: '2026-10-13T00:00:00.000Z',
      documents: [activeInternalDoc],
      externalDocuments: [supersededExtDoc, activeExtDoc],
      periodicReviewSchedules: [],
      tasks: [
        {
          id: 'T-STALE-PR',
          type: 'PERIODIC_REVIEW',
          taskType: 'PERIODIC_REVIEW',
          docCode: 'ED-QC-01',
          target_department: 'QC',
          status: 'PENDING'
        }
      ]
    });

    const { unmount } = render(
      <MemoryRouter initialEntries={['/dcc/periodic-reviews']}>
        <Sidebar />
      </MemoryRouter>
    );

    const reviewLink = screen.getByText('การทบทวนตามรอบ').closest('a');
    expect(reviewLink.textContent).toBe('การทบทวนตามรอบ');
    unmount();

    render(
      <MemoryRouter initialEntries={['/dcc/periodic-reviews']}>
        <PeriodicReviewDashboard />
      </MemoryRouter>
    );

    // Internal tab: Rev.02 is rendered cleanly without Rev.Rev.02
    expect(screen.getByText('Rev.02')).toBeTruthy();
    expect(screen.queryByText('Rev.Rev.02')).toBeNull();

    // Switch to External Docs tab
    const extTabBtn = screen.getByRole('button', { name: /เอกสารภายนอก/i });
    fireEvent.click(extTabBtn);

    // Verify ED-QC-01 displays Edition Issue8.02 and ✅ ยังไม่ถึงกำหนด, and never ⚠️ ใกล้ครบกำหนด or Rev.Rev.02
    expect(screen.getByText('Edition Issue8.02')).toBeTruthy();
    expect(screen.queryByText('Rev.Rev.02')).toBeNull();
    expect(screen.getByText('✅ ยังไม่ถึงกำหนด')).toBeTruthy();
    expect(screen.queryByText('⚠️ ใกล้ครบกำหนด')).toBeNull();

    const metrics = getDocumentReviewMetrics([
      {
        ...activeExtDoc,
        isExternal: true,
        nextReviewDate: '2027-10-13',
        next_review_date: '2027-10-13'
      }
    ], refToday);
    expect(metrics.dueSoon).toBe(0);
    expect(metrics.upToDate).toBe(1);
  });

  it('Criterion 8: End-to-End External Document Periodic Review workflow', () => {
    const qcManager = {
      id: 'U-QC-MGR',
      name: 'QC Manager',
      department: 'QC',
      level: 6, // ED approver level per the approval matrix
      role: 'MANAGER',
      status: 'ACTIVE'
    };

    const extDoc = {
      id: 'ED-QC-01-ACTIVE-2',
      edCode: 'ED-QC-01',
      doc_code: 'ED-QC-01',
      code: 'ED-QC-01',
      title: 'ISO 9001:2015 Standard',
      edition: 'Issue8.02',
      sourceVersion: 'Issue8.02',
      issuer: 'ISO Organization',
      department: 'QC',
      status: 'ACTIVE',
      is_external: true,
      nextReviewDate: '2026-10-20'
    };

    useStore.setState({
      currentUser: qcManager,
      simulatedSystemDate: '2026-10-13T00:00:00.000Z',
      documents: [],
      externalDocuments: [extDoc],
      periodicReviewSchedules: [],
      periodicReviewTasks: [],
      periodicReviewRecords: [],
      tasks: []
    });

    render(
      <MemoryRouter initialEntries={['/dcc/periodic-reviews/PRS-AUTO-ED-QC-01-ACTIVE-2?docId=ED-QC-01-ACTIVE-2&docCode=ED-QC-01&isExternal=true']}>
        <Routes>
          <Route path="/dcc/periodic-reviews/:id" element={<PeriodicReviewDetail />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.queryByText(/ไม่พบเอกสารนี้/i)).toBeNull();
    expect(screen.queryByText(/Not Found/i)).toBeNull();
    expect(screen.getByText('ED-QC-01')).toBeTruthy();
    expect(screen.getByText('Edition Issue8.02')).toBeTruthy();
    expect(screen.getByText('หน่วยงานผู้ออกเอกสาร')).toBeTruthy();
    expect(screen.getByText('ISO Organization')).toBeTruthy();

    const res = useStore.getState().submitPeriodicReview({
      scheduleId: 'PRS-AUTO-ED-QC-01-ACTIVE-2',
      docId: 'ED-QC-01-ACTIVE-2',
      docCode: 'ED-QC-01',
      isExternal: true,
      outcome: 'NO_CHANGE',
      currentUser: qcManager,
      reviewDetails: { reason: 'Verified active ISO standard' }
    });

    expect(res?.fastTrack).toBe(true);
    expect(res?.status).toBe('COMPLETED');

    const updatedExtDoc = useStore.getState().externalDocuments.find(d => d.id === 'ED-QC-01-ACTIVE-2');
    expect(updatedExtDoc.is_reviewed_this_cycle).toBe(true);
    expect(updatedExtDoc.review_status).toBe('COMPLETED');
    expect(updatedExtDoc.nextReviewDate).toBe('2027-10-20');
    expect(updatedExtDoc.periodic_reviews.length).toBe(1);
  });
});

describe('E2E Integration: Live Recalculation, Action Handoff Deep-Link & L4+ Approval Workflow', () => {
  it('Case 1 (Live Recalculation & 2027 Due Date): displays ✅ ยังไม่ถึงกำหนด (green), does NOT display ⚠️ ใกล้ครบกำหนด, and KPI card ใกล้ครบกำหนดใน 30 วัน is 0', () => {
    const qcUser = {
      id: 'U-QC-01',
      name: 'QC Officer',
      department: 'QC',
      level: 2,
      role: 'STAFF',
      managedDepartments: ['*']
    };

    const extDoc = {
      id: 'ED-QC-01',
      edCode: 'ED-QC-01',
      doc_code: 'ED-QC-01',
      code: 'ED-QC-01',
      title: 'ISO 17025 Chemical Testing Standard',
      department: 'QC',
      status: 'ACTIVE',
      edition: '1.0',
      sourceVersion: '1.0',
      effectiveDate: '2026-10-13',
      nextReviewDate: '2027-10-13',
      is_external: true
    };

    useStore.setState({
      currentUser: qcUser,
      simulatedSystemDate: '2026-10-13T00:00:00.000Z',
      documents: [],
      externalDocuments: [extDoc],
      periodicReviewSchedules: [],
      tasks: []
    });

    render(
      <MemoryRouter initialEntries={['/dcc/periodic-reviews']}>
        <PeriodicReviewDashboard />
      </MemoryRouter>
    );

    // Switch to External Documents tab
    const extTabBtn = screen.getByRole('button', { name: /เอกสารภายนอก/i });
    fireEvent.click(extTabBtn);

    // Assert that the KPI card "ใกล้ครบกำหนดใน 30 วัน" is 0
    const dueSoonCard = screen.getByText('ใกล้ครบกำหนดใน 30 วัน').closest('.card-surface');
    expect(dueSoonCard.querySelector('h3').textContent).toBe('0');

    // Assert table row displays ✅ ยังไม่ถึงกำหนด with green styling and does NOT display ⚠️ ใกล้ครบกำหนด
    expect(screen.getByText('✅ ยังไม่ถึงกำหนด')).toBeTruthy();
    expect(screen.queryByText('⚠️ ใกล้ครบกำหนด')).toBeNull();
  });

  it('Case 2 (Action Handoff & Deep-Link Update): renders Next Steps Action Box with Update Edition button and deep-links to ExternalDocsList auto-opening revision modal', () => {
    const qcUser = {
      id: 'U-QC-01',
      name: 'QC Officer',
      department: 'QC',
      level: 2,
      role: 'STAFF',
      managedDepartments: ['*']
    };

    const extDoc = {
      id: 'ED-QC-01',
      edCode: 'ED-QC-01',
      doc_code: 'ED-QC-01',
      code: 'ED-QC-01',
      title: 'ISO 17025 Chemical Testing Standard',
      department: 'QC',
      status: 'ACTIVE',
      edition: '1.0',
      sourceVersion: '1.0',
      is_external: true,
      review_status: 'AWAITING_ACTION',
      periodic_reviews: [
        {
          round: 1,
          outcome: 'REVISION_REQUIRED',
          result: 'REVISION_REQUIRED',
          reason: 'International standard updated'
        }
      ]
    };

    const schedule = {
      id: 'PRS-EXT-ED-QC-01',
      documentId: 'ED-QC-01',
      externalDocumentId: 'ED-QC-01',
      documentNumber: 'ED-QC-01',
      documentName: 'ISO 17025 Chemical Testing Standard',
      documentCategory: 'EXTERNAL',
      isExternal: true,
      ownerDepartmentId: 'QC',
      status: 'AWAITING_ACTION',
      outcome: 'REVISION_REQUIRED',
      reason: 'International standard updated'
    };

    useStore.setState({
      currentUser: qcUser,
      simulatedSystemDate: '2026-10-13T00:00:00.000Z',
      documents: [],
      externalDocuments: [extDoc],
      periodicReviewSchedules: [schedule],
      tasks: []
    });

    // 1. Render PeriodicReviewDetail for ED-QC-01
    const { unmount } = render(
      <MemoryRouter initialEntries={['/dcc/periodic-reviews/PRS-EXT-ED-QC-01?docId=ED-QC-01&docCode=ED-QC-01&isExternal=true']}>
        <Routes>
          <Route path="/dcc/periodic-reviews/:id" element={<PeriodicReviewDetail />} />
        </Routes>
      </MemoryRouter>
    );

    // 2. Assert Next Steps Action Box renders with title and button
    expect(screen.getByText(/ขั้นตอนถัดไป: จัดทำเอกสารภายนอกฉบับใหม่ \(Edition Update Required\)/i)).toBeTruthy();
    const actionBtn = screen.getByRole('button', { name: /ดำเนินการอัปเดตฉบับใหม่ \(Update Edition\)/i });
    expect(actionBtn).toBeTruthy();

    unmount();

    // 3. Render ExternalDocsList with searchParams / route state { openDocCode: 'ED-QC-01', autoOpenUpdate: true }
    render(
      <MemoryRouter initialEntries={[{ pathname: '/dcc/external-docs', search: '?docCode=ED-QC-01&autoOpenUpdate=true', state: { openDocCode: 'ED-QC-01', autoOpenUpdate: true } }]}>
        <Routes>
          <Route path="/dcc/external-docs" element={<ExternalDocsList />} />
        </Routes>
      </MemoryRouter>
    );

    // 4. Assert that the revision modal (ExternalDocFormModal) is opened automatically
    expect(screen.getByText(/อัปเดตเอกสารภายนอก \(Update External Document\)/i)).toBeTruthy();
    expect(screen.getAllByText('ED-QC-01').length).toBeGreaterThanOrEqual(1);
  });

  it('Case 3 (Staff Submission -> Pending Approval -> L5+ Approval -> +1 Year): Staff submits NO_CHANGE -> PENDING_APPROVAL, HOD approves -> advances nextReviewDate to 2028-10-13, COMPLETED', () => {
    const staffUser = {
      id: 'U-QC-STAFF',
      name: 'QC Staff',
      department: 'QC',
      level: 2,
      role: 'STAFF'
    };

    const supervisorUser = {
      id: 'U-QC-SUP',
      name: 'QC HOD',
      department: 'QC',
      level: 6, // ED approver level per the approval matrix
      role: 'HOD'
    };

    const extDoc = {
      id: 'ED-QC-01',
      edCode: 'ED-QC-01',
      doc_code: 'ED-QC-01',
      code: 'ED-QC-01',
      title: 'ISO 17025 Chemical Testing Standard',
      department: 'QC',
      status: 'ACTIVE',
      edition: '1.0',
      sourceVersion: '1.0',
      is_external: true,
      effectiveDate: '2026-10-13',
      nextReviewDate: '2027-10-13',
      next_review_date: '2027-10-13',
      review_status: 'DUE_SOON',
      reviewCycleMonths: 12
    };

    const schedule = {
      id: 'PRS-EXT-ED-QC-01',
      documentId: 'ED-QC-01',
      externalDocumentId: 'ED-QC-01',
      documentNumber: 'ED-QC-01',
      documentName: 'ISO 17025 Chemical Testing Standard',
      documentCategory: 'EXTERNAL',
      isExternal: true,
      ownerDepartmentId: 'QC',
      status: 'ACTION_REQUIRED',
      nextReviewDate: '2027-10-13',
      next_review_date: '2027-10-13'
    };

    useStore.setState({
      currentUser: staffUser,
      users: [staffUser, supervisorUser],
      masterUsers: [staffUser, supervisorUser],
      simulatedSystemDate: '2027-10-13T00:00:00.000Z',
      documents: [],
      externalDocuments: [extDoc],
      periodicReviewSchedules: [schedule],
      tasks: [],
      periodicReviewTasks: [],
      periodicReviewRecords: []
    });

    // 1. Staff submits "NO_CHANGE"
    const submitRes = useStore.getState().submitPeriodicReview({
      scheduleId: 'PRS-EXT-ED-QC-01',
      docId: 'ED-QC-01',
      docCode: 'ED-QC-01',
      isExternal: true,
      outcome: 'NO_CHANGE',
      currentUser: staffUser,
      reviewDetails: { reason: 'Annual verification: standard is currently active and unchanged' }
    });

    expect(submitRes?.fastTrack).toBe(false);
    expect(submitRes?.status).toBe('PENDING_APPROVAL');

    const docPending = useStore.getState().externalDocuments.find(d => d.id === 'ED-QC-01');
    expect(docPending.review_status).toBe('PENDING_APPROVAL');
    expect(docPending.pending_periodic_review).toBeTruthy();

    const approvalTask = useStore.getState().tasks.find(t => t.type === 'PERIODIC_REVIEW_APPROVAL');
    expect(approvalTask).toBeTruthy();
    expect(approvalTask.assignee_id).toBe('U-QC-SUP');

    // 2. Staff L2 cannot approve (RBAC check)
    const unauthorizedRes = useStore.getState().approveExternalPeriodicReview('ED-QC-01', staffUser, 'Unauthorized approve attempt');
    expect(unauthorizedRes.success).toBe(false);
    expect(unauthorizedRes.error).toBe('UNAUTHORIZED');

    // 3. L5 HOD approves via approveExternalPeriodicReview
    const approveRes = useStore.getState().approveExternalPeriodicReview('ED-QC-01', supervisorUser, 'HOD verified and approved');
    expect(approveRes.success).toBe(true);

    // 4. Assert nextReviewDate advanced to 2028-10-13 (+1 year), COMPLETED, is_reviewed_this_cycle
    const docApproved = useStore.getState().externalDocuments.find(d => d.id === 'ED-QC-01');
    expect(docApproved.nextReviewDate).toBe('2028-10-13');
    expect(docApproved.review_status).toBe('COMPLETED');
    expect(docApproved.is_reviewed_this_cycle).toBe(true);
    expect(docApproved.pending_periodic_review).toBe(false);

    const scheduleApproved = useStore.getState().periodicReviewSchedules.find(s => s.id === 'PRS-EXT-ED-QC-01');
    expect(scheduleApproved.status).toBe('COMPLETED');
    expect(scheduleApproved.is_reviewed_this_cycle).toBe(true);
  });

  it('Case 4 (QMS Standard Alignment): Dashboard default action button [บันทึกผล], Review Form 3 Options, and Lifecycle Flow', async () => {
    const staffUser = {
      id: 'U-QC-STAFF-02',
      name: 'QC Officer',
      department: 'QC',
      level: 2,
      role: 'STAFF'
    };

    const supervisorUser = {
      id: 'U-QC-SUP-02',
      name: 'QC Section Head',
      department: 'QC',
      level: 4,
      role: 'SUPERVISOR'
    };

    // Document with historical review that had REVISION_REQUIRED in the past, but is currently a new cycle needing review
    const extDoc = {
      id: 'ED-QC-99',
      edCode: 'ED-QC-99',
      doc_code: 'ED-QC-99',
      code: 'ED-QC-99',
      title: 'Packaging Quality Assurance Standard',
      department: 'QC',
      status: 'ACTIVE',
      edition: '3.0',
      sourceVersion: '3.0',
      is_external: true,
      nextReviewDate: '2026-10-20',
      next_review_date: '2026-10-20',
      review_status: 'DUE_SOON',
      is_reviewed_this_cycle: false,
      periodic_reviews: [
        {
          round: 1,
          outcome: 'REVISION_REQUIRED',
          result: 'REVISION_REQUIRED',
          reviewed_date: '2025-10-20'
        }
      ]
    };

    useStore.setState({
      currentUser: staffUser,
      users: [staffUser, supervisorUser],
      masterUsers: [staffUser, supervisorUser],
      simulatedSystemDate: '2026-10-14T00:00:00.000Z',
      documents: [],
      externalDocuments: [extDoc],
      periodicReviewSchedules: [],
      tasks: [],
      periodicReviewTasks: [],
      periodicReviewRecords: []
    });

    // 1. Dashboard Action Button: MUST be [ 🔄 บันทึกผล ] by default, NOT [ อัปเดตฉบับใหม่ ]
    const { unmount: unmountDash } = render(
      <MemoryRouter initialEntries={['/dcc/periodic-reviews']}>
        <PeriodicReviewDashboard />
      </MemoryRouter>
    );

    const extTabBtn = screen.getByRole('button', { name: /เอกสารภายนอก/i });
    fireEvent.click(extTabBtn);

    expect(screen.getByText('ED-QC-99')).toBeTruthy();
    expect(screen.getByText('บันทึกผล')).toBeTruthy();
    expect(screen.queryByText('อัปเดตฉบับใหม่')).toBeNull();
    unmountDash();

    // 2. Open PeriodicReviewDetail: must display Review Assessment Form with 3 clear options and sublabels
    render(
      <MemoryRouter initialEntries={['/dcc/periodic-reviews/PRS-AUTO-ED-QC-99?docId=ED-QC-99&docCode=ED-QC-99&isExternal=true']}>
        <Routes>
          <Route path="/dcc/periodic-reviews/:id" element={<PeriodicReviewDetail />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText('บันทึกผลการทบทวน')).toBeTruthy();
    expect(screen.getByText('ยังคงใช้งานต่อไปได้')).toBeTruthy();
    expect(screen.getByText('เอกสารยังถูกต้องและเป็นปัจจุบัน')).toBeTruthy();
    expect(screen.getByText('ต้องปรับปรุง/แก้ไข')).toBeTruthy();
    expect(screen.getByText('เนื้อหาหรือ Edition ต้องได้รับการปรับปรุง')).toBeTruthy();
    expect(screen.getByText('ขอยกเลิกการใช้งาน')).toBeTruthy();
    expect(screen.getByText('เอกสารไม่จำเป็นต้องใช้งานต่อ')).toBeTruthy();
  });
});

describe('5-Use-Case Periodic Review Two-Phase Commit & Rollback Lifecycle', () => {
  it('Case 1 (Cancel Rollback): User selects REVISION_REQUIRED for an external document -> store has AWAITING_ACTION -> calling resetPendingReviewIntent rolls back the intent: document status is restored to actionable (DUE_SOON), periodic_review_outcome is cleared, and Dashboard action button renders [ 🔄 บันทึกผล ]', async () => {
    const staffUser = {
      id: 'U-QC-C1',
      name: 'QC Officer C1',
      department: 'QC',
      level: 2,
      role: 'STAFF'
    };

    const extDoc = {
      id: 'ED-QC-CASE1',
      edCode: 'ED-QC-CASE1',
      doc_code: 'ED-QC-CASE1',
      code: 'ED-QC-CASE1',
      title: 'Analytical Method Standard C1',
      department: 'QC',
      status: 'ACTIVE',
      edition: '1.0',
      sourceVersion: '1.0',
      ownerId: 'U-QC-C1',
      ownerUserId: 'U-QC-C1',
      is_external: true,
      effectiveDate: '2026-10-14',
      nextReviewDate: '2026-10-25',
      next_review_date: '2026-10-25',
      review_status: 'DUE_SOON',
      is_reviewed_this_cycle: false
    };

    const schedule = {
      id: 'PRS-AUTO-ED-QC-CASE1',
      documentId: 'ED-QC-CASE1',
      externalDocumentId: 'ED-QC-CASE1',
      documentNumber: 'ED-QC-CASE1',
      documentName: 'Analytical Method Standard C1',
      documentCategory: 'EXTERNAL',
      isExternal: true,
      ownerDepartmentId: 'QC',
      ownerUserId: 'U-QC-C1',
      status: 'ACTION_REQUIRED',
      nextReviewDate: '2026-10-25'
    };

    useStore.setState({
      currentUser: staffUser,
      users: [staffUser],
      masterUsers: [staffUser],
      simulatedSystemDate: '2026-10-14T00:00:00.000Z',
      documents: [],
      externalDocuments: [extDoc],
      periodicReviewSchedules: [schedule],
      tasks: [],
      periodicReviewTasks: [],
      periodicReviewRecords: []
    });

    // 1. Submit periodic review with outcome REVISION_REQUIRED
    useStore.getState().submitPeriodicReview({
      scheduleId: 'PRS-AUTO-ED-QC-CASE1',
      docId: 'ED-QC-CASE1',
      docCode: 'ED-QC-CASE1',
      isExternal: true,
      outcome: 'REVISION_REQUIRED',
      currentUser: staffUser,
      reviewDetails: { reason: 'Revision required due to vendor upgrade' }
    });

    const docAwaiting = useStore.getState().externalDocuments.find(d => d.id === 'ED-QC-CASE1');
    expect(docAwaiting.review_status).toBe('AWAITING_ACTION');
    expect(docAwaiting.periodic_review_outcome).toBe('REVISION_REQUIRED');

    // Dashboard renders [ อัปเดตฉบับใหม่ ]
    const { unmount: unmountDash1 } = render(
      <MemoryRouter initialEntries={['/dcc/periodic-reviews']}>
        <PeriodicReviewDashboard />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole('button', { name: /เอกสารภายนอก/i }));
    expect(screen.getByText('ED-QC-CASE1')).toBeTruthy();
    expect(screen.getByText('อัปเดตฉบับใหม่')).toBeTruthy();
    unmountDash1();

    // 2. Call resetPendingReviewIntent (or simulate modal cancellation)
    useStore.getState().resetPendingReviewIntent('ED-QC-CASE1');

    // Document status restored to actionable (DUE_SOON) and periodic_review_outcome cleared
    const docRolledBack = useStore.getState().externalDocuments.find(d => d.id === 'ED-QC-CASE1');
    expect(docRolledBack.review_status).toBe('DUE_SOON');
    expect(docRolledBack.periodic_review_outcome).toBeUndefined();
    expect(docRolledBack.is_reviewed_this_cycle).toBe(false);

    // 3. Dashboard action button renders [ 🔄 บันทึกผล ]
    render(
      <MemoryRouter initialEntries={['/dcc/periodic-reviews']}>
        <PeriodicReviewDashboard />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole('button', { name: /เอกสารภายนอก/i }));
    expect(screen.getByText('ED-QC-CASE1')).toBeTruthy();
    expect(screen.getByText('บันทึกผล')).toBeTruthy();
    expect(screen.queryByText('อัปเดตฉบับใหม่')).toBeNull();
  });

  it('Case 2 (Re-evaluation): In PeriodicReviewDetail, a document in AWAITING_ACTION with outcome: REVISION_REQUIRED can trigger re-evaluation (handleStartReReview / isReEvaluating), allowing user to change outcome to NO_CHANGE (ใช้งานต่อ)', async () => {
    const staffUser = {
      id: 'U-QC-C2',
      name: 'QC Officer C2',
      department: 'QC',
      level: 2,
      role: 'STAFF'
    };

    const supervisorUser = {
      id: 'U-QC-SUP-C2',
      name: 'QC Manager C2',
      department: 'QC',
      level: 6, // ED approver level per the approval matrix
      role: 'MANAGER'
    };

    const extDoc = {
      id: 'ED-QC-CASE2',
      edCode: 'ED-QC-CASE2',
      doc_code: 'ED-QC-CASE2',
      code: 'ED-QC-CASE2',
      title: 'Microbiology Test Manual C2',
      department: 'QC',
      status: 'ACTIVE',
      edition: '1.0',
      sourceVersion: '1.0',
      ownerId: 'U-QC-C2',
      ownerUserId: 'U-QC-C2',
      is_external: true,
      effectiveDate: '2026-10-14',
      nextReviewDate: '2026-10-28',
      next_review_date: '2026-10-28',
      review_status: 'AWAITING_ACTION',
      periodic_review_outcome: 'REVISION_REQUIRED',
      is_reviewed_this_cycle: false,
      periodic_reviews: [
        {
          round: 1,
          outcome: 'REVISION_REQUIRED',
          result: 'REVISE',
          reviewed_date: '2026-10-14',
          reason: 'Initial inspection thought new revision required'
        }
      ]
    };

    const schedule = {
      id: 'PRS-AUTO-ED-QC-CASE2',
      documentId: 'ED-QC-CASE2',
      externalDocumentId: 'ED-QC-CASE2',
      documentNumber: 'ED-QC-CASE2',
      documentName: 'Microbiology Test Manual C2',
      documentCategory: 'EXTERNAL',
      isExternal: true,
      ownerDepartmentId: 'QC',
      ownerUserId: 'U-QC-C2',
      status: 'AWAITING_ACTION',
      review_status: 'AWAITING_ACTION',
      outcome: 'REVISION_REQUIRED',
      periodic_review_outcome: 'REVISION_REQUIRED',
      nextReviewDate: '2026-10-28'
    };

    useStore.setState({
      currentUser: staffUser,
      users: [staffUser, supervisorUser],
      masterUsers: [staffUser, supervisorUser],
      simulatedSystemDate: '2026-10-14T00:00:00.000Z',
      documents: [],
      externalDocuments: [extDoc],
      periodicReviewSchedules: [schedule],
      tasks: [],
      periodicReviewTasks: [],
      periodicReviewRecords: []
    });

    render(
      <MemoryRouter initialEntries={['/dcc/periodic-reviews/PRS-AUTO-ED-QC-CASE2?docId=ED-QC-CASE2&docCode=ED-QC-CASE2&isExternal=true']}>
        <Routes>
          <Route path="/dcc/periodic-reviews/:id" element={<PeriodicReviewDetail />} />
          <Route path="/dcc/periodic-reviews" element={<div>Dashboard</div>} />
        </Routes>
      </MemoryRouter>
    );

    // Initial view: Awaiting action notice and re-evaluate button
    expect(screen.getByText(/ขั้นตอนถัดไป: จัดทำเอกสารภายนอกฉบับใหม่/i)).toBeTruthy();
    const reEvaluateBtn = screen.getByRole('button', { name: /เปลี่ยนผลการทบทวน \(Re-evaluate\)/i });
    expect(reEvaluateBtn).toBeTruthy();

    // Trigger Re-evaluation
    fireEvent.click(reEvaluateBtn);

    // Re-evaluating banner is displayed and form is active
    expect(screen.getByText(/โหมดแก้ไขผลการทบทวน: เปลี่ยนผลประเมินหรือรายละเอียดได้/i)).toBeTruthy();
    expect(screen.getByText('บันทึกผลการทบทวน')).toBeTruthy();

    // User changes outcome to NO_CHANGE (ยังคงใช้งานต่อไปได้)
    const noChangeRadio = screen.getByLabelText(/ยังคงใช้งานต่อไปได้/i);
    fireEvent.click(noChangeRadio);

    // Provide reason
    const reasonTextarea = screen.getByPlaceholderText(/อธิบายเหตุผลที่เลือกผลการประเมิน/i);
    fireEvent.change(reasonTextarea, { target: { value: 'Verified standard: current version is still valid and no change needed' } });

    // Submit review
    const submitBtn = screen.getByRole('button', { name: /ส่งผลให้หัวหน้าแผนก/i });
    fireEvent.click(submitBtn);

    // Store updated to PENDING_APPROVAL for supervisor sign-off
    const docAfterReReview = useStore.getState().externalDocuments.find(d => d.id === 'ED-QC-CASE2');
    expect(docAfterReReview.review_status).toBe('PENDING_APPROVAL');
    expect(docAfterReReview.pending_periodic_review).toBeTruthy();

    const approvalTask = useStore.getState().tasks.find(t => t.type === 'PERIODIC_REVIEW_APPROVAL');
    expect(approvalTask).toBeTruthy();
    expect(approvalTask.assignee_id).toBe('U-QC-SUP-C2');
  });

  it('Case 3 (Actual Request Linkage): When an update request is submitted via updateExternalDoc on an AWAITING_ACTION document, it binds linkedRequestId and linkedActionId', async () => {
    const staffUser = {
      id: 'U-QC-C3',
      name: 'QC Officer C3',
      department: 'QC',
      level: 2,
      role: 'STAFF'
    };

    const supervisorUser = {
      id: 'U-QC-SUP-C3',
      name: 'QC Sup C3',
      department: 'QC',
      level: 4,
      role: 'SUPERVISOR'
    };

    const extDoc = {
      id: 'ED-QC-CASE3',
      edCode: 'ED-QC-CASE3',
      doc_code: 'ED-QC-CASE3',
      code: 'ED-QC-CASE3',
      title: 'Water Analysis Standard C3',
      department: 'QC',
      status: 'ACTIVE',
      edition: '1.0',
      sourceVersion: '1.0',
      is_external: true,
      nextReviewDate: '2026-10-30',
      next_review_date: '2026-10-30',
      review_status: 'AWAITING_ACTION',
      periodic_review_outcome: 'REVISION_REQUIRED',
      is_reviewed_this_cycle: false
    };

    const schedule = {
      id: 'PRS-AUTO-ED-QC-CASE3',
      documentId: 'ED-QC-CASE3',
      externalDocumentId: 'ED-QC-CASE3',
      documentNumber: 'ED-QC-CASE3',
      documentName: 'Water Analysis Standard C3',
      documentCategory: 'EXTERNAL',
      isExternal: true,
      ownerDepartmentId: 'QC',
      status: 'AWAITING_ACTION',
      review_status: 'AWAITING_ACTION',
      periodic_review_outcome: 'REVISION_REQUIRED',
      nextReviewDate: '2026-10-30'
    };

    useStore.setState({
      currentUser: staffUser,
      users: [staffUser, supervisorUser],
      masterUsers: [staffUser, supervisorUser],
      simulatedSystemDate: '2026-10-14T00:00:00.000Z',
      documents: [],
      externalDocuments: [extDoc],
      periodicReviewSchedules: [schedule],
      externalRequests: [],
      tasks: [],
      notifications: []
    });

    // Submit update request via updateExternalDoc
    useStore.getState().updateExternalDoc('ED-QC-CASE3', {
      edition: '2.0',
      sourceVersion: '2.0',
      reason: 'Updated to 2026 revised ISO guideline',
      reviewerId: 'U-QC-SUP-C3'
    });

    const store = useStore.getState();
    const req = store.externalRequests[0];
    expect(req).toBeTruthy();
    expect(req.edCode).toBe('ED-QC-CASE3');

    // Assert existing doc binds linkedRequestId and linkedActionId
    const oldDoc = store.externalDocuments.find(d => d.id === 'ED-QC-CASE3');
    expect(oldDoc.linkedRequestId).toBe(req.id);
    expect(oldDoc.linkedActionId).toBe(req.id);

    // Assert new edition doc binds linkedRequestId and linkedActionId
    const newDoc = store.externalDocuments.find(d => d.edition === '2.0' && d.edCode === 'ED-QC-CASE3');
    expect(newDoc).toBeTruthy();
    expect(newDoc.linkedRequestId).toBe(req.id);
    expect(newDoc.linkedActionId).toBe(req.id);

    // Assert periodic review schedule binds linkedRequestId and linkedActionId
    const updatedSched = store.periodicReviewSchedules.find(s => s.id === 'PRS-AUTO-ED-QC-CASE3');
    expect(updatedSched.linkedRequestId).toBe(req.id);
    expect(updatedSched.linkedActionId).toBe(req.id);
    expect(updatedSched.linkageStatus).toBe('PENDING');
  });

  it('Case 4 (L5+ Approval Flow): When NO_CHANGE is submitted by staff -> PENDING_APPROVAL -> HOD approves -> advances nextReviewDate +1 year (+12 months) and marks review_status: COMPLETED, is_reviewed_this_cycle: true', async () => {
    const staffUser = {
      id: 'U-QC-C4',
      name: 'QC Officer C4',
      department: 'QC',
      level: 2,
      role: 'STAFF'
    };

    const supervisorUser = {
      id: 'U-QC-SUP-C4',
      name: 'QC HOD C4',
      department: 'QC',
      level: 6, // ED approver level per the approval matrix
      role: 'HOD'
    };

    const extDoc = {
      id: 'ED-QC-CASE4',
      edCode: 'ED-QC-CASE4',
      doc_code: 'ED-QC-CASE4',
      code: 'ED-QC-CASE4',
      title: 'Calibration Standard C4',
      department: 'QC',
      status: 'ACTIVE',
      edition: '1.0',
      sourceVersion: '1.0',
      is_external: true,
      effectiveDate: '2026-10-14',
      nextReviewDate: '2027-10-14',
      next_review_date: '2027-10-14',
      review_status: 'DUE_SOON',
      reviewCycleMonths: 12,
      is_reviewed_this_cycle: false
    };

    const schedule = {
      id: 'PRS-AUTO-ED-QC-CASE4',
      documentId: 'ED-QC-CASE4',
      externalDocumentId: 'ED-QC-CASE4',
      documentNumber: 'ED-QC-CASE4',
      documentName: 'Calibration Standard C4',
      documentCategory: 'EXTERNAL',
      isExternal: true,
      ownerDepartmentId: 'QC',
      status: 'ACTION_REQUIRED',
      nextReviewDate: '2027-10-14'
    };

    useStore.setState({
      currentUser: staffUser,
      users: [staffUser, supervisorUser],
      masterUsers: [staffUser, supervisorUser],
      simulatedSystemDate: '2027-10-14T00:00:00.000Z',
      documents: [],
      externalDocuments: [extDoc],
      periodicReviewSchedules: [schedule],
      tasks: [],
      periodicReviewTasks: [],
      periodicReviewRecords: []
    });

    // 1. Staff submits NO_CHANGE
    const submitRes = useStore.getState().submitPeriodicReview({
      scheduleId: 'PRS-AUTO-ED-QC-CASE4',
      docId: 'ED-QC-CASE4',
      docCode: 'ED-QC-CASE4',
      isExternal: true,
      outcome: 'NO_CHANGE',
      currentUser: staffUser,
      reviewDetails: { reason: 'Annual review complete, no changes required' }
    });

    expect(submitRes?.fastTrack).toBe(false);
    expect(submitRes?.status).toBe('PENDING_APPROVAL');

    const docPending = useStore.getState().externalDocuments.find(d => d.id === 'ED-QC-CASE4');
    expect(docPending.review_status).toBe('PENDING_APPROVAL');
    expect(docPending.pending_periodic_review).toBeTruthy();

    const approvalTask = useStore.getState().tasks.find(t => t.type === 'PERIODIC_REVIEW_APPROVAL');
    expect(approvalTask).toBeTruthy();
    expect(approvalTask.assignee_id).toBe('U-QC-SUP-C4');

    // 2. L5 HOD approves
    const approveRes = useStore.getState().approveExternalPeriodicReview('ED-QC-CASE4', supervisorUser, 'HOD approved review');
    expect(approveRes.success).toBe(true);

    // 3. Verify nextReviewDate +1 year (+12 months), COMPLETED, is_reviewed_this_cycle
    const docApproved = useStore.getState().externalDocuments.find(d => d.id === 'ED-QC-CASE4');
    expect(docApproved.nextReviewDate).toBe('2028-10-14');
    expect(docApproved.review_status).toBe('COMPLETED');
    expect(docApproved.is_reviewed_this_cycle).toBe(true);
    expect(docApproved.pending_periodic_review).toBe(false);

    const schedApproved = useStore.getState().periodicReviewSchedules.find(s => s.id === 'PRS-AUTO-ED-QC-CASE4');
    expect(schedApproved.status).toBe('COMPLETED');
    expect(schedApproved.is_reviewed_this_cycle).toBe(true);
  });

  it('Case 5 (Rejection Rollback): If a linked request or review task is rejected (cancelExternalRequest / rejectExternalRequest), resetPendingReviewIntent is invoked, returning document to actionable state', async () => {
    const staffUser = {
      id: 'U-QC-C5',
      name: 'QC Officer C5',
      department: 'QC',
      level: 2,
      role: 'STAFF'
    };

    // Sub-case 5A: cancelExternalRequest rollback
    const docA = {
      id: 'ED-QC-C5A',
      edCode: 'ED-QC-C5A',
      doc_code: 'ED-QC-C5A',
      code: 'ED-QC-C5A',
      title: 'Testing Guide 5A',
      department: 'QC',
      status: 'ACTIVE',
      edition: '1.0',
      sourceVersion: '1.0',
      nextReviewDate: '2026-10-25',
      review_status: 'AWAITING_ACTION',
      periodic_review_outcome: 'REVISION_REQUIRED',
      linkedRequestId: 'EDR-REQ-001',
      linkedActionId: 'EDR-REQ-001',
      is_reviewed_this_cycle: false
    };

    const schedA = {
      id: 'PRS-AUTO-ED-QC-C5A',
      documentId: 'ED-QC-C5A',
      externalDocumentId: 'ED-QC-C5A',
      documentNumber: 'ED-QC-C5A',
      documentCategory: 'EXTERNAL',
      isExternal: true,
      ownerDepartmentId: 'QC',
      status: 'AWAITING_ACTION',
      review_status: 'AWAITING_ACTION',
      linkedRequestId: 'EDR-REQ-001',
      linkedActionId: 'EDR-REQ-001',
      nextReviewDate: '2026-10-25'
    };

    const reqA = {
      id: 'EDR-REQ-001',
      requestId: 'EDR-REQ-001',
      edCode: 'ED-QC-C5A',
      docId: 'ED-QC-C5A',
      previousDocId: 'ED-QC-C5A',
      status: 'PENDING_EXT_REVIEW'
    };

    // Sub-case 5B: rejectExternalRequest rollback
    const docB = {
      id: 'ED-QC-C5B',
      edCode: 'ED-QC-C5B',
      doc_code: 'ED-QC-C5B',
      code: 'ED-QC-C5B',
      title: 'Testing Guide 5B',
      department: 'QC',
      status: 'ACTIVE',
      edition: '1.0',
      sourceVersion: '1.0',
      nextReviewDate: '2026-10-25',
      review_status: 'AWAITING_ACTION',
      periodic_review_outcome: 'REVISION_REQUIRED',
      linkedRequestId: 'EDR-REQ-002',
      linkedActionId: 'EDR-REQ-002',
      is_reviewed_this_cycle: false
    };

    const schedB = {
      id: 'PRS-AUTO-ED-QC-C5B',
      documentId: 'ED-QC-C5B',
      externalDocumentId: 'ED-QC-C5B',
      documentNumber: 'ED-QC-C5B',
      documentCategory: 'EXTERNAL',
      isExternal: true,
      ownerDepartmentId: 'QC',
      status: 'AWAITING_ACTION',
      review_status: 'AWAITING_ACTION',
      linkedRequestId: 'EDR-REQ-002',
      linkedActionId: 'EDR-REQ-002',
      nextReviewDate: '2026-10-25'
    };

    const reqB = {
      id: 'EDR-REQ-002',
      requestId: 'EDR-REQ-002',
      edCode: 'ED-QC-C5B',
      docId: 'ED-QC-C5B',
      previousDocId: 'ED-QC-C5B',
      status: 'PENDING_EXT_REVIEW'
    };

    useStore.setState({
      currentUser: staffUser,
      users: [staffUser],
      masterUsers: [staffUser],
      simulatedSystemDate: '2026-10-14T00:00:00.000Z',
      documents: [],
      externalDocuments: [docA, docB],
      periodicReviewSchedules: [schedA, schedB],
      externalRequests: [reqA, reqB],
      tasks: [],
      periodicReviewTasks: [],
      periodicReviewRecords: []
    });

    // 1. Cancel request A -> rolls back doc A
    useStore.getState().cancelExternalRequest('EDR-REQ-001');

    const updatedDocA = useStore.getState().externalDocuments.find(d => d.id === 'ED-QC-C5A');
    expect(updatedDocA.review_status).toBe('DUE_SOON');
    expect(updatedDocA.periodic_review_outcome).toBeUndefined();
    expect(updatedDocA.linkedRequestId).toBeUndefined();
    expect(updatedDocA.linkedActionId).toBeUndefined();

    const cancelledReqA = useStore.getState().externalRequests.find(r => r.id === 'EDR-REQ-001');
    expect(cancelledReqA.status).toBe('CANCELLED');

    // 2. Reject request B -> rolls back doc B
    useStore.getState().rejectExternalRequest('EDR-REQ-002', 'Rejected by approver: not conforming to current format');

    const updatedDocB = useStore.getState().externalDocuments.find(d => d.id === 'ED-QC-C5B');
    expect(updatedDocB.review_status).toBe('DUE_SOON');
    expect(updatedDocB.periodic_review_outcome).toBeUndefined();
    expect(updatedDocB.linkedRequestId).toBeUndefined();
    expect(updatedDocB.linkedActionId).toBeUndefined();

    const rejectedReqB = useStore.getState().externalRequests.find(r => r.id === 'EDR-REQ-002');
    expect(rejectedReqB.status).toBe('REJECTED');
  });
});

describe('Periodic Review Status Badge Contradiction & Action Button Layout Optimization', () => {
  it('Criterion 1 & 2: A document with pending REVISION_REQUIRED outcome displays "รออัปเดตฉบับใหม่" (overriding "ยังไม่ถึงกำหนด") and compact action group (text button + icon-only secondary buttons)', () => {
    const user = {
      id: 'U-QC-OPT',
      name: 'QC Officer Opt',
      department: 'QC',
      level: 3,
      role: 'STAFF'
    };

    // External doc whose next review date is in 2027 (normally UP_TO_DATE / ยังไม่ถึงกำหนด)
    // BUT has pending review outcome: REVISION_REQUIRED
    const doc = {
      id: 'ED-QC-OPT-01',
      edCode: 'ED-QC-OPT-01',
      doc_code: 'ED-QC-OPT-01',
      code: 'ED-QC-OPT-01',
      title: 'Analytical Method Standard 2027',
      department: 'QC',
      status: 'ACTIVE',
      edition: '1.0',
      is_external: true,
      effectiveDate: '2026-10-14',
      nextReviewDate: '2027-10-14',
      next_review_date: '2027-10-14',
      review_status: 'AWAITING_ACTION',
      periodic_review_outcome: 'REVISION_REQUIRED',
      is_reviewed_this_cycle: false
    };

    const schedule = {
      id: 'PRS-AUTO-ED-QC-OPT-01',
      documentId: 'ED-QC-OPT-01',
      externalDocumentId: 'ED-QC-OPT-01',
      documentNumber: 'ED-QC-OPT-01',
      documentName: 'Analytical Method Standard 2027',
      documentCategory: 'EXTERNAL',
      isExternal: true,
      ownerDepartmentId: 'QC',
      status: 'AWAITING_ACTION',
      review_status: 'AWAITING_ACTION',
      outcome: 'REVISION_REQUIRED',
      periodic_review_outcome: 'REVISION_REQUIRED',
      nextReviewDate: '2027-10-14'
    };

    useStore.setState({
      currentUser: user,
      users: [user],
      masterUsers: [user],
      simulatedSystemDate: '2026-10-14T00:00:00.000Z',
      documents: [],
      externalDocuments: [doc],
      periodicReviewSchedules: [schedule],
      tasks: [],
      periodicReviewTasks: [],
      periodicReviewRecords: []
    });

    render(
      <MemoryRouter initialEntries={['/dcc/periodic-reviews']}>
        <PeriodicReviewDashboard />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: /เอกสารภายนอก/i }));

    // Criterion 1: Must show "รออัปเดตฉบับใหม่" instead of "ยังไม่ถึงกำหนด" in row status column
    const docRow = screen.getByText('ED-QC-OPT-01').closest('tr');
    expect(docRow).toBeTruthy();
    expect(within(docRow).getByText(/รออัปเดตฉบับใหม่/i)).toBeTruthy();
    expect(within(docRow).queryByText(/ยังไม่ถึงกำหนด/i)).toBeNull();

    // Criterion 2: Primary action button has text "อัปเดตฉบับใหม่"
    const updateBtn = within(docRow).getByRole('button', { name: /อัปเดตฉบับใหม่/i });
    expect(updateBtn).toBeTruthy();
    expect(updateBtn.textContent).toContain('อัปเดตฉบับใหม่');

    // Secondary actions are icon-only with tooltips/aria-labels
    const reEvaluateBtn = within(docRow).getByRole('button', { name: /เปลี่ยนผลการทบทวน/i });
    expect(reEvaluateBtn).toBeTruthy();
    expect(reEvaluateBtn.textContent).toBe('');

    const historyBtn = within(docRow).getByRole('button', { name: /ดูประวัติการทบทวน/i });
    expect(historyBtn).toBeTruthy();
    expect(historyBtn.textContent).toBe('');
  });
});
