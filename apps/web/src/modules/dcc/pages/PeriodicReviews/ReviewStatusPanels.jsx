import { AlertTriangle, Ban, CheckCircle, Clock, FileEdit, RotateCw, ShieldCheck } from 'lucide-react';
import { getReviewOutcomeLabel } from '../../services/PeriodicReviewService';

export function PendingReviewPanel({ schedule, isDeptManagerOrSupervisor, taskId, navigate, handleApproveReview, handleStartReReview }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200/80 p-6 shadow-sm">
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-8 text-center">
        <Clock className="w-14 h-14 text-amber-500 mx-auto mb-3" />
        <h2 className="text-xl font-bold text-amber-800 mb-1">อยู่ระหว่างรอหัวหน้าแผนกพิจารณาอนุมัติ</h2>
        <p className="text-amber-700 mb-1 text-sm">
          ผลการทบทวน: <span className="font-semibold">ไม่มีการเปลี่ยนแปลง (ส่งขออนุมัติแล้ว)</span>
        </p>
        {(schedule.comment || schedule.pendingReview?.details?.comment) && (
          <p className="text-xs text-amber-800/80 mt-2 bg-amber-100/60 rounded-lg p-2.5 max-w-lg mx-auto text-left">
            <strong>เหตุผล:</strong> {schedule.comment || schedule.pendingReview?.details?.comment}
          </p>
        )}

        {/* Supervisor/Manager Section vs Reviewer Notice */}
        {isDeptManagerOrSupervisor ? (
          <div className="mt-6 p-4 bg-white/95 border border-amber-300 rounded-xl text-left shadow-2xs max-w-lg mx-auto">
            <div className="flex items-start gap-3">
              <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <h4 className="text-xs font-bold text-slate-900">การอนุมัติสำหรับหัวหน้างาน / ผู้จัดการ (L4+)</h4>
                <p className="text-[11px] text-slate-600 mt-0.5">
                  คุณมีสิทธิ์พิจารณาอนุมัติผลการทบทวนเอกสารนี้เพื่อขยายรอบการทบทวน 1 ปี
                </p>
                <div className="mt-3 flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={handleApproveReview}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs rounded-lg transition-colors shadow-2xs cursor-pointer"
                  >
                    <CheckCircle size={14} />
                    <span>✅ อนุมัติผลการทบทวน</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-5 p-3.5 bg-amber-100/70 border border-amber-200 rounded-xl max-w-lg mx-auto text-xs text-amber-900 flex items-center justify-center gap-2">
            <Clock size={16} className="text-amber-600 shrink-0" />
            <span>⏳ อยู่ระหว่างรอหัวหน้าแผนก/ผู้จัดการอนุมัติผลการทบทวน</span>
          </div>
        )}

        <div className="mt-6 pt-4 border-t border-amber-200/60 flex items-center justify-between">
          <button
            type="button"
            onClick={() => navigate(taskId ? '/tasks' : '/dcc/periodic-reviews')}
            className="px-3.5 py-1.5 text-xs text-amber-800 hover:text-amber-900 hover:bg-amber-100 rounded-lg transition-colors"
          >
            {taskId ? 'กลับสู่กล่องงาน' : 'กลับสู่ภาพรวมการทบทวน'}
          </button>
          <button
            type="button"
            onClick={handleStartReReview}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-slate-700 hover:text-sky-700 bg-white hover:bg-slate-50 border border-amber-200 rounded-lg transition-colors shadow-2xs cursor-pointer"
          >
            <RotateCw size={13} className="text-slate-500" />
            <span>🔄 เริ่มการทบทวนใหม่ / แก้ไขผลประเมิน</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export function EvaluatedReviewPanel({ effectiveOutcome, schedule, isExternal, effectiveDocCode, doc, linkedDarStatus, taskId, navigate, handleStartReReview, handleRetryDarLinkage }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200/80 p-6 shadow-sm">
      <div className={`rounded-xl p-8 text-center ${
        effectiveOutcome === 'OBSOLETE_REQUIRED' || effectiveOutcome === 'OBSOLETE'
          ? 'bg-rose-50/70 border border-rose-200'
          : effectiveOutcome === 'REVISION_REQUIRED' || effectiveOutcome === 'REVISE'
            ? 'bg-amber-50/70 border border-amber-200'
            : 'bg-emerald-50 border border-emerald-200'
      }`}>
        {effectiveOutcome === 'OBSOLETE_REQUIRED' || effectiveOutcome === 'OBSOLETE' ? (
          <Ban className="w-14 h-14 text-rose-500 mx-auto mb-3" />
        ) : effectiveOutcome === 'REVISION_REQUIRED' || effectiveOutcome === 'REVISE' ? (
          <FileEdit className="w-14 h-14 text-amber-500 mx-auto mb-3" />
        ) : (
          <CheckCircle className="w-14 h-14 text-emerald-500 mx-auto mb-3" />
        )}
        
        <h2 className={`text-xl font-bold mb-1 ${
          effectiveOutcome === 'OBSOLETE_REQUIRED' || effectiveOutcome === 'OBSOLETE'
            ? 'text-rose-900'
            : effectiveOutcome === 'REVISION_REQUIRED' || effectiveOutcome === 'REVISE'
              ? 'text-amber-900'
              : 'text-emerald-800'
        }`}>
          {effectiveOutcome === 'REVISION_REQUIRED' || effectiveOutcome === 'REVISE'
            ? 'บันทึกผลการทบทวนแล้ว: ต้องแก้ไขเอกสาร'
            : effectiveOutcome === 'OBSOLETE_REQUIRED' || effectiveOutcome === 'OBSOLETE'
              ? 'บันทึกผลการทบทวนแล้ว: ต้องยกเลิกเอกสาร'
              : 'การทบทวนเสร็จแล้ว'}
        </h2>
        <p className={`mb-1 text-sm ${
          effectiveOutcome === 'OBSOLETE_REQUIRED' || effectiveOutcome === 'OBSOLETE'
            ? 'text-rose-700'
            : effectiveOutcome === 'REVISION_REQUIRED' || effectiveOutcome === 'REVISE'
              ? 'text-amber-700'
              : 'text-emerald-600'
        }`}>
          ผลการทบทวน: <span className="font-semibold">{getReviewOutcomeLabel(effectiveOutcome).label}</span>
        </p>

        {(schedule.comment || schedule.reason) && (
          <p className="text-xs text-slate-600 mt-2 bg-white/80 rounded-lg p-2.5 max-w-lg mx-auto text-left border border-slate-200/60">
            <strong>เหตุผล:</strong> {schedule.comment || schedule.reason}
          </p>
        )}

        {/* External Document Action Box: REVISION_REQUIRED / REVISE */}
        {isExternal && (effectiveOutcome === 'REVISION_REQUIRED' || effectiveOutcome === 'REVISE' || effectiveOutcome === 'EXTERNAL_NEW_VERSION') && (
          <div className="mt-5 p-5 bg-gradient-to-br from-amber-50 to-orange-50/60 border-2 border-amber-300/80 rounded-xl text-left shadow-xs">
            <div className="flex items-start gap-3.5">
              <div className="p-2.5 bg-amber-100 text-amber-700 rounded-xl shrink-0 mt-0.5">
                <FileEdit className="w-6 h-6" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-bold text-amber-900 leading-snug">
                  ขั้นตอนถัดไป: จัดทำเอกสารภายนอกฉบับใหม่ (Edition Update Required)
                </h3>
                <p className="text-xs text-amber-800 mt-1.5 leading-relaxed">
                  ผลการทบทวนระบุว่าเอกสารนี้จำเป็นต้องออก Edition ใหม่เพื่อความทันสมัย
                </p>
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      navigate(`/dcc/external-docs?docCode=${encodeURIComponent(effectiveDocCode)}&autoOpenUpdate=true`, {
                        state: {
                          openDocCode: effectiveDocCode,
                          openDocId: doc?.id,
                          autoOpenUpdate: true
                        }
                      });
                    }}
                    className="inline-flex items-center gap-2 px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-medium text-xs rounded-lg shadow-sm transition-colors cursor-pointer"
                  >
                    <span>📝 ดำเนินการอัปเดตฉบับใหม่ (Update Edition)</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleStartReReview}
                    className="inline-flex items-center gap-2 px-4 py-2.5 bg-white hover:bg-amber-50 text-amber-800 hover:text-amber-900 border border-amber-300 font-medium text-xs rounded-lg shadow-2xs transition-colors cursor-pointer"
                    title="เปลี่ยนผลการทบทวนหรือประเมินใหม่"
                  >
                    <RotateCw size={13} className="text-amber-600" />
                    <span>↩️ เปลี่ยนผลการทบทวน (Re-evaluate)</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* External Document Action Box: OBSOLETE_REQUIRED / OBSOLETE */}
        {isExternal && (effectiveOutcome === 'OBSOLETE_REQUIRED' || effectiveOutcome === 'OBSOLETE' || effectiveOutcome === 'EXTERNAL_NO_LONGER_APPLICABLE') && (
          <div className="mt-5 p-5 bg-gradient-to-br from-rose-50 to-red-50/60 border-2 border-rose-300/80 rounded-xl text-left shadow-xs">
            <div className="flex items-start gap-3.5">
              <div className="p-2.5 bg-rose-100 text-rose-700 rounded-xl shrink-0 mt-0.5">
                <Ban className="w-6 h-6" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-bold text-rose-900 leading-snug">
                  ขั้นตอนถัดไป: ขอยกเลิกเอกสารภายนอก (Obsolete Required)
                </h3>
                <p className="text-xs text-rose-800 mt-1.5 leading-relaxed">
                  ผลการทบทวนระบุว่าเอกสารนี้ไม่มีความจำเป็นต้องใช้งานต่อไป ควรดำเนินการขอยกเลิกเอกสาร
                </p>
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      navigate(`/dcc/external-docs?docCode=${encodeURIComponent(effectiveDocCode)}&autoOpenObsolete=true`, {
                        state: {
                          openDocCode: effectiveDocCode,
                          openDocId: doc?.id,
                          autoOpenObsolete: true
                        }
                      });
                    }}
                    className="inline-flex items-center gap-2 px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-medium text-xs rounded-lg shadow-sm transition-colors cursor-pointer"
                  >
                    <span>🚫 ดำเนินการยกเลิกเอกสารภายนอก (Obsolete)</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleStartReReview}
                    className="inline-flex items-center gap-2 px-4 py-2.5 bg-white hover:bg-rose-50 text-rose-800 hover:text-rose-900 border border-rose-300 font-medium text-xs rounded-lg shadow-2xs transition-colors cursor-pointer"
                    title="เปลี่ยนผลการทบทวนหรือประเมินใหม่"
                  >
                    <RotateCw size={13} className="text-rose-600" />
                    <span>↩️ เปลี่ยนผลการทบทวน (Re-evaluate)</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Internal Document DAR Action Box */}
        {!isExternal && (
          <>
            {linkedDarStatus && (
              <p className="text-emerald-600 font-medium text-xs mt-2">สถานะคำขอที่เชื่อมโยง: {linkedDarStatus}</p>
            )}
            {schedule.linkageStatus === 'FAILED' ? (
              <div className="mt-5 p-4 bg-red-50 border border-red-200 rounded-xl text-left">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="text-red-600 mt-0.5 shrink-0" size={18} />
                  <div>
                    <h3 className="text-red-800 font-bold text-sm mb-0.5">การบันทึกสำเร็จ แต่การสร้าง DAR ล้มเหลว</h3>
                    <p className="text-red-600 text-xs mb-3">กรุณาลองสร้างคำขออีกครั้ง</p>
                    <button 
                      type="button"
                      onClick={handleRetryDarLinkage}
                      className="px-3.5 py-1.5 bg-red-600 text-white font-medium text-xs rounded-lg hover:bg-red-700 transition-colors shadow-2xs"
                    >
                      ลองสร้างคำขออีกครั้ง
                    </button>
                  </div>
                </div>
              </div>
            ) : schedule.linkedActionId ? (
              <button 
                type="button"
                onClick={() => navigate(`/dar/draft/${schedule.linkedActionId}`)}
                className="mt-5 px-4 py-2 bg-emerald-600 text-white font-medium text-xs rounded-lg hover:bg-emerald-700 transition-colors shadow-2xs"
              >
                ดู DAR ที่เชื่อมโยง
              </button>
            ) : null}
          </>
        )}

        {/* Footer Controls: Back and Re-review / Edit Evaluation */}
        <div className="mt-6 pt-4 border-t border-slate-200/60 flex items-center justify-between">
          <button
            type="button"
            onClick={() => navigate(taskId ? '/tasks' : '/dcc/periodic-reviews')}
            className="px-3.5 py-1.5 text-xs text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
          >
            {taskId ? 'กลับสู่กล่องงาน' : 'กลับสู่ภาพรวมการทบทวน'}
          </button>
          <button
            type="button"
            onClick={handleStartReReview}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-slate-700 hover:text-sky-700 bg-white hover:bg-sky-50 border border-slate-200 hover:border-sky-300 rounded-lg transition-colors shadow-2xs cursor-pointer"
          >
            <RotateCw size={13} className="text-slate-500" />
            <span>🔄 เริ่มการทบทวนใหม่ / แก้ไขผลประเมิน</span>
          </button>
        </div>
      </div>
    </div>
  );
}
