import { createJSONStorage } from 'zustand/middleware';
import { isApiMode } from '../../api/client';
import toast from 'react-hot-toast';
import { MASTER_DATA_USER } from '../fixtures/seedData';
import { MASTER_DEPARTMENTS } from '../../modules/dcc/config/qmsRegistry';
import { isDccExclusiveTask, isDccOperationalTask, isReceiptTask } from '../../modules/dcc/utils/taskFilter';
import { resolveReceiptTaskDepartment, sanitizeControlledCopies } from '../../modules/dcc/store/controlledCopySlice';
import { syncCompletedDarToMasterDocuments } from '../../modules/dcc/store/darSlice';
import { sanitizeExternalDocReviewStatus } from '../../modules/dcc/store/periodicReviewSlice';
import { getDocCode, getCleanRev } from '../../modules/dcc/utils/domainNormalizer';

let _storeInstance = null;

export const registerStore = (store) => {
  _storeInstance = store;
  if (typeof window !== 'undefined') {
    window.__QMS_STORE__ = store;
  }
};

export const getStore = () => _storeInstance || (typeof window !== 'undefined' ? window.__QMS_STORE__ : null);

/**
 * Single-Pass LocalStorage Self-Healing Boot
 * Consolidates all migrations and sanitizations into a single read and single conditional write.
 */
export const runSinglePassStorageSelfHealing = () => {
  if (typeof window === 'undefined' || !window.localStorage) return;

  try {
    localStorage.removeItem('qms-storage-uat-v6');
    localStorage.removeItem('qms-storage-uat-v7');
  } catch {
    // Ignore in non-browser or sandbox environments
  }

  try {
    const storageKey = 'qms-enterprise-storage';
    const rawData = localStorage.getItem(storageKey);
    if (!rawData) return;
    
    const persisted = JSON.parse(rawData);
    if (!persisted || !persisted.state) return;

    let hasChanged = false;
    const state = persisted.state;

    // 1. Task location / department migration for EN Office
    if (Array.isArray(state.tasks)) {
      state.tasks = state.tasks.map(t => {
        if (isReceiptTask(t)) {
          const loc = t.location || t.locationName || t.location_name || '';
          const text = `${t.title || ''} ${t.description || ''} ${loc}`;
          if (text.includes('EN Office') || text.includes('EN-') || text.includes('(EN)')) {
            if (t.department !== 'EN') {
              hasChanged = true;
              return {
                ...t,
                department: 'EN',
                target_department: 'EN',
                targetDepartment: 'EN',
                destinationDept: 'EN',
                destination_dept: 'EN',
                recipientDepartment: 'EN',
                recipient_department: 'EN',
                currentHandlerDepartment: 'EN',
                assignedToDept: 'EN',
                dept_code: 'EN'
              };
            }
          }
        }
        return t;
      });
    }

    // 2. Self-healing migration for DAR Completion & Master Document Lifecycle Sync
    if (Array.isArray(state.dars) && Array.isArray(state.documents)) {
      let darsMigrated = false;
      state.dars.forEach(dar => {
        if (dar.status === 'COMPLETED') {
          const darType = String(dar.type || dar.requestType || dar.darType || '').toUpperCase();
          if (darType === 'REVISE' || darType === 'REVISION' || darType === 'REVISE_DOCUMENT') {
            const targetCode = getDocCode(dar) || dar.docIdInput;
            const rawTarget = dar.targetRevision || dar.newRevision || dar.newRev || dar.targetRev || dar.proposedRev;
            if (targetCode && rawTarget) {
              const cleanTarget = getCleanRev(rawTarget);
              const docs = state.documents;
              const hasActiveNewRev = docs.some(d => {
                const code = getDocCode(d);
                const rev = getCleanRev(d);
                return code && code.trim().toLowerCase() === targetCode.trim().toLowerCase() && rev === cleanTarget && (d.status === 'EFFECTIVE' || d.status === 'ACTIVE' || d.is_active);
              });
              if (!hasActiveNewRev) {
                state.documents = syncCompletedDarToMasterDocuments(dar, state.documents);
                darsMigrated = true;
              }
            }
          }
        }
      });
      if (darsMigrated) {
        state.masterDocuments = state.documents;
        state.darRequests = state.dars;
        hasChanged = true;
      }
    }

    // 3. Self-healing migration for ISO 9001 Clause 7.5.3: Obsolete DAR Revision Binding
    if (Array.isArray(state.dars)) {
      let obsoleteDarsMigrated = false;
      const allDocs = state.documents || [];
      state.dars = state.dars.map(dar => {
        if (!dar) return dar;
        const isObs = dar.type === 'OBSOLETE' || dar.request_type === 'OBSOLETE' || dar.darType === 'OBSOLETE' || dar.is_obsolete;
        if (isObs) {
          const targetCode = dar.doc_code || dar.docCode || dar.docNo || dar.code || dar.title;
          const targetDoc = allDocs.find(d => 
            (dar.doc_id && String(d.id) === String(dar.doc_id)) ||
            (dar.targetDocumentId && String(d.id) === String(dar.targetDocumentId)) ||
            (targetCode && (d.title === targetCode || d.document_code === targetCode || d.code === targetCode))
          );
          const rawTargetRev = targetDoc 
            ? ((targetDoc.revision && targetDoc.revision !== '00') 
                ? targetDoc.revision 
                : (targetDoc.rev || targetDoc.revision || '03'))
            : '01';
          const cleanTargetRev = String(rawTargetRev).replace(/^Rev\.?/i, '').padStart(2, '0');

          if (
            dar.revision === '00' ||
            !dar.revision ||
            dar.targetRevision === '00' ||
            !dar.targetRevision
          ) {
            obsoleteDarsMigrated = true;
            return {
              ...dar,
              revision: cleanTargetRev,
              targetRevision: cleanTargetRev,
              rev: cleanTargetRev,
              docRev: cleanTargetRev
            };
          }
        }
        return dar;
      });
      if (obsoleteDarsMigrated) {
        state.darRequests = state.dars;
        hasChanged = true;
      }
    }

    // 6. Self-healing migration for Controlled Copies: Deduplicate Copy records & Sanitize QM-QC-01
    const rawCopies = state.controlledCopyInstances || state.documentControlledCopies || [];
    if (Array.isArray(rawCopies) && rawCopies.length > 0) {
      const cleanedCopies = sanitizeControlledCopies(rawCopies);
      if (cleanedCopies.length !== rawCopies.length || JSON.stringify(cleanedCopies) !== JSON.stringify(rawCopies)) {
        state.controlledCopyInstances = cleanedCopies;
        state.documentControlledCopies = cleanedCopies;
        if (Array.isArray(state.controlledCopies)) {
          state.controlledCopies = cleanedCopies;
        }
        hasChanged = true;
      }
    }

    // 7. Self-healing migration for OBSOLETE Cascading: Fix active copies of obsolete documents (e.g. SOP-QC-01)
    const allDocs = state.documents || [];
    const copiesList = state.controlledCopyInstances || state.documentControlledCopies || [];
    if (Array.isArray(copiesList) && copiesList.length > 0) {
      let obsoleteCopiesCleaned = false;
      const updatedCopiesList = copiesList.map(copy => {
        const docCode = copy.document_code || copy.doc_code || copy.docTitle;
        if (!docCode) return copy;
        
        const matchedDoc = allDocs.find(d => 
          (d.id && (d.id === copy.doc_id || d.id === copy.docId)) || 
          (docCode && (d.document_code === docCode || d.doc_code === docCode || d.title === docCode || d.code === docCode))
        );
        
        if (matchedDoc && (matchedDoc.status === 'OBSOLETE' || matchedDoc.is_obsolete)) {
          if (copy.status === 'ACTIVE' || copy.status === 'IN_USE' || copy.status === 'ISSUED_ACTIVE' || !copy.status) {
            obsoleteCopiesCleaned = true;
            return {
              ...copy,
              status: 'PENDING_RECALL',
              obsoleted_at: matchedDoc.obsolete_at || new Date().toISOString(),
              obsolete_dar_no: matchedDoc.obsolete_dar_id || matchedDoc.darId || matchedDoc.dar_no
            };
          }
        }
        return copy;
      });

      if (obsoleteCopiesCleaned) {
        state.controlledCopyInstances = updatedCopiesList;
        state.documentControlledCopies = updatedCopiesList;
        if (Array.isArray(state.controlledCopies)) {
          state.controlledCopies = updatedCopiesList;
        }
        hasChanged = true;
      }
    }

    // 8. Self-healing migration for Periodic Review Mock Data: Remove leftover mock data
    const mockDocIds = ['DOC-REV-OVERDUE', 'DOC-REV-DUESOON', 'DOC-REV-UPTODATE', 'DOC-REVIEW-01', 'DOC-REVIEW-02'];
    const mockExtIds = ['EXT-REV-OVERDUE', 'EXT-REV-DUESOON', 'EXT-REV-UPTODATE', 'EXT-LAW-001'];
    const mockTaskIds = ['TASK-REV-1', 'TASK-REV-2', 'TASK-REV-001'];

    if (Array.isArray(state.documents)) {
      const cleanDocs = state.documents.filter(d => !mockDocIds.includes(d.id));
      if (cleanDocs.length !== state.documents.length) {
        state.documents = cleanDocs;
        hasChanged = true;
      }
    }

    if (Array.isArray(state.masterDocuments)) {
      const cleanMasterDocs = state.masterDocuments.filter(d => !mockDocIds.includes(d.id));
      if (cleanMasterDocs.length !== state.masterDocuments.length) {
        state.masterDocuments = cleanMasterDocs;
        hasChanged = true;
      }
    }

    if (Array.isArray(state.externalDocuments)) {
      const cleanExtDocs = state.externalDocuments.filter(d => !mockExtIds.includes(d.id));
      if (cleanExtDocs.length !== state.externalDocuments.length) {
        state.externalDocuments = cleanExtDocs;
        hasChanged = true;
      }
    }

    if (Array.isArray(state.tasks)) {
      const cleanTasks = state.tasks.filter(t => !mockTaskIds.includes(t.id));
      if (cleanTasks.length !== state.tasks.length) {
        state.tasks = cleanTasks;
        hasChanged = true;
      }
    }

    // SINGLE-PASS WRITE: Only write back to localStorage if changes occurred
    if (hasChanged) {
      localStorage.setItem(storageKey, JSON.stringify(persisted));
    }
  } catch {
    // Ignore in non-browser or sandbox environments
  }
};

// Run the single-pass self-healing immediately upon loading this module
runSinglePassStorageSelfHealing();

/**
 * Persistence configuration for Zustand persist middleware
 */
export const persistConfig = {
  // A separate key keeps API-mode state from mixing with the demo data in the same browser.
  name: isApiMode ? 'qms-api-mode-storage' : 'qms-enterprise-storage',
  version: 5,
  migrate: (persistedState, version) => {
    if (!version || version < 5) {
      if (Array.isArray(persistedState.controlledCopyInstances) || Array.isArray(persistedState.documentControlledCopies)) {
        const rawCopies = persistedState.controlledCopyInstances || persistedState.documentControlledCopies || [];
        const cleanedCopies = sanitizeControlledCopies(rawCopies);
        persistedState.controlledCopyInstances = cleanedCopies;
        persistedState.documentControlledCopies = cleanedCopies;
        if (Array.isArray(persistedState.controlledCopies)) {
          persistedState.controlledCopies = cleanedCopies;
        }
      }
    }
    if (!version || version < 4) {
      if (persistedState.masterUsers && Array.isArray(persistedState.masterUsers)) {
        persistedState.masterUsers = persistedState.masterUsers.map(u => {
          const defaultUser = MASTER_DATA_USER.find(m => m.id === u.id);
          return {
            ...u,
            signatureImage: u.signatureImage || defaultUser?.signatureImage || '',
            hasRegisteredSignature: u.hasRegisteredSignature ?? defaultUser?.hasRegisteredSignature ?? true,
            permissions: (u.permissions && u.permissions.length > 0) ? u.permissions : ['DAR_CREATE', 'TASK_ACCESS', 'VIEW_REGISTER'],
            canCreateDar: u.canCreateDar ?? true,
            canAccessTasks: u.canAccessTasks ?? true,
            canViewRegister: u.canViewRegister ?? true,
            isWorkflowUser: u.isWorkflowUser ?? true
          };
        });
        const userRoleObj = (u) => ({
          id: u.id,
          empId: u.empId || u.id,
          name: u.name,
          depts: u.affiliated_departments || u.depts,
          affiliated_departments: u.affiliated_departments || u.depts,
          department: u.primary_department || u.department,
          primary_department: u.primary_department || u.department,
          level: u.approval_level || u.level,
          approval_level: u.approval_level || u.level
        });
        persistedState.requestUsers = persistedState.masterUsers.map(userRoleObj);
        persistedState.reviewUsers = [...persistedState.requestUsers];
        persistedState.approveUsers = [...persistedState.requestUsers];
      }
      if (persistedState.currentUser) {
        persistedState.currentUser = {
          ...persistedState.currentUser,
          permissions: (persistedState.currentUser.permissions && persistedState.currentUser.permissions.length > 0) ? persistedState.currentUser.permissions : ['DAR_CREATE', 'TASK_ACCESS', 'VIEW_REGISTER'],
          canCreateDar: persistedState.currentUser.canCreateDar ?? true,
          canAccessTasks: persistedState.currentUser.canAccessTasks ?? true,
          canViewRegister: persistedState.currentUser.canViewRegister ?? true,
          isWorkflowUser: persistedState.currentUser.isWorkflowUser ?? true
        };
      }
    }
    if (!version || version < 3) {
      persistedState.masterUsers = MASTER_DATA_USER;
      persistedState.masterDepartments = MASTER_DEPARTMENTS;
      persistedState.departments = MASTER_DEPARTMENTS;
      persistedState.currentUser = { ...MASTER_DATA_USER[0] };
    }
    if (version < 2 || !version) {
      persistedState.tasks = [];
      persistedState.dars = [];
      persistedState.darRequests = [];
      persistedState.timeline = [];
      persistedState.actionLog = [];
      persistedState.notifications = [];
      persistedState.documents = [];
      persistedState.externalDocuments = [];
      persistedState.documentControlledCopies = [];
      persistedState.controlledCopyInstances = [];
      persistedState.controlledCopyAuditTrail = [];
      persistedState.periodicReviewSchedules = [];
      persistedState.periodicReviewTasks = [];
      persistedState.periodicReviewRecords = [];
      persistedState.distributionLogs = [];
      persistedState.acknowledgments = [];
      persistedState.darHistory = [];
    }

    // Eradicate legacy 'DCC' department code and migrate task departments to owner department
    if (persistedState.tasks && Array.isArray(persistedState.tasks)) {
      const persistedDars = persistedState.dars || [];
      const persistedDocs = persistedState.documents || [];
      persistedState.tasks = persistedState.tasks.map(t => {
        if (!t) return t;
        let updated = { ...t };
        if (updated.target_department === 'DCC') updated.target_department = 'DC';
        if (updated.targetDepartment === 'DCC') updated.targetDepartment = 'DC';
        if (updated.department === 'DCC') updated.department = 'DC';
        if (updated.dept === 'DCC') updated.dept = 'DC';
        if (updated.assignedToDept === 'DCC') updated.assignedToDept = 'DC';
        if (updated.destinationDept === 'DCC') updated.destinationDept = 'DC';
        if (updated.currentHandlerDepartment === 'DCC') updated.currentHandlerDepartment = 'DC';

        const docCode = updated.doc_code || updated.docCode || updated.document_code || '';
        const docId = updated.docId || updated.doc_id;
        const matchedDoc = persistedDocs.find(d => 
          (docId && String(d.id) === String(docId)) ||
          (docCode && (d.title === docCode || d.document_code === docCode || d.code === docCode))
        );
        const matchedDar = persistedDars.find(d => String(d.id) === String(updated.darId));
        let ownerDept = matchedDar?.department || matchedDoc?.department;
        if (!ownerDept) {
          if (String(docCode).includes('-PD-') || String(updated.title).includes('-PD-') || String(updated.darId).includes('-PD-')) {
            ownerDept = 'PD';
          }
        }
        if (ownerDept) {
          const cleanDept = ownerDept === 'DCC' ? 'DC' : ownerDept;
          updated.department = cleanDept;
          updated.target_department = cleanDept;
          updated.owner_dept = cleanDept;
          updated.currentHandlerDepartment = cleanDept;
        }
        return updated;
      });
    }
    if (persistedState.currentUser) {
      if (persistedState.currentUser.department === 'DCC') persistedState.currentUser.department = 'DC';
      if (persistedState.currentUser.primary_department === 'DCC') persistedState.currentUser.primary_department = 'DC';
      if (persistedState.currentUser.dept === 'DCC') persistedState.currentUser.dept = 'DC';
      if (Array.isArray(persistedState.currentUser.affiliated_departments)) {
        persistedState.currentUser.affiliated_departments = Array.from(new Set(persistedState.currentUser.affiliated_departments.map(d => d === 'DCC' ? 'DC' : d)));
      }
      if (Array.isArray(persistedState.currentUser.depts)) {
        persistedState.currentUser.depts = Array.from(new Set(persistedState.currentUser.depts.map(d => d === 'DCC' ? 'DC' : d)));
      }

      // Auto-Healing Migration: Migrate QA/QC to QC for currentUser
      const isQaQc = (d) => typeof d === 'string' && (d === 'QA/QC' || d.includes('QA/QC'));
      const replaceQaQc = (d) => isQaQc(d) ? 'QC' : d;
      if (isQaQc(persistedState.currentUser.department) || isQaQc(persistedState.currentUser.primary_department)) {
        persistedState.currentUser.department = 'QC';
        persistedState.currentUser.dept = 'QC';
        persistedState.currentUser.primary_department = 'QC';
        persistedState.currentUser.primaryDepartment = 'QC';
        if (Array.isArray(persistedState.currentUser.affiliated_departments)) {
          persistedState.currentUser.affiliated_departments = Array.from(new Set(persistedState.currentUser.affiliated_departments.map(replaceQaQc)));
        }
        if (Array.isArray(persistedState.currentUser.depts)) {
          persistedState.currentUser.depts = Array.from(new Set(persistedState.currentUser.depts.map(replaceQaQc)));
        }
        if (Array.isArray(persistedState.currentUser.departments)) {
          persistedState.currentUser.departments = Array.from(new Set(persistedState.currentUser.departments.map(replaceQaQc)));
        }
        if (Array.isArray(persistedState.currentUser.departmentMemberships)) {
          persistedState.currentUser.departmentMemberships = Array.from(new Set(persistedState.currentUser.departmentMemberships.map(replaceQaQc)));
        }
      }
    }

    if (persistedState.masterUsers && Array.isArray(persistedState.masterUsers)) {
      const isQaQc = (d) => typeof d === 'string' && (d === 'QA/QC' || d.includes('QA/QC'));
      const replaceQaQc = (d) => isQaQc(d) ? 'QC' : d;
      persistedState.masterUsers = persistedState.masterUsers.map(u => {
        if (isQaQc(u.department) || isQaQc(u.primary_department)) {
          return {
            ...u,
            department: 'QC',
            dept: 'QC',
            primary_department: 'QC',
            primaryDepartment: 'QC',
            departments: Array.isArray(u.departments) ? Array.from(new Set(u.departments.map(replaceQaQc))) : ['QC'],
            departmentMemberships: Array.isArray(u.departmentMemberships) ? Array.from(new Set(u.departmentMemberships.map(replaceQaQc))) : ['QC'],
            depts: Array.isArray(u.depts) ? Array.from(new Set(u.depts.map(replaceQaQc))) : ['QC'],
            affiliated_departments: Array.isArray(u.affiliated_departments) ? Array.from(new Set(u.affiliated_departments.map(replaceQaQc))) : ['QC'],
            secondaryDepartments: Array.isArray(u.secondaryDepartments) ? u.secondaryDepartments.map(replaceQaQc).filter(d => d !== 'QC') : []
          };
        }
        return u;
      });
    }

    return persistedState;
  },
  onRehydrateStorage: () => (state, error) => {
    if (error) {
      console.error('[Storage] Storage rehydration error:', error);
      return;
    }

    // 0. Master Data & Signature Asset Hydration Lifecycle from IndexedDB
    if (state && typeof state.hydrateMasterData === 'function') {
      state.hydrateMasterData();
    }

    const store = getStore();

    // Auto-Healing Migration for currentUser on app boot
    if (state && state.currentUser) {
      const cu = state.currentUser;
      const isQaQc = (d) => typeof d === 'string' && (d === 'QA/QC' || d.includes('QA/QC'));
      const replaceQaQc = (d) => isQaQc(d) ? 'QC' : d;
      if (isQaQc(cu.department) || isQaQc(cu.primary_department)) {
        const updatedCurrentUser = {
          ...cu,
          department: 'QC',
          dept: 'QC',
          primary_department: 'QC',
          primaryDepartment: 'QC',
          departments: Array.isArray(cu.departments) ? Array.from(new Set(cu.departments.map(replaceQaQc))) : ['QC'],
          departmentMemberships: Array.isArray(cu.departmentMemberships) ? Array.from(new Set(cu.departmentMemberships.map(replaceQaQc))) : ['QC'],
          depts: Array.isArray(cu.depts) ? Array.from(new Set(cu.depts.map(replaceQaQc))) : ['QC'],
          affiliated_departments: Array.isArray(cu.affiliated_departments) ? Array.from(new Set(cu.affiliated_departments.map(replaceQaQc))) : ['QC'],
          secondaryDepartments: Array.isArray(cu.secondaryDepartments) ? cu.secondaryDepartments.map(replaceQaQc).filter(d => d !== 'QC') : []
        };
        if (store?.setState) {
          store.setState({ currentUser: updatedCurrentUser });
        } else {
          state.currentUser = updatedCurrentUser;
        }
      }
    }

    if (state && state.tasks && Array.isArray(state.tasks)) {
      let hasChange = false;
      const safeDars = state.dars || [];
      const safeDocs = state.documents || [];
      const cleaned = state.tasks.map(t => {
        if (!t) return t;
        let updated = { ...t };
        let changed = false;
        if (
          t.target_department === 'DCC' ||
          t.targetDepartment === 'DCC' ||
          t.department === 'DCC' ||
          t.dept === 'DCC' ||
          t.assignedToDept === 'DCC' ||
          t.destinationDept === 'DCC' ||
          t.currentHandlerDepartment === 'DCC'
        ) {
          changed = true;
          updated.target_department = t.target_department === 'DCC' ? 'DC' : t.target_department;
          updated.targetDepartment = t.targetDepartment === 'DCC' ? 'DC' : t.targetDepartment;
          updated.department = t.department === 'DCC' ? 'DC' : t.department;
          updated.dept = t.dept === 'DCC' ? 'DC' : t.dept;
          updated.assignedToDept = t.assignedToDept === 'DCC' ? 'DC' : t.assignedToDept;
          updated.destinationDept = t.destinationDept === 'DCC' ? 'DC' : t.destinationDept;
          updated.currentHandlerDepartment = t.currentHandlerDepartment === 'DCC' ? 'DC' : t.currentHandlerDepartment;
        }

        // Fix task department scoping (e.g. PD tasks like DAR-2026-002 / SOP-PD-01)
        const docCode = updated.doc_code || updated.docCode || updated.document_code || '';
        const docId = updated.docId || updated.doc_id;
        const matchedDoc = safeDocs.find(d => 
          (docId && String(d.id) === String(docId)) ||
          (docCode && (d.title === docCode || d.document_code === docCode || d.code === docCode))
        );
        const matchedDar = safeDars.find(d => String(d.id) === String(updated.darId));
        let ownerDept = matchedDar?.department || matchedDoc?.department;
        if (!ownerDept) {
          if (String(docCode).includes('-PD-') || String(updated.title).includes('-PD-') || String(updated.darId).includes('-PD-')) {
            ownerDept = 'PD';
          }
        }
        
        const isDccTask = isDccExclusiveTask(updated) || isDccOperationalTask(updated);
        const isReceipt = isReceiptTask(updated);
        if (isDccTask) {
          if (updated.department !== 'DC' || updated.target_department !== 'DC' || updated.targetRole !== 'DCC_ADMIN') {
            changed = true;
            updated.department = 'DC';
            updated.target_department = 'DC';
            updated.targetDepartment = 'DC';
            updated.targetRole = 'DCC_ADMIN';
            updated.target_role = 'DCC_ADMIN';
            updated.assignedToRole = 'DCC_ADMIN';
          }
        } else if (isReceipt) {
          const safeCopies = state.controlledCopyInstances || state.documentControlledCopies || [];
          const targetCopyId = String(updated.copy_id || updated.copyId || updated.instanceId || '');
          const matchedCopy = safeCopies.find(i => String(i.id) === targetCopyId);

          const cleanRecipientDept = resolveReceiptTaskDepartment(updated, matchedCopy);

          if (
            updated.department !== cleanRecipientDept ||
            updated.target_department !== cleanRecipientDept ||
            updated.destinationDept !== cleanRecipientDept ||
            updated.assignedToDept !== cleanRecipientDept
          ) {
            changed = true;
            updated.department = cleanRecipientDept;
            updated.target_department = cleanRecipientDept;
            updated.targetDepartment = cleanRecipientDept;
            updated.destinationDept = cleanRecipientDept;
            updated.destination_dept = cleanRecipientDept;
            updated.recipientDepartment = cleanRecipientDept;
            updated.recipient_department = cleanRecipientDept;
            updated.currentHandlerDepartment = cleanRecipientDept;
            updated.assignedToDept = cleanRecipientDept;
            updated.dept_code = cleanRecipientDept;
          }
        } else if (ownerDept) {
          const cleanDept = ownerDept === 'DCC' ? 'DC' : ownerDept;
          if (updated.department !== cleanDept || updated.target_department !== cleanDept) {
            changed = true;
            updated.department = cleanDept;
            updated.target_department = cleanDept;
            updated.owner_dept = cleanDept;
            updated.currentHandlerDepartment = cleanDept;
          }
        }

        // Auto-Sanitize QA/QC residue to QC
        const taskDeptStr = String(updated.department || '');
        if (taskDeptStr === 'QA/QC' || taskDeptStr === 'QAQC' || taskDeptStr.includes('QA/QC') || taskDeptStr.includes('ประกันและควบคุมคุณภาพ')) {
          if (updated.department !== 'QC') {
            updated.department = 'QC';
            changed = true;
          }
          if (updated.departmentName !== 'ฝ่ายประกันและควบคุมคุณภาพ') {
            updated.departmentName = 'ฝ่ายประกันและควบคุมคุณภาพ';
            changed = true;
          }
          if (updated.target_department === 'QA/QC' || updated.target_department === 'QA') {
            updated.target_department = 'QC';
            changed = true;
          }
          if (updated.targetDepartment === 'QA/QC') {
            updated.targetDepartment = 'QC';
            changed = true;
          }
          if (updated.destinationDept === 'QA/QC') {
            updated.destinationDept = 'QC';
            changed = true;
          }
          if (updated.assignedToDept === 'QA/QC') {
            updated.assignedToDept = 'QC';
            changed = true;
          }
        }

        if (updated.department === 'QC' && updated.departmentName !== 'ฝ่ายประกันและควบคุมคุณภาพ') {
          updated.departmentName = 'ฝ่ายประกันและควบคุมคุณภาพ';
          changed = true;
        }

        if (changed) hasChange = true;
        return updated;
      });
      if (hasChange) {
        if (store?.setState) {
          store.setState({ tasks: cleaned });
        } else {
          state.tasks = cleaned;
        }
      }
    }

    // Auto-Heal external documents review_status on app boot
    if (state && state.externalDocuments && Array.isArray(state.externalDocuments)) {
      const now = new Date();
      let extChanged = false;
      const sanitizedExtDocs = state.externalDocuments.map(doc => {
        const sanitized = sanitizeExternalDocReviewStatus(doc, now);
        if (sanitized !== doc) extChanged = true;
        return sanitized;
      });
      if (extChanged) {
        if (store?.setState) {
          store.setState({ externalDocuments: sanitizedExtDocs });
        } else {
          state.externalDocuments = sanitizedExtDocs;
        }
      }
    }
  },
  partialize: (state) => {
    // 🛡️ Helper to strip all in-memory File, Blobs, binary data to prevent QuotaExceededError without unused variable warnings
    const stripBinaries = (item) => {
      if (!item || typeof item !== 'object') return item;
      const clean = { ...item };
      delete clean.fileBlob;
      delete clean.binaryData;
      delete clean.pdf_binary;
      delete clean.pdfBlob;
      delete clean.blob;
      delete clean.previewBlob;
      delete clean.rawBlob;
      delete clean.fileContent;
      delete clean.final_file;
      delete clean.file;
      return clean;
    };

    // 🛡️ Sanitize documents: strip all in-memory File, Blobs, binary data to prevent QuotaExceededError
    const sanitizeDoc = (doc) => {
      if (!doc) return doc;
      const originalFile = doc.file;
      const cleanDoc = stripBinaries(doc);

      // Retain serializable fileKey and fileName
      const fileName = cleanDoc.fileName || cleanDoc.file_name || cleanDoc.name || (typeof originalFile === 'object' && originalFile?.name ? originalFile.name : undefined);
      const fileKey = cleanDoc.fileKey || cleanDoc.fileId || cleanDoc.file_id || (typeof originalFile === 'string' && !originalFile.startsWith('data:') ? originalFile : undefined);

      const res = {
        ...cleanDoc,
        fileName,
        fileKey: fileKey || cleanDoc.id
      };

      if (Array.isArray(res.revision_history)) {
        res.revision_history = res.revision_history.map(rev => {
          if (!rev) return rev;
          const cleanRev = stripBinaries(rev);
          return {
            ...cleanRev,
            fileName: cleanRev.fileName || res.fileName,
            fileKey: cleanRev.fileKey || cleanRev.fileId || res.fileKey
          };
        });
      }

      return res;
    };

    // 🛡️ Sanitize DARs: strip attached file blobs and binary payloads
    const sanitizeDar = (dar) => {
      if (!dar) return dar;
      const cleanDar = stripBinaries(dar);

      let cleanAttachedFile = cleanDar.attachedFile;
      if (cleanAttachedFile) {
        cleanAttachedFile = {
          name: cleanAttachedFile.name || cleanAttachedFile.fileName || cleanDar.fileName,
          fileId: cleanAttachedFile.fileId || cleanAttachedFile.id || cleanDar.fileId || cleanDar.id,
          size: cleanAttachedFile.size,
          type: cleanAttachedFile.type
        };
      }

      return {
        ...cleanDar,
        fileName: cleanDar.fileName || cleanDar.fileNameOriginal || cleanAttachedFile?.name,
        fileKey: cleanDar.fileKey || cleanDar.fileId || cleanAttachedFile?.fileId || cleanDar.id,
        attachedFile: cleanAttachedFile
      };
    };

    // 🛡️ Sanitize Tasks: strip large file blobs
    const sanitizeTask = (task) => {
      if (!task) return task;
      const cleanTask = stripBinaries(task);

      let cleanAttachedFile = cleanTask.attachedFile;
      if (cleanAttachedFile) {
        cleanAttachedFile = {
          name: cleanAttachedFile.name || cleanAttachedFile.fileName,
          fileId: cleanAttachedFile.fileId || cleanAttachedFile.id,
          size: cleanAttachedFile.size,
          type: cleanAttachedFile.type
        };
      }

      return {
        ...cleanTask,
        fileName: cleanTask.fileName || cleanAttachedFile?.name,
        fileKey: cleanTask.fileKey || cleanTask.fileId || cleanAttachedFile?.fileId,
        attachedFile: cleanAttachedFile
      };
    };

    // 🛡️ Sanitize Controlled Copies: strip binary data
    const sanitizeCopy = (copy) => {
      if (!copy) return copy;
      return stripBinaries(copy);
    };

    return {
      currentUser: state.currentUser,
      masterUsers: state.masterUsers?.map(u => ({
        ...u,
        signatureImage: u.signatureType === 'DRAWN' ? null : u.signatureImage
      })),
      requestUsers: state.requestUsers?.map(u => ({
        ...u,
        signatureImage: u.signatureType === 'DRAWN' ? null : u.signatureImage
      })),
      reviewUsers: state.reviewUsers?.map(u => ({
        ...u,
        signatureImage: u.signatureType === 'DRAWN' ? null : u.signatureImage
      })),
      approveUsers: state.approveUsers?.map(u => ({
        ...u,
        signatureImage: u.signatureType === 'DRAWN' ? null : u.signatureImage
      })),
      masterDepartments: state.masterDepartments,
      departments: state.departments,
      documentTypes: state.documentTypes,
      distributionLocations: state.distributionLocations,
      signatureSettings: state.signatureSettings,
      slaSettings: state.slaSettings,
      approvalMatrix: state.approvalMatrix,
      approval_matrix: state.approval_matrix,
      tasks: state.tasks?.map(sanitizeTask),
      notifications: state.notifications,
      dars: state.dars?.map(sanitizeDar),
      darRequests: (state.darRequests || state.dars)?.map(sanitizeDar),
      timeline: state.timeline,
      documents: state.documents?.map(sanitizeDoc),
      masterDocuments: (state.masterDocuments || state.documents)?.map(sanitizeDoc),
      supersededDocuments: state.supersededDocuments?.map(sanitizeDoc),
      externalDocuments: state.externalDocuments?.map(sanitizeDoc),
      externalRequests: state.externalRequests,
      controlledCopies: (state.controlledCopies || state.documentControlledCopies)?.map(sanitizeCopy),
      documentControlledCopies: (state.documentControlledCopies || state.controlledCopies)?.map(sanitizeCopy),
      controlledCopyInstances: state.controlledCopyInstances?.map(sanitizeCopy),
      controlledCopyAuditTrail: state.controlledCopyAuditTrail,
      copyDispositionRecords: state.copyDispositionRecords,
      dispositionHistory: state.dispositionHistory,
      actionLog: state.actionLog,
      periodicReviewSchedules: state.periodicReviewSchedules,
      periodicReviewTasks: state.periodicReviewTasks,
      periodicReviewRecords: state.periodicReviewRecords
    };
  },
  storage: createJSONStorage(() => {
    if (typeof window !== 'undefined' && window.localStorage) {
      return {
        getItem: (name) => {
          try {
            return window.localStorage.getItem(name);
          } catch {
            return null;
          }
        },
        setItem: (name, value) => {
          try {
            window.localStorage.setItem(name, value);
          } catch (error) {
            if (error?.name === 'QuotaExceededError' || error?.code === 22) {
              console.warn(`[Storage] LocalStorage quota exceeded on key "${name}". Running emergency purge of temporary cache.`);
              const keysToPurge = ['recent_preview_cache', 'temp_pdf_data', 'draft_backups'];
              keysToPurge.forEach(k => {
                try { window.localStorage.removeItem(k); } catch { /* ignore */ }
              });

              try {
                window.localStorage.setItem(name, value);
              } catch (innerErr) {
                console.error('[Storage] LocalStorage quota exceeded even after cache purge; preserving in-memory state without overwriting:', innerErr);
                toast.error('พื้นที่จัดเก็บในเบราว์เซอร์เต็ม: การเปลี่ยนแปลงล่าสุดยังไม่ถูกบันทึก กรุณาสำรองข้อมูลก่อนปิดหน้าเว็บ', { id: 'storage-quota-full', duration: 10000 });
              }
            } else {
              console.error('[Storage] LocalStorage error:', error);
            }
          }
        },
        removeItem: (name) => {
          try {
            window.localStorage.removeItem(name);
          } catch { /* ignore */ }
        },
      };
    }
    const memStore = new Map();
    return {
      getItem: (name) => memStore.get(name) || null,
      setItem: (name, value) => memStore.set(name, String(value)),
      removeItem: (name) => memStore.delete(name),
    };
  })
};

export default persistConfig;

