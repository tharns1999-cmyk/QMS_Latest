import { describe, it, expect } from 'vitest';
import { 
  UniversalWatermarkService, 
  WATERMARK_TYPES,
  getBangkokFormattedTimestamp,
  getBangkokFormattedDate
} from '../services/UniversalWatermarkService';

describe('Watermark Bangkok Timezone & Timestamp Synchronization Tests', () => {
  it('1. getBangkokFormattedTimestamp correctly converts UTC ISO timestamps to Bangkok (GMT+7)', () => {
    // 03:54 UTC -> 10:54 Bangkok (UTC+7)
    const utcIso = '2026-08-24T03:54:22.123Z';
    const bkkTime = getBangkokFormattedTimestamp(utcIso);
    expect(bkkTime).toBe('2026-08-24 10:54');

    // Day rollover: 17:30 UTC -> 00:30 next day Bangkok
    const rolloverUtc = '2026-12-31T17:30:00.000Z';
    const rolloverBkk = getBangkokFormattedTimestamp(rolloverUtc);
    expect(rolloverBkk).toBe('2027-01-01 00:30');

    // Default Date produces valid format YYYY-MM-DD HH:mm
    const currentBkk = getBangkokFormattedTimestamp();
    expect(currentBkk).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
  });

  it('2. getBangkokFormattedDate correctly formats date in Bangkok timezone', () => {
    const utcIso = '2026-08-24T03:54:00.000Z';
    const bkkDate = getBangkokFormattedDate(utcIso);
    expect(bkkDate).toBe('2026-08-24');

    const rolloverUtc = '2026-12-31T18:00:00.000Z';
    const rolloverDate = getBangkokFormattedDate(rolloverUtc);
    expect(rolloverDate).toBe('2027-01-01');
  });

  it('3. sanitizeMetadata automatically converts UTC ISO strings to Bangkok local timestamp', () => {
    const meta = {
      docCode: 'SOP-PD-001',
      docVersion: '01',
      timestamp: '2026-08-24T03:54:10.000Z'
    };

    const sanitized = UniversalWatermarkService.sanitizeMetadata(meta);
    expect(sanitized.timestamp).toBe('2026-08-24 10:54');
  });

  it('4. sanitizeMetadata creates current Bangkok timestamp when timestamp is omitted', () => {
    const meta = {
      docCode: 'WI-QA-002',
      docVersion: '02'
    };

    const sanitized = UniversalWatermarkService.sanitizeMetadata(meta);
    expect(sanitized.timestamp).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
  });

  it('5. Watermark lines for UNCONTROLLED_COPY reflect Bangkok timestamp in Date label', () => {
    const meta = UniversalWatermarkService.sanitizeMetadata({
      docCode: 'SOP-PD-001',
      docVersion: '01',
      userName: 'Somchai Prasert',
      userDept: 'PD',
      timestamp: '2026-08-24T03:54:00.000Z'
    });

    const lines = UniversalWatermarkService.getWatermarkLines(WATERMARK_TYPES.UNCONTROLLED_COPY, meta);
    expect(lines[3].text).toContain('Date: 2026-08-24 10:54');
    expect(lines[3].text).toContain('Somchai Prasert (PD)');
  });

  it('6. Watermark lines for STRICTLY_CONFIDENTIAL reflect Bangkok timestamp in Released By label', () => {
    const meta = UniversalWatermarkService.sanitizeMetadata({
      docCode: 'SPEC-ENG-001',
      docVersion: '03',
      dccName: 'Admin QA (DCC)',
      timestamp: '2026-08-24T03:54:00.000Z'
    });

    const lines = UniversalWatermarkService.getWatermarkLines(WATERMARK_TYPES.STRICTLY_CONFIDENTIAL, meta);
    expect(lines[3].text).toContain('Released By: Admin QA (DCC) | 2026-08-24 10:54');
  });

  it('7. ED Dynamic Watermark renders Title, Source Edition, and Custodian Department', () => {
    const meta = UniversalWatermarkService.sanitizeMetadata({
      docCode: 'ED-PD-01',
      docTitle: 'ISO24011 พรบ การคุ้มครองสัตว์',
      docType: 'ED',
      docVersion: '01',
      sourceVersion: 'Edition 5 / 2026',
      department: 'PD',
      userName: 'ธนาวุฒิ สมควรจิตดำรง',
      userDept: 'PD',
      timestamp: '2026-08-24T06:06:00.000Z'
    });

    expect(meta.isExternal).toBe(true);

    const lines = UniversalWatermarkService.getWatermarkLines(WATERMARK_TYPES.UNCONTROLLED_COPY, meta);
    expect(lines[0].text).toBe('UNCONTROLLED COPY - FOR REFERENCE ONLY');
    expect(lines[1].text).toBe('Doc: ED-PD-01 | Title: ISO24011 พรบ การคุ้มครองสัตว์');
    expect(lines[2].text).toBe('Ver: Rev.01 (Source: Edition 5 / 2026) | Custodian: PD');
    expect(lines[3].text).toBe('Printed By: ธนาวุฒิ สมควรจิตดำรง (PD)');
    expect(lines[4].text).toBe('Timestamp: 2026-08-24 13:06 | Status: Valid on Print Date Only');
    expect(lines[5].text).toBe('*VALIDITY NOT GUARANTEED IF STORED LOCALLY OR PRINTED*');
  });

  it('8. ED Controlled Copy watermark includes Copy No, Location, and Issue Number', () => {
    const meta = UniversalWatermarkService.sanitizeMetadata({
      docCode: 'ED-QA-01',
      docTitle: 'FSSC 22000 Version 6.0 Standard',
      docType: 'ED',
      docVersion: '02',
      sourceVersion: 'Version 6.0',
      copyNo: '01',
      issueNo: '01',
      holderDept: 'QA',
      location: 'QC Chemistry Lab',
      issuedAt: '2026-08-24',
      issuedBy: 'DCC Officer'
    });

    const lines = UniversalWatermarkService.getWatermarkLines(WATERMARK_TYPES.CONTROLLED_COPY, meta);
    expect(lines[0].text).toBe('CONTROLLED COPY');
    expect(lines[1].text).toBe('Doc: ED-QA-01 | Title: FSSC 22000 Version 6.0 Standard');
    expect(lines[2].text).toBe('Ver: Rev.02 (Source: Version 6.0) | Copy: 01');
    expect(lines[3].text).toContain('Loc: QC Chemistry Lab');
    expect(lines[3].text).toContain('Issue: 01');
    expect(lines[4].text).toContain('Issued By: DCC Officer');
  });
});
