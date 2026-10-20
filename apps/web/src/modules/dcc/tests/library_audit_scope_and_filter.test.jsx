/**
 * @file library_audit_scope_and_filter.test.jsx
 * @description Unit and Integration tests for:
 *   1. Department Owner Audit Access (ISO 9001 audit trail for departmental historical records)
 *   2. Global View & DCC Access across all document statuses
 *   3. Status Normalization & Empty-State Prevention (ACTIVE ↔ EFFECTIVE, SUPERSEDED_ARCHIVED ↔ SUPERSEDED, OBSOLETE_PENDING_RECALL ↔ OBSOLETE)
 *   4. DarObsoleteForm.jsx copy synchronization (no conflicting "ไม่พบสำเนา" text)
 */
import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Library from '../pages/Library/Library';
import DarObsoleteForm from '../pages/DarWorkflow/DarObsoleteForm';
import useStore from '../../../store/useStore';
import { ACCESS_SCOPES } from '../utils/accessControl';

describe('Library Universal Audit Scope, Status Normalization & Obsolete Form Sync Tests', () => {

  const pdUser = {
    id: 'U-PD-001',
    name: 'สมชาย ผลิตดี (PD Manager)',
    department: 'PD',
    depts: ['PD'],
    role: 'DEPT_ADMIN',
    level: 4,
    isDcc: false
  };

  const dccUser = {
    id: 'U-DCC-001',
    name: 'กัลยาณี พลไกร (DCC Admin)',
    department: 'QA',
    depts: ['QA'],
    role: 'DCC_ADMIN',
    level: 5,
    isDcc: true
  };

  const testDocuments = [
    // 1. PD Active (status: 'ACTIVE' to test status normalization with EFFECTIVE)
    {
      id: 'doc-pd-active',
      title: 'SOP-PD-001',
      name: 'ขั้นตอนการผสมวัตถุดิบ (Active)',
      status: 'ACTIVE',
      department: 'PD',
      owner_dept: 'PD',
      rev: '02',
      effectiveDate: '2026-01-01',
      access_control: { scope: ACCESS_SCOPES.DEPT_ONLY },
      controlledCopy: 2
    },
    // 2. PD Superseded (status: 'SUPERSEDED_ARCHIVED')
    {
      id: 'doc-pd-super',
      title: 'SOP-PD-001-OLD',
      name: 'ขั้นตอนการผสมวัตถุดิบ (Superseded Rev.01)',
      status: 'SUPERSEDED_ARCHIVED',
      department: 'PD',
      owner_dept: 'PD',
      rev: '01',
      effectiveDate: '2024-01-01',
      access_control: { scope: ACCESS_SCOPES.DEPT_ONLY },
      controlledCopy: 0
    },
    // 3. PD Obsolete (status: 'OBSOLETE')
    {
      id: 'doc-pd-obs',
      title: 'WI-PD-999',
      name: 'คู่มือเครื่องจักรแบบเก่าที่ยกเลิกแล้ว',
      status: 'OBSOLETE',
      department: 'PD',
      owner_dept: 'PD',
      rev: '01',
      effectiveDate: '2023-01-01',
      access_control: { scope: ACCESS_SCOPES.DEPT_ONLY },
      controlledCopy: 0
    },
    // 4. QA Active (status: 'EFFECTIVE')
    {
      id: 'doc-qa-eff',
      title: 'SOP-QA-001',
      name: 'การตรวจประเมินคุณภาพ',
      status: 'EFFECTIVE',
      department: 'QA',
      owner_dept: 'QA',
      rev: '03',
      effectiveDate: '2026-02-01',
      access_control: { scope: ACCESS_SCOPES.GENERAL },
      controlledCopy: 1
    }
  ];

  const testCopies = [
    {
      id: 'cc-pd-01',
      docId: 'doc-pd-active',
      doc_id: 'doc-pd-active',
      doc_code: 'SOP-PD-001',
      copy_no: '01',
      holder_dept: 'PD',
      status: 'ISSUED_ACTIVE',
      location: 'Mixing Room'
    },
    {
      id: 'cc-pd-02',
      docId: 'doc-pd-active',
      doc_id: 'doc-pd-active',
      doc_code: 'SOP-PD-001',
      copy_no: '02',
      holder_dept: 'PD',
      status: 'ISSUED_ACTIVE',
      location: 'Packaging Room'
    }
  ];

  beforeEach(() => {
    useStore.setState({
      currentUser: pdUser,
      documents: testDocuments,
      controlledCopyInstances: testCopies,
      documentControlledCopies: testCopies,
      masterDepartments: [
        { id: 'PD', name: 'Production', nameTh: 'ฝ่ายผลิต' },
        { id: 'QA', name: 'Quality Assurance', nameTh: 'ประกันคุณภาพ' }
      ]
    });
  });

  /* ── 1. Department Owner Audit Access & Status Normalization ── */
  describe('1. Department Owner Audit Access & Status Normalization', () => {
    it('shows status switcher tabs (Active, Superseded, Obsolete) to non-DCC department users and excludes All Records', () => {
      render(
        <MemoryRouter>
          <Library />
        </MemoryRouter>
      );

      // Status switcher tabs must be visible for all users
      expect(screen.getByRole('button', { name: /มีผลบังคับใช้/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /ฉบับเดิมตกรุ่น/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /ยกเลิกการใช้งาน/i })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /ทั้งหมด \(All Records\)/i })).not.toBeInTheDocument();
    });

    it('normalizes status = "ACTIVE" to match "EFFECTIVE" tab so no 0-result empty state occurs', () => {
      render(
        <MemoryRouter>
          <Library />
        </MemoryRouter>
      );

      // Switch to "เอกสารในแผนกฉัน"
      const myDeptBtn = screen.getByRole('button', { name: /เอกสารในแผนกฉัน/i });
      fireEvent.click(myDeptBtn);

      // SOP-PD-001 with status="ACTIVE" must be displayed under default EFFECTIVE tab
      expect(screen.getByText('SOP-PD-001')).toBeInTheDocument();
      expect(screen.getByText(/ขั้นตอนการผสมวัตถุดิบ \(Active\)/i)).toBeInTheDocument();
      expect(screen.getAllByText(/มีผลบังคับใช้/i).length).toBeGreaterThan(0);
    });

    it('allows PD User to switch to "SUPERSEDED" tab and view historical superseded records for audit', () => {
      render(
        <MemoryRouter>
          <Library />
        </MemoryRouter>
      );

      // Switch to "เอกสารในแผนกฉัน"
      fireEvent.click(screen.getByRole('button', { name: /เอกสารในแผนกฉัน/i }));

      // Click "ฉบับเดิมตกรุ่น (Superseded)" tab
      fireEvent.click(screen.getByRole('button', { name: /ฉบับเดิมตกรุ่น/i }));

      // Should display SOP-PD-001-OLD (SUPERSEDED_ARCHIVED)
      expect(screen.getByText('SOP-PD-001-OLD')).toBeInTheDocument();
      expect(screen.getAllByText(/ฉบับตกรุ่น/i).length).toBeGreaterThan(0);

      // Should NOT display active doc under Superseded filter
      expect(screen.queryByText('SOP-PD-001')).not.toBeInTheDocument();
    });

    it('allows PD User to switch to "OBSOLETE" tab and view obsolete records of their department', () => {
      render(
        <MemoryRouter>
          <Library />
        </MemoryRouter>
      );

      // Switch to "เอกสารในแผนกฉัน"
      fireEvent.click(screen.getByRole('button', { name: /เอกสารในแผนกฉัน/i }));

      // Click "ยกเลิกการใช้งาน (Obsolete)" tab
      fireEvent.click(screen.getByRole('button', { name: /ยกเลิกการใช้งาน/i }));

      // Should display WI-PD-999 (OBSOLETE)
      expect(screen.getByText('WI-PD-999')).toBeInTheDocument();
      expect(screen.getByText('ยกเลิกถาวร')).toBeInTheDocument();
    });
  });

  /* ── 2. DCC Global Access ── */
  describe('2. DCC Global View & Multi-Status Filtering', () => {
    beforeEach(() => {
      useStore.setState({ currentUser: dccUser });
    });

    it('allows DCC to view records across statuses using dedicated status tabs without All Records tab', () => {
      render(
        <MemoryRouter>
          <Library />
        </MemoryRouter>
      );

      // Verify "ทั้งหมด (All Records)" tab is NOT rendered
      expect(screen.queryByRole('button', { name: /ทั้งหมด \(All Records\)/i })).not.toBeInTheDocument();

      // Active records should be visible by default for QA
      expect(screen.getByText('SOP-QA-001')).toBeInTheDocument();
    });
  });

  /* ── 3. DarObsoleteForm Recall Plan Synchronization ── */
  describe('3. DarObsoleteForm Recall Plan Synchronization', () => {
    it('shows automated DCC recall notification and does NOT show conflicting "ไม่พบสำเนา" text when copies exist', () => {
      useStore.setState({
        currentUser: pdUser,
        documents: [
          {
            id: 'doc-pd-01',
            title: 'SOP-PD-001',
            name: 'ขั้นตอนการผสมวัตถุดิบ',
            status: 'EFFECTIVE',
            department: 'PD',
            controlledCopy: 2,
            rev: '01'
          }
        ]
      });

      render(
        <MemoryRouter>
          <DarObsoleteForm />
        </MemoryRouter>
      );

      // Select the document with 2 active controlled copies
      const docSelect = screen.getByDisplayValue('-- เลือกเอกสารที่ต้องการยกเลิก --');
      fireEvent.change(docSelect, { target: { value: 'doc-pd-01' } });

      // Notice controlled copy warning in Section 2
      expect(screen.getAllByText(/2 ฉบับ/i).length).toBeGreaterThan(0);

      // In Section 3, verify automated DCC recall notification is shown
      expect(screen.getByText(/ระบบจะสร้าง Task เรียกคืนสำเนา 2 ชุดนี้ให้ DCC อัตโนมัติ/i)).toBeInTheDocument();

      // Crucial: Ensure the conflicting "ไม่พบสำเนาควบคุม..." text is NOT rendered!
      expect(screen.queryByText(/ไม่พบสำเนาควบคุมที่แจกจ่ายในระบบ จึงไม่ต้องระบุแผนเรียกคืน/i)).toBeNull();
      expect(screen.queryByText(/ไม่พบสำเนาควบคุมกระดาษในระบบ/i)).toBeNull();
    });
  });

});
