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
    <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden space-y-4 p-5">
      {/* Table Section Header with Legend */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
        <div>
          <h3 className="text-sm font-bold text-slate-900">
            ตารางแผนการทวนสอบและสอบเทียบ 12 เดือน (FM-QC-46 Matrix)
          </h3>
          <p className="text-xs text-slate-500">
            แสดงรายการเครื่องมือวัด รอบความถี่ แผนเป้าหมาย (Plan) และผลการสอบเทียบจริง (Act.)
          </p>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-900 font-semibold">
            <span className="w-2.5 h-2.5 rounded-sm bg-indigo-600 inline-block" />
            <span>Plan (เป้าหมาย)</span>
          </span>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900 font-semibold">
            <span className="w-2.5 h-2.5 rounded-sm bg-emerald-600 inline-block" />
            <span>Act. (ผลตรวจรับจริง)</span>
          </span>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-purple-50 border border-purple-200 text-purple-900 font-semibold">
            <FolderTree size={12} className="text-purple-700" />
            <span>เครื่องมือกลุ่มแม่</span>
          </span>
        </div>
      </div>

      {/* Main Table Container */}
      <div className="overflow-x-auto border border-slate-200 rounded-xl">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-slate-100/90 border-b border-slate-200 text-slate-800 font-bold">
              <th className="py-3 px-3.5 sticky left-0 z-20 bg-slate-100 shadow-[1px_0_0_0_#cbd5e1] min-w-[230px]">
                รายการเครื่องมือวัด
              </th>
              <th className="py-3 px-3 min-w-[130px]">
                หน่วยงานที่ทวนสอบ
              </th>
              <th className="py-3 px-2 text-center w-14">
                Action
              </th>
              {MONTHS.map((m) => (
                <th
                  key={m}
                  className="py-3 px-1.5 text-center w-9 border-l border-slate-200 text-slate-800 font-bold"
                >
                  ด.{m}
                </th>
              ))}
              <th className="py-3 px-3.5 border-l border-slate-200 min-w-[180px]">
                วันครบกำหนด / สถานะหลักฐาน
              </th>
              <th className="py-3 px-3 min-w-[110px]">
                ผู้รับผิดชอบ
              </th>
              <th className="py-3 px-3 min-w-[110px]">
                หมายเหตุ
              </th>
              <th className="py-3 px-3 text-right min-w-[120px]">
                การจัดการ
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-200">
            {planItems.length === 0 ? (
              <tr>
                <td colSpan={19} className="py-12 text-center text-slate-500 bg-white">
                  <div className="space-y-2">
                    <p className="text-sm font-semibold text-slate-700">
                      ยังไม่มีรายการเครื่องมือวัดในแผนฉบับนี้
                    </p>
                    <p className="text-xs text-slate-500">
                      คลิกปุ่ม &ldquo;เพิ่มเครื่องมือเข้าแผน&rdquo; เพื่อกำหนดเครื่องมือและเดือนที่วางแผน
                    </p>
                    {canEditPlan && (
                      <button
                        type="button"
                        onClick={() => onOpenAddItem(null)}
                        className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 cursor-pointer shadow-xs"
                      >
                        <Plus size={14} />
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
                    {/* Row 1: Item Info & Planned Months */}
                    <tr className="hover:bg-slate-50/70 transition-colors">
                      {/* Asset Details (rowSpan 2) */}
                      <td
                        className="py-3 px-3.5 align-top sticky left-0 z-10 bg-white shadow-[1px_0_0_0_#e2e8f0] min-w-[230px]"
                        rowSpan={2}
                      >
                        <div className="font-mono font-bold text-slate-900 text-sm">
                          {item.asset_code}
                        </div>
                        <div className="font-semibold text-slate-800 leading-snug">
                          {item.asset_name}
                        </div>
                        <div className="text-xs text-slate-600 mt-0.5">
                          ความถี่: <span className="font-medium text-slate-700">{item.frequency_label}</span>
                        </div>
                        {isGroup ? (
                          <div className="mt-1.5 inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-purple-50 border border-purple-200 text-purple-900 font-semibold text-[11px]">
                            <FolderTree size={12} className="text-purple-700 shrink-0" />
                            <span>กลุ่มแม่ (ต้องแยกรหัสลูกก่อนสร้างใบงาน)</span>
                          </div>
                        ) : item.parent_asset_code ? (
                          <div className="mt-1.5 inline-block px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-slate-700 text-[11px]">
                            ลูกของกลุ่ม: <span className="font-mono font-semibold">{item.parent_asset_code}</span>
                          </div>
                        ) : null}
                      </td>

                      {/* Provider (rowSpan 2) */}
                      <td className="py-3 px-3 align-top font-medium text-slate-800" rowSpan={2}>
                        {item.provider_name}
                      </td>

                      {/* Plan Row Header */}
                      <td className="py-2 px-2 text-center font-bold bg-indigo-50/70 text-indigo-900 border-b border-slate-200">
                        Plan
                      </td>

                      {/* 12 Month Cells for Plan */}
                      {MONTHS.map((m) => {
                        const isPlanned = (item.planned_months || []).includes(m);
                        return (
                          <td
                            key={`plan-${item.id}-${m}`}
                            className={`py-2 px-1 text-center border-l border-b border-slate-200 ${
                              isPlanned
                                ? 'bg-indigo-600 text-white font-bold'
                                : 'bg-white text-slate-300'
                            }`}
                          >
                            {isPlanned ? `P${m}` : '-'}
                          </td>
                        );
                      })}

                      {/* Due Dates & Evidence Status (rowSpan 2) */}
                      <td className="py-3 px-3.5 align-top border-l border-slate-200" rowSpan={2}>
                        <div className="font-mono font-bold text-slate-900 text-xs">
                          {(item.due_dates || []).slice(0, 2).join(', ')}
                          {(item.due_dates || []).length > 2
                            ? ` (+${item.due_dates.length - 2} เดือน)`
                            : ''}
                        </div>
                        {item.completion_status === 'COMPLETED' ? (
                          <span className="mt-1.5 inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-800 font-semibold text-[11px]">
                            <CheckCircle2 size={12} className="text-emerald-700 shrink-0" />
                            <span>ทวนสอบเสร็จแล้ว • มีใบรับรอง</span>
                          </span>
                        ) : (
                          <span className="mt-1.5 inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 border border-amber-200 text-amber-900 font-semibold text-[11px]">
                            <Clock size={12} className="text-amber-700 shrink-0" />
                            <span>วางแผนเท่านั้น • ยังไม่มีหลักฐานใบงาน</span>
                          </span>
                        )}
                      </td>

                      {/* Responsible Dept & Person (rowSpan 2) */}
                      <td className="py-3 px-3 align-top" rowSpan={2}>
                        <div className="font-bold text-slate-800">{item.responsible_dept}</div>
                        <div className="text-xs text-slate-500">{item.responsible_label}</div>
                      </td>

                      {/* Remarks (rowSpan 2) */}
                      <td className="py-3 px-3 align-top text-slate-600" rowSpan={2}>
                        {item.remarks || '-'}
                      </td>

                      {/* Actions (rowSpan 2) */}
                      <td className="py-3 px-3 align-top text-right" rowSpan={2}>
                        <div className="flex flex-col items-end gap-1.5">
                          {isGroup && (
                            <button
                              type="button"
                              onClick={() => onOpenGroupWorkOrderCheck(item)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-purple-50 border border-purple-200 text-purple-900 font-bold hover:bg-purple-100 transition-colors cursor-pointer text-xs shadow-2xs"
                            >
                              <ShieldAlert size={12} className="text-purple-700" />
                              <span>ตรวจรหัสลูกก่อนออกใบงาน</span>
                            </button>
                          )}
                          {canEditPlan && (
                            <div className="inline-flex gap-1.5">
                              <button
                                type="button"
                                onClick={() => onOpenAddItem(item)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-300 bg-white text-slate-700 font-medium hover:bg-slate-50 transition-colors cursor-pointer text-xs shadow-2xs"
                              >
                                <Edit2 size={12} className="text-slate-500" />
                                <span>แก้ไข</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => onDeleteItem(item)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-rose-200 bg-rose-50 text-rose-700 font-medium hover:bg-rose-100 transition-colors cursor-pointer text-xs shadow-2xs"
                              >
                                <Trash2 size={12} className="text-rose-600" />
                                <span>ลบ</span>
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>

                    {/* Row 2: Actual Performance (Act.) Row */}
                    <tr className="bg-slate-50/60">
                      <td className="py-1.5 px-2 text-center font-semibold text-slate-600">
                        Act.
                      </td>
                      {MONTHS.map((m) => {
                        const isActual = (item.actual_months || []).includes(m);
                        return (
                          <td
                            key={`act-${item.id}-${m}`}
                            className={`py-1.5 px-1 text-center border-l border-slate-200 ${
                              isActual
                                ? 'bg-emerald-600 text-white font-bold'
                                : 'text-slate-300'
                            }`}
                          >
                            {isActual ? `A${m}` : '-'}
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
    </div>
  );
};

export default AnnualPlanMatrixTable;

