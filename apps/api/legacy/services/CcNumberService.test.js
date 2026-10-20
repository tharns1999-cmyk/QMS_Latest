const CcNumberService = require('./CcNumberService');

describe('CcNumberService', () => {
  let mockClient;
  let mockPool;
  let service;

  beforeEach(() => {
    mockClient = {
      query: jest.fn(),
      release: jest.fn(),
    };
    mockPool = {
      connect: jest.fn().mockResolvedValue(mockClient),
    };
    service = new CcNumberService(mockPool);
  });

  describe('previewCcNumbers', () => {
    it('should calculate the next sequences without locking', async () => {
      // Mock existing numbers in the DB
      mockClient.query.mockResolvedValueOnce({
        rows: [{ cc_number: 'CC-001' }, { cc_number: 'CC-005' }]
      });

      const documentId = 'doc-123';
      const departmentId = 'QA';
      const quantity = 2;

      const previews = await service.previewCcNumbers(documentId, departmentId, quantity);

      expect(mockPool.connect).toHaveBeenCalled();
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT s.cc_number'),
        [documentId, departmentId]
      );
      expect(previews).toEqual(['CC-006', 'CC-007']);
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should start at CC-001 if no existing numbers', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [] });

      const previews = await service.previewCcNumbers('doc-1', 'HR', 3);

      expect(previews).toEqual(['CC-001', 'CC-002', 'CC-003']);
    });
  });

  describe('allocateCcNumbers', () => {
    it('should allocate new sequences with a transaction lock', async () => {
      // 1. BEGIN
      mockClient.query.mockResolvedValueOnce({});
      // 2. SELECT ... FOR UPDATE returns an existing distribution ID
      mockClient.query.mockResolvedValueOnce({
        rows: [{ id: 'dist-1' }]
      });
      // 3. SELECT cc_number returns existing numbers
      mockClient.query.mockResolvedValueOnce({
        rows: [{ cc_number: 'CC-002' }]
      });
      // 4 & 5. INSERTS (for quantity = 2)
      mockClient.query.mockResolvedValueOnce({});
      mockClient.query.mockResolvedValueOnce({});
      // 6. COMMIT
      mockClient.query.mockResolvedValueOnce({});

      const allocated = await service.allocateCcNumbers('doc-1', 'QC', 'HARD_COPY', 2);

      expect(mockClient.query).toHaveBeenNthCalledWith(1, 'BEGIN');
      expect(mockClient.query).toHaveBeenNthCalledWith(2, expect.stringContaining('FOR UPDATE'), ['doc-1', 'QC']);
      expect(mockClient.query).toHaveBeenNthCalledWith(3, expect.stringContaining('SELECT cc_number FROM controlled_copy_slots'), ['dist-1']);
      
      // Check INSERT statements
      expect(mockClient.query).toHaveBeenNthCalledWith(4, expect.stringContaining('INSERT INTO controlled_copy_slots'), ['dist-1', 'HARD_COPY', 'CC-003']);
      expect(mockClient.query).toHaveBeenNthCalledWith(5, expect.stringContaining('INSERT INTO controlled_copy_slots'), ['dist-1', 'HARD_COPY', 'CC-004']);
      
      expect(mockClient.query).toHaveBeenLastCalledWith('COMMIT');
      expect(allocated).toEqual(['CC-003', 'CC-004']);
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should rollback and throw on error', async () => {
      mockClient.query.mockRejectedValueOnce(new Error('DB Error'));

      await expect(service.allocateCcNumbers('doc-1', 'QC', 'HARD_COPY', 2))
        .rejects
        .toThrow('DB Error');

      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.release).toHaveBeenCalled();
    });
  });
});
