import { describe, it, expect } from 'vitest';
import { generateQmsDownloadName, formatDarHeaderTitle } from '../utils/documentNamingHelper';

describe('ISO-Standard Document Naming Convention & Viewer Real Estate', () => {
  describe('1. generateQmsDownloadName Utility', () => {
    it('generates DRAFT filename for review/pending workflow states', () => {
      const name = generateQmsDownloadName({
        docCode: 'SOP-QC-001',
        title: 'การตรวจรับวัตถุดิบเข้า',
        revision: '0',
        systemStatus: 'DRAFT'
      });
      expect(name).toBe('SOP-QC-001_การตรวจรับวัตถุดิบเข้า_Rev00_DRAFT.pdf');
    });

    it('generates DRAFT filename when systemStatus is PENDING or REVIEW or APPROVE', () => {
      const nameReview = generateQmsDownloadName({
        docCode: 'WI-PD-02',
        title: 'การล้างเครื่องจักร',
        revision: '1',
        systemStatus: 'REVIEW'
      });
      expect(nameReview).toBe('WI-PD-02_การล้างเครื่องจักร_Rev01_DRAFT.pdf');

      const nameApprove = generateQmsDownloadName({
        docCode: 'WI-PD-02',
        title: 'การล้างเครื่องจักร',
        revision: '2',
        systemStatus: 'APPROVE'
      });
      expect(nameApprove).toBe('WI-PD-02_การล้างเครื่องจักร_Rev02_DRAFT.pdf');
    });

    it('generates UNCONTROLLED filename for ACTIVE documents when isControlledPrint is false', () => {
      const name = generateQmsDownloadName({
        docCode: 'SOP-QC-01',
        title: 'การตรวจรับ',
        revision: '00',
        systemStatus: 'ACTIVE',
        isControlledPrint: false
      });
      expect(name).toBe('SOP-QC-01_การตรวจรับ_Rev00_UNCONTROLLED.pdf');
    });

    it('generates CONTROLLED filename for ACTIVE documents when isControlledPrint is true', () => {
      const name = generateQmsDownloadName({
        docCode: 'SOP-QC-01',
        title: 'การตรวจรับ',
        revision: '00',
        systemStatus: 'ACTIVE',
        isControlledPrint: true
      });
      expect(name).toBe('SOP-QC-01_การตรวจรับ_Rev00_CONTROLLED.pdf');
    });

    it('generates SUPERSEDED filename correctly', () => {
      const name = generateQmsDownloadName({
        docCode: 'QM-001',
        title: 'Quality Manual',
        revision: '01',
        systemStatus: 'SUPERSEDED'
      });
      expect(name).toBe('QM-001_Quality_Manual_Rev01_SUPERSEDED.pdf');
    });

    it('generates OBSOLETE filename correctly', () => {
      const name = generateQmsDownloadName({
        docCode: 'FM-HR-05',
        title: 'แบบประเมินผลเก่า',
        revision: '03',
        systemStatus: 'OBSOLETE'
      });
      expect(name).toBe('FM-HR-05_แบบประเมินผลเก่า_Rev03_OBSOLETE.pdf');
    });

    it('cleans special characters, normalizes whitespace, and pads single-digit revisions', () => {
      const name = generateQmsDownloadName({
        docCode: 'SOP-QC-001!*',
        title: '  คู่มือการใช้งาน / เครื่องวัด  @2026 ',
        revision: '5',
        systemStatus: 'EFFECTIVE',
        isControlledPrint: false
      });
      expect(name).toBe('SOP-QC-001_คู่มือการใช้งาน_เครื่องวัด_2026_Rev05_UNCONTROLLED.pdf');
    });
  });

  describe('2. formatDarHeaderTitle Utility', () => {
    it('formats title as รหัสเอกสาร - ชื่อเอกสาร (Rev. xx)', () => {
      const dar = {
        docCode: 'SOP-QA-010',
        title: 'ระเบียบการสอบเทียบเครื่องมือ',
        targetRevision: '2'
      };
      const formatted = formatDarHeaderTitle(dar);
      expect(formatted).toBe('SOP-QA-010 - ระเบียบการสอบเทียบเครื่องมือ (Rev. 02)');
    });

    it('provides fallback when dar data is missing or undefined', () => {
      expect(formatDarHeaderTitle(null)).toBe('No Code - ไม่ระบุชื่อเอกสาร (Rev. 00)');
      expect(formatDarHeaderTitle({})).toBe('No Code - ไม่ระบุชื่อเอกสาร (Rev. 00)');
    });
  });
});
