const AutoEffectiveJob = require('./AutoEffectiveJob');

jest.mock('../services/RecallService', () => {
  return jest.fn().mockImplementation(() => {
    return {
      generateRecallCampaign: jest.fn().mockResolvedValue({})
    };
  });
});

describe('AutoEffectiveJob', () => {
  let pool;
  let client;
  let job;

  beforeEach(() => {
    client = {
      query: jest.fn(),
      release: jest.fn()
    };
    pool = {
      connect: jest.fn().mockResolvedValue(client)
    };
    job = new AutoEffectiveJob(pool);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should transition WAITING_EFFECTIVE to EFFECTIVE and SUPERSEDE previous revision', async () => {
    // Mock WAITING_EFFECTIVE docs
    client.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({ 
        rows: [{ id: 'doc-r02', title: 'DOC-001', rev: '02' }] 
      }) // SELECT waiting docs
      .mockResolvedValueOnce({}) // UPDATE current doc to EFFECTIVE
      .mockResolvedValueOnce({ 
        rowCount: 1, 
        rows: [{ id: 'doc-r01', rev: '01' }] 
      }) // SELECT prev doc
      .mockResolvedValueOnce({}) // UPDATE prev doc to SUPERSEDED
      .mockResolvedValueOnce({}); // COMMIT

    await job.execute();

    expect(client.query).toHaveBeenNthCalledWith(1, 'BEGIN');
    
    // Update R02 to EFFECTIVE
    expect(client.query).toHaveBeenNthCalledWith(3, expect.stringContaining('UPDATE documents SET status = \'EFFECTIVE\''), ['doc-r02']);
    
    // Find R01
    expect(client.query).toHaveBeenNthCalledWith(4, expect.stringContaining('SELECT id, rev'), ['DOC-001', 'doc-r02']);
    
    // Update R01 to SUPERSEDED
    expect(client.query).toHaveBeenNthCalledWith(5, expect.stringContaining('UPDATE documents SET status = \'SUPERSEDED\''), ['doc-r01']);

    // Check if RecallService was called
    expect(job.recallService.generateRecallCampaign).toHaveBeenCalledWith('doc-r01', 'doc-r02');
    
    expect(client.query).toHaveBeenNthCalledWith(6, 'COMMIT');
  });

  it('should skip gracefully if documents table does not exist', async () => {
    const error = new Error('relation "documents" does not exist');
    error.code = '42P01'; // Postgres code for undefined_table
    
    client.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockRejectedValueOnce(error) // SELECT waiting docs fails
      .mockResolvedValueOnce({}); // ROLLBACK

    await job.execute();

    expect(client.query).toHaveBeenNthCalledWith(1, 'BEGIN');
    expect(client.query).toHaveBeenNthCalledWith(3, 'ROLLBACK');
    // Ensure we don't throw an unhandled error for this specific case
  });
});
