import { useState } from 'react';
import { AlertTriangle, ArrowRight, Ban, CheckCircle, ChevronDown, FilePenLine, ShieldCheck, Zap } from 'lucide-react';

const decisions = [
  { id: 'NO_CHANGE', icon: CheckCircle, color: 'emerald', chip: '+ ขยายรอบ', title: 'ยังคงใช้งานต่อไปได้', description: 'เอกสารยังถูกต้องและเป็นปัจจุบัน' },
  { id: 'REVISION_REQUIRED', icon: FilePenLine, color: 'amber', chip: 'ออกฉบับ/Edition ใหม่', title: 'ต้องปรับปรุง/แก้ไข', description: 'เนื้อหาหรือ Edition ต้องได้รับการปรับปรุง' },
  { id: 'OBSOLETE_REQUIRED', icon: Ban, color: 'rose', chip: 'ปลดระวางเอกสาร', title: 'ขอยกเลิกการใช้งาน', description: 'เอกสารไม่จำเป็นต้องใช้งานต่อ' }
];

const selectedStyles = {
  emerald: 'border-emerald-500 bg-emerald-50/40 ring-2 ring-emerald-500/40 ring-offset-1 text-emerald-900',
  amber: 'border-amber-500 bg-amber-50/40 ring-2 ring-amber-500/40 ring-offset-1 text-amber-900',
  rose: 'border-rose-500 bg-rose-50/40 ring-2 ring-rose-500/40 ring-offset-1 text-rose-900'
};
const chipStyles = { emerald: 'bg-emerald-100 text-emerald-800', amber: 'bg-amber-100 text-amber-800', rose: 'bg-rose-100 text-rose-800' };
const badgeStyles = { emerald: 'bg-emerald-600', amber: 'bg-amber-600', rose: 'bg-rose-600' };

const actionStyles = {
  NO_CHANGE: 'bg-emerald-600 hover:bg-emerald-700',
  REVISION_REQUIRED: 'bg-amber-600 hover:bg-amber-700',
  OBSOLETE_REQUIRED: 'bg-rose-600 hover:bg-rose-700'
};

const iconStyles = { emerald: 'text-emerald-600', amber: 'text-amber-600', rose: 'text-rose-600' };

export default function ReviewDecisionForm({
  isReEvaluating, cancelReEvaluation, canPerform, outcome, setOutcome, comment, setComment,
  findings, setFindings, standards, setStandards, references, setReferences,
  additionalComments, setAdditionalComments, isExternal, isFastTrack, docDept,
  ownerDepartmentId, onCancel, onSubmit, cycleLabel = '1 ปี'
}) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const selectedDecision = decisions.find(decision => decision.id === outcome);
  const inputStyle = 'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 outline-none transition-colors focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 disabled:bg-slate-50';

  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white shadow-xs">
      <div className="p-5 sm:p-7">
        {isReEvaluating && (
          <div className="mb-6 flex items-start justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-sm text-amber-900">
            <span>โหมดแก้ไขผลการทบทวน: เปลี่ยนผลประเมินหรือรายละเอียดได้</span>
            <button type="button" onClick={cancelReEvaluation} className="shrink-0 font-semibold underline underline-offset-2">ยกเลิกการแก้ไข</button>
          </div>
        )}
        <div className="mb-6">
          <h2 className="text-lg font-semibold tracking-tight text-slate-900">บันทึกผลการทบทวน</h2>
          <p className="mt-1 text-sm text-slate-600">เลือกผลการประเมินและระบุเหตุผลประกอบ</p>
        </div>

        <fieldset disabled={!canPerform}>
          <legend className="mb-3 text-sm font-semibold text-slate-800">ผลการทบทวน <span className="text-rose-600">*</span></legend>
          <div className="grid grid-cols-1 gap-3.5 md:grid-cols-3">
            {decisions.map(decision => {
              const Icon = decision.icon;
              const selected = outcome === decision.id;
              return (
                <label key={decision.id} className={`relative flex cursor-pointer flex-col rounded-xl border bg-white p-4 transition-all duration-150 ease-out hover:-translate-y-0.5 hover:shadow-md focus-within:ring-2 focus-within:ring-indigo-500 disabled:cursor-not-allowed ${selected ? selectedStyles[decision.color] : 'border-slate-200 text-slate-800 hover:border-slate-300'}`}>
                  <input className="sr-only" type="radio" name="outcome" value={decision.id} checked={selected} onChange={event => setOutcome(event.target.value)} />
                  <span className="mb-3 flex items-center justify-between gap-2">
                    <Icon aria-hidden="true" className={`h-5 w-5 stroke-[1.75] ${selected ? iconStyles[decision.color] : 'text-slate-500'}`} />
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${chipStyles[decision.color]}`}>{decision.id === 'NO_CHANGE' ? `${decision.chip} ${cycleLabel}` : decision.chip}</span>
                  </span>
                  <span aria-hidden="true" className={`absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full text-white shadow-sm transition-all duration-150 ${selected ? `scale-100 opacity-100 ${badgeStyles[decision.color]}` : 'scale-50 opacity-0'}`}><CheckCircle className="h-3.5 w-3.5" /></span>
                  <span className="text-sm font-semibold leading-snug">{decision.title}</span>
                  <span className="mt-1 text-xs leading-relaxed text-slate-600">{isExternal ? decision.description : decision.id === 'NO_CHANGE' ? 'เนื้อหายังคงถูกต้อง ไม่จำเป็นต้องแก้ไข' : decision.id === 'REVISION_REQUIRED' ? 'ต้องแก้ไขเอกสารผ่าน DAR' : 'ต้องยกเลิกเอกสารผ่าน DAR'}</span>
                </label>
              );
            })}
          </div>

          {selectedDecision && (
            <div role="status" className={`mt-4 flex gap-2.5 rounded-xl border px-4 py-3 text-sm ${outcome === 'NO_CHANGE' ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : outcome === 'REVISION_REQUIRED' ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-rose-200 bg-rose-50 text-rose-900'}`}>
              {outcome === 'NO_CHANGE' ? <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />}
              <span>{outcome === 'NO_CHANGE'
                ? isFastTrack ? 'สิทธิ์ Fast-Track: ผลทบทวนจะได้รับการอนุมัติและขยายรอบ 1 ปีทันที' : `สายการอนุมัติ 1 ระดับ: ระบบจะส่งให้หัวหน้าแผนก (${docDept} - HOD) พิจารณาขยายรอบถัดไป`
                : outcome === 'REVISION_REQUIRED'
                  ? isExternal ? 'การดำเนินการถัดไป: ระบบจะพาไปลงทะเบียน Edition ใหม่ของเอกสารภายนอก' : 'การดำเนินการถัดไป: ระบบจะพาไปเปิด DAR เพื่อแก้ไขเอกสาร'
                  : isExternal ? 'การดำเนินการถัดไป: ระบบจะพาเข้าสู่ขั้นตอนขอยกเลิกเอกสารภายนอก' : 'การดำเนินการถัดไป: ระบบจะพาไปเปิด DAR เพื่อยกเลิกเอกสาร พร้อมเรียกคืนสำเนาเอกสารที่แจกจ่าย (Physical Recall)'}</span>
            </div>
          )}

          <div className="mt-7">
            <label htmlFor="review-comment" className="mb-2 block text-sm font-semibold text-slate-800">เหตุผล / รายละเอียดการทบทวน <span className="text-rose-600">*</span></label>
            <textarea id="review-comment" rows={4} value={comment} onChange={event => setComment(event.target.value)} placeholder="อธิบายเหตุผลที่เลือกผลการประเมิน พร้อมข้อเท็จจริงที่ใช้พิจารณา" className={`${inputStyle} min-h-28 resize-y`} />
          </div>

          <div className="mt-6 rounded-xl border border-slate-200">
            <button type="button" aria-expanded={detailsOpen} onClick={() => setDetailsOpen(!detailsOpen)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm font-semibold text-slate-800 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500">
              <span>หลักฐานและรายละเอียดประกอบ <span className="ml-1 font-normal text-slate-500">(ไม่บังคับ)</span></span>
              <ChevronDown aria-hidden="true" className={`h-4 w-4 transition-transform duration-150 ${detailsOpen ? 'rotate-180' : ''}`} />
            </button>
            {detailsOpen && (
              <div className="grid gap-5 border-t border-slate-100 bg-slate-50/50 p-4 sm:grid-cols-2">
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-slate-700">ประเด็นที่พบและข้อคิดเห็น</h3>
                  <label className="block text-xs font-medium text-slate-700">ประเด็นที่พบ<textarea rows={2} value={findings} onChange={event => setFindings(event.target.value)} placeholder="ประเด็นหรือข้อสังเกตที่พบ" className={`mt-1.5 ${inputStyle}`} /></label>
                  <label className="block text-xs font-medium text-slate-700">ความคิดเห็นเพิ่มเติม<input type="text" value={additionalComments} onChange={event => setAdditionalComments(event.target.value)} placeholder="ข้อเสนอแนะเพิ่มเติม" className={`mt-1.5 ${inputStyle}`} /></label>
                </div>
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-slate-700">มาตรฐานอ้างอิงและหลักฐาน</h3>
                  <label className="block text-xs font-medium text-slate-700">มาตรฐานหรือข้อกำหนด<textarea rows={2} value={standards} onChange={event => setStandards(event.target.value)} placeholder="เช่น ISO 9001 หรือระเบียบปฏิบัติ" className={`mt-1.5 ${inputStyle}`} /></label>
                  <label className="block text-xs font-medium text-slate-700">ข้อมูลหรือหลักฐานอ้างอิง<input type="text" value={references} onChange={event => setReferences(event.target.value)} placeholder="เช่น รายงาน Internal Audit, CAR" className={`mt-1.5 ${inputStyle}`} /></label>
                </div>
              </div>
            )}
          </div>
        </fieldset>
        {!canPerform && <p className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">คุณไม่มีสิทธิ์บันทึกผลทบทวนเอกสารนี้ สิทธิ์จำกัดเฉพาะเจ้าของเอกสารหรือผู้บังคับบัญชาในแผนก {ownerDepartmentId || '-'}</p>}
      </div>
      {canPerform && (
        <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-end gap-3 rounded-b-2xl border-t border-slate-200 bg-white/90 px-5 py-4 backdrop-blur sm:px-7">
          <button type="button" onClick={onCancel} className="rounded-xl px-4 py-2.5 text-sm font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500">ยกเลิก</button>
          <button type="button" onClick={onSubmit} className={`inline-flex items-center gap-2 whitespace-nowrap rounded-xl px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 ${actionStyles[outcome] || 'bg-indigo-600 hover:bg-indigo-700'}`}>
            {outcome === 'NO_CHANGE' && isFastTrack && <Zap className="h-4 w-4 stroke-[1.75]" />}
            {outcome === 'NO_CHANGE' ? isFastTrack ? 'อนุมัติผลทบทวนทันที' : 'ส่งผลให้หัวหน้าแผนก' : outcome === 'REVISION_REQUIRED' ? 'บันทึกและดำเนินการแก้ไข' : outcome === 'OBSOLETE_REQUIRED' ? 'บันทึกและขอยกเลิก' : 'บันทึกผลการทบทวน'}
            <ArrowRight className="h-4 w-4 stroke-[1.75]" />
          </button>
        </div>
      )}
    </section>
  );
}
