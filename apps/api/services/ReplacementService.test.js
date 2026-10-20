const ReplacementService = require('./ReplacementService');

const PdfStamper = require('../utils/PdfStamper');

jest.mock('../utils/PdfStamper', () => ({
  stampControlled: jest.fn().mockResolvedValue(Buffer.from('stamped_replacement'))
}));

describe('ReplacementService', () => {
  let pool;
  let client;
  let pdfService;
  let service;

  beforeEach(() => {
    client = {
      query: jest.fn(),
      release: jest.fn()
    };
    pool = {
      connect: jest.fn().mockResolvedValue(client)
    };
    pdfService = {
      _fetchOriginalPdf: jest.fn().mockResolvedValue(Buffer.from('original'))
    };
    service = new ReplacementService(pool, pdfService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should successfully replace a DAMAGED instance and increment issue_number', async () => {
    // 0. BEGIN
    client.query.mockResolvedValueOnce({});

    // 1. Fetch old instance
    client.query.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{
        slot_id: 'slot-1',
        issue_number: '01',
        cc_number: 'CC-001',
        distribution_id: 'dist-1',
        department_id: 'QA'
      }]
    });

    // 2. Update old instance
    client.query.mockResolvedValueOnce({});

    // 3. Max issue query
    client.query.mockResolvedValueOnce({
      rows: [{ max_issue: '01' }]
    });

    // 4. Insert new instance
    client.query.mockResolvedValueOnce({
      rows: [{ id: 'new-instance-1' }]
    });

    // 5. Insert recall log
    client.query.mockResolvedValueOnce({});

    // Commit
    client.query.mockResolvedValueOnce({});

    const result = await service.replaceInstance('doc-1', 'old-inst', 'DAMAGED', 'Torn cover');

    // Assertions
    expect(client.query).toHaveBeenNthCalledWith(1, 'BEGIN');
    
    // Status update
    expect(client.query).toHaveBeenNthCalledWith(3, expect.stringContaining('UPDATE controlled_copy_instances'), ['DAMAGED', 'old-inst']);
    
    // Max issue check
    expect(client.query).toHaveBeenNthCalledWith(4, expect.stringContaining('SELECT MAX(issue_number)'), ['slot-1']);
    
    // Insert new with '02'
    expect(client.query).toHaveBeenNthCalledWith(5, expect.stringContaining('INSERT INTO controlled_copy_instances'), ['slot-1', '02']);

    // Recall log
    expect(client.query).toHaveBeenNthCalledWith(6, expect.stringContaining('INSERT INTO controlled_copy_recalls'), ['old-inst', 'Torn cover']);

    expect(client.query).toHaveBeenCalledWith('COMMIT');

    expect(PdfStamper.stampControlled).toHaveBeenCalledWith(Buffer.from('original'), {
      ccNumber: 'CC-001',
      department: 'QA',
      issueNumber: '02'
    });

    expect(result.newInstanceId).toBe('new-instance-1');
    expect(result.ccNumber).toBe('CC-001');
  });

  it('should throw an error if instance not found and rollback', async () => {
    client.query.mockResolvedValueOnce({}); // BEGIN
    client.query.mockResolvedValueOnce({ rowCount: 0 }); // Fetch old instance fails

    await expect(service.replaceInstance('doc-1', 'old-inst', 'LOST', 'Lost')).rejects.toThrow('Instance not found');

    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
    expect(client.release).toHaveBeenCalled();
  });
});
