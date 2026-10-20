/**
 * Master Documents & Document Categories Zustand Slice
 * Extracted from useStore.js (Phase 6 Refactor)
 */
import { hasDocumentAccess, canUserAccessDocument as canUserAccessDocHelper } from '../utils/accessControl';
import { generateDocumentCode } from '../services/MasterDataService';
import { getSystemSampleDocumentBlob } from '../utils/pdfStamper';
import { saveFile } from '../utils/fileStorage';
import { MOCK_DOCUMENTS, MOCK_DARS, MOCK_DOC_FORMATS, MASTER_DATA_USER } from '../../../store/fixtures/seedData';
import { MASTER_DOCUMENT_TYPES } from '../config/qmsRegistry';
import { getDocCode, syncMirroredState } from '../utils/domainNormalizer';

export const DEFAULT_DOCUMENT_CATEGORIES = [
  { id: 'PROCEDURE', code: 'SOP', name: 'ระเบียบปฏิบัติงาน (SOP)', nameTh: 'ระเบียบปฏิบัติงาน', category: 'INTERNAL' },
  { id: 'WORK_INSTRUCTION', code: 'WI', name: 'วิธีปฏิบัติงาน (WI)', nameTh: 'วิธีปฏิบัติงาน', category: 'INTERNAL' },
  { id: 'FORM', code: 'FM', name: 'แบบฟอร์ม (FM)', nameTh: 'แบบฟอร์ม', category: 'INTERNAL' },
  { id: 'STANDARD', code: 'SD', name: 'มาตรฐานคุณภาพ (SD)', nameTh: 'มาตรฐานคุณภาพ', category: 'INTERNAL' },
  { id: 'EXTERNAL', code: 'ED', name: 'เอกสารภายนอก (ED)', nameTh: 'เอกสารภายนอก', category: 'EXTERNAL' }
];

export const createMasterDocSlice = (set, get) => ({
  // State
  documents: [],
  masterDocuments: [],
  supersededDocuments: [],
  documentCategories: [...DEFAULT_DOCUMENT_CATEGORIES],
  docTypes: MASTER_DOCUMENT_TYPES,
  documentTypes: MASTER_DOCUMENT_TYPES,
  documentTemplates: [],
  docFormats: MOCK_DOC_FORMATS,

  // Setters
  setDocuments: (documents) => set({ documents, masterDocuments: documents }),
  setMasterDocuments: (docs) => set({ masterDocuments: docs, documents: docs }),

  // CRUD & Document Management
  addDocument: (newDoc) => {
    if (!newDoc) return null;
    const docId = newDoc.id || `DOC-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const docWithId = {
      ...newDoc,
      id: docId,
      status: newDoc.status || 'EFFECTIVE',
      is_active: newDoc.is_active !== undefined ? newDoc.is_active : true,
      created_at: newDoc.created_at || new Date().toISOString()
    };
    set((state) => {
      const docs = [docWithId, ...(state.documents || [])];
      return {
        documents: docs,
        masterDocuments: docs
      };
    });
    return docWithId;
  },

  addMasterDocument: (newMasterDoc) => {
    if (!newMasterDoc) return null;
    let docId = newMasterDoc.id;
    set((state) => {
      const currentMaster = state.masterDocuments || [];
      const currentDocs = state.documents || [];
      const exists = currentMaster.some(d => (newMasterDoc.docNo && d.docNo === newMasterDoc.docNo) || (d.id && d.id === newMasterDoc.id));
      if (exists) return state;
      docId = newMasterDoc.id || `DOC-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const docWithId = { ...newMasterDoc, id: docId };
      return {
        masterDocuments: [docWithId, ...currentMaster],
        documents: [docWithId, ...currentDocs]
      };
    });
    return docId;
  },

  updateDocument: (docId, updates) => set((state) => {
    const updateFn = (d) => {
      const match = String(d.id) === String(docId) ||
                    (d.document_code && d.document_code === docId) ||
                    (d.docNo && d.docNo === docId) ||
                    (d.code && d.code === docId);
      return match ? { ...d, ...updates, updated_at: new Date().toISOString() } : d;
    };
    return {
      documents: (state.documents || []).map(updateFn),
      masterDocuments: (state.masterDocuments || []).map(updateFn),
      supersededDocuments: (state.supersededDocuments || []).map(updateFn)
    };
  }),

  deleteDocument: (docId) => set((state) => {
    const filterFn = (d) => {
      const match = String(d.id) === String(docId) ||
                    (d.document_code && d.document_code === docId) ||
                    (d.docNo && d.docNo === docId) ||
                    (d.code && d.code === docId);
      return !match;
    };
    return {
      documents: (state.documents || []).filter(filterFn),
      masterDocuments: (state.masterDocuments || []).filter(filterFn),
      supersededDocuments: (state.supersededDocuments || []).filter(filterFn)
    };
  }),

  archiveDocument: (docId, reason = '') => set((state) => {
    const now = new Date().toISOString();
    const updateFn = (d) => {
      const match = String(d.id) === String(docId) ||
                    (d.document_code && d.document_code === docId) ||
                    (d.docNo && d.docNo === docId) ||
                    (d.code && d.code === docId);
      if (match) {
        return {
          ...d,
          status: 'ARCHIVED',
          is_active: false,
          is_archived: true,
          archived_at: now,
          archive_reason: reason
        };
      }
      return d;
    };
    return {
      documents: (state.documents || []).map(updateFn),
      masterDocuments: (state.masterDocuments || []).map(updateFn)
    };
  }),

  restoreDocument: (docId) => set((state) => {
    const updateFn = (d) => {
      const match = String(d.id) === String(docId) ||
                    (d.document_code && d.document_code === docId) ||
                    (d.docNo && d.docNo === docId) ||
                    (d.code && d.code === docId);
      if (match) {
        return {
          ...d,
          status: 'EFFECTIVE',
          is_active: true,
          is_archived: false,
          restored_at: new Date().toISOString()
        };
      }
      return d;
    };
    return {
      documents: (state.documents || []).map(updateFn),
      masterDocuments: (state.masterDocuments || []).map(updateFn)
    };
  }),

  searchDocuments: (query) => {
    const docs = get().documents || [];
    if (!query || typeof query !== 'string' || !query.trim()) return docs;
    const q = query.trim().toLowerCase();
    return docs.filter(d => 
      (d.document_code && d.document_code.toLowerCase().includes(q)) ||
      (d.docNo && d.docNo.toLowerCase().includes(q)) ||
      (d.code && d.code.toLowerCase().includes(q)) ||
      (d.title && d.title.toLowerCase().includes(q)) ||
      (d.name && d.name.toLowerCase().includes(q)) ||
      (d.department && d.department.toLowerCase().includes(q))
    );
  },

  filterDocuments: (filters = {}) => {
    let docs = get().documents || [];
    if (filters.department && filters.department !== 'ALL') {
      docs = docs.filter(d => d.department === filters.department || d.dept === filters.department || d.owner_dept === filters.department);
    }
    if (filters.status && filters.status !== 'ALL') {
      docs = docs.filter(d => d.status === filters.status);
    }
    if (filters.docType && filters.docType !== 'ALL') {
      docs = docs.filter(d => (d.docType || d.type || d.document_type || '').toUpperCase() === filters.docType.toUpperCase());
    }
    return docs;
  },

  generateNextDocumentCode: (docType = 'SOP', dept = 'PD') => {
    const state = get();
    return generateDocumentCode(docType, dept, state.documents || []);
  },

  resolveDocumentCode: (doc) => getDocCode(doc) || '',

  setDocumentStatus: (docId, status, additionalProps = {}) => set((state) => {
    const updateFn = (d) => {
      const match = String(d.id) === String(docId) || (d.document_code && d.document_code === docId) || (d.docNo && d.docNo === docId);
      return match ? { ...d, status, ...additionalProps, updated_at: new Date().toISOString() } : d;
    };
    return {
      documents: (state.documents || []).map(updateFn),
      masterDocuments: (state.masterDocuments || []).map(updateFn)
    };
  }),

  markDocumentEffective: (docId, effectiveDate = new Date().toISOString().split('T')[0]) => {
    get().setDocumentStatus(docId, 'EFFECTIVE', {
      is_active: true,
      is_superseded: false,
      is_obsolete: false,
      effectiveDate,
      effective_date: effectiveDate
    });
  },

  markDocumentSuperseded: (docId, supersededByRev = '') => {
    const now = new Date().toISOString();
    set((state) => {
      const updatedDocs = (state.documents || []).map(d => {
        const match = String(d.id) === String(docId) || (d.document_code && d.document_code === docId) || (d.docNo && d.docNo === docId);
        if (match) {
          return {
            ...d,
            status: 'SUPERSEDED',
            is_active: false,
            is_superseded: true,
            superseded_at: now,
            supersededByRev
          };
        }
        return d;
      });
      const supersededSnapshots = updatedDocs.filter(d => d.status === 'SUPERSEDED' || d.is_superseded);
      return {
        documents: updatedDocs,
        masterDocuments: updatedDocs,
        supersededDocuments: supersededSnapshots
      };
    });
  },

  markDocumentObsolete: (docId, reason = '') => {
    const now = new Date().toISOString();
    set((state) => {
      const updatedDocs = (state.documents || []).map(d => {
        const match = String(d.id) === String(docId) || (d.document_code && d.document_code === docId) || (d.docNo && d.docNo === docId);
        if (match) {
          return {
            ...d,
            status: 'OBSOLETE',
            is_active: false,
            is_obsolete: true,
            obsolete_at: now,
            obsolete_reason: reason
          };
        }
        return d;
      });
      return {
        documents: updatedDocs,
        masterDocuments: updatedDocs
      };
    });
  },

  // Document Access Verification Engine (Auto-whitelisting for Workflow Participants & Admins)
  canUserAccessDocument: (doc, user) => canUserAccessDocHelper(doc, user || get().currentUser),

  // Departmental Access Control
  canAccessDocument: (userId, documentDept, distributions = []) => {
    const user = (get().masterUsers || MASTER_DATA_USER).find(u => u.id === userId);
    if (!user) return false;

    if (documentDept === user.dept) return true;
    if (distributions && distributions.some(d => d.dept === user.dept || d.departmentId === user.dept)) return true;
    if (user.level >= 5) return true;
    if (user.isDcc) return true;
    return false;
  },

  canDownloadDocument: (doc, user) => {
    if (!doc || !user) return false;
    if (user.isDcc || user.role === 'DCC_ADMIN') return true;

    const isForm = Boolean(
      doc.docType === 'FM' ||
      doc.doc_type === 'FM' ||
      doc.type === 'FM' ||
      String(doc.title || doc.code || doc.document_code || doc.name || '').startsWith('FM')
    );
    if (isForm) {
      return hasDocumentAccess(doc, user);
    }

    if (user.level >= 5) return true;

    const userDept = user.department || user.dept;
    const userDepts = user.depts || (userDept ? [userDept] : []);
    const docDept = doc.owner_dept || doc.department;

    const isMatch = (targetDept) => {
      if (!targetDept) return false;
      return userDepts.some(u => {
        if (u === targetDept) return true;
        const isQa1 = u === 'QA' || u === 'QA/QC' || u === 'QC' || u === 'QAQC';
        const isQa2 = targetDept === 'QA' || targetDept === 'QA/QC' || targetDept === 'QC' || targetDept === 'QAQC';
        return Boolean(isQa1 && isQa2);
      });
    };

    if (isMatch(docDept)) return true;
    if (doc.target_depts && doc.target_depts.some(d => isMatch(d))) return true;
    if (doc.distributions && doc.distributions.some(d => {
      const dDept = d.departmentId || d.dept;
      return isMatch(dDept);
    })) return true;

    return false;
  },

  // Document Type Actions
  addDocumentType: (typeData) => set((state) => {
    const code = typeData.code.toUpperCase().trim();
    const currentTypes = state.documentTypes || [];
    if (currentTypes.some(t => t.code === code || t.id === code)) {
      throw new Error(`รหัสประเภทเอกสาร "${code}" มีอยู่ในระบบแล้ว`);
    }

    const category = typeData.category || (code === 'ED' ? 'EXTERNAL' : 'INTERNAL');
    const allowDar = typeData.allowDar !== undefined ? Boolean(typeData.allowDar) : (category !== 'EXTERNAL' && code !== 'ED');

    const newType = {
      id: code,
      code: code,
      name: typeData.name || code,
      nameTh: typeData.nameTh || typeData.name || code,
      namingPattern: typeData.namingPattern || `${code}-{Dept}-{##}`,
      is_form_type: Boolean(typeData.is_form_type),
      reviewCycleMonths: Number(typeData.reviewCycleMonths) || 12,
      retentionPeriodYears: Number(typeData.retentionPeriodYears) || 3,
      category,
      allowDar,
      status: typeData.status || 'ACTIVE',
      description: typeData.description || ''
    };

    const updatedTypes = [...currentTypes, newType];
    return {
      documentTypes: updatedTypes,
      actionLog: [{
        id: `LOG-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        actionType: 'MASTER_DOCTYPE_CREATED',
        actor: state.currentUser?.name || 'DCC Officer',
        details: `Created document type ${newType.code} (${newType.nameTh})`,
        timestamp: new Date().toISOString()
      }, ...(state.actionLog || [])]
    };
  }),

  updateDocumentType: (typeId, typeData) => set((state) => {
    const currentTypes = state.documentTypes || [];
    const updatedTypes = currentTypes.map(t => {
      if (t.id === typeId || t.code === typeId) {
        const category = typeData.category !== undefined ? typeData.category : (t.category || (t.code === 'ED' ? 'EXTERNAL' : 'INTERNAL'));
        const allowDar = typeData.allowDar !== undefined ? Boolean(typeData.allowDar) : (t.allowDar !== undefined ? t.allowDar : (category !== 'EXTERNAL' && t.code !== 'ED'));
        return {
          ...t,
          ...typeData,
          category,
          allowDar,
          reviewCycleMonths: typeData.reviewCycleMonths !== undefined ? Number(typeData.reviewCycleMonths) : t.reviewCycleMonths,
          retentionPeriodYears: typeData.retentionPeriodYears !== undefined ? Number(typeData.retentionPeriodYears) : t.retentionPeriodYears,
          is_form_type: typeData.is_form_type !== undefined ? Boolean(typeData.is_form_type) : t.is_form_type
        };
      }
      return t;
    });

    return {
      documentTypes: updatedTypes,
      actionLog: [{
        id: `LOG-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        actionType: 'MASTER_DOCTYPE_UPDATED',
        actor: state.currentUser?.name || 'DCC Officer',
        details: `Updated document type ${typeId}`,
        timestamp: new Date().toISOString()
      }, ...(state.actionLog || [])]
    };
  }),

  toggleDocumentTypeStatus: (typeId) => set((state) => {
    const currentTypes = state.documentTypes || [];
    const updatedTypes = currentTypes.map(t => {
      if (t.id === typeId || t.code === typeId) {
        return { ...t, status: t.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' };
      }
      return t;
    });

    return {
      documentTypes: updatedTypes
    };
  }),

  // Seed historical superseded snapshots (WI-QC-01 Rev.00 & Rev.01) if overwritten or absent
  seedSupersededMockHistory: () => {
    let blob00 = null;
    let blob01 = null;
    let blob02 = null;
    try {
      if (typeof getSystemSampleDocumentBlob === 'function') {
        blob00 = getSystemSampleDocumentBlob('WI-QC-01', 'ขั้นตอนการตรวจสอบคุณภาพวัตถุดิบรับเข้า Rev.00');
        blob01 = getSystemSampleDocumentBlob('WI-QC-01', 'ขั้นตอนการตรวจสอบคุณภาพวัตถุดิบรับเข้า Rev.01');
        blob02 = getSystemSampleDocumentBlob('WI-QC-01', 'ขั้นตอนการตรวจสอบคุณภาพวัตถุดิบรับเข้า Rev.02');
        if (blob00) {
          saveFile('DOC_WI-QC-01_REV00', blob00).catch(() => {});
          saveFile('FILE_WI-QC-01_REV00', blob00).catch(() => {});
          saveFile('DOC_WI-QC-01_REV_00', blob00).catch(() => {});
          saveFile('FILE_WI-QC-01_REV_00', blob00).catch(() => {});
          saveFile('WI-QC-01_REV_00', blob00).catch(() => {});
        }
        if (blob01) {
          saveFile('DOC_WI-QC-01_REV01', blob01).catch(() => {});
          saveFile('FILE_WI-QC-01_REV01', blob01).catch(() => {});
          saveFile('DOC_WI-QC-01_REV_01', blob01).catch(() => {});
          saveFile('FILE_WI-QC-01_REV_01', blob01).catch(() => {});
          saveFile('WI-QC-01_REV_01', blob01).catch(() => {});
        }
        if (blob02) {
          saveFile('DOC_WI-QC-01_REV02', blob02).catch(() => {});
          saveFile('FILE_WI-QC-01_REV02', blob02).catch(() => {});
          saveFile('DOC_WI-QC-01_REV_02', blob02).catch(() => {});
          saveFile('FILE_WI-QC-01_REV_02', blob02).catch(() => {});
          saveFile('WI-QC-01_REV_02', blob02).catch(() => {});
          saveFile('WI-QC-01', blob02).catch(() => {});
        }
      }
    } catch {}

    const qcBaselineDocs = MOCK_DOCUMENTS.filter(d => 
      ['WI-QC-01_REV_00', 'WI-QC-01_REV_01', 'WI-QC-01_REV_02'].includes(d.id)
    );
    const qcBaselineDars = MOCK_DARS.filter(d => 
      ['DAR-2026-001', 'DAR-2026-002', 'DAR-2026-003'].includes(d.id)
    );

    set(state => {
      let currentDocs = [...(state.documents || [])];
      qcBaselineDocs.forEach(seedDoc => {
        const cleanRev = String(seedDoc.revision || seedDoc.rev || '00').replace(/\D/g, '');
        const existingIdx = currentDocs.findIndex(d => {
          const c = d.document_code || d.code || d.doc_code || d.docNo || d.title;
          const r = String(d.revision || d.rev || '00').replace(/\D/g, '');
          return c && c.trim().toUpperCase() === 'WI-QC-01' && r === cleanRev;
        });
        const assignedBlob = cleanRev === '00' ? blob00 : (cleanRev === '01' ? blob01 : blob02);
        const docWithBlob = {
          ...seedDoc,
          file: assignedBlob || seedDoc.file,
          fileBlob: assignedBlob || seedDoc.fileBlob,
          revision_history: seedDoc.revision_history || [
            ...(cleanRev === '02' ? [
              { revision: '00', rev: '00', dar_no: 'DAR-2026-001', file: blob00, fileBlob: blob00, effective_date: '2025-01-15' },
              { revision: '01', rev: '01', dar_no: 'DAR-2026-002', file: blob01, fileBlob: blob01, effective_date: '2025-06-20' }
            ] : (cleanRev === '01' ? [
              { revision: '00', rev: '00', dar_no: 'DAR-2026-001', file: blob00, fileBlob: blob00, effective_date: '2025-01-15' }
            ] : []))
          ]
        };

        if (existingIdx === -1) {
          currentDocs.push(docWithBlob);
        } else if (cleanRev === '00' || cleanRev === '01') {
          currentDocs[existingIdx] = {
            ...currentDocs[existingIdx],
            ...docWithBlob,
            status: 'SUPERSEDED',
            is_superseded: true,
            is_active: false
          };
        } else {
          currentDocs[existingIdx] = {
            ...currentDocs[existingIdx],
            ...docWithBlob
          };
        }
      });

      let currentDars = [...(state.dars || [])];
      qcBaselineDars.forEach(seedDar => {
        const exists = currentDars.some(d => d.id === seedDar.id || d.dar_no === seedDar.dar_no);
        const darRev = String(seedDar.revision || seedDar.target_revision || '00').replace(/\D/g, '');
        const assignedBlob = darRev === '00' ? blob00 : (darRev === '01' ? blob01 : blob02);
        const darWithBlob = {
          ...seedDar,
          file: assignedBlob || seedDar.file,
          fileBlob: assignedBlob || seedDar.fileBlob,
          final_file: assignedBlob || seedDar.final_file
        };

        if (!exists) {
          currentDars.push(darWithBlob);
        } else {
          currentDars = currentDars.map(d => (d.id === seedDar.id || d.dar_no === seedDar.dar_no) ? { ...d, ...darWithBlob } : d);
        }
      });

      const supersededSnapshots = currentDocs.filter(d => 
        (d.status === 'SUPERSEDED' || d.status === 'SUPERSEDED_ARCHIVED' || d.is_superseded)
      );

      return syncMirroredState({
        documents: currentDocs,
        supersededDocuments: supersededSnapshots,
        dars: currentDars
      });
    });

    if (typeof window !== 'undefined' && window.localStorage) {
      const storageKey = 'qms-enterprise-storage';
      try {
        const persisted = JSON.parse(localStorage.getItem(storageKey) || '{}');
        if (persisted && persisted.state) {
          persisted.state.documents = get().documents;
          persisted.state.supersededDocuments = get().supersededDocuments;
          persisted.state.dars = get().dars;
          localStorage.setItem(storageKey, JSON.stringify(persisted));
        }
      } catch (err) {
        console.error('Failed to persist superseded mock history:', err);
      }
    }
  }
});

