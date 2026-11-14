// Copies the controlled files (PDFs, certificates, audit tombstones) from a folder mirror of the Cloudflare R2 bucket
// into the file store the API now uses, and proves each copy by reading it back from the store and comparing sha256.
//
// It never overwrites: a key that already holds different bytes stops the move. Run it again after a failure and the
// files already in place are checked and skipped. Nothing is deleted from the source.
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

export const sha256Of = (bytes) => createHash('sha256').update(bytes).digest('hex');

const TYPES = { '.pdf': 'application/pdf', '.json': 'application/json' };
const contentTypeOf = (key) => TYPES[key.slice(key.lastIndexOf('.')).toLowerCase()] || 'application/octet-stream';

// Every file under the folder; the key is the path below it with "/" separators, the way R2 keys are written.
export const listFolder = async (root) => {
  const found = [];
  const walk = async (dir) => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile()) found.push({ key: relative(root, path).split(sep).join('/'), path });
    }
  };
  await walk(root);
  return found.sort((a, b) => (a.key < b.key ? -1 : 1));
};

// expected: what the database says exists, [{ key, source, sha256?, size? }]. The source folder must hold every one of
// them, and where the database recorded a hash or a size the file must match it.
export const moveFiles = async ({ sourceDir, store, expected = [], log = () => {} }) => {
  const files = await listFolder(sourceDir);
  if (!files.length) throw new Error(`No files found in ${sourceDir}; refusing to continue.`);

  const moved = [];
  const copiedNow = [];
  for (const file of files) {
    const bytes = new Uint8Array(await readFile(file.path));
    const sha256 = sha256Of(bytes);
    const existing = await store.get(file.key);
    if (existing) {
      const there = new Uint8Array(await existing.arrayBuffer());
      if (sha256Of(there) !== sha256) throw new Error(`${file.key}: the store already holds a different file under this key; nothing was overwritten`);
      moved.push({ key: file.key, size: bytes.byteLength, sha256, action: 'already there' });
      continue;
    }
    await store.put(file.key, bytes, { httpMetadata: { contentType: contentTypeOf(file.key) } });
    copiedNow.push(file.key);
    const back = await store.get(file.key);
    const backBytes = back ? new Uint8Array(await back.arrayBuffer()) : null;
    if (!backBytes || backBytes.byteLength !== bytes.byteLength || sha256Of(backBytes) !== sha256) {
      // Take back only what this run wrote, so a half-moved set is never mistaken for a finished one.
      await store.delete(copiedNow);
      throw new Error(`${file.key}: what the store returned is not what was sent; the files copied in this run were removed`);
    }
    moved.push({ key: file.key, size: bytes.byteLength, sha256, action: 'copied' });
    log(`${file.key}: ${bytes.byteLength} bytes copied and read back`);
  }

  // Compare with the database: every file it points at must be here and, where it recorded a hash or size, unchanged.
  const have = new Map(moved.map((m) => [m.key, m]));
  const missing = [];
  const changed = [];
  for (const want of expected) {
    const got = have.get(want.key);
    if (!got) {
      missing.push({ key: want.key, source: want.source });
      continue;
    }
    if (want.sha256 && want.sha256.toLowerCase() !== got.sha256) changed.push({ key: want.key, source: want.source, recorded: want.sha256, actual: got.sha256 });
    else if (want.size != null && Number(want.size) !== got.size) changed.push({ key: want.key, source: want.source, recorded: `${want.size} bytes`, actual: `${got.size} bytes` });
  }
  const wanted = new Set(expected.map((e) => e.key));
  const unreferenced = moved.filter((m) => !wanted.has(m.key)).map((m) => m.key);
  return { files: moved, missing, changed, unreferenced };
};

// The keys the database points at, from a function that runs SQL and returns rows.
export const referencedFiles = async (query) => {
  const found = [];
  const add = async (sql, source) => {
    for (const row of await query(sql)) found.push({ key: row.key, source, sha256: row.hash || undefined, size: row.size ?? undefined });
  };
  await add('SELECT file_key AS key FROM documents WHERE file_key IS NOT NULL', 'documents.file_key');
  await add('SELECT file_key AS key FROM dars WHERE file_key IS NOT NULL', 'dars.file_key');
  await add('SELECT pdf_file_key AS key FROM vcc_annual_plans WHERE pdf_file_key IS NOT NULL', 'vcc_annual_plans.pdf_file_key');
  await add('SELECT certificate_file_key AS key, certificate_file_hash AS hash FROM vcc_work_orders WHERE certificate_file_key IS NOT NULL', 'vcc_work_orders.certificate_file_key');
  await add('SELECT file_key AS key, file_hash AS hash, file_size AS size FROM vcc_work_order_certificates', 'vcc_work_order_certificates.file_key');
  return found;
};
