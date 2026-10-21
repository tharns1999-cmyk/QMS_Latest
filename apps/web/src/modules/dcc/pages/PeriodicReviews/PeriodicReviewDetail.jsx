import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { ArrowLeft, ShieldAlert } from 'lucide-react';
import toast from 'react-hot-toast';
import useStore, { canFastTrackReview, canFastTrackExternalReview } from '../../../../store/useStore';
import { getPeriodicReviewForUser, canPerformPeriodicReview, getPositionLevelForDepartment } from '../../services/PeriodicReviewAccessService';
import { getDocCode, getCleanDept } from '../../utils/domainNormalizer';
import DocumentDigest, { getCycleLabel, getCycleMonths } from './DocumentDigest';
import ReviewDecisionForm from './ReviewDecisionForm';
import { PendingReviewPanel, EvaluatedReviewPanel } from './ReviewStatusPanels';
import { resolveReviewContext, normalizeReviewUser } from './resolveReviewContext';
import { getDetailStatusLabel } from './reviewDetailStatus';
import DocumentDetailModal from '../../components/workflow/DocumentDetailModal';
import ExternalDocDetailModal from '../ExternalDocs/ExternalDocDetailModal';
import { isApiMode } from '../../../../api/client';
import { submitReviewToApi, decideReviewOnApi } from '../../../../api/reviews';

const PeriodicReviewDetail = () => {
  const { reviewId, docCode, id: routeParamId } = useParams();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const taskId = searchParams.get('taskId');
  const navigate = useNavigate();
  const periodicReviewSchedules = useStore(state => state.periodicReviewSchedules);
  const tasks = useStore(state => state.tasks);
  const documents = useStore(state => state.documents);
  const approvalMatrix = useStore(state => state.approvalMatrix);
  const externalDocuments = useStore(state => state.externalDocuments);
  const dars = useStore(state => state.dars);
  const currentUser = useStore(state => state.currentUser);
  const submitPeriodicReview = useStore(state => state.submitPeriodicReview);
  const simulatedSystemDate = useStore(state => state.simulatedSystemDate);
  const getEffectiveToday = useStore(state => state.getEffectiveToday);
  
  const effectiveToday = getEffectiveToday ? getEffectiveToday() : (simulatedSystemDate ? new Date(simulatedSystemDate) : new Date());

  const { paramId, resolvedDoc, synthesizedSchedule, schedulesForLookup } = resolveReviewContext({
    reviewId, docCode, routeParamId, searchParams, location, taskId, tasks,
    periodicReviewSchedules, documents, externalDocuments
  });
  const allDocs = [
    ...(documents || []),
    ...(externalDocuments || []),
    ...(resolvedDoc ? [resolvedDoc] : [])
  ];

  const normalizedUser = normalizeReviewUser(currentUser);

  const effectiveLookupId = synthesizedSchedule ? synthesizedSchedule.id : paramId;
  
  const accessCheck = getPeriodicReviewForUser(effectiveLookupId, normalizedUser, schedulesForLookup, allDocs, effectiveToday);
  
  const [outcome, setOutcome] = useState('');
  const [comment, setComment] = useState('');
  const [findings, setFindings] = useState('');
  const [standards, setStandards] = useState('');
  const [references, setReferences] = useState('');
  const [additionalComments, setAdditionalComments] = useState('');
  const [isDocModalOpen, setIsDocModalOpen] = useState(false);
  const hasIncomingReEvaluate = Boolean(
    location.state?.isReEvaluating ||
    location.state?.reEvaluate ||
    searchParams.get('isReEvaluating') === 'true' ||
    searchParams.get('reEvaluate') === 'true'
  );
  const [isReEvaluating, setIsReEvaluating] = useState(hasIncomingReEvaluate);

  const scheduleData = accessCheck?.data || {};
  const schedule = synthesizedSchedule ? { ...synthesizedSchedule, ...scheduleData } : scheduleData;
  
  const linkedDar = schedule?.linkedActionId ? (dars || []).find(d => d.id === schedule.linkedActionId) : null;
  const linkedDarStatus = linkedDar && useStore.getState()?.getLinkedActionStatus
    ? useStore.getState().getLinkedActionStatus(linkedDar.status)
    : null;
  
  const targetDoc = accessCheck?.document || resolvedDoc || allDocs.find(d => 
    (schedule?.documentId && d.id === schedule.documentId) || 
    (schedule?.externalDocumentId && d.id === schedule.externalDocumentId) ||
    (schedule?.documentNumber && (d.documentNumber === schedule.documentNumber || d.code === schedule.documentNumber || d.docCode === schedule.documentNumber))
  );

  const doc = targetDoc;
  const effectiveDocCode = schedule?.documentNumber || schedule?.docCode || getDocCode(doc) || docCode || reviewId || '';
  const isExternal = Boolean(
    schedule?.documentCategory === 'EXTERNAL' ||
    schedule?.isExternal ||
    schedule?.externalDocumentId ||
    doc?.is_external ||
    doc?.external ||
    doc?.isExternal ||
    doc?.doc_type === 'EXTERNAL' ||
    doc?.edCode ||
    String(effectiveDocCode).toUpperCase().startsWith('ED-') ||
    location.state?.isExternal
  );

  const docDept = getCleanDept(schedule?.ownerDepartmentId || targetDoc, 'DC');
  const isFastTrack = canFastTrackReview(currentUser, docDept, effectiveDocCode, approvalMatrix);

  const userPositionLevel = getPositionLevelForDepartment(normalizedUser, docDept) || Number(currentUser?.level || currentUser?.approval_level || 0);
  const isDeptManagerOrSupervisor = 
    userPositionLevel >= 4 ||
    ['HOD', 'MANAGER', 'DEPT_HEAD', 'SUPERVISOR', 'DEPT_SUPERVISOR', 'ADMIN', 'SUPER_ADMIN', 'DCC'].includes(currentUser?.role) ||
    Boolean(currentUser?.is_hod || currentUser?.is_manager || currentUser?.isDeptHead || currentUser?.isDcc || currentUser?.is_dcc);

  const canPerform = canPerformPeriodicReview(normalizedUser, schedule, targetDoc) || isDeptManagerOrSupervisor;
  // Same rule the store enforces on approve: approval-matrix level of the owner dept (or DCC/QMR), never the submitter.
  const submitterId = schedule?.pendingReview?.reviewer_id || doc?.pending_periodic_review?.reviewer_id;
  const canApproveReview = (isExternal
    ? canFastTrackExternalReview(currentUser, docDept, 'ED', approvalMatrix)
    : canFastTrackReview(currentUser, docDept, effectiveDocCode, approvalMatrix)) &&
    !(submitterId && String(submitterId) === String(currentUser?.id));

  const effectiveOutcome = schedule?.outcome || schedule?.pendingReview?.outcome || doc?.pending_periodic_review?.outcome || schedule?.reviewDetails?.outcome || '';

  const isPendingApproval = !isReEvaluating && Boolean(
    schedule?.status === 'PENDING_APPROVAL' || 
    targetDoc?.review_status === 'PENDING_APPROVAL' ||
    schedule?.pendingApprovalTaskId
  );

  const isEvaluated = !isReEvaluating && !isPendingApproval && Boolean(
    schedule?.status === 'COMPLETED' || 
    schedule?.status === 'COMPLETED_WITH_REVISION' ||
    schedule?.status === 'COMPLETED_WITH_OBSOLETE' ||
    ((schedule?.status === 'AWAITING_ACTION' || targetDoc?.review_status === 'AWAITING_ACTION') && effectiveOutcome) ||
    (schedule?.is_reviewed_this_cycle && (schedule?.status === 'COMPLETED' || targetDoc?.review_status === 'COMPLETED'))
  );

  const statusLabel = getDetailStatusLabel(schedule, targetDoc, effectiveOutcome, isPendingApproval, effectiveToday);

  const handleOpenDocModal = () => {
    if (targetDoc) {
      setIsDocModalOpen(true);
    } else {
      toast.error('ไม่พบข้อมูลเอกสารต้นทาง');
    }
  };

  const handleStartReReview = () => {
    if (typeof useStore.getState().resetPendingReviewIntent === 'function') {
      useStore.getState().resetPendingReviewIntent(schedule?.externalDocumentId || doc?.id || effectiveDocCode);
    }
    setIsReEvaluating(true);
    const existingOutcome = effectiveOutcome || 'NO_CHANGE';
    setOutcome(existingOutcome);
    setComment(schedule?.comment || schedule?.reason || schedule?.pendingReview?.details?.comment || schedule?.pendingReview?.details?.reason || '');
    setFindings(schedule?.findings || schedule?.pendingReview?.details?.findings || '');
    setStandards(schedule?.standards || schedule?.standard_clause || schedule?.pendingReview?.details?.standards || '');
    setReferences(schedule?.references || schedule?.evidence_reference || schedule?.pendingReview?.details?.references || '');
    setAdditionalComments(schedule?.additionalComments || schedule?.additional_comment || schedule?.pendingReview?.details?.additional_comment || '');
  };

  const handleStartReReviewRef = useRef(handleStartReReview);
  useEffect(() => {
    handleStartReReviewRef.current = handleStartReReview;
  });

  useEffect(() => {
    if (hasIncomingReEvaluate && accessCheck.status === 'ALLOWED') {
      handleStartReReviewRef.current();
    }
  }, [hasIncomingReEvaluate, accessCheck.status]);

  if (accessCheck.status === 'NOT_FOUND') {
    return <div className="p-8 text-center text-[#666666]">ไม่พบเอกสารนี้ (Not Found)</div>;
  }
  
  if (accessCheck.status === 'ACCESS_DENIED') {
    return (
      <div className="p-8 max-w-2xl mx-auto mt-12">
        <div className="bg-red-50 border border-red-200 rounded-xl p-8 text-center">
          <ShieldAlert className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-red-700 mb-2">ไม่มีสิทธิ์เข้าถึงข้อมูลการทบทวนเอกสารนี้</h2>
          <p className="text-red-600">{accessCheck.message}</p>
          <button 
            onClick={() => navigate('/dcc/periodic-reviews')}
            className="mt-6 px-4 py-2 bg-white text-red-700 font-medium rounded-lg border border-red-200 hover:bg-red-100 transition-colors"
          >
            กลับสู่หน้าหลัก
          </button>
        </div>
      </div>
    );
  }

  const handleApproveReview = async () => {
    if (isApiMode) {
      if (await decideReviewOnApi({ docId: doc?.id || schedule.documentId || schedule.externalDocumentId, decision: 'APPROVE', comment: 'อนุมัติผลการทบทวน' })) {
        toast.success('อนุมัติผลการทบทวนเรียบร้อยแล้ว');
      }
      return;
    }
    const storeState = useStore.getState();
    const currentTasks = storeState.tasks || [];
    const approvalTask = currentTasks.find(t => 
      (t.type === 'PERIODIC_REVIEW_APPROVAL' || t.taskType === 'PERIODIC_REVIEW_APPROVAL') &&
      (
        t.id === taskId ||
        t.id === schedule.pendingApprovalTaskId ||
        t.id === doc?.pending_review_task_id ||
        t.scheduleId === schedule.id ||
        t.docId === (doc?.id || schedule.documentId || schedule.externalDocumentId) ||
        t.docCode === effectiveDocCode ||
        t.document_code === effectiveDocCode
      )
    );

    let targetTaskId = approvalTask?.id;
    if (!targetTaskId) {
      targetTaskId = `TASK-APPR-REV-${Date.now()}`;
      const syntheticTask = {
        id: targetTaskId,
        type: 'PERIODIC_REVIEW_APPROVAL',
        title: `อนุมัติผลการทบทวนเอกสาร: ${schedule.documentNumber || effectiveDocCode} (ไม่มีการเปลี่ยนแปลง)`,
        document_code: schedule.documentNumber || effectiveDocCode,
        document_title: schedule.documentName || doc?.title,
        docId: doc?.id || schedule.documentId || schedule.externalDocumentId,
        docCode: schedule.documentNumber || effectiveDocCode,
        revision: schedule.rev || '00',
        department: docDept,
        target_role: 'HOD',
        target_level: 5,
        status: 'PENDING',
        payload: schedule.pendingReview || doc?.pending_periodic_review || {
          doc_id: doc?.id || schedule.documentId || schedule.externalDocumentId,
          doc_code: effectiveDocCode,
          scheduleId: schedule.id,
          is_external: isExternal,
          reviewer_id: schedule.ownerUserId || currentUser?.id,
          reviewer_name: schedule.ownerUserId || currentUser?.name,
          reviewer_role: 'Staff',
          submitted_at: new Date().toISOString(),
          details: { comment: schedule.comment || 'ไม่มีการเปลี่ยนแปลง' }
        },
        scheduleId: schedule.id,
        created_at: new Date().toISOString()
      };
      useStore.setState({ tasks: [syntheticTask, ...currentTasks] });
    }

    useStore.getState().approvePeriodicReview({
      taskId: targetTaskId,
      approverUser: currentUser,
      remarks: 'อนุมัติผลการทบทวน'
    });

    toast.success('อนุมัติผลการทบทวนเรียบร้อยแล้ว (ขยายรอบ 1 ปี)');
  };

  const handleLinkedAction = (actionType, explicitDraftId) => {
    if (isExternal) {
      toast.success(
        actionType === 'REVISION'
          ? 'บันทึกผลการทบทวนแล้ว กำลังนำไปยังทะเบียนเอกสารภายนอกเพื่ออัปเดตเวอร์ชัน'
          : 'บันทึกผลการทบทวนแล้ว กำลังนำไปยังทะเบียนเอกสารภายนอกเพื่อยกเลิกเอกสาร'
      );
      const isRev = actionType === 'REVISION';
      navigate(`/dcc/external-docs?docCode=${encodeURIComponent(effectiveDocCode)}&${isRev ? 'autoOpenUpdate=true' : 'autoOpenObsolete=true'}`, {
        state: {
          openDocId: doc?.id || schedule.externalDocumentId,
          openDocCode: effectiveDocCode,
          fromPeriodicReview: true,
          reviewOutcome: actionType,
          autoOpenUpdate: isRev,
          autoOpenObsolete: !isRev
        }
      });
      return;
    }

    const draftId = explicitDraftId || schedule.linkedActionId;
    if (draftId) {
       const basePath = actionType === 'REVISION' ? '/dcc/dar/new/revision' : '/dcc/dar/new/obsolete';
       navigate(`${basePath}?draftId=${draftId}`);
       return;
    }
    
    const route = actionType === 'REVISION' ? '/dcc/dar/new/revision' : '/dcc/dar/new/obsolete';
    navigate(route, { state: { prefillDocId: schedule.documentId || schedule.externalDocumentId, prefillReviewId: schedule.id } });
  };

  const handleSubmit = async () => {
    if (!outcome) {
      toast.error('กรุณาเลือกผลการทบทวน');
      return;
    }
    if (comment.length < 5) {
      toast.error('กรุณาระบุเหตุผล/รายละเอียดการทบทวน');
      return;
    }

    if (isApiMode) {
      // The server records the review and decides who signs it; a revision or withdrawal then continues in its own request.
      const saved = await submitReviewToApi({
        docId: doc?.id || schedule.externalDocumentId || schedule.documentId,
        outcome,
        comment,
        details: { findings, standard_clause: standards, evidence_reference: references, additional_comment: additionalComments }
      });
      if (!saved) return;
      setIsReEvaluating(false);
      if (outcome === 'REVISION_REQUIRED' || outcome === 'OBSOLETE_REQUIRED') {
        toast.success('บันทึกผลการทบทวนเรียบร้อยแล้ว');
        handleLinkedAction(outcome === 'REVISION_REQUIRED' ? 'REVISION' : 'OBSOLETE');
      } else {
        // Say who it went to: the server picks the person the Approval Matrix allows, who may not be the submitter's own head.
        const approver = (useStore.getState().masterUsers || []).find((u) => u.id === saved.approver_id);
        toast.success(saved.status === 'COMPLETED' ? 'อนุมัติผลการทบทวนเรียบร้อยแล้ว (ขยายรอบการทบทวน)' : `ส่งผลการทบทวนไปยังผู้อนุมัติเรียบร้อยแล้ว: ${approver ? `${approver.name} (L${approver.approval_level})` : 'ผู้อนุมัติตาม Approval Matrix'}`, { duration: 7000 });
        navigate(taskId ? '/tasks' : '/dcc/periodic-reviews');
      }
      return;
    }

    // Ensure synthesized or department-resolved schedule exists in store before submitting
    if (typeof useStore.setState === 'function' && typeof useStore.getState === 'function') {
      const storeSchedules = useStore.getState().periodicReviewSchedules || [];
      const existingIdx = storeSchedules.findIndex(s => s.id === schedule.id);
      if (existingIdx === -1) {
        useStore.setState({
          periodicReviewSchedules: [...storeSchedules, schedule]
        });
      } else if (storeSchedules[existingIdx].ownerDepartmentId !== docDept) {
        const nextSchedules = [...storeSchedules];
        nextSchedules[existingIdx] = { ...nextSchedules[existingIdx], ownerDepartmentId: docDept };
        useStore.setState({ periodicReviewSchedules: nextSchedules });
      }
    }

    const standardizedReviewDetails = {
      outcome,
      reason: comment,
      comment,
      findings,
      standard_clause: standards,
      standards,
      evidence_reference: references,
      references,
      additional_comment: additionalComments,
      additionalComments
    };

    const postSubmitNavigation = (navOutcome, linkStatus, newDraftId) => {
      setIsReEvaluating(false);
      if (linkStatus === 'FAILED') {
        toast.error('การบันทึกสำเร็จ แต่การเชื่อมโยง DAR ล้มเหลว');
      } else {
        if (navOutcome === 'NO_CHANGE') {
          if (isFastTrack) {
            toast.success('อนุมัติผลการทบทวนเรียบร้อยแล้ว (Fast-Track ขยายรอบ 1 ปี)');
          } else {
            toast.success('ส่งผลการทบทวนไปยังหัวหน้าแผนก (HOD) เรียบร้อยแล้ว');
          }
        } else {
          toast.success('บันทึกผลการทบทวนเรียบร้อยแล้ว');
        }

        if (navOutcome === 'REVISION_REQUIRED') {
          handleLinkedAction('REVISION', newDraftId);
        } else if (navOutcome === 'OBSOLETE_REQUIRED') {
          handleLinkedAction('OBSOLETE', newDraftId);
        } else if (taskId) {
          navigate('/tasks');
        } else {
          navigate('/dcc/periodic-reviews');
        }
      }
    };

    const idempotencyKey = !isExternal && outcome === 'REVISION_REQUIRED' 
      ? `PERIODIC_REVIEW_${schedule.id}_REVISION` 
      : (!isExternal && outcome === 'OBSOLETE_REQUIRED' ? `PERIODIC_REVIEW_${schedule.id}_OBSOLETE` : null);

    if (idempotencyKey) {
      if (schedule.linkedActionId && schedule.linkageStatus === 'SUCCESS') {
        // Already created, just re-submit core
        submitPeriodicReview({
          scheduleId: schedule.id,
          docId: doc?.id || schedule.documentId,
          docCode: effectiveDocCode,
          isExternal: false,
          documentCategory: 'INTERNAL',
          outcome,
          comment,
          linkedActionId: schedule.linkedActionId,
          linkageStatus: 'SUCCESS',
          idempotencyKey,
          taskId,
          reviewDetails: standardizedReviewDetails
        });
        postSubmitNavigation(outcome, 'SUCCESS', schedule.linkedActionId);
      } else {
        // Generate actual DAR
        const darPayload = {
          type: outcome === 'REVISION_REQUIRED' ? 'REVISION' : 'OBSOLETE',
          title: schedule.documentName || schedule.documentNumber,
          department: docDept,
          isDraft: true,
          status: 'DRAFT',
          refDocId: schedule.documentId || doc?.id
        };
        const darAdapter = (payload) => useStore.getState().createOrGetLinkedDarDraft(schedule.id, outcome, payload);
        
        useStore.getState().submitPeriodicReviewWithDarAction(
          schedule.id, 
          outcome, 
          comment, 
          darPayload, 
          darAdapter,
          { taskId, reviewDetails: standardizedReviewDetails }
        );
        
        const updatedSchedule = useStore.getState().periodicReviewSchedules.find(s => s.id === schedule.id);
        postSubmitNavigation(outcome, updatedSchedule?.linkageStatus, updatedSchedule?.linkedActionId);
      }
    } else {
      submitPeriodicReview({
        scheduleId: schedule.id,
        docId: doc?.id || schedule.externalDocumentId || schedule.documentId,
        docCode: effectiveDocCode,
        isExternal,
        documentCategory: isExternal ? 'EXTERNAL' : 'INTERNAL',
        outcome,
        comment,
        taskId,
        reviewDetails: standardizedReviewDetails
      });
      postSubmitNavigation(outcome, null, null);
    }
  };

  const handleRetryDarLinkage = () => {
    const darPayload = {
      type: schedule.outcome === 'REVISION_REQUIRED' ? 'REVISION' : 'OBSOLETE',
      title: schedule.documentName || schedule.documentNumber,
      department: docDept,
      isDraft: true,
      status: 'DRAFT',
      refDocId: schedule.documentId || schedule.externalDocumentId
    };
    
    const darAdapter = (payload) => useStore.getState().createOrGetLinkedDarDraft(schedule.id, schedule.outcome, payload);
    
    useStore.getState().retryPeriodicReviewLinkageWithDarAction(schedule.id, darPayload, darAdapter);
    
    const updatedSchedule = useStore.getState().periodicReviewSchedules.find(s => s.id === schedule.id);
    if (updatedSchedule?.linkageStatus === 'SUCCESS') {
      toast.success('สร้างคำขอสำเร็จ');
      if (schedule.outcome === 'REVISION_REQUIRED') {
        navigate(`/dcc/dar/new/revision?draftId=${updatedSchedule.linkedActionId}`);
      } else {
        navigate(`/dcc/dar/new/obsolete?draftId=${updatedSchedule.linkedActionId}`);
      }
    } else {
      toast.error('การสร้าง DAR ล้มเหลว กรุณาลองใหม่อีกครั้ง');
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <div className="mb-4">
        <button 
          type="button"
          onClick={() => {
            if (taskId) {
              navigate('/tasks');
            } else {
              navigate('/dcc/periodic-reviews');
            }
          }}
          className="inline-flex items-center gap-2 text-slate-500 hover:text-slate-800 transition-colors font-medium text-sm"
        >
          <ArrowLeft size={16} /> {taskId ? 'กลับสู่กล่องงาน (Task Inbox)' : 'กลับสู่ภาพรวมการทบทวน'}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        <div className="lg:col-span-4">
          <DocumentDigest schedule={schedule} document={targetDoc} isExternal={isExternal} statusLabel={statusLabel} effectiveToday={effectiveToday} onOpenDocument={handleOpenDocModal} />
        </div>

        <div className="lg:col-span-8">
          {isPendingApproval ? (
            <PendingReviewPanel schedule={schedule} canApprove={canApproveReview} taskId={taskId} navigate={navigate} handleApproveReview={handleApproveReview} handleStartReReview={handleStartReReview} />
          ) : isEvaluated ? (
            <EvaluatedReviewPanel effectiveOutcome={effectiveOutcome} schedule={schedule} isExternal={isExternal} effectiveDocCode={effectiveDocCode} doc={doc} linkedDarStatus={linkedDarStatus} taskId={taskId} navigate={navigate} handleStartReReview={handleStartReReview} handleRetryDarLinkage={handleRetryDarLinkage} />
          ) : (
            <ReviewDecisionForm
              isReEvaluating={isReEvaluating}
              cancelReEvaluation={() => setIsReEvaluating(false)}
              canPerform={canPerform}
              outcome={outcome}
              setOutcome={setOutcome}
              comment={comment}
              setComment={setComment}
              findings={findings}
              setFindings={setFindings}
              standards={standards}
              setStandards={setStandards}
              references={references}
              setReferences={setReferences}
              additionalComments={additionalComments}
              setAdditionalComments={setAdditionalComments}
              isExternal={isExternal}
              isFastTrack={isFastTrack}
              docDept={docDept}
              ownerDepartmentId={schedule.ownerDepartmentId}
              cycleLabel={getCycleLabel(getCycleMonths(targetDoc, schedule))}
              onCancel={() => isReEvaluating ? setIsReEvaluating(false) : navigate(taskId ? '/tasks' : '/dcc/periodic-reviews')}
              onSubmit={handleSubmit}
            />
          )}
        </div>
      </div>

      {isDocModalOpen && targetDoc && !isExternal && (
        <DocumentDetailModal
          isOpen={isDocModalOpen}
          onClose={() => setIsDocModalOpen(false)}
          document={targetDoc}
        />
      )}

      {isDocModalOpen && targetDoc && isExternal && (
        <ExternalDocDetailModal
          isOpen={isDocModalOpen}
          onClose={() => setIsDocModalOpen(false)}
          document={targetDoc}
        />
      )}
    </div>
  );
};

export default PeriodicReviewDetail;
