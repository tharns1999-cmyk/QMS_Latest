import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import DocumentAccessControlSelector from '../components/workflow/DocumentAccessControlSelector';
import DistributionSetup from '../components/workflow/DistributionSetup';
import useStore from '../store/useStore';

describe('Enterprise UX/UI Overhaul: High-Density Access Scope & Distribution Matrix Tests', () => {
  beforeEach(() => {
    useStore.setState({
      currentUser: {
        id: 'U002',
        name: 'ธนาวุฒิ สมควรกิจดำรง',
        department: 'PD',
        role: 'DEPT_ADMIN',
        level: 4
      },
      masterDepartments: [
        { id: 'PD', nameTh: 'ฝ่ายผลิต', name: 'Production' },
        { id: 'QA', nameTh: 'ฝ่ายประกันคุณภาพ', name: 'Quality Assurance' },
        { id: 'WH', nameTh: 'ฝ่ายคลังสินค้า', name: 'Warehouse' },
        { id: 'EN', nameTh: 'ฝ่ายวิศวกรรม', name: 'Engineering' }
      ],
      masterUsers: [
        { id: 'U001', name: 'Admin QA (DCC)', department: 'QA', role: 'DCC_ADMIN', level: 1 },
        { id: 'U002', name: 'ธนาวุฒิ สมควรกิจดำรง', department: 'PD', role: 'DEPT_ADMIN', level: 4 },
        { id: 'U006', name: 'รัตนพล วิศวกรรม', department: 'EN', role: 'DEPT_ADMIN', level: 4 }
      ]
    });
  });

  describe('1. DocumentAccessControlSelector (Horizontal Segmented 4-Card Grid)', () => {
    it('renders all 4 compact segmented cards and updates scope payload on click', () => {
      const handleChange = vi.fn();
      const { rerender } = render(
        <DocumentAccessControlSelector
          value={{ scope: 'GENERAL', authorized_depts: [], authorized_users: [], min_access_level: 4 }}
          onChange={handleChange}
          ownerDept="PD"
        />
      );

      // Verify Header and 4 Cards
      expect(screen.getByText(/ระดับการเข้าถึงและความลับของเอกสาร/i)).toBeInTheDocument();
      expect(screen.getByText(/Scope: GENERAL/i)).toBeInTheDocument();

      const generalCard = screen.getByRole('button', { name: /ทั่วไป \(General\)/i });
      const deptCard = screen.getByRole('button', { name: /เฉพาะแผนกฉัน \(Department Only\)/i });
      const targetedCard = screen.getByRole('button', { name: /เฉพาะบางแผนก \(Targeted\)/i });
      const restrictedCard = screen.getByRole('button', { name: /ลับเฉพาะบุคคล\/ตำแหน่ง \(Restricted\)/i });

      expect(generalCard).toBeInTheDocument();
      expect(deptCard).toBeInTheDocument();
      expect(targetedCard).toBeInTheDocument();
      expect(restrictedCard).toBeInTheDocument();

      // Click TARGETED
      fireEvent.click(targetedCard);
      expect(handleChange).toHaveBeenCalledWith(expect.objectContaining({
        scope: 'TARGETED',
        authorized_depts: ['PD']
      }));

      // Rerender with TARGETED
      rerender(
        <DocumentAccessControlSelector
          value={{ scope: 'TARGETED', authorized_depts: ['PD'], authorized_users: [], min_access_level: 4 }}
          onChange={handleChange}
          ownerDept="PD"
          masterDepartments={[{ id: 'PD' }, { id: 'QA' }, { id: 'WH' }]}
        />
      );

      // Owner Dept PD is locked and read-only
      expect(screen.getByText(/เจ้าของ \(ล็อก\)/i)).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: /^QA/ }));
      expect(handleChange).toHaveBeenCalledWith(expect.objectContaining({
        authorized_depts: expect.arrayContaining(['PD', 'QA'])
      }));
    });

    it('renders Restricted sub-config panel with position level select (default mode) and mode switch', () => {
      const handleChange = vi.fn();
      render(
        <DocumentAccessControlSelector
          value={{ scope: 'RESTRICTED', authorized_depts: [], authorized_users: ['U006'], min_access_level: 5 }}
          onChange={handleChange}
          ownerDept="PD"
        />
      );

      expect(screen.getByText(/ระดับตำแหน่งขั้นต่ำที่อนุญาต/i)).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'ระบุรายชื่อเฉพาะบุคคล' }));
      expect(handleChange).toHaveBeenCalledWith(expect.objectContaining({ restricted_mode: 'WHITELIST' }));

      // Change min level
      const select = screen.getByRole('combobox');
      expect(select.value).toBe('5');
      fireEvent.change(select, { target: { value: '6' } });
      expect(handleChange).toHaveBeenCalledWith(expect.objectContaining({
        min_access_level: 6
      }));
    });
  });

  describe('2. DistributionSetup (Dual-Pane Master-Detail Matrix)', () => {
    it('renders Header Bar with Master Copy 01 Lock badge and overview copy counts', () => {
      render(
        <DistributionSetup
          ownerDept="PD"
          distributions={[]}
          onChange={() => {}}
          documentType="WI"
        />
      );

      // Master station locked
      expect(screen.getByText(/PD — PD Head Office/i)).toBeInTheDocument();
      expect(screen.getByText(/Master Copy 01 ล็อกถาวร/i)).toBeInTheDocument();

      // Overview counts
      expect(screen.getByText(/จัดสรรแล้ว:/i)).toBeInTheDocument();
      expect(screen.getByText(/Master:/i)).toBeInTheDocument();
      expect(screen.getByText(/Controlled:/i)).toBeInTheDocument();
    });

    it('renders Dual-Pane Layout: Left Department list and Right Station grid', () => {
      let currentDistributions = [];
      const handleChange = vi.fn((d) => { currentDistributions = d; });

      render(
        <DistributionSetup
          ownerDept="PD"
          distributions={[]}
          onChange={handleChange}
          documentType="WI"
        />
      );

      // Left pane shows departments
      expect(screen.getByText(/แผนกในระบบ/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /เลือกทุกแผนก/i })).toBeInTheDocument();

      // Right pane shows stations in active department (PD)
      expect(screen.getByText(/Line 1 - Mixing \(ห้องผสม\)/i)).toBeInTheDocument();
      expect(screen.getByText(/Line 2 - Baking \(เตาอบ\)/i)).toBeInTheDocument();

      // Click Line 1 to allocate Copy 02
      const line1 = screen.getByText(/Line 1 - Mixing \(ห้องผสม\)/i);
      fireEvent.click(line1.closest('div'));

      expect(handleChange).toHaveBeenCalled();
      expect(currentDistributions.length).toBe(1);
      expect(currentDistributions[0].copyNo).toBe('02');
      expect(currentDistributions[0].locationName).toContain('Line 1 - Mixing');
    });

    it('Allocated Copies Tray: Renders visual pill chips with delete button for non-master copies', () => {
      const distributions = [
        { departmentId: 'PD', locationId: 'PD-L1', locationName: 'Line 1 - Mixing', copyNo: '02' },
        { departmentId: 'QA', locationId: 'QA-CHEM', locationName: 'QC Chemistry Lab', copyNo: '03' }
      ];

      const handleChange = vi.fn();

      render(
        <DistributionSetup
          ownerDept="PD"
          distributions={distributions}
          onChange={handleChange}
          documentType="WI"
        />
      );

      // Tray summary header
      expect(screen.getByText(/สำเนาที่จะพิมพ์ \(3 ชุด\):/i)).toBeInTheDocument();

      // Chips
      expect(screen.getAllByText(/PD Head Office/i).length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText(/Copy 01/i).length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText(/Copy 02/i).length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText(/Copy 03/i).length).toBeGreaterThanOrEqual(1);

      // Click delete on Copy 02
      const deleteButtons = screen.getAllByTitle(/ลบจุดนี้ออก/i);
      expect(deleteButtons.length).toBe(2);
      fireEvent.click(deleteButtons[0]);

      expect(handleChange).toHaveBeenCalledWith(expect.arrayContaining([
        expect.objectContaining({ copyNo: '02', locationId: 'QA-CHEM' }) // QA-CHEM shifted from 03 to 02
      ]));
    });

    it('Inline Quick Add: Allows adding ad-hoc custom station to the active department', () => {
      let currentDistributions = [];
      const handleChange = vi.fn((d) => { currentDistributions = d; });

      render(
        <DistributionSetup
          ownerDept="PD"
          distributions={[]}
          onChange={handleChange}
          documentType="WI"
        />
      );

      const input = screen.getByPlaceholderText(/เพิ่มจุดติดตั้งพิเศษใน/i);
      fireEvent.change(input, { target: { value: 'Line 9 Cleanroom Zone' } });
      fireEvent.click(screen.getByRole('button', { name: 'เพิ่มจุด' }));

      expect(handleChange).toHaveBeenCalled();
      expect(currentDistributions.some(d => d.locationName.includes('Line 9 Cleanroom Zone'))).toBe(true);
    });
  });
});
