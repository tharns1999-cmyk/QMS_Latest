import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import useStore, { getInitialStoreState } from '../../store/useStore';
import Sidebar from '../layout/Sidebar';
import { defaultSeedDocuments, defaultSeedDars, defaultSeedTasks, defaultSeedCopies } from '../../store/mockSeedData';

describe('Disable All Automatic Data Seeding & Manual Dev-Tool Seed Verification', () => {
  beforeEach(() => {
    // Reset to initial blank state
    useStore.setState({
      ...getInitialStoreState(),
      documents: [],
      masterDocuments: [],
      supersededDocuments: [],
      dars: [],
      darRequests: [],
      tasks: [],
      completedTasks: [],
      controlledCopies: [],
      documentControlledCopies: [],
      controlledCopyInstances: []
    });
  });

  it('1. Initial State contains empty arrays for user data (documents: [], dars: [], tasks: [], controlledCopies: [])', () => {
    const initialState = getInitialStoreState();
    expect(initialState.documents).toEqual([]);
    expect(initialState.dars).toEqual([]);
    expect(initialState.tasks).toEqual([]);
    expect(initialState.controlledCopies).toEqual([]);
    expect(initialState.masterDocuments).toEqual([]);
    expect(initialState.darRequests).toEqual([]);
    expect(initialState.documentControlledCopies).toEqual([]);
    expect(initialState.controlledCopyInstances).toEqual([]);
  });

  it('2. Zero Auto-Seed on Rehydration: Empty state remains empty on rehydrate without auto-seeding mock data', () => {
    // Simulate empty state before rehydration
    useStore.setState({
      documents: [],
      masterDocuments: [],
      dars: [],
      darRequests: [],
      tasks: [],
      controlledCopies: [],
      documentControlledCopies: [],
      controlledCopyInstances: []
    });

    const state = useStore.getState();
    expect(state.documents).toEqual([]);
    expect(state.dars).toEqual([]);
    expect(state.tasks).toEqual([]);
    expect(state.controlledCopies).toEqual([]);

    // Simulate Zustand onRehydrateStorage callback execution
    const persistOptions = useStore.persist?.getOptions?.();
    if (persistOptions?.onRehydrateStorage) {
      const onRehydrated = persistOptions.onRehydrateStorage();
      if (typeof onRehydrated === 'function') {
        act(() => {
          onRehydrated(useStore.getState());
        });
      }
    }

    // State MUST remain empty — NO automatic data seeding is allowed
    const stateAfterRehydrate = useStore.getState();
    expect(stateAfterRehydrate.documents).toEqual([]);
    expect(stateAfterRehydrate.dars).toEqual([]);
    expect(stateAfterRehydrate.tasks).toEqual([]);
    expect(stateAfterRehydrate.controlledCopies).toEqual([]);
  });

  it('3. Preserves user-created test data without overwriting on rehydration or state access', () => {
    const customUserDoc = {
      id: 'USER-DOC-001',
      title: 'WI-CUSTOM-99',
      doc_code: 'WI-CUSTOM-99',
      name: 'เอกสารทดสอบจริงของผู้ใช้',
      status: 'EFFECTIVE'
    };

    act(() => {
      useStore.setState({
        documents: [customUserDoc],
        masterDocuments: [customUserDoc]
      });
    });

    // Check custom data
    expect(useStore.getState().documents).toHaveLength(1);
    expect(useStore.getState().documents[0].id).toBe('USER-DOC-001');

    // Run rehydrate hook if present
    const persistOptions = useStore.persist?.getOptions?.();
    if (persistOptions?.onRehydrateStorage) {
      const onRehydrated = persistOptions.onRehydrateStorage();
      if (typeof onRehydrated === 'function') {
        act(() => {
          onRehydrated(useStore.getState());
        });
      }
    }

    // Verify user doc remains intact without being replaced by seed data
    const finalDocs = useStore.getState().documents;
    expect(finalDocs).toHaveLength(1);
    expect(finalDocs[0].id).toBe('USER-DOC-001');
    expect(finalDocs.some(d => d.id === 'WI-QC-01_REV_01')).toBe(false);
  });

  it('4. Calling manualSeedData() manually populates default mock data', () => {
    expect(useStore.getState().documents).toHaveLength(0);

    act(() => {
      useStore.getState().manualSeedData();
    });

    const state = useStore.getState();
    expect(state.documents.length).toBeGreaterThan(0);
    expect(state.documents).toEqual(defaultSeedDocuments);
    expect(state.dars).toEqual(defaultSeedDars);
    expect(state.tasks).toEqual(defaultSeedTasks);
    expect(state.controlledCopies).toEqual(defaultSeedCopies);
  });

  it('5. Calling clearAllData() resets all transaction collections back to empty', () => {
    act(() => {
      useStore.getState().manualSeedData();
    });
    expect(useStore.getState().documents.length).toBeGreaterThan(0);

    act(() => {
      useStore.getState().clearAllData();
    });

    const state = useStore.getState();
    expect(state.documents).toEqual([]);
    expect(state.dars).toEqual([]);
    expect(state.tasks).toEqual([]);
    expect(state.controlledCopies).toEqual([]);
  });

  it('6. DEV TOOLS in Sidebar renders "🔀 Seed" button and triggers manualSeedData on user click', () => {
    // Current user must be admin/DCC to see DEV TOOLS
    act(() => {
      useStore.setState({
        currentUser: {
          id: 'EMP-001',
          name: 'ธนาวุฒิ สมควรกิจดำรง',
          department: 'DC',
          role: 'DCC_ADMIN',
          isDcc: true,
          level: 4
        },
        documents: [],
        dars: [],
        tasks: [],
        controlledCopies: []
      });
    });

    render(
      <MemoryRouter initialEntries={['/dcc/dashboard']}>
        <Sidebar />
      </MemoryRouter>
    );

    // Look for DEV TOOLS
    expect(screen.getByText('DEV TOOLS')).toBeInTheDocument();

    // Look for 🔀 Seed button
    const seedButton = screen.getByRole('button', { name: /🔀 Seed/i });
    expect(seedButton).toBeInTheDocument();

    // Before clicking, store is empty
    expect(useStore.getState().documents).toHaveLength(0);

    // Click 🔀 Seed
    fireEvent.click(seedButton);

    // After clicking, seed data is populated
    expect(useStore.getState().documents.length).toBeGreaterThan(0);
    expect(useStore.getState().dars.length).toBeGreaterThan(0);
  });

  it('7. Partialize filters out large binary payloads (fileBlob, binaryData, pdf_binary) to prevent QuotaExceededError', () => {
    const fakeBlob = new Blob(['sample pdf binary content'], { type: 'application/pdf' });
    const stateWithBlobs = {
      ...useStore.getState(),
      documents: [
        {
          id: 'DOC-001',
          title: 'SOP-QC-01',
          name: 'เอกสารควบคุมคุณภาพ',
          fileBlob: fakeBlob,
          binaryData: 'data:application/pdf;base64,JVBERi0xLjQK...',
          pdf_binary: fakeBlob,
          file: fakeBlob,
          fileName: 'sop-qc-01.pdf',
          fileKey: 'DOC-001-KEY'
        }
      ],
      dars: [
        {
          id: 'DAR-001',
          darNo: 'DAR-2026-001',
          fileBlob: fakeBlob,
          pdf_binary: 'data:application/pdf;base64,...',
          file: fakeBlob,
          fileName: 'request.pdf',
          fileKey: 'DAR-001-KEY',
          attachedFile: {
            name: 'request.pdf',
            fileId: 'ATTACH-001',
            file: fakeBlob,
            size: 1024
          }
        }
      ],
      tasks: [
        {
          id: 'TASK-001',
          fileBlob: fakeBlob,
          attachedFile: {
            name: 'task-doc.pdf',
            fileId: 'TASK-ATT-001',
            file: fakeBlob,
            size: 2048
          }
        }
      ],
      controlledCopies: [
        {
          id: 'COPY-001',
          fileBlob: fakeBlob
        }
      ]
    };

    const persistOptions = useStore.persist?.getOptions?.();
    expect(persistOptions?.partialize).toBeDefined();

    const partialized = persistOptions.partialize(stateWithBlobs);

    // Verify document blobs are stripped while keeping serializable metadata
    expect(partialized.documents[0].fileBlob).toBeUndefined();
    expect(partialized.documents[0].binaryData).toBeUndefined();
    expect(partialized.documents[0].pdf_binary).toBeUndefined();
    expect(partialized.documents[0].fileName).toBe('sop-qc-01.pdf');
    expect(partialized.documents[0].fileKey).toBe('DOC-001-KEY');

    // Verify DAR blobs are stripped
    expect(partialized.dars[0].fileBlob).toBeUndefined();
    expect(partialized.dars[0].pdf_binary).toBeUndefined();
    expect(partialized.dars[0].attachedFile.file).toBeUndefined();
    expect(partialized.dars[0].fileName).toBe('request.pdf');

    // Verify Task & Copy blobs are stripped
    expect(partialized.tasks[0].fileBlob).toBeUndefined();
    expect(partialized.tasks[0].attachedFile.file).toBeUndefined();
    expect(partialized.controlledCopies[0].fileBlob).toBeUndefined();
  });
});
