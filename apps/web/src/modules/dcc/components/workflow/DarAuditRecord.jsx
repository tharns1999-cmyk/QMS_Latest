import React from 'react';
import toast from 'react-hot-toast';
import { Download, Paperclip } from 'lucide-react';
import { apiBlob } from '../../../../api/client';
import { ACCESS_SCOPE_METADATA } from '../../utils/accessControl';
import { getDarReason, getDarDetail } from '../../utils/darHelper';

const text = (...values) => values.find((v) => typeof v === 'string' && v.trim() && v.trim() !== '-') || '-';

const Field = ({ label, children }) => (
  <div className="min-w-0 w-full space-y-0.5">
    <span className="font-bold text-[#374151] block text-xs">{label}</span>
    <div className="text-[#1E293B] leading-relaxed break-words [overflow-wrap:anywhere] whitespace-pre-wrap text-xs sm:text-sm">{children}</div>
  </div>
);

const Section = ({ title, children }) => (
  <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg p-3 space-y-2 text-xs sm:text-sm min-w-0 max-w-full overflow-hidden">
    {title && <p className="text-[11px] font-bold text-[#64748B] uppercase tracking-wide">{title}</p>}
    {children}
  </div>
);

const Pills = ({ items, empty = '-' }) => (items.length ? (
  <div className="flex flex-wrap gap-1.5">
    {items.map((s, i) => (
      <span key={`${s}-${i}`} className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-100 text-[11px] font-medium">[{s}]</span>
    ))}
  </div>
) : <span>{empty}</span>);

const copiesOf = (dar) => {
  const list = Array.isArray(dar.distributions) ? dar.distributions : [];
  if (list.length) {
    return list.map((d, i) => {
      const no = String(d.copyNo || i + 1).padStart(2, '0');
      const where = [d.departmentId || d.department, d.locationName].filter(Boolean).join(' · ');
      return `Copy ${no}: ${where || '-'}${i === 0 ? ' (Master)' : ''}`;
    });
  }
  return Array.isArray(dar.distributedDepts) ? dar.distributedDepts.map((d, i) => `Copy ${String(i + 1).padStart(2, '0')}: ${d}`) : [];
};

const openAttachment = async (dar) => {
  try {
    let blob = null;
    if (dar.apiFilePath) blob = await apiBlob(dar.apiFilePath);
    else {
      const f = dar.attachedFile?.file || dar.file || dar.rawFile || dar.fileBlob;
      if (f instanceof Blob) blob = f;
    }
    if (!blob) throw new Error('missing');
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank', 'noopener');
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch {
    toast.error('ไม่พบไฟล์แนบของคำร้องนี้');
  }
};

/** Full record of one DAR for the audit trail; every field has a safe '-' fallback for older data. */
export default function DarAuditRecord({ dar, darType, requesterName, requesterDept, previousRev, currentRev }) {
  const isObsolete = darType === 'OBSOLETE';
  const isRevision = darType === 'REVISION' || darType === 'REVISE';
  const reason = getDarReason({ ...dar, type: darType === 'REVISE' ? 'REVISION' : darType });
  const detail = getDarDetail({ ...dar, type: darType === 'REVISE' ? 'REVISION' : darType });

  const main = isObsolete || isRevision ? text(reason.value) : text(dar.objective, dar.scope, dar.requestDetail, dar.request_detail, dar.description);
  const extra = text(detail.value, dar.obsoleteDetail, dar.changeSummary, dar.description, dar.reasonDetails, dar.detail);
  const standards = [].concat(dar.relatedStandards || dar.standards || []).filter(Boolean);
  const other = dar.otherStandardDetail && standards.some((s) => /อื่น/.test(s)) ? ` (${dar.otherStandardDetail})` : '';
  const scopeKey = dar.access_control?.scope || dar.accessScope || 'GENERAL';
  const scopeLabel = ACCESS_SCOPE_METADATA[scopeKey]?.label || scopeKey;
  const copies = copiesOf(dar);
  const ackRequired = dar.requireAck === true || dar.require_ack === true || dar.ackRequirement === 'REQUIRED';
  const hasFile = Boolean(dar.apiFilePath || dar.attachedFile || dar.fileName || dar.attachmentUrl);
  const fileName = dar.attachedFile?.name || dar.fileName || 'ไฟล์แนบ';
  const fmt = (d) => (d ? String(d).slice(0, 10) : '-');

  return (
    <div className="space-y-3">
      <Section title="ข้อมูลทั่วไป">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field label="วันที่มีผลบังคับใช้ (Effective Date)">{fmt(dar.effectiveDate || dar.effective_date || dar.effective_date_requested)}</Field>
          <Field label="วันที่เปิดคำขอ (Request Date)">{fmt(dar.createdAt || dar.submittedAt || dar.date)}</Field>
          <Field label="ผู้ร้องขอและแผนก">{requesterName}{requesterDept ? ` · ${requesterDept}` : ''}</Field>
        </div>
      </Section>

      <Section title={isObsolete ? 'เหตุผลการขอยกเลิก' : isRevision ? 'สาระสำคัญของการแก้ไข (Revision Details)' : 'วัตถุประสงค์และขอบเขต'}>
        {isRevision && (
          <Field label="Rev ก่อนหน้า → Rev ปัจจุบัน">
            <span className="font-mono">Rev.{previousRev || '-'} → Rev.{currentRev || '-'}</span>
          </Field>
        )}
        <Field label={isObsolete || isRevision ? reason.title : 'วัตถุประสงค์และขอบเขตคำร้องขอ (Objective & Scope)'}>{main}</Field>
        {!isObsolete && !isRevision && <Field label="เหตุผลในการร้องขอ (Justification / Reason)">{text(reason.value)}</Field>}
        {extra !== '-' && extra !== main && (
          <Field label={isRevision ? 'สรุปการเปลี่ยนแปลง' : 'รายละเอียดเพิ่มเติม'}>{extra}</Field>
        )}
        {isObsolete && <Field label="เอกสารที่ใช้ทดแทน (ถ้ามี)">{text(dar.replacementDoc, dar.replacementDocCode, dar.replacement_doc, dar.supersededBy)}</Field>}
      </Section>

      <Section title="มาตรฐานที่เกี่ยวข้อง (Related Standards)">
        <Pills items={standards} />
        {other && <p className="text-xs text-slate-600">{other}</p>}
      </Section>

      <Section title="ความลับและการจัดสรรสำเนา">
        <Field label="สิทธิ์การเข้าถึงดิจิทัล">{scopeLabel}</Field>
        <Field label={isObsolete ? 'สถานะการเรียกคืน/ทำลายสำเนาควบคุม (Recall Status)' : isRevision ? 'แผนการเปลี่ยนเล่มสำเนาหน้างาน' : 'การจัดสรรสำเนาเริ่มต้น / สำเนาควบคุมประจำจุดใช้งาน'}>
          {isObsolete && <span className="block mb-1">{text(dar.recallPlan, dar.recall_plan)}</span>}
          {copies.length ? copies.map((c) => <span key={c} className="block">{c}</span>) : 'ไม่มีสำเนาควบคุม (Digital Only)'}
        </Field>
        <Field label="ข้อกำหนดการรับทราบ">{ackRequired ? 'ต้องรับทราบ' : 'ระบบเผยแพร่อัตโนมัติ (Digital Distributed)'}</Field>
      </Section>

      <Section title="เอกสารแนบต้นฉบับ">
        {hasFile ? (
          <button type="button" onClick={() => openAttachment(dar)} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 text-xs font-medium text-slate-700 cursor-pointer">
            <Paperclip size={13} /> <span className="font-mono">{fileName}</span> <Download size={13} />
          </button>
        ) : <span className="text-slate-500">-</span>}
      </Section>
    </div>
  );
}
