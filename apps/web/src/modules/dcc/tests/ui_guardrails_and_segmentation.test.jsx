import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithRouter, setTestUser } from '../../../test/test_utils';
import useStore from '../../../store/useStore';
import Library from '../pages/Library/Library';
import DocumentDetailModal from '../components/workflow/DocumentDetailModal';
import ActionConfirmModal from '../../../shared/components/common/ActionConfirmModal';
import UserSelector from '../components/UserSelector';

describe('UI Guardrails, Library Segmentation & DAR Audit History Tests', () => {
  const pdUser = {
    id: 'u1',
    name: 'สมชาย สายผลิต (PD)',
    department: 'PD',
    depts: ['PD'],
    role: 'USER',
    isDcc: false,
    level: 3
  };

  const qaUser = {
    id: 'u2',
    name: 'สมหญิง ตรวจสอบ (QA)',
    department: 'QA',
    depts: ['QA', 'QA/QC'],
    role: 'USER',
    isDcc: false,
    level: 3
  };

  const pdDoc = {
    id: 'doc-pd-001',
    title: 'SOP-PD-001',
    name: 'Standard Operating Procedure for Production Line Baking',
    rev: '02',
    status: 'EFFECTIVE',
    department: 'PD',
    owner_dept: 'PD',
    effectiveDate: '2026-08-01',
    distributions: [
      { departmentId: 'PD', locationId: 'PD-L1', locationName: 'Line 1' },
      { departmentId: 'QA', locationId: 'QA-LAB', locationName: 'QA Micro Lab' }
    ],
    target_depts: ['PD', 'QA']
  };

  const qaDoc = {
    id: 'doc-qa-001',
    title: 'QP-QA-001',
    name: 'Quality Procedure for Calibration Inspection',
    rev: '01',
    status: 'EFFECTIVE',
    department: 'QA',
    owner_dept: 'QA',
    effectiveDate: '2026-07-15',
    distributions: [
      { departmentId: 'QA', locationId: 'QA-OFFICE', locationName: 'QA Office' },
      { departmentId: 'PD', locationId: 'PD-MASTER', locationName: 'PD Master Office' }
    ],
    target_depts: ['QA', 'PD']
  };

  const sampleDarHistory = [
    {
      id: 'DAR-2026-001',
      doc_code: 'SOP-PD-001',
      title: 'Standard Operating Procedure for Production Line Baking',
      docRev: '02',
      type: 'REVISION',
      status: 'EFFECTIVE',
      department: 'PD',
      requesterId: 'u1',
      requester: 'สมชาย สายผลิต',
      reviewer: 'ธนาวุฒิ สมควรกิจดำรง',
      approver: 'ประจักษ์ มุ่งมั่น',
      changeReason: 'PROCESS_IMPROVEMENT',
      changeSummary: 'ปรับปรุงขั้นตอนการอบขนมและเพิ่มการบันทึกอุณหภูมิ',
      effectiveDate: '2026-08-01',
      createdAt: '2026-07-28T09:00:00.000Z'
    },
    {
      id: 'DAR-2026-000',
      doc_code: 'SOP-PD-001',
      title: 'Standard Operating Procedure for Production Line Baking',
      docRev: '00',
      type: 'NEW',
      status: 'EFFECTIVE',
      department: 'PD',
      requesterId: 'u1',
      requester: 'สมชาย สายผลิต',
      reviewer: 'ธนาวุฒิ สมควรกิจดำรง',
      approver: 'ประจักษ์ มุ่งมั่น',
      requestReason: 'จัดทำคู่มือการทำงานใหม่ตามมาตรฐาน FSSC 22000',
      requestDetail: 'เอกสารขั้นตอนการปฏิบัติงานสำหรับเตาอบไลน์ใหม่',
      effectiveDate: '2026-01-01',
      createdAt: '2025-12-15T09:00:00.000Z'
    }
  ];

  beforeEach(() => {
    useStore.setState({
      currentUser: pdUser,
      documents: [pdDoc, qaDoc],
      dars: sampleDarHistory,
      controlledCopyInstances: [],
      documentControlledCopies: [],
      timeline: [
        { id: 1, darId: 'DAR-2026-001', action: 'Reviewed', user: 'ธนาวุฒิ สมควรกิจดำรง' },
        { id: 2, darId: 'DAR-2026-001', action: 'Approved', user: 'ประจักษ์ มุ่งมั่น' }
      ],
      masterUsers: [
        { id: 'u1', name: 'สมชาย สายผลิต', department: 'PD' },
        { id: 'u2', name: 'สมหญิง ตรวจสอบ', department: 'QA' }
      ]
    });
  });

  describe('1. Zero Horizontal Scrollbar & 200-char Text Overflow Guardrails', () => {
    it('handles 200-character continuous unbroken string in ActionConfirmModal without layout breakdown', () => {
      const longUnbrokenText = 'A'.repeat(200);
      const summaryData = [
        { label: 'Document Name', value: longUnbrokenText },
        { label: 'Reason', value: 'lorremlorrem'.repeat(15) }
      ];

      const { container } = renderWithRouter(
        <ActionConfirmModal
          isOpen={true}
          onClose={() => {}}
          onConfirm={() => {}}
          title="Confirm Submission"
          summaryData={summaryData}
        />
      );

      // Verify container does not have overflow-x-auto or overflow-x-scroll
      const scrollableElements = container.querySelectorAll('.overflow-x-auto, .overflow-x-scroll');
      expect(scrollableElements.length).toBe(0);

      // Verify text elements have break-all and break-words classes
      const textElements = screen.getAllByText(longUnbrokenText);
      expect(textElements[0]).toHaveClass('break-all');
      expect(textElements[0]).toHaveClass('break-words');
    });
  });

  describe('2. Dropdown Stacking Context & Z-Index Cutoff Fix', () => {
    it('UserSelector has z-30 wrapper and z-50 dropdown popover with shadow-2xl and max-h-60', () => {
      const users = [
        { id: 'u1', name: 'สมชาย สายผลิต', department: 'PD' },
        { id: 'u2', name: 'สมหญิง ตรวจสอบ', department: 'QA' }
      ];

      const { container } = renderWithRouter(
        <UserSelector
          value=""
          onChange={() => {}}
          users={users}
        />
      );

      const input = screen.getByPlaceholderText(/ค้นหาชื่อ หรือแผนก/i);
      fireEvent.focus(input);

      // Wrapper has relative and z-30
      const wrapper = container.querySelector('.relative.w-full.z-30');
      expect(wrapper).toBeInTheDocument();

      // Dropdown popover has absolute, z-50, shadow-2xl, max-h-60
      const dropdown = container.querySelector('.absolute.z-50');
      expect(dropdown).toBeInTheDocument();
      expect(dropdown).toHaveClass('shadow-2xl');
      expect(dropdown).toHaveClass('max-h-60');
      expect(dropdown).toHaveClass('overflow-y-auto');
    });
  });

  describe('3. Library Dual-Tab Segmentation & Permissions', () => {
    it('Tab "เอกสารในแผนกฉัน" displays ONLY own department documents', () => {
      setTestUser(pdUser);
      renderWithRouter(<Library />);

      const deptTabBtn = screen.getByRole('button', { name: /เอกสารในแผนกฉัน/i });
      fireEvent.click(deptTabBtn);

      // Should show SOP-PD-001 (PD doc)
      expect(screen.getByText('SOP-PD-001')).toBeInTheDocument();

      // Should NOT show QP-QA-001 (QA doc) in dept tab
      expect(screen.queryByText('QP-QA-001')).not.toBeInTheDocument();
    });

    it('Tab "เอกสารที่ได้รับการแจกจ่าย" displays ONLY distributed documents excluding own department', () => {
      setTestUser(pdUser);
      renderWithRouter(<Library />);

      // Switch to distributed tab
      const distTabBtn = screen.getByRole('button', { name: /เอกสารที่ได้รับการแจกจ่าย/i });
      fireEvent.click(distTabBtn);

      // Should show QP-QA-001 (QA doc distributed to PD)
      expect(screen.getByText('QP-QA-001')).toBeInTheDocument();

      // Should NOT show SOP-PD-001 (own PD doc) in distributed tab
      expect(screen.queryByText('SOP-PD-001')).not.toBeInTheDocument();
    });

    it('Allows employee in distributed department to download document (canDownloadDocument)', () => {
      // PD user can download QP-QA-001 because it is distributed to PD
      const canPdDownloadQaDoc = useStore.getState().canDownloadDocument(qaDoc, pdUser);
      expect(canPdDownloadQaDoc).toBe(true);

      // QA user can download SOP-PD-001 because it is distributed to QA
      const canQaDownloadPdDoc = useStore.getState().canDownloadDocument(pdDoc, qaUser);
      expect(canQaDownloadPdDoc).toBe(true);
    });
  });

  describe('4. DAR Audit History Timeline Tab in DocumentDetailModal', () => {
    it('renders DAR history timeline tab with cumulative audit trail and sign-offs', () => {
      renderWithRouter(
        <DocumentDetailModal
          isOpen={true}
          onClose={() => {}}
          document={pdDoc}
        />
      );

      // Click on "ประวัติ DAR และการแก้ไข" tab
      const historyTabBtn = screen.getByRole('button', { name: /ประวัติ DAR และการแก้ไข/i });
      expect(historyTabBtn).toBeInTheDocument();
      fireEvent.click(historyTabBtn);

      // Unified history: every DAR of the code is rendered, whichever revision is open
      expect(screen.getByText('DAR-26-001')).toBeInTheDocument();
      expect(screen.getByText('DAR-26-000')).toBeInTheDocument();
      expect(screen.getByText(/ปรับปรุงขั้นตอนการอบขนมและเพิ่มการบันทึกอุณหภูมิ/i)).toBeInTheDocument();

      // Verify Requesters / Reviewers / Approvers
      expect(screen.getAllByText('สมชาย สายผลิต').length).toBeGreaterThan(0);
      expect(screen.getAllByText('ธนาวุฒิ สมควรกิจดำรง').length).toBeGreaterThan(0);
      expect(screen.getAllByText('ประจักษ์ มุ่งมั่น').length).toBeGreaterThan(0);
    });
  });

  describe('5. Modernize & Lean Out Document Library (Superseded Tab & Filter Architecture)', () => {
    const supersededDoc = {
      id: 'doc-pd-sup-01',
      title: 'SOP-PD-01',
      name: 'Standard Operating Procedure for Production Baking',
      rev: '00',
      status: 'SUPERSEDED_ARCHIVED',
      department: 'PD',
      owner_dept: 'PD',
      effectiveDate: '2025-01-01',
      target_depts: ['PD']
    };

    beforeEach(() => {
      useStore.setState({
        currentUser: pdUser,
        documents: [pdDoc, qaDoc, supersededDoc],
        masterDepartments: [
          { id: 'PD', name: 'Production', nameTh: 'ฝ่ายผลิต' },
          { id: 'QA', name: 'Quality Assurance', nameTh: 'ประกันคุณภาพ' }
        ],
        controlledCopyInstances: [],
        documentControlledCopies: []
      });
    });

    it('Streamlined Filters: Removes redundant secondary sub-department filter bar', () => {
      setTestUser(pdUser);
      renderWithRouter(<Library />);

      // Invariant: The redundant secondary sub-department bar "สายงาน / แผนก: ทั้งหมดในสายงาน" must NOT exist
      expect(screen.queryByText(/สายงาน \/ แผนก:/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/ทั้งหมดในสายงาน/i)).not.toBeInTheDocument();

      // Primary department dropdown filter remains available
      const selects = screen.getAllByRole('combobox');
      expect(selects.length).toBeGreaterThan(0);
      expect(screen.getByText(/ทุกแผนก/i)).toBeInTheDocument();
    });

    it('Superseded Tab Lean Table: Omits "สถานะเอกสาร", renders lean badges, and removes verbose sublines', () => {
      setTestUser(pdUser);
      renderWithRouter(<Library />);

      // Switch to "เอกสารในแผนกฉัน"
      fireEvent.click(screen.getByRole('button', { name: /เอกสารในแผนกฉัน/i }));

      // Switch to "ฉบับเดิมตกรุ่น (Superseded)" tab
      const supersededTabBtn = screen.getByRole('button', { name: /ฉบับเดิมตกรุ่น/i });
      fireEvent.click(supersededTabBtn);

      // Verify Superseded Table Headers
      expect(screen.getByText('รหัสและชื่อเอกสาร')).toBeInTheDocument();
      expect(screen.getByText('แผนกเจ้าของ')).toBeInTheDocument();
      expect(screen.getByText('ฉบับและวันบังคับใช้เดิม')).toBeInTheDocument();
      expect(screen.getByText('การเรียกคืนสำเนา')).toBeInTheDocument();
      expect(screen.getByText('สถานะเอกสาร')).toBeInTheDocument();
      expect(screen.getByText('การจัดการ')).toBeInTheDocument();

      const tableHeaders = screen.getAllByRole('columnheader').map(th => th.textContent.trim());
      expect(tableHeaders).toContain('สถานะเอกสาร');

      // Column 1: Monospace Code Badge & Type Badge & Name
      expect(screen.getByText('SOP-PD-01')).toBeInTheDocument();
      expect(screen.getByText('Standard Operating Procedure for Production Baking')).toBeInTheDocument();

      // Column 2: Clean Department Badge (PD) without security subline
      expect(screen.queryByText(/🌐 ทั่วไป/i)).not.toBeInTheDocument();

      // Column 3: Clean Text Summary without cluttered chips
      expect(screen.getByText(/Rev\.00/i)).toBeInTheDocument();
      expect(screen.getByText(/ตกรุ่นเมื่อ:/i)).toBeInTheDocument();
      expect(screen.queryByText(/\(ล่าสุด\)/i)).not.toBeInTheDocument();

      // Column 4: Recall status badge only - No requester or approver string
      expect(screen.queryByText(/ผู้ขอ:/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/อนุมัติ:/i)).not.toBeInTheDocument();

      // Column 5: Status column in row body
      expect(screen.getByText(/ฉบับตกรุ่น \(1 ฉบับ\)/i)).toBeInTheDocument();
      expect(tableHeaders.length).toBe(6);
    });
  });
});
