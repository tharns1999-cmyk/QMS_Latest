import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import useStore from '../../../store/useStore';
import DarNewForm from '../pages/DarWorkflow/DarNewForm';
import DarRevisionForm from '../pages/DarWorkflow/DarRevisionForm';
import DarObsoleteForm from '../pages/DarWorkflow/DarObsoleteForm';
import { normalizeDraftToFormState } from '../utils/draftNormalizer';

describe('Enterprise Architecture: Universal Draft State Persistence & Deep Form Hydration Tests', () => {
  beforeEach(() => {
    useStore.setState({
      currentUser: {
        id: 'U002',
        name: 'ธนาวุฒิ สมควรกิจดำรง',
        department: 'QA',
        role: 'DEPT_ADMIN'
      },
      dars: [],
      darRequests: [],
      documents: [
        {
          id: 'DOC-QA-001',
          title: 'SOP-QA-001',
          name: 'ระเบียบปฏิบัติการควบคุมเอกสาร',
          department: 'QA',
          status: 'EFFECTIVE',
          revision: '00',
          rev: '00',
          controlledCopy: 2
        }
      ],
      controlledCopyInstances: [
        { id: 'cc-1', doc_id: 'DOC-QA-001', doc_code: 'SOP-QA-001', status: 'ISSUED_ACTIVE', holder_dept: 'QA', copy_number: 'Copy 01' }
      ],
      masterDepartments: [
        { id: 'QA', code: 'QA', name: 'ฝ่ายประกันคุณภาพ', nameTh: 'ฝ่ายประกันคุณภาพ', status: 'ACTIVE' },
        { id: 'PD', code: 'PD', name: 'ฝ่ายผลิต', nameTh: 'ฝ่ายผลิต', status: 'ACTIVE' }
      ]
    });
  });

  describe('1. Universal Field Normalizer (camelCase ↔ snake_case Mapping)', () => {
    it('accurately normalizes raw snake_case API/Store draft to complete form state', () => {
      const rawDraft = {
        id: 'DAR-DRAFT-999',
        dar_no: 'DAR-DRAFT-999',
        dar_type: 'NEW',
        document_code: 'SOP-QA-999',
        document_title: 'ระเบียบปฏิบัติงานตรวจสอบคุณภาพขั้นสูง',
        doc_type: 'SOP',
        owner_dept: 'QA',
        iso_standard: 'ISO 9001:2015',
        effective_date: '2026-09-01',
        access_scope: 'DEPT_ONLY',
        distributed_departments: ['QA'],
        reason_category: 'PERIODIC_REVIEW',
        reason_details: 'ปรับปรุงกระบวนการตรวจสอบคุณภาพตามแผนประจำปี',
        require_ack: true,
        ack_user_id: 'U003'
      };

      const hydrated = normalizeDraftToFormState(rawDraft);

      expect(hydrated.id).toBe('DAR-DRAFT-999');
      expect(hydrated.docCode).toBe('SOP-QA-999');
      expect(hydrated.title).toBe('ระเบียบปฏิบัติงานตรวจสอบคุณภาพขั้นสูง');
      expect(hydrated.docType).toBe('SOP');
      expect(hydrated.department).toBe('QA');
      expect(hydrated.accessScope).toBe('DEPT_ONLY');
      expect(hydrated.access_control.scope).toBe('DEPT_ONLY');
      expect(hydrated.distributedDepartments).toEqual(['QA']);
      expect(hydrated.requestDetail).toBe('ปรับปรุงกระบวนการตรวจสอบคุณภาพตามแผนประจำปี');
      expect(hydrated.requestReason).toBe('PERIODIC_REVIEW');
      expect(hydrated.requireAck).toBe(true);
      expect(hydrated.ackRequirement).toBe('REQUIRED');
      expect(hydrated.ackUserId).toBe('U003');
      expect(hydrated.isDraft).toBe(true);
    });
  });

  describe('2. Deep Draft Save & In-Place Persistence in Store', () => {
    it('saves new draft to store with complete nested payload serialization', () => {
      const { saveDarDraft } = useStore.getState();

      const draftPayload = {
        id: 'DRAFT-NEW-001',
        type: 'NEW',
        title: 'แบบฟอร์มตรวจสอบวัตถุดิบนำเข้า',
        docType: 'FM',
        docCode: 'FM-QA-05',
        department: 'QA',
        access_control: {
          scope: 'DEPT_ONLY',
          authorized_depts: ['QA']
        },
        distributions: [
          { departmentId: 'QA', isForm: true }
        ],
        requestDetail: 'สร้างแบบฟอร์มใหม่เพื่อใช้ในการบันทึกการรับวัตถุดิบ',
        requestReason: 'PROCESS_IMPROVEMENT'
      };

      saveDarDraft(draftPayload);

      const state = useStore.getState();
      const saved = state.dars.find(d => d.id === 'DRAFT-NEW-001');

      expect(saved).toBeDefined();
      expect(saved.status).toBe('DRAFT');
      expect(saved.title).toBe('แบบฟอร์มตรวจสอบวัตถุดิบนำเข้า');
      expect(saved.access_control.scope).toBe('DEPT_ONLY');
      expect(saved.distributions).toHaveLength(1);
      expect(saved.requestDetail).toBe('สร้างแบบฟอร์มใหม่เพื่อใช้ในการบันทึกการรับวัตถุดิบ');
    });

    it('updates existing draft in-place without generating duplicates', () => {
      const { saveDarDraft } = useStore.getState();

      // Initial save
      saveDarDraft({
        id: 'DRAFT-UPDATE-001',
        title: 'ชื่อเดิมก่อนแก้ไข',
        docType: 'SOP',
        requestDetail: 'รายละเอียดเดิม'
      });

      expect(useStore.getState().dars).toHaveLength(1);

      // In-place update
      saveDarDraft({
        id: 'DRAFT-UPDATE-001',
        title: 'ชื่อใหม่หลังแก้ไขฉบับสมบูรณ์',
        docType: 'SOP',
        requestDetail: 'ปรับปรุงรายละเอียดเพิ่มเติม'
      });

      const dars = useStore.getState().dars;
      expect(dars).toHaveLength(1);
      expect(dars[0].title).toBe('ชื่อใหม่หลังแก้ไขฉบับสมบูรณ์');
      expect(dars[0].requestDetail).toBe('ปรับปรุงรายละเอียดเพิ่มเติม');
    });
  });

  describe('3. Form Component Hydration Lifecycle', () => {
    it('hydrates DarNewForm fields seamlessly when reopened with targetDraftId', async () => {
      // Seed store with a draft
      useStore.setState({
        dars: [
          {
            id: 'DRAFT-HYDRATE-001',
            type: 'NEW',
            status: 'DRAFT',
            title: 'คู่มือการปฏิบัติงานตรวจนับสินค้า',
            docType: 'WI',
            docIdInput: 'WI-QA-01',
            requestDetail: 'รายละเอียดคำร้องสร้างเอกสารใหม่สำหรับงานคลังสินค้า',
            requestReason: 'NEW_PROCESS',
            ackRequirement: 'NOT_REQUIRED',
            access_control: {
              scope: 'GENERAL',
              authorized_depts: []
            },
            distributions: []
          }
        ]
      });

      render(
        <MemoryRouter initialEntries={['/dar/new/create?draftId=DRAFT-HYDRATE-001']}>
          <Routes>
            <Route path="/dar/new/create" element={<DarNewForm />} />
          </Routes>
        </MemoryRouter>
      );

      // Verify that the form inputs are populated with draft values
      await waitFor(() => {
        expect(screen.getByDisplayValue('คู่มือการปฏิบัติงานตรวจนับสินค้า')).toBeInTheDocument();
        expect(screen.getByDisplayValue('รายละเอียดคำร้องสร้างเอกสารใหม่สำหรับงานคลังสินค้า')).toBeInTheDocument();
      });
    });

    it('hydrates DarRevisionForm fields seamlessly when reopened with targetDraftId', async () => {
      useStore.setState({
        dars: [
          {
            id: 'DRAFT-REV-001',
            type: 'REVISION',
            status: 'DRAFT',
            title: 'ระเบียบปฏิบัติการควบคุมเอกสาร',
            docIdRef: 'DOC-QA-001',
            changeSummary: 'แก้ไขขั้นตอนการอนุมัติเอกสารฉบับดิจิทัล',
            changeReason: 'CHANGE_LAW_REGULATION',
            ackRequirement: 'NOT_REQUIRED',
            access_control: {
              scope: 'GENERAL',
              authorized_depts: []
            },
            distributions: []
          }
        ]
      });

      render(
        <MemoryRouter initialEntries={['/dar/revision/create?draftId=DRAFT-REV-001']}>
          <Routes>
            <Route path="/dar/revision/create" element={<DarRevisionForm />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByDisplayValue('แก้ไขขั้นตอนการอนุมัติเอกสารฉบับดิจิทัล')).toBeInTheDocument();
      });
    });

    it('hydrates DarObsoleteForm fields seamlessly when reopened with targetDraftId', async () => {
      useStore.setState({
        dars: [
          {
            id: 'DRAFT-OBS-001',
            type: 'OBSOLETE',
            status: 'DRAFT',
            title: '[OBSOLETE] SOP-QA-001',
            docIdRef: 'DOC-QA-001',
            obsoleteReason: 'ABOLISH_PROCESS',
            obsoleteDetail: 'ขอยกเลิกเนื่องจากยุบเลิกสายการผลิตเดิม',
            recallPlan: 'เรียกคืนสำเนาควบคุมทั้งหมดภายใน 3 วันทำการ',
            ackRequirement: 'NOT_REQUIRED'
          }
        ]
      });

      render(
        <MemoryRouter initialEntries={['/dar/obsolete/create?draftId=DRAFT-OBS-001']}>
          <Routes>
            <Route path="/dar/obsolete/create" element={<DarObsoleteForm />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByDisplayValue('ขอยกเลิกเนื่องจากยุบเลิกสายการผลิตเดิม')).toBeInTheDocument();
        expect(screen.getByDisplayValue('เรียกคืนสำเนาควบคุมทั้งหมดภายใน 3 วันทำการ')).toBeInTheDocument();
      });
    });
  });
});
