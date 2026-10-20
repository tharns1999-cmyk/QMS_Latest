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

});
