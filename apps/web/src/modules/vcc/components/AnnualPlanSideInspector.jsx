import React from 'react';
import {
  X,
  Clock,
  CheckCircle2,
  FolderTree,
  ShieldAlert,
  Edit2,
  Trash2,
  Calendar,
  Layers,
  MapPin,
  Building2,
  Wrench,
  AlertTriangle
} from 'lucide-react';

export const THAI_MONTH_NAMES = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
];

export const THAI_MONTH_NAMES_SHORT = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'
];

export const AnnualPlanSideInspector = ({
  item,
  plan,
  workOrders = [],
  canEditPlan = false,
  onClose,
  onOpenAddItem,
  onDeleteItem,
  onOpenGroupWorkOrderCheck
}) => {
  if (!item) return null;

  const isGroup = Number(item.is_group) === 1;

  // Matching work orders for this item
  const matchingWos = workOrders.filter(
    (w) => w.plan_item_id === item.id || (w.plan_id === plan?.id && w.asset_id === item.asset_id)
  );

  const hasHoldOrNc = matchingWos.some((w) => w.nc_status === 'OPEN' || w.result_status === 'FAIL');
  const closedPassWos = matchingWos.filter((w) => w.status === 'CLOSED' && w.result_status === 'PASS');
  const plannedCount = (item.planned_months || []).length;
  const isAllPlannedCompleted = plannedCount > 0 && plannedCount === closedPassWos.length;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      <div className="fixed inset-y-0 right-0 pl-10 max-w-full flex">
        <div className="w-screen max-w-md bg-white shadow-2xl flex flex-col border-l border-slate-200">
          {/* Drawer Header */}
          <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono font-bold text-base text-slate-900">
                  {item.asset_code}
                </span>
                <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-indigo-100 text-indigo-800">
                  {item.asset_type}
                </span>
                {isGroup && (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10.5px] font-semibold bg-purple-100 text-purple-800">
                    <FolderTree size={11} />
                    <span>กลุ่มแม่</span>
                  </span>
                )}
              </div>
              <h3 className="text-sm font-semibold text-slate-800 mt-1">
                {item.asset_name}
              </h3>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="ปิดหน้าต่างสเปก"
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors cursor-pointer"
              title="ปิด"
            >
              <X size={18} />
            </button>
          </div>

          {/* Drawer Scrollable Content */}
          <div className="flex-1 overflow-y-auto p-5 space-y-5 text-xs text-slate-700">
            {/* Section 1: Specs & Location */}
            <div className="bg-slate-50/80 p-3.5 rounded-xl border border-slate-200/80 space-y-2.5">
              <h4 className="font-bold text-slate-800 flex items-center gap-1.5 text-xs">
                <Wrench size={13} className="text-slate-500" />
                <span>ข้อมูลจำเพาะและสถานที่ติดตั้ง</span>
              </h4>

              <div className="grid grid-cols-2 gap-2.5 pt-1 text-[11.5px]">
                <div>
                  <span className="text-slate-400 block text-[10.5px]">รุ่น (Model)</span>
                  <span className="font-medium text-slate-800">{item.model || '-'}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10.5px]">หมายเลขประจำเครื่อง (Serial)</span>
                  <span className="font-medium font-mono text-slate-800">{item.serial_no || '-'}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10.5px]">ตำแหน่งที่ตั้ง (Location)</span>
                  <span className="font-medium text-slate-800 flex items-center gap-1">
                    <MapPin size={11} className="text-slate-400 shrink-0" />
                    <span>{item.location || '-'}</span>
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10.5px]">แผนกผู้รับผิดชอบ</span>
                  <span className="font-medium text-slate-800 flex items-center gap-1">
                    <Building2 size={11} className="text-slate-400 shrink-0" />
                    <span>แผนก {item.responsible_dept} ({item.responsible_label || '-'})</span>
                  </span>
                </div>
              </div>
            </div>

            {/* Section 2: Calibration Rules & Evidence */}
            <div className="bg-slate-50/80 p-3.5 rounded-xl border border-slate-200/80 space-y-2.5">
              <h4 className="font-bold text-slate-800 flex items-center gap-1.5 text-xs">
                <Layers size={13} className="text-slate-500" />
                <span>เกณฑ์การทวนสอบและวันครบกำหนด</span>
              </h4>

              <div className="grid grid-cols-2 gap-2.5 pt-1 text-[11.5px]">
                <div>
                  <span className="text-slate-400 block text-[10.5px]">หน่วยงาน/วิธีทวนสอบ</span>
                  <span className="font-medium text-slate-800">{item.provider_name}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10.5px]">ความถี่รอบการตรวจ</span>
                  <span className="font-medium text-slate-800">{item.frequency_label || 'รายปี'}</span>
                </div>
                <div className="col-span-2">
                  <span className="text-slate-400 block text-[10.5px]">วันครบกำหนดตามเกณฑ์</span>
                  <span className="font-medium font-mono text-slate-900">
                    {(item.due_dates || []).join(', ') || '-'}
                  </span>
                </div>
                <div className="col-span-2">
                  <span className="text-slate-400 block text-[10.5px]">สถานะหลักฐานในระบบ</span>
                  {hasHoldOrNc ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-rose-50 border border-rose-200 text-rose-800 font-semibold text-[11px] mt-0.5">
                      <AlertTriangle size={12} className="text-rose-700" />
                      <span>พบข้อบกพร่อง / ระงับใช้ (ON_HOLD / FAIL)</span>
                    </span>
                  ) : isAllPlannedCompleted ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-800 font-semibold text-[11px] mt-0.5">
                      <CheckCircle2 size={12} className="text-emerald-700" />
                      <span>ทวนสอบเสร็จครบทุกรอบ • มีใบรับรอง ({closedPassWos.length}/{plannedCount})</span>
                    </span>
                  ) : closedPassWos.length > 0 ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-indigo-50 border border-indigo-200 text-indigo-900 font-semibold text-[11px] mt-0.5">
                      <CheckCircle2 size={12} className="text-indigo-700" />
                      <span>ทวนสอบเสร็จแล้วบางรอบ ({closedPassWos.length}/{plannedCount} รอบ)</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-50 border border-amber-200 text-amber-900 font-semibold text-[11px] mt-0.5">
                      <Clock size={12} className="text-amber-700" />
                      <span>วางแผนเท่านั้น • ยังไม่มีหลักฐานใบงานปิดงาน</span>
                    </span>
                  )}
                </div>
                {item.remarks && (
                  <div className="col-span-2">
                    <span className="text-slate-400 block text-[10.5px]">หมายเหตุ</span>
                    <span className="text-slate-700">{item.remarks}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Section 3: 12-Month Schedule Timeline */}
            <div className="space-y-2">
              <h4 className="font-bold text-slate-800 flex items-center gap-1.5 text-xs">
                <Calendar size={13} className="text-slate-500" />
                <span>กำหนดการตลอดทั้งปี (ม.ค. - ธ.ค.)</span>
              </h4>

              <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 overflow-hidden bg-white">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => {
                  const isPlanned = (item.planned_months || []).includes(m);
                  const cycleWos = matchingWos.filter((w) => Number(w.planned_month) === m && w.status !== 'CANCELLED');
                  const externalWos = matchingWos.filter((w) => {
                    if (w.status === 'CANCELLED' || !w.performed_at) return false;
                    return Number(w.performed_at.slice(5, 7)) === m && Number(w.planned_month) !== m;
                  });

                  if (!isPlanned && cycleWos.length === 0 && externalWos.length === 0) return null;

                  return (
                    <div key={m} className="p-3 space-y-2 text-xs">
                      {/* Month Header */}
                      <div className="flex items-center justify-between">
                        <div className="font-bold text-slate-800 flex items-center gap-1.5">
                          <span>เดือนที่ {m} ({THAI_MONTH_NAMES[m - 1]})</span>
                          {isPlanned && (
                            <span className="px-1.5 py-0.2 rounded bg-indigo-100 text-indigo-700 font-mono text-[10px] font-bold">
                              Plan P{m}
                            </span>
                          )}
                        </div>

                        {isPlanned && item.due_dates && (
                          <span className="font-mono text-[11px] text-slate-500">
                            ครบกำหนด: {item.due_dates[(item.planned_months || []).indexOf(m)] || '-'}
                          </span>
                        )}
                      </div>

                      {/* Planned Cycle Work Orders */}
                      {cycleWos.length > 0 ? (
                        cycleWos.map((w) => {
                          const actualMonth = w.performed_at ? Number(w.performed_at.slice(5, 7)) : null;
                          const isDelayed = actualMonth && actualMonth !== m;

                          return (
                            <div
                              key={w.id}
                              className={`p-2 rounded-lg border text-[11px] space-y-1 ${
                                w.nc_status === 'OPEN' || w.result_status === 'FAIL'
                                  ? 'bg-rose-50 border-rose-200 text-rose-950'
                                  : w.status === 'CLOSED'
                                  ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
                                  : 'bg-amber-50 border-amber-200 text-amber-950'
                              }`}
                            >
                              <div className="flex items-center justify-between font-mono font-bold">
                                <span>{w.wo_code}</span>
                                <span className="text-[10px] uppercase px-1 py-0.2 rounded bg-white/80">
                                  {w.status}
                                </span>
                              </div>

                              {w.performed_at && (
                                <div className="text-[10.5px]">
                                  <span>วันที่ตรวจจริง: <strong className="font-mono">{w.performed_at}</strong></span>
                                  {isDelayed && (
                                    <span className="block text-[10px] text-indigo-700 font-semibold">
                                      ↳ ดำเนินการจริงในเดือน {THAI_MONTH_NAMES[actualMonth - 1]} (ล่าช้ากว่ารอบแผน)
                                    </span>
                                  )}
                                </div>
                              )}

                              <div className="flex items-center justify-between text-[10.5px]">
                                <span>ผลตรวจ: <strong>{w.result_status || 'รอดำเนินการ'}</strong></span>
                                {w.certificate_no && (
                                  <span className="font-mono">Cert: {w.certificate_no}</span>
                                )}
                              </div>
                            </div>
                          );
                        })
                      ) : isPlanned ? (
                        <div className="text-[11px] text-amber-700 bg-amber-50/50 p-1.5 rounded border border-amber-100 flex items-center gap-1">
                          <Clock size={11} className="shrink-0" />
                          <span>ยังไม่มีใบสั่งงานสำหรับรอบนี้</span>
                        </div>
                      ) : null}

                      {/* External Actual Executions in this month */}
                      {externalWos.map((ext) => (
                        <div
                          key={`ext-${ext.id}`}
                          className="p-2 rounded-lg bg-emerald-50/70 border border-emerald-200 text-emerald-950 text-[11px] space-y-1"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-mono font-bold">{ext.wo_code}</span>
                            <span className="text-[10px] text-emerald-800 bg-white/80 px-1 py-0.2 rounded font-sans">
                              {ext.planned_month ? `ตรวจจริงในเดือนนี้ (จากรอบแผน ${THAI_MONTH_NAMES_SHORT[ext.planned_month - 1]})` : 'ตรวจจริงนอกแผน'}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-[10.5px]">
                            <span>วันที่ตรวจจริง: <strong className="font-mono">{ext.performed_at}</strong></span>
                            <span>ผล: <strong>{ext.result_status}</strong></span>
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Section 4: Group Check Button if isGroup */}
            {isGroup && (
              <div className="p-3 bg-purple-50 rounded-xl border border-purple-200 space-y-2">
                <div className="flex items-center gap-1.5 text-purple-900 font-bold text-xs">
                  <ShieldAlert size={14} className="text-purple-700" />
                  <span>การควบคุมเครื่องมือแบบกลุ่ม (Group Control)</span>
                </div>
                <p className="text-[11px] text-purple-800 leading-relaxed">
                  เครื่องมือนี้เป็นกลุ่มแม่ มีเครื่องมือรายตัวใช้งานได้ {item.active_child_count || 0} ชิ้น
                  ต้องเลือกรหัสลูกก่อนออกใบสั่งงานจริงตามกฎมาตรฐาน QMS
                </p>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    if (onOpenGroupWorkOrderCheck) onOpenGroupWorkOrderCheck(item);
                  }}
                  className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
                >
                  <FolderTree size={12} />
                  <span>ตรวจรหัสลูกก่อนออกใบงาน</span>
                </button>
              </div>
            )}
          </div>

          {/* Drawer Footer Actions */}
          <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-2">
            {canEditPlan ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    if (onOpenAddItem) onOpenAddItem(item);
                  }}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
                >
                  <Edit2 size={12} />
                  <span>แก้ไข</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    if (onDeleteItem) onDeleteItem(item);
                  }}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
                >
                  <Trash2 size={12} />
                  <span>นำออกจากแผน</span>
                </button>
              </div>
            ) : (
              <div />
            )}

            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-semibold transition-colors cursor-pointer"
            >
              ปิดหน้าต่าง
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AnnualPlanSideInspector;
