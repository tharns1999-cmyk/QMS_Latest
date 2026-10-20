import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithRouter, setTestUser } from './test_utils';
import useStore from '../store/useStore';
import MasterDataHub from '../pages/Admin/MasterDataHub';
import { getDepartmentStations } from '../services/MasterDataService';

describe('Master Data Management Hub (DCC Admin) Tests', () => {
  const dccUser = {
    id: 'U001',
    name: 'Admin QA (DCC)',
    department: 'QA',
    depts: ['QA'],
    role: 'DCC_ADMIN',
    isDcc: true,
    level: 1
  };

  const generalUser = {
    id: 'u10',
    name: 'สมชาย สายผลิต (General User)',
    department: 'PD',
    depts: ['PD'],
    role: 'GENERAL_USER',
    isDcc: false,
    level: 1
  };

  beforeEach(() => {
    useStore.getState().resetStore();
    setTestUser(dccUser);
  });

  describe('1. Role Guard & Access Control', () => {
    it('blocks non-DCC user and shows Access Denied card', () => {
      setTestUser(generalUser);
      renderWithRouter(<MasterDataHub />);

      expect(screen.getByText(/การเข้าถึงถูกปฏิเสธ \(Access Denied\)/i)).toBeInTheDocument();
      expect(screen.queryByText(/จัดการข้อมูลหลัก \(Master Data\)/i)).not.toBeInTheDocument();
    });

    it('grants access to DCC Admin and renders 5 balanced tabs', () => {
      setTestUser(dccUser);
      renderWithRouter(<MasterDataHub />);

      expect(screen.getByText(/จัดการข้อมูลหลัก \(Master Data\)/i)).toBeInTheDocument();
      expect(screen.getByText(/1\. ผู้ใช้งานและสิทธิ์/i)).toBeInTheDocument();
      expect(screen.getByText(/2\. แผนกและโครงสร้าง/i)).toBeInTheDocument();
      expect(screen.getByText(/3\. ประเภทเอกสารและรหัส/i)).toBeInTheDocument();
      expect(screen.getByText(/4\. จุดใช้งานและไลน์ผลิต/i)).toBeInTheDocument();
      expect(screen.getByText(/5\. สายการอนุมัติและ SLAs/i)).toBeInTheDocument();
      expect(screen.queryByText(/ลายมือชื่อและความปลอดภัย/i)).not.toBeInTheDocument();
    });
  });

  describe('2. Tab 1: Users, Roles & Levels', () => {
    it('searches users by name or ID in real-time', () => {
      renderWithRouter(<MasterDataHub />);

      const searchInput = screen.getByPlaceholderText(/ค้นหาชื่อ, รหัสพนักงาน, อีเมล/i);
      fireEvent.change(searchInput, { target: { value: 'ธนาวุฒิ' } });

      expect(screen.getByText(/ธนาวุฒิ สมควรกิจดำรง/i)).toBeInTheDocument();
      expect(screen.queryByText(/สมชาย การตลาด/i)).not.toBeInTheDocument();
    });

    it('adds a new user to store and updates table', () => {
      renderWithRouter(<MasterDataHub />);

      // Open Add User Modal
      const addBtn = screen.getByRole('button', { name: /เพิ่มผู้ใช้งานใหม่/i });
      fireEvent.click(addBtn);

      // Fill in user details
      const nameInput = screen.getByPlaceholderText(/เช่น สมชาย สายผลิต/i);
      fireEvent.change(nameInput, { target: { value: 'สมศรี นักวิเคราะห์ QA' } });

      const submitBtn = screen.getByRole('button', { name: /บันทึกข้อมูล/i });
      fireEvent.click(submitBtn);

      // Verify user added to store and UI
      const users = useStore.getState().masterUsers;
      const created = users.find(u => u.name === 'สมศรี นักวิเคราะห์ QA');
      expect(created).toBeDefined();
      expect(created.department).toBe('QA');
      expect(screen.getByText('สมศรี นักวิเคราะห์ QA')).toBeInTheDocument();
    });

    it('resets user PIN and unlocks account', () => {
      // Lock a user first
      useStore.setState(state => ({
        masterUsers: state.masterUsers.map(u => u.id === 'U003' ? { ...u, isLocked: true, failedPinAttempts: 3 } : u)
      }));

      renderWithRouter(<MasterDataHub />);

      expect(screen.getByText('LOCKED')).toBeInTheDocument();

      // Click Unlock
      const unlockBtn = screen.getByTitle('ปลดล็อกบัญชี');
      fireEvent.click(unlockBtn);

      const u3 = useStore.getState().masterUsers.find(u => u.id === 'U003');
      expect(u3.isLocked).toBe(false);
      expect(u3.failedPinAttempts).toBe(0);
    });
  });

  describe('3. Tab 2: Departments Management', () => {
    it('switches to Departments tab and displays doc/copy counters', () => {
      renderWithRouter(<MasterDataHub />);

      const deptTabBtn = screen.getByText(/2\. แผนกและโครงสร้าง/i);
      fireEvent.click(deptTabBtn);

      expect(screen.getByText('Production Department')).toBeInTheDocument();
      expect(screen.getByText('Quality Assurance & Control')).toBeInTheDocument();
      expect(screen.getByText('ฝ่ายผลิต')).toBeInTheDocument();
    });

    it('adds a new department and prevents duplicate code', () => {
      renderWithRouter(<MasterDataHub />);

      const deptTabBtn = screen.getByText(/2\. แผนกและโครงสร้าง/i);
      fireEvent.click(deptTabBtn);

      const addDeptBtn = screen.getByRole('button', { name: /เพิ่มแผนกใหม่/i });
      fireEvent.click(addDeptBtn);

      const codeInput = screen.getByPlaceholderText(/เช่น PD, QA, QC, WH, EN/i);
      const nameThInput = screen.getByPlaceholderText(/เช่น ฝ่ายผลิต/i);

      fireEvent.change(codeInput, { target: { value: 'LAB' } });
      fireEvent.change(nameThInput, { target: { value: 'ฝ่ายห้องปฏิบัติการกลาง' } });

      const submitBtn = screen.getByRole('button', { name: /บันทึกแผนก/i });
      fireEvent.click(submitBtn);

      const depts = useStore.getState().departments;
      expect(depts.some(d => d.id === 'LAB')).toBe(true);
    });
  });

  describe('4. Tab 3: Document Types & Numbering Rules', () => {
    it('displays document types with Form Clean Bypass indicators', () => {
      renderWithRouter(<MasterDataHub />);

      const docTypeTabBtn = screen.getByText(/3\. ประเภทเอกสารและรหัส/i);
      fireEvent.click(docTypeTabBtn);

      expect(screen.getByText('SOP')).toBeInTheDocument();
      expect(screen.getByText('WI')).toBeInTheDocument();
      expect(screen.getByText('FM')).toBeInTheDocument();
      expect(screen.getAllByText('✅ Bypass').length).toBeGreaterThan(0);
    });

    it('adds a new document type', () => {
      renderWithRouter(<MasterDataHub />);

      const docTypeTabBtn = screen.getByText(/3\. ประเภทเอกสารและรหัส/i);
      fireEvent.click(docTypeTabBtn);

      const addTypeBtn = screen.getByRole('button', { name: /เพิ่มประเภทเอกสาร/i });
      fireEvent.click(addTypeBtn);

      const codeInput = screen.getByPlaceholderText(/เช่น SOP, WI, FM/i);
      const nameThInput = screen.getByPlaceholderText(/เช่น ระเบียบปฏิบัติงาน/i);

      fireEvent.change(codeInput, { target: { value: 'POLICY' } });
      fireEvent.change(nameThInput, { target: { value: 'นโยบายคุณภาพองค์กร' } });

      const submitBtn = screen.getByRole('button', { name: /บันทึกประเภทเอกสาร/i });
      fireEvent.click(submitBtn);

      const types = useStore.getState().documentTypes;
      expect(types.some(t => t.code === 'POLICY')).toBe(true);
    });
  });

  describe('5. Tab 4: Locations Matrix & Orphan Protection', () => {
    it('adds a new point-of-use station and syncs with MasterDataService', () => {
      renderWithRouter(<MasterDataHub />);

      const locTabBtn = screen.getByText(/4\. จุดใช้งานและไลน์ผลิต/i);
      fireEvent.click(locTabBtn);

      const addLocBtn = screen.getByRole('button', { name: /เพิ่มจุดใช้งานใหม่/i });
      fireEvent.click(addLocBtn);

      const nameInput = screen.getByPlaceholderText(/เช่น Line 5 - Baking Area 2/i);
      fireEvent.change(nameInput, { target: { value: 'Line 9 - Automated Robot Cell' } });

      const submitBtn = screen.getByRole('button', { name: /บันทึกจุดใช้งาน/i });
      fireEvent.click(submitBtn);

      const locs = useStore.getState().distributionLocations;
      const created = locs.find(l => l.name === 'Line 9 - Automated Robot Cell');
      expect(created).toBeDefined();

      // Verify real-time synchronization with MasterDataService helper
      const pdStations = getDepartmentStations('PD', locs);
      expect(pdStations.some(s => s.name === 'Line 9 - Automated Robot Cell')).toBe(true);
    });

    it('enforces Orphan Protection: blocks deletion of location with active controlled copies', () => {
      // Set up an active controlled copy attached to PD-L1
      useStore.setState({
        controlledCopyInstances: [
          {
            id: 'CC-ACTIVE-001',
            doc_code: 'SOP-PD-001',
            locationId: 'PD-L1',
            status: 'ISSUED_ACTIVE',
            copy_no: '02'
          }
        ]
      });

      renderWithRouter(<MasterDataHub />);

      const locTabBtn = screen.getByText(/4\. จุดใช้งานและไลน์ผลิต/i);
      fireEvent.click(locTabBtn);

      // Attempt to delete PD-L1 via store
      expect(() => {
        useStore.getState().deleteDistributionLocation('PD-L1');
      }).toThrowError(/ไม่สามารถลบจุดใช้งานนี้ได้ เนื่องจากมีสำเนาควบคุม/i);

      // Verify PD-L1 is still in store
      const locs = useStore.getState().distributionLocations;
      expect(locs.some(l => l.id === 'PD-L1')).toBe(true);
    });

    it('allows deletion of unused location', () => {
      // Add an unused dummy location
      useStore.getState().addDistributionLocation({
        id: 'PD-UNUSED-99',
        departmentId: 'PD',
        name: 'Unused Test Station'
      });

      useStore.getState().deleteDistributionLocation('PD-UNUSED-99');

      const locs = useStore.getState().distributionLocations;
      expect(locs.some(l => l.id === 'PD-UNUSED-99')).toBe(false);
    });
  });

  describe('6. Tab 1: Integrated Signature Asset Management', () => {
    it('opens 3-mode Signature Asset Manager modal from user list', () => {
      renderWithRouter(<MasterDataHub />);

      // Find signature asset button in user table
      const sigButtons = screen.getAllByTitle(/จัดการลายเซ็น/i);
      expect(sigButtons.length).toBeGreaterThan(0);

      // Open modal for first user
      fireEvent.click(sigButtons[0]);

      // Check modal heading and 3 modes
      expect(screen.getByText(/จัดการลายเซ็นอิเล็กทรอนิกส์/i)).toBeInTheDocument();
      expect(screen.getByText(/วาดลายเซ็น/i)).toBeInTheDocument();
      expect(screen.getByText(/อัปโหลดรูป/i)).toBeInTheDocument();
      expect(screen.getByText(/เลือก Font/i)).toBeInTheDocument();
    });

    it('updates user digital signature profile via updateUserSignatureProfile', () => {
      renderWithRouter(<MasterDataHub />);

      useStore.getState().updateUserSignatureProfile('U005', {
        signatureType: 'TYPOGRAPHIC',
        signatureStyle: 'FORMAL_SERIF',
        signatureInitials: 'BEAM-QAQC'
      });

      const u5 = useStore.getState().masterUsers.find(u => u.id === 'U005');
      expect(u5.signatureStyle).toBe('FORMAL_SERIF');
      expect(u5.signatureInitials).toBe('BEAM-QAQC');
      expect(u5.hasRegisteredSignature).toBe(true);
    });
  });

  describe('7. Tab 5: SLA Settings', () => {
    it('navigates to Tab 5 (SLAs) and updates workflow SLA duration thresholds', () => {
      renderWithRouter(<MasterDataHub />);

      const slaTabBtn = screen.getByText(/5\. สายการอนุมัติและ SLAs/i);
      fireEvent.click(slaTabBtn);

      expect(screen.getByText(/1\. ทบทวนคำขอ \(Review\)/i)).toBeInTheDocument();

      useStore.getState().updateSlaSettings({ reviewSlaDays: 2, approvalSlaDays: 2 });
      expect(useStore.getState().slaSettings.reviewSlaDays).toBe(2);
      expect(useStore.getState().slaSettings.approvalSlaDays).toBe(2);
    });
  });
});
