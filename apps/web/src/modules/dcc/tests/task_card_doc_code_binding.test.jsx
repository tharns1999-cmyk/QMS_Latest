import { describe, it, expect } from 'vitest';
import { getDocumentIdentifier, getDocumentTitle } from '../pages/Tasks/TaskInbox';
import { resolveDarDocumentCode } from '../../../store/useStore';

describe('Task Card Document Code Binding & Title Deduplication', () => {
  const mockDocuments = [
    {
      id: 'DOC-001',
      code: 'SOP-QA-001',
      document_code: 'SOP-QA-001',
      title: 'SOP-QA-001',
      name: 'ระเบียบปฏิบัติการควบคุมเอกสาร',
      rev: '01'
    }
  ];

  const mockDars = [
    {
      id: 'DAR-2026-001',
      darNo: 'DAR-2026-001',
      darNumber: 'DAR-2026-001',
      docNo: 'SOP-PD-002',
      title: 'ว่าส่ส่ส่สาวาวสาวสสาวาวา',
      name: 'ว่าส่ส่ส่สาวาวสาวสสาวาวา',
      docIdRef: 'DOC-001',
      sourceRevision: '00',
      targetRevision: '02'
    }
  ];

  describe('getDocumentIdentifier', () => {
    it('should return docNo or documentCode when provided', () => {
      const task = {
        docNo: 'WI-WH-005',
        title: 'วิธีปฏิบัติงานคลังสินค้า'
      };
      expect(getDocumentIdentifier(task)).toBe('WI-WH-005');
    });

    it('should NOT return docCode if it contains Thai text (erroneous docTitle binding)', () => {
      const task = {
        docCode: 'ว่าส่ส่ส่สาวาวสาวสสาวาวา',
        docTitle: 'ว่าส่ส่ส่สาวาวสาวสสาวาวา',
        darId: 'DAR-2026-001'
      };
      const context = { documents: mockDocuments, dars: mockDars };
      // It should skip the Thai docCode and resolve the real code from matched DAR
      const code = getDocumentIdentifier(task, context);
      expect(code).toBe('SOP-PD-002');
    });

    it('should extract standard code from task title if no explicit code field exists', () => {
      const task = {
        title: '[DAR ทบทวน] คู่มือการปฏิบัติงาน (SOP-QA-003)'
      };
      expect(getDocumentIdentifier(task)).toBe('SOP-QA-003');
    });

    it('should fallback to darNumber if no other code exists', () => {
      const task = {
        darId: 'DAR-2026-009',
        title: 'คำร้องขอแก้ไข'
      };
      expect(getDocumentIdentifier(task)).toBe('DAR-2026-009');
    });
  });

  describe('resolveDarDocumentCode', () => {
    it('should extract valid code from DAR properties and ignore Thai titles', () => {
      const dar = {
        id: 'dar-123',
        darNumber: 'DAR-2026-012',
        title: 'แบบฟอร์มบันทึกการตรวจสอบ',
        docNo: 'FM-QA-001'
      };
      expect(resolveDarDocumentCode(dar, mockDocuments)).toBe('FM-QA-001');
    });

    it('should resolve code from referenced document when DAR has no docNo', () => {
      const dar = {
        id: 'dar-124',
        darNumber: 'DAR-2026-014',
        title: 'ขอทบทวนเอกสาร',
        docIdRef: 'DOC-001'
      };
      expect(resolveDarDocumentCode(dar, mockDocuments)).toBe('SOP-QA-001');
    });
  });

  describe('getDocumentTitle', () => {
    it('should return real document title from task or matched store data', () => {
      const task = {
        docCode: 'SOP-QA-001',
        docTitle: 'ระเบียบปฏิบัติการควบคุมเอกสาร',
        title: '[DAR รออนุมัติ] ระเบียบปฏิบัติการควบคุมเอกสาร (SOP-QA-001)'
      };
      const context = { documents: mockDocuments, dars: mockDars };
      expect(getDocumentTitle(task, context)).toBe('ระเบียบปฏิบัติการควบคุมเอกสาร');
    });

    it('should strip prefixes from raw title if no explicit title is set', () => {
      const task = {
        title: '[DAR ทบทวน] คู่มือการปฏิบัติงาน'
      };
      expect(getDocumentTitle(task, {})).toBe('คู่มือการปฏิบัติงาน');
    });
  });
});
