import React from 'react';
import { PenTool, CheckCircle2, Clock, ShieldCheck, Zap } from 'lucide-react';

/**
 * SignatoryStatusCard - Interactive 3x3 Electronic Signatory Matrix UI Component
 * 
 * Displays the 3-column Signatory Matrix (Requester | Reviewer | Approver)
 * using authentic TH Sarabun New typography and real signature assets.
 * 
 * Complies with 21 CFR Part 11 Electronic Signature Display requirements.
 */
const SignatoryStatusCard = ({
  signOffData = {},
  stage = 'REVIEW', // 'REVIEW' | 'APPROVE'
  isStamped = false,
  className = ''
}) => {
  const req = signOffData?.requester || {};
  const rev = signOffData?.reviewer || {};
  const app = signOffData?.approver || {};

  return (
    <div className={`bg-slate-800/95 border-b border-slate-700/80 px-4 py-2.5 text-slate-100 select-none ${className}`}>
      {/* Header Bar */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded bg-sky-500/20 text-sky-400 flex items-center justify-center">
            <PenTool size={12} />
          </div>
          <span className="text-xs font-semibold tracking-wide text-slate-200">
            ตารางการลงนามอิเล็กทรอนิกส์ (Electronic Signatory Matrix)
          </span>
          <span className="text-[10px] text-slate-400 font-mono hidden sm:inline">
            • 21 CFR Part 11 Compliant
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {isStamped ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              <CheckCircle2 size={10} /> ประทับตราบน PDF แล้ว
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-sky-500/20 text-sky-300 border border-sky-500/30">
              <Zap size={10} /> Instant Preview
            </span>
          )}
        </div>
      </div>

      {/* 3-Column Signatory Matrix Grid */}
      <div 
        className="grid grid-cols-1 md:grid-cols-3 gap-2"
        style={{ fontFamily: "'TH Sarabun New', Sarabun, sans-serif" }}
      >
        {/* Column 1: ผู้จัดทำ (Requester - คุณบีม) */}
        <div className="bg-slate-900/80 border border-slate-700/70 rounded-lg p-2 flex flex-col justify-between relative overflow-hidden">
          <div className="flex items-center justify-between pb-1 mb-1 border-b border-slate-800">
            <span className="text-xs font-bold text-slate-300">1. ผู้จัดทำ (Requester)</span>
            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-400">
              <CheckCircle2 size={11} /> ยื่นคำร้องแล้ว
            </span>
          </div>

          <div className="h-10 flex items-center justify-center my-0.5 bg-slate-950/50 rounded border border-slate-800/80 px-2 overflow-hidden">
            {req.signature ? (
              <img 
                src={req.signature} 
                alt={`ลายเซ็น ${req.name || 'ผู้จัดทำ'}`} 
                className="h-8 max-w-[130px] object-contain brightness-125 filter invert" 
              />
            ) : (
              <span className="text-sm italic font-serif text-slate-400">
                {req.name || 'ผู้จัดทำ'}
              </span>
            )}
          </div>

          <div className="text-center pt-1 leading-tight space-y-0.5">
            <p className="text-sm font-bold text-slate-100 truncate">
              ({req.name || 'ผู้จัดทำ'})
            </p>
            <p className="text-[12px] text-slate-400 truncate">
              {req.position || 'Requester'}
            </p>
            <p className="text-[11px] text-slate-400 font-mono">
              วันที่: {req.timestamp || '-'}
            </p>
          </div>
        </div>

        {/* Column 2: ผู้ทบทวน (Reviewer) */}
        <div className={`bg-slate-900/80 border rounded-lg p-2 flex flex-col justify-between relative overflow-hidden ${
          stage === 'REVIEW' ? 'border-amber-500/50 ring-1 ring-amber-500/20' : 'border-slate-700/70'
        }`}>
          <div className="flex items-center justify-between pb-1 mb-1 border-b border-slate-800">
            <span className="text-xs font-bold text-slate-300">2. ผู้ทบทวน (Reviewer)</span>
            {rev.isCompleted ? (
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-400">
                <CheckCircle2 size={11} /> ผ่านการทบทวนแล้ว
              </span>
            ) : stage === 'REVIEW' ? (
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-400 animate-pulse">
                <Clock size={11} /> อยู่ระหว่างทบทวน
              </span>
            ) : (
              <span className="text-[11px] text-slate-500">
                ○ รอการทบทวน
              </span>
            )}
          </div>

          <div className="h-10 flex items-center justify-center my-0.5 bg-slate-950/50 rounded border border-slate-800/80 px-2 overflow-hidden">
            {rev.signature ? (
              <img 
                src={rev.signature} 
                alt={`ลายเซ็น ${rev.name || 'ผู้ทบทวน'}`} 
                className="h-8 max-w-[130px] object-contain brightness-125 filter invert" 
              />
            ) : stage === 'REVIEW' ? (
              <div className="flex items-center gap-1.5 text-xs text-amber-300/80 border border-dashed border-amber-500/40 px-2.5 py-0.5 rounded">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
                <span>กำลังดำเนินการทบทวน</span>
              </div>
            ) : (
              <span className="text-xs text-slate-500 italic">
                ( รอดำเนินการ )
              </span>
            )}
          </div>

          <div className="text-center pt-1 leading-tight space-y-0.5">
            <p className="text-sm font-bold text-slate-100 truncate">
              ({rev.name || (stage === 'REVIEW' ? 'ผู้ทบทวน' : '-')})
            </p>
            <p className="text-[12px] text-slate-400 truncate">
              {rev.position || (stage === 'REVIEW' ? 'Reviewer' : '-')}
            </p>
            <p className="text-[11px] text-slate-400 font-mono">
              วันที่: {rev.timestamp || (stage === 'REVIEW' ? 'รอยืนยันการทบทวน' : '-')}
            </p>
          </div>
        </div>

        {/* Column 3: ผู้อนุมัติ (Approver) */}
        <div className={`bg-slate-900/80 border rounded-lg p-2 flex flex-col justify-between relative overflow-hidden ${
          stage === 'APPROVE' ? 'border-sky-500/50 ring-1 ring-sky-500/20' : 'border-slate-700/70'
        }`}>
          <div className="flex items-center justify-between pb-1 mb-1 border-b border-slate-800">
            <span className="text-xs font-bold text-slate-300">3. ผู้อนุมัติ (Approver)</span>
            {app.isCompleted ? (
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-400">
                <CheckCircle2 size={11} /> อนุมัติแล้ว
              </span>
            ) : stage === 'APPROVE' ? (
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-sky-400 animate-pulse">
                <ShieldCheck size={11} /> อยู่ระหว่างพิจารณา
              </span>
            ) : (
              <span className="text-[11px] text-slate-500">
                ○ รอดำเนินการ
              </span>
            )}
          </div>

          <div className="h-10 flex items-center justify-center my-0.5 bg-slate-950/50 rounded border border-slate-800/80 px-2 overflow-hidden">
            {app.signature ? (
              <img 
                src={app.signature} 
                alt={`ลายเซ็น ${app.name || 'ผู้อนุมัติ'}`} 
                className="h-8 max-w-[130px] object-contain brightness-125 filter invert" 
              />
            ) : stage === 'APPROVE' ? (
              <div className="flex items-center gap-1.5 text-xs text-sky-300/80 border border-dashed border-sky-500/40 px-2.5 py-0.5 rounded">
                <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-ping" />
                <span>กำลังพิจารณาอนุมัติ</span>
              </div>
            ) : (
              <span className="text-xs text-slate-500 italic">
                ( รอดำเนินการ )
              </span>
            )}
          </div>

          <div className="text-center pt-1 leading-tight space-y-0.5">
            <p className="text-sm font-bold text-slate-100 truncate">
              ({app.name || (stage === 'APPROVE' ? 'ผู้อนุมัติ' : '-')})
            </p>
            <p className="text-[12px] text-slate-400 truncate">
              {app.position || (stage === 'APPROVE' ? 'Approver' : '-')}
            </p>
            <p className="text-[11px] text-slate-400 font-mono">
              วันที่: {app.timestamp || (stage === 'APPROVE' ? 'รอยืนยันการอนุมัติ' : '-')}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SignatoryStatusCard;
