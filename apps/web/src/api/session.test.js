import { describe, it, expect, vi, afterEach } from 'vitest';
import { loadDocuments } from './session';
import useStore from '../store/useStore';

const json = (body) => Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
const row = (id) => ({ id, doc_code: id.toUpperCase(), doc_type: 'SOP', revision: '00', name: id, department: 'QA', status: 'EFFECTIVE', access_scope: 'GENERAL' });

describe('loadDocuments', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('keeps asking the server for the next page until it says there is no more', async () => {
    const fetch = vi.fn((url) => {
      if (url.includes('/api/periodic-reviews')) return json({ reviews: [] });
      if (!url.includes('status=EFFECTIVE')) return json({ documents: [], more: false });
      return url.includes('offset=0') ? json({ documents: [row('a'), row('b')], more: true }) : json({ documents: [row('c')], more: false });
    });
    vi.stubGlobal('fetch', fetch);
    useStore.setState({ documents: [], externalDocuments: [], tasks: [], periodicReviewSchedules: [], masterUsers: [] });
    await loadDocuments();
    expect(useStore.getState().documents.map((d) => d.id)).toEqual(['a', 'b', 'c']);
    expect(fetch.mock.calls.map(([u]) => u).filter((u) => u.includes('status=EFFECTIVE'))).toHaveLength(2);
  });
});
