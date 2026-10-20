import React, { useState, useEffect, useMemo, useRef } from 'react';
import useStore, { generateNextEdrNumber } from '../../../../store/useStore';
import { X, Upload, Save, AlertCircle, FileText, CheckCircle2, Shield, Building2, Tag, Layers, Printer } from 'lucide-react';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import UserSelector from '../../components/UserSelector';
import RelatedStandardsSelector from '../../components/workflow/RelatedStandardsSelector';
import DistributionSetup from '../../components/workflow/DistributionSetup';
import ExternalDocConfirmModal from './ExternalDocConfirmModal';
import { 
  formatDocumentRunningNumber, 
  calculateNextExternalDocSequence,
  checkDocumentCodeCollision 
} from '../../services/MasterDataService';
import { isLevel6Plus } from '../../utils/taskFilter';
import { saveFile } from '../../utils/fileStorage';

const ExternalDocFormModal = ({ isOpen, onClose, documentToEdit = null, resubmitTaskId = null }) => {
  const fileInputRef = useRef(null);
  const { 
    currentUser, 
    registerExternalDoc, 
    updateExternalDoc, 
    resubmitExternalDoc, 
    masterDepartments, 
    departments: storeDepts,
    documentTypes,
    externalDocuments,
    externalRequests,
    tasks
  } = useStore();

  const isResubmit = Boolean(resubmitTaskId || documentToEdit?.status === 'REVISE_REQUESTED');

  // Safe Master Users Retrieval from useStore
  const masterUsers = useStore((state) => state.masterUsers || state.users || []);

  const userDept = currentUser?.department || currentUser?.dept_code || currentUser?.dept || 'QA';
  const availableDepts = useMemo(() => {
    return (masterDepartments || storeDepts || []).filter(d => typeof d === 'string' || d.status !== 'INACTIVE');
  }, [masterDepartments, storeDepts]);

  // Safe Revision Extraction Function (Regex based, strictly avoiding NaN)
  const extractRevNumber = (revStr) => {
    if (!revStr) return 0;
    const match = String(revStr).match(/\d+/);
    return match ? parseInt(match[0], 10) : 0;
  };

  const isReviseMode = Boolean(documentToEdit && !isResubmit);

  // Helper for Safe Initial Form State (Defensive Render & Fallbacks)
  const getInitialFormData = (doc, user, isResubmitMode = false) => {
    const activeDept = user?.department || user?.dept_code || user?.dept || 'QA';
    const num = extractRevNumber(doc?.revision || doc?.rev);
    const originalRevStr = `Rev.${String(num).padStart(2, '0')}`;
    const targetRevStr = `Rev.${String(num + (isResubmitMode ? 0 : 1)).padStart(2, '0')}`;

    if (!doc) {
      return {
        department: activeDept,
        title: '',
        sourceVersion: '',
        source: '',
        issuer: '',
        officialIssuer: '',
        effectiveDate: new Date().toISOString().split('T')[0],
        reviewCycleMonths: 12,
        reviewerId: '',
        approverId: '',
        acknowledgees: [],
        accessScope: 'General',
        accessDepartments: [activeDept],
        accessUsers: [],
        allowedDepartments: [activeDept],
        allowedUsers: [],
        controlledCopies: [],
        relatedStandards: [],
        otherStandardDetail: '',
        isPhysicalCopy: false,
        distributions: [],
        reason: '',
        originalRevision: 'Rev.00',
        targetRevision: 'Rev.00'
      };
    }

    const editIssuer = doc?.issuer || doc?.officialIssuer || doc?.source || '';
    const isPhysical = Boolean(doc?.is_physical_copy || (Array.isArray(doc?.distributions) && doc.distributions.length > 0));
    const editDept = doc?.department || doc?.dept || activeDept;

    let editAccessDepts = Array.isArray(doc?.accessDepartments)
      ? [...doc.accessDepartments]
      : (Array.isArray(doc?.allowedDepartments) ? [...doc.allowedDepartments] : []);
    if (editDept && !editAccessDepts.includes(editDept)) {
      editAccessDepts = [...editAccessDepts, editDept];
    }

    return {
      department: editDept,
      title: doc?.title || '',
      sourceVersion: doc?.sourceVersion || doc?.edition || '',
      source: editIssuer,
      issuer: editIssuer,
      officialIssuer: editIssuer,
      effectiveDate: doc?.effectiveDate || new Date().toISOString().split('T')[0],
      reviewCycleMonths: doc?.reviewCycleMonths || 12,
      reviewerId: doc?.reviewerId || '',
      approverId: doc?.approverId || '',
      acknowledgees: Array.isArray(doc?.acknowledgees) ? doc.acknowledgees : [],
      accessScope: doc?.accessScope || 'General',
      accessDepartments: editAccessDepts,
      accessUsers: Array.isArray(doc?.accessUsers) 
        ? doc.accessUsers 
        : (Array.isArray(doc?.allowedUsers) ? doc.allowedUsers : []),
      allowedDepartments: Array.isArray(doc?.allowedDepartments) 
        ? doc.allowedDepartments 
        : editAccessDepts,
      allowedUsers: Array.isArray(doc?.allowedUsers) 
        ? doc.allowedUsers 
        : (Array.isArray(doc?.accessUsers) ? doc.accessUsers : []),
      controlledCopies: Array.isArray(doc?.controlledCopies) ? doc.controlledCopies : [],
      relatedStandards: Array.isArray(doc?.relatedStandards) ? doc.relatedStandards : [],
      otherStandardDetail: doc?.otherStandardDetail || '',
      isPhysicalCopy: isPhysical,
      distributions: Array.isArray(doc?.distributions) ? doc.distributions : [],
      reason: '',
      originalRevision: originalRevStr,
      targetRevision: targetRevStr
    };
  };

  const [formData, setFormData] = useState(() => getInitialFormData(documentToEdit, currentUser, isResubmit));

  const [fileName, setFileName] = useState(() => (isResubmit ? (documentToEdit?.attachedFile?.name || documentToEdit?.fileName || '') : ''));
  const [fileBlob, setFileBlob] = useState(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [payloadToSubmit, setPayloadToSubmit] = useState(null);

  // Auto-Increment & Normalization logic for Revisions
  const revisionInfo = useMemo(() => {
    if (!documentToEdit) {
      return {
        originalRev: '00',
        targetRev: '00',
        prevRev: 'Rev.00',
        nextRev: 'Rev.00',
        isRevision: false
      };
    }
    const num = extractRevNumber(documentToEdit?.revision || documentToEdit?.rev);
    const originalRev = String(num).padStart(2, '0');
    const targetRev = isResubmit ? originalRev : String(num + 1).padStart(2, '0');
    return {
      originalRev,
      targetRev,
      prevRev: `Rev.${originalRev}`,
      nextRev: `Rev.${targetRev}`,
      isRevision: !isResubmit
    };
  }, [documentToEdit, isResubmit]);

  // Compute Auto-Generated ED Code Preview from Master Data Pattern (01-99 ➔ 100+)
  const previewEdCode = useMemo(() => {
    if (documentToEdit) {
      return documentToEdit.edCode || documentToEdit.doc_code || documentToEdit.docNo || documentToEdit.id;
    }
    const dept = formData.department || userDept;
    const edType = (documentTypes || []).find(t => t.code === 'ED' || t.id === 'ED');
    const pattern = edType?.namingPattern || 'ED-{Dept}-{##}';

    const nextSeq = calculateNextExternalDocSequence(dept, externalDocuments, externalRequests, tasks);
    const seqNum = formatDocumentRunningNumber(nextSeq);
    return pattern
      .replace('{Type}', 'ED')
      .replace('{Dept}', dept)
      .replace('{###}', seqNum)
      .replace('{##}', seqNum);
  }, [documentToEdit, formData.department, userDept, externalDocuments, externalRequests, tasks, documentTypes]);

  // Auto-Running EDR Number Preview (ISO 9001 Year Sequence Compliance)
  const previewEdrNumber = useMemo(() => {
    if (isResubmit && (documentToEdit?.requestNo || documentToEdit?.edrNumber || documentToEdit?.requestId)) {
      return documentToEdit.requestNo || documentToEdit.edrNumber || documentToEdit.requestId;
    }
    return generateNextEdrNumber(externalRequests || []);
  }, [externalRequests, isResubmit, documentToEdit]);

  useEffect(() => {
    if (isOpen) {
      setFormData(getInitialFormData(documentToEdit, currentUser, isResubmit));
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      // Pristine / Empty State Invariant:
      // In Revision / Update Edition mode, NEVER pre-populate the previous edition's file!
      // Only pre-populate the file if editing a returned draft (Resubmit mode)
      if (isResubmit) {
        setFileName(documentToEdit?.attachedFile?.name || documentToEdit?.fileName || '');
        setFileBlob(null);
      } else {
        setFileName('');
        setFileBlob(null);
      }
    }
  }, [documentToEdit, isOpen, currentUser, isResubmit]);

  // Phase 1: ISO 9001 Segregation of Duties (SoD) Filters for Signatories
  // Rule 1: External Reviewer Dropdown
  // - Exclude DCC Admin (DCC cannot review external documents)
  // - Exclude Current User / Requester (u.id !== currentUser.id)
  // - Exclude selected Approver (u.id !== formData.approverId)
  const eligibleReviewers = useMemo(() => {
    const currentId = currentUser?.id;
    const currentEmpId = currentUser?.empId;
    return (masterUsers || []).filter(u => {
      if (!u || !u.id) return false;
      if (u.isDcc || u.role === 'DCC_ADMIN' || u.isDccAdmin) return false;
      if (currentId && (u?.id === currentId || u?.empId === currentId)) return false;
      if (currentEmpId && (u?.id === currentEmpId || u?.empId === currentEmpId)) return false;
      if (formData?.approverId && (u?.id === formData.approverId || u?.empId === formData.approverId)) return false;
      return true;
    });
  }, [masterUsers, currentUser, formData?.approverId]);

  // Rule 2: External Approver Dropdown
  // - Exclude DCC Admin (cannot approve documents)
  // - Exclude Current User / Requester (u.id !== currentUser.id)
  // - Exclude selected Reviewer (u.id !== formData.reviewerId)
  // - Filter only users with organizational approval authority (Department Manager, QMR, or authorized positions/levels)
  const eligibleApprovers = useMemo(() => {
    const currentId = currentUser?.id;
    const currentEmpId = currentUser?.empId;
    return (masterUsers || []).filter(u => {
      if (!u || !u.id) return false;
      if (u.isDcc || u.role === 'DCC_ADMIN' || u.isDccAdmin) return false;
      if (currentId && (u?.id === currentId || u?.empId === currentId)) return false;
      if (currentEmpId && (u?.id === currentEmpId || u?.empId === currentEmpId)) return false;
      if (formData?.reviewerId && (u?.id === formData.reviewerId || u?.empId === formData.reviewerId)) return false;

      // Approval Authority check (Department Manager, QMR, Director, level >= 5, or isLevel6Plus)
      if (u?.isQmr || String(u?.role || '').toUpperCase() === 'QMR') return true;
      if (isLevel6Plus(u)) return true;
      const level = Number(u?.approval_level ?? u?.level ?? 0);
      if (level >= 5) return true;
      const pos = String(u?.position || '').toLowerCase();
      if (pos.includes('manager') || pos.includes('director') || pos.includes('qmr') || pos.includes('ผู้จัดการ') || pos.includes('ผู้อำนวยการ')) {
        return true;
      }
      const role = String(u?.role || '').toUpperCase();
      if (['EXECUTIVE', 'MANAGING_DIRECTOR', 'BOARD', 'DIRECTOR', 'MANAGER', 'DEPT_HEAD'].includes(role)) {
        return true;
      }
      return false;
    });
  }, [masterUsers, currentUser, formData?.reviewerId]);

  // Phase 1: Exclude Current User from Dropdown Search in Restricted Scope
  const candidateRestrictedUsers = useMemo(() => {
    const currentId = currentUser?.id;
    const currentEmpId = currentUser?.empId;
    return (masterUsers || []).filter(u => {
      if (!u) return false;
      if (currentId && (u?.id === currentId || u?.empId === currentId)) return false;
      if (currentEmpId && (u?.id === currentEmpId || u?.empId === currentEmpId)) return false;
      return true;
    });
  }, [masterUsers, currentUser]);

  const handleChange = (field, value) => {
    setFormData(prev => {
      let next = { ...prev, [field]: value };
      // Sync official issuer and source aliases
      if (field === 'source' || field === 'issuer' || field === 'officialIssuer') {
        next.source = value;
        next.issuer = value;
        next.officialIssuer = value;
      }
      // Phase 2: Auto Reset when conflict occurs
      if (field === 'reviewerId' && value && value === prev.approverId) {
        next.approverId = '';
      } else if (field === 'approverId' && value && value === prev.reviewerId) {
        next.reviewerId = '';
      }
      return next;
    });
  };

  const handleDepartmentChange = (newDept) => {
    setFormData(prev => {
      let nextDepts = prev.accessDepartments || [];
      if (prev.accessScope === 'Department') {
        if (newDept && !nextDepts.includes(newDept)) {
          nextDepts = [...nextDepts, newDept];
        }
      }
      return {
        ...prev,
        department: newDept,
        accessDepartments: nextDepts
      };
    });
  };

  const handleScopeChange = (newScope) => {
    setFormData(prev => {
      const ownerDept = prev.department || userDept;
      let nextDepts = prev.accessDepartments || [];
      if (newScope === 'Department') {
        // Persistent Default: Requester / owner department must always be selected
        if (ownerDept && !nextDepts.includes(ownerDept)) {
          nextDepts = [...nextDepts, ownerDept];
        }
      }
      return {
        ...prev,
        accessScope: newScope,
        accessDepartments: nextDepts
      };
    });
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setFileName(file.name);
      setFileBlob(file);
    }
  };

  const handleRemoveFile = (e) => {
    if (e) e.stopPropagation();
    setFileName('');
    setFileBlob(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDeptToggle = (deptCode) => {
    const ownerDept = formData.department || userDept;
    if (deptCode === ownerDept) {
      toast.success(`แผนก ${deptCode} เป็นแผนกต้นสังกัด/ผู้ถือครองเอกสาร จึงต้องมีสิทธิ์เข้าถึงเสมอ`, { id: 'owner-dept-locked' });
      return;
    }
    setFormData(prev => {
      const depts = prev.accessDepartments || [];
      if (depts.includes(deptCode)) return { ...prev, accessDepartments: depts.filter(d => d !== deptCode) };
      return { ...prev, accessDepartments: [...depts, deptCode] };
    });
  };

  const handleAddUser = (userId) => {
    if (!userId) return;
    setFormData(prev => {
      if ((prev.accessUsers || []).includes(userId)) return prev;
      return { ...prev, accessUsers: [...(prev.accessUsers || []), userId] };
    });
  };

  const handleRemoveUser = (userId) => {
    setFormData(prev => ({
      ...prev,
      accessUsers: (prev.accessUsers || []).filter(id => id !== userId)
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const officialIssuer = formData.issuer || formData.officialIssuer || formData.source || '';
    if (!formData.title?.trim() || !officialIssuer?.trim() || !formData.effectiveDate || !formData.reviewerId || !formData.approverId) {
      toast.error('กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน (ชื่อเอกสาร, หน่วยงานผู้ออกเอกสาร, วันที่บังคับใช้, Reviewer และ Approver)');
      return;
    }

    // Phase 2: Validation Guard on Form Submit (ISO 9001 SoD Violation Prevention)
    const currentUserId = currentUser?.id;
    const currentUserEmpId = currentUser?.empId;
    const isRequesterReviewer = (currentUserId && (formData.reviewerId === currentUserId || formData.reviewerId === currentUserEmpId)) || 
                               (currentUserEmpId && (formData.reviewerId === currentUserEmpId || formData.reviewerId === currentUserId));
    const isRequesterApprover = (currentUserId && (formData.approverId === currentUserId || formData.approverId === currentUserEmpId)) || 
                               (currentUserEmpId && (formData.approverId === currentUserEmpId || formData.approverId === currentUserId));

    if (isRequesterReviewer || isRequesterApprover) {
      toast.error('ผู้ยื่นคำร้องไม่สามารถเป็นผู้ทบทวนหรือผู้อนุมัติเอกสารได้ (ISO 9001 SoD Violation)');
      return;
    }

    if (formData.reviewerId === formData.approverId) {
      toast.error('ผู้ทบทวนและผู้อนุมัติต้องไม่เป็นบุคคลเดียวกัน');
      return;
    }
    
    if (formData.relatedStandards?.includes('อื่น ๆ (Others)') && !formData.otherStandardDetail?.trim()) {
      toast.error('กรุณาระบุรายละเอียดมาตรฐานอื่นๆ');
      return;
    }
    
    if (documentToEdit && !isResubmit) {
      if (!formData.reason?.trim()) {
        toast.error('กรุณาระบุเหตุผลในการอัปเดตเวอร์ชันเอกสาร');
        return;
      }
      if (!fileBlob) {
        toast.error('กรุณาแนบไฟล์เอกสารทางการ (PDF) ฉบับปรับปรุงใหม่');
        return;
      }
    }

    if (isResubmit && !fileBlob && !documentToEdit?.attachedFile) {
      toast.error('กรุณาแนบไฟล์เอกสารทางการ (PDF)');
      return;
    }

    const ownerDept = formData.department || userDept;
    const finalAccessDepts = formData.accessScope === 'Department'
      ? Array.from(new Set([...(formData.accessDepartments || []), ownerDept]))
      : (formData.accessDepartments || []);

    // Phase 1: Implicit Stakeholder Access
    // Current user (requester), reviewer, and approver MUST always have access in RESTRICTED scope
    const implicitStakeholders = [
      currentUser?.id,
      formData.reviewerId,
      formData.approverId
    ].filter(Boolean);

    const finalAccessUsers = formData.accessScope === 'Restricted'
      ? Array.from(new Set([...(formData.accessUsers || []), ...implicitStakeholders]))
      : (formData.accessUsers || []);

    const payload = {
      ...formData,
      requestNo: previewEdrNumber,
      edrNumber: previewEdrNumber,
      requestId: previewEdrNumber,
      issuer: officialIssuer,
      officialIssuer: officialIssuer,
      source: officialIssuer,
      accessDepartments: finalAccessDepts,
      accessUsers: finalAccessUsers,
      edCode: previewEdCode,
      doc_code: previewEdCode,
      docNo: previewEdCode,
      originalRevision: revisionInfo.originalRev,
      targetRevision: revisionInfo.targetRev,
      rev: revisionInfo.targetRev,
      revision: `Rev.${revisionInfo.targetRev}`,
      distributions: formData.isPhysicalCopy ? formData.distributions : [],
      physical_distribution: formData.isPhysicalCopy ? formData.distributions : [],
      is_physical_copy: Boolean(formData.isPhysicalCopy && (formData.distributions || []).length > 0),
      edition: formData.sourceVersion || formData.edition || '1.0',
      fileName,
      updatedAt: new Date().toISOString()
    };

    setPayloadToSubmit(payload);
    setShowConfirmModal(true);
  };

  const handleConfirmSubmit = async () => {
    if (payloadToSubmit) {
      const currentUserId = currentUser?.id;
      const currentUserEmpId = currentUser?.empId;
      const isReqRev = (currentUserId && (payloadToSubmit.reviewerId === currentUserId || payloadToSubmit.reviewerId === currentUserEmpId)) ||
                       (currentUserEmpId && (payloadToSubmit.reviewerId === currentUserEmpId || payloadToSubmit.reviewerId === currentUserId));
      const isReqApp = (currentUserId && (payloadToSubmit.approverId === currentUserId || payloadToSubmit.approverId === currentUserEmpId)) ||
                       (currentUserEmpId && (payloadToSubmit.approverId === currentUserEmpId || payloadToSubmit.approverId === currentUserId));
      if (isReqRev || isReqApp) {
        toast.error('ผู้ยื่นคำร้องไม่สามารถเป็นผู้ทบทวนหรือผู้อนุมัติเอกสารได้ (ISO 9001 SoD Violation)');
        return;
      }
      if (payloadToSubmit.reviewerId === payloadToSubmit.approverId) {
        toast.error('ผู้ทบทวนและผู้อนุมัติต้องไม่เป็นบุคคลเดียวกัน');
        return;
      }
    }

    let attachedFile = null;
    const editionKey = String(payloadToSubmit.sourceVersion || payloadToSubmit.edition || '1.0').trim();
    if (fileBlob) {
      const safeName = (fileName || 'external_document.pdf').replace(/[^a-zA-Z0-9.-]/g, '_');
      const fileId = `file_${Date.now()}_${safeName}`;
      const fileStorageKey = payloadToSubmit.edCode ? `FILE_${payloadToSubmit.edCode}_ED_${editionKey}` : fileId;
      try {
        await saveFile(fileId, fileBlob);
        attachedFile = {
          fileId: fileId,
          rawFileId: fileId,
          fileStorageKey,
          id: fileId,
          name: fileName || 'external_document.pdf',
          fileName: fileName || 'external_document.pdf',
          size: fileBlob.size,
          type: fileBlob.type || 'application/pdf',
          uploadedAt: new Date().toISOString()
        };
        // Register edition-scoped aliases so each Edition retains its own isolated PDF blob
        if (payloadToSubmit.edCode) {
          await saveFile(fileStorageKey, fileBlob).catch(() => {});
          await saveFile(`DOC_${payloadToSubmit.edCode}_ED_${editionKey}`, fileBlob).catch(() => {});
          await saveFile(`FILE_${payloadToSubmit.edCode}_${editionKey}`, fileBlob).catch(() => {});
          if (!documentToEdit) {
            await saveFile(payloadToSubmit.edCode, fileBlob).catch(() => {});
          }
        }
        if (payloadToSubmit.requestNo || payloadToSubmit.requestId) {
          await saveFile(payloadToSubmit.requestNo || payloadToSubmit.requestId, fileBlob).catch(() => {});
        }
      } catch (err) {
        console.error('Error saving file:', err);
        toast.error('ไม่สามารถบันทึกไฟล์ได้ กรุณาลองใหม่');
        return;
      }
    } else if (isResubmit && documentToEdit?.attachedFile) {
      attachedFile = documentToEdit.attachedFile;
    }

    const activeFile = attachedFile || (isResubmit && documentToEdit?.attachedFile ? documentToEdit.attachedFile : null);
    const activeFileId = activeFile?.fileId || activeFile?.id || (isResubmit ? documentToEdit?.fileId : null) || null;
    const activeRawFileId = activeFile?.rawFileId || activeFileId;
    const activeStorageKey = activeFile?.fileStorageKey || (payloadToSubmit.edCode && editionKey ? `FILE_${payloadToSubmit.edCode}_ED_${editionKey}` : activeFileId);
    const activeFileName = activeFile?.name || activeFile?.fileName || (isResubmit ? (fileName || documentToEdit?.fileName) : fileName) || '';

    const submittedPayload = {
      ...payloadToSubmit,
      ...(activeFile ? {
        attachedFile: activeFile,
        fileId: activeFileId,
        rawFileId: activeRawFileId,
        fileStorageKey: activeStorageKey,
        fileName: activeFileName,
        file: activeFile,
        attachment: activeFile
      } : {})
    };

    if (isResubmit) {
      if (resubmitExternalDoc) {
        resubmitExternalDoc(documentToEdit.id, submittedPayload, resubmitTaskId);
      } else {
        updateExternalDoc(documentToEdit.id, submittedPayload);
      }
      toast.success(`ส่งคำร้องเอกสารภายนอก ${previewEdCode} อีกครั้งเรียบร้อยแล้ว`);
    } else if (documentToEdit) {
      updateExternalDoc(documentToEdit.id, submittedPayload);
      const edLabel = submittedPayload.sourceVersion ? `(${submittedPayload.sourceVersion})` : '';
      toast.success(`ส่งคำขออัปเดตเอกสาร ${previewEdCode} ${edLabel} สำเร็จ`);
    } else {
      // Omni-Status Monotonic Sequence Collision Guard
      let finalPayload = { ...submittedPayload };
      const dept = formData.department || userDept || 'QA';
      const omniPool = [...(externalDocuments || []), ...(externalRequests || []), ...(tasks || [])];
      
      if (checkDocumentCodeCollision(finalPayload.edCode, omniPool)) {
        const nextSafeSeq = calculateNextExternalDocSequence(dept, externalDocuments, externalRequests, tasks);
        const edType = (documentTypes || []).find(t => t.code === 'ED' || t.id === 'ED');
        const pattern = edType?.namingPattern || 'ED-{Dept}-{##}';
        const seqNum = formatDocumentRunningNumber(nextSafeSeq);
        const safeEdCode = pattern
          .replace('{Type}', 'ED')
          .replace('{Dept}', dept)
          .replace('{###}', seqNum)
          .replace('{##}', seqNum);
          
        finalPayload = {
          ...finalPayload,
          edCode: safeEdCode,
          doc_code: safeEdCode,
          docNo: safeEdCode
        };
      }

      registerExternalDoc(finalPayload);
      toast.success(`ลงทะเบียนเอกสารภายนอก ${finalPayload.edCode} เรียบร้อยแล้ว`);
    }
    setShowConfirmModal(false);
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
          {/* Backdrop */}
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0"
          />
          
          <motion.div 
            initial={{ scale: 0.96, opacity: 0, y: 15 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.96, opacity: 0, y: 15 }}
            transition={{ type: "spring", stiffness: 320, damping: 30 }}
            className="relative w-full max-w-4xl max-h-[90vh] bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150 z-10 my-auto"
          >
            {/* Header */}
            <div className="bg-white px-6 py-4 border-b border-slate-200 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 border border-blue-200 flex items-center justify-center shrink-0">
                  <FileText size={20} />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <h2 className="text-slate-900 font-bold text-base sm:text-lg tracking-tight">
                      {isResubmit 
                        ? 'แก้ไขคำร้องเอกสารภายนอก (Revise External Document)'
                        : documentToEdit 
                          ? 'อัปเดตเอกสารภายนอก (Update External Document)' 
                          : 'ลงทะเบียนเอกสารภายนอก (Register External Document)'}
                    </h2>
                    <span className="font-mono text-xs sm:text-sm font-bold bg-amber-50 text-amber-900 border border-amber-200 px-2.5 py-0.5 rounded-lg flex items-center gap-1 shadow-2xs">
                      <Tag size={12} className="text-[#da7756]" />
                      {previewEdCode}
                    </span>
                    <span className="font-mono text-xs sm:text-sm font-bold bg-blue-50 text-blue-900 border border-blue-200 px-2.5 py-0.5 rounded-lg flex items-center gap-1 shadow-2xs" title="รหัสคำร้องเอกสารภายนอก (Auto-running EDR)">
                      <FileText size={12} className="text-blue-600" />
                      {previewEdrNumber}
                    </span>
                    {isReviseMode ? (
                      <div className="flex items-center gap-1.5 text-xs">
                        <span className="px-2.5 py-0.5 rounded-lg bg-slate-100 text-slate-700 border border-slate-200 font-medium">
                          ฉบับเดิม: {documentToEdit?.sourceVersion || documentToEdit?.edition || 'ฉบับแรก'}
                        </span>
                        <span className="text-slate-400">➔</span>
                        <span className="px-2.5 py-0.5 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200 font-bold">
                          ฉบับใหม่: {formData?.sourceVersion || 'ระบุฉบับใหม่'}
                        </span>
                      </div>
                    ) : (
                      <span className="text-xs font-bold bg-indigo-50 text-indigo-700 px-2.5 py-0.5 rounded-lg border border-indigo-200 uppercase tracking-wide">
                        EXTERNAL DOCUMENT
                      </span>
                    )}
                  </div>
                  <p className="text-slate-500 text-xs mt-0.5 font-medium truncate">
                    ระบบควบคุมเอกสารภายนอกและกฎหมายตามมาตรฐาน ISO 9001 / FSSC 22000
                  </p>
                </div>
              </div>
              <button 
                type="button"
                onClick={onClose}
                className="text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl p-2 transition-colors outline-none cursor-pointer"
                title="ปิดหน้าต่าง"
              >
                <X size={20} />
              </button>
            </div>

            {/* Form Body */}
            <div className="px-6 sm:px-8 py-5 overflow-y-auto flex-1 space-y-5 bg-white custom-scrollbar">
              {/* Return Reason Alert Banner if in resubmit mode */}
              {isResubmit && (documentToEdit?.returnReason || documentToEdit?.revisionComment) && (
                <div className="bg-rose-50 border border-rose-200/90 rounded-xl p-3.5 flex items-start gap-3 text-rose-900 shadow-2xs">
                  <AlertCircle className="text-rose-600 shrink-0 mt-0.5" size={18} />
                  <div className="text-xs">
                    <div className="font-bold uppercase tracking-wide text-rose-800">
                      เหตุผลและข้อเสนอแนะในการส่งกลับแก้ไข (Return for Revision):
                    </div>
                    <p className="mt-1 text-slate-800 font-medium leading-relaxed">
                      {documentToEdit.returnReason || documentToEdit.revisionComment}
                    </p>
                  </div>
                </div>
              )}

              {/* Guidance Alert Banner (Compact) */}
              <div className="bg-amber-50/70 border border-amber-200/70 px-3.5 py-2 rounded-xl flex items-center gap-2.5 text-xs text-amber-950">
                <AlertCircle className="shrink-0 text-[#da7756]" size={16} />
                <div className="flex-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-stone-700">
                  <span>• รหัสเอกสารควบคุม: <strong className="font-mono text-stone-900 bg-white px-1.5 py-0.5 rounded border border-amber-200">ED-&#123;Dept&#125;-&#123;###&#125;</strong></span>
                  <span className="hidden sm:inline text-stone-300">•</span>
                  <span>ผู้ทบทวนต้องเป็นผู้เชี่ยวชาญ/หัวหน้าแผนก (DCC Admin ไม่สามารถเป็นผู้ทบทวนเนื้อหาได้)</span>
                </div>
              </div>

              <form id="external-doc-form" onSubmit={handleSubmit} className="space-y-6">
                {/* หมวดที่ 1: ข้อมูลเอกสาร (Document Details) */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-slate-900 font-bold text-sm tracking-wide border-b border-slate-100 pb-2">
                    <Building2 className="text-[#da7756]" size={17} />
                    <span>หมวดที่ 1: ข้อมูลเอกสาร (Document Details)</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="block text-xs font-bold text-slate-700">
                        แผนกผู้รับผิดชอบ (Responsible Dept) <span className="text-rose-500">*</span>
                      </label>
                      <select 
                        value={formData.department}
                        onChange={e => handleDepartmentChange(e.target.value)}
                        disabled={!!documentToEdit}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-800 focus:bg-white focus:border-[#da7756] focus:ring-3 focus:ring-[#da7756]/15 transition-all outline-none font-medium disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
                      >
                        {availableDepts.map(deptObj => {
                          const deptCode = typeof deptObj === 'string' ? deptObj : deptObj.id;
                          const deptName = typeof deptObj === 'string' ? deptObj : (deptObj.nameTh || deptObj.name);
                          return (
                            <option key={deptCode} value={deptCode}>
                              {deptCode} - {deptName}
                            </option>
                          );
                        })}
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-xs font-bold text-slate-700">
                        เวอร์ชัน/รุ่นต้นฉบับภายนอก (Source Edition) <span className="text-rose-500">*</span>
                      </label>
                      <input 
                        type="text" 
                        value={formData.sourceVersion}
                        onChange={e => handleChange('sourceVersion', e.target.value)}
                        placeholder="เช่น Edition 5, Issue 2026, Ver 2.1"
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:bg-white focus:border-[#da7756] focus:ring-3 focus:ring-[#da7756]/15 transition-all outline-none font-medium"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-slate-700">
                      ชื่อเอกสาร / กฎหมาย / มาตรฐาน (Document Title) <span className="text-rose-500">*</span>
                    </label>
                    <input 
                      type="text" 
                      value={formData.title}
                      onChange={e => handleChange('title', e.target.value)}
                      placeholder="เช่น ISO 9001:2015 Quality Management Systems - Requirements"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:bg-white focus:border-[#da7756] focus:ring-3 focus:ring-[#da7756]/15 transition-all outline-none font-medium"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="space-y-1.5">
                      <label className="block text-xs font-bold text-slate-700">
                        หน่วยงานผู้ออกเอกสาร (Official Issuer) <span className="text-rose-500">*</span>
                      </label>
                      <input 
                        type="text" 
                        value={formData.issuer || formData.officialIssuer || formData.source || ''}
                        onChange={e => handleChange('source', e.target.value)}
                        placeholder="เช่น ISO, กระทรวงอุตสาหกรรม"
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:bg-white focus:border-[#da7756] focus:ring-3 focus:ring-[#da7756]/15 transition-all outline-none font-medium"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-xs font-bold text-slate-700">
                        วันบังคับใช้ (Effective Date) <span className="text-rose-500">*</span>
                      </label>
                      <input 
                        type="date" 
                        value={formData.effectiveDate}
                        onChange={e => handleChange('effectiveDate', e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-800 focus:bg-white focus:border-[#da7756] focus:ring-3 focus:ring-[#da7756]/15 transition-all outline-none font-medium"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-xs font-bold text-slate-700 flex items-center justify-between">
                        <span>รอบทบทวน (Review Cycle)</span>
                        <span className="text-[10px] text-slate-500 font-normal">
                          ครบ: {(() => {
                            const d = new Date(formData.effectiveDate || new Date());
                            d.setMonth(d.getMonth() + Number(formData.reviewCycleMonths || 12));
                            return d.toLocaleDateString('th-TH', { month: 'short', year: '2-digit' });
                          })()}
                        </span>
                      </label>
                      <select 
                        value={formData.reviewCycleMonths}
                        onChange={e => handleChange('reviewCycleMonths', Number(e.target.value))}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-800 focus:bg-white focus:border-[#da7756] focus:ring-3 focus:ring-[#da7756]/15 transition-all outline-none font-medium cursor-pointer"
                      >
                        <option value={12}>12 เดือน (ประจำปี)</option>
                        <option value={24}>24 เดือน (ทุก 2 ปี)</option>
                        <option value={36}>36 เดือน (ทุก 3 ปี)</option>
                      </select>
                    </div>
                  </div>

                  <div className="pt-1">
                    <RelatedStandardsSelector
                      value={{
                        relatedStandards: formData.relatedStandards,
                        otherStandardDetail: formData.otherStandardDetail
                      }}
                      onChange={(newVals) => setFormData(prev => ({ ...prev, ...newVals }))}
                      error={formData.relatedStandards?.includes('อื่น ๆ (Others)') && !formData.otherStandardDetail?.trim() ? 'กรุณาระบุรายละเอียดมาตรฐานอื่นๆ' : ''}
                    />
                  </div>

                  {documentToEdit && !isResubmit && (
                    <div className="pt-1">
                      <label className="block text-xs font-bold text-rose-700 mb-1">
                        เหตุผลในการปรับปรุงเวอร์ชัน (Update Reason) <span className="text-rose-500">*</span>
                      </label>
                      <textarea
                        value={formData.reason}
                        onChange={e => handleChange('reason', e.target.value)}
                        placeholder="ระบุเหตุผลในการอัปเดตเวอร์ชันเอกสารฉบับนี้..."
                        rows={2}
                        className="w-full px-3.5 py-2.5 bg-rose-50/40 border border-rose-200 rounded-xl text-sm font-medium text-slate-800 placeholder:text-rose-300 focus:border-rose-500 focus:ring-3 focus:ring-rose-500/10 transition-all outline-none resize-none"
                      />
                    </div>
                  )}

                  {isResubmit && (
                    <div className="pt-1">
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        บันทึกการแก้ไขเพิ่มเติม (Revision Note) (ถ้ามี)
                      </label>
                      <textarea
                        value={formData.reason}
                        onChange={e => handleChange('reason', e.target.value)}
                        placeholder="ระบุบันทึกหรือคำชี้แจงเกี่ยวกับการแก้ไขในรอบนี้..."
                        rows={2}
                        className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-800 placeholder:text-slate-400 focus:border-[#da7756] focus:ring-3 focus:ring-[#da7756]/15 transition-all outline-none resize-none"
                      />
                    </div>
                  )}
                </div>

                {/* หมวดที่ 2: ขอบเขตและสายอนุมัติ (Scope & Sign-off) */}
                <div className="border-t border-slate-200 pt-5 space-y-4">
                  <div className="flex items-center gap-2 text-slate-900 font-bold text-sm tracking-wide border-b border-slate-100 pb-2">
                    <Shield className="text-[#da7756]" size={17} />
                    <span>หมวดที่ 2: ขอบเขตและสายอนุมัติ (Scope & Sign-Off)</span>
                  </div>

                  {/* Visibility Scope Segmented Tabs */}
                  <div className="space-y-2">
                    <label className="block text-xs font-bold text-slate-700">
                      ระดับการเข้าถึง (Access Scope) <span className="text-rose-500">*</span>
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      {[
                        { id: 'General', label: 'General (ทั่วไป)', desc: 'ทุกคนในองค์กรสามารถเข้าถึงได้' },
                        { id: 'Department', label: 'Department (แผนก)', desc: 'เฉพาะแผนกที่ได้รับอนุญาต' },
                        { id: 'Restricted', label: 'Restricted (จำกัดสิทธิ์)', desc: 'เฉพาะบุคคลที่ระบุเท่านั้น' }
                      ].map(scope => {
                        const isSelected = formData.accessScope === scope.id;
                        return (
                          <button
                            type="button"
                            key={scope.id}
                            onClick={() => handleScopeChange(scope.id)}
                            className={`p-3 rounded-xl border text-left transition-all duration-150 cursor-pointer ${
                              isSelected
                                ? 'bg-amber-50/60 border-[#da7756] shadow-2xs text-slate-900'
                                : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100 hover:border-slate-300'
                            }`}
                          >
                            <div className="font-bold text-xs sm:text-sm flex items-center justify-between">
                              <span className={isSelected ? 'text-[#da7756]' : ''}>{scope.label}</span>
                              {isSelected && <CheckCircle2 size={16} className="text-[#da7756]" />}
                            </div>
                            <span className="text-[11px] text-slate-500 mt-1 block leading-normal">{scope.desc}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Department Scope Sub-Panel */}
                  {formData.accessScope === 'Department' && (
                    <motion.div 
                      initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
                      className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2.5"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                        <label className="block text-xs font-bold text-slate-700">
                          เลือกแผนกที่อนุญาตให้เข้าถึง (Target Departments)
                        </label>
                        <span className="text-xs text-slate-500 font-medium">
                          เลือกแล้ว {(formData.accessDepartments || []).length} แผนก
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-2 pt-0.5">
                        {availableDepts.map(deptObj => {
                          const deptCode = typeof deptObj === 'string' ? deptObj : deptObj.id;
                          const deptName = typeof deptObj === 'string' ? deptObj : (deptObj.nameTh || deptObj.name);
                          const ownerDept = formData.department || userDept;
                          const isOwner = deptCode === ownerDept;
                          const isChecked = (formData.accessDepartments || []).includes(deptCode) || isOwner;
                          return (
                            <label 
                              key={deptCode} 
                              className={`group relative flex items-center gap-1.5 cursor-pointer px-3 py-1.5 rounded-lg border text-xs font-bold transition-all select-none ${
                                isChecked
                                  ? 'bg-[#da7756] border-[#da7756] text-white shadow-xs'
                                  : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-100'
                              } ${isOwner ? 'ring-2 ring-[#da7756]/30' : ''}`}
                            >
                              <input 
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => handleDeptToggle(deptCode)}
                                className="hidden"
                              />
                              <span>{deptCode} ({deptName})</span>
                              {isOwner && (
                                <span className="text-[10px] font-semibold bg-white/25 text-white px-1.5 py-0.5 rounded backdrop-blur-xs ml-1 border border-white/30 tracking-tight">
                                  (แผนกของคุณ / ผู้ถือครอง)
                                </span>
                              )}
                            </label>
                          );
                        })}
                      </div>
                    </motion.div>
                  )}

                  {/* Restricted Scope Sub-Panel */}
                  {formData.accessScope === 'Restricted' && (
                    <motion.div 
                      initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
                      className="relative z-30 bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <label className="block text-xs font-bold text-slate-700">
                          ระบุรายชื่อผู้มีสิทธิ์เข้าถึง (Restricted Authorized Users)
                        </label>
                        <span className="text-xs text-rose-600 font-medium">
                          เลือกเพิ่ม {(formData.accessUsers || []).filter(uId => uId !== currentUser?.id && uId !== currentUser?.empId).length} คน
                        </span>
                      </div>

                      {/* Phase 1: Implicit Stakeholder Notice Banner */}
                      <div className="flex items-center gap-2 text-xs text-amber-800 bg-amber-50 px-3 py-2 rounded-lg border border-amber-200/80">
                        <Shield size={14} className="text-amber-600 shrink-0" />
                        <span className="font-medium">ผู้ขึ้นทะเบียน, ผู้ทบทวน และผู้อนุมัติ จะได้รับสิทธิ์เข้าถึงเอกสารนี้โดยอัตโนมัติ</span>
                      </div>

                      {/* User Search Input excluding currentUser */}
                      <div className="max-w-xl relative z-40">
                        <UserSelector 
                          value=""
                          onChange={handleAddUser}
                          users={candidateRestrictedUsers}
                          placeholder="ค้นหาชื่อ หรือแผนกเพื่อเพิ่มผู้ใช้งาน..."
                        />
                      </div>

                      {/* Selected User Chips with Pinned Current User */}
                      <div className="flex flex-wrap gap-2 pt-1">
                        {/* Pinned Current User Chip (Read-only) */}
                        <span className="inline-flex items-center gap-1.5 bg-slate-200/80 border border-slate-300 text-slate-800 text-xs px-2.5 py-1.5 rounded-lg font-medium shadow-2xs select-none">
                          <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                          <span className="font-bold">คุณ ({currentUser?.name || 'ผู้ลงทะเบียน'})</span>
                          <span className="text-[10px] text-slate-600 bg-white px-1.5 py-0.5 rounded border border-slate-200">
                            ผู้ลงทะเบียน - อัตโนมัติ
                          </span>
                        </span>

                        {/* Explicitly Selected Users */}
                        {(formData.accessUsers || [])
                          .filter(uId => uId !== currentUser?.id && uId !== currentUser?.empId)
                          .map(uId => {
                            const u = (masterUsers || []).find(user => user.id === uId || user.empId === uId);
                            return (
                              <span key={uId} className="inline-flex items-center gap-2 bg-white border border-rose-200 text-rose-800 text-xs px-2.5 py-1.5 rounded-lg font-medium shadow-2xs">
                                <span className="font-bold">{u ? (u.fullName || u.name) : uId}</span>
                                {u?.department && (
                                  <span className="text-[10px] font-mono font-bold bg-rose-50 text-rose-700 px-1.5 py-0.5 rounded border border-rose-200">
                                    {u.department}
                                  </span>
                                )}
                                <button 
                                  type="button" 
                                  onClick={() => handleRemoveUser(uId)} 
                                  className="text-rose-400 hover:text-rose-700 hover:bg-rose-50 rounded p-0.5 transition-colors cursor-pointer"
                                  title="ลบผู้ใช้"
                                >
                                  <X size={14} />
                                </button>
                              </span>
                            );
                          })}
                      </div>
                    </motion.div>
                  )}

                  {/* Sign-Off Workflow: Reviewer & Approver */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1 relative z-10">
                    <div className="space-y-1.5">
                      <label className="block text-xs font-bold text-slate-700">
                        ผู้ทบทวนเอกสาร (External Reviewer) <span className="text-rose-500">*</span>
                      </label>
                      <UserSelector 
                        value={formData.reviewerId}
                        onChange={val => handleChange('reviewerId', val)}
                        users={eligibleReviewers}
                        placeholder="เลือกผู้ทบทวน (ที่ไม่ใช่ DCC Admin)..."
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-xs font-bold text-slate-700">
                        ผู้อนุมัติเอกสาร (External Approver) <span className="text-rose-500">*</span>
                      </label>
                      <UserSelector 
                        value={formData.approverId}
                        onChange={val => handleChange('approverId', val)}
                        users={eligibleApprovers}
                        placeholder="เลือกผู้อนุมัติ (Manager / Director)..."
                      />
                    </div>
                  </div>
                </div>

                {/* หมวดที่ 3: ไฟล์แนบและการแจกจ่าย (Attachment & Copies) */}
                <div className="border-t border-slate-200 pt-5 space-y-4">
                  <div className="flex items-center gap-2 text-slate-900 font-bold text-sm tracking-wide border-b border-slate-100 pb-2">
                    <Layers className="text-[#da7756]" size={17} />
                    <span>หมวดที่ 3: ไฟล์แนบและการแจกจ่าย (Attachment & Copies)</span>
                  </div>

                  {/* Physical Copy Switch */}
                  <div className="flex items-center justify-between p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
                    <div className="pr-4">
                      <div className="text-xs sm:text-sm font-bold text-slate-800 flex items-center gap-2">
                        <Printer size={16} className="text-slate-500" />
                        <span>การขอออกสำเนาควบคุมหน้างาน (Physical Controlled Copy on Demand)</span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5 leading-normal">
                        เปิดสวิตช์เมื่อต้องการให้ DCC พิมพ์เล่มเอกสารควบคุมแจกจ่ายหน้างาน (เริ่มต้นเป็นแบบ Digital Reference)
                      </p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer shrink-0">
                      <input
                        type="checkbox"
                        checked={formData.isPhysicalCopy}
                        onChange={e => handleChange('isPhysicalCopy', e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#da7756]"></div>
                    </label>
                  </div>

                  <AnimatePresence>
                    {formData.isPhysicalCopy && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="pt-1"
                      >
                        <DistributionSetup
                          ownerDept={formData.department || userDept}
                          distributions={formData.distributions || []}
                          onChange={dists => handleChange('distributions', dists)}
                          documentType="ED"
                          _document={{ docNo: previewEdCode, title: formData.title || 'External Document' }}
                        />
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Compact Official PDF File Upload */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="block text-xs font-bold text-slate-700">
                        ไฟล์เอกสารทางการ (Official PDF File) {documentToEdit && !isResubmit && <span className="text-red-500">*</span>}
                      </label>
                      {documentToEdit && !isResubmit && (
                        <span className="text-[11px] font-semibold text-amber-600 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                          จำเป็นต้องแนบไฟล์ฉบับปรับปรุงใหม่
                        </span>
                      )}
                    </div>
                    <div className="border-2 border-dashed border-slate-300 hover:border-[#da7756] rounded-xl py-4 px-6 flex flex-col items-center justify-center hover:bg-slate-50 transition-all cursor-pointer relative group">
                      <input 
                        ref={fileInputRef}
                        type="file" 
                        accept=".pdf"
                        onChange={handleFileChange}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" 
                      />
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-amber-50 group-hover:bg-amber-100 rounded-lg flex items-center justify-center transition-colors">
                          <Upload className="text-[#da7756]" size={20} />
                        </div>
                        <div className="text-left">
                          <span className="text-xs sm:text-sm font-bold text-slate-700 group-hover:text-[#da7756] transition-colors block">
                            คลิกหรือลากไฟล์ PDF มาวางที่นี่
                          </span>
                          <span className="text-[11px] text-slate-400">รองรับไฟล์ .PDF เท่านั้น (ขนาดไม่เกิน 25MB)</span>
                        </div>
                      </div>
                      {fileName && (
                        <div className="mt-2.5 flex items-center gap-2 bg-white border border-slate-200 text-slate-800 px-3 py-1.5 rounded-lg text-xs font-bold shadow-xs z-10">
                          <FileText size={15} className="text-[#da7756]" />
                          <span className="truncate max-w-xs">{fileName}</span>
                          <button
                            type="button"
                            onClick={handleRemoveFile}
                            className="p-0.5 hover:bg-slate-100 rounded text-slate-400 hover:text-red-500 transition-colors cursor-pointer"
                            title="ลบไฟล์"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </form>
            </div>

            {/* Footer Actions */}
            <div className="bg-slate-50 border-t border-slate-200 px-6 sm:px-8 py-3.5 flex items-center justify-end gap-3 shrink-0">
              <button 
                type="button"
                onClick={onClose}
                className="btn-secondary text-sm font-semibold px-5 py-2 rounded-xl border border-slate-300 transition-colors outline-none cursor-pointer"
              >
                ยกเลิก
              </button>
              <button 
                type="submit"
                form="external-doc-form"
                className="btn-primary text-sm font-semibold px-6 py-2 rounded-xl transition-all flex items-center gap-2 outline-none cursor-pointer"
              >
                <Save size={16} />
                <span>{isResubmit ? 'ส่งคำร้องอีกครั้ง (Resubmit)' : documentToEdit ? 'ส่งคำขออัปเดต' : 'ยืนยันการลงทะเบียน'}</span>
              </button>
            </div>
          </motion.div>

          {/* Bento-Grid Confirmation Modal */}
          {showConfirmModal && (
            <ExternalDocConfirmModal
              isOpen={showConfirmModal}
              onClose={() => setShowConfirmModal(false)}
              onConfirm={handleConfirmSubmit}
              data={payloadToSubmit}
              documentToEdit={documentToEdit}
              currentUser={currentUser}
              masterUsers={masterUsers}
              isResubmit={isResubmit}
            />
          )}
        </div>
      )}
    </AnimatePresence>
  );
};

export default ExternalDocFormModal;
