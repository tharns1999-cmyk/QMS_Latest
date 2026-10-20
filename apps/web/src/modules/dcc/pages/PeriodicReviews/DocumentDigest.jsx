import { CalendarClock, Eye, FileText } from 'lucide-react';
import { formatQmsDisplayDate } from '../../../../shared/utils/dateFormatter';
import { getDocCode, getDocTitle, getCleanRev, getCleanDept } from '../../utils/domainNormalizer';

const DAY = 86400000;
const btn = 'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-medium text-slate-700 transition-all duration-150 hover:-translate-y-0.5 hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500';

// Progress and badge come from the same date math, so the badge can never contradict the due date.
// The current cycle runs from (due - cycleMonths) to due; effectiveDate would span every past cycle too.
function getCycle(cycleMonths, due, today) {
  const d = due ? new Date(due) : null;
  if (!d || isNaN(d)) return null;
  const s = new Date(d);
  s.setMonth(s.getMonth() - cycleMonths);
  const t = new Date(today || Date.now());
  const total = Math.max(d - s, DAY);
  const pct = Math.min(100, Math.max(0, ((t - s) / total) * 100));
  const daysLeft = Math.ceil((d - t) / DAY);
  const badge = daysLeft < 0
    ? { label: `เกินกำหนด ${-daysLeft} วัน`, cls: 'bg-rose-50 text-rose-700 ring-rose-200', bar: 'bg-rose-500' }
    : daysLeft <= 30
      ? { label: `ใกล้ครบกำหนด (${daysLeft} วัน)`, cls: 'bg-amber-50 text-amber-700 ring-amber-200', bar: 'bg-amber-500' }
      : { label: `ปกติ (เหลือ ${daysLeft} วัน)`, cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200', bar: 'bg-emerald-500' };
  return { pct, badge, interval: getCycleLabel(cycleMonths) };
}

export const getCycleMonths = (document, schedule) => Number(
  document?.reviewCycleMonths || document?.frequencyMonths || schedule?.frequencyMonths ||
  (schedule?.cycleYears ? schedule.cycleYears * 12 : 0)
) || 12;

export const getCycleLabel = (months) => (months % 12 === 0 ? `${months / 12} ปี` : `${months} เดือน`);

export default function DocumentDigest({ schedule, document, isExternal, statusLabel, onOpenDocument, effectiveToday }) {
  const code = getDocCode(document) || schedule.documentNumber;
  const title = getDocTitle(document) || schedule.documentName;
  const version = isExternal
    ? getCleanRev(document?.sourceVersion || document?.edition || schedule.edition || schedule.sourceVersion || schedule.rev, '-')
    : getCleanRev(schedule.rev || document);
  const issuer = document?.issuer || document?.officialIssuer || document?.source || document?.issuing_agency || schedule.issuer || '-';
  const effectiveDate = schedule.originalReviewAnchorDate || document?.effectiveDate;
  const cycle = getCycle(getCycleMonths(document, schedule), schedule.nextReviewDate, effectiveToday);
  const rows = [
    [isExternal ? 'รุ่นเอกสาร (Edition)' : 'ฉบับที่ (Revision)', isExternal ? (/^Edition\b/i.test(version) ? version : `Edition ${version}`) : version],
    ...(isExternal ? [['หน่วยงานผู้ออกเอกสาร', issuer]] : []),
    ['แผนกเจ้าของ', getCleanDept(schedule.ownerDepartmentId || document, '-')],
    ['ผู้รับผิดชอบ / เจ้าของ', schedule.ownerUserId || document?.owner || '-'],
    ['วันที่มีผลบังคับใช้', formatQmsDisplayDate(effectiveDate)]
  ];
  const label = 'text-xs font-semibold uppercase tracking-wider text-slate-400';

  return (
    <aside className="sticky top-6 rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xs">
      <div className="flex items-start gap-3">
        <div className="shrink-0 rounded-xl bg-slate-100 p-2.5 text-slate-600"><FileText className="h-5 w-5 stroke-[1.75]" aria-hidden="true" /></div>
        <div className="min-w-0 flex-1">
          <h1 className="break-all font-mono text-xl font-bold tracking-tight text-slate-900">{code}</h1>
          <p className="mt-1 text-sm leading-relaxed text-slate-600">{title}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${isExternal ? 'bg-emerald-50 text-emerald-800' : 'bg-indigo-50 text-indigo-800'}`}>{isExternal ? 'เอกสารภายนอก' : 'เอกสารภายใน'}</span>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusLabel.color}`}>{statusLabel.label}</span>
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
        <div className="flex items-center justify-between gap-2">
          <span className={`${label} flex items-center gap-1.5`}><CalendarClock className="h-4 w-4 stroke-[1.75]" aria-hidden="true" />รอบการทบทวน</span>
          {cycle && <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${cycle.badge.cls}`}>{cycle.badge.label}</span>}
        </div>
        {cycle && (
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-valuenow={Math.round(cycle.pct)} aria-valuemin={0} aria-valuemax={100} aria-label="ความคืบหน้ารอบการทบทวน">
            <div className={`h-full rounded-full transition-all ${cycle.badge.bar}`} style={{ width: `${cycle.pct}%` }} />
          </div>
        )}
        <div className="mt-3 flex items-end justify-between gap-3">
          <div><p className="text-xs text-slate-500">วันที่ครบกำหนดรอบนี้</p><p className="mt-0.5 text-base font-semibold tabular-nums text-slate-900">{formatQmsDisplayDate(schedule.nextReviewDate)}</p></div>
          {cycle && <div className="text-right"><p className="text-xs text-slate-500">รอบ</p><p className="mt-0.5 text-sm font-medium text-slate-800">{cycle.interval}</p></div>}
        </div>
      </div>

      <dl className="mt-6 space-y-4">
        {rows.map(([k, v]) => (
          <div key={k}><dt className={label}>{k}</dt><dd className="mt-1 text-sm font-medium text-slate-800">{v}</dd></div>
        ))}
      </dl>

      <div className="mt-6">
        <button type="button" onClick={onOpenDocument} className={btn}><Eye className="h-4 w-4 stroke-[1.75]" aria-hidden="true" />เปิดดูไฟล์เอกสาร</button>
      </div>
    </aside>
  );
}
