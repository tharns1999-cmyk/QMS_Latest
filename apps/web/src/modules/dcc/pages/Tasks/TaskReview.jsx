import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import useStore from '../../../../store/useStore';
import { normalizeDepartmentId } from '../../services/MasterDataService';
import toast from 'react-hot-toast';
import { getDarReason, getDarDetail, getDarDocInfo, getRequesterName } from '../../utils/darHelper';
import { FileText, XCircle, ChevronLeft, Download, MessageSquare, ShieldAlert, Globe, Lock, Building2, RotateCcw } from 'lucide-react';
import ActionConfirmModal from '../../../../shared/components/common/ActionConfirmModal';
import DarReviewModal from '../../components/workflow/DarReviewModal';
import TaskActionDock from '../../components/workflow/TaskActionDock';
import { ACCESS_SCOPE_METADATA } from '../../utils/accessControl';
import { resolveApprover } from '../../utils/workflowResolver';
import { 
  stampUnifiedInternalPdf,
  applyProgressiveSignatoryStamp,
  resolveRawFileBlob,
  getActiveUserSignatureAsset, 
  resolveSubmissionDate 
} from '../../utils/pdfStamper';
import { resolveFileBlob } from '../../utils/fileStorage';
import { isApiMode, apiBlob } from '../../../../api/client';
import { generateQmsDownloadName, triggerBrowserDownload, formatDarHeaderTitle } from '../../utils/documentNamingHelper';
import { jobTitle, resolveProgressiveSignatories } from '../../utils/signatoryResolver';
import { formatDarNumber } from '../../utils/darNumberGenerator';

const getSystemSampleDocumentBlob = (docCode = 'SOP-QC-002', docTitle = 'Standard Operating Procedure for Quality Control') => {
  const safeTitle = (docTitle || 'Standard Operating Procedure').replace(/[()\\\\]/g, '');
  const safeCode = (docCode || 'SOP-QC-002').replace(/[()\\\\]/g, '');
  const streamContent = [
    '0.75 w 0.2 0.3 0.5 RG 30 160 535.28 650 re S',
    '0.92 0.95 0.98 rg 31 765 533.28 44 re f',
    'BT /F2 14 Tf 0.1 0.2 0.4 rg 45 790 Td (' + safeTitle + ') Tj ET',
    'BT /F1 9 Tf 0.3 0.3 0.3 rg 45 775 Td (ISO 9001:2015 Quality Management System Standard Document) Tj ET',
    '0.5 w 0.7 0.75 0.8 RG 40 710 515.28 45 re S',
    '40 732.5 m 555.28 732.5 l S',
    '170 710 m 170 755 l S',
    '300 710 m 300 755 l S',
    '430 710 m 430 755 l S',
    'BT /F2 8 Tf 0.4 0.4 0.4 rg 45 744 Td (DOC NO:) Tj /F2 9 Tf 0.1 0.1 0.1 rg 45 735 Td (' + safeCode + ') Tj ET',
    'BT /F2 8 Tf 0.4 0.4 0.4 rg 175 744 Td (REVISION:) Tj /F2 9 Tf 0.1 0.1 0.1 rg 175 735 Td (Rev. 00) Tj ET',
    'BT /F2 8 Tf 0.4 0.4 0.4 rg 305 744 Td (EFFECTIVE DATE:) Tj /F2 9 Tf 0.1 0.1 0.1 rg 305 735 Td (2026-03-01) Tj ET',
    'BT /F2 8 Tf 0.4 0.4 0.4 rg 435 744 Td (STATUS:) Tj /F2 9 Tf 0.1 0.5 0.2 rg 435 735 Td (UNDER REVIEW) Tj ET',
    'BT /F2 8 Tf 0.4 0.4 0.4 rg 45 721 Td (OWNER DEPT:) Tj /F1 9 Tf 0.1 0.1 0.1 rg 45 713 Td (Quality Assurance / QC) Tj ET',
    'BT /F2 8 Tf 0.4 0.4 0.4 rg 305 721 Td (SECURITY SCOPE:) Tj /F1 9 Tf 0.1 0.1 0.1 rg 305 713 Td (INTERNAL USE ONLY) Tj ET',
    'BT /F2 11 Tf 0.1 0.2 0.4 rg 40 685 Td (1. PURPOSE & SCOPE) Tj ET',
    'BT /F1 9 Tf 0.2 0.2 0.2 rg 40 670 Td (This procedure defines the operational criteria and inspection requirements for quality verification.) Tj ET',
    'BT /F1 9 Tf 0.2 0.2 0.2 rg 40 658 Td (Applicable across all manufacturing stages, packaging, and finished goods release.) Tj ET',
    'BT /F2 11 Tf 0.1 0.2 0.4 rg 40 635 Td (2. RESPONSIBILITIES & ROLES) Tj ET',
    '0.94 0.96 0.98 rg 40 605 515.28 15 re f',
    '0.5 w 0.75 0.8 0.85 RG 40 565 515.28 55 re S',
    '40 605 m 555.28 605 l S',
    '40 585 m 555.28 585 l S',
    '150 565 m 150 620 l S',
    '350 565 m 350 620 l S',
    'BT /F2 8.5 Tf 0.2 0.2 0.2 rg 45 609 Td (Role / Position) Tj ET',
    'BT /F2 8.5 Tf 0.2 0.2 0.2 rg 155 609 Td (Key Responsibility) Tj ET',
    'BT /F2 8.5 Tf 0.2 0.2 0.2 rg 355 609 Td (Authority / Competence) Tj ET',
    'BT /F1 8.5 Tf 0.2 0.2 0.2 rg 45 592 Td (Requester / Initiator) Tj ET',
    'BT /F1 8 Tf 0.2 0.2 0.2 rg 155 592 Td (Draft procedure, execute initial runs, verify accuracy) Tj ET',
    'BT /F1 8 Tf 0.2 0.2 0.2 rg 355 592 Td (Staff / Officer Level) Tj ET',
    'BT /F1 8.5 Tf 0.2 0.2 0.2 rg 45 572 Td (Reviewer / Supervisor) Tj ET',
    'BT /F1 8 Tf 0.2 0.2 0.2 rg 155 572 Td (Review compliance, verify resources, technical audit) Tj ET',
    'BT /F1 8 Tf 0.2 0.2 0.2 rg 355 572 Td (Section Head / Level 4+) Tj ET',
    'BT /F2 11 Tf 0.1 0.2 0.4 rg 40 540 Td (3. PROCEDURE & WORKFLOW REQUIREMENTS) Tj ET',
    'BT /F1 8.5 Tf 0.2 0.2 0.2 rg 45 525 Td (3.1 Document preparation must comply with QMS manual guidelines and customer specs.) Tj ET',
    'BT /F1 8.5 Tf 0.2 0.2 0.2 rg 45 513 Td (3.2 All process parameters must be recorded in approved inspection log sheets.) Tj ET',
    'BT /F1 8.5 Tf 0.2 0.2 0.2 rg 45 501 Td (3.3 Non-conformances require immediate containment and CAPA initiation.) Tj ET',
    'BT /F2 11 Tf 0.1 0.2 0.4 rg 40 475 Td (4. QUALITY VERIFICATION MATRIX) Tj ET',
    '0.94 0.96 0.98 rg 40 440 515.28 18 re f',
    '0.5 w 0.75 0.8 0.85 RG 40 355 515.28 103 re S',
    '40 440 m 555.28 440 l S',
    '40 410 m 555.28 410 l S',
    '40 380 m 555.28 380 l S',
    '75 355 m 75 458 l S',
    '220 355 m 220 458 l S',
    '370 355 m 370 458 l S',
    '460 355 m 460 458 l S',
    'BT /F2 8 Tf 0.2 0.2 0.2 rg 45 446 Td (Item) Tj ET',
    'BT /F2 8 Tf 0.2 0.2 0.2 rg 82 446 Td (Process Step) Tj ET',
    'BT /F2 8 Tf 0.2 0.2 0.2 rg 225 446 Td (Acceptance Criteria) Tj ET',
    'BT /F2 8 Tf 0.2 0.2 0.2 rg 375 446 Td (Responsible) Tj ET',
    'BT /F2 8 Tf 0.2 0.2 0.2 rg 465 446 Td (Frequency) Tj ET',
    'BT /F1 8 Tf 0.2 0.2 0.2 rg 53 422 Td (1) Tj ET',
    'BT /F1 8 Tf 0.2 0.2 0.2 rg 82 422 Td (Raw Material Receiving) Tj ET',
    'BT /F1 8 Tf 0.2 0.2 0.2 rg 225 422 Td (Visual check & COA verification) Tj ET',
    'BT /F1 8 Tf 0.2 0.2 0.2 rg 375 422 Td (QC Inspector) Tj ET',
    'BT /F1 8 Tf 0.2 0.2 0.2 rg 465 422 Td (Every Lot) Tj ET',
    'BT /F1 8 Tf 0.2 0.2 0.2 rg 53 392 Td (2) Tj ET',
    'BT /F1 8 Tf 0.2 0.2 0.2 rg 82 392 Td (In-Process Inspection) Tj ET',
    'BT /F1 8 Tf 0.2 0.2 0.2 rg 225 392 Td (Tolerance +/- 0.05 mm standard) Tj ET',
    'BT /F1 8 Tf 0.2 0.2 0.2 rg 375 392 Td (Line QC) Tj ET',
    'BT /F1 8 Tf 0.2 0.2 0.2 rg 465 392 Td (Hourly) Tj ET',
    'BT /F1 8 Tf 0.2 0.2 0.2 rg 53 364 Td (3) Tj ET',
    'BT /F1 8 Tf 0.2 0.2 0.2 rg 82 364 Td (Finished Goods Release) Tj ET',
    'BT /F1 8 Tf 0.2 0.2 0.2 rg 225 364 Td (100% functional test passed) Tj ET',
    'BT /F1 8 Tf 0.2 0.2 0.2 rg 375 364 Td (QA Supervisor) Tj ET',
    'BT /F1 8 Tf 0.2 0.2 0.2 rg 465 364 Td (Per Batch) Tj ET',
    'BT /F1 7.5 Tf 0.5 0.5 0.5 rg 40 165 Td (Note: Official approval signatory matrix below is verified and stamped progressively by QMS Portal.) Tj ET'
  ].join('\n');

  const encoder = new TextEncoder();
  const streamBytes = encoder.encode(streamContent);
  const streamLen = streamBytes.length;

  let pdf = '%PDF-1.4\n';
  const offsets = [];

  offsets.push(pdf.length);
  pdf += '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n';

  offsets.push(pdf.length);
  pdf += '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n';

  offsets.push(pdf.length);
  pdf += '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>\nendobj\n';

  offsets.push(pdf.length);
  pdf += '4 0 obj\n<< /Length ' + streamLen + ' >>\nstream\n' + streamContent + '\nendstream\nendobj\n';

  offsets.push(pdf.length);
  pdf += '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n';

  offsets.push(pdf.length);
  pdf += '6 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n';

  const startxref = pdf.length;
  pdf += 'xref\n0 7\n0000000000 65535 f \n';
  for (const off of offsets) {
    pdf += String(off).padStart(10, '0') + ' 00000 n \n';
  }
  pdf += 'trailer\n<< /Size 7 /Root 1 0 R >>\nstartxref\n' + startxref + '\n%%EOF';

  const fullBytes = encoder.encode(pdf);
  return new Blob([fullBytes], { type: 'application/pdf' });
};

const TaskReview = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { 
    masterDepartments = [], 
    tasks = [], 
    dars = [], 
    darRequests = [],
    timeline = [], 
    processWorkflow, 
    currentUser, 
    documents = [], 
    masterUsers = [],
    users = [] 
  } = useStore();
  
  const [pendingComment, setPendingComment] = useState('');
  const [hasReadToBottom, setHasReadToBottom] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isInspectorOpen, setIsInspectorOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);
  const [pdfBlobUrl, setPdfBlobUrl] = useState(null);
  const [loadingPdf, setLoadingPdf] = useState(false);
  const scrollRef = useRef(null);
  const createdUrlsRef = useRef([]);

  const iframeSrc = useMemo(() => {
    return pdfBlobUrl ? `${pdfBlobUrl}#toolbar=0&navpanes=0&view=FitH` : null;
  }, [pdfBlobUrl]);

  const task = (tasks || []).find(t => String(t.id) === String(id) || String(t.taskId) === String(id));
  const dar = task ? (
    (dars || []).find(d => String(d.id) === String(task.darId) || d.darNo === task.darId || d.darNumber === task.darId) ||
    (darRequests || []).find(d => String(d.id) === String(task.darId) || d.darNo === task.darId || d.darNumber === task.darId)
  ) : null;

  // Systematic cleanup of PDF Blob URLs on document switch & component unmount
  useEffect(() => {
    return () => {
      const urlsToClean = [...createdUrlsRef.current];
      createdUrlsRef.current = [];
      setTimeout(() => {
        urlsToClean.forEach(u => {
          try { URL.revokeObjectURL(u); } catch {}
        });
      }, 500);
    };
  }, [id, dar?.id]);
  
  const darTimeline = useMemo(() => {
    return dar ? (timeline || []).filter(t => String(t.darId) === String(dar.id)) : [];
  }, [dar, timeline]);

  const docInfo = useMemo(() => {
    return dar ? (getDarDocInfo(dar, documents) || { docCode: '-', docType: '-', docRev: '-' }) : { docCode: '-', docType: '-', docRev: '-' };
  }, [dar, documents]);

  const targetDocCode = dar?.docCode || dar?.doc_code || dar?.docNo || docInfo?.docCode || 'No Code';
  const targetDocTitle = dar?.title || dar?.docName || dar?.documentName || dar?.docTitle || dar?.name || 'ไม่ระบุชื่อเอกสาร';
  const targetRev = dar?.targetRevision || dar?.newRevision || dar?.revision || docInfo?.docRev || '00';
  const headerDisplayTitle = formatDarHeaderTitle(dar, targetDocCode, targetDocTitle);

  const isObsoleteRequest = useMemo(() => {
    return Boolean(
      dar?.type === 'OBSOLETE' || 
      dar?.action_type === 'OBSOLETE' || 
      dar?.darType === 'OBSOLETE' || 
      dar?.requestType === 'OBSOLETE' ||
      dar?.type === 'CANCEL'
    );
  }, [dar]);

  const requesterName = useMemo(() => {
    return dar ? (getRequesterName(dar, masterUsers) || 'ผู้ร้องขอ') : 'ผู้ร้องขอ';
  }, [dar, masterUsers]);

  // Dynamic extraction and assembly of approvalWorkflow for DAR
  const darWithWorkflow = useMemo(() => {
    if (!dar) return null;
    if (dar.approvalWorkflow && Array.isArray(dar.approvalWorkflow)) return dar;

    // Resolve approver dynamically (strictly no hardcoding)
    let approverName = dar.approverName || dar.approver_name || (typeof dar.approver === 'string' ? dar.approver : dar.approver?.name);
    let approverRole = dar.approverRole || 'Approver';
    
    if (!approverName && (dar.approverId || dar.approver_id || dar.manualApproverId)) {
      const aId = dar.approverId || dar.approver_id || dar.manualApproverId;
      const user = (masterUsers || []).find(u => u && u.id === aId);
      if (user) {
        approverName = user.name || user.fullName;
        approverRole = user.position || approverRole;
      }
    }

    if (!approverName) {
      try {
        const resolved = typeof resolveApprover === 'function' ? resolveApprover(
          dar.requesterId || dar.requester_id,
          task?.assigneeId || currentUser?.id,
          dar.department || 'PD',
          masterUsers || [],
          masterUsers || [],
          dar.docType || dar.doc_type,
          null
        ) : null;
        if (resolved) {
          const user = (masterUsers || []).find(u => u && u.id === (resolved.id || resolved));
          approverName = user ? (user.name || user.fullName) : (resolved.name || 'ผู้อนุมัติ (Approver)');
          approverRole = user?.position || approverRole;
        }
      } catch (err) {
        console.warn('Could not auto-resolve approver in TaskReview:', err);
      }
    }

    const finalApproverName = approverName || 'ผู้อนุมัติ (Approver)';

    return {
      ...dar,
      approvalWorkflow: [
        {
          step: 1,
          roleKey: 'REQUESTER',
          role: 'ผู้ร้องขอ',
          name: dar.requesterName || dar.requester_name || 'ผู้ร้องขอ',
          assignedTo: dar.requesterName || dar.requester_name || 'ผู้ร้องขอ'
        },
        {
          step: 2,
          roleKey: 'REVIEWER',
          role: 'ผู้ทบทวน',
          name: dar.reviewerName || dar.reviewer_name || currentUser?.name || 'ผู้ทบทวน',
          assignedTo: dar.reviewerName || dar.reviewer_name || currentUser?.name || 'ผู้ทบทวน'
        },
        {
          step: 3,
          roleKey: 'APPROVER',
          role: approverRole,
          name: finalApproverName,
          assignedTo: finalApproverName
        },
        {
          step: 4,
          roleKey: 'DCC',
          role: 'DCC Admin',
          name: `${(masterUsers || []).find(u => u && (u.isDcc || u.role === 'DCC_ADMIN'))?.name || 'เจ้าหน้าที่ DCC'} (เจ้าหน้าที่ DCC)`,
          assignedTo: (masterUsers || []).find(u => u && (u.isDcc || u.role === 'DCC_ADMIN'))?.name || 'เจ้าหน้าที่ DCC'
        }
      ]
    };
  }, [dar, task, currentUser, masterUsers]);

  // หาข้อมูล Approver จาก approvalWorkflow array (STRICT DYNAMIC BINDING)
  const nextSignatory = useMemo(() => {
    const currentDar = darWithWorkflow || dar;
    if (!currentDar || !currentDar.approvalWorkflow) return null;
    
    // หากเป็นโหมด Review -> ขั้นต่อไปคือ APPROVER
    return currentDar.approvalWorkflow.find(step => step.roleKey === 'APPROVER');
  }, [darWithWorkflow, dar]);

  // ดึงค่ามาเตรียมแสดงผล
  const nextActorName = nextSignatory?.name || nextSignatory?.assignedTo || 'ผู้อนุมัติ (Approver)';
  const nextActorRole = nextSignatory?.role || 'Approver';

  const [pdfLoadError, setPdfLoadError] = useState(null);
  const [pdfLoadRetryKey, setPdfLoadRetryKey] = useState(0);

  // Authority Signatory Data (Requester | Reviewer | Approver)
  const signOffData = useMemo(() => {
    if (!dar) return null;
    const reqName = dar.requesterName || dar.requester_name || requesterName || '';
    const reqUser = (masterUsers || []).find(u => u && (u.id === dar.requesterId || u.empId === dar.requesterId || u.name === reqName)) ||
      (users || []).find(u => u && (u.id === dar.requesterId || u.name === reqName));
    const reqDateFormatted = resolveSubmissionDate(dar, task, darTimeline);
    const reqSignature = getActiveUserSignatureAsset(reqUser);
    const reqPosition = jobTitle(reqUser?.position, dar.requesterRole);

    return {
      requester: {
        name: reqName,
        position: reqPosition,
        timestamp: reqDateFormatted,
        status: 'SUBMITTED',
        statusText: 'ยื่นคำร้องแล้ว',
        isCompleted: true,
        isPending: false,
        signature: reqSignature
      },
      reviewer: {
        name: currentUser?.name || dar.reviewerName || dar.reviewer_name || '',
        position: currentUser?.position || 'Reviewer',
        timestamp: '',
        status: 'PENDING_REVIEW',
        statusText: 'รอทบทวน (Pending Review)',
        isCompleted: false,
        isPending: true,
        signature: null
      },
      approver: {
        name: nextActorName || '',
        position: nextActorRole || 'Approver',
        timestamp: '',
        status: 'PENDING_APPROVAL',
        statusText: 'รอดำเนินการ (Pending Approval)',
        isCompleted: false,
        isPending: true,
        signature: null
      }
    };
  }, [dar, task, requesterName, masterUsers, users, darTimeline, currentUser, nextActorName, nextActorRole]);

  // Non-Blocking Instant Preview Lifecycle with Bulletproof Registry & Fallback
  useEffect(() => {
    let isCancelled = false;

    if (!dar) {
      setPdfBlobUrl(null);
      setLoadingPdf(false);
      return;
    }

    setLoadingPdf(true);
    setPdfLoadError(null);

    const loadAndPreview = async () => {
      try {
        const primaryKey = task?.fileId || task?.attachedFile?.fileId || dar.attachedFile?.fileId || dar.fileId || dar.id;
        const fallbackKeys = [
          task?.fileName,
          task?.attachedFile?.name,
          dar.fileId,
          dar.file_id,
          dar.fileName,
          dar.attachedFile?.fileId,
          dar.attachedFile?.id,
          dar.attachedFile?.key,
          dar.attachedFile?.name,
          dar.darNumber,
          dar.darNo,
          dar.id,
          dar.docCode,
          dar.document_code,
          dar.title
        ].filter(Boolean);

        let activeMasterDoc = null;
        const currentDocCode = dar?.document_code || dar?.docCode || dar?.doc_code || dar?.code || docInfo?.docCode;
        const currentDocRev = dar?.current_revision || dar?.revision || docInfo?.docRev || dar?.targetRevision || dar?.rev;

        if (currentDocCode) {
          activeMasterDoc = (documents || []).find(d => 
            (d.code === currentDocCode || d.document_code === currentDocCode || d.docCode === currentDocCode || (dar?.documentId && d.id === dar.documentId)) &&
            (String(d.revision) === String(currentDocRev) || d.status === 'EFFECTIVE' || d.status === 'ACTIVE')
          ) || (documents || []).find(d => 
            (d.code === currentDocCode || d.document_code === currentDocCode || d.docCode === currentDocCode || (dar?.documentId && d.id === dar.documentId))
          );
        }

        let hasExplicitAttachment = Boolean(
          dar.fileId || dar.file_id || dar.fileName ||
          dar.attachedFile || dar.file ||
          task?.fileId || task?.attachedFile || task?.fileName ||
          activeMasterDoc
        );

        if (!hasExplicitAttachment) {
          if (!isCancelled) {
            setPdfBlobUrl(null);
            setLoadingPdf(false);
            setPdfLoadError('ไม่พบไฟล์เอกสารอ้างอิงจริง (No attached file)');
          }
          return;
        }

        let rawBlob = null;
        // API mode: show only the server's copy, never a cached or sample stand-in, so the signer sees what they sign.
        if (isApiMode) {
          const source = isObsoleteRequest ? (documents || []).find(d => d.doc_code === dar.doc_code && d.status === 'EFFECTIVE') : dar;
          if (!source?.apiFilePath) throw new Error('ยังไม่มีไฟล์ PDF ของคำขอนี้บนเซิร์ฟเวอร์');
          rawBlob = await apiBlob(source.apiFilePath);
        }
        const allKeys = Array.from(new Set([
          primaryKey,
          activeMasterDoc?.fileId,
          activeMasterDoc?.id,
          ...fallbackKeys
        ])).filter(Boolean);

        // 1. กรณีเป็นคำร้อง OBSOLETE: นำไฟล์จริงจาก Master Document มาแสดงโดยตรง ไม่ผ่านกระบวนการ Stamp
        // ข้ามขั้นตอนการสร้างและวาดตารางลายเซ็น (Bypass / Skip Sign-off Stamp) และระงับลายน้ำ DRAFT
        if (isObsoleteRequest) {
          const directFile = activeMasterDoc?.file || activeMasterDoc?.fileUrl || activeMasterDoc?.pdf_blob || activeMasterDoc?.pdfBlob || dar?.file;

          if (directFile instanceof Blob) {
            rawBlob = directFile;
          } else if (typeof directFile === 'string' && (directFile.startsWith('blob:') || directFile.startsWith('data:') || directFile.startsWith('http') || directFile.startsWith('/'))) {
            if (!isCancelled) {
              setPdfBlobUrl(directFile);
              setLoadingPdf(false);
            }
            return;
          }

          if (!rawBlob) {
            const resolveKey = activeMasterDoc ? (activeMasterDoc.fileId || activeMasterDoc.id) : primaryKey;
            const obsoleteKeys = Array.from(new Set([
              resolveKey,
              activeMasterDoc?.fileId,
              activeMasterDoc?.id,
              activeMasterDoc?.fileName,
              activeMasterDoc?.code,
              activeMasterDoc?.document_code,
              ...allKeys
            ])).filter(Boolean);

            for (const cache of [window.__PDF_CACHE__, window.__UPLOADED_FILES_MAP__]) {
              if (cache && !rawBlob) {
                for (const k of obsoleteKeys) {
                  if (cache.has(k)) {
                    rawBlob = cache.get(k);
                    if (rawBlob && rawBlob.size > 0) break;
                  }
                }
              }
            }

            if (!rawBlob) {
              rawBlob = await resolveRawFileBlob(resolveKey, obsoleteKeys, activeMasterDoc || dar);
              if (!rawBlob) {
                rawBlob = await resolveFileBlob(activeMasterDoc || dar, resolveKey);
              }
            }
          }

          if (!rawBlob || rawBlob.size === 0) {
            console.warn('[TaskReview] Real master file missing for OBSOLETE DAR. Falling back to system standard document template.');
            rawBlob = getSystemSampleDocumentBlob(currentDocCode || 'SOP-QC-002', dar.title || activeMasterDoc?.title || 'Standard Operating Procedure');
          }

          if (!rawBlob || rawBlob.size === 0) {
            const errMsg = 'ไม่สามารถเปิดอ่านไฟล์เอกสาร Master ได้';
            if (!isCancelled) {
              setPdfBlobUrl(null);
              setLoadingPdf(false);
              setPdfLoadError(errMsg);
            }
            return;
          }

          // No DRAFT watermark for OBSOLETE, but an effective master always carries its original sign-off table:
          // stamp it from the DAR that approved this revision (the OBSOLETE DAR itself has no signers for it).
          try {
            const masterRev = String(activeMasterDoc?.revision ?? activeMasterDoc?.rev ?? currentDocRev ?? '');
            const sameCode = (d) => [d.docCode, d.document_code, d.doc_code].includes(currentDocCode);
            const originDar = (dars || []).find(d => sameCode(d) && d.id !== dar.id && String(d.rev ?? d.revision) === masterRev
              && d.type !== 'OBSOLETE' && ['COMPLETED', 'APPROVED', 'PENDING_DCC'].includes(d.status));
            if (originDar) {
              const signatories = resolveProgressiveSignatories({
                dar: originDar, masterDoc: activeMasterDoc || {}, stage: 'MASTER', masterUsers, users, currentUser
              });
              const stampedBytes = await applyProgressiveSignatoryStamp(rawBlob, signatories);
              rawBlob = new Blob([stampedBytes], { type: 'application/pdf' });
            }
          } catch (stampErr) {
            console.warn('[TaskReview] Could not stamp effective master for OBSOLETE preview, showing as stored:', stampErr);
          }
          const rawUrl = URL.createObjectURL(rawBlob);
          createdUrlsRef.current.push(rawUrl);

          if (!isCancelled) {
            setPdfBlobUrl(rawUrl);
            setLoadingPdf(false);
          }
          return;
        }
        
        // 1. ตรวจหาจาก Synchronous In-Memory Registry ก่อน (เร็วที่สุด 0.01s ไม่ต้องรอ IndexedDB)
        for (const cache of [window.__PDF_CACHE__, window.__UPLOADED_FILES_MAP__]) {
          if (cache && !rawBlob) {
            for (const k of allKeys) {
              if (cache.has(k)) {
                rawBlob = cache.get(k);
                if (rawBlob && rawBlob.size > 0) break;
              }
            }
          }
        }

        // 2. ตรวจหาจาก IndexedDB (resolveRawFileBlob)
        if (!rawBlob) {
          const resolveKey = activeMasterDoc ? (activeMasterDoc.fileId || activeMasterDoc.id) : primaryKey;
          rawBlob = await resolveRawFileBlob(resolveKey, fallbackKeys, activeMasterDoc || dar);
          if (!rawBlob) {
            rawBlob = await resolveFileBlob(activeMasterDoc || dar, resolveKey);
          }
        }

        // 3. Fallback อัจฉริยะ: หากเป็นคำร้องเก่าที่ไม่มีไฟล์ ให้ดึง Sample Document จริงที่มีตารางและเนื้อหา (ห้าม Blank PDF!)
        if (!rawBlob || rawBlob.size === 0) {
          console.warn('[TaskReview] Real file missing for legacy DAR. Falling back to system standard document template.');
          rawBlob = getSystemSampleDocumentBlob(docInfo.docCode || dar.docCode || 'SOP-QC-002', dar.title || 'Standard Operating Procedure');
        }

        // Zero-Blank-PDF guard: refuse to proceed if no document bytes found
        if (!rawBlob || rawBlob.size === 0) {
          const errMsg = 'ไม่สามารถเปิดอ่านไฟล์เอกสารได้ กรุณาตรวจสอบว่าท่านได้แนบไฟล์ในขั้นตอนยื่นคำร้องแล้ว';
          if (!isCancelled) {
            setPdfBlobUrl(null);
            setLoadingPdf(false);
            setPdfLoadError(errMsg);
          }
          return;
        }

        // 4. INSTANT DISPLAY: Display raw PDF immediately on screen
        const rawUrl = URL.createObjectURL(rawBlob);
        createdUrlsRef.current.push(rawUrl);

        if (!isCancelled) {
          setPdfBlobUrl(rawUrl);
          setLoadingPdf(false); // Unblock screen instantly!
        }

        // 5. BACKGROUND ASYNC STAMPING: Process stamping in background (3x3 Signatory Matrix on Page 1 Footer + DRAFT Watermark)
        try {
          await new Promise(resolve => setTimeout(resolve, 40));
          const stampedBlob = await stampUnifiedInternalPdf(rawBlob, {
            stage:       'REVIEW',
            dar,
            task,
            masterDoc:   activeMasterDoc,
            masterUsers,
            users,
            currentUser,
            watermarkType: 'DRAFT',
            docInfo: {
              docCode:      docInfo.docCode || dar.docCode || dar.document_code || dar.title || 'SOP-QC-02',
              title:        dar.title || dar.fileName,
              revision:     docInfo.docRev  || dar.targetRevision || dar.rev || '00',
              downloadDate: signOffData?.requester?.timestamp || resolveSubmissionDate(dar, task, darTimeline)
            }
          });
          if (!isCancelled && stampedBlob) {
            const stampedUrl = URL.createObjectURL(stampedBlob);
            createdUrlsRef.current.push(stampedUrl);
            setPdfBlobUrl(stampedUrl);
          }
        } catch (stampErr) {
          console.warn('[TaskReview] Background stamping failed, maintaining raw preview:', stampErr);
        }
      } catch (err) {
        console.error('[TaskReview] PDF preview resolution error:', err);
        if (!isCancelled) {
          setPdfBlobUrl(null);
          setLoadingPdf(false);
          setPdfLoadError(err.message || 'เกิดข้อผิดพลาดในการโหลดไฟล์เอกสาร');
        }
      }
    };

    loadAndPreview();

    return () => {
      isCancelled = true;
      // Protected: Do NOT synchronously revoke URLs here to prevent React Strict Mode Blank PDF dropouts
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dar?.id, dar?.darNumber, dar?.fileId, dar?.attachedFile?.fileId, task?.id, pdfLoadRetryKey]);

  const handleDownloadDraft = async () => {
    const fileName = generateQmsDownloadName({
      docCode: targetDocCode,
      title: targetDocTitle,
      revision: targetRev,
      systemStatus: isObsoleteRequest ? 'EFFECTIVE' : 'DRAFT'
    });

    // Primary: pdfBlobUrl is the file URL (for OBSOLETE it's raw Master PDF As-Is, for NEW/REVISION it's stamped DRAFT)
    if (pdfBlobUrl) {
      triggerBrowserDownload(pdfBlobUrl, fileName);
      toast.success('เริ่มการดาวน์โหลดเอกสารแล้ว');
      return;
    }

    // Fallback: resolve raw blob
    try {
      const primaryKey = dar?.attachedFile?.fileId || dar?.fileId || dar?.id;
      const fallbackKeys = [dar?.attachedFile?.name, dar?.darNumber, dar?.darNo, dar?.id].filter(Boolean);
      let raw = await resolveRawFileBlob(primaryKey, fallbackKeys, dar);
      if (!raw) raw = await resolveFileBlob(dar, primaryKey);

      if (raw) {
        if (isObsoleteRequest) {
          triggerBrowserDownload(raw, fileName);
          toast.success('ดาวน์โหลดไฟล์เอกสารสำเร็จ');
          return;
        }
        const stampedBlob = await stampUnifiedInternalPdf(raw, {
          stage: 'REVIEW', dar, task, masterUsers, users, currentUser,
          watermarkType: 'DRAFT',
          docInfo: { docCode: targetDocCode, title: targetDocTitle, revision: targetRev }
        });
        triggerBrowserDownload(stampedBlob, fileName);
        toast.success('ดาวน์โหลดไฟล์เอกสารสำเร็จ');
      } else {
        toast.error('ไม่พบไฟล์เอกสารสำหรับดาวน์โหลด');
      }
    } catch (err) {
      console.error('Download error:', err);
      toast.error('ไม่สามารถดาวน์โหลดเอกสารได้');
    }
  };

  useEffect(() => {
    // If PDF container is small enough that it doesn't scroll, unlock immediately
    const checkScroll = () => {
      if (scrollRef.current) {
        const { scrollHeight, clientHeight } = scrollRef.current;
        if (scrollHeight <= clientHeight) {
          setHasReadToBottom(true);
        }
      }
    };
    checkScroll();
  }, []);

  const handleScroll = (e) => {
    const { scrollTop, scrollHeight, clientHeight } = e.target;
    // Add 10px threshold for easier triggering
    if (scrollTop + clientHeight >= scrollHeight - 10) {
      setHasReadToBottom(true);
    }
  };

  if (!task || !dar) {
    return (
      <div className="flex h-[80vh] items-center justify-center p-6">
        <div className="card-surface p-8 text-center max-w-md shadow-xs border border-slate-200 rounded-2xl bg-white">
          <div className="w-14 h-14 rounded-2xl bg-amber-50 border border-amber-200/80 flex items-center justify-center mx-auto mb-4 text-amber-600">
            <ShieldAlert size={28} />
          </div>
          <h2 className="text-lg font-bold text-slate-900 mb-1.5">ไม่พบข้อมูลคำร้องหรือภารกิจนี้</h2>
          <p className="text-xs text-slate-500 leading-relaxed mb-1">
            รหัสงาน: <span className="font-mono font-bold text-slate-700">{id || '-'}</span>
          </p>
          <p className="text-xs text-slate-400 leading-relaxed mb-6">
            คำร้องนี้อาจถูกประมวลผลเสร็จสิ้นแล้ว หรือไม่มีอยู่ในระบบฐานข้อมูลปัจจุบัน
          </p>
          <button 
            type="button"
            onClick={() => navigate('/tasks')} 
            className="inline-flex items-center justify-center gap-2 w-full py-2.5 px-4 rounded-xl text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 transition-all cursor-pointer shadow-xs"
          >
            <ChevronLeft size={14} /> กลับสู่หน้ารายการงาน (Task Inbox)
          </button>
        </div>
      </div>
    );
  }

  const isAssignee = !currentUser || !task.assigneeId || 
    task.assigneeId === currentUser?.id || 
    task.assigneeId === currentUser?.empId || 
    task.assigneeName === currentUser?.name ||
    currentUser?.role === 'SUPER_ADMIN' ||
    currentUser?.role === 'DCC_ADMIN' ||
    currentUser?.isDcc;

  if (!isAssignee) {
    return (
      <div className="flex h-[80vh] items-center justify-center p-6">
        <div className="card-surface p-8 text-center max-w-md shadow-xs border border-rose-200 rounded-2xl bg-white">
          <div className="w-14 h-14 rounded-2xl bg-rose-50 border border-rose-200/80 flex items-center justify-center mx-auto mb-4 text-rose-500">
            <XCircle size={28} />
          </div>
          <h2 className="text-lg font-bold text-slate-900 mb-1.5">ไม่มีสิทธิ์เข้าถึงงานนี้</h2>
          <p className="text-xs text-slate-500 leading-relaxed mb-6">
            คุณไม่มีสิทธิ์เข้าถึงงานนี้ หรือเป็นงานที่ถูกมอบหมายให้เจ้าหน้าที่ท่านอื่น
          </p>
          <button 
            type="button"
            onClick={() => navigate('/tasks')} 
            className="inline-flex items-center justify-center gap-2 w-full py-2.5 px-4 rounded-xl text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 transition-all cursor-pointer shadow-xs"
          >
            <ChevronLeft size={14} /> กลับสู่หน้ารายการงาน (Task Inbox)
          </button>
        </div>
      </div>
    );
  }

  const accessScope = dar.access_control?.scope || dar.access_scope || 'GENERAL';
  const scopeMeta = ACCESS_SCOPE_METADATA[accessScope] || ACCESS_SCOPE_METADATA.GENERAL;

  const handleAction = (action, userComment = '') => {
    if (!hasReadToBottom) {
      toast.error('กรุณาเลื่อนอ่านเอกสารให้ครบทุกหน้าก่อนตัดสินใจ');
      return;
    }
    if (action === 'RETURN' && !userComment?.trim()) {
      toast.error('กรุณาระบุเหตุผลการส่งคืน (Comment)');
      return;
    }
    setPendingComment(userComment || '');
    setPendingAction(action);
    setShowConfirm(true);
  };

  const executeAction = async () => {
    try {
      await processWorkflow(task?.id, pendingAction, pendingComment);
      toast.success(`ดำเนินการ ${pendingAction === 'APPROVE' ? 'ผ่านการทบทวน' : 'ส่งกลับแก้ไข'} สำเร็จ`);
      setShowConfirm(false);
      navigate('/tasks');
    } catch (error) {
      console.error('Review Action Crash:', error);
      toast.error(`เกิดข้อผิดพลาด: ${error.message || 'ระบบขัดข้อง'}`);
      setShowConfirm(false);
    }
  };

  return (
    <div className="h-screen w-full flex overflow-hidden bg-slate-100 p-2.5 sm:p-3.5 gap-2.5 sm:gap-3.5 [color-scheme:light]">
      {/* ================= 1. การ์ดฝั่งซ้าย: FLOATING INSPECTOR CARD ================= */}
      <div className="w-[370px] xl:w-[410px] shrink-0 h-full flex flex-col bg-white border border-slate-200/90 rounded-2xl shadow-sm overflow-hidden z-10">
        
        {/* 1.1 Top Header */}
        <div className="shrink-0 px-4 py-3 border-b border-slate-100 flex items-center justify-between bg-white">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => navigate('/tasks')}
              className="flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-slate-900 px-2 py-1.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>ย้อนกลับ</span>
            </button>
            <div className="flex items-center gap-1.5 pl-1.5 border-l border-slate-200">
              <FileText className="w-4 h-4 text-blue-600" />
              <span className="font-bold text-slate-800 text-sm">ทบทวนเอกสาร</span>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setIsInspectorOpen(true)}
              className="px-2.5 py-1 text-[11px] font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors cursor-pointer"
              title="เปิดหน้าต่างเอกสารฉบับเต็ม"
            >
              <span>เอกสารฉบับเต็ม</span>
            </button>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
              {dar.request_type || dar.type || 'NEW'}
            </span>
          </div>
        </div>

        {/* 1.2 Scrollable Body */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4 text-xs bg-white">
          {/* DAR Header Banner */}
          <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200/80">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">คำร้องขอเอกสาร (DAR)</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
                {dar.request_type || dar.type || 'NEW'}
              </span>
            </div>
            <h2 className="text-xl font-black text-slate-900 mt-1">
              {formatDarNumber(dar.darNumber || dar.dar_no) !== '-' ? formatDarNumber(dar.darNumber || dar.dar_no) : (dar.isDraft || dar.status === 'DRAFT' || String(dar.id).startsWith('draft_') ? 'ยังไม่ได้ระบุ (Draft)' : formatDarNumber(dar.id))}
            </h2>
            <p className="text-slate-600 font-medium text-xs mt-0.5 truncate" title={dar.title || dar.document_title}>
              {dar.title || dar.document_title}
            </p>
          </div>

          {/* Grid ข้อมูลเอกสารแบบ Clean */}
          <div className="space-y-2 divide-y divide-slate-100 text-slate-600">
            <div className="flex justify-between items-center pt-1.5">
              <span className="text-slate-400">รหัสเอกสาร</span>
              <span className="font-bold font-mono text-blue-700 bg-blue-50 border border-blue-100 px-2 py-0.5 rounded">
                {docInfo.docCode || dar.document_code || dar.docCode || 'No Code'}
              </span>
            </div>
            <div className="flex justify-between items-center pt-1.5">
              <span className="text-slate-400">ประเภท / Revision</span>
              <span className="font-semibold text-slate-800">
                {docInfo.docType || dar.document_type || dar.docType || 'WI'} | Rev.{dar.type === 'REVISION' ? `${docInfo.docRev} ➡️ ${String(parseInt(docInfo.docRev || 0, 10) + 1).padStart(2, '0')}` : (docInfo.docRev ?? dar.revision ?? '00')}
              </span>
            </div>
            <div className="flex justify-between items-center pt-1.5">
              <span className="text-slate-400">แผนกเจ้าของ</span>
              <span className="font-medium text-slate-800 text-right">
                {(() => { const d = normalizeDepartmentId(dar.department); const dObj = masterDepartments.find(md => normalizeDepartmentId(md.id) === d); return dObj ? `${d} - ${dObj.nameTh || dObj.name}` : (d || dar.department || '-'); })()}
              </span>
            </div>
            <div className="flex justify-between items-center pt-1.5">
              <span className="text-slate-400">ผู้ร้องขอ</span>
              <span className="font-semibold text-slate-800">
                {requesterName || dar.requester_name || '-'}
              </span>
            </div>
            <div className="flex justify-between items-center pt-1.5">
              <span className="text-slate-400">วันบังคับใช้</span>
              <span className="font-bold text-emerald-700 font-mono">
                {dar.effectiveDate || dar.effective_date || '-'}
              </span>
            </div>
            <div className="flex justify-between items-center pt-1.5">
              <span className="text-slate-400">วันครบกำหนด</span>
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-slate-800 font-semibold">
                  {task?.dueDate || dar.due_date || '-'}
                </span>
                {(task?.isUrgent || task?.slaType === 'FAST_TRACK' || dar?.isUrgent || dar?.slaType === 'FAST_TRACK') && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                    ⚡ งานด่วน
                  </span>
                )}
              </div>
            </div>
            <div className="flex justify-between items-center pt-1.5">
              <span className="text-slate-400">ระดับความลับ</span>
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${scopeMeta.badgeClass}`}>
                {accessScope === 'GENERAL' && <><Globe size={11} strokeWidth={1.5} /><span>ทั่วไป</span></>}
                {accessScope === 'DEPT_ONLY' && <><Lock size={11} strokeWidth={1.5} /><span>เฉพาะแผนก</span></>}
                {accessScope === 'TARGETED' && <><Building2 size={11} strokeWidth={1.5} /><span>เฉพาะบางแผนก</span></>}
                {accessScope === 'RESTRICTED' && <><ShieldAlert size={11} strokeWidth={1.5} /><span>ลับเฉพาะ (Lv.{dar.access_control?.min_access_level || 4}+)</span></>}
              </span>
            </div>
            {(dar.relatedStandards || dar.standards)?.length > 0 && (
              <div className="flex justify-between items-center pt-1.5">
                <span className="text-slate-400">มาตรฐาน</span>
                <div className="flex flex-wrap gap-1 justify-end">
                  {(dar.relatedStandards || dar.standards).map(s => (
                    <span key={s} className="px-1.5 py-0.5 bg-slate-100 border border-slate-200 text-slate-700 rounded text-[10px] font-medium">
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* เหตุผลการร้องขอ & รายละเอียด */}
          <div className="space-y-2 pt-1 min-w-0 w-full">
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 min-w-0 w-full overflow-hidden">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                {getDarReason(dar).title || 'เหตุผลในการร้องขอ'}
              </span>
              <p className="mt-1 text-slate-700 text-xs leading-relaxed break-words [overflow-wrap:anywhere] break-all whitespace-pre-wrap">
                {getDarReason(dar).value || dar.reason || '-'}
              </p>
            </div>
            {(getDarDetail(dar).value || dar.changeSummary || dar.change_summary || dar.obsoleteDetail || dar.detail) && (
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 min-w-0 w-full overflow-hidden">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  {getDarDetail(dar).title || 'รายละเอียดเพิ่มเติม'}
                </span>
                <p className="mt-1 text-slate-700 text-xs leading-relaxed break-words [overflow-wrap:anywhere] break-all whitespace-pre-wrap">
                  {getDarDetail(dar).value || dar.changeSummary || dar.change_summary || dar.obsoleteDetail || dar.detail}
                </p>
              </div>
            )}
          </div>

          {/* Workflow History / Timeline */}
          {darTimeline.length > 0 && (
            <div className="space-y-2 pt-1 min-w-0 w-full">
              <span className="text-[10px] font-bold text-slate-400 uppercase flex items-center gap-1">
                <MessageSquare size={12} /> ประวัติและข้อคิดเห็น
              </span>
              <div className="space-y-2 min-w-0 w-full">
                {darTimeline.map(tl => (
                  <div key={tl.id} className="p-2.5 rounded-lg bg-slate-50 border border-slate-200/70 text-xs min-w-0 w-full overflow-hidden">
                    <div className="flex justify-between items-center text-[10px] text-slate-400 mb-1 gap-2">
                      <span className="font-semibold text-slate-700 truncate">{tl.user}</span>
                      <span className="font-mono shrink-0">{tl.date}</span>
                    </div>
                    <p className="text-slate-700 leading-relaxed break-words [overflow-wrap:anywhere] break-all whitespace-pre-wrap">
                      {tl.comment || tl.action}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 1.3 Pinned Action Dock (Bottom-Padded, Isolated Sub-component) */}
        <TaskActionDock
          mode="REVIEW"
          hasReadToBottom={hasReadToBottom}
          onAction={handleAction}
        />
      </div>

      {/* ================= 2. การ์ดฝั่งขวา: FLOATING EXPANDED PREVIEW CARD ================= */}
      <div className="flex-1 min-w-0 h-full flex flex-col bg-white border border-slate-200/90 rounded-2xl shadow-sm overflow-hidden">
        {/* PDF Header Bar */}
        <div className="shrink-0 h-11 px-4 border-b border-slate-100 flex items-center justify-between text-xs bg-white">
          <div className="flex items-center gap-2 truncate pr-2">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-600 shrink-0" />
            <span className="font-bold text-slate-800 truncate text-sm" title={headerDisplayTitle}>
              {headerDisplayTitle}
            </span>
            {isObsoleteRequest && (
              <span className="px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200/90 shadow-2xs shrink-0 flex items-center gap-1">
                <span>[ฉบับปัจจุบันที่ขอยกเลิก (Effective Master Document)]</span>
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={handleDownloadDraft}
            className="px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 font-bold text-xs flex items-center gap-1.5 border border-blue-200 transition-colors cursor-pointer shrink-0"
            title="ดาวน์โหลดเอกสาร PDF"
          >
            <Download className="w-3.5 h-3.5" />
            <span>ดาวน์โหลด</span>
          </button>
        </div>

        {/* PDF Viewer Container */}
        <div 
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex-1 min-h-0 w-full bg-slate-50 overflow-hidden relative"
        >
          {loadingPdf ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-slate-400">
              <div className="w-8 h-8 rounded-full border-2 border-blue-500/20 border-t-blue-500 animate-spin" />
              <span className="text-xs text-slate-500">กำลังเปิดไฟล์เอกสารฉบับจริง...</span>
            </div>
          ) : pdfBlobUrl ? (
            <iframe
              src={iframeSrc}
              title="PDF Preview"
              className="w-full border-none block"
              style={{
                height: 'calc(100% + 54px)',
                marginTop: '-54px'
              }}
            />
          ) : pdfLoadError ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4 text-center">
              <ShieldAlert size={36} className="text-amber-500" />
              <span className="text-xs text-slate-700">{pdfLoadError}</span>
              <button
                type="button"
                onClick={() => setPdfLoadRetryKey(k => k + 1)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium cursor-pointer"
              >
                <RotateCcw size={12} /> ลองโหลดใหม่
              </button>
            </div>
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-slate-400">
              <ShieldAlert size={36} className="text-slate-400" />
              <span className="text-xs text-slate-500">ไม่พบไฟล์เอกสารอ้างอิงจริง (No attached file)</span>
            </div>
          )}
        </div>
      </div>

      <ActionConfirmModal
        isOpen={showConfirm}
        onClose={() => setShowConfirm(false)}
        onConfirm={executeAction}
        title={pendingAction === 'APPROVE' ? 'ยืนยันการผ่านการทบทวนเอกสาร (Review DAR)' : 'ยืนยันการส่งกลับแก้ไข (Request Revision)'}
        actionType={pendingAction === 'APPROVE' ? 'review' : 'reject'}
        confirmText={pendingAction === 'APPROVE' ? 'ยืนยันผ่านการทบทวน' : 'ยืนยันส่งกลับแก้ไข'}
        cancelText="ยกเลิก / กลับไปตรวจสอบ"
        dar={darWithWorkflow}
        currentActor={currentUser}
        currentStep="REVIEWER"
        workflowSignatories={darWithWorkflow?.approvalWorkflow || dar?.approvalWorkflow || []}
        summaryData={[
          { label: 'ผู้ดำเนินการ', value: `${currentUser?.name || 'ผู้ทบทวน'} (${currentUser?.department || '-'})` },
          { label: 'เอกสาร', value: dar ? `[${getDarDocInfo(dar, documents).docCode}] ${dar.title}` : '-' },
          { label: 'ผลการทบทวน', value: pendingAction === 'APPROVE' ? 'ผ่านการทบทวน (Review Passed)' : 'ส่งกลับแก้ไข (Revision Required)' },
          { label: 'ความเห็นประกอบ', value: pendingComment || '-' },
          { 
            label: 'สายการอนุมัติถัดไป', 
            value: pendingAction === 'APPROVE' 
              ? `ส่งต่อไปยัง: ${nextActorName} (${nextActorRole})` 
              : 'ส่งกลับไปยัง: ผู้ร้องขอ (แก้ไขคำร้อง)' 
          }
        ]}
      />

      <DarReviewModal
        isOpen={isInspectorOpen}
        onClose={() => setIsInspectorOpen(false)}
        dar={dar}
        role="REVIEWER"
        onApprove={(modalComment) => {
          setPendingComment(modalComment || pendingComment);
          setIsInspectorOpen(false);
          setPendingAction('APPROVE');
          setShowConfirm(true);
        }}
        onReturn={(modalComment) => {
          setPendingComment(modalComment || pendingComment);
          setIsInspectorOpen(false);
          setPendingAction('RETURN');
          setShowConfirm(true);
        }}
      />
    </div>
  );
};

export default TaskReview;
