// Copies the controlled files from Cloudflare R2 into Azure Blob Storage and proves every copy.
//
//   1. Mirror the R2 bucket to a folder (R2 speaks the S3 protocol; rclone does this):  rclone copy r2:qms-files ./r2-mirror
//   2. Point at the target storage:  AZURE_STORAGE_ACCOUNT=<account> (managed identity / az login)  or
//                                    AZURE_STORAGE_CONNECTION_STRING=...   and optionally AZURE_STORAGE_CONTAINER (default qms-files)
//   3. Point at the already-moved PostgreSQL, so every file the database refers to is checked:  DATABASE_URL=postgres://...
//   4. Run:  node scripts/migrate-files-to-blob.js --source-dir ./r2-mirror --report files-report.json
//
// Every file is read back from Blob Storage and compared by sha256; nothing is overwritten or deleted. The exit code is
// not 0 when a copy fails or when the database refers to a file that is not in the mirror or whose hash differs.
import { writeFileSync } from 'node:fs';
import pg from 'pg';
import { exactIntegers } from '../src/db/pg/dataMove.js';
import { createBlobStore } from '../src/node/blobStore.js';
import { readBlobSettings } from '../src/node/config.js';
import { moveFiles, referencedFiles } from '../src/node/fileMove.js';

const args = process.argv.slice(2);
const option = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const sourceDir = option('--source-dir');
const reportPath = option('--report');
const skipDatabase = args.includes('--skip-database-check');
const storage = readBlobSettings();

const fail = (message) => {
  console.error(message);
  process.exit(2);
};
if (!sourceDir) fail('Usage: node scripts/migrate-files-to-blob.js --source-dir <folder> [--report report.json] [--skip-database-check]');
if (storage.problems.length) fail(`Storage settings:\n- ${storage.problems.join('\n- ')}`);
if (!storage.blob) fail('Set AZURE_STORAGE_ACCOUNT or AZURE_STORAGE_CONNECTION_STRING.');
if (!skipDatabase && !process.env.DATABASE_URL) fail('Set DATABASE_URL so the files the database refers to can be checked (or pass --skip-database-check and say so in the record).');

const store = createBlobStore(storage.blob);
let client;
try {
  await store.ready();
  let expected = [];
  if (!skipDatabase) {
    client = new pg.Client({ connectionString: process.env.DATABASE_URL, types: exactIntegers });
    await client.connect();
    expected = await referencedFiles(async (sql) => (await client.query(sql)).rows.map((r) => ({ ...r, size: r.size == null ? undefined : Number(r.size) })));
  }
  const result = await moveFiles({ sourceDir, store, expected, log: (line) => console.log(line) });
  const copied = result.files.filter((f) => f.action === 'copied').length;
  console.log(`\n${result.files.length} files in the mirror: ${copied} copied, ${result.files.length - copied} already in Blob Storage, each read back and compared by sha256.`);
  if (skipDatabase) console.log('The database check was SKIPPED.');
  else console.log(`The database refers to ${expected.length} files.`);
  if (result.unreferenced.length) console.log(`Files no database row refers to (kept, e.g. audit tombstones): ${result.unreferenced.length}`);
  let problem = false;
  if (result.missing.length) {
    problem = true;
    console.error(`\nREFERRED TO BY THE DATABASE BUT NOT IN THE MIRROR (${result.missing.length}):`);
    for (const m of result.missing) console.error(`  ${m.key}   (${m.source})`);
  }
  if (result.changed.length) {
    problem = true;
    console.error(`\nDIFFERENT FROM WHAT THE DATABASE RECORDED (${result.changed.length}):`);
    for (const c of result.changed) console.error(`  ${c.key}   recorded ${c.recorded}, actual ${c.actual}   (${c.source})`);
  }
  if (reportPath) {
    writeFileSync(reportPath, JSON.stringify({ movedAt: new Date().toISOString(), sourceDir, container: storage.blob.container, databaseChecked: !skipDatabase, ...result }, null, 2));
    console.log(`Report written to ${reportPath}`);
  }
  if (problem) process.exitCode = 1;
  else console.log('\nDone: nothing missing, nothing different.');
} catch (err) {
  console.error(`\nNOT FINISHED. ${err.message}`);
  process.exitCode = 1;
} finally {
  await client?.end().catch(() => {});
}
