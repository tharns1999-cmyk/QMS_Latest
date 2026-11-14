import { describe, it, expect, beforeAll, afterAll } from 'vitest';

// The part of the file store the handlers rely on, stated without going through the API. Every store that stands in
// for Cloudflare R2 must give these answers; open() returns { files, close }.
export const describeFileStore = (name, open) => describe(`file store contract: ${name}`, () => {
  let handle;
  let files;
  const prefix = `contract/${Date.now()}/`;
  const PDF = new TextEncoder().encode('%PDF-1.4 contract');

  beforeAll(async () => {
    handle = await open();
    files = handle.files;
  });

  afterAll(async () => {
    const { objects } = await files.list({ prefix });
    if (objects.length) await files.delete(objects.map((o) => o.key));
    await handle?.close();
  });

  it('gives back exactly the bytes that were stored, with the content type', async () => {
    await files.put(`${prefix}a.pdf`, PDF, { httpMetadata: { contentType: 'application/pdf' } });
    const obj = await files.get(`${prefix}a.pdf`);
    expect(new Uint8Array(await new Response(obj.body).arrayBuffer())).toEqual(PDF);
    expect(obj.httpMetadata.contentType).toBe('application/pdf');
    expect(obj.size).toBe(PDF.byteLength);
  });

  it('accepts an ArrayBuffer and a string as well as bytes', async () => {
    await files.put(`${prefix}buffer.bin`, PDF.buffer.slice(0));
    await files.put(`${prefix}text.json`, JSON.stringify({ plan_id: 'p1' }));
    expect(await (await files.get(`${prefix}buffer.bin`)).text()).toBe('%PDF-1.4 contract');
    expect(await (await files.get(`${prefix}text.json`)).json()).toEqual({ plan_id: 'p1' });
  });

  it('answers null for a key that is not there, from get and from head', async () => {
    expect(await files.get(`${prefix}missing`)).toBeNull();
    expect(await files.head(`${prefix}missing`)).toBeNull();
  });

  it('reports size and the custom metadata without the body', async () => {
    await files.put(`${prefix}meta.pdf`, PDF, { customMetadata: { plan_id: 'P-1', attempt_id: 'A-1' } });
    const head = await files.head(`${prefix}meta.pdf`);
    expect(head.size).toBe(PDF.byteLength);
    expect(head.customMetadata).toEqual({ plan_id: 'P-1', attempt_id: 'A-1' });
  });

  it('gives a validator the browser can cache on, and a date it was stored', async () => {
    const obj = await files.get(`${prefix}a.pdf`);
    expect(typeof obj.httpEtag).toBe('string');
    expect(obj.httpEtag.length).toBeGreaterThan(2);
    expect(new Date(obj.uploaded).getTime()).toBeGreaterThan(0);
  });

  it('replaces the content when the same key is stored again', async () => {
    await files.put(`${prefix}same.pdf`, new TextEncoder().encode('first'));
    await files.put(`${prefix}same.pdf`, new TextEncoder().encode('second version'));
    expect(await (await files.get(`${prefix}same.pdf`)).text()).toBe('second version');
    expect((await files.head(`${prefix}same.pdf`)).size).toBe('second version'.length);
  });

  it('lists only keys under the prefix, each with key, size and upload date', async () => {
    await files.put(`${prefix}dars/D1/one.pdf`, PDF);
    await files.put(`${prefix}dars/D1/two.pdf`, PDF);
    await files.put(`${prefix}dars/D2/other.pdf`, PDF);
    const { objects } = await files.list({ prefix: `${prefix}dars/D1/` });
    expect(objects.map((o) => o.key).sort()).toEqual([`${prefix}dars/D1/one.pdf`, `${prefix}dars/D1/two.pdf`]);
    for (const o of objects) {
      expect(o.size).toBe(PDF.byteLength);
      expect(new Date(o.uploaded).getTime()).toBeGreaterThan(0);
    }
  });

  it('deletes one key or a list of keys, and ignores a key that is already gone', async () => {
    await files.put(`${prefix}del/1`, PDF);
    await files.put(`${prefix}del/2`, PDF);
    await files.put(`${prefix}del/3`, PDF);
    await files.delete(`${prefix}del/1`);
    await files.delete([`${prefix}del/2`, `${prefix}del/3`]);
    await files.delete(`${prefix}del/never-existed`);
    expect((await files.list({ prefix: `${prefix}del/` })).objects).toEqual([]);
  });

  it('can be read twice: a stream is not used up by the first reader', async () => {
    await files.put(`${prefix}twice.pdf`, PDF);
    expect((await files.get(`${prefix}twice.pdf`)).size).toBe(PDF.byteLength);
    expect(await (await files.get(`${prefix}twice.pdf`)).text()).toBe('%PDF-1.4 contract');
  });
});
