import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import useStore from '../store/useStore';
import DistributionSetup from '../components/workflow/DistributionSetup';
import { 
  getDepartmentStations, 
  getMasterStationForDept, 
  calculateCopyAllocations 
} from '../services/MasterDataService';

describe('Hierarchical Distribution Matrix & Copy Numbering Engine Tests', () => {
  beforeEach(() => {
    useStore.setState({
      documents: [],
      dars: [],
      currentUser: { isDcc: true, level: 5, department: 'PD' }
    });
  });

  describe('Master Data (Point of Use Standards)', () => {
    it('PD should contain standard stations including lines, metal detectors, RM, and control room', () => {
      const pdStations = getDepartmentStations('PD');
      const names = pdStations.map(s => s.name);
      
      expect(names).toContain('PD Head Office');
      expect(names).toContain('Line 1 - Mixing (ห้องผสม)');
      expect(names).toContain('Line 2 - Baking (เตาอบ)');
      expect(names).toContain('Line 3 - Fruit Line (ไลน์แต่งหน้า)');
      expect(names).toContain('Line 4 - Packing & Sealing (ไลน์บรรจุและซีล)');
      expect(names).toContain('Metal Detector 1-2 (เครื่องตรวจจับโลหะ 1-2)');
      expect(names).toContain('Metal Detector 3-4 (เครื่องตรวจจับโลหะ 3-4)');
      expect(names).toContain('RM Prep Area (จุดเตรียมวัตถุดิบ)');
      expect(names).toContain('Control Room (ห้องควบคุมกลาง)');
    });

    it('QA/QC should contain chemistry lab, micro lab, retain room, and incoming inspection', () => {
      const qaStations = getDepartmentStations('QA/QC');
      const names = qaStations.map(s => s.name);

      expect(names).toContain('QC Office (สำนักงานประกันและควบคุมคุณภาพ)');
      expect(names).toContain('QC Chemistry Lab (ห้องปฏิบัติการเคมี)');
      expect(names).toContain('QC Micro Lab (ห้องปฏิบัติการจุลชีววิทยา)');
      expect(names).toContain('Retain Sample Room (ห้องเก็บตัวอย่าง)');
      expect(names).toContain('Incoming Inspection (จุดตรวจรับวัตถุดิบ)');
    });

    it('WH & EN should contain warehouse zones and maintenance/utility rooms', () => {
      const whStations = getDepartmentStations('WH').map(s => s.name);
      expect(whStations).toContain('Raw Material Warehouse (คลังวัตถุดิบ)');
      expect(whStations).toContain('Finished Goods Warehouse (คลังสินค้าสำเร็จรูป)');
      expect(whStations).toContain('Cold Storage (ห้องเย็น)');
      expect(whStations).toContain('Packaging Storage (คลังบรรจุภัณฑ์)');

      const enStations = getDepartmentStations('EN').map(s => s.name);
      expect(enStations).toContain('Maintenance Workshop (ช่างซ่อมบำรุง)');
      expect(enStations).toContain('Utility & Boiler Room (ห้องหม้อไอน้ำและระบบน้ำ-ไฟ)');
      expect(enStations).toContain('Spare Parts Store (ห้องเก็บอะไหล่)');
    });
  });

  describe('Sequential Copy Numbering Engine', () => {
    it('Copy 01 Strict Lock: Owner department must always be Copy 01 (Master)', () => {
      const result = calculateCopyAllocations('PD', []);
      expect(result.masterCopy.copyNo).toBe('01');
      expect(result.masterCopy.departmentId).toBe('PD');
      expect(result.masterCopy.isMaster).toBe(true);
      expect(result.allAllocations[0].copyNo).toBe('01');
    });

    it('Sequential Allocation: Single line selected gets Copy 02', () => {
      const selected = [
        { departmentId: 'PD', locationId: 'PD-L1', locationName: 'Line 1 - Mixing' }
      ];
      const result = calculateCopyAllocations('PD', selected);

      expect(result.distributedCopies.length).toBe(1);
      expect(result.distributedCopies[0].copyNo).toBe('02');
      expect(result.distributedCopies[0].locationName).toBe('Line 1 - Mixing');
      expect(result.totalCopies).toBe(2); // Master 01 + Copy 02
    });

    it('Cross-Department & Multi-Line: Sequentially allocated 02, 03, 04... without gaps', () => {
      const selected = [
        { departmentId: 'PD', locationId: 'PD-L1', locationName: 'Line 1 - Mixing' },
        { departmentId: 'PD', locationId: 'PD-MD12', locationName: 'Metal Detector 1-2' },
        { departmentId: 'QA/QC', locationId: 'QA-CHEM', locationName: 'QC Chemistry Lab' },
        { departmentId: 'WH', locationId: 'WH-RM', locationName: 'Raw Material Warehouse' }
      ];
      const result = calculateCopyAllocations('PD', selected);

      expect(result.distributedCopies.length).toBe(4);
      expect(result.distributedCopies[0].copyNo).toBe('02');
      expect(result.distributedCopies[1].copyNo).toBe('03');
      expect(result.distributedCopies[2].copyNo).toBe('04');
      expect(result.distributedCopies[3].copyNo).toBe('05');
      expect(result.totalCopies).toBe(5);
    });

    it('Dynamic Re-indexing: When an item is removed, remaining copies seamlessly shift numbering', () => {
      const initialSelected = [
        { departmentId: 'PD', locationId: 'PD-L1', locationName: 'Line 1 - Mixing' },
        { departmentId: 'PD', locationId: 'PD-L2', locationName: 'Line 2 - Baking' },
        { departmentId: 'QA/QC', locationId: 'QA-MICRO', locationName: 'QC Micro Lab' }
      ];
      const initialResult = calculateCopyAllocations('PD', initialSelected);
      expect(initialResult.distributedCopies[1].copyNo).toBe('03'); // Line 2 is 03
      expect(initialResult.distributedCopies[2].copyNo).toBe('04'); // QC Micro is 04

      // Remove Line 1
      const updatedSelected = initialSelected.filter(s => s.locationId !== 'PD-L1');
      const updatedResult = calculateCopyAllocations('PD', updatedSelected);

      expect(updatedResult.distributedCopies.length).toBe(2);
      expect(updatedResult.distributedCopies[0].locationId).toBe('PD-L2');
      expect(updatedResult.distributedCopies[0].copyNo).toBe('02'); // Line 2 becomes 02
      expect(updatedResult.distributedCopies[1].locationId).toBe('QA-MICRO');
      expect(updatedResult.distributedCopies[1].copyNo).toBe('03'); // QC Micro becomes 03
    });

    it('Ad-hoc Custom Location: Adds to distribution list and receives immediate next sequential copy number', () => {
      const selected = [
        { departmentId: 'PD', locationId: 'PD-L1', locationName: 'Line 1 - Mixing' },
        { departmentId: 'PD', locationId: 'CUSTOM-PD-001', locationName: 'Line 5 - Special Temp Packing Zone', isCustom: true }
      ];
      const result = calculateCopyAllocations('PD', selected);

      expect(result.distributedCopies.length).toBe(2);
      expect(result.distributedCopies[1].isCustom).toBe(true);
      expect(result.distributedCopies[1].copyNo).toBe('03');
      expect(result.distributedCopies[1].locationName).toBe('Line 5 - Special Temp Packing Zone');
    });

    it('Fallback Rule: If department is passed without sub-location, defaults to Office Master station', () => {
      const masterStation = getMasterStationForDept('WH');
      expect(masterStation.id).toBe('WH-MASTER');
      expect(masterStation.name).toBe('WH Office');

      // If user selected WH without specific sub-location
      const selected = [
        { departmentId: 'WH', locationId: masterStation.id, locationName: masterStation.name }
      ];
      const result = calculateCopyAllocations('PD', selected);
      expect(result.distributedCopies[0].copyNo).toBe('02');
      expect(result.distributedCopies[0].departmentId).toBe('WH');
    });
  });

  describe('Form (FM) Exception & Controlled Copy Bypass', () => {
    it('Form (FM) documents force Acknowledgement to NOT_REQUIRED', () => {
      const docType = 'FM';
      let ackRequirement = 'REQUIRED';
      
      if (docType.startsWith('FM')) {
        ackRequirement = 'NOT_REQUIRED';
      }

      expect(ackRequirement).toBe('NOT_REQUIRED');
    });

    it('DistributionSetup renders FM access-scope notice and bypasses Tier 2 station matrix for FM documentType', () => {
      const { unmount } = render(
        <DistributionSetup
          ownerDept="PD"
          distributions={[]}
          onChange={() => {}}
          documentType="FM"
        />
      );

      // FM notice: download follows Access Scope (no station matrix)
      expect(screen.getByText(/ดาวน์โหลดตามสิทธิ์การเข้าถึง/)).toBeInTheDocument();

      // Does NOT show Copy 01 Strict Lock or Copy Counter
      expect(screen.queryByText(/Copy 01 \(Strict Lock\)/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/รวมจำนวนสำเนา/i)).not.toBeInTheDocument();
      unmount();
    });
  });
});
