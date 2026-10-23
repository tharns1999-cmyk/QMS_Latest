import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import useStore from '../../store/useStore';
import Dashboard from '../../modules/dcc/pages/Dashboard/Dashboard';
import DarList from '../../modules/dcc/pages/DarWorkflow/DarList';
import DarNewForm from '../../modules/dcc/pages/DarWorkflow/DarNewForm';
import DarRevisionForm from '../../modules/dcc/pages/DarWorkflow/DarRevisionForm';
import DarObsoleteForm from '../../modules/dcc/pages/DarWorkflow/DarObsoleteForm';
import { normalizeDraftToFormState } from '../../modules/dcc/utils/draftNormalizer';
import { AliasRedirect } from '../App';

describe('DAR Draft Display, Layout Anti-Collision, and Form Hydration Tests', () => {
  const mockUser = {
    id: 'U002',
    name: 'ธนาวุฒิ สมควรกิจดำรง',
    department: 'QA',
    dept: 'QA',
    role: 'DCC_STAFF',
    level: 3
  };

  const sampleDraft = {
    id: 'draft_1725600000_xyz789',
    darNumber: null,
    darNo: null,
    dar_no: null,
    type: 'NEW',
    status: 'DRAFT',
    isDraft: true,
    requesterId: 'U002',
    requester_id: 'U002',
    title: 'คู่มือการควบคุมคุณภาพกระบวนการผลิตขั้นสูงและมาตรฐานการทดสอบทางห้องปฏิบัติการ',
    docType: 'WI',
    department: 'QA',
    date: '2026-09-06',
    effectiveDate: '2026-10-15T00:00:00.000Z',
    requestDetail: 'ทดสอบการบันทึกและโหลดข้อมูลแบบร่างข้ามหน้าจอ',
    requestReason: 'PROCESS_IMPROVEMENT',
    access_control: {
      scope: 'DEPT_ONLY',
      authorized_depts: ['QA', 'PD'],
      authorized_users: ['U002'],
      min_access_level: 3
    },
    distributions: [
      { departmentId: 'QA', isForm: false, copies: 1 },
      { departmentId: 'PD', isForm: false, copies: 2 }
    ],
    distributedDepartments: ['QA', 'PD'],
    formDistributionMode: 'SPECIFIC_DEPTS'
  };

  const sampleCompletedDar = {
    id: 'DAR-2026-001',
    darNumber: 'DAR-2026-001',
    type: 'NEW',
    status: 'COMPLETED',
    isDraft: false,
    requesterId: 'U002',
    requester_id: 'U002',
    title: 'ระเบียบปฏิบัติงานทั่วไป',
    department: 'QA',
    date: '2026-09-01'
  };

  beforeEach(() => {
    useStore.setState({
      currentUser: mockUser,
      dars: [sampleDraft, sampleCompletedDar],
      darRequests: [sampleDraft, sampleCompletedDar],
      myTasks: [],
      documents: [
        {
          id: 'DOC-QA-001',
          title: 'SOP-QA-001',
          name: 'ระเบียบปฏิบัติการควบคุมเอกสาร',
          department: 'QA',
          status: 'EFFECTIVE',
          revision: '00',
          rev: '00'
        }
      ],
      masterDepartments: [
        { id: 'QA', code: 'QA', name: 'ฝ่ายประกันคุณภาพ', status: 'ACTIVE' },
        { id: 'PD', code: 'PD', name: 'ฝ่ายผลิต', status: 'ACTIVE' }
      ],
      documentTypes: [
        { id: 'WI', code: 'WI', name: 'Work Instruction', allowDar: true, status: 'ACTIVE' },
        { id: 'SOP', code: 'SOP', name: 'Standard Operating Procedure', allowDar: true, status: 'ACTIVE' }
      ]
    });
  });

  describe('1. UI Display & Anti-Leak: Dashboard & DarList', () => {
    it('renders "ฉบับร่าง (Draft)" badge and hides technical id in Dashboard', () => {
      render(
        <MemoryRouter initialEntries={['/dashboard']}>
          <Dashboard />
        </MemoryRouter>
      );

      // Verify draft badge is present
      const draftBadges = screen.getAllByText('ฉบับร่าง (Draft)');
      expect(draftBadges.length).toBeGreaterThanOrEqual(1);

      // Verify the technical draft ID string is NOT present on the screen
      expect(screen.queryByText('draft_1725600000_xyz789')).not.toBeInTheDocument();

      // Verify completed DAR displays official DAR number
      expect(screen.getByText('DAR-26-001')).toBeInTheDocument();
    });

    it('renders "ฉบับร่าง (Draft)" badge and hides technical id in DarList', () => {
      render(
        <MemoryRouter initialEntries={['/dar/list']}>
          <DarList />
        </MemoryRouter>
      );

      // Verify draft badge is present
      const draftBadges = screen.getAllByText('ฉบับร่าง (Draft)');
      expect(draftBadges.length).toBeGreaterThanOrEqual(1);

      // Verify the technical draft ID string is NOT present on the screen
      expect(screen.queryByText('draft_1725600000_xyz789')).not.toBeInTheDocument();

      // Verify completed DAR displays official DAR number
      expect(screen.getByText('DAR-26-001')).toBeInTheDocument();
    });

    it('prevents table column collision with min-width and scrollable container in Dashboard & DarList', () => {
      const { container: dashContainer } = render(
        <MemoryRouter initialEntries={['/dashboard']}>
          <Dashboard />
        </MemoryRouter>
      );

      const dashTable = dashContainer.querySelector('table');
      expect(dashTable).toBeInTheDocument();
      expect(dashTable.className).toContain('min-w-[960px]');
      expect(dashTable.parentElement.className).toContain('overflow-x-auto');

      const { container: listContainer } = render(
        <MemoryRouter initialEntries={['/dar/list']}>
          <DarList />
        </MemoryRouter>
      );

      const listTable = listContainer.querySelector('table');
      expect(listTable).toBeInTheDocument();
      expect(listTable.className).toContain('min-w-[960px]');
      expect(listTable.parentElement.className).toContain('overflow-x-auto');
    });
  });

  describe('2. Draft Normalizer & Deep Field Hydration', () => {
    it('normalizes ISO dates to YYYY-MM-DD for native HTML date input compatibility', () => {
      const normalized = normalizeDraftToFormState(sampleDraft);
      expect(normalized.effectiveDate).toBe('2026-10-15');
      expect(normalized.title).toBe(sampleDraft.title);
      expect(normalized.access_control.scope).toBe('DEPT_ONLY');
      expect(normalized.access_control.authorized_depts).toEqual(['QA', 'PD']);
      expect(normalized.distributions).toHaveLength(2);
    });

    it('safely handles null and undefined values without crashing', () => {
      const emptyDraft = { id: 'draft_empty' };
      const normalized = normalizeDraftToFormState(emptyDraft);

      expect(normalized.id).toBe('draft_empty');
      expect(normalized.effectiveDate).toBe('');
      expect(normalized.access_control.scope).toBe('GENERAL');
      expect(normalized.distributions).toEqual([]);
      expect(normalized.title).toBe('');
    });

    it('hydrates DarNewForm completely from query parameter ?draftId=...', async () => {
      render(
        <MemoryRouter initialEntries={[`/dcc/dar/new/document?draftId=${encodeURIComponent(sampleDraft.id)}`]}>
          <Routes>
            <Route path="/dcc/dar/new/document" element={<DarNewForm />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        // Title input populated
        const titleInput = screen.getByDisplayValue(sampleDraft.title);
        expect(titleInput).toBeInTheDocument();

        // Request Detail input populated
        const detailInput = screen.getByDisplayValue(sampleDraft.requestDetail);
        expect(detailInput).toBeInTheDocument();

        // Effective date input populated in YYYY-MM-DD format
        const dateInput = screen.getByDisplayValue('2026-10-15');
        expect(dateInput).toBeInTheDocument();
      });
    });

    it('hydrates DarRevisionForm completely from query parameter', async () => {
      const revisionDraft = {
        id: 'draft_rev_999',
        type: 'REVISION',
        status: 'DRAFT',
        isDraft: true,
        docId: 'DOC-QA-001',
        title: 'ระเบียบปฏิบัติการควบคุมเอกสาร (ปรับปรุงกระบวนการ)',
        changeSummary: 'ปรับปรุงขั้นตอนการกระจายสำเนาดิจิทัล',
        changeReason: 'PROCESS_IMPROVEMENT',
        effectiveDate: '2026-11-01T00:00:00.000Z'
      };

      useStore.setState({
        dars: [revisionDraft],
        darRequests: [revisionDraft]
      });

      render(
        <MemoryRouter initialEntries={[`/dcc/dar/new/revision?draftId=${revisionDraft.id}`]}>
          <Routes>
            <Route path="/dcc/dar/new/revision" element={<DarRevisionForm />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByDisplayValue('ระเบียบปฏิบัติการควบคุมเอกสาร (ปรับปรุงกระบวนการ)')).toBeInTheDocument();
        expect(screen.getByDisplayValue('ปรับปรุงขั้นตอนการกระจายสำเนาดิจิทัล')).toBeInTheDocument();
        expect(screen.getByDisplayValue('2026-11-01')).toBeInTheDocument();
      });
    });

    it('hydrates DarObsoleteForm completely from query parameter', async () => {
      const obsoleteDraft = {
        id: 'draft_obs_888',
        type: 'OBSOLETE',
        status: 'DRAFT',
        isDraft: true,
        docId: 'DOC-QA-001',
        title: '[ยกเลิก] SOP-QA-001',
        obsoleteReason: 'ABOLISH_PROCESS',
        obsoleteDetail: 'ยกเลิกเนื่องจากเปลี่ยนระบบสารสนเทศใหม่ทั้งหมด',
        recallPlan: 'เรียกคืนสำเนาเอกสารควบคุมทั้งหมดภายใน 7 วันทำการ',
        effectiveDate: '2026-12-31T00:00:00.000Z'
      };

      useStore.setState({
        dars: [obsoleteDraft],
        darRequests: [obsoleteDraft]
      });

      render(
        <MemoryRouter initialEntries={[`/dcc/dar/new/obsolete?draftId=${obsoleteDraft.id}`]}>
          <Routes>
            <Route path="/dcc/dar/new/obsolete" element={<DarObsoleteForm />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByDisplayValue('ยกเลิกเนื่องจากเปลี่ยนระบบสารสนเทศใหม่ทั้งหมด')).toBeInTheDocument();
        expect(screen.getByDisplayValue('เรียกคืนสำเนาเอกสารควบคุมทั้งหมดภายใน 7 วันทำการ')).toBeInTheDocument();
        expect(screen.getByDisplayValue('2026-12-31')).toBeInTheDocument();
      });
    });
  });

  describe('3. In-Place Update & Duplicate Prevention', () => {
    it('updates existing draft in-place without increasing dars array length', () => {
      const { saveDarDraft } = useStore.getState();
      const initialCount = useStore.getState().dars.length;

      // Update existing draft
      saveDarDraft({
        id: sampleDraft.id,
        title: 'หัวข้อเอกสารที่แก้ไขเพิ่มเติมรอบที่ 2',
        requestDetail: 'รายละเอียดที่มีการปรับปรุงใหม่ล่าสุด',
        effectiveDate: '2026-11-20'
      });

      const updatedList = useStore.getState().dars;
      expect(updatedList.length).toBe(initialCount);

      const target = updatedList.find(d => d.id === sampleDraft.id);
      expect(target).toBeDefined();
      expect(target.title).toBe('หัวข้อเอกสารที่แก้ไขเพิ่มเติมรอบที่ 2');
      expect(target.requestDetail).toBe('รายละเอียดที่มีการปรับปรุงใหม่ล่าสุด');
      expect(target.status).toBe('DRAFT');
      expect(target.darNumber).toBeNull();
    });
  });

  describe('4. Routing & Search Params Preservation (AliasRedirect)', () => {
    it('preserves query parameters when navigating through alias redirects', async () => {
      render(
        <MemoryRouter initialEntries={[`/dar/new/document?draftId=${encodeURIComponent(sampleDraft.id)}`]}>
          <Routes>
            <Route path="/dar/new/document" element={<AliasRedirect to="/dcc/dar/new/document" />} />
            <Route path="/dcc/dar/new/document" element={<DarNewForm />} />
          </Routes>
        </MemoryRouter>
      );

      // Verify that AliasRedirect successfully forwarded ?draftId=... to /dcc/dar/new/document
      // and DarNewForm hydrated with the draft data
      await waitFor(() => {
        expect(screen.getByDisplayValue(sampleDraft.title)).toBeInTheDocument();
      });
    });
  });
});
