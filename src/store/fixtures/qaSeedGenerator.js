/**
 * Dynamic QA Seed Generator & Test Data Factory
 * Extracted from useStore.js (Phase 7 Refactor)
 */
import { getMockQaSeedData } from './mockQaWorkflowSeed';
import {
  defaultSeedDocuments,
  defaultSeedDars,
  defaultSeedTasks,
  defaultSeedCopies
} from './seedData';

export { getMockQaSeedData };

export const createSeedSlice = (set, get) => ({
  // DEV TOOL: Manual Mock Data Seeding (Runs strictly when user clicks Manual Seed in Dev Tools)
  manualSeedData: () => {
    set({
      documents: defaultSeedDocuments,
      masterDocuments: defaultSeedDocuments,
      supersededDocuments: defaultSeedDocuments.filter(d => d.status === 'SUPERSEDED' || d.is_superseded),
      dars: defaultSeedDars,
      darRequests: defaultSeedDars,
      tasks: defaultSeedTasks,
      controlledCopies: defaultSeedCopies,
      documentControlledCopies: defaultSeedCopies,
      controlledCopyInstances: defaultSeedCopies
    });
  },

  // Reset & Re-seed store to default mock data (kept for manual trigger & backward compatibility)
  resetToDefaultSeed: () => {
    get().manualSeedData();
  },

  // Alias for manual seed trigger strictly via DevTools
  seedMockData: () => {
    get().manualSeedData();
  },

  // Clear all transaction data back to empty state
  clearAllData: () => {
    set({
      documents: [],
      masterDocuments: [],
      supersededDocuments: [],
      dars: [],
      darRequests: [],
      tasks: [],
      completedTasks: [],
      timeline: [],
      externalDocuments: [],
      externalRequests: [],
      externalAuditTrail: [],
      notifications: [],
      actionLog: [],
      copyRequests: [],
      controlledCopies: [],
      documentControlledCopies: [],
      controlledCopyInstances: [],
      controlledCopyAuditTrail: [],
      copyDispositionRecords: [],
      dispositionHistory: [],
      periodicReviewSchedules: [],
      periodicReviewTasks: [],
      periodicReviewRecords: [],
      distributionLogs: [],
      acknowledgments: [],
      darHistory: [],
      simulatedSystemDate: null
    });
  },

  // DEV TOOL: Factory Reset Transactions to Clean Slate (Preserving Master Data 100%)
  resetTransactionDataToCleanSlate: () => {
    set({
      dars: [],
      darRequests: [],
      tasks: [],
      timeline: [],
      documents: [],
      masterDocuments: [],
      supersededDocuments: [],
      externalDocuments: [],
      externalRequests: [],
      externalAuditTrail: [],
      notifications: [],
      actionLog: [],
      copyRequests: [],
      documentControlledCopies: [],
      controlledCopyInstances: [],
      controlledCopyAuditTrail: [],
      copyDispositionRecords: [],
      dispositionHistory: [],
      periodicReviewSchedules: [],
      periodicReviewTasks: [],
      periodicReviewRecords: [],
      distributionLogs: [],
      acknowledgments: [],
      darHistory: []
    });

    if (typeof window !== 'undefined' && window.localStorage) {
      const storageKey = 'qms-enterprise-storage';
      try {
        const persisted = JSON.parse(localStorage.getItem(storageKey) || '{}');
        if (persisted && persisted.state) {
          persisted.state.dars = [];
          persisted.state.darRequests = [];
          persisted.state.tasks = [];
          persisted.state.timeline = [];
          persisted.state.documents = [];
          persisted.state.masterDocuments = [];
          persisted.state.supersededDocuments = [];
          persisted.state.externalDocuments = [];
          persisted.state.externalRequests = [];
          persisted.state.externalAuditTrail = [];
          persisted.state.notifications = [];
          persisted.state.actionLog = [];
          persisted.state.copyRequests = [];
          persisted.state.documentControlledCopies = [];
          persisted.state.controlledCopies = [];
          persisted.state.controlledCopyInstances = [];
          persisted.state.controlledCopyAuditTrail = [];
          persisted.state.copyDispositionRecords = [];
          persisted.state.dispositionHistory = [];
          persisted.state.periodicReviewSchedules = [];
          persisted.state.periodicReviewTasks = [];
          persisted.state.periodicReviewRecords = [];
          persisted.state.distributionLogs = [];
          persisted.state.acknowledgments = [];
          persisted.state.darHistory = [];
          localStorage.setItem(storageKey, JSON.stringify(persisted));
        }
      } catch (err) {
        console.error('Failed to reset persisted storage:', err);
      }
    }
  },

  // Comprehensive QA workflow mock data engine
  seedComprehensiveQaMockData: () => {
    const seed = getMockQaSeedData();
    set(state => ({
      ...state,
      ...seed
    }));

    if (typeof window !== 'undefined' && window.localStorage) {
      const storageKey = 'qms-enterprise-storage';
      try {
        const persisted = JSON.parse(localStorage.getItem(storageKey) || '{}');
        if (persisted && persisted.state) {
          Object.assign(persisted.state, seed);
          localStorage.setItem(storageKey, JSON.stringify(persisted));
        }
      } catch (err) {
        console.error('Failed to persist seeded mock data:', err);
      }
    }
  }
});

