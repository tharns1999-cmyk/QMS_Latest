import { describe, it, expect, beforeEach, vi } from 'vitest';
import useStore from '../../../store/useStore';

vi.mock('../services/watermarkEngine', async (importOriginal) => ({
  ...(await importOriginal()),
  drawStandardIsoWatermark: vi.fn(async (bytes) => bytes)
}));

const { drawStandardIsoWatermark } = await import('../services/watermarkEngine');
const { UniversalWatermarkService, WATERMARK_TYPES } = await import('../services/UniversalWatermarkService');

const staff = { id: 'U005', name: 'บีม', department: 'QC', role: 'GENERAL_USER' };
const dcc = { id: 'U001', name: 'DCC', department: 'DC', role: 'DCC_ADMIN', isDcc: true };
const sop = { id: 'D1', doc_code: 'SOP-QC-01', title: 'SOP-QC-01', status: 'EFFECTIVE', isExternal: true };

describe('Watermark download guards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(UniversalWatermarkService, 'resolveRawPdfBytes').mockResolvedValue(new Uint8Array([37, 80, 68, 70]));
    window.URL.createObjectURL = vi.fn(() => 'blob:test');
    window.open = vi.fn();
    useStore.setState({ currentUser: staff, actionLog: [], auditLogs: [] });
  });

  it('a superseded form is no longer a clean-download form', () => {
    expect(UniversalWatermarkService.isBlankFormBypass({ doc_code: 'FM-QC-01', status: 'EFFECTIVE' })).toBe(true);
    expect(UniversalWatermarkService.isBlankFormBypass({ doc_code: 'FM-QC-01', status: 'SUPERSEDED' })).toBe(false);
  });

  it('the record status overrides the type the caller asks for', async () => {
    await UniversalWatermarkService.downloadWatermarkedPdf({ ...sop, status: 'SUPERSEDED' }, WATERMARK_TYPES.UNCONTROLLED_COPY, { mainText: 'UNCONTROLLED' }, true);
    expect(drawStandardIsoWatermark.mock.calls[0][1]).toBe(WATERMARK_TYPES.SUPERSEDED);
    expect(drawStandardIsoWatermark.mock.calls[0][2].mainText).toBeUndefined();

    await UniversalWatermarkService.downloadCleanPdf({ doc_code: 'FM-QC-01', status: 'OBSOLETE' }, {}, true);
    expect(drawStandardIsoWatermark.mock.calls[1][1]).toBe(WATERMARK_TYPES.OBSOLETE);
  });

  it('clean master is DCC only, whatever the caller passes, and DCC downloads are audited', async () => {
    await expect(UniversalWatermarkService.downloadCleanPdf(sop, { userName: 'DCC Admin' }, true)).rejects.toThrow(/DCC/);
    await expect(UniversalWatermarkService.downloadWatermarkedPdf(sop, 'CLEAN', { isCleanMaster: true }, true)).rejects.toThrow(/DCC/);

    useStore.setState({ currentUser: dcc });
    const logSpy = vi.spyOn(useStore.getState(), 'logDocumentDownload');
    await UniversalWatermarkService.downloadCleanPdf(sop, {}, true);
    expect(logSpy).toHaveBeenCalledWith(sop, 'CLEAN_MASTER', null);
    expect(drawStandardIsoWatermark).not.toHaveBeenCalled();
  });
});
