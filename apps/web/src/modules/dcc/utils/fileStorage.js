import { apiBlob } from '../../../api/client';

const DB_NAME = 'QMS_Files';
const STORE_NAME = 'attachments';
const DB_VERSION = 1;

// In-Memory Binary Registry (Lossless Session Registry)
export const inMemoryBlobRegistry = new Map();

// Dedicated Pristine Raw Blob Registry (Guaranteed unstamped session storage)
export const rawBlobRegistry = new Map();

export const initDB = () => {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      return reject(new Error('IndexedDB is not supported in this environment'));
    }
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = (e) => {
        if (!e.target.result.objectStoreNames.contains(STORE_NAME)) {
          e.target.result.createObjectStore(STORE_NAME);
        }
      };
      request.onsuccess = (e) => resolve(e.target.result);
      request.onerror = (e) => reject(e.target.error);
    } catch (err) {
      reject(err);
    }
  });
};

export const saveFile = async (key, fileOrBlob) => {
  if (!key) return null;
  const strKey = String(key);
  
  // 1. Immediately store into In-Memory Binary Registries (guarantees synchronous-like availability)
  inMemoryBlobRegistry.set(strKey, fileOrBlob);
  rawBlobRegistry.set(strKey, fileOrBlob);

  // 2. Persist to IndexedDB asynchronously
  try {
    const db = await initDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.put(fileOrBlob, strKey);
      request.onsuccess = () => resolve(strKey);
      request.onerror = (e) => reject(e.target.error);
    });
  } catch (err) {
    // If IndexedDB fails (e.g. sandbox, private browsing), in-memory registry still has it!
    console.warn(`IndexedDB saveFile failed for ${strKey}, falling back to In-Memory Registry:`, err);
    return strKey;
  }
};

export const getFile = async (key) => {
  if (!key) return null;
  const strKey = String(key);

  // 1. Check In-Memory Registries first (instant cache hit)
  if (rawBlobRegistry.has(strKey)) {
    return rawBlobRegistry.get(strKey);
  }
  if (inMemoryBlobRegistry.has(strKey)) {
    return inMemoryBlobRegistry.get(strKey);
  }

  // 2. Retrieve from IndexedDB
  try {
    const db = await initDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(strKey);
      request.onsuccess = () => {
        const result = request.result;
        if (result) {
          // Warm up in-memory registries
          inMemoryBlobRegistry.set(strKey, result);
          rawBlobRegistry.set(strKey, result);
        }
        resolve(result || null);
      };
      request.onerror = (e) => reject(e.target.error);
    });
  } catch (err) {
    console.warn(`IndexedDB getFile failed for ${strKey}:`, err);
    return null;
  }
};

export const deleteFile = async (key) => {
  if (!key) return;
  const strKey = String(key);
  inMemoryBlobRegistry.delete(strKey);
  rawBlobRegistry.delete(strKey);
  try {
    const db = await initDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.delete(strKey);
      request.onsuccess = () => resolve();
      request.onerror = (e) => reject(e.target.error);
    });
  } catch (err) {
    console.warn(`IndexedDB deleteFile failed for ${strKey}:`, err);
  }
};

/**
 * Universal Resolver: Extract real PDF Blob from any document or attachment object variation
 * Reconciles: attachedFile, fileId, file, fileData, blob, pdfBlob, pdfUrl, id, edCode
 */
export const resolveFileBlob = async (target, fallbackKey = null, { purpose } = {}) => {
  if (!target) {
    if (fallbackKey) return await getFile(fallbackKey);
    return null;
  }

  // 1. Direct Blob or File instance
  if (typeof Blob !== 'undefined' && target instanceof Blob) {
    return target;
  }

  // 2. Direct ArrayBuffer or Uint8Array
  if (target instanceof ArrayBuffer) {
    return new Blob([target], { type: 'application/pdf' });
  }
  if (ArrayBuffer.isView(target)) {
    return new Blob([target.buffer], { type: 'application/pdf' });
  }

  // 3. String input
  if (typeof target === 'string') {
    if (target.startsWith('data:')) {
      try {
        const res = await fetch(target);
        return await res.blob();
      } catch { /* continue */ }
    }
    const retrieved = await getFile(target);
    if (retrieved) return retrieved;
  }

  // 4. Object properties examination
  if (typeof target === 'object') {
    // API mode: the controlled PDF lives in R2 behind the API.
    if (target.apiFilePath) return await apiBlob(target.apiFilePath, { purpose });

    // Check direct binary fields on target
    const directBinaryFields = [
      // Nested file Blob stored inside attachedFile object (same-session in-memory)
      target.attachedFile?.file,
      target.attachedFile?.blob,
      target.attachedFile,
      target.file,
      target.fileBlob,
      target.blob,
      target.pdfBlob,
      target.attachment,
      target.attachmentFile
    ];

    for (const field of directBinaryFields) {
      if (typeof Blob !== 'undefined' && field instanceof Blob) {
        return field;
      }
      if (field instanceof ArrayBuffer) {
        return new Blob([field], { type: 'application/pdf' });
      }
      if (ArrayBuffer.isView(field)) {
        return new Blob([field.buffer], { type: 'application/pdf' });
      }
    }

    // Check Data URL string fields
    const dataUrlFields = [
      target.fileData,
      target.dataUrl,
      target.pdfUrl,
      typeof target.attachedFile === 'string' ? target.attachedFile : null,
      typeof target.file === 'string' ? target.file : null
    ];
    for (const dataUrl of dataUrlFields) {
      if (typeof dataUrl === 'string' && dataUrl.startsWith('data:')) {
        try {
          const res = await fetch(dataUrl);
          return await res.blob();
        } catch { /* continue */ }
      }
    }

    // Check Candidate Keys across all master & external document dimensions (edition/revision-specific keys before shared doc-code keys)
    const docCodeForRev = (target.edCode || target.doc_code || target.docCode || target.document_code || target.docNo || target.code || target.title || '').trim();
    const editionKey = String(target.edition || target.sourceVersion || target.ver_ed || target.version || target.originRev || '').trim();
    const rawRevForKey = target.revision || target.rev || target.doc_version;
    const cleanRevForKey = rawRevForKey !== undefined && rawRevForKey !== null ? String(rawRevForKey).replace(/^rev\.?/i, '').trim() : '';

    const candidateKeys = [
      target.fileStorageKey,
      target.attachedFile?.fileStorageKey,
      // Edition-scoped candidate keys for External Documents (must precede shared edCode/doc_code keys)
      docCodeForRev && editionKey ? `FILE_${docCodeForRev}_ED_${editionKey}` : null,
      docCodeForRev && editionKey ? `DOC_${docCodeForRev}_ED_${editionKey}` : null,
      docCodeForRev && editionKey ? `FILE_${docCodeForRev}_${editionKey}` : null,
      docCodeForRev && editionKey ? `DOC_${docCodeForRev}_${editionKey}` : null,
      // Revision-scoped candidate keys for Internal Documents (must precede shared doc_code keys)
      docCodeForRev && cleanRevForKey ? `FILE_${docCodeForRev}_REV_${cleanRevForKey}` : null,
      docCodeForRev && cleanRevForKey ? `DOC_${docCodeForRev}_REV_${cleanRevForKey}` : null,
      docCodeForRev && cleanRevForKey ? `DOC_${docCodeForRev}_REV${cleanRevForKey}` : null,
      docCodeForRev && cleanRevForKey ? `FILE_${docCodeForRev}_REV${cleanRevForKey}` : null,
      docCodeForRev && cleanRevForKey ? `DOC_${docCodeForRev}_REV${cleanRevForKey.padStart(2, '0')}` : null,
      docCodeForRev && cleanRevForKey ? `FILE_${docCodeForRev}_REV${cleanRevForKey.padStart(2, '0')}` : null,
      docCodeForRev && cleanRevForKey ? `FILE_${docCodeForRev}_${cleanRevForKey}` : null,
      // Explicit file blob identifiers
      target.rawFileId && target.rawFileId !== docCodeForRev ? target.rawFileId : null,
      target.attachedFile?.rawFileId && target.attachedFile?.rawFileId !== docCodeForRev ? target.attachedFile.rawFileId : null,
      target.attachedFile?.fileId && target.attachedFile?.fileId !== docCodeForRev ? target.attachedFile.fileId : null,
      target.attachedFile?.id && target.attachedFile?.id !== docCodeForRev ? target.attachedFile.id : null,
      target.attachedFile?.key && target.attachedFile?.key !== docCodeForRev ? target.attachedFile.key : null,
      target.fileId && target.fileId !== docCodeForRev ? target.fileId : null,
      target.file_id && target.file_id !== docCodeForRev ? target.file_id : null,
      target.attachment?.fileId,
      target.attachment?.id,
      target.file?.fileId,
      target.file?.id,
      typeof target.file === 'string' && !target.file.includes(' ') && target.file.length > 3 && target.file !== docCodeForRev ? target.file : null,
      target.id && target.id !== docCodeForRev ? target.id : null,
      // Request / DAR scoped keys
      target.darId,
      target.dar_id,
      target.darNo,
      target.dar_no,
      target.darNumber,
      target.requestId,
      target.requestNo,
      target.edrNumber,
      // Shared document code fallbacks (only after version/edition/fileId keys)
      docCodeForRev ? `FILE_${docCodeForRev}` : null,
      target.rawFileId,
      target.fileId,
      target.id,
      target.doc_code,
      target.docCode,
      target.document_code,
      target.documentCode,
      target.docNo,
      target.code,
      target.title,
      target.edCode,
      fallbackKey
    ].filter(Boolean);

    for (const key of candidateKeys) {
      const file = await getFile(key) || inMemoryBlobRegistry.get(String(key));
      if (file) {
        if (typeof Blob !== 'undefined' && file instanceof Blob) {
          return file;
        }
        if (file instanceof ArrayBuffer) {
          return new Blob([file], { type: 'application/pdf' });
        }
        if (ArrayBuffer.isView(file)) {
          return new Blob([file.buffer], { type: 'application/pdf' });
        }
      }
    }

    // Layer 5: Dynamic DAR store trace fallback (trace originating DAR for approved master docs)
    try {
      const { default: useStore } = await import('../../../store/useStore');
      if (useStore && typeof useStore.getState === 'function') {
        const state = useStore.getState();
        const allDars = [...(state.dars || []), ...(state.darRequests || [])];
        const darIdToFind = target.darId || target.dar_id || target.darNo || target.dar_no || target.darNumber;
        const docCodeToFind = target.docCode || target.document_code || target.doc_code || target.docNo || target.code || target.title;

        const matchedDar = allDars.find(d => 
          (darIdToFind && (String(d.id) === String(darIdToFind) || String(d.darNo) === String(darIdToFind) || String(d.darNumber) === String(darIdToFind))) ||
          (docCodeToFind && (d.docNo === docCodeToFind || d.docIdInput === docCodeToFind || d.document_code === docCodeToFind || d.title === docCodeToFind))
        );

        if (matchedDar) {
          const darKeys = [
            matchedDar.fileId,
            matchedDar.file_id,
            matchedDar.attachedFile?.fileId,
            matchedDar.attachedFile?.id,
            matchedDar.attachment?.fileId,
            matchedDar.file?.fileId,
            matchedDar.id,
            matchedDar.darNo,
            matchedDar.darNumber
          ].filter(Boolean);

          for (const key of darKeys) {
            const file = await getFile(key) || inMemoryBlobRegistry.get(String(key));
            if (file) {
              if (typeof Blob !== 'undefined' && file instanceof Blob) return file;
              if (file instanceof ArrayBuffer) return new Blob([file], { type: 'application/pdf' });
              if (ArrayBuffer.isView(file)) return new Blob([file.buffer], { type: 'application/pdf' });
            }
          }

          const darBinary = [
            matchedDar.attachedFile,
            matchedDar.file,
            matchedDar.fileBlob,
            matchedDar.blob,
            matchedDar.pdfBlob,
            matchedDar.attachment
          ];
          for (const f of darBinary) {
            if (typeof Blob !== 'undefined' && f instanceof Blob) return f;
            if (f instanceof ArrayBuffer) return new Blob([f], { type: 'application/pdf' });
            if (ArrayBuffer.isView(f)) return new Blob([f.buffer], { type: 'application/pdf' });
          }
        }
      }
    } catch {
      // Ignore dynamic store lookup errors
    }
  }

  return null;
};

/**
 * Direct raw blob/data resolver from IndexedDB
 */
export const resolveRawFileBlob = async (key) => {
  return await getFile(key);
};

/**
 * Historical Document Version File Resolver
 * Retrieves the specific file snapshot for a given document code and revision.
 * Prioritizes IndexedDB & In-Memory storage under DOC_${code}_REV${rev} and FILE_${code}_REV${rev}
 */
export const getVersionFileFromStorage = async (docCode, revision) => {
  if (!docCode || revision === undefined || revision === null) return null;
  const cleanCode = String(docCode).trim();
  const cleanRev = String(revision).replace(/^rev\.?/i, '').trim();
  const padRev = cleanRev.padStart(2, '0');
  const candidateKeys = [
    `FILE_${cleanCode}_ED_${cleanRev}`,
    `DOC_${cleanCode}_ED_${cleanRev}`,
    `FILE_${cleanCode}_${cleanRev}`,
    `DOC_${cleanCode}_${cleanRev}`,
    `DOC_${cleanCode}_REV${cleanRev}`,
    `FILE_${cleanCode}_REV${cleanRev}`,
    `DOC_${cleanCode}_REV${padRev}`,
    `FILE_${cleanCode}_REV${padRev}`,
    `DOC_${cleanCode}_REV_${cleanRev}`,
    `FILE_${cleanCode}_REV_${cleanRev}`,
    `DOC_${cleanCode}_REV_${padRev}`,
    `FILE_${cleanCode}_REV_${padRev}`,
    `${cleanCode}_REV_${cleanRev}`,
    `${cleanCode}_REV_${padRev}`
  ];

  for (const k of candidateKeys) {
    const file = await getFile(k) || inMemoryBlobRegistry.get(String(k));
    if (file) {
      if (typeof Blob !== 'undefined' && file instanceof Blob) return file;
      if (file instanceof ArrayBuffer) return new Blob([file], { type: 'application/pdf' });
      if (ArrayBuffer.isView(file)) return new Blob([file.buffer], { type: 'application/pdf' });
      return file;
    }
  }

  return null;
};

export const storeFileBlob = saveFile;
