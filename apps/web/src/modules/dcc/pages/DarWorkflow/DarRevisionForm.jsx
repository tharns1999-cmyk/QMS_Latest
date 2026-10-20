import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, useSearchParams, useLocation, useParams } from 'react-router-dom';
import useStore from '../../../../store/useStore';
import { QMS_CONFIG, calculateDueDateBySla } from '../../config/qmsRegistry';
import toast from 'react-hot-toast';
import { FileText, Calendar, Settings, FileEdit, Search, X, ShieldAlert, ChevronLeft, ShieldCheck, UploadCloud, User, AlertTriangle, Building, Layers, RotateCcw, Printer, CheckCircle2, Lock } from 'lucide-react';
import UserSelector from '../../components/UserSelector';
import DistributionSetup from '../../components/workflow/DistributionSetup';
import RelatedStandardsSelector from '../../components/workflow/RelatedStandardsSelector';
import DocumentAccessControlSelector from '../../components/workflow/DocumentAccessControlSelector';
import ActionConfirmModal from '../../../../shared/components/common/ActionConfirmModal';
import Button from '../../../../shared/components/ui/Button';
import { resolveReviewer, resolveApprover } from '../../utils/workflowResolver';
import { normalizeDraftToFormState } from '../../utils/draftNormalizer';
import { 
  getActiveDarForDocument,
  isUserAuthorizedForDocDept 
} from '../../utils/darHelper';
import { cleanLocationName, getMasterStationForDept, normalizeDepartmentId, calculateCopyAllocations } from '../../services/MasterDataService';
import { resolveDocCode, resolveDocTitle } from '../../utils/documentUtils';
import { saveFile } from '../../utils/fileStorage';

const initialFormState = {
  docId: '',
  title: '', // new title, default to old
  changeSummary: '',
  changeReason: '',
  otherReason: '',
  confidentialityLevel: 'INTERNAL',
  slaPriority: 'NORMAL',
  isFastTrack: false,
  dueDate: calculateDueDateBySla('NORMAL'),
  ackRequirement: 'NOT_REQUIRED',
  ackUserId: '',
  distributions: [],
  effectiveDate: '',
  file: null,
  relatedStandards: [],
  otherStandardDetail: '',
  access_control: {
    scope: 'GENERAL',
    authorized_depts: [],
    authorized_users: [],
    min_access_level: 4
  }
};

const DarRevisionForm = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const params = useParams();
  const location = useLocation();
  const rawDraftId = searchParams.get('draftId') || params?.draftId || params?.id || location.state?.draftId;
  const targetDraftId = rawDraftId ? decodeURIComponent(String(rawDraftId)).trim() : null;
  const prefillDocId = location.state?.prefillDocId;
  const deepLinkDocCode = searchParams.get('docCode') || searchParams.get('code') || location.state?.targetDocCode || location.state?.docCode;
  const deepLinkDocId = searchParams.get('docId') || location.state?.selectedDocId || location.state?.docId || prefillDocId;
  const { currentUser, addDar, submitDar, saveDarDraft, deleteDar, masterUsers, reviewUsers, approveUsers, documents, dars, darRequests, documentTypes, simulatedDate, controlledCopyInstances, documentControlledCopies, distributionLocations } = useStore();
  // Document types: prefer runtime store data, fall back to registry
  const activeDocumentTypes = useMemo(() => {
    const storeTypes = documentTypes || [];
    const source = storeTypes.length > 0 ? storeTypes : QMS_CONFIG.documentTypes;
    return source.filter(t =>
      (t.status === 'ACTIVE' || t.status === 'Active' || t.isActive !== false) &&
      t.allowDar !== false &&
      t.category !== 'EXTERNAL' &&
      t.code !== 'ED' &&
      t.id !== 'ED'
    );
  }, [documentTypes]);
  
  const [formData, setFormData] = useState(initialFormState);
  const [selectedFile, setSelectedFile] = useState(null);
  
  const [errors, setErrors] = useState({});
  const [showConfirm, setShowConfirm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isSubmittedRef = useRef(false);
  const hasHydratedDraftRef = useRef(false);
  const hasPrefilledDocRef = useRef(false);
  const hasHandledDeepLinkRef = useRef(false);
  const prevUserRef = useRef({ id: currentUser?.id, dept: currentUser?.department || currentUser?.dept });

  const [searchQuery, setSearchQuery] = useState('');
  const [docTypeFilter, setDocTypeFilter] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const searchContainerRef = useRef(null);
  
  const [lockedSource, setLockedSource] = useState(null);
  const [lockedSourceError, setLockedSourceError] = useState(null);

  useEffect(() => {
    if (hasHydratedDraftRef.current || isSubmittedRef.current) return;
    if (targetDraftId || location.state?.draftData) {
      const allDarsList = dars || darRequests || [];
      const draft = location.state?.draftData || allDarsList.find(d => {
        if (!targetDraftId) return false;
        return (
          String(d.id) === targetDraftId || 
          String(d.dar_no) === targetDraftId || 
          String(d.darNo) === targetDraftId
        );
      });
      if (draft) {
        hasHydratedDraftRef.current = true;
        if (draft.sourceType === 'PERIODIC_REVIEW') {
          try {
            useStore.getState().validateLinkedDarSource(draft);
            const source = useStore.getState().resolveLockedSourceDocument(draft);
            setLockedSource(source);
            setLockedSourceError(null);
            
            const hydrated = normalizeDraftToFormState(draft, initialFormState);
            setFormData(prev => ({
              ...prev,
              ...hydrated,
              docId: draft.targetDocumentId || hydrated.docId,
              title: source.documentTitle || hydrated.title
            }));
          } catch (err) {
            setLockedSourceError(err.message);
          }
        } else {
          setLockedSource(null);
          setLockedSourceError(null);
          const hydrated = normalizeDraftToFormState(draft, initialFormState);
          setFormData(hydrated);
        }
      }
    }
  }, [targetDraftId, dars, darRequests, currentUser?.department, location.state]);

  // Handle Prefill from Periodic Review
  useEffect(() => {
    if (hasPrefilledDocRef.current || isSubmittedRef.current) return;
    if (prefillDocId) {
      const doc = documents.find(d => d.id === prefillDocId);
      if (doc) {
        hasPrefilledDocRef.current = true;
        setFormData(prev => ({
          ...prev,
          docId: doc.id,
          title: doc.title || doc.name,
          changeSummary: 'ทบทวนและแก้ไขเนื้อหาตามรอบการทบทวนประจำปี',
          changeReason: 'PERIODIC_REVIEW'
        }));
      }
    }
  }, [prefillDocId, documents]);

  const allDars = useMemo(() => [...(dars || []), ...(darRequests || [])], [dars, darRequests]);

  // Filter effective documents based on currentUser's department
  const effectiveDocs = useMemo(() => {
    return (documents || []).filter(d => {
      if (!d) return false;
      const status = String(d.status || (d.is_active ? 'ACTIVE' : '')).trim().toUpperCase();
      if (status !== 'EFFECTIVE' && status !== 'ACTIVE') return false;
      if (d.is_obsolete || d.is_superseded || status === 'OBSOLETE' || status === 'SUPERSEDED') return false;
      const docDept = d.department || d.dept || d.owner_dept || d.ownerDepartmentId;
      return isUserAuthorizedForDocDept(docDept, currentUser);
    });
  }, [documents, currentUser]);

  // Handle click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Security Handling: Clear selected doc ONLY if user account or department actually switched
  useEffect(() => {
    if (isSubmitting || isSubmittedRef.current) return;
    const userChanged = prevUserRef.current.id !== currentUser?.id || prevUserRef.current.dept !== (currentUser?.department || currentUser?.dept);
    prevUserRef.current = { id: currentUser?.id, dept: currentUser?.department || currentUser?.dept };

    if (userChanged && formData.docId) {
      const isStillValid = (effectiveDocs || []).some(d => d && d.id === formData.docId);
      if (!isStillValid) {
        setFormData(prev => ({ ...prev, docId: '', title: '' }));
      }
    }
  }, [currentUser?.id, currentUser?.department, currentUser?.dept, formData.docId, effectiveDocs, isSubmitting]);

  const filteredDocs = effectiveDocs.filter(d => {
    const docCode = resolveDocCode(d);
    const docTitle = resolveDocTitle(d);
    const docName = d.name || d.docName || '';
    const docType = d.type || d.docType || d.category || '';

    const matchesType = !docTypeFilter || 
      docType.toUpperCase() === docTypeFilter.toUpperCase() || 
      docCode.toUpperCase().startsWith(docTypeFilter.toUpperCase()) ||
      docTitle.toUpperCase().startsWith(docTypeFilter.toUpperCase());

    const matchesSearch = !searchQuery || 
      docTitle.toLowerCase().includes(searchQuery.toLowerCase()) || 
      docName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      docCode.toLowerCase().includes(searchQuery.toLowerCase());

    return matchesType && matchesSearch;
  });

  const selectedDoc = (effectiveDocs || []).find(d => d.id === formData.docId) || (documents || []).find(d => d.id === formData.docId);

  // Clean Form (FM) Bypass Helper: No controlled copies or distribution ledger for forms
  const isFormDocument = Boolean(
    (selectedDoc && (
      selectedDoc.docType === 'FM' ||
      selectedDoc.doc_type === 'FM' ||
      selectedDoc.type === 'FM' ||
      String(selectedDoc.code || '').startsWith('FM-') ||
      String(selectedDoc.title || '').startsWith('FM-') ||
      String(selectedDoc.name || '').startsWith('FM-') ||
      String(selectedDoc.title || '').startsWith('FM')
    )) || (formData.docType === 'FM')
  );

  const getDocCurrentRevision = (doc) => {
    if (!doc) return '01';
    const r = doc.currentRevision || doc.rev || doc.doc_version || doc.revision || doc.version;
    if (!r) return '01';
    const digits = String(r).replace(/\D/g, '');
    return digits ? digits.padStart(2, '0') : String(r).trim();
  };

  const getCopyRevision = (copy) => {
    if (!copy) return '';
    const r = copy.rev || copy.doc_version || copy.revision || copy.docRev || copy.currentRevision || copy.version;
    if (!r) return '';
    const digits = String(r).replace(/\D/g, '');
    return digits ? digits.padStart(2, '0') : String(r).trim();
  };

  const normCopyNo = (c, defaultNum = 1) => {
    const raw = c.copy_no || c.copyNo || c.ccNumber || '';
    if (!raw) return String(defaultNum).padStart(2, '0');
    const digits = String(raw).replace(/\D/g, '');
    return digits ? digits.padStart(2, '0') : String(raw).trim();
  };

  const calculateNextRev = (currentRev) => {
    const digits = String(currentRev || '').replace(/\D/g, '');
    const revNum = parseInt(digits, 10);
    if (isNaN(revNum)) return '01';
    return String(revNum + 1).padStart(2, '0');
  };

  // Active Controlled Copies in Circulation for the selected document (Strictly Current Revision)
  const activeCopiesInCirculation = useMemo(() => {
    if (!selectedDoc) return [];
    const docRev = getDocCurrentRevision(selectedDoc);
    const allCopies = (controlledCopyInstances && controlledCopyInstances.length > 0)
      ? controlledCopyInstances
      : (documentControlledCopies || []);
    
    // 1. Filter matching document, active status, and current revision (discard old history e.g. Rev.01)
    const filtered = allCopies.filter(c => {
      if (!c) return false;
      const isDocMatch = 
        (c.docCode && (c.docCode === selectedDoc.code || c.docCode === selectedDoc.title)) ||
        (c.documentId && String(c.documentId) === String(selectedDoc.id)) ||
        (c.doc_code && (c.doc_code === selectedDoc.code || c.doc_code === selectedDoc.title)) ||
        (c.docTitle && (c.docTitle === selectedDoc.code || c.docTitle === selectedDoc.title)) ||
        (c.document_code && (c.document_code === selectedDoc.code || c.document_code === selectedDoc.title)) ||
        (c.docId && String(c.docId) === String(selectedDoc.id)) ||
        (c.doc_id && String(c.doc_id) === String(selectedDoc.id));
      if (!isDocMatch) return false;

      // Must be currently active in circulation (not recalled, superseded, void, or destroyed)
      const isActive = c.status === 'ACTIVE' || c.status === 'ISSUED_ACTIVE' || c.status === 'RECEIVED' || c.status === 'DISPATCHED_PENDING_RECEIPT';
      const isNotRecalled = c.status !== 'RECALLED' && c.status !== 'OBSOLETE' && c.status !== 'SUPERSEDED' && c.status !== 'DESTROYED' && c.status !== 'VOID' && c.status !== 'SUPERSEDED_ARCHIVED' && c.status !== 'OBSOLETE_ARCHIVED' && c.status !== 'DAMAGED_VOID' && c.status !== 'LOST_VOID';
      if (!isActive || !isNotRecalled) return false;

      // Filter only copies of the current document revision (e.g. Rev.02); discard old history (e.g. Rev.01)
      const copyRev = getCopyRevision(c);
      if (copyRev && copyRev !== docRev) {
        return false;
      }

      return true;
    });

    // 2. Deduplicate by unique copy number
    const copyMap = new Map();
    filtered.forEach((c, idx) => {
      const copyNo = normCopyNo(c, idx + 1);
      if (!copyMap.has(copyNo)) {
        copyMap.set(copyNo, {
          ...c,
          normalizedCopyNo: copyNo,
          normalizedRev: docRev
        });
      }
    });

    // 3. Sort numerically by copy number
    return Array.from(copyMap.values()).sort((a, b) => {
      const numA = parseInt(a.normalizedCopyNo, 10) || 0;
      const numB = parseInt(b.normalizedCopyNo, 10) || 0;
      return numA - numB;
    });
  }, [selectedDoc, controlledCopyInstances, documentControlledCopies]);

  // Single Source of Truth for Revision Copies (Unified Array with Copy 01 locked at index 0)
  const activeRevisionCopies = useMemo(() => {
    if (!selectedDoc || isFormDocument) return [];
    const ownerDept = selectedDoc.department || currentUser?.department || 'PD';
    const allocs = calculateCopyAllocations(ownerDept, formData.distributions || []);
    return (allocs?.allAllocations || []).map((c, idx) => {
      const copyNum = c.copyNo || c.copy_no || String(idx + 1).padStart(2, '0');
      const isOrigin = c.isOwner || c.is_owner || c.isOriginator || copyNum === '01' || idx === 0;
      const dept = c.departmentId || c.dept || c.dept_code || c.department || ownerDept;
      const loc = cleanLocationName(c.locationName || c.station_name || c.location || c.name || `${dept} Head Office`);
      return {
        ...c,
        copyNo: copyNum,
        copy_no: copyNum,
        department: dept,
        departmentId: dept,
        dept: dept,
        location: loc,
        locationName: loc,
        station_name: loc,
        name: loc,
        isOriginator: isOrigin,
        isOwner: isOrigin,
        isLocked: isOrigin
      };
    });
  }, [selectedDoc, isFormDocument, currentUser?.department, formData.distributions]);

  const handleDocSelect = (doc) => {
    const docCode = resolveDocCode(doc);
    const activeDar = getActiveDarForDocument(allDars, docCode);
    const isLocked = Boolean(activeDar) && (
      !targetDraftId || (
        String(activeDar.id) !== String(targetDraftId) &&
        String(activeDar.dar_no) !== String(targetDraftId) &&
        String(activeDar.darNo) !== String(targetDraftId)
      )
    );
    if (isLocked) {
      toast.error(`ไม่สามารถเลือกเอกสารได้ เนื่องจากติดคำร้อง ${activeDar.dar_no || activeDar.darNo || activeDar.id}`);
      return;
    }

    const initialAc = doc.access_control || {
      scope: 'GENERAL',
      authorized_depts: [],
      authorized_users: [],
      min_access_level: 4
    };

    const docRev = getDocCurrentRevision(doc);
    const allCopies = (controlledCopyInstances && controlledCopyInstances.length > 0)
      ? controlledCopyInstances
      : (documentControlledCopies || []);
    
    // Filter active copies strictly for this document's current revision (Rev.02)
    const docCopies = allCopies.filter(c => {
      if (!c) return false;
      const isDocMatch = 
        (c.docCode && (c.docCode === doc.code || c.docCode === doc.title)) ||
        (c.documentId && String(c.documentId) === String(doc.id)) ||
        (c.doc_code && (c.doc_code === doc.code || c.doc_code === doc.title)) ||
        (c.docTitle && (c.docTitle === doc.code || c.docTitle === doc.title)) ||
        (c.document_code && (c.document_code === doc.code || c.document_code === doc.title)) ||
        (c.docId && String(c.docId) === String(doc.id)) ||
        (c.doc_id && String(c.doc_id) === String(doc.id));
      if (!isDocMatch) return false;

      const isActive = c.status === 'ISSUED_ACTIVE' || c.status === 'ACTIVE' || c.status === 'RECEIVED' || c.status === 'DISPATCHED_PENDING_RECEIPT';
      const isNotRecalled = c.status !== 'RECALLED' && c.status !== 'OBSOLETE' && c.status !== 'SUPERSEDED' && c.status !== 'DESTROYED' && c.status !== 'VOID' && c.status !== 'SUPERSEDED_ARCHIVED' && c.status !== 'OBSOLETE_ARCHIVED';
      if (!isActive || !isNotRecalled) return false;

      const copyRev = getCopyRevision(c);
      if (copyRev && copyRev !== docRev) return false;
      return true;
    });

    const copyMap = new Map();
    docCopies.forEach((c, idx) => {
      const copyNo = normCopyNo(c, idx + 1);
      if (!copyMap.has(copyNo)) {
        copyMap.set(copyNo, c);
      }
    });
    const uniqueDocCopies = Array.from(copyMap.values()).sort((a, b) => {
      const numA = parseInt(normCopyNo(a, 0), 10) || 0;
      const numB = parseInt(normCopyNo(b, 0), 10) || 0;
      return numA - numB;
    });

    let initialDistributions = [];
    const isDocForm = Boolean(
      doc.docType === 'FM' ||
      doc.doc_type === 'FM' ||
      doc.type === 'FM' ||
      String(doc.code || '').startsWith('FM-') ||
      String(doc.title || '').startsWith('FM-') ||
      String(doc.name || '').startsWith('FM-') ||
      String(doc.title || '').startsWith('FM')
    );

    if (!isDocForm) {
      if (uniqueDocCopies.length > 0) {
        // 1-to-1 distribution point mapping directly from active copies of Rev.02
        initialDistributions = uniqueDocCopies.map((c, idx) => {
          const copyNo = normCopyNo(c, idx + 1);
          const dept = c.holder_dept || c.department || c.dept || doc.department || 'PD';
          const locName = cleanLocationName(c.location || c.locationName || c.station_name || `${dept} Station`);
          const locId = c.locationId || c.station_id || `${dept}-LOC-${copyNo}`;
          const isOrigin = copyNo === '01' || !!c.is_owner || !!c.isOwner;
          return {
            id: c.locationId || c.station_id || `loc-${idx}`,
            locationId: locId,
            locationName: locName,
            station_id: locId,
            station_name: locName,
            departmentId: dept,
            department: dept,
            dept: dept,
            dept_code: dept,
            copyNo: copyNo,
            copyLabel: `Copy ${copyNo} (สำเนาควบคุม)`,
            copyType: 'CONTROLLED',
            isMaster: false,
            is_master: false,
            isOwner: isOrigin,
            is_owner: isOrigin
          };
        });
      } else if (doc.distributions && doc.distributions.length > 0) {
        initialDistributions = JSON.parse(JSON.stringify(doc.distributions));
      }

      // ISO 9001 Copy 01 Mandatory Rule: Owner Department MUST always have Copy 01 allocated as master controlled copy
      const ownerDept = doc.department || currentUser?.department || 'PD';
      const normOwner = normalizeDepartmentId(ownerDept);
      const hasCopy01 = initialDistributions.some(d => {
        const cNo = d.copyNo || d.copy_no;
        return cNo === '01' || d.isOwner || d.is_owner || d.isMaster || d.is_master;
      });

      if (!hasCopy01) {
        const masterStation = getMasterStationForDept(normOwner, distributionLocations);
        const cleanOwnerLocName = cleanLocationName(masterStation.name || masterStation.locationName || `${normOwner} Head Office`);
        const copy01Item = {
          id: masterStation.id || `${normOwner}-MASTER`,
          locationId: masterStation.id || `${normOwner}-MASTER`,
          station_id: masterStation.id || `${normOwner}-MASTER`,
          locationName: cleanOwnerLocName,
          station_name: cleanOwnerLocName,
          location: cleanOwnerLocName,
          name: cleanOwnerLocName,
          departmentId: normOwner,
          department: normOwner,
          dept: normOwner,
          dept_code: normOwner,
          copyNo: '01',
          copy_no: '01',
          copyLabel: 'Copy 01 (สำเนาควบคุม)',
          copyType: 'CONTROLLED',
          isMaster: false,
          is_master: false,
          isOwner: true,
          is_owner: true
        };
        initialDistributions.unshift(copy01Item);
      }
    }

    setFormData(prev => ({
      ...prev,
      docId: doc.id,
      title: resolveDocTitle(doc) || doc.name || doc.title,
      distributions: initialDistributions,
      relatedStandards: doc.relatedStandards ? [...doc.relatedStandards] : [],
      otherStandardDetail: doc.otherStandardDetail || '',
      access_control: initialAc,
      ...(doc.title && doc.title.startsWith('FM') ? { ackRequirement: 'NOT_REQUIRED', ackUserId: '' } : {})
    }));
    setSearchQuery('');
    setIsDropdownOpen(false);
  };
  
  const handleClearDoc = () => {
    setFormData(prev => ({
      ...prev,
      docId: '',
      title: '',
      distributions: [],
      relatedStandards: [],
      otherStandardDetail: '',
      access_control: {
        scope: 'GENERAL',
        authorized_depts: [],
        authorized_users: [],
        min_access_level: 4
      }
    }));
    setSearchQuery('');
  };

  const handleDocSelectRef = useRef(handleDocSelect);
  useEffect(() => {
    handleDocSelectRef.current = handleDocSelect;
  });

  // Handle Prefill / Deep-link from Document Library or URL parameters
  useEffect(() => {
    if (hasHandledDeepLinkRef.current || isSubmittedRef.current || isSubmitting) return;
    if (targetDraftId || location.state?.draftData) return;
    if (formData.docId) {
      hasHandledDeepLinkRef.current = true;
      return;
    }

    if (deepLinkDocId || deepLinkDocCode) {
      const candidateList = (effectiveDocs && effectiveDocs.length > 0) ? effectiveDocs : (documents || []);
      const matched = candidateList.find(d => {
        if (!d) return false;
        if (deepLinkDocId && String(d.id) === String(deepLinkDocId)) return true;
        const code = (d.document_code || d.doc_code || d.code || d.docCode || d.title || '').trim().toUpperCase();
        if (deepLinkDocCode && code === String(deepLinkDocCode).trim().toUpperCase()) return true;
        return false;
      });

      if (matched) {
        hasHandledDeepLinkRef.current = true;
        handleDocSelectRef.current(matched);
      }
    }
  }, [deepLinkDocId, deepLinkDocCode, effectiveDocs, documents, targetDraftId, location.state?.draftData, formData.docId, isSubmitting]);

  // Auto-align initial distributions 1-to-1 with active copies of Rev.02 if distributions are empty
  const lastAlignedDocIdRef = useRef(null);
  useEffect(() => {
    if (isSubmitting || isSubmittedRef.current) return;
    if (!selectedDoc) return;
    if (isFormDocument) return; // Clean Form Bypass: No controlled copy auto-alignment for FM
    if (targetDraftId || location.state?.draftData) return;
    if (lastAlignedDocIdRef.current === selectedDoc.id) return;
    lastAlignedDocIdRef.current = selectedDoc.id;

    if (!formData.distributions || formData.distributions.length === 0) {
      let alignedDists = [];
      if (activeCopiesInCirculation && activeCopiesInCirculation.length > 0) {
        alignedDists = activeCopiesInCirculation.map((c, idx) => {
          const copyNo = c.normalizedCopyNo || normCopyNo(c, idx + 1);
          const dept = c.holder_dept || c.department || c.dept || selectedDoc.department || 'PD';
          const locName = cleanLocationName(c.location || c.locationName || c.station_name || `${dept} Station`);
          const locId = c.locationId || c.station_id || `${dept}-LOC-${copyNo}`;
          const isOrigin = copyNo === '01' || !!c.is_owner || !!c.isOwner;
          return {
            id: c.locationId || c.station_id || `loc-${idx}`,
            locationId: locId,
            locationName: locName,
            station_id: locId,
            station_name: locName,
            departmentId: dept,
            department: dept,
            dept: dept,
            dept_code: dept,
            copyNo: copyNo,
            copyLabel: `Copy ${copyNo} (สำเนาควบคุม)`,
            copyType: 'CONTROLLED',
            isMaster: false,
            is_master: false,
            isOwner: isOrigin,
            is_owner: isOrigin
          };
        });
      }

      // Mandatory Copy 01 Allocation Rule
      const ownerDept = selectedDoc.department || currentUser?.department || 'PD';
      const normOwner = normalizeDepartmentId(ownerDept);
      const hasCopy01 = alignedDists.some(d => {
        const cNo = d.copyNo || d.copy_no;
        return cNo === '01' || d.isOwner || d.is_owner || d.isMaster || d.is_master;
      });

      if (!hasCopy01) {
        const masterStation = getMasterStationForDept(normOwner, distributionLocations);
        const cleanOwnerLocName = cleanLocationName(masterStation.name || masterStation.locationName || `${normOwner} Head Office`);
        const copy01Item = {
          id: masterStation.id || `${normOwner}-MASTER`,
          locationId: masterStation.id || `${normOwner}-MASTER`,
          station_id: masterStation.id || `${normOwner}-MASTER`,
          locationName: cleanOwnerLocName,
          station_name: cleanOwnerLocName,
          location: cleanOwnerLocName,
          name: cleanOwnerLocName,
          departmentId: normOwner,
          department: normOwner,
          dept: normOwner,
          dept_code: normOwner,
          copyNo: '01',
          copy_no: '01',
          copyLabel: 'Copy 01 (สำเนาควบคุม)',
          copyType: 'CONTROLLED',
          isMaster: false,
          is_master: false,
          isOwner: true,
          is_owner: true
        };
        alignedDists.unshift(copy01Item);
      }

      setFormData(prev => ({
        ...prev,
        distributions: alignedDists
      }));
    }
  }, [selectedDoc, isFormDocument, targetDraftId, location.state?.draftData, distributionLocations, isSubmitting, formData.distributions, activeCopiesInCirculation, currentUser?.department]);


  /**
   * Reactive Pruning Pipeline & Dynamic Copy Re-indexing
   * When Access Scope or Authorized Departments change:
   * - Prune distributions for departments that are no longer authorized
   * - Never prune owner department's Master Copy 01
   * - Re-index remaining copy numbers sequentially in real-time
   */
  const handleAccessControlChange = (newAc) => {
    const ownerDepartment = selectedDoc?.department || currentUser?.department || 'PD';
    const normOwner = normalizeDepartmentId(ownerDepartment || 'PD');
    const scope = newAc?.scope || 'GENERAL';
    const authorizedDepts = (newAc?.authorized_depts || []).map(d => normalizeDepartmentId(d));

    setFormData(prev => {
      let currentDists = prev.distributions || [];

      // Check if pruning is required based on scope
      let prunedDists = currentDists;
      if (scope === 'DEPT_ONLY' || scope === 'RESTRICTED') {
        // Only keep distributions belonging to the Owner Department
        prunedDists = currentDists.filter(dist => {
          const distDept = normalizeDepartmentId(dist.departmentId || dist.dept || dist.dept_code || dist.department || normOwner);
          return distDept === normOwner || dist.isOwner || dist.is_owner || dist.isMaster || dist.is_master || dist.copyNo === '01';
        });
      } else if (scope === 'TARGETED' && authorizedDepts.length > 0) {
        // Only keep distributions belonging to Owner Department or explicitly Authorized Departments
        prunedDists = currentDists.filter(dist => {
          const distDept = normalizeDepartmentId(dist.departmentId || dist.dept || dist.dept_code || dist.department || normOwner);
          return distDept === normOwner || authorizedDepts.includes(distDept) || dist.isOwner || dist.is_owner || dist.isMaster || dist.is_master || dist.copyNo === '01';
        });
      }

      const allocs = calculateCopyAllocations(normOwner, prunedDists);

      return {
        ...prev,
        access_control: newAc,
        distributions: allocs.distributedCopies
      };
    });
  };

  /**
   * Helper to remove a single distribution chip and dynamically re-index remaining copies
   * Unchecking chip triggers Two-Way Binding with DistributionSetup
   */
  const handleRemoveDistributionChip = (distToRemove) => {
    if (distToRemove.isOriginator || distToRemove.isOwner || distToRemove.is_owner || distToRemove.isMaster || distToRemove.is_master || distToRemove.copyNo === '01' || distToRemove.copy_no === '01' || distToRemove.isLocked) {
      toast.error('ไม่สามารถลบ Copy 01 (สำเนาควบคุม) ของแผนกเจ้าของเอกสารได้');
      return;
    }

    const ownerDept = selectedDoc?.department || currentUser?.department || 'PD';
    const normOwner = normalizeDepartmentId(ownerDept);

    setFormData(prev => {
      const remaining = (prev.distributions || []).filter(d => {
        const dLocId = d.locationId || d.station_id || d.id;
        const targetLocId = distToRemove.locationId || distToRemove.station_id || distToRemove.id;
        const dDept = normalizeDepartmentId(d.departmentId || d.dept || d.dept_code || d.department || d.target_department);
        const targetDept = normalizeDepartmentId(distToRemove.departmentId || distToRemove.dept || distToRemove.dept_code || distToRemove.department || distToRemove.target_department);
        return !(dLocId === targetLocId && dDept === targetDept);
      });

      const allocs = calculateCopyAllocations(normOwner, remaining);
      return {
        ...prev,
        distributions: allocs.distributedCopies
      };
    });
  };

  // Auto-calculated Workflow Participants for Auto-Whitelisting
  const workflowParticipants = useMemo(() => {
    const list = [];
    if (currentUser) {
      list.push({
        id: currentUser.id,
        empId: currentUser.empId,
        name: currentUser.name,
        department: currentUser.department || currentUser.dept || 'QMS',
        role: 'REQUESTER',
        roleTitle: 'ผู้จัดทำ (Requester)'
      });
    }
    const resolvedRevId = resolveReviewer(
      currentUser?.id, 
      currentUser?.department, 
      masterUsers, 
      reviewUsers || masterUsers, 
      formData.docType
    )?.id;
    if (resolvedRevId && resolvedRevId !== currentUser?.id) {
      const revUser = (masterUsers || []).find(u => u.id === resolvedRevId);
      if (revUser) {
        list.push({
          id: revUser.id,
          empId: revUser.empId,
          name: revUser.name,
          department: revUser.primary_department || revUser.department || revUser.dept,
          role: 'REVIEWER',
          roleTitle: 'ผู้ทบทวน (Reviewer)'
        });
      }
    }
    const resolvedAppId = resolveApprover(
      currentUser?.id, 
      resolvedRevId, 
      currentUser?.department, 
      masterUsers, 
      approveUsers || masterUsers, 
      formData.docType
    )?.id;
    if (resolvedAppId && resolvedAppId !== currentUser?.id && resolvedAppId !== resolvedRevId) {
      const appUser = (masterUsers || []).find(u => u.id === resolvedAppId);
      if (appUser) {
        list.push({
          id: appUser.id,
          empId: appUser.empId,
          name: appUser.name,
          department: appUser.primary_department || appUser.department || appUser.dept,
          role: 'APPROVER',
          roleTitle: 'ผู้อนุมัติ (Approver)'
        });
      }
    }
    return list;
  }, [currentUser, formData.docType, masterUsers, reviewUsers, approveUsers]);
  
  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.type && file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
        toast.error('รองรับเฉพาะไฟล์ PDF เท่านั้น');
        e.target.value = '';
        return;
      }
      setSelectedFile(file);
      setFormData(prev => ({ ...prev, file }));

      // Synchronous In-Memory Registry caching immediately upon selection
      window.__PDF_CACHE__ = window.__PDF_CACHE__ || new Map();
      window.__UPLOADED_FILES_MAP__ = window.__UPLOADED_FILES_MAP__ || new Map();
      window.__PDF_CACHE__.set(file.name, file);
      window.__UPLOADED_FILES_MAP__.set(file.name, file);
      const docCodeStr = selectedDoc?.code || selectedDoc?.title || formData.docId;
      if (docCodeStr) {
        window.__PDF_CACHE__.set(docCodeStr, file);
        window.__UPLOADED_FILES_MAP__.set(docCodeStr, file);
      }
    }
  };

  const validate = () => {
    const newErrors = {};
    if (!formData.docId) newErrors.docId = 'กรุณาเลือกเอกสารที่ต้องการแก้ไข';
    if (!formData.title) newErrors.title = 'กรุณาระบุชื่อเอกสารใหม่ (หรือใช้ชื่อเดิม)';
    if (!formData.changeSummary) newErrors.changeSummary = 'กรุณาสรุปการเปลี่ยนแปลง';
    if (!formData.changeReason?.trim() && !formData.reason?.trim()) newErrors.changeReason = 'กรุณาระบุเหตุผลที่ร้องขอ';

    if (formData.relatedStandards?.includes('อื่น ๆ (Others)') && !formData.otherStandardDetail?.trim()) {
      newErrors.otherStandardDetail = 'กรุณาระบุมาตรฐานอื่นๆ';
    }

    if (formData.ackRequirement === 'REQUIRED' && !formData.ackUserId) {
      newErrors.ackUserId = 'กรุณาเลือกผู้รับ Acknowledgement 1 คน';
    }
    
    if (!formData.effectiveDate) {
      newErrors.effectiveDate = 'กรุณาระบุวันที่มีผลบังคับใช้';
    } else {
      const today = new Date(simulatedDate || Date.now());
      today.setHours(0,0,0,0);
      const selected = new Date(formData.effectiveDate);
      if (selected < today) newErrors.effectiveDate = 'ห้ามเลือกวันย้อนหลัง (นับจาก Simulated Date)';
    }
    
    if (!formData.file) newErrors.file = 'กรุณาแนบไฟล์ PDF ฉบับแก้ไข';
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleDraft = () => {
    const draftPayload = {
      id: targetDraftId || formData.id,
      dar_no: formData.darNo || formData.id,
      type: 'REVISION',
      status: 'DRAFT',
      title: lockedSource?.documentTitle || formData.title || (selectedDoc ? selectedDoc.name : 'Untitled Draft'),
      requesterId: currentUser?.id,
      requester_id: currentUser?.id,
      requester_name: currentUser?.name,
      department: selectedDoc?.department || currentUser?.department || formData.department,
      date: formData.date || new Date().toISOString().split('T')[0],
      docIdRef: formData.docId,
      doc_id: formData.docId,
      targetDocumentId: formData.docId,
      document_code: selectedDoc?.title || formData.docCode || formData.docId,
      changeSummary: formData.changeSummary,
      change_summary: formData.changeSummary,
      reasonDetails: formData.changeSummary,
      changeReason: formData.changeReason || formData.reason || '',
      change_reason: formData.changeReason || formData.reason || '',
      reason: formData.changeReason || formData.reason || '',
      requestReason: formData.changeReason || formData.reason || '',
      reasonCategory: formData.changeReason || formData.reason || '',
      confidentialityLevel: formData.confidentialityLevel || 'INTERNAL',
      confidentiality: formData.confidentialityLevel || 'INTERNAL',
      slaPriority: formData.slaPriority || 'NORMAL',
      priority: formData.slaPriority || 'NORMAL',
      isFastTrack: Boolean(formData.isFastTrack || formData.slaPriority === 'FAST_TRACK'),
      dueDate: formData.dueDate || calculateDueDateBySla(formData.slaPriority || 'NORMAL'),
      ackRequirement: formData.ackRequirement,
      requireAck: formData.ackRequirement === 'REQUIRED',
      ackUserIds: formData.ackRequirement === 'REQUIRED' ? (formData.ackUserId ? [formData.ackUserId] : []) : [],
      ackUserId: formData.ackUserId,
      distributions: isFormDocument ? [] : (activeRevisionCopies.length > 0 ? activeRevisionCopies : (formData.distributions || [])),
      distributionList: isFormDocument ? [] : (activeRevisionCopies.length > 0 ? activeRevisionCopies : (formData.distributions || [])),
      newCopies: isFormDocument ? [] : (activeRevisionCopies.length > 0 ? activeRevisionCopies : (formData.distributions || [])),
      effectiveDate: formData.effectiveDate,
      effective_date: formData.effectiveDate,
      relatedStandards: formData.relatedStandards || [],
      otherStandardDetail: formData.otherStandardDetail,
      access_control: formData.access_control,
      accessScope: formData.access_control?.scope || formData.accessScope || 'GENERAL',
      isDraft: true
    };

    if (saveDarDraft) {
      saveDarDraft(draftPayload);
    } else {
      if (targetDraftId && deleteDar) deleteDar(targetDraftId);
      addDar(draftPayload);
    }

    toast.success('บันทึกแบบร่างสำเร็จ');
    navigate('/dashboard');
  };

  const handleFormSubmit = (e) => {
    if (e && e.preventDefault) e.preventDefault();
    const isValid = validate();
    if (isValid) {
      setShowConfirm(true);
    } else {
      console.error('DAR REVISION FORM VALIDATION FAILED:', formData);
      toast.error('กรุณากรอกข้อมูลให้ครบถ้วนและถูกต้อง');
    }
  };

  const executeSubmit = async () => {
    setIsSubmitting(true);
    try {
      const docTypeCode = selectedDoc?.docType || selectedDoc?.type || (selectedDoc?.title ? selectedDoc.title.split('-')[0] : (formData.docType || 'WI'));
      const docCodeStr = selectedDoc?.code || selectedDoc?.title || formData.docId;
      // Periodic-review revisions keep the source title (rename is not allowed on this path)
      const docTitleStr = lockedSource?.documentTitle || formData.title || selectedDoc?.name || 'Untitled Document';
      const nextRevStr = calculateNextRev(selectedDoc?.rev);
      const activeFile = selectedFile || formData.file;
      if (!activeFile) {
        toast.error('กรุณาเลือกไฟล์ PDF ฉบับแก้ไข');
        setIsSubmitting(false);
        return;
      }

      const fileId = `file_${Date.now()}_${activeFile.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
      const fileName = activeFile.name; // บังคับใช้ชื่อไฟล์จริงจาก OS ไม่ใช่ Title

      let attachedFile = {
        fileId: fileId,
        name: fileName,
        size: activeFile.size,
        type: activeFile.type || 'application/pdf',
        file: activeFile,
        uploadedAt: new Date().toISOString()
      };

      // 1. บันทึกลง Synchronous In-Memory Registry ทันที (Synchronous Access)
      window.__PDF_CACHE__ = window.__PDF_CACHE__ || new Map();
      window.__UPLOADED_FILES_MAP__ = window.__UPLOADED_FILES_MAP__ || new Map();
      [window.__PDF_CACHE__, window.__UPLOADED_FILES_MAP__].forEach(cache => {
        cache.set(fileId, activeFile);
        cache.set(fileName, activeFile);
        if (docCodeStr) cache.set(docCodeStr, activeFile);
      });

      // 2. บันทึกลง IndexedDB ควบคู่กัน
      try {
        await saveFile(fileId, activeFile);
        if (docCodeStr) await saveFile(docCodeStr, activeFile);
      } catch (err) {
        console.warn('saveFile error fallback:', err);
      }

      const newDar = {
        type: 'REVISION',
        title: docTitleStr,
        name: docTitleStr,
        docTitle: docTitleStr,
        fileName: fileName, // บังคับใช้ชื่อไฟล์จริงจาก OS
        docCode: docCodeStr,
        document_code: docCodeStr,
        docIdRef: formData.docId,
        doc_id: formData.docId,
        targetDocumentId: formData.docId,
        docType: docTypeCode,
        currentRev: selectedDoc?.rev || '00',
        newRev: nextRevStr,
        rev: nextRevStr,
        requesterId: currentUser?.id || '',
        requester_id: currentUser?.id || '',
        requester_name: currentUser?.name || '',
        department: selectedDoc?.department || currentUser?.department || formData.department || 'PD',
        date: new Date().toISOString().split('T')[0],
        submittedAt: new Date().toISOString(),
        changeSummary: formData.changeSummary || '',
        change_summary: formData.changeSummary || '',
        changeReason: formData.changeReason || formData.reason || '',
        change_reason: formData.changeReason || formData.reason || '',
        reason: formData.changeReason || formData.reason || '',
        requestReason: formData.changeReason || formData.reason || '',
        reasonCategory: formData.changeReason || formData.reason || '',
        confidentialityLevel: formData.confidentialityLevel || 'INTERNAL',
        confidentiality: formData.confidentialityLevel || 'INTERNAL',
        slaPriority: formData.slaPriority || 'NORMAL',
        priority: formData.slaPriority || 'NORMAL',
        isFastTrack: Boolean(formData.isFastTrack || formData.slaPriority === 'FAST_TRACK'),
        dueDate: formData.dueDate || calculateDueDateBySla(formData.slaPriority || 'NORMAL'),
        ackRequirement: formData.ackRequirement || 'NOT_REQUIRED',
        requireAck: formData.ackRequirement === 'REQUIRED',
        require_ack: formData.ackRequirement === 'REQUIRED',
        ackUserIds: formData.ackRequirement === 'REQUIRED' ? (formData.ackUserId ? [formData.ackUserId] : []) : [],
        ackUserId: formData.ackRequirement === 'REQUIRED' ? formData.ackUserId : null,
        distributions: isFormDocument ? [] : (activeRevisionCopies.length > 0 ? activeRevisionCopies : (formData.distributions || [])),
        distributionList: isFormDocument ? [] : (activeRevisionCopies.length > 0 ? activeRevisionCopies : (formData.distributions || [])),
        newCopies: isFormDocument ? [] : (activeRevisionCopies.length > 0 ? activeRevisionCopies : (formData.distributions || [])),
        effectiveDate: formData.effectiveDate || '',
        effective_date: formData.effectiveDate || '',
        relatedStandards: formData.relatedStandards || [],
        otherStandardDetail: formData.otherStandardDetail || '',
        access_control: formData.access_control,
        accessScope: formData.access_control?.scope || 'GENERAL',
        isDraft: false,
        status: 'UNDER_REVIEW',
        fileId: fileId,
        file_id: fileId,
        file: activeFile,
        fileBlob: activeFile,
        attachedFile
      };

      if (targetDraftId && deleteDar) {
        deleteDar(targetDraftId);
      }

      // บันทึกผ่าน submitDar หรือ addDar พร้อมส่งไฟล์จริง
      let result = null;
      if (typeof submitDar === 'function') {
        result = await submitDar(newDar, activeFile);
      } else {
        result = addDar(newDar);
      }

      if (result) {
        const allocatedId = result.id || result.darNumber || result.darNo;
        if (allocatedId) {
          [window.__PDF_CACHE__, window.__UPLOADED_FILES_MAP__].forEach(cache => {
            cache.set(allocatedId, activeFile);
            if (result.darNumber) cache.set(result.darNumber, activeFile);
          });
          try {
            await saveFile(allocatedId, activeFile);
          } catch { /* ignore */ }
        }
      }

      isSubmittedRef.current = true;
      setShowConfirm(false);
      toast.success('ยื่นคำร้อง DAR สำเร็จเรียบร้อย และส่งต่อให้ผู้ทบทวนแล้ว');
      navigate('/dcc/dar/list');
    } catch (err) {
      console.error('Failed to submit DAR Revision:', err);
      toast.error(`เกิดข้อผิดพลาดในการส่งคำร้อง: ${err?.message || 'Unknown Error'}`);
      setShowConfirm(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-4 pb-2 w-full max-w-full h-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 bg-white border border-slate-200/80 rounded-xl shadow-2xs">
        <div className="flex items-center gap-3">
          <FileEdit className="w-5 h-5 text-slate-700 shrink-0" strokeWidth={1.75} />
          <div>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">ยื่นคำขอแก้ไขเอกสาร (Revision DAR)</h1>
            <p className="text-xs text-slate-500 mt-0.5">ปรับปรุงเอกสารที่มีผลบังคับใช้ พร้อมรัน Revision Number อัตโนมัติ</p>
          </div>
        </div>
        <button onClick={() => navigate('/dar/new')} className="h-9 px-3 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors inline-flex items-center gap-1 cursor-pointer">
          <ChevronLeft size={16} /> เปลี่ยนประเภท DAR
        </button>
      </div>
      
      <form onSubmit={handleFormSubmit} className="space-y-4 h-auto">
        
        {/* ================= UNIFIED HIGH-DENSITY MASTER FORM CANVAS ================= */}
        <div className="card-surface overflow-hidden divide-y divide-[#F1F5F9] shadow-2xs">
          
          {/* Section 1: ข้อมูลผู้ร้องขอ (Compact Metadata Strip) */}
          <div className="bg-[#F8FAFC] px-5 py-3 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex flex-wrap items-center gap-4 sm:gap-6">
              <div className="flex items-center gap-2">
                <User className="text-[#0D99FF] shrink-0" size={15} />
                <span className="text-sm font-bold text-[#1E293B] hidden sm:inline">ส่วนที่ 1: ข้อมูลผู้ร้องขอ (Requester Information)</span>
                <span className="text-[#CBD5E1] hidden sm:inline">•</span>
                <label className="text-sm font-semibold text-[#64748B] flex items-center gap-1.5 cursor-default">
                  <span>ชื่อผู้ร้องขอ (Requester):</span>
                  <strong className="text-[#1E293B] font-bold text-sm">{currentUser?.name || 'ผู้ร้องขอ'}</strong>
                </label>
              </div>

              <div className="flex items-center gap-1.5 text-[#64748B] text-sm">
                <span>แผนก:</span>
                <span className="font-mono font-bold text-[#0D99FF] bg-[#E5F4FF] px-2 py-0.5 rounded text-xs">
                  {currentUser?.department || currentUser?.dept || 'PD'}
                </span>
              </div>

              <div className="flex items-center gap-1.5 text-[#64748B] text-sm">
                <Calendar size={14} className="text-[#94A3B8]" />
                <label className="flex items-center gap-1 cursor-default">
                  <span>วันที่ยื่นคำขอ:</span>
                  <span className="font-mono font-medium text-[#1E293B] text-xs">
                    {new Date().toLocaleDateString('th-TH')}
                  </span>
                </label>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[11px] font-semibold text-slate-500 bg-slate-100 px-2.5 py-0.5 rounded-full border border-slate-200">
                [ ฉบับร่าง (รอออกเลข DAR หลังส่งคำร้อง) ]
              </span>
              <div className="text-[11px] font-semibold text-amber-700 bg-amber-50 px-2.5 py-0.5 rounded-full border border-amber-200">
                ขอแก้ไข (REVISION)
              </div>
            </div>
          </div>

          {/* Section 2: เลือกเอกสารและกำหนดวันบังคับใช้ (4-Column Grid) */}
          <div className="p-5 space-y-3 bg-white">
            <div className="flex items-center justify-between pb-1">
              <h3 className="font-bold text-sm text-[#1E293B] uppercase tracking-wider flex items-center gap-2">
                <Settings className="text-[#0D99FF]" size={16} />
                <span className="font-bold text-sm text-[#1E293B]">ส่วนที่ 2: เลือกเอกสารและกำหนดวันบังคับใช้</span>
              </h3>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3.5 items-start pt-1">
              
              {/* 1. เลือกเอกสารเดิม (4 Cols) */}
              <div className="lg:col-span-4">
                <label className="block text-sm font-semibold text-[#334155] mb-1.5">
                  เลือกเอกสารเดิม (จากคลัง Active) <span className="text-[#EF4444]">*</span>
                </label>

                {lockedSourceError ? (
                  <div className="bg-rose-50 border border-rose-200 rounded-lg p-2.5 text-xs text-rose-700">
                    <p className="font-bold">{lockedSourceError}</p>
                  </div>
                ) : lockedSource ? (
                  <div className="h-10.5 px-3 bg-[#E5F4FF]/70 border border-indigo-200 rounded-lg text-xs font-mono font-bold text-[#007BE5] flex items-center justify-between truncate">
                    <span className="truncate">[{lockedSource.documentNo}] {lockedSource.documentTitle}</span>
                  </div>
                ) : selectedDoc ? (
                  <div className="h-10.5 px-3 bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-sm flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="font-mono font-bold text-[#0D99FF] text-xs bg-[#E5F4FF] px-2 py-0.5 rounded shrink-0">{resolveDocCode(selectedDoc)}</span>
                      <span className="text-xs text-[#334155] truncate font-medium">{resolveDocTitle(selectedDoc)}</span>
                    </div>
                    <button
                      type="button"
                      onClick={handleClearDoc}
                      className="text-rose-500 hover:text-rose-700 p-1 hover:bg-rose-50 rounded cursor-pointer shrink-0"
                      title="เปลี่ยนเอกสาร"
                    >
                      <X size={15} />
                    </button>
                  </div>
                ) : (
                  <div className="relative" ref={searchContainerRef}>
                    <div className="flex gap-2">
                      <select
                        value={docTypeFilter}
                        onChange={(e) => setDocTypeFilter(e.target.value)}
                        className="select-primary text-xs w-28 sm:w-44 h-10.5 px-2 bg-white border border-[#CBD5E1] rounded-lg text-[#1E293B] focus:outline-none focus:border-[#0D99FF]"
                      >
                        <option value="">ทุกประเภท</option>
                        {activeDocumentTypes.map(t => {
                          const code = t.code || t.id;
                          const name = t.nameTh || t.name;
                          return <option key={code} value={code}>{name} ({code})</option>;
                        })}
                      </select>
                      <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]" size={15} />
                        <input
                          type="text"
                          placeholder="ค้นหารหัส หรือชื่อ..."
                          value={searchQuery}
                          onChange={(e) => {
                            setSearchQuery(e.target.value);
                            setIsDropdownOpen(true);
                          }}
                          onFocus={() => setIsDropdownOpen(true)}
                          className={`w-full pl-9 pr-7 h-10.5 text-xs bg-white border border-[#CBD5E1] rounded-lg text-[#1E293B] placeholder:text-[#94A3B8] focus:outline-none focus:border-[#0D99FF] focus:ring-2 focus:ring-[#0D99FF]/15 transition-all ${errors.docId ? 'border-rose-400 bg-rose-50/50' : ''}`}
                        />
                        {searchQuery && (
                          <button
                            type="button"
                            onClick={() => setSearchQuery('')}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                          >
                            <X size={14} />
                          </button>
                        )}
                      </div>
                    </div>

                    {isDropdownOpen && (
                      <div className="absolute left-0 right-0 top-full mt-1 border border-[#E2E8F0] rounded-xl max-h-52 overflow-y-auto divide-y divide-slate-100 shadow-xl bg-white z-30">
                        {filteredDocs.length > 0 ? (
                          filteredDocs.map(doc => {
                            const docCode = resolveDocCode(doc);
                            const activeDar = getActiveDarForDocument(allDars, docCode);
                            const isLocked = Boolean(activeDar) && (
                              !targetDraftId || (
                                String(activeDar.id) !== String(targetDraftId) &&
                                String(activeDar.dar_no) !== String(targetDraftId) &&
                                String(activeDar.darNo) !== String(targetDraftId)
                              )
                            );

                            return (
                            <div
                              key={doc.id}
                              onClick={() => {
                                if (isLocked) {
                                  toast.error(`ไม่สามารถเลือกเอกสารได้ เนื่องจากติดคำร้อง ${activeDar.dar_no || activeDar.darNo || activeDar.id}`);
                                  return;
                                }
                                handleDocSelect(doc);
                              }}
                              className={`p-3 flex items-center justify-between text-xs transition-colors ${
                                isLocked 
                                  ? 'opacity-60 bg-slate-50 cursor-not-allowed hover:bg-slate-50' 
                                  : 'hover:bg-[#E5F4FF]/50 cursor-pointer'
                              }`}
                              title={isLocked ? `เอกสารนี้อยู่ระหว่างดำเนินการในคำร้อง ${activeDar.dar_no || activeDar.darNo || activeDar.id} (${activeDar.type || 'DAR'})` : ''}
                            >
                              <div className="min-w-0 pr-2">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="font-mono font-bold text-[#0D99FF]">{docCode}</span>
                                  <span className="text-slate-400 font-mono text-[10px]">Rev.{doc.rev || '01'}</span>
                                  {isLocked && (
                                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 inline-flex items-center gap-1">
                                      <Lock size={10} />
                                      <span>(ติดคำร้อง {activeDar.dar_no || activeDar.darNo || activeDar.id})</span>
                                    </span>
                                  )}
                                </div>
                                <p className="text-[#334155] font-medium truncate mt-0.5">{resolveDocTitle(doc)}</p>
                              </div>
                              <span className="text-[10px] font-bold text-[#64748B] font-mono shrink-0">{doc.department || doc.dept || 'QC'}</span>
                            </div>
                          );})
                        ) : (
                          <div className="p-3 text-center text-slate-400 text-xs">
                            ไม่พบเอกสารที่มีผลบังคับใช้
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
                {errors.docId && <p className="text-rose-500 text-xs mt-1">{errors.docId}</p>}
              </div>

              {/* 2. ชื่อเอกสาร (แก้ไข) (4 Cols) */}
              <div className="lg:col-span-4">
                <label className="block text-sm font-semibold text-[#334155] mb-1.5">
                  {lockedSource ? 'ชื่อเอกสาร' : 'ชื่อเอกสาร (แก้ไข)'} <span className="text-[#EF4444]">*</span>
                </label>
                <input 
                  type="text" 
                  placeholder="ระบุชื่อเอกสาร (สามารถใช้ชื่อเดิมได้)..."
                  value={lockedSource ? lockedSource.documentTitle : formData.title}
                  readOnly={Boolean(lockedSource)}
                  onChange={(e) => setFormData(prev => ({...prev, title: e.target.value}))}
                  className={`w-full h-10.5 px-3.5 text-sm ${lockedSource ? 'bg-slate-100 cursor-not-allowed' : 'bg-white'} border border-[#CBD5E1] rounded-lg text-[#1E293B] placeholder:text-[#94A3B8] focus:outline-none focus:border-[#0D99FF] focus:ring-2 focus:ring-[#0D99FF]/15 transition-all ${errors.title ? 'border-rose-400 bg-rose-50/50' : ''}`}
                />
                {errors.title && <p className="text-rose-500 text-xs mt-1">{errors.title}</p>}
              </div>

              {/* 3. วันที่มีผลบังคับใช้ใหม่ (2 Cols) */}
              <div className="lg:col-span-2">
                <label className="block text-sm font-semibold text-[#334155] mb-1.5">
                  วันที่มีผลบังคับใช้ <span className="text-[#EF4444]">*</span>
                </label>
                <input 
                  type="date"
                  value={formData.effectiveDate}
                  min={new Date(simulatedDate || Date.now()).toISOString().split('T')[0]}
                  onChange={(e) => setFormData(prev => ({...prev, effectiveDate: e.target.value}))}
                  className={`w-full h-10.5 px-3 text-sm bg-white border border-[#CBD5E1] rounded-lg text-[#1E293B] focus:outline-none focus:border-[#0D99FF] focus:ring-2 focus:ring-[#0D99FF]/15 transition-all font-mono ${errors.effectiveDate ? 'border-rose-400 bg-rose-50/50' : ''}`}
                />
                {errors.effectiveDate && <p className="text-rose-500 text-xs mt-1">{errors.effectiveDate}</p>}
              </div>

              {/* 4. ฉบับที่ปรับปรุง (Revision) (2 Cols) */}
              <div className="lg:col-span-2">
                <label className="block text-sm font-semibold text-[#334155] mb-1.5">
                  ฉบับปรับปรุง (Revision)
                </label>
                <div className="h-10.5 px-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg text-xs font-mono font-bold text-[#0D99FF] flex items-center justify-between select-none">
                  <span className="text-slate-500">Rev.{selectedDoc ? getDocCurrentRevision(selectedDoc) : '00'}</span>
                  <span className="text-slate-400 font-sans">➔</span>
                  <span className="text-emerald-600 font-bold">Rev.{selectedDoc ? calculateNextRev(getDocCurrentRevision(selectedDoc)) : '01'}</span>
                </div>
              </div>



            </div>

            {/* Active Controlled Copies Matrix */}
            {selectedDoc && (
              <div className="mt-4 pt-4 border-t border-[#E2E8F0] space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Layers size={16} className="text-[#0D99FF]" />
                    <h4 className="font-bold text-xs uppercase tracking-wider text-[#1E293B]">
                      สำเนาควบคุมปัจจุบันที่ใช้งานอยู่ในสายงาน (Current Active Copies in Circulation)
                    </h4>
                  </div>
                  <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                    พบ {activeCopiesInCirculation.length} สำเนา
                  </span>
                </div>

                {/* ISO 9001 Recall Warning Banner */}
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2.5 text-xs text-amber-900">
                  <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
                  <div className="leading-relaxed">
                    <span className="font-bold">ข้อกำหนด ISO 9001 (Control of Documented Information): </span>
                    <span>เมื่อคำร้องนี้ได้รับการอนุมัติ สำเนาทั้งหมดในรายการนี้จะถูกเรียกคืนกลับสู่ฝ่าย DC</span>
                  </div>
                </div>

                {/* Table */}
                {activeCopiesInCirculation.length > 0 ? (
                  <div className="overflow-x-auto border border-[#E2E8F0] rounded-xl shadow-xs">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-[#F8FAFC] text-[#475569] font-bold border-b border-[#E2E8F0] uppercase tracking-wider">
                        <tr>
                          <th className="py-2.5 px-3">หมายเลขสำเนา (Copy No.)</th>
                          <th className="py-2.5 px-3">แผนกผู้ถือครอง (Department)</th>
                          <th className="py-2.5 px-3">จุดใช้งานจริง (Location)</th>
                          <th className="py-2.5 px-3 text-center">REV ปัจจุบัน</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#F1F5F9] bg-white">
                        {activeCopiesInCirculation.map((c, idx) => {
                          const docRev = getDocCurrentRevision(selectedDoc);
                          return (
                            <tr key={c.id || idx} className="hover:bg-slate-50/80 transition-colors">
                              <td className="py-2.5 px-3 font-mono font-bold text-[#0D99FF]">
                                Copy {c.normalizedCopyNo || c.copy_no || c.copyNo || c.ccNumber || String(idx + 1).padStart(2, '0')}
                              </td>
                              <td className="py-2.5 px-3 font-semibold text-[#1E293B]">
                                <span className="inline-flex items-center gap-1">
                                  <Building size={12} className="text-slate-400" />
                                  {c.holder_dept || c.department || c.dept || '-'}
                                </span>
                              </td>
                              <td className="py-2.5 px-3 text-[#334155]">
                                {c.location || c.locationName || c.station_name || c.holder_name || `${c.holder_dept || c.department || 'PD'} Station`}
                              </td>
                              <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-600">
                                Rev.{c.normalizedRev || docRev}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-center text-xs text-slate-500">
                    ไม่พบสำเนาควบคุมที่ใช้งานอยู่ในสายงานสำหรับเอกสารนี้ (ไม่มีภาระงานเรียกคืนเล่มจริง)
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Section 3: รายละเอียดการขอแก้ไขและเอกสารแนบ (50/50 Symmetrical Equal-Height Grid) */}
          <div className="p-5 space-y-4 bg-white">
            <div className="flex items-center justify-between pb-1">
              <h3 className="font-bold text-sm text-[#1E293B] uppercase tracking-wider flex items-center gap-2">
                <FileText className="text-[#0D99FF]" size={16} />
                <span className="font-bold text-sm text-[#1E293B]">ส่วนที่ 3: รายละเอียดการขอแก้ไขเอกสารและเอกสารแนบ</span>
              </h3>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
              
              {/* ================= ฝั่งซ้าย (50%): เหตุผล & สรุปการเปลี่ยนแปลง ================= */}
              <div className="flex flex-col justify-between space-y-4 h-full">
                
                {/* 1. เหตุผลการขอแก้ไข */}
                <div>
                  <label className="block text-sm font-semibold text-[#334155] mb-1.5">
                    เหตุผลในการร้องขอ <span className="text-[#EF4444]">*</span>
                  </label>
                  <textarea
                    rows={3}
                    required
                    value={formData.changeReason || formData.reason || ''}
                    onChange={(e) => setFormData(prev => ({
                      ...prev,
                      changeReason: e.target.value,
                      reason: e.target.value,
                      requestReason: e.target.value
                    }))}
                    placeholder="ระบุวัตถุประสงค์และเหตุผลในการขอดำเนินการ..."
                    className={`w-full px-3.5 py-2.5 text-sm bg-white border border-[#CBD5E1] rounded-lg text-[#1E293B] placeholder:text-[#94A3B8] focus:outline-none focus:border-[#0D99FF] focus:ring-2 focus:ring-[#0D99FF]/15 transition-all leading-relaxed resize-none ${errors.changeReason ? 'border-rose-400 bg-rose-50/50' : ''}`}
                  />
                  {errors.changeReason && <p className="text-rose-500 text-xs mt-1">{errors.changeReason}</p>}
                </div>

                {/* 2. สรุปรายละเอียดการเปลี่ยนแปลง */}
                <div className="flex-1 flex flex-col">
                  <label className="block text-sm font-semibold text-[#334155] mb-1.5">
                    สรุปรายละเอียดการเปลี่ยนแปลง (Change Summary) <span className="text-[#EF4444]">*</span>
                  </label>
                  <textarea
                    rows={5}
                    value={formData.changeSummary}
                    onChange={(e) => setFormData(prev => ({ ...prev, changeSummary: e.target.value }))}
                    className={`w-full flex-1 min-h-[100px] lg:min-h-[125px] p-3.5 text-sm bg-white border border-[#CBD5E1] rounded-xl text-[#1E293B] placeholder:text-[#94A3B8] focus:outline-none focus:border-[#0D99FF] focus:ring-2 focus:ring-[#0D99FF]/15 transition-all leading-relaxed resize-none ${errors.changeSummary ? 'border-rose-400 bg-rose-50/50' : ''}`}
                    placeholder="ระบุข้อความ หัวข้อ หรือขั้นตอนที่ทำการแก้ไข..."
                  />
                  {errors.changeSummary && <p className="text-rose-500 text-xs mt-1">{errors.changeSummary}</p>}
                </div>

              </div>

              {/* ================= ฝั่งขวา (50%): Standards, Upload & Ack Protocol ================= */}
              <div className="flex flex-col justify-between space-y-4 bg-[#F8FAFC] border border-[#E2E8F0] p-4.5 rounded-xl h-full">
                
                {/* 1. ระบบมาตรฐานที่เกี่ยวข้อง */}
                <div>
                  <RelatedStandardsSelector
                    value={{
                      relatedStandards: formData.relatedStandards,
                      otherStandardDetail: formData.otherStandardDetail
                    }}
                    onChange={(newVals) => setFormData(prev => ({ ...prev, ...newVals }))}
                    error={errors.otherStandardDetail}
                  />
                </div>

                {/* 2. อัปโหลดไฟล์เอกสารฉบับแก้ไข (Compact Dropzone) */}
                <div>
                  <label className="block text-sm font-semibold text-[#334155] mb-1.5">
                    อัปโหลดไฟล์เอกสารฉบับแก้ไข (PDF เท่านั้น) <span className="text-[#EF4444]">*</span>
                  </label>
                  <div 
                    onClick={() => {
                      const fileInput = document.getElementById('dar-revision-pdf-input');
                      if (fileInput) fileInput.click();
                    }}
                    className="h-20 border-2 border-dashed border-[#CBD5E1] hover:border-[#0D99FF] rounded-xl p-3 flex items-center justify-center gap-3 bg-white hover:bg-[#F0F7FF]/40 transition-all cursor-pointer group"
                  >
                    <div className="p-2 bg-[#F1F5F9] group-hover:bg-[#E5F4FF] rounded-lg text-[#0D99FF] transition-colors shrink-0">
                      <UploadCloud size={20} />
                    </div>
                    <div className="text-left min-w-0 flex-1">
                      <p className="text-xs font-semibold text-[#1E293B] truncate">
                        {(selectedFile || formData.file) ? (selectedFile || formData.file).name : 'คลิกเพื่อเลือกไฟล์ หรือลากไฟล์มาวาง'}
                      </p>
                      <p className="text-[10px] text-[#94A3B8]">รองรับไฟล์ PDF สูงสุด 25 MB</p>
                    </div>
                    <input 
                      id="dar-revision-pdf-input"
                      type="file" 
                      accept="application/pdf"
                      onChange={handleFileChange}
                      className="sr-only"
                    />
                  </div>
                  {errors.file && <p className="text-rose-500 text-xs mt-1.5">{errors.file}</p>}
                </div>

                {/* 3. การรับทราบเอกสาร */}
                <div className="pt-2 border-t border-[#E2E8F0] space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-semibold text-[#334155]">
                      การรับทราบเอกสาร <span className="text-[#EF4444]">*</span>
                    </label>
                    {selectedDoc && selectedDoc.title && selectedDoc.title.startsWith('FM') ? (
                      <div className="flex items-center gap-1.5 text-indigo-900 bg-[#E5F4FF]/70 px-2.5 py-1 rounded-md text-xs font-medium border border-indigo-100">
                        <ShieldAlert className="w-3.5 h-3.5 shrink-0 text-[#0D99FF]" />
                        <span>แบบฟอร์ม (FM): ไม่ต้องรับทราบ</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-4 text-xs sm:text-sm">
                        <label className="flex items-center gap-2 cursor-pointer font-medium text-[#475569]">
                          <input 
                            type="radio" 
                            name="ack"
                            value="NOT_REQUIRED"
                            checked={formData.ackRequirement === 'NOT_REQUIRED'}
                            onChange={(e) => setFormData(prev => ({...prev, ackRequirement: e.target.value, ackUserId: ''}))}
                            className="w-4 h-4 text-[#0D99FF] focus:ring-[#0D99FF]"
                          />
                          <span>ไม่ต้องรับทราบ</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer font-medium text-[#475569]">
                          <input 
                            type="radio" 
                            name="ack"
                            value="REQUIRED"
                            checked={formData.ackRequirement === 'REQUIRED'}
                            onChange={(e) => setFormData(prev => ({...prev, ackRequirement: e.target.value}))}
                            className="w-4 h-4 text-[#0D99FF] focus:ring-[#0D99FF]"
                          />
                          <span>ต้องรับทราบ</span>
                        </label>
                      </div>
                    )}
                  </div>

                  {formData.ackRequirement === 'REQUIRED' && !(selectedDoc && selectedDoc.title && selectedDoc.title.startsWith('FM')) && (
                    <div className={`p-3 rounded-lg border ${errors.ackUserId ? 'border-rose-300 bg-rose-50' : 'border-indigo-100 bg-white'}`}>
                      <p className="text-xs font-semibold text-[#334155] mb-1.5">เลือกผู้ที่ต้องรับทราบเอกสารนี้ (1 คน)</p>
                      <UserSelector 
                        value={formData.ackUserId} 
                        onChange={(id) => setFormData(prev => ({...prev, ackUserId: id}))} 
                        error={errors.ackUserId} 
                        users={(masterUsers || []).filter(u => u && u.id !== currentUser?.id && !u.isDcc && u.role !== 'DCC_ADMIN')} 
                      />
                      {errors.ackUserId && <p className="text-rose-500 text-xs mt-1">{errors.ackUserId}</p>}
                    </div>
                  )}
                </div>

              </div>

            </div>
          </div>

        </div>

        {/* Document Access Scope & Confidentiality with Reactive Distribution Pruning */}
        <DocumentAccessControlSelector
          value={formData.access_control}
          onChange={handleAccessControlChange}
          ownerDept={selectedDoc?.department || currentUser?.department || 'PD'}
          masterDepartments={useStore.getState().masterDepartments || useStore.getState().departments || []}
          masterUsers={masterUsers || []}
          workflowParticipants={workflowParticipants || []}
        />

        {/* Section: การแจกจ่ายเอกสาร หรือ แจ้งเตือน Clean Form Notice Pill */}
        {isFormDocument ? (
          <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-emerald-50/80 border border-emerald-200/70 text-emerald-900 text-xs font-medium shadow-2xs">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>แบบฟอร์มเปล่า (FM) จะพร้อมให้ดาวน์โหลดตามสิทธิ์การเข้าถึงทันทีเมื่ออนุมัติเสร็จสมบูรณ์ (Bypass การออกเล่มสำเนาควบคุม)</span>
          </div>
        ) : (
          <DistributionSetup 
            ownerDept={selectedDoc?.department || currentUser?.department || 'PD'}
            distributions={formData.distributions || []}
            oldDistributions={selectedDoc?.distributions || []}
            onChange={(distributions) => setFormData(prev => ({ ...prev, distributions }))}
            documentType={selectedDoc?.title ? selectedDoc.title.split('-')[0] : 'WI'}
            accessControl={formData.access_control}
            accessScope={formData.access_control?.scope}
            targetDepartments={formData.access_control?.authorized_depts || formData.access_control?.targetDepartments || []}
          />
        )}

        {/* ========================================================================= */}
        {/* WIDGET: CIRCULATION & LIFECYCLE IMPACT SUMMARY (BENTO COMPARATIVE CARD)  */}
        {/* ISO 9001: 7.5 Control of Documented Information Compliance Evidence       */}
        {/* ========================================================================= */}
        {selectedDoc && !isFormDocument && (
          <div className="bg-slate-50/80 border border-slate-200/80 rounded-2xl sm:rounded-3xl p-4 sm:p-5.5 space-y-4 shadow-xs">
            {/* Header Title */}
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-200/70">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shadow-2xs">
                  <Layers size={16} strokeWidth={2.2} />
                </div>
                <div>
                  <h3 className="text-xs sm:text-sm font-bold text-slate-900 uppercase tracking-wider">
                    สรุปผลกระทบการหมุนเวียนสำเนา (Circulation & Lifecycle Impact Summary)
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    เปรียบเทียบภาระงานเรียกคืนเล่มเดิม vs. การจัดพิมพ์ส่งมอบเล่มใหม่เมื่อคำร้องได้รับการอนุมัติ (ISO 9001: 7.5)
                  </p>
                </div>
              </div>
              <span className="text-[11px] font-mono font-semibold px-2.5 py-1 rounded-full bg-white text-slate-600 border border-slate-200 shadow-2xs">
                {selectedDoc.title} Rev.{getDocCurrentRevision(selectedDoc)} ➔ Rev.{calculateNextRev(getDocCurrentRevision(selectedDoc))}
              </span>
            </div>

            {/* Split Comparative Columns (Bento Grid) */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch">
              
              {/* 1. ฝั่งซ้าย: สำเนาเดิมที่จะถูกเรียกคืน (Copies to Recall) */}
              <div className="border border-amber-200/90 bg-amber-50/40 rounded-2xl p-4 flex flex-col justify-between space-y-3.5 shadow-2xs">
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-amber-100/80 text-amber-700 flex items-center justify-center">
                        <RotateCcw size={14} strokeWidth={2.2} />
                      </div>
                      <span className="text-xs font-bold text-amber-950">
                        เรียกคืนสำเนาฉบับเดิม (Rev.{getDocCurrentRevision(selectedDoc)})
                      </span>
                    </div>
                    <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-lg bg-amber-100/90 text-amber-800 border border-amber-200">
                      ทั้งหมด {activeCopiesInCirculation.length} เล่ม
                    </span>
                  </div>

                  <p className="text-[11px] text-amber-800/85 leading-relaxed">
                    สำเนาควบคุมปัจจุบันที่ใช้งานอยู่ในสายงาน จะถูกเรียกคืนกลับสู่ฝ่าย DC เพื่อดำเนินการทำลายหรือประทับตราตกรุ่น
                  </p>

                  {/* List of Copies to Recall */}
                  <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                    {activeCopiesInCirculation.length > 0 ? (
                      activeCopiesInCirculation.map((c, idx) => {
                        const copyNum = c.normalizedCopyNo || c.copy_no || c.copyNo || c.ccNumber || String(idx + 1).padStart(2, '0');
                        const dept = c.holder_dept || c.department || c.dept || '-';
                        const loc = c.location || c.locationName || c.station_name || `${dept} Station`;
                        return (
                          <div 
                            key={c.id || idx}
                            className="flex items-center justify-between px-3 py-2 bg-white/90 border border-amber-200/70 rounded-xl text-xs shadow-2xs"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="font-mono font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded text-[11px] shrink-0">
                                Copy {copyNum}
                              </span>
                              <span className="font-semibold text-slate-800 shrink-0">({dept})</span>
                              <span className="text-slate-600 truncate text-[11px]" title={loc}>
                                {loc}
                              </span>
                            </div>
                            <span className="text-[10px] font-mono text-amber-700 font-semibold shrink-0">
                              Rev.{c.normalizedRev || getDocCurrentRevision(selectedDoc)}
                            </span>
                          </div>
                        );
                      })
                    ) : (
                      <div className="p-3 bg-white/80 border border-amber-200/60 rounded-xl text-center text-xs text-amber-800/70">
                        ไม่พบสำเนาควบคุมเดิมในระบบ (ไม่มีภาระการเรียกคืนเล่มจริง)
                      </div>
                    )}
                  </div>
                </div>

                {/* Compliance Tag Footer */}
                <div className="pt-2.5 border-t border-amber-200/70 flex items-center gap-2 text-[11px] font-semibold text-amber-900">
                  <ShieldCheck size={14} className="text-amber-600 shrink-0" />
                  <span>ระบบจะสร้าง Task เรียกคืนส่งให้ฝ่าย DC ดำเนินการโดยอัตโนมัติ</span>
                </div>
              </div>

              {/* 2. ฝั่งขวา: สำเนาใหม่ที่จะจัดพิมพ์และแจกจ่าย (New Copies to Issue) */}
              <div className="border border-emerald-200/90 bg-emerald-50/40 rounded-2xl p-4 flex flex-col justify-between space-y-3.5 shadow-2xs">
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-emerald-100/80 text-emerald-700 flex items-center justify-center">
                        <Printer size={14} strokeWidth={2.2} />
                      </div>
                      <span className="text-xs font-bold text-emerald-950">
                        จัดพิมพ์และแจกจ่ายฉบับใหม่ (Rev.{calculateNextRev(getDocCurrentRevision(selectedDoc))})
                      </span>
                    </div>
                    <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-lg bg-emerald-100/90 text-emerald-800 border border-emerald-200">
                      รวม {activeRevisionCopies.length} เล่ม
                    </span>
                  </div>

                  <p className="text-[11px] text-emerald-800/85 leading-relaxed">
                    สำเนาควบคุมฉบับปรับปรุงใหม่ที่จะส่งมอบให้ผู้ถือครองประจำจุดใช้งานที่กำหนด
                  </p>

                  {/* List of New Copies to Distribute with Interactive Tag Removal */}
                  <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                    {activeRevisionCopies.length > 0 ? (
                      activeRevisionCopies.map((dist, idx) => {
                        const copyNum = dist.copyNo || dist.copy_no || String(idx + 1).padStart(2, '0');
                        const isOrigin = dist.isOriginator || dist.isOwner || dist.is_owner || copyNum === '01' || dist.isLocked || idx === 0;
                        const dept = dist.departmentId || dist.dept || dist.dept_code || dist.department || selectedDoc.department || 'PD';
                        const loc = cleanLocationName(dist.locationName || dist.station_name || dist.location || dist.name || `${dept} Station`);
                        return (
                          <div 
                            key={dist.id || `${dept}-${copyNum}-${idx}`}
                            className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs border shadow-2xs transition-all ${
                              isOrigin 
                                ? 'bg-sky-50/70 border-sky-200/80 text-slate-800' 
                                : 'bg-white/90 border-emerald-200/70 text-slate-800'
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span className={`font-mono font-bold px-1.5 py-0.5 rounded text-[11px] shrink-0 ${
                                isOrigin 
                                  ? 'bg-sky-100 text-sky-800 border border-sky-200' 
                                  : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              }`}>
                                Copy {copyNum}
                              </span>
                              <span className="font-semibold shrink-0 text-slate-800">
                                ({dept})
                              </span>
                              <span className="truncate text-[11px] text-slate-600" title={loc}>
                                {loc}
                              </span>
                              {isOrigin && (
                                <span className="px-1.5 py-0.2 rounded text-[10px] bg-sky-100 text-sky-800 border border-sky-200 font-semibold shrink-0">
                                  ต้นทาง
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              <span className="text-[10px] font-mono font-semibold text-emerald-700">
                                Rev.{calculateNextRev(getDocCurrentRevision(selectedDoc))}
                              </span>
                              {!isOrigin && !dist.isLocked && (
                                <button
                                  type="button"
                                  onClick={() => handleRemoveDistributionChip(dist)}
                                  className="text-slate-400 hover:text-rose-600 p-0.5 transition-colors cursor-pointer"
                                  title="ปลดจุดนี้ออกจากรายการสำเนาใหม่"
                                >
                                  <X size={13} strokeWidth={2.5} />
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="p-3 bg-white/80 border border-emerald-200/60 rounded-xl text-center text-xs text-emerald-800/70">
                        ยังไม่ได้เลือกสำเนาควบคุมสำหรับฉบับใหม่
                      </div>
                    )}
                  </div>
                </div>

                {/* Action Tag Footer */}
                <div className="pt-2.5 border-t border-emerald-200/70 flex items-center gap-2 text-[11px] font-semibold text-emerald-900">
                  <Printer size={14} className="text-emerald-600 shrink-0" />
                  <span>ระบบจะสร้าง Task พิมพ์ส่งมอบให้ฝ่าย DC ดำเนินการตามรายการนี้</span>
                </div>
              </div>

            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="card-surface p-4 mt-6 flex items-center justify-end gap-3 shadow-2xs">
          <Button 
            variant="ghost"
            type="button" 
            onClick={() => navigate('/dashboard')}
          >
            <X size={15} className="mr-1"/> ยกเลิก (Cancel)
          </Button>
          <Button 
            variant="secondary"
            type="button" 
            onClick={handleDraft}
          >
            บันทึกแบบร่าง (Draft)
          </Button>
          <Button 
            variant="primary"
            type="submit" 
            onClick={handleFormSubmit}
          >
            ส่งคำขอ Revision (Submit DAR)
          </Button>
        </div>
      </form>

      {(() => {
        const docTypeCode = selectedDoc?.docType || selectedDoc?.type || (selectedDoc?.title ? selectedDoc.title.split('-')[0] : (formData.docType || 'WI'));
        const resolvedRevId = resolveReviewer(
          currentUser?.id, 
          currentUser?.department || 'PD', 
          masterUsers || [], 
          reviewUsers || masterUsers || [], 
          docTypeCode
        )?.id;
        const resolvedReviewerObj = (masterUsers || []).find(u => u && u.id === resolvedRevId);

        return (
          <ActionConfirmModal
            isOpen={showConfirm}
            onClose={() => setShowConfirm(false)}
            onConfirm={executeSubmit}
            isLoading={isSubmitting}
            title="ยืนยันการส่งคำร้องขอแก้ไขเอกสาร (Revision DAR)"
            actionType="submit"
            confirmText="ยืนยันการส่งคำร้องขอแก้ไข"
            cancelText="ยกเลิก / กลับไปแก้ไข"
            summaryData={[
              {
                label: 'ผู้ร้องขอ / แผนก',
                value: (
                  <span className="font-medium text-slate-800">
                    {currentUser?.name || 'ผู้ร้องขอ'} ({currentUser?.department || 'PD'})
                  </span>
                )
              },
              {
                label: 'รหัสเอกสาร',
                value: (
                  <span className="font-mono font-bold text-[#0D99FF] bg-[#E5F4FF] px-2.5 py-0.5 rounded-md border border-indigo-100">
                    {selectedDoc?.title || formData.docId}
                  </span>
                )
              },
              {
                label: 'การเปลี่ยนแปลงฉบับ',
                value: (
                  <div className="flex items-center gap-2 font-mono text-sm font-bold">
                    <span className="bg-[#F5F5F5] text-slate-600 px-2 py-0.5 rounded border border-[#E5E5E5]">
                      Rev. {selectedDoc?.rev || '00'}
                    </span>
                    <span className="text-slate-400">➔</span>
                    <span className="bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded border border-emerald-200 font-bold">
                      Rev. {calculateNextRev(selectedDoc?.rev)}
                    </span>
                  </div>
                )
              },
              {
                label: 'ชื่อเอกสารฉบับใหม่',
                value: (
                  <span className="text-sm sm:text-[15px] font-bold text-[#1E1E1E] leading-relaxed">
                    {formData.title || selectedDoc?.name}
                  </span>
                )
              },
              {
                label: 'รายละเอียดและสรุปการแก้ไข',
                value: (
                  <div className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed bg-[#F5F5F5] p-3 rounded-xl border border-[#E5E5E5]/70">
                    {formData.changeSummary}
                  </div>
                )
              },
              {
                label: 'เหตุผลการร้องขอแก้ไข',
                value: (
                  <div className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed bg-[#F5F5F5] p-3 rounded-xl border border-[#E5E5E5]/70">
                    {formData.reason || formData.changeReason || '-'}
                  </div>
                )
              },
              {
                label: 'มาตรฐานที่เกี่ยวข้อง',
                value: (
                  <div className="flex flex-wrap gap-1.5 pt-0.5">
                    {(formData.relatedStandards || []).length > 0 ? (
                      formData.relatedStandards.map((std, idx) => (
                        <span key={idx} className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#F5F5F5] text-slate-700 border border-[#E5E5E5]">
                          {std === 'อื่น ๆ (Others)' ? `อื่นๆ: ${formData.otherStandardDetail || '-'}` : std}
                        </span>
                      ))
                    ) : (
                      <span className="text-xs text-slate-400">ไม่ได้ระบุ</span>
                    )}
                  </div>
                )
              },
              {
                label: 'วันที่มีผลบังคับใช้ฉบับใหม่',
                value: (
                  <span className="font-mono font-bold text-slate-800 bg-[#F5F5F5] px-2.5 py-0.5 rounded-md">
                    {formData.effectiveDate || '-'}
                  </span>
                )
              },
              {
                label: 'ขั้นตอนถัดไป / ผู้มีอำนาจทบทวน',
                value: `ส่งต่อให้: ${resolvedReviewerObj ? `${resolvedReviewerObj.name} (${resolvedReviewerObj.position || resolvedReviewerObj.department || 'Reviewer'})` : 'ผู้ทบทวนตามสายงาน (Reviewer Level 2)'}`
              }
            ]}
          />
        );
      })()}
    </div>
  );
};

export default DarRevisionForm;
