import React from 'react';
import {
  FolderTree,
  CheckCircle2,
  Clock,
  Edit2,
  Trash2,
  ShieldAlert,
  Plus
} from 'lucide-react';

const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

export const AnnualPlanMatrixTable = ({
  planItems = [],
  canEditPlan = false,
  onOpenAddItem,
  onDeleteItem,
  onOpenGroupWorkOrderCheck
}) => {
  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
      {/* Table Scrollable Container */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-slate-50/90 border-b border-slate-200/80 text-slate-600 text-[11px] font-bold tracking-wider uppercase">
              <th className="py-2.5 px-3.5 sticky left-0 z-20 bg-slate-50 shadow-[1px_0_0_0_#e2e8f0] min-w-[230px]">
                รายการเครื่องมือวัด
              </th>
              <th className="py-2.5 px-3 min-w-[130px]">
                หน่วยงานสอบเทียบ
              </th>
              <th className="py-2.5 px-2 text-center w-12 text-slate-500 font-mono">
                Type
              </th>
              {MONTHS.map((m) => (
                <th
                  key={m}
                  className="py-2.5 px-1 text-center w-9 border-l border-slate-200/70 text-slate-700 font-mono"
                >
                  ด.{m}
                </th>
              ))}
              <th className="py-2.5 px-3 border-l border-slate-200/70 min-w-[180px]">
                วันครบกำหนด / สถานะหลักฐาน
              </th>
              <th className="py-2.5 px-3 min-w-[110px]">
                ผู้รับผิดชอบ
              </th>
              <th className="py-2.5 px-3 min-w-[110px]">
                หมายเหตุ
              </th>
              <th className="py-2.5 px-3 text-right min-w-[110px]">
                การจัดการ
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100">
            {planItems.length === 0 ? (
              <tr>
                <td colSpan={19} className="py-12 text-center text-slate-500 bg-white">
                  <div className="space-y-1.5">
                    <p className="text-sm font-semibold text-slate-700">
                      ยังไม่มีรายการเครื่องมือวัดในแผนฉบับนี้
                    </p>
                    <p className="text-xs text-slate-500">
                      กำหนดเครื่องมือวัดและระบุเดือนที่วางแผนโดยคลิกปุ่ม &ldquo;เพิ่มเครื่องมือเข้าแผน&rdquo;
                    </p>
                    {canEditPlan && (
                      <button
                        type="button"
                        onClick={() => onOpenAddItem(null)}
                        className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 cursor-pointer shadow-2xs"
                      >
                        <Plus size={13} />
                        <span>เพิ่มเครื่องมือเข้าแผน</span>
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ) : (
              planItems.map((item) => {
                const isGroup = Number(item.is_group) === 1;
                return (
                  <React.Fragment key={item.id}>
                    {/* Row 1: Plan Row */}
                    <tr className="hover:bg-slate-50/50 transition-colors">
                      {/* Asset Details (rowSpan 2, Sticky Column) */}
                      <td
                        className="py-2.5 px-3.5 align-top sticky left-0 z-10 bg-white shadow-[1px_0_0_0_#e2e8f0] min-w-[230px]"
                        rowSpan={2}
                      >
                        <div className="font-mono font-bold text-slate-900 text-xs tracking-tight">
                          {item.asset_code}
                        </div>
                        <div className="text-xs font-medium text-slate-700 leading-snug">
                          {item.asset_name}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          ความถี่: <span className="font-medium text-slate-700">{item.frequency_label}</span>
                        </div>
                        {isGroup ? (
                          <div className="mt-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-purple-50 border border-purple-200 text-purple-900 font-semibold text-[10.5px]">
                            <FolderTree size={11} className="text-purple-700 shrink-0" />
                            <span>กลุ่มแม่ (ต้องแยกรหัสลูกก่อนสร้างใบงาน)</span>
                          </div>
                        ) : item.parent_asset_code ? (
                          <div className="mt-1 inline-block px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-700 text-[10.5px]">
                            ลูกของกลุ่ม: <span className="font-mono font-semibold">{item.parent_asset_code}</span>
                          </div>
                        ) : null}
                      </td>

                      {/* Provider (rowSpan 2) */}
                      <td className="py-2.5 px-3 align-top text-xs text-slate-700" rowSpan={2}>
                        {item.provider_name}
                      </td>

                      {/* Plan Type Cell */}
                      <td className="py-1.5 px-1.5 text-center font-bold font-mono text-[11px] bg-indigo-50/50 text-indigo-700 border-b border-slate-100">
                        Plan
                      </td>

                      {/* 12 Month Cells for Plan */}
                      {MONTHS.map((m) => {
                        const isPlanned = (item.planned_months || []).includes(m);
                        return (
                          <td
                            key={`plan-${item.id}-${m}`}
                            className={`py-1.5 px-1 text-center border-l border-b border-slate-100 ${
                              isPlanned ? 'bg-indigo-50/40' : 'bg-white'
                            }`}
                          >
                            {isPlanned ? (
                              <span className="inline-block min-w-[22px] py-0.5 px-1 rounded bg-indigo-600 text-white font-mono font-bold text-[10.5px] shadow-2xs">
                                P{m}
                              </span>
                            ) : (
                              <span className="text-slate-300 font-mono text-[11px]">-</span>
                            )}
                          </td>
                        );
                      })}

                      {/* Due Dates & Evidence Status (rowSpan 2) */}
                      <td className="py-2.5 px-3 align-top border-l border-slate-100" rowSpan={2}>
                        <div className="font-mono font-bold text-slate-900 text-xs">
                          {(item.due_dates || []).slice(0, 2).join(', ')}
                          {(item.due_dates || []).length > 2
                            ? ` (+${item.due_dates.length - 2} เดือน)`
                            : ''}
                        </div>
                        {item.completion_status === 'COMPLETED' ? (
                          <span className="mt-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-800 font-semibold text-[10.5px]">
                            <CheckCircle2 size={11} className="text-emerald-700 shrink-0" />
                            <span>ทวนสอบเสร็จแล้ว • มีใบรับรอง</span>
                          </span>
                        ) : (
                          <span className="mt-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-50 border border-amber-200 text-amber-900 font-semibold text-[10.5px]">
                            <Clock size={11} className="text-amber-700 shrink-0" />
                            <span>วางแผนเท่านั้น • ยังไม่มีหลักฐานใบงาน</span>
                          </span>
                        )}
                      </td>

                      {/* Responsible Dept & Person (rowSpan 2) */}
                      <td className="py-2.5 px-3 align-top" rowSpan={2}>
                        <div className="font-bold text-slate-800 text-xs">{item.responsible_dept}</div>
                        <div className="text-[11px] text-slate-500">{item.responsible_label}</div>
                      </td>

                      {/* Remarks (rowSpan 2) */}
                      <td className="py-2.5 px-3 align-top text-xs text-slate-600" rowSpan={2}>
                        {item.remarks || '-'}
                      </td>

                      {/* Actions (rowSpan 2) */}
                      <td className="py-2.5 px-3 align-top text-right" rowSpan={2}>
                        <div className="flex flex-col items-end gap-1">
                          {isGroup && (
                            <button
                              type="button"
                              onClick={() => onOpenGroupWorkOrderCheck(item)}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded bg-purple-50 border border-purple-200 hover:bg-purple-100 text-purple-900 font-bold text-[11px] transition-colors cursor-pointer shadow-2xs"
                            >
                              <ShieldAlert size={11} className="text-purple-700" />
                              <span>ตรวจรหัสลูกก่อนออกใบงาน</span>
                            </button>
                          )}
                          {canEditPlan && (
                            <div className="inline-flex gap-1">
                              <button
                                type="button"
                                onClick={() => onOpenAddItem(item)}
                                className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-[11px] font-medium transition-colors cursor-pointer"
                              >
                                <Edit2 size={11} className="text-slate-500" />
                                <span>แก้ไข</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => onDeleteItem(item)}
                                className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded border border-rose-200 bg-rose-50/50 hover:bg-rose-50 text-rose-700 text-[11px] font-medium transition-colors cursor-pointer"
                              >
                                <Trash2 size={11} className="text-rose-600" />
                                <span>ลบ</span>
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>

                    {/* Row 2: Actual Performance (Act.) Row */}
                    <tr className="bg-slate-50/40 hover:bg-slate-50/70 transition-colors">
                      <td className="py-1 px-1.5 text-center font-bold font-mono text-[11px] text-slate-500">
                        Act.
                      </td>
                      {MONTHS.map((m) => {
                        const isActual = (item.actual_months || []).includes(m);
                        return (
                          <td
                            key={`act-${item.id}-${m}`}
                            className={`py-1 px-1 text-center border-l border-slate-100 ${
                              isActual ? 'bg-emerald-50/40' : ''
                            }`}
                          >
                            {isActual ? (
                              <span className="inline-block min-w-[22px] py-0.5 px-1 rounded bg-emerald-600 text-white font-mono font-bold text-[10.5px] shadow-2xs">
                                A{m}
                              </span>
                            ) : (
                              <span className="text-slate-300 font-mono text-[11px]">-</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Discrete Table Footer with Legend & Summary (Linear style) */}
      <div className="bg-slate-50/90 border-t border-slate-200/80 px-4 py-2 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
        <div>
          รวมเครื่องมือวัดในแผน: <strong className="text-slate-800">{planItems.length}</strong> รายการ
        </div>

        <div className="flex flex-wrap items-center gap-3 text-[11px]">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-indigo-600 inline-block shadow-2xs" />
            <span className="text-slate-700 font-medium">Plan (P): เดือนเป้าหมาย (วางแผนเท่านั้น)</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-emerald-600 inline-block shadow-2xs" />
            <span className="text-slate-700 font-medium">Act. (A): มีผลตรวจรับเสร็จสิ้น</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <FolderTree size={12} className="text-purple-700" />
            <span className="text-purple-900 font-medium">กลุ่มแม่: ต้องแยกรหัสลูกก่อนออกใบงาน</span>
          </span>
        </div>
      </div>
    </div>
  );
};

export default AnnualPlanMatrixTable;
