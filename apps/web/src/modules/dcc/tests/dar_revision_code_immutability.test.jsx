import { describe, it, expect, beforeEach } from 'vitest';
import useStore from '../../../store/useStore';

describe('DAR Revision Code & Department Immutability', () => {
  beforeEach(() => {
    // Reset state before each test
    useStore.setState({
      documents: [
        {
          id: 'doc-1',
          code: 'SOP-QC-001',
          docType: 'SOP',
          department: 'QC',
          title: 'Test SOP Document',
          status: 'ACTIVE'
        }
      ],
      masterDocuments: [],
      dars: [],
      darRequests: [],
      tasks: [],
      currentUser: {
        id: 'EMP-999',
        name: 'John Doe',
        department: 'PD' // Different department from document
      }
    });
  });

  it('should enforce original document department and code on REVISION despite requester department', () => {
    const { addDar } = useStore.getState();

    addDar({
      type: 'REVISION',
      docIdRef: 'doc-1', // Targets SOP-QC-001
      department: 'PD',  // Requester tries to mutate to PD
      docType: 'WI'      // Requester tries to mutate type
    });

    const dars = useStore.getState().dars;
    expect(dars.length).toBe(1);
    const addedDar = dars[0];

    expect(addedDar).toBeDefined();
    
    // Invariants that MUST hold true
    expect(addedDar.department).toBe('QC'); // Must be locked to QC
    expect(addedDar.docType).toBe('SOP'); // Must be locked to SOP
    
    // Verify docCode / document_code correctly pulled from source
    expect(addedDar.docCode || addedDar.document_code).toBe('SOP-QC-001');
  });

  it('should enforce original document department and code on AMENDMENT', () => {
    const { addDar } = useStore.getState();

    addDar({
      type: 'AMENDMENT',
      docIdRef: 'doc-1',
      department: 'PD',
      docType: 'WI'
    });

    const dars = useStore.getState().dars;
    expect(dars.length).toBe(1);
    const addedDar = dars[0];

    expect(addedDar).toBeDefined();
    expect(addedDar.department).toBe('QC');
    expect(addedDar.docType).toBe('SOP');
    expect(addedDar.docCode || addedDar.document_code).toBe('SOP-QC-001');
  });
});
