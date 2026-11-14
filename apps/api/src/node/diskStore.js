// A file store on a local folder that answers like the R2 bucket the handlers were written against. It lets the API run
// on a plain Node host before the Azure Blob store is in place, and in development.
//
// Keys are never used as paths: each object lives in <root>/objects/<sha256 of key> with its description beside it in
// <root>/meta/<sha256 of key>.json, so a key such as "../x" cannot reach outside the folder.
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const hashOf = (key) => createHash('sha256').update(key).digest('hex');

const bytesOf = async (value) => {
  if (typeof value === 'string') return new TextEncoder().encode(value);
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  return new Uint8Array(await new Response(value).arrayBuffer());
};

// Write beside the target and move into place, so a reader never sees half a file.
const writeAtomically = async (path, data) => {
  const temp = `${path}.${randomUUID()}.tmp`;
  await writeFile(temp, data);
  try {
    await rename(temp, path);
  } catch (err) {
    // Windows refuses to replace a file another process has open for a moment.
    await new Promise((resolve) => setTimeout(resolve, 25));
    await rename(temp, path).catch(async () => {
      await rm(temp, { force: true });
      throw err;
    });
  }
};

export const createDiskStore = (root) => {
  const objects = join(root, 'objects');
  const metas = join(root, 'meta');
  const ready = Promise.all([mkdir(objects, { recursive: true }), mkdir(metas, { recursive: true })]);

  const readMeta = async (key) => {
    await ready;
    try {
      return JSON.parse(await readFile(join(metas, `${hashOf(key)}.json`), 'utf8'));
    } catch (err) {
      if (err.code === 'ENOENT') return null;
      throw err;
    }
  };

  const describe = (meta) => ({
    key: meta.key,
    size: meta.size,
    uploaded: new Date(meta.uploaded),
    httpEtag: `"${meta.etag}"`,
    httpMetadata: meta.httpMetadata,
    customMetadata: meta.customMetadata,
    writeHttpMetadata: (headers) => {
      if (meta.httpMetadata.contentType) headers.set('content-type', meta.httpMetadata.contentType);
    }
  });

  return {
    put: async (key, value, options = {}) => {
      await ready;
      const bytes = await bytesOf(value);
      const meta = {
        key,
        size: bytes.byteLength,
        uploaded: new Date().toISOString(),
        etag: createHash('sha256').update(bytes).digest('hex'),
        httpMetadata: options.httpMetadata || {},
        customMetadata: options.customMetadata || {}
      };
      // Content first, description last: an object counts as stored once its description exists.
      await writeAtomically(join(objects, hashOf(key)), bytes);
      await writeAtomically(join(metas, `${hashOf(key)}.json`), JSON.stringify(meta));
      return describe(meta);
    },

    head: async (key) => {
      const meta = await readMeta(key);
      return meta && describe(meta);
    },

    get: async (key) => {
      const meta = await readMeta(key);
      if (!meta) return null;
      let bytes;
      try {
        bytes = new Uint8Array(await readFile(join(objects, hashOf(key))));
      } catch (err) {
        if (err.code === 'ENOENT') return null;
        throw err;
      }
      const copy = () => bytes.slice();
      return {
        ...describe(meta),
        body: new Response(copy()).body,
        arrayBuffer: async () => copy().buffer,
        text: async () => new TextDecoder().decode(bytes),
        json: async () => JSON.parse(new TextDecoder().decode(bytes))
      };
    },

    list: async ({ prefix = '' } = {}) => {
      await ready;
      const found = [];
      for (const name of await readdir(metas)) {
        if (!name.endsWith('.json')) continue;
        const meta = JSON.parse(await readFile(join(metas, name), 'utf8').catch(() => 'null'));
        if (meta && meta.key.startsWith(prefix)) found.push(describe(meta));
      }
      found.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
      return { objects: found, truncated: false };
    },

    delete: async (keys) => {
      await ready;
      for (const key of [].concat(keys)) {
        // Description first: the object stops existing at once, whatever happens to the content file.
        await rm(join(metas, `${hashOf(key)}.json`), { force: true });
        await rm(join(objects, hashOf(key)), { force: true });
      }
    }
  };
};
