import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { BrowserRouter } from 'react-router-dom';
import useStore from '../../../store/useStore';
import { hasDocumentAccess, ACCESS_SCOPES } from '../utils/accessControl';
import Library from '../pages/Library/Library';

describe('Document Confidentiality & Access Scope RBAC', () => {
  const dccAdminUser = {
    id: 'U001',
    name: 'Admin QA (DCC)',
    role: 'DCC_ADMIN',
    isDcc: true,
    department: 'QA',
    depts: ['QA'],
    level: 1
  };

  const pdSupervisorUser = {
    id: 'U002',
    name: 'ธนาวุฒิ สมควรกิจดำรง',
    role: 'DEPT_ADMIN',
    isDcc: false,
    department: 'PD',
    depts: ['PD'],
    level: 4
  };

  const mktStaffUser = {
    id: 'U010',
    name: 'สมชาย การตลาด',
    role: 'GENERAL_USER',
    isDcc: false,
    department: 'MKT',
    depts: ['MKT'],
    level: 3
  };

  const directorUser = {
    id: 'U008',
    name: 'คุณกิต',
    role: 'DEPT_ADMIN',
    isDcc: false,
    department: 'FIN',
    depts: ['FIN'],
    level: 7
  };

  describe('1. hasDocumentAccess Unit Tests', () => {
    it('allows DCC Admin to access any document regardless of scope', () => {
      const generalDoc = { id: 'd1', access_control: { scope: ACCESS_SCOPES.GENERAL } };
      const deptOnlyDoc = { id: 'd2', department: 'PD', access_control: { scope: ACCESS_SCOPES.DEPT_ONLY } };
      const targetedDoc = { id: 'd3', department: 'WH', access_control: { scope: ACCESS_SCOPES.TARGETED, authorized_depts: ['WH'] } };
      const restrictedDoc = { id: 'd4', department: 'PD', access_control: { scope: ACCESS_SCOPES.RESTRICTED, authorized_users: ['U009'], min_access_level: 8 } };

      expect(hasDocumentAccess(generalDoc, dccAdminUser)).toBe(true);
      expect(hasDocumentAccess(deptOnlyDoc, dccAdminUser)).toBe(true);
      expect(hasDocumentAccess(targetedDoc, dccAdminUser)).toBe(true);
      expect(hasDocumentAccess(restrictedDoc, dccAdminUser)).toBe(true);
    });

    it('handles GENERAL scope: accessible to all authenticated users', () => {
      const generalDoc = { id: 'd1', department: 'QA', access_control: { scope: ACCESS_SCOPES.GENERAL } };
      expect(hasDocumentAccess(generalDoc, pdSupervisorUser)).toBe(true);
      expect(hasDocumentAccess(generalDoc, mktStaffUser)).toBe(true);
      expect(hasDocumentAccess(generalDoc, directorUser)).toBe(true);
    });

    it('handles DEPT_ONLY scope: accessible strictly to owner department members', () => {
      const deptDoc = { id: 'd2', department: 'PD', access_control: { scope: ACCESS_SCOPES.DEPT_ONLY } };
      expect(hasDocumentAccess(deptDoc, pdSupervisorUser)).toBe(true); // User is PD
      expect(hasDocumentAccess(deptDoc, mktStaffUser)).toBe(false); // User is MKT
      expect(hasDocumentAccess(deptDoc, directorUser)).toBe(false); // User is FIN
    });

    it('handles TARGETED scope: accessible to owner and specifically authorized departments', () => {
      const targetedDoc = {
        id: 'd3',
        department: 'WH',
        access_control: {
          scope: ACCESS_SCOPES.TARGETED,
          authorized_depts: ['WH', 'PD']
        }
      };

      expect(hasDocumentAccess(targetedDoc, pdSupervisorUser)).toBe(true); // PD is authorized
      expect(hasDocumentAccess(targetedDoc, mktStaffUser)).toBe(false); // MKT not authorized
    });

    it('handles RESTRICTED scope: checks authorized_users or min_access_level', () => {
      const restrictedDoc = {
        id: 'd4',
        department: 'PD',
        access_control: {
          scope: ACCESS_SCOPES.RESTRICTED,
          authorized_users: ['U010'], // MKT Staff specifically allowed
          min_access_level: 6 // Level 6+ also allowed
        }
      };

      expect(hasDocumentAccess(restrictedDoc, mktStaffUser)).toBe(true); // Explicitly named (U010)
      expect(hasDocumentAccess(restrictedDoc, directorUser)).toBe(true); // Level 7 >= 6
      expect(hasDocumentAccess(restrictedDoc, pdSupervisorUser)).toBe(false); // Level 4 < 6 and not named
    });

    it('RESTRICTED WHITELIST mode: stored min level does not widen access beyond named users', () => {
      const whitelistDoc = {
        id: 'd5',
        department: 'PD',
        access_control: { scope: ACCESS_SCOPES.RESTRICTED, restricted_mode: 'WHITELIST', authorized_users: ['U010'], min_access_level: 4 }
      };

      expect(hasDocumentAccess(whitelistDoc, mktStaffUser)).toBe(true); // named
      expect(hasDocumentAccess(whitelistDoc, directorUser)).toBe(false); // L7 but not named
      expect(hasDocumentAccess(whitelistDoc, pdSupervisorUser)).toBe(false); // L4 but not named
    });
  });

  describe('2. Library Invisible Filtering Integration', () => {
    beforeEach(() => {
      useStore.setState({
        currentUser: mktStaffUser, // MKT Level 3
        documents: [
          {
            id: 'doc-mkt-1',
            title: 'SOP-MKT-001',
            name: 'ระเบียบการจัดทำใบเสนอราคาการตลาด',
            status: 'EFFECTIVE',
            department: 'MKT',
            rev: '01',
            effectiveDate: '2026-01-01',
            access_control: { scope: ACCESS_SCOPES.GENERAL }
          },
          {
            id: 'doc-dept-1',
            title: 'WI-PD-999',
            name: 'สูตรผสมลับเฉพาะฝ่ายผลิต',
            status: 'EFFECTIVE',
            department: 'PD',
            rev: '01',
            effectiveDate: '2026-01-01',
            access_control: { scope: ACCESS_SCOPES.DEPT_ONLY }
          },
          {
            id: 'doc-rest-1',
            title: 'POL-EXEC-001',
            name: 'นโยบายโบนัสผู้บริหาร',
            status: 'EFFECTIVE',
            department: 'EXEC',
            rev: '01',
            effectiveDate: '2026-01-01',
            access_control: { scope: ACCESS_SCOPES.RESTRICTED, min_access_level: 6 }
          }
        ]
      });
    });

    it('renders only documents accessible to the active user (zero visibility of hidden docs)', () => {
      render(
        <BrowserRouter>
          <Library />
        </BrowserRouter>
      );

      // MKT user should see their own GENERAL doc in "เอกสารในแผนกฉัน"
      expect(screen.getByText('SOP-MKT-001')).toBeInTheDocument();
      expect(screen.getByText('ระเบียบการจัดทำใบเสนอราคาการตลาด')).toBeInTheDocument();

      // MKT user MUST NOT see DEPT_ONLY doc of PD or RESTRICTED doc of EXEC
      expect(screen.queryByText('WI-PD-999')).not.toBeInTheDocument();
      expect(screen.queryByText('สูตรผสมลับเฉพาะฝ่ายผลิต')).not.toBeInTheDocument();
      expect(screen.queryByText('POL-EXEC-001')).not.toBeInTheDocument();
      expect(screen.queryByText('นโยบายโบนัสผู้บริหาร')).not.toBeInTheDocument();
    });

    it('allows DCC Admin to view all documents across all tiers in Global View', () => {
      useStore.setState({ currentUser: dccAdminUser });

      render(
        <BrowserRouter>
          <Library />
        </BrowserRouter>
      );

      // DCC opens on "ทุกแผนก": every dept's doc of every access scope, in one list
      expect(screen.getByText('WI-PD-999')).toBeInTheDocument();
      expect(screen.getByText('POL-EXEC-001')).toBeInTheDocument();
      expect(screen.getByText('SOP-MKT-001')).toBeInTheDocument();
      // "ในแผนกฉัน" means the DCC's own department again, not other depts' documents
      fireEvent.click(screen.getByRole('button', { name: 'เอกสารในแผนกฉัน' }));
      expect(screen.queryByText('WI-PD-999')).not.toBeInTheDocument();
    });
  });
});
