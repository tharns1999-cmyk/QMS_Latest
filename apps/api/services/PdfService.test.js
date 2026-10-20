const PdfService = require('./PdfService');
const PdfStamper = require('../utils/PdfStamper');


// Mock PdfStamper to avoid actual PDF manipulation during unit tests unless specifically testing it
jest.mock('../utils/PdfStamper', () => ({
  stampUncontrolled: jest.fn().mockResolvedValue(Buffer.from('stamped_uncontrolled')),
  stampControlled: jest.fn().mockResolvedValue(Buffer.from('stamped_controlled'))
}));

describe('PdfService', () => {
  let pool;
  let client;
  let service;

  beforeEach(() => {
    client = {
      query: jest.fn(),
      release: jest.fn()
    };
    pool = {
      connect: jest.fn().mockResolvedValue(client)
    };
    service = new PdfService(pool);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('printUncontrolled', () => {
    it('should fetch original PDF and stamp as uncontrolled', async () => {
      // Mock the internal fetch method
      service._fetchOriginalPdf = jest.fn().mockResolvedValue(Buffer.from('original_pdf'));

      const result = await service.printUncontrolled('doc-123');

      expect(service._fetchOriginalPdf).toHaveBeenCalledWith('doc-123');
      expect(PdfStamper.stampUncontrolled).toHaveBeenCalledWith(Buffer.from('original_pdf'));
      expect(result).toEqual(Buffer.from('stamped_uncontrolled'));
    });
  });

  describe('issueControlledCopy', () => {
    it('should generate CC, insert instance into DB, and return stamped PDF', async () => {
      // Mock the internal fetch method
      service._fetchOriginalPdf = jest.fn().mockResolvedValue(Buffer.from('original_pdf'));

      // Mock DB insertion
      client.query
        .mockResolvedValueOnce() // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: 'instance-456' }] }) // INSERT
        .mockResolvedValueOnce(); // COMMIT

      const result = await service.issueControlledCopy('doc-123', 'slot-123', 'CC-001', 'QA');

      expect(client.query).toHaveBeenNthCalledWith(1, 'BEGIN');
      expect(client.query).toHaveBeenNthCalledWith(2, expect.stringContaining('INSERT INTO controlled_copy_instances'), ['slot-123']);
      expect(client.query).toHaveBeenNthCalledWith(3, 'COMMIT');
      expect(client.release).toHaveBeenCalled();

      expect(service._fetchOriginalPdf).toHaveBeenCalledWith('doc-123');
      expect(PdfStamper.stampControlled).toHaveBeenCalledWith(Buffer.from('original_pdf'), {
        ccNumber: 'CC-001',
        department: 'QA',
        issueNumber: '01'
      });

      expect(result).toEqual({
        instanceId: 'instance-456',
        stampedBuffer: Buffer.from('stamped_controlled')
      });
    });

    it('should rollback transaction on error', async () => {
      service._fetchOriginalPdf = jest.fn().mockRejectedValue(new Error('Fetch failed'));

      client.query
        .mockResolvedValueOnce() // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: 'instance-456' }] }); // INSERT

      await expect(service.issueControlledCopy('doc-123', 'slot-123', 'CC-001', 'QA')).rejects.toThrow('Fetch failed');

      expect(client.query).toHaveBeenCalledWith('ROLLBACK');
      expect(client.release).toHaveBeenCalled();
    });
  });
});
