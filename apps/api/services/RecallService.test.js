const RecallService = require('./RecallService');

describe('RecallService', () => {
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
    service = new RecallService(pool);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should generate recall campaign and items for active copies', async () => {
    client.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: 'campaign-123' }] }) // INSERT campaign
      .mockResolvedValueOnce({ // SELECT active copies
        rows: [
          { id: 'inst-1', department_id: 'QA', custodian_name: 'John Doe' },
          { id: 'inst-2', department_id: 'QC', custodian_name: 'Jane Doe' }
        ]
      })
      .mockResolvedValueOnce({}) // INSERT recall items
      .mockResolvedValueOnce({}); // COMMIT

    const result = await service.generateRecallCampaign('doc-r01', 'doc-r02');

    expect(client.query).toHaveBeenNthCalledWith(1, 'BEGIN');
    
    // Campaign insertion
    expect(client.query).toHaveBeenNthCalledWith(2, expect.stringContaining('INSERT INTO recall_campaigns'), ['doc-r01', 'doc-r02']);
    
    // Fetch active copies
    expect(client.query).toHaveBeenNthCalledWith(3, expect.stringContaining('SELECT cci.id'), ['doc-r01']);
    
    // Insert recall items
    expect(client.query).toHaveBeenNthCalledWith(4, expect.stringContaining('INSERT INTO controlled_copy_recalls'), ['inst-1', 'campaign-123', 'inst-2', 'campaign-123']);
    
    expect(client.query).toHaveBeenNthCalledWith(5, 'COMMIT');
    expect(client.release).toHaveBeenCalled();

    expect(result.campaignId).toBe('campaign-123');
    expect(result.itemsRecalled).toBe(2);
  });

  it('should handle no active copies gracefully', async () => {
    client.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: 'campaign-123' }] }) // INSERT campaign
      .mockResolvedValueOnce({ rows: [] }) // SELECT active copies (empty)
      .mockResolvedValueOnce({}); // COMMIT

    const result = await service.generateRecallCampaign('doc-r01', 'doc-r02');

    expect(client.query).not.toHaveBeenCalledWith(expect.stringContaining('INSERT INTO controlled_copy_recalls'));
    expect(client.query).toHaveBeenCalledWith('COMMIT');
    expect(result.itemsRecalled).toBe(0);
  });
});
