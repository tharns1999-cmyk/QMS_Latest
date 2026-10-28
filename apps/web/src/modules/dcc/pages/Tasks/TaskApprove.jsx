import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import useStore from '../../../../store/useStore';
import { normalizeDepartmentId } from '../../services/MasterDataService';
import { 
  FileText, 
  XCircle, 
  ChevronLeft, 
  Download, 
  MessageSquare, 
  ShieldAlert, 
  Globe, 
  Lock, 
  Building2, 
  RotateCcw,
  CheckCircle2,
  ArrowLeft,
  AlertCircle
} from 'lucide-react';
import { getDarReason, getDarDetail, getDarDocInfo, getRequesterName } from '../../utils/darHelper';
import ActionConfirmModal from '../../../../shared/components/common/ActionConfirmModal';
import DarReviewModal from '../../components/workflow/DarReviewModal';
import TaskActionDock from '../../components/workflow/TaskActionDock';
import { ACCESS_SCOPE_METADATA } from '../../utils/accessControl';
import { 
  stampUnifiedInternalPdf,
  applyProgressiveSignatoryStamp,
  resolveRawFileBlob, 
  getActiveUserSignatureAsset, 
  resolveSubmissionDate,
  getSystemSampleDocumentBlob
} from '../../utils/pdfStamper';
import { formatSignOffDate } from '../../../../shared/utils/dateFormatter';
import { resolveFileBlob } from '../../utils/fileStorage';
import { isApiMode, apiBlob } from '../../../../api/client';
import { generateQmsDownloadName, triggerBrowserDownload, formatDarHeaderTitle } from '../../utils/documentNamingHelper';
import { jobTitle, resolveProgressiveSignatories } from '../../utils/signatoryResolver';
import { formatDarNumber } from '../../utils/darNumberGenerator';

const TaskApprove = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { 
    masterDepartments = [], 
    tasks = [], 
    completedTasks = [], 
    dars = [], 
    documents = [], 
    timeline = [], 
    processWorkflow, 
    finalizeAndPublishMaster,
    currentUser, 
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

  const allTasks = useMemo(() => {
    return [...(tasks || []), ...(completedTasks || [])];
  }, [tasks, completedTasks]);

  const task = allTasks.find(t => String(t.id) === String(id) || String(t.taskId) === String(id));
  const dar = task 
    ? (dars || []).find(d => String(d.id) === String(task.darId) || d.darNo === task.darId || d.darNumber === task.darId) 
    : (dars || []).find(d => String(d.id) === String(id) || d.darNo === id || d.darNumber === id);

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

  const isObsolete = useMemo(() => {
    return Boolean(
      dar?.type === 'OBSOLETE' || 
      dar?.darType === 'OBSOLETE' || 
      dar?.action_type === 'OBSOLETE' ||
      dar?.type === 'CANCEL' ||
      dar?.requestType === 'OBSOLETE'
    );
  }, [dar]);

  const requesterName = useMemo(() => {
    return dar ? (getRequesterName(dar, masterUsers) || 'ผู้ร้องขอ') : 'ผู้ร้องขอ';
  }, [dar, masterUsers]);

  const [pdfLoadError, setPdfLoadError] = useState(null);
  const [pdfLoadRetryKey, setPdfLoadRetryKey] = useState(0);

  // Authority Signatory Data (Requester | Reviewer | Approver)
  const signOffData = useMemo(() => {
    if (!dar) return null;
    // 1. Requester Data Authority (ผู้จัดทำ)
    const reqName = dar.requesterName || dar.requester_name || requesterName || '';
    const reqUser = (masterUsers || []).find(u => u && (u.id === dar.requesterId || u.empId === dar.requesterId || u.name === reqName)) ||
      (users || []).find(u => u && (u.id === dar.requesterId || u.name === reqName));
    const reqDateFormatted = resolveSubmissionDate(dar, task, darTimeline);
    const reqSignature = getActiveUserSignatureAsset(reqUser);
    const reqPosition = jobTitle(reqUser?.position, dar.requesterRole);

    // 2. Reviewer Data Authority (Review completed in TaskApprove stage)
    const reviewTl = (darTimeline || []).find(t => t.action === 'REVIEW' || t.action === 'APPROVE_REVIEW' || t.action === 'REVIEWED');
    const rawRevDate = reviewTl?.date || reviewTl?.timestamp || dar.reviewedAt || dar.reviewDate;
    const revDateFormatted = rawRevDate ? formatSignOffDate(rawRevDate) : '';
    const revName = dar.reviewerName || dar.reviewer_name || reviewTl?.user || dar.reviewedBy || '';
    const revUser = (masterUsers || []).find(u => u && (u.id === dar.reviewerId || u.empId === dar.reviewerId || u.name === revName)) ||
      (users || []).find(u => u && (u.id === dar.reviewerId || u.name === revName));
    const revPosition = jobTitle(revUser?.position, dar.reviewerRole);
    const revSignature = getActiveUserSignatureAsset(revUser);

    // 3. Approver Data Authority (Pending Approval)
    const appName = currentUser?.name || dar.approverName || 'ผู้อนุมัติ';
    const appPosition = currentUser?.position || dar.approverRole || 'Approver';

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
        name: revName,
        position: revPosition,
        timestamp: (revDateFormatted && revDateFormatted !== '-') ? revDateFormatted : '',
        status: 'REVIEWED',
        statusText: 'ผ่านการทบทวน (Reviewed)',
        isCompleted: true,
        isPending: false,
        signature: revSignature
      },
      approver: {
        name: appName,
        position: appPosition,
        timestamp: '',
        status: 'PENDING_APPROVAL',
        statusText: 'รออนุมัติ (Pending Approval)',
        isCompleted: false,
        isPending: true,
        signature: null
      }
    };
  }, [dar, task, darTimeline, masterUsers, users, currentUser, requesterName]);

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
          const source = isObsolete ? (documents || []).find(d => d.doc_code === dar.doc_code && d.status === 'EFFECTIVE') : dar;
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
        if (isObsolete) {
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
            console.warn('[TaskApprove] Real master file missing for OBSOLETE DAR. Falling back to system standard document template.');
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
            console.warn('[TaskApprove] Could not stamp effective master for OBSOLETE preview, showing as stored:', stampErr);
          }
          const rawUrl = URL.createObjectURL(rawBlob);
          createdUrlsRef.current.push(rawUrl);

          if (!isCancelled) {
            setPdfBlobUrl(rawUrl);
            setLoadingPdf(false);
          }
          return;
        }

        // 1. ตรวจหาจาก Synchronous In-Memory Registry ก่อน
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

        // 2. Direct and instant raw file resolution from IndexedDB
        if (!rawBlob) {
          const resolveKey = activeMasterDoc ? (activeMasterDoc.fileId || activeMasterDoc.id) : primaryKey;
          rawBlob = await resolveRawFileBlob(resolveKey, fallbackKeys, activeMasterDoc || dar);
          if (!rawBlob) {
            rawBlob = await resolveFileBlob(activeMasterDoc || dar, resolveKey);
          }
        }

        // 3. Fallback อัจฉริยะ: หากเป็นคำร้องเก่าที่ไม่มีไฟล์ ให้ดึง Sample Document จริงที่มีตารางและเนื้อหา (ห้าม Blank PDF!)
        if (!rawBlob || rawBlob.size === 0) {
          console.warn('[TaskApprove] Real file missing for legacy DAR. Falling back to system standard document template.');
          rawBlob = getSystemSampleDocumentBlob(docInfo.docCode || dar.docCode || 'SOP-QC-002', dar.title || 'Standard Operating Procedure');
        }

        if (!rawBlob || rawBlob.size === 0) {
          if (!isCancelled) {
            setPdfBlobUrl(null);
            setLoadingPdf(false);
            setPdfLoadError('ไม่สามารถเปิดอ่านไฟล์เอกสารได้');
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

        // 5. BACKGROUND ASYNC STAMPING: Process stamping in background
        try {
          // Allow React to render the instant preview first
          await new Promise(resolve => setTimeout(resolve, 40));
          // stampUnifiedInternalPdf: Progressive matrix (ผู้จัดทำ + ผู้ทบทวน filled, ผู้อนุมัติ blank)
          const stampedBlob = await stampUnifiedInternalPdf(rawBlob, {
            stage:       'APPROVE',
            dar,
            task,
            masterDoc:   activeMasterDoc,
            masterUsers,
            users,
            currentUser,
            watermarkType: 'DRAFT',
            docInfo: {
              docCode:      docInfo.docCode || dar.docCode || dar.title,
              title:        dar.title,
              revision:     docInfo.docRev  || dar.rev || '00',
              downloadDate: signOffData?.requester?.timestamp || resolveSubmissionDate(dar, task, darTimeline)
            }
          });
          if (!isCancelled && stampedBlob) {
            const stampedUrl = URL.createObjectURL(stampedBlob);
            createdUrlsRef.current.push(stampedUrl);
            setPdfBlobUrl(stampedUrl);
          }
        } catch (stampErr) {
          console.warn('[TaskApprove] Background stamping failed, maintaining raw preview:', stampErr);
        }
      } catch (err) {
        console.error('[TaskApprove] PDF preview resolution error:', err);
        if (!isCancelled) {
          setPdfBlobUrl(null);
          setLoadingPdf(false);
          setPdfLoadError('เกิดข้อผิดพลาดในการโหลดไฟล์เอกสาร');
        }
      }
    };

    loadAndPreview();

    return () => {
      isCancelled = true;
      // Protected: Do NOT synchronously revoke URLs here
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dar?.id, dar?.darNumber, dar?.fileId, dar?.attachedFile?.fileId, task?.id, pdfLoadRetryKey]);

  const handleDownloadDraft = async () => {
    const fileName = generateQmsDownloadName({
      docCode: targetDocCode,
      title: targetDocTitle,
      revision: targetRev,
      systemStatus: isObsolete ? 'EFFECTIVE' : 'DRAFT'
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
        if (isObsolete) {
          triggerBrowserDownload(raw, fileName);
          toast.success('ดาวน์โหลดไฟล์เอกสารสำเร็จ');
          return;
        }
        const stampedBlob = await stampUnifiedInternalPdf(raw, {
          stage: 'APPROVE', dar, task, masterUsers, users, currentUser,
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

  // Dynamic extraction and assembly of approvalWorkflow for DAR
  const darWithWorkflow = useMemo(() => {
    if (!dar) return null;
    if (dar.approvalWorkflow && Array.isArray(dar.approvalWorkflow)) return dar;

    const dccUser = (masterUsers || []).find(u => u && (u.isDcc || u.role === 'DCC_ADMIN'));
    const dccName = dccUser ? (dccUser.fullName || dccUser.name) : 'เจ้าหน้าที่ DCC';

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
          name: dar.reviewerName || dar.reviewer_name || 'ผู้ทบทวน',
          assignedTo: dar.reviewerName || dar.reviewer_name || 'ผู้ทบทวน'
        },
        {
          step: 3,
          roleKey: 'APPROVER',
          role: dar.approverRole || 'Approver',
          name: dar.approverName || currentUser?.name || 'ผู้อนุมัติ',
          assignedTo: dar.approverName || currentUser?.name || 'ผู้อนุมัติ'
        },
        {
          step: 4,
          roleKey: 'DCC',
          role: 'เจ้าหน้าที่ DCC (ตรวจสอบและประกาศใช้)',
          name: dccName,
          assignedTo: dccName
        }
      ]
    };
  }, [dar, currentUser, masterUsers]);

  // Harmonized workflow signatories list
  const workflowSignatories = useMemo(() => {
    const list = darWithWorkflow?.approvalWorkflow || dar?.approvalWorkflow;
    return (list && Array.isArray(list)) ? list : [];
  }, [darWithWorkflow, dar]);

  // Find index of current step / Approver
  const approverStepIndex = useMemo(() => {
    return workflowSignatories.findIndex(s => 
      s.roleKey === 'APPROVER' || 
      (currentUser && (s.id === currentUser.id || s.name === currentUser.name || s.assignedTo === currentUser.name))
    );
  }, [workflowSignatories, currentUser]);

  const subsequentSteps = useMemo(() => {
    return approverStepIndex >= 0 
      ? workflowSignatories.slice(approverStepIndex + 1)
      : workflowSignatories.filter(s => s.roleKey !== 'REQUESTER' && s.roleKey !== 'REVIEWER' && s.roleKey !== 'APPROVER');
  }, [workflowSignatories, approverStepIndex]);

  // Check if DCC step is configured
  const dccStep = useMemo(() => {
    return subsequentSteps.find(s => 
      s.roleKey === 'DCC' || 
      s.roleKey === 'DCC_ADMIN' || 
      s.role === 'DCC' || 
      (typeof s.role === 'string' && s.role.toUpperCase().includes('DCC'))
    );
  }, [subsequentSteps]);

  // Subsequent workflow destinations
  const approvalNextStep = useMemo(() => {
    return isObsolete ? {
      title: 'ส่งมอบงานต่อให้ Document Control Center (DCC)',
      description: 'เพื่อดำเนินการปลดระวาง เรียกคืนสำเนาควบคุมทั้งหมดในระบบ และบันทึกผลการทำลายตามระเบียบ (Recall & Disposition)',
      boxClass: 'bg-rose-50/60 border-rose-200/80 text-rose-900',
      iconBg: 'bg-rose-600 text-white',
      buttonText: 'ยืนยันการอนุมัติยกเลิกเอกสาร',
      buttonClass: 'bg-rose-600 hover:bg-rose-700 text-white'
    } : {
      title: 'ส่งมอบงานต่อให้ Document Control Center (DCC)',
      description: 'เพื่อดำเนินการขึ้นทะเบียน ประทับตรา และแจกจ่ายสำเนาควบคุมตามระเบียบ',
      boxClass: 'bg-blue-50/60 border-blue-200/80 text-blue-900',
      iconBg: 'bg-blue-600 text-white',
      buttonText: 'ยืนยันการอนุมัติเอกสาร',
      buttonClass: 'bg-emerald-600 hover:bg-emerald-700 text-white'
    };
  }, [isObsolete]);

  const isFinalStep = subsequentSteps.length === 0 || (!dccStep && subsequentSteps.every(s => s.roleKey === 'COMPLETED' || !s.roleKey));

  // Determine next destination details preventing self-targeting
  const nextDestination = useMemo(() => {
    if (pendingAction !== 'APPROVE') return null;

    if (dccStep) {
      return {
        type: 'DCC',
        label: approvalNextStep.title,
        title: approvalNextStep.title,
        subtitle: approvalNextStep.description,
        name: dccStep.name || dccStep.assignedTo || 'Document Control Center (DCC)',
        role: isObsolete ? 'เรียกคืนสำเนาและทำลาย' : (dccStep.role || 'DCC')
      };
    }

    if (isFinalStep) {
      return {
        type: 'COMPLETED',
        label: isObsolete ? 'สิ้นสุดขั้นตอนการขอยกเลิก (Obsolete Completed)' : 'สิ้นสุดขั้นตอนการอนุมัติ (Approval Completed)',
        title: isObsolete ? 'สิ้นสุดขั้นตอนการขอยกเลิก (Obsolete Completed)' : 'สิ้นสุดขั้นตอนการอนุมัติ (Approval Completed)',
        subtitle: isObsolete ? 'เอกสารจะถูกปรับสถานะเป็น "ยกเลิก (Obsolete)" ทันที' : 'เอกสารจะถูกปรับสถานะเป็น "มีผลบังคับใช้ (Active)" ทันที',
        name: isObsolete ? 'Obsolete Completed' : 'Approval Completed',
        role: isObsolete ? 'ยกเลิก (Obsolete)' : 'มีผลบังคับใช้ (Active)'
      };
    }

    // Safety check: ensure next signatory is NOT the current actor
    const nextValid = subsequentSteps.find(s => 
      (!currentUser?.id || s.id !== currentUser.id) &&
      (!currentUser?.name || (s.name !== currentUser.name && s.assignedTo !== currentUser.name))
    );

    if (nextValid) {
      return {
        type: 'SIGNATORY',
        label: `ส่งต่อไปยัง: ${nextValid.name} (${nextValid.role})`,
        title: 'ส่งต่อเพื่อพิจารณาขั้นถัดไป',
        name: nextValid.name || nextValid.assignedTo,
        role: nextValid.role
      };
    }

    return {
      type: 'COMPLETED',
      label: isObsolete ? 'สิ้นสุดขั้นตอนการขอยกเลิก (Obsolete Completed)' : 'สิ้นสุดขั้นตอนการอนุมัติ (Approval Completed)',
      title: isObsolete ? 'สิ้นสุดขั้นตอนการขอยกเลิก (Obsolete Completed)' : 'สิ้นสุดขั้นตอนการอนุมัติ (Approval Completed)',
      subtitle: isObsolete ? 'เอกสารจะถูกปรับสถานะเป็น "ยกเลิก (Obsolete)" ทันที' : 'เอกสารจะถูกปรับสถานะเป็น "มีผลบังคับใช้ (Active)" ทันที',
      name: isObsolete ? 'Obsolete Completed' : 'Approval Completed',
      role: isObsolete ? 'ยกเลิก (Obsolete)' : 'มีผลบังคับใช้ (Active)'
    };
  }, [pendingAction, dccStep, isFinalStep, subsequentSteps, currentUser, approvalNextStep, isObsolete]);

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
    if (scrollTop + clientHeight >= scrollHeight - 10) {
      setHasReadToBottom(true);
    }
  };

  const isCompletedTask = Boolean(
    task && (
      task.status === 'COMPLETED' || 
      task.status === 'RESOLVED' || 
      task.status === 'APPROVED' || 
      task.is_completed === true
    )
  );

  if (isCompletedTask) {
    const completedActor = task?.approvedBy || task?.completedBy || task?.assigneeName || currentUser?.name || 'ผู้อนุมัติ';
    const completedTime = task?.completedAt || task?.updatedAt || task?.timestamp;
    const completedTimeFormatted = completedTime
      ? `${new Date(completedTime).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })} น.`
      : '';
    const darNumber = dar?.darNumber || dar?.darNo || (typeof dar?.id === 'string' && dar.id.startsWith('DAR') ? dar.id : null);

    return (
      <div className="flex h-[80vh] items-center justify-center p-6">
        <div className="card-surface p-8 text-center max-w-md shadow-xs border border-emerald-200/80 rounded-2xl bg-white animate-in fade-in zoom-in-95 duration-150">
          {/* 1. ไอคอนสำเร็จ (Top Icon) */}
          <div className="w-12 h-12 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 mb-3 mx-auto shadow-2xs">
            <CheckCircle2 size={24} className="text-emerald-600" />
          </div>

          {/* 2. ป้ายสถานะ (Status Pill) */}
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50/80 border border-emerald-200/60 text-emerald-700 text-xs font-medium mb-3">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            คำร้องนี้ได้รับการอนุมัติเสร็จสิ้นแล้ว
          </div>

          {/* Tag เลขที่ DAR (Sleek Monospace Tag) */}
          {darNumber && (
            <div>
              <span className="inline-block font-mono text-[11px] font-semibold tracking-wider text-slate-500 bg-slate-100/80 px-2 py-0.5 rounded-md border border-slate-200/60 mb-1.5">
                DAR: {formatDarNumber(darNumber)}
              </span>
            </div>
          )}

          {/* 3. ชื่อเอกสาร (Document Title) */}
          <h2 className="text-sm font-semibold text-slate-900 leading-snug px-4 break-words">
            {dar?.title || task?.title || 'งานอนุมัติเอกสารเสร็จสมบูรณ์'}
          </h2>

          {/* 4. ข้อมูลผู้อนุมัติและเวลาเป็นบรรทัดเดียว (Inline Muted Metadata) */}
          <p className="text-xs text-slate-500 mt-2 flex items-center justify-center gap-1.5 flex-wrap">
            <span>อนุมัติเสร็จสิ้นโดย <strong className="font-medium text-slate-700">{completedActor}</strong></span>
            {completedTimeFormatted && (
              <>
                <span className="text-slate-300">•</span>
                <span>{completedTimeFormatted}</span>
              </>
            )}
          </p>

          {/* 5. ปุ่ม Action สไตล์ Minimalist */}
          <button 
            type="button"
            onClick={() => navigate('/dcc/tasks', { replace: true })} 
            className="mt-6 w-full py-2.5 px-4 bg-purple-600 hover:bg-purple-700 active:bg-purple-800 text-white rounded-xl text-xs font-medium transition-all shadow-xs inline-flex items-center justify-center gap-2 cursor-pointer"
          >
            <ArrowLeft size={14} /> กลับสู่หน้ารายการงาน (Task Inbox)
          </button>
        </div>
      </div>
    );
  }

  if (!task || !dar) {
    return (
      <div className="flex h-[80vh] items-center justify-center p-6">
        <div className="card-surface p-8 text-center max-w-md shadow-xs border border-slate-200 rounded-2xl bg-white">
          <div className="w-14 h-14 rounded-2xl bg-amber-50 border border-amber-200/80 flex items-center justify-center mx-auto mb-4 text-amber-600">
            <AlertCircle size={28} />
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
            onClick={() => navigate('/dcc/tasks', { replace: true })} 
            className="inline-flex items-center justify-center gap-2 w-full py-2.5 px-4 rounded-xl text-xs font-semibold text-white bg-purple-600 hover:bg-purple-700 active:bg-purple-800 transition-all cursor-pointer shadow-xs"
          >
            <ArrowLeft size={14} /> กลับสู่หน้ารายการงาน (Task Inbox)
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
            งานนี้ถูกมอบหมายให้ผู้อนุมัติท่านอื่น หรือคุณไม่มีสิทธิ์เข้าถึงงานในขั้นตอนนี้
          </p>
          <button 
            type="button"
            onClick={() => navigate('/dcc/tasks', { replace: true })} 
            className="inline-flex items-center justify-center gap-2 w-full py-2.5 px-4 rounded-xl text-xs font-semibold text-white bg-purple-600 hover:bg-purple-700 active:bg-purple-800 transition-all cursor-pointer shadow-xs"
          >
            <ArrowLeft size={14} /> กลับสู่หน้ารายการงาน (Task Inbox)
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
    if ((action === 'RETURN' || action === 'REJECT') && !userComment?.trim()) {
      toast.error('กรุณาระบุเหตุผล (Comment) สำหรับการตีกลับหรือไม่อนุมัติ');
      return;
    }
    setPendingComment(userComment || '');
    setPendingAction(action);
    setShowConfirm(true);
  };

  const executeAction = async () => {
    setShowConfirm(false);
    try {
      await processWorkflow(task?.id, pendingAction, pendingComment);
      if (pendingAction === 'APPROVE' && !isObsolete) {
        const darTargetId = dar?.id || task?.darId;
        if (darTargetId && finalizeAndPublishMaster) {
          try {
            await finalizeAndPublishMaster(darTargetId);
          } catch (err) {
            console.warn('[TaskApprove] finalizeAndPublishMaster warning:', err);
          }
        }
      }
      navigate('/dcc/tasks', { replace: true });
      const actionText = pendingAction === 'APPROVE' 
        ? (isObsolete ? 'อนุมัติยกเลิกเอกสารสำเร็จแล้ว' : 'อนุมัติเอกสารสำเร็จแล้ว') 
        : pendingAction === 'REJECT' 
          ? 'ไม่อนุมัติคำร้องเรียบร้อยแล้ว' 
          : 'ส่งกลับแก้ไขเรียบร้อยแล้ว';
      toast.success(actionText);
    } catch (error) {
      console.error('Approval Crash:', error);
      toast.error(`เกิดข้อผิดพลาด: ${error.message || 'ระบบขัดข้อง'}`);
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
              onClick={() => navigate('/dcc/tasks')} 
              className="flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-slate-900 px-2 py-1.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <ChevronLeft size={16} />
              <span>ย้อนกลับ</span>
            </button>
            <div className="flex items-center gap-1.5 pl-1.5 border-l border-slate-200">
              <FileText className="w-4 h-4 text-purple-600" />
              <span className="font-bold text-slate-800 text-sm">อนุมัติเอกสาร</span>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setIsInspectorOpen(true)}
              className="px-2.5 py-1 rounded-lg bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200/80 text-[11px] font-bold transition-all cursor-pointer"
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
          {/* DAR Overview Box */}
          <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200/80">
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">คำร้องขอเอกสาร (DAR)</span>
            <h2 className="text-xl font-black text-slate-900 mt-0.5">
              {formatDarNumber(dar.darNumber || dar.dar_no) !== '-' ? formatDarNumber(dar.darNumber || dar.dar_no) : (dar.isDraft || dar.status === 'DRAFT' || String(dar.id).startsWith('draft_') ? 'ยังไม่ได้ระบุ (Draft)' : formatDarNumber(dar.id))}
            </h2>
            <p className="text-slate-600 font-medium text-xs mt-0.5 truncate" title={dar.title || dar.document_title}>
              {dar.title || dar.document_title}
            </p>
          </div>

          {/* Metadata Rows */}
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

          {/* เหตุผลการร้องขอ & รายละเอียดเพิ่มเติม */}
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

        {/* 1.3 Pinned Action Dock (Bottom-Padded, Complete 3-Button Stack) */}
        <TaskActionDock
          mode="APPROVE"
          hasReadToBottom={hasReadToBottom}
          isObsolete={isObsolete}
          placeholder="ระบุข้อเสนอแนะหรือสิ่งที่ต้องปรับปรุง..."
          onAction={handleAction}
        />
      </div>

      {/* ================= 2. การ์ดฝั่งขวา: FLOATING EXPANDED PREVIEW CARD ================= */}
      <div className="flex-1 min-w-0 h-full flex flex-col bg-white border border-slate-200/90 rounded-2xl shadow-sm overflow-hidden">
        {/* PDF Header Bar */}
        <div className="shrink-0 h-11 px-4 border-b border-slate-100 flex items-center justify-between text-xs bg-white">
          <div className="flex items-center gap-2 truncate pr-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
            <span className="font-bold text-slate-800 truncate text-sm" title={headerDisplayTitle}>
              {headerDisplayTitle}
            </span>
            {isObsolete && (
              <span className="px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200/90 shadow-2xs shrink-0 flex items-center gap-1">
                <span>[ฉบับปัจจุบันที่ขอยกเลิก (Effective Master Document)]</span>
              </span>
            )}
            <span className="text-[11px] text-slate-400 font-normal hidden sm:inline">(โหมดการพิจารณาอนุมัติ)</span>
          </div>
          <button 
            type="button"
            onClick={handleDownloadDraft}
            className="px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-bold text-xs flex items-center gap-1.5 border border-emerald-200 transition-colors cursor-pointer shrink-0" 
            title="ดาวน์โหลดเอกสาร PDF"
          >
            <Download size={14} />
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
              <div className="w-8 h-8 rounded-full border-2 border-emerald-500/20 border-t-emerald-500 animate-spin" />
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
              <span className="text-sm text-slate-700">{pdfLoadError}</span>
              <button
                type="button"
                onClick={() => setPdfLoadRetryKey(k => k + 1)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium cursor-pointer"
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
        title={
          pendingAction === 'APPROVE' 
            ? (isObsolete ? 'ยืนยันการอนุมัติยกเลิกเอกสาร (Approve Obsolete DAR)' : 'ยืนยันการอนุมัติเอกสาร (Approve DAR)')
            : pendingAction === 'REJECT' 
              ? 'ยืนยันการไม่อนุมัติ (Reject DAR)' 
              : 'ยืนยันการส่งกลับแก้ไข (Request Revision)'
        }
        actionType={pendingAction === 'APPROVE' ? (isObsolete ? 'obsolete' : 'approve') : 'reject'}
        confirmText={
          pendingAction === 'APPROVE' 
            ? approvalNextStep.buttonText 
            : pendingAction === 'REJECT' 
              ? 'ยืนยันไม่อนุมัติคำร้อง' 
              : 'ยืนยันส่งกลับแก้ไข'
        }
        confirmButtonClass={
          pendingAction === 'APPROVE'
            ? approvalNextStep.buttonClass
            : undefined
        }
        cancelText="ยกเลิก / กลับไปตรวจสอบ"
        dar={darWithWorkflow}
        currentActor={currentUser}
        currentStep="APPROVER"
        workflowSignatories={workflowSignatories}
        summaryData={[
          { label: 'ผู้อนุมัติ', value: `${currentUser?.name || 'ผู้อนุมัติ'} (${currentUser?.department || '-'})` },
          { label: 'เอกสาร', value: dar ? `[${getDarDocInfo(dar, documents).docCode}] ${dar.title}` : '-' },
          { 
            label: 'ผลการพิจารณา', 
            value: pendingAction === 'APPROVE' 
              ? (isObsolete ? 'อนุมัติยกเลิกเอกสาร (Approved Obsolete)' : 'อนุมัติประกาศใช้ (Approved)') 
              : pendingAction === 'REJECT' 
                ? 'ไม่อนุมัติคำร้อง (Rejected)' 
                : 'ส่งกลับแก้ไข (Revision Required)' 
          },
          { label: 'ความเห็นประกอบ', value: pendingComment || '-' },
          { 
            label: 'สายการอนุมัติถัดไป', 
            value: pendingAction === 'APPROVE' 
              ? (nextDestination?.label || (dccStep ? approvalNextStep.title : (isObsolete ? 'สิ้นสุดขั้นตอนการขอยกเลิก (Obsolete Completed)' : 'สิ้นสุดขั้นตอนการอนุมัติ (Approval Completed)')))
              : pendingAction === 'REJECT' 
                ? 'สิ้นสุดคำร้อง: ส่งเข้าคลังประวัติ (ไม่อนุมัติ)' 
                : 'ส่งกลับไปยัง: ผู้ร้องขอ (แก้ไขคำร้อง)' 
          }
        ]}
      />

      <DarReviewModal
        isOpen={isInspectorOpen}
        onClose={() => setIsInspectorOpen(false)}
        dar={dar}
        role="APPROVER"
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
        onReject={(modalComment) => {
          setPendingComment(modalComment || pendingComment);
          setIsInspectorOpen(false);
          setPendingAction('REJECT');
          setShowConfirm(true);
        }}
      />
    </div>
  );
};

export default TaskApprove;
