const RecallEscalationJob = require('./RecallEscalationJob');

describe('RecallEscalationJob', () => {
  let mockClient;
  let job;

  beforeEach(() => {
    mockClient = {
      query: jest.fn(),
      release: jest.fn()
    };
    const pool = {
      connect: jest.fn().mockResolvedValue(mockClient)
    };
    job = new RecallEscalationJob(pool);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should commit immediately if no overdue recalls are found', async () => {
    mockClient.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // SELECT
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    await job.processEscalations();

    expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
    expect(mockClient.query).toHaveBeenCalledWith(expect.stringContaining('SELECT'));
    expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    expect(mockClient.release).toHaveBeenCalled();
  });

  it('should escalate overdue recalls and commit', async () => {
    const mockRecalls = [
      {
        recall_id: 1,
        superseded_doc_id: 'DOC-001',
        department_id: 'QA',
        custodian_name: 'John Doe',
        recalled_at: new Date('2023-01-01')
      }
    ];

    mockClient.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: mockRecalls }) // SELECT
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    await job.processEscalations();

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Found 1 overdue recalls'));
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('[ESCALATION] Alerting Manager of QA: Custodian John Doe in QA has not returned CC for DOC-001'));
    expect(mockClient.query).toHaveBeenCalledWith('COMMIT');

    consoleSpy.mockRestore();
  });

  it('should rollback on error', async () => {
    mockClient.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockRejectedValueOnce(new Error('Database error')); // SELECT

    await expect(job.processEscalations()).rejects.toThrow('Database error');

    expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    expect(mockClient.release).toHaveBeenCalled();
  });
});
