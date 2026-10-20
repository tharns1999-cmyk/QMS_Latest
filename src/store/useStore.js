import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Slices
import {
  createPeriodicReviewSlice,
  canFastTrackReview,
  canFastTrackExternalReview,
  sanitizeExternalDocReviewStatus
} from '../modules/dcc/store/periodicReviewSlice';
import {
  createExternalDocSlice,
  resolveDccAdminUserId,
  generateNextEdrNumber
} from '../modules/dcc/store/externalDocSlice';
import {
  createControlledCopySlice,
  CONTROLLED_COPY_STATUS,
  buildControlledCopyId,
  deduplicateControlledCopies,
  sanitizeControlledCopies,
  resolveReceiptTaskDepartment,
  cleanupDccTasks,
  reconcileAndResolveTasks,
  createReceiptTask,
  getActivePhysicalCopies,
  resolveDarDocumentCode
} from '../modules/dcc/store/controlledCopySlice';
import {
  createDarSlice,
  syncCompletedDarToMasterDocuments,
  generateNextDarNumber
} from '../modules/dcc/store/darSlice';
import {
  createMasterDocSlice,
  DEFAULT_DOCUMENT_CATEGORIES
} from '../modules/dcc/store/masterDocSlice';
import {
  createAuthAndOrgSlice
} from './slices/authAndOrgSlice';
import {
  getMockQaSeedData,
  createSeedSlice
} from './fixtures/qaSeedGenerator';
import {
  createSystemAndTaskSlice,
  getUserDepartments,
  isNotificationVisibleToUser,
  isNotificationReadByUser,
  calculateSLAStatus,
  getUserActionableTasks,
  getUserTaskBadgeCount
} from './slices/systemAndTaskSlice';

// Persistence Middleware
import {
  persistConfig,
  registerStore,
  runSinglePassStorageSelfHealing
} from './middleware/persistConfig';

// Fixtures, Config & Helpers
import { STANDARD_STATIONS } from '../modules/dcc/services/MasterDataService';
import {
  MASTER_DATA_USER,
  REQUEST_MASTER_DATA_USER,
  REVIEW_MASTER_DATA_USER,
  APPROVE_MASTER_DATA_USER,
  MOCK_DOC_FORMATS,
  MOCK_DARS,
  MOCK_TASKS,
  MOCK_TIMELINE,
  MOCK_DOCUMENTS,
  MOCK_CONTROLLED_COPY_INSTANCES,
  INITIAL_NOTIFICATIONS,
  defaultSeedDocuments,
  defaultSeedDars,
  defaultSeedTasks,
  defaultSeedCopies,
  defaultSeedCurrentUser,
  initialUsers,
  initialDocuments,
  initialExternalDocuments,
  initialDarRequests,
  initialTasks,
  initialTimeline,
  initialControlledCopyInstances,
  initialNotifications
} from './fixtures/seedData';
import { IN_FLIGHT_DAR_STATUSES, getActiveDarForDocument } from '../modules/dcc/utils/workflowHelpers';
import { hasDocumentAccess, canUserAccessDocument, canManageControlledCopy } from '../modules/dcc/utils/accessControl';
import { calculateTaskDueDate } from '../modules/dcc/utils/slaCalculator';
import { generateInternalDarNumber } from '../modules/dcc/utils/darNumberGenerator';
import {
  isSameDepartment,
  userMatchesDepartment,
  isDccAdmin,
  isDccExclusiveTask,
  isDccOperationalTask,
  getUserLevelNumber,
  isLevel6Plus,
  isLevel1To5,
  isReceiptTask,
  isActionableTask
} from '../modules/dcc/utils/taskFilter';
import {
  MASTER_DEPARTMENTS,
  MASTER_DATA_DEPT,
  SYSTEM_CORE_DEPTS,
  MASTER_DOC_TYPES,
  MASTER_DOCUMENT_TYPES,
  DEFAULT_SIGNATURE_SETTINGS,
  DEFAULT_SLA_SETTINGS,
  DEFAULT_APPROVAL_MATRIX
} from '../modules/dcc/config/qmsRegistry';

// Re-exports for 100% Backward Compatibility
export {
  createPeriodicReviewSlice,
  canFastTrackReview,
  canFastTrackExternalReview,
  sanitizeExternalDocReviewStatus,
  createExternalDocSlice,
  resolveDccAdminUserId,
  generateNextEdrNumber,
  createControlledCopySlice,
  CONTROLLED_COPY_STATUS,
  buildControlledCopyId,
  deduplicateControlledCopies,
  sanitizeControlledCopies,
  resolveReceiptTaskDepartment,
  cleanupDccTasks,
  reconcileAndResolveTasks,
  createReceiptTask,
  getActivePhysicalCopies,
  resolveDarDocumentCode,
  createDarSlice,
  syncCompletedDarToMasterDocuments,
  generateNextDarNumber,
  createMasterDocSlice,
  DEFAULT_DOCUMENT_CATEGORIES,
  createAuthAndOrgSlice,
  getMockQaSeedData,
  createSeedSlice,
  createSystemAndTaskSlice,
  getUserDepartments,
  isNotificationVisibleToUser,
  isNotificationReadByUser,
  calculateSLAStatus,
  getUserActionableTasks,
  getUserTaskBadgeCount,
  persistConfig,
  registerStore,
  runSinglePassStorageSelfHealing,
  MASTER_DATA_USER,
  REQUEST_MASTER_DATA_USER,
  REVIEW_MASTER_DATA_USER,
  APPROVE_MASTER_DATA_USER,
  MOCK_DOC_FORMATS,
  MOCK_DARS,
  MOCK_TASKS,
  MOCK_TIMELINE,
  MOCK_DOCUMENTS,
  MOCK_CONTROLLED_COPY_INSTANCES,
  INITIAL_NOTIFICATIONS,
  defaultSeedDocuments,
  defaultSeedDars,
  defaultSeedTasks,
  defaultSeedCopies,
  defaultSeedCurrentUser,
  initialUsers,
  initialDocuments,
  initialExternalDocuments,
  initialDarRequests,
  initialTasks,
  initialTimeline,
  initialControlledCopyInstances,
  initialNotifications,
  IN_FLIGHT_DAR_STATUSES,
  getActiveDarForDocument,
  canManageControlledCopy,
  canUserAccessDocument,
  hasDocumentAccess,
  calculateTaskDueDate,
  generateInternalDarNumber,
  isSameDepartment,
  userMatchesDepartment,
  isDccAdmin,
  isDccExclusiveTask,
  isDccOperationalTask,
  getUserLevelNumber,
  isLevel6Plus,
  isLevel1To5,
  isReceiptTask,
  isActionableTask,
  MASTER_DEPARTMENTS,
  MASTER_DATA_DEPT,
  SYSTEM_CORE_DEPTS,
  MASTER_DOC_TYPES,
  MASTER_DOCUMENT_TYPES,
  DEFAULT_SIGNATURE_SETTINGS,
  DEFAULT_SLA_SETTINGS,
  DEFAULT_APPROVAL_MATRIX
};

/**
 * Deterministic Initial Store State factory
 */
export const getInitialStoreState = () => ({
  masterUsers: MASTER_DATA_USER,
  isHydrated: false,
  requestUsers: REQUEST_MASTER_DATA_USER,
  reviewUsers: REVIEW_MASTER_DATA_USER,
  approveUsers: APPROVE_MASTER_DATA_USER,
  masterDepartments: MASTER_DEPARTMENTS,
  departments: MASTER_DEPARTMENTS,
  documentTypes: MASTER_DOCUMENT_TYPES,
  distributionLocations: JSON.parse(JSON.stringify(STANDARD_STATIONS.map(s => ({ ...s, status: s.status || 'ACTIVE' })))),
  signatureSettings: { ...DEFAULT_SIGNATURE_SETTINGS },
  slaSettings: { ...DEFAULT_SLA_SETTINGS },
  approvalMatrix: JSON.parse(JSON.stringify(DEFAULT_APPROVAL_MATRIX)),
  approval_matrix: JSON.parse(JSON.stringify(DEFAULT_APPROVAL_MATRIX)),
  docFormats: MOCK_DOC_FORMATS,
  dars: [],
  darRequests: [],
  tasks: [],
  completedTasks: [],
  timeline: [],
  documents: [],
  masterDocuments: [],
  supersededDocuments: [],
  externalDocuments: [],
  externalRequests: [],
  externalAuditTrail: [],
  notifications: [...INITIAL_NOTIFICATIONS],
  actionLog: [],
  copyRequests: [],
  documentControlledCopies: [],
  controlledCopies: [],
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
  simulatedSystemDate: null,
  simulatedDate: new Date().toISOString().split('T')[0],
  mockDateOffset: 0,
  currentUser: {
    ...MASTER_DATA_USER[0],
    department: 'DC',
    depts: ['DC'],
    primary_department: 'DC',
    affiliated_departments: ['DC', 'QC', 'MGMT'],
    affiliatedDepartments: ['DC', 'QC', 'MGMT'],
    approval_level: 4
  }
});

/**
 * Root Zustand Store Orchestrator
 */
const useStore = create(persist((set, get) => ({
  ...getInitialStoreState(),
  ...createPeriodicReviewSlice(set, get),
  ...createExternalDocSlice(set, get),
  ...createControlledCopySlice(set, get),
  ...createDarSlice(set, get),
  ...createMasterDocSlice(set, get),
  ...createAuthAndOrgSlice(set, get),
  ...createSeedSlice(set, get),
  ...createSystemAndTaskSlice(set, get),

  // Reset store to deterministic initial state for testing
  resetStore: () => set(getInitialStoreState())
}), persistConfig));

// Register store instance for rehydration and cross-module access
registerStore(useStore);

export default useStore;
