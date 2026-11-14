// A file store on Azure Blob Storage that answers like the R2 bucket the handlers were written against (put, get, head,
// list, delete), so the handlers do not change. Files are reached only through the API, never through a public link.
//
// Sign-in: on Azure the app uses its managed identity (no key to store or leak); a connection string is accepted for
// the Azurite emulator and for a developer machine.
import { BlobServiceClient } from '@azure/storage-blob';
import { DefaultAzureCredential } from '@azure/identity';

const bytesOf = async (value) => {
  if (typeof value === 'string') return new TextEncoder().encode(value);
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  return new Uint8Array(await new Response(value).arrayBuffer());
};

const notFound = (err) => err?.statusCode === 404 || err?.code === 'BlobNotFound';

// Azure keeps blob names as given but a name ending in "." or "/" or holding a "." / ".." segment is rewritten or
// refused by the service. The application never builds such keys; refusing them here beats storing under another name.
const checkKey = (key) => {
  if (typeof key !== 'string' || !key || key.length > 1024 || key.endsWith('.') || key.endsWith('/') || key.split('/').some((part) => part === '' || part === '.' || part === '..')) {
    throw new Error(`The key "${String(key).slice(0, 80)}" cannot be stored in Azure Blob Storage`);
  }
};

// Metadata travels as HTTP headers, which carry only plain ASCII. Values are percent-encoded on the way in and decoded
// on the way out, so Thai text and any other character come back exactly. Names must be identifiers.
const METADATA_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
const encodeMetadata = (custom = {}) => {
  const out = {};
  for (const [name, value] of Object.entries(custom)) {
    if (!METADATA_NAME.test(name)) throw new Error(`Metadata name "${name}" is not allowed in Azure Blob Storage (letters, digits and underscore, not starting with a digit)`);
    out[name] = encodeURIComponent(String(value));
  }
  return out;
};
const decodeMetadata = (stored = {}) => {
  const out = {};
  for (const [name, value] of Object.entries(stored)) {
    try { out[name] = decodeURIComponent(value); } catch { out[name] = value; }
  }
  return out;
};

// A header holds ASCII only. Anything else in a descriptive header (a Thai file name in Content-Disposition) is
// written as %XX so the upload is accepted instead of failing.
const headerSafe = (text) => (text ? String(text).replace(/[^\x20-\x7e]/g, (ch) => encodeURIComponent(ch)) : undefined);

export const createBlobStore = ({ container, connectionString, account, credential = () => new DefaultAzureCredential() }) => {
  if (!container) throw new Error('A blob container name is required');
  const service = connectionString
    ? BlobServiceClient.fromConnectionString(connectionString, { retryOptions: { maxTries: 4 } })
    : new BlobServiceClient(`https://${account}.blob.core.windows.net`, credential(), { retryOptions: { maxTries: 4 } });
  const containerClient = service.getContainerClient(container);

  const describe = (key, props) => ({
    key,
    size: props.contentLength ?? props.size,
    uploaded: props.lastModified,
    httpEtag: props.etag,
    httpMetadata: { contentType: props.contentType, contentDisposition: props.contentDisposition },
    customMetadata: decodeMetadata(props.metadata),
    writeHttpMetadata: (headers) => {
      if (props.contentType) headers.set('content-type', props.contentType);
    }
  });

  return {
    // Fails at start-up, not on the first upload, when the container is missing or the identity has no access.
    ready: async () => {
      await containerClient.getProperties();
    },

    put: async (key, value, options = {}) => {
      checkKey(key);
      const bytes = await bytesOf(value);
      const http = options.httpMetadata || {};
      const blob = containerClient.getBlockBlobClient(key);
      // Replaces the whole blob in one commit: a reader sees the old file or the new one, never half of either.
      await blob.uploadData(bytes, {
        blobHTTPHeaders: { blobContentType: http.contentType, blobContentDisposition: headerSafe(http.contentDisposition) },
        metadata: encodeMetadata(options.customMetadata)
      });
      // What the store now holds, not what was meant to be sent.
      return describe(key, await blob.getProperties());
    },

    head: async (key) => {
      checkKey(key);
      try {
        return describe(key, await containerClient.getBlobClient(key).getProperties());
      } catch (err) {
        if (notFound(err)) return null;
        throw err;
      }
    },

    get: async (key) => {
      checkKey(key);
      const blob = containerClient.getBlobClient(key);
      let bytes;
      let props;
      try {
        // One read gives the bytes and the properties of the same version of the blob.
        const response = await blob.download(0);
        props = response;
        const chunks = [];
        for await (const chunk of response.readableStreamBody) chunks.push(chunk);
        bytes = new Uint8Array(Buffer.concat(chunks));
      } catch (err) {
        if (notFound(err)) return null;
        throw err;
      }
      const copy = () => bytes.slice();
      return {
        ...describe(key, props),
        size: bytes.byteLength,
        body: new Response(copy()).body,
        arrayBuffer: async () => copy().buffer,
        text: async () => new TextDecoder().decode(bytes),
        json: async () => JSON.parse(new TextDecoder().decode(bytes))
      };
    },

    list: async ({ prefix = '' } = {}) => {
      const found = [];
      for await (const item of containerClient.listBlobsFlat({ prefix, includeMetadata: true })) {
        found.push(describe(item.name, { ...item.properties, metadata: item.metadata }));
      }
      found.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
      return { objects: found, truncated: false };
    },

    delete: async (keys) => {
      for (const key of [].concat(keys)) {
        checkKey(key);
        await containerClient.getBlobClient(key).deleteIfExists();
      }
    }
  };
};
