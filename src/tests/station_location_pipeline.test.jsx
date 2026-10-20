import React from 'react';
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import useStore from '../store/useStore';
import { calculateCopyAllocations } from '../services/MasterDataService';
import { UniversalWatermarkService, WATERMARK_TYPES } from '../services/UniversalWatermarkService';
import { WATERMARK_CONFIG } from '../config/qmsRegistry';
import ControlledCopyRegister from '../pages/ControlledCopy/ControlledCopyRegister';
import { renderWithRouter } from './test_utils';

describe('Point-of-Use Location Data Pipeline & Watermark Synchronization Tests', () => {
  beforeEach(() => {
    // Reset Zustand Store
    useStore.setState({
      currentUser: {
        id: 'U001',
        name: 'DCC Officer Test',
        department: 'QA',
        depts: ['QA', 'PD'],
        role: 'DCC_ADMIN',
        level: 5,
        isDcc: true
      },
      documents: [
        {
          id: 'doc-pd-001',
          darId: 'dar-new-001',
          title: 'WI-PD-001',
          name: 'ขั้นตอนการผสมแป้งและเตรียมวัตถุดิบ',
          status: 'EFFECTIVE',
          department: 'PD',
          rev: '01',
          effectiveDate: '2026-08-20',
          distributions: [
            {
              station_id: 'PD-L1',
              station_name: 'Line 1 - Mixing (ห้องผสม)',
              departmentId: 'PD',
              dept_code: 'PD',
              copy_no: '02',
              copyNo: '02',
              is_master: false
            },
            {
              station_id: 'QA-CHEM',
              station_name: 'QC Chemistry Lab (ห้องปฏิบัติการเคมี)',
              departmentId: 'QA/QC',
              dept_code: 'QA/QC',
              copy_no: '03',
              copyNo: '03',
              is_master: false
            }
          ]
        }
      ],
      dars: [
        {
          id: 'dar-new-001',
          type: 'NEW',
          title: 'ขั้นตอนการผสมแป้งและเตรียมวัตถุดิบ',
          docIdInput: 'WI-PD-001',
          department: 'PD',
          requesterId: 'U002',
          status: 'APPROVED_WAITING_EFFECTIVE',
          effectiveDate: '2026-08-20',
          distributions: [
            {
              station_id: 'PD-L1',
              station_name: 'Line 1 - Mixing (ห้องผสม)',
              locationId: 'PD-L1',
              locationName: 'Line 1 - Mixing (ห้องผสม)',
              departmentId: 'PD',
              dept_code: 'PD',
              copy_no: '02',
              copyNo: '02',
              is_master: false
            },
            {
              station_id: 'CUSTOM-PD-TEMP',
              station_name: 'ขนม 1 (ห้องผสมและเตรียมวัตถุดิบไลน์ 1)',
              locationId: 'CUSTOM-PD-TEMP',
              locationName: 'ขนม 1 (ห้องผสมและเตรียมวัตถุดิบไลน์ 1)',
              departmentId: 'PD',
              dept_code: 'PD',
              copy_no: '03',
              copyNo: '03',
              is_master: false,
              isCustom: true
            }
          ]
        }
      ],
      controlledCopyInstances: [
        {
          id: 'cc-station-1',
          doc_id: 'doc-pd-001',
          docId: 'doc-pd-001',
          doc_code: 'WI-PD-001',
          docTitle: 'WI-PD-001',
          docName: 'ขั้นตอนการผสมแป้งและเตรียมวัตถุดิบ',
          doc_version: '01',
          rev: '01',
          copy_no: '02',
          ccNumber: 'CC-002',
          issue_no: '01',
          issueNumber: 'I01',
          holder_dept: 'PD',
          department: 'PD',
          departmentId: 'PD',
          location: 'Line 1 - Mixing (ห้องผสม)',
          locationName: 'Line 1 - Mixing (ห้องผสม)',
          station_name: 'Line 1 - Mixing (ห้องผสม)',
          status: 'PENDING_ISSUE',
          is_replacement: false,
          dateIssued: '2026-08-20'
        },
        {
          id: 'cc-station-2',
          doc_id: 'doc-pd-001',
          docId: 'doc-pd-001',
          doc_code: 'WI-PD-001',
          docTitle: 'WI-PD-001',
          docName: 'ขั้นตอนการผสมแป้งและเตรียมวัตถุดิบ',
          doc_version: '01',
          rev: '01',
          copy_no: '03',
          ccNumber: 'CC-003',
          issue_no: '01',
          issueNumber: 'I01',
          holder_dept: 'QA/QC',
          department: 'QA/QC',
          departmentId: 'QA/QC',
          location: 'QC Chemistry Lab (ห้องปฏิบัติการเคมี)',
          locationName: 'QC Chemistry Lab (ห้องปฏิบัติการเคมี)',
          station_name: 'QC Chemistry Lab (ห้องปฏิบัติการเคมี)',
          status: 'PENDING_ISSUE',
          is_replacement: false,
          dateIssued: '2026-08-20'
        }
      ],
      documentControlledCopies: [],
      tasks: [],
      timeline: [],
      controlledCopyAuditTrail: [],
      actionLog: [],
      simulatedDate: '2026-08-20'
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. Station Data Allocation Engine (MasterDataService.js)', () => {
    it('generates fully enriched station objects with both camelCase and snake_case properties', () => {
      const selected = [
        {
          departmentId: 'PD',
          locationId: 'PD-L1',
          locationName: 'Line 1 - Mixing (ห้องผสม)'
        },
        {
          departmentId: 'QA/QC',
          station_id: 'QA-CHEM',
          station_name: 'QC Chemistry Lab (ห้องปฏิบัติการเคมี)'
        },
        {
          departmentId: 'PD',
          locationId: 'CUSTOM-001',
          locationName: 'ขนม 1 (ห้องผสมและเตรียมวัตถุดิบไลน์ 1)',
          isCustom: true
        }
      ];

      const result = calculateCopyAllocations('PD', selected);

      // Copy 01 (Master)
      expect(result.masterCopy.copyNo).toBe('01');
      expect(result.masterCopy.copy_no).toBe('01');
      expect(result.masterCopy.is_master).toBe(true);
      expect(result.masterCopy.isMaster).toBe(true);
      expect(result.masterCopy.station_name).toContain('PD Head Office');
      expect(result.masterCopy.locationName).toContain('PD Head Office');

      // Distributed copies (Copy 02, Copy 03, Copy 04)
      expect(result.distributedCopies).toHaveLength(3);
      
      const copy2 = result.distributedCopies[0];
      expect(copy2.copyNo).toBe('02');
      expect(copy2.copy_no).toBe('02');
      expect(copy2.station_id).toBe('PD-L1');
      expect(copy2.locationId).toBe('PD-L1');
      expect(copy2.station_name).toBe('Line 1 - Mixing (ห้องผสม)');
      expect(copy2.locationName).toBe('Line 1 - Mixing (ห้องผสม)');
      expect(copy2.dept_code).toBe('PD');
      expect(copy2.departmentId).toBe('PD');
      expect(copy2.is_master).toBe(false);

      const copy3 = result.distributedCopies[1];
      expect(copy3.copyNo).toBe('03');
      expect(copy3.station_id).toBe('QA-CHEM');
      expect(copy3.station_name).toBe('QC Chemistry Lab (ห้องปฏิบัติการเคมี)');

      const copy4 = result.distributedCopies[2];
      expect(copy4.copyNo).toBe('04');
      expect(copy4.station_name).toBe('ขนม 1 (ห้องผสมและเตรียมวัตถุดิบไลน์ 1)');
      expect(copy4.is_custom).toBe(true);
    });
  });

  describe('2. State Machine Pipeline (useStore.js)', () => {
    it('always includes Controlled Copy 01 (Owner Dept Master Station) in controlledCopyInstances and Pending Issue queue', () => {
      const store = useStore.getState();
      store.checkSLA();

      const state = useStore.getState();
      const allPdCopies = state.controlledCopyInstances.filter(c => c.doc_code === 'WI-PD-001' || c.docTitle === 'WI-PD-001');
      
      // Must include Copy 01
      const copy01 = allPdCopies.find(c => c.copy_no === '01' || c.copyNo === '01' || c.ccNumber === 'CC-001');
      expect(copy01).toBeDefined();
      expect(copy01.is_master).toBe(true);
      expect(copy01.holder_dept).toBe('PD');
      expect(copy01.location).toContain('PD Head Office');
      expect(copy01.status).toBe('PENDING_ISSUE');
    });

    it('creates controlled copy instances with exact station names when NEW DAR becomes effective', () => {
      const store = useStore.getState();
      store.checkSLA();

      const state = useStore.getState();
      const newCopies = state.controlledCopyInstances.filter(c => c.doc_code === 'WI-PD-001' || c.docTitle === 'WI-PD-001');
      
      expect(newCopies.length).toBeGreaterThanOrEqual(2);
      const customStationCopy = newCopies.find(c => c.location === 'ขนม 1 (ห้องผสมและเตรียมวัตถุดิบไลน์ 1)' || c.locationName === 'ขนม 1 (ห้องผสมและเตรียมวัตถุดิบไลน์ 1)');
      expect(customStationCopy).toBeDefined();
      expect(customStationCopy.holder_dept).toBe('PD');
      expect(customStationCopy.status).toBe('PENDING_ISSUE');
    });

    it('creates controlled copies with specific location via issueControlledCopy without generic fallback', () => {
      const store = useStore.getState();
      store.issueControlledCopy('WI-PD-001', 'EN', 'EN - Maintenance Workshop (โรงซ่อม)');

      const state = useStore.getState();
      const enCopy = state.controlledCopyInstances.find(c => c.holder_dept === 'EN');
      expect(enCopy).toBeDefined();
      expect(enCopy.location).toBe('EN - Maintenance Workshop (โรงซ่อม)');
      expect(enCopy.locationName).toBe('EN - Maintenance Workshop (โรงซ่อม)');
      expect(enCopy.station_name).toBe('EN - Maintenance Workshop (โรงซ่อม)');
      expect(enCopy.location).not.toContain('Point of Use');
    });

    it('preserves exact location names when requesting ad-hoc additional controlled copies', () => {
      const store = useStore.getState();
      store.requestAdditionalControlledCopies('doc-pd-001', [
        {
          departmentId: 'WH',
          locationId: 'WH-RM',
          locationName: 'Raw Material Warehouse (คลังวัตถุดิบ)'
        }
      ], 'เพิ่มจุดจัดเก็บวัตถุดิบใหม่');

      const state = useStore.getState();
      const whCopy = state.controlledCopyInstances.find(c => c.holder_dept === 'WH');
      expect(whCopy).toBeDefined();
      expect(whCopy.location).toBe('Raw Material Warehouse (คลังวัตถุดิบ)');
      expect(whCopy.locationName).toBe('Raw Material Warehouse (คลังวัตถุดิบ)');
      expect(whCopy.is_adhoc).toBe(true);
    });
  });

  describe('3. DCC Register Portal & Print Dispatch (ControlledCopyRegister.jsx)', () => {
    it('renders exact station names in the Pending Issue table', () => {
      renderWithRouter(<ControlledCopyRegister />, { route: '/controlled-copy?tab=PENDING_ISSUE' });

      expect(screen.getByText('Line 1 - Mixing (ห้องผสม)')).toBeInTheDocument();
      expect(screen.getByText('QC Chemistry Lab (ห้องปฏิบัติการเคมี)')).toBeInTheDocument();
      expect(screen.queryByText('ประจำจุดปฏิบัติงาน')).not.toBeInTheDocument();
    });

    it('passes specific station location to UniversalWatermarkService when printing single copy', async () => {
      const spyPrint = vi.spyOn(UniversalWatermarkService, 'downloadWatermarkedPdf').mockResolvedValue('blob:url');

      renderWithRouter(<ControlledCopyRegister />, { route: '/controlled-copy?tab=PENDING_ISSUE' });

      const printButtons = screen.getAllByText('พิมพ์สำเนา');
      fireEvent.click(printButtons[0]);

      await waitFor(() => {
        expect(spyPrint).toHaveBeenCalledTimes(1);
        expect(spyPrint).toHaveBeenCalledWith(
          expect.anything(),
          WATERMARK_TYPES.CONTROLLED_COPY,
          expect.objectContaining({
            copyNo: '02',
            location: 'Line 1 - Mixing (ห้องผสม)'
          })
        );
      });
    });

    it('passes specific station location for all items when performing Batch Print', async () => {
      const spyPrint = vi.spyOn(UniversalWatermarkService, 'downloadWatermarkedPdf').mockResolvedValue('blob:url');

      renderWithRouter(<ControlledCopyRegister />, { route: '/controlled-copy?tab=PENDING_ISSUE' });

      const batchPrintBtn = screen.getByText(/Batch Print All/i);
      fireEvent.click(batchPrintBtn);

      await waitFor(() => {
        expect(spyPrint).toHaveBeenCalledTimes(2);
        expect(spyPrint).toHaveBeenNthCalledWith(
          1,
          expect.anything(),
          WATERMARK_TYPES.CONTROLLED_COPY,
          expect.objectContaining({
            location: 'Line 1 - Mixing (ห้องผสม)'
          })
        );
        expect(spyPrint).toHaveBeenNthCalledWith(
          2,
          expect.anything(),
          WATERMARK_TYPES.CONTROLLED_COPY,
          expect.objectContaining({
            location: 'QC Chemistry Lab (ห้องปฏิบัติการเคมี)'
          })
        );
      });
    });

    it('binds controlled copy metadata (Copy 02, Issue 02 (ทดแทน), EN, EN Office) and generates CONTROLLED COPY watermark', async () => {
      const spyPrint = vi.spyOn(UniversalWatermarkService, 'downloadWatermarkedPdf').mockResolvedValue('blob:url');

      // Seed a replacement controlled copy in PENDING_ISSUE matching acceptance criteria
      useStore.setState((prev) => ({
        ...prev,
        controlledCopyInstances: [
          {
            id: 'cc-replacement-en-2',
            docId: 'doc-pd-001',
            docCode: 'SOP-QA-001',
            docTitle: 'ระเบียบปฏิบัติงาน',
            revNo: '02',
            copyNo: '02',
            copy_no: '02',
            issueNo: 'Issue 02 (ทดแทน)',
            issue_no: 'Issue 02 (ทดแทน)',
            holderDept: 'EN',
            holder_dept: 'EN',
            location: 'EN Office',
            status: 'PENDING_ISSUE',
            is_replacement: true
          }
        ]
      }));

      renderWithRouter(<ControlledCopyRegister />, { route: '/controlled-copy?tab=PENDING_ISSUE' });

      const printBtn = screen.getByRole('button', { name: /^พิมพ์สำเนา$/ });
      fireEvent.click(printBtn);

      await waitFor(() => {
        expect(spyPrint).toHaveBeenCalledTimes(1);
        const [, watermarkType, meta] = spyPrint.mock.calls[0];

        // Criteria 1: Watermark type must be CONTROLLED_COPY
        expect(watermarkType).toBe(WATERMARK_TYPES.CONTROLLED_COPY);

        // Criteria 2: Clean metadata
        expect(meta.copyNo).toBe('02');
        expect(meta.issueNo).toBe('02');
        expect(meta.holderDept).toBe('EN');
        expect(meta.location).toBe('EN Office');

        // Check actual rendered watermark dictionary lines
        const lines = WATERMARK_CONFIG.CONTROLLED.getLines(meta);
        expect(lines[0].text).toBe('CONTROLLED COPY');
        expect(lines[3].text).toContain('Copy No: 02 | Issue No: 02 | Holder: EN');
        expect(lines[4].text).toContain('Loc: EN Office');
      });

      spyPrint.mockRestore();
    });
  });

  describe('4. Universal Watermark Engine Integration (UniversalWatermarkService.js)', () => {
    it('sanitizes metadata with specific station location and embeds Loc into 45-degree watermark text lines', () => {
      const meta = {
        docCode: 'WI-PD-001',
        docVersion: '01',
        copyNo: '02',
        issueNo: '01',
        holderDept: 'PD',
        location: 'Line 1 - Mixing (ห้องผสม)'
      };

      const sanitized = UniversalWatermarkService.sanitizeMetadata(meta);
      expect(sanitized.location).toBe('Line 1 - Mixing (ห้องผสม)');

      const lines = UniversalWatermarkService.getWatermarkLines(WATERMARK_TYPES.CONTROLLED_COPY, sanitized);
      const locLine = lines.find(l => l.text.startsWith('Loc:'));
      
      expect(locLine).toBeDefined();
      expect(locLine.text).toBe('Loc: Line 1 - Mixing (ห้องผสม) | Issued By: DCC');
      expect(locLine.text).not.toContain('Loc: Point of Use');
      expect(locLine.text).not.toContain('Loc: Office Master');
    });

    it('handles replacement copies with specific station location correctly', () => {
      const meta = {
        docCode: 'WI-PD-001',
        docVersion: '01',
        copyNo: '02',
        issueNo: '02',
        holderDept: 'PD',
        station_name: 'ขนม 1 (ห้องผสมและเตรียมวัตถุดิบไลน์ 1)'
      };

      const sanitized = UniversalWatermarkService.sanitizeMetadata(meta);
      expect(sanitized.location).toBe('ขนม 1 (ห้องผสมและเตรียมวัตถุดิบไลน์ 1)');

      const lines = UniversalWatermarkService.getWatermarkLines(WATERMARK_TYPES.CONTROLLED_COPY_REPLACEMENT, sanitized);
      const locLine = lines.find(l => l.text.startsWith('Loc:'));
      
      expect(locLine).toBeDefined();
      expect(locLine.text).toBe('Loc: ขนม 1 (ห้องผสมและเตรียมวัตถุดิบไลน์ 1) | Issued By: DCC');
    });
  });
});
