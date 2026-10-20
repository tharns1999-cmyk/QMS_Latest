import { CalendarClock, ClipboardCheck, RotateCcw, UserCheck, Zap } from 'lucide-react';
import { formatQmsDisplayDate } from '../../../../shared/utils/dateFormatter';
import { normalizeReviewOutcome, REVIEW_OUTCOME_LABELS } from '../../store/periodicReviewSlice';

const OUTCOME_STYLES = {
  NO_CHANGE: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  REVISION_REQUIRED: 'bg-amber-50 text-amber-700 ring-amber-200',
  OBSOLETE: 'bg-rose-50 text-rose-700 ring-rose-200'
};

// Legacy entries predate reviewed_by/approved_by, so fall back to their flat name/role keys.
const person = (obj, name, role) => obj || (name ? { name, role } : null);

export default function ExternalReviewHistoryTab({ doc }) {
  const history = [...(doc?.review_history || [])].reverse();
  const cycleMonths = Number(doc?.reviewCycleMonths || doc?.frequencyMonths) || 12;
  const summary = [
    ['ความถี่รอบ', `${cycleMonths} เดือน`],
    ['ทบทวนแล้ว', `${history.length} ครั้ง`],
    ['ครบกำหนดรอบถัดไป', formatQmsDisplayDate(doc?.nextReviewDate || doc?.next_review_date)]
  ];

  return (
    <div className="space-y-5 py-1">
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {summary.map(([k, v]) => (
          <div key={k} className="rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3">
            <dt className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{k}</dt>
            <dd className="mt-1 text-sm font-semibold tabular-nums text-slate-900">{v}</dd>
          </div>
        ))}
      </dl>

      {history.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/40 px-6 py-12 text-center">
          <div className="rounded-full bg-white p-3 text-slate-400 shadow-xs ring-1 ring-slate-200"><ClipboardCheck className="h-6 w-6 stroke-[1.5]" aria-hidden="true" /></div>
          <p className="mt-3 text-sm font-medium text-slate-600">ยังไม่มีประวัติการทบทวนสำหรับเอกสารฉบับนี้</p>
        </div>
      ) : (
        <ol className="relative space-y-4 border-l border-slate-200 pl-6">
          {history.map((h, i) => {
            const outcome = h.outcome_code || normalizeReviewOutcome(h.outcome);
            const reviewer = person(h.reviewed_by, h.reviewer, h.reviewerRole);
            const approver = person(h.approved_by, h.approver, h.approverRole);
            const fastTrack = h.is_fast_track || (reviewer?.name && reviewer.name === approver?.name);
            const nextDue = h.extended_next_due_date || h.nextReviewDate;
            const justification = h.justification || h.reason || h.comment;
            return (
              <li key={h.history_id || h.id || i} className="relative">
                <span className="absolute -left-[31px] top-1.5 h-2.5 w-2.5 rounded-full bg-white ring-2 ring-indigo-400" aria-hidden="true" />
                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold tabular-nums text-slate-900">
                      {formatQmsDisplayDate(h.review_date || h.reviewDate)}
                      {h.edition && h.edition !== '-' && <span className="ml-2 font-mono text-xs font-medium text-slate-500">Edition {h.edition}</span>}
                    </p>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${OUTCOME_STYLES[outcome] || 'bg-slate-50 text-slate-700 ring-slate-200'}`}>
                      {h.outcome_label || REVIEW_OUTCOME_LABELS[outcome] || outcome}
                    </span>
                  </div>

                  <div className="mt-3 grid gap-2 text-xs text-slate-600 sm:grid-cols-2">
                    <p className="flex items-center gap-1.5"><UserCheck className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />ผู้ประเมิน: <span className="font-medium text-slate-800">{reviewer?.name || '-'}</span>{reviewer?.dept && <span className="text-slate-400">({reviewer.dept})</span>}</p>
                    <p className="flex items-center gap-1.5">
                      {fastTrack
                        ? <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700"><Zap className="h-3 w-3" aria-hidden="true" />Fast-Track</span>
                        : <>ผู้อนุมัติ: <span className="font-medium text-slate-800">{approver?.name || '-'}</span>{approver?.role && <span className="text-slate-400">({approver.role})</span>}</>}
                    </p>
                  </div>

                  {nextDue && (
                    <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-600"><CalendarClock className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />ขยายรอบถัดไปเป็น: <span className="font-semibold tabular-nums text-slate-900">{formatQmsDisplayDate(nextDue)}</span></p>
                  )}

                  {(justification || h.findings) && (
                    <div className="mt-3 space-y-1.5 rounded-lg bg-slate-50 p-3 text-xs leading-relaxed text-slate-700">
                      {justification && <p><span className="font-semibold text-slate-500">เหตุผล: </span>{justification}</p>}
                      {h.findings && <p><span className="font-semibold text-slate-500">ข้อเท็จจริงที่พบ: </span>{h.findings}</p>}
                      {h.standards_referenced && <p><span className="font-semibold text-slate-500">มาตรฐานอ้างอิง: </span>{h.standards_referenced}</p>}
                    </div>
                  )}

                  {h.rejection_trail?.length > 0 && (
                    <div className="mt-3 space-y-1 rounded-lg border border-rose-100 bg-rose-50/50 p-3 text-xs text-rose-800">
                      <p className="flex items-center gap-1.5 font-semibold"><RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />ถูกตีกลับ {h.rejection_trail.length} ครั้งก่อนอนุมัติ</p>
                      {h.rejection_trail.map((r, j) => (
                        <p key={j}>{formatQmsDisplayDate(r.rejected_at)} · {r.rejected_by?.name || '-'}: {r.remarks}</p>
                      ))}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
