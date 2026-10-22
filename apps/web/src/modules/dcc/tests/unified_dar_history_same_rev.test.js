import { describe, it, expect } from 'vitest';
import { resolveFullDocumentHistory } from '../components/Documents/DocumentHistoryTab';

describe('resolveFullDocumentHistory keeps every DAR', () => {
  const doc = { code: 'SOP-QA-01', revision_history: [{ revision: '00', dar_no: 'HIST-00', type: 'NEW' }] };
  const dars = [
    { id: 'a', dar_no: 'DAR-26-001', doc_code: 'SOP-QA-01', revision: '01', type: 'REVISION' },
    { id: 'b', dar_no: 'DAR-26-002', doc_code: 'SOP-QA-01', revision: '01', type: 'REVISION' },
    { id: 'c', dar_no: 'DAR-26-003', doc_code: 'SOP-QA-01', revision: '02', type: 'OBSOLETE' },
  ];

  it('does not collapse two DARs of the same revision', () => {
    const nos = resolveFullDocumentHistory(doc, dars).map((d) => d.dar_no);
    expect(nos).toContain('DAR-26-001');
    expect(nos).toContain('DAR-26-002');
  });

  it('adds embedded history only for revisions with no real DAR', () => {
    const nos = resolveFullDocumentHistory(doc, dars).map((d) => d.dar_no);
    expect(nos).toContain('HIST-00');
    const withReal00 = resolveFullDocumentHistory(doc, [...dars, { id: 'z', dar_no: 'DAR-25-001', doc_code: 'SOP-QA-01', revision: '00', type: 'NEW' }]).map((d) => d.dar_no);
    expect(withReal00).not.toContain('HIST-00');
  });
});
