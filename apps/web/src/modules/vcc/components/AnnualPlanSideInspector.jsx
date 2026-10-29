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
        <div className="w-screen max-w-lg bg-white shadow-2xl flex flex-col border-l border-slate-200">
          {/* Drawer Header */}
          <div className="p-5 bg-slate-50 border-b border-slate-200 flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono font-bold text-lg text-slate-900">
                  {item.asset_code}
                </span>
                <span className="px-2.5 py-0.5 rounded-md text-xs font-semibold bg-indigo-100 text-indigo-800">
                  {item.asset_type}
                </span>
                {isGroup && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-semibold bg-purple-100 text-purple-800">
                    <FolderTree size={12} />
                    <span>กลุ่มแม่</span>
                  </span>
                )}
              </div>
              <h3 className="text-base font-semibold text-slate-900 mt-1.5 leading-snug">
                {item.asset_name}
              </h3>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="ปิดหน้าต่างสเปก"
              className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors cursor-pointer"
              title="ปิด"
            >
              <X size={20} />
            </button>
          </div>

          {/* Drawer Scrollable Content */}
          <div className="flex-1 overflow-y-auto p-5 space-y-5 text-sm text-slate-700">
            {/* Section 1: Specs & Location */}
            <div className="bg-slate-50/80 p-4 rounded-xl border border-slate-200/80 space-y-3">
              <h4 className="font-bold text-slate-900 flex items-center gap-2 text-sm">
                <Wrench size={15} className="text-slate-500" />
                <span>ข้อมูลจำเพาะและสถานที่ติดตั้ง</span>
              </h4>

              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <span className="text-slate-500 block text-xs font-medium">รุ่น (Model)</span>
                  <span className="font-semibold text-slate-900 text-sm">{item.model || '-'}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-xs font-medium">หมายเลขประจำเครื่อง (Serial)</span>
                  <span className="font-semibold font-mono text-slate-900 text-sm">{item.serial_no || '-'}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-xs font-medium">ตำแหน่งที่ตั้ง (Location)</span>
                  <span className="font-semibold text-slate-900 text-sm flex items-center gap-1.5">
                    <MapPin size={13} className="text-slate-400 shrink-0" />
                    <span>{item.location || '-'}</span>
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block text-xs font-medium">แผนกผู้รับผิดชอบ</span>
                  <span className="font-semibold text-slate-900 text-sm flex items-center gap-1.5">
                    <Building2 size={13} className="text-slate-400 shrink-0" />
                    <span>แผนก {item.responsible_dept} ({item.responsible_label || '-'})</span>
                  </span>
                </div>
              </div>
            </div>

            {/* Section 2: Calibration Rules & Evidence */}
            <div className="bg-slate-50/80 p-4 rounded-xl border border-slate-200/80 space-y-3">
              <h4 className="font-bold text-slate-900 flex items-center gap-2 text-sm">
                <Layers size={15} className="text-slate-500" />
                <span>เกณฑ์การทวนสอบและวันครบกำหนด</span>
              </h4>

              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <span className="text-slate-500 block text-xs font-medium">หน่วยงาน/วิธีทวนสอบ</span>
                  <span className="font-semibold text-slate-900 text-sm">{item.provider_name}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-xs font-medium">ความถี่รอบการตรวจ</span>
                  <span className="font-semibold text-slate-900 text-sm">{item.frequency_label || 'รายปี'}</span>
                </div>
                <div className="col-span-2">
                  <span className="text-slate-500 block text-xs font-medium">วันครบกำหนดตามเกณฑ์</span>
                  <span className="font-bold font-mono text-slate-900 text-sm">
                    {(item.due_dates || []).join(', ') || '-'}
                  </span>
                </div>
                <div className="col-span-2">
                  <span className="text-slate-500 block text-xs font-medium mb-1">สถานะหลักฐานในระบบ</span>
                  {hasHoldOrNc ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-rose-50 border border-rose-200 text-rose-800 font-semibold text-xs">
                      <AlertTriangle size={14} className="text-rose-700" />
                      <span>พบข้อบกพร่อง / ระงับใช้ (ON_HOLD / FAIL)</span>
                    </span>
                  ) : isAllPlannedCompleted ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-800 font-semibold text-xs">
                      <CheckCircle2 size={14} className="text-emerald-700" />
                      <span>ทวนสอบเสร็จครบทุกรอบ • มีใบรับรอง ({closedPassWos.length}/{plannedCount})</span>
                    </span>
                  ) : closedPassWos.length > 0 ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-indigo-50 border border-indigo-200 text-indigo-900 font-semibold text-xs">
                      <CheckCircle2 size={14} className="text-indigo-700" />
                      <span>ทวนสอบเสร็จแล้วบางรอบ ({closedPassWos.length}/{plannedCount} รอบ)</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-50 border border-amber-200 text-amber-900 font-semibold text-xs">
                      <Clock size={14} className="text-amber-700" />
                      <span>วางแผนเท่านั้น • ยังไม่มีหลักฐานใบงานปิดงาน</span>
                    </span>
                  )}
                </div>
                {item.remarks && (
                  <div className="col-span-2">
                    <span className="text-slate-500 block text-xs font-medium">หมายเหตุ</span>
                    <span className="text-slate-700 text-sm">{item.remarks}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Section 3: 12-Month Schedule Timeline */}
            <div className="space-y-2.5">
              <h4 className="font-bold text-slate-900 flex items-center gap-2 text-sm">
                <Calendar size={15} className="text-slate-500" />
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
                    <div key={m} className="p-3.5 space-y-2.5">
                      {/* Month Header */}
                      <div className="flex items-center justify-between">
                        <div className="font-bold text-slate-900 flex items-center gap-2 text-sm">
                          <span>เดือนที่ {m} ({THAI_MONTH_NAMES[m - 1]})</span>
                          {isPlanned && (
                            <span className="px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-700 font-mono text-xs font-bold">
                              Plan P{m}
                            </span>
                          )}
                        </div>

                        {isPlanned && item.due_dates && (
                          <span className="font-mono text-xs font-medium text-slate-500">
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
                              className={`p-3 rounded-xl border text-xs space-y-1.5 ${
                                w.nc_status === 'OPEN' || w.result_status === 'FAIL'
                                  ? 'bg-rose-50 border-rose-200 text-rose-950'
                                  : w.status === 'CLOSED'
                                  ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
                                  : 'bg-amber-50 border-amber-200 text-amber-950'
                              }`}
                            >
                              <div className="flex items-center justify-between font-mono font-bold text-sm">
                                <span>{w.wo_code}</span>
                                <span className="text-xs uppercase px-2 py-0.5 rounded bg-white/80 font-bold">
                                  {w.status}
                                </span>
                              </div>

                              {w.performed_at && (
                                <div className="text-xs font-medium">
                                  <span>วันที่ตรวจจริง: <strong className="font-mono font-bold">{w.performed_at}</strong></span>
                                  {isDelayed && (
                                    <span className="block text-xs text-indigo-700 font-semibold mt-0.5">
                                      ↳ ดำเนินการจริงในเดือน {THAI_MONTH_NAMES[actualMonth - 1]} (ล่าช้ากว่ารอบแผน)
                                    </span>
                                  )}
                                </div>
                              )}

                              <div className="flex items-center justify-between text-xs font-medium">
                                <span>ผลตรวจ: <strong className="font-bold">{w.result_status || 'รอดำเนินการ'}</strong></span>
                                {w.certificate_no && (
                                  <span className="font-mono font-semibold">Cert: {w.certificate_no}</span>
                                )}
                              </div>
                            </div>
                          );
                        })
                      ) : isPlanned ? (
                        <div className="text-xs text-amber-800 bg-amber-50/60 p-2 rounded-lg border border-amber-200 flex items-center gap-1.5 font-medium">
                          <Clock size={13} className="shrink-0 text-amber-600" />
                          <span>ยังไม่มีใบสั่งงานสำหรับรอบนี้</span>
                        </div>
                      ) : null}

                      {/* External Actual Executions in this month */}
                      {externalWos.map((ext) => (
                        <div
                          key={`ext-${ext.id}`}
                          className="p-3 rounded-xl bg-emerald-50/70 border border-emerald-200 text-emerald-950 text-xs space-y-1.5"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-mono font-bold text-sm">{ext.wo_code}</span>
                            <span className="text-xs text-emerald-800 bg-white/80 px-2 py-0.5 rounded font-sans font-bold">
                              {ext.planned_month ? `ตรวจจริงในเดือนนี้ (จากรอบแผน ${THAI_MONTH_NAMES_SHORT[ext.planned_month - 1]})` : 'ตรวจจริงนอกแผน'}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-xs font-medium">
                            <span>วันที่ตรวจจริง: <strong className="font-mono font-bold">{ext.performed_at}</strong></span>
                            <span>ผล: <strong className="font-bold">{ext.result_status}</strong></span>
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
              <div className="p-4 bg-purple-50 rounded-xl border border-purple-200 space-y-2.5">
                <div className="flex items-center gap-2 text-purple-950 font-bold text-sm">
                  <ShieldAlert size={16} className="text-purple-700" />
                  <span>การควบคุมเครื่องมือแบบกลุ่ม (Group Control)</span>
                </div>
                <p className="text-xs sm:text-sm text-purple-900 leading-relaxed font-medium">
                  เครื่องมือนี้เป็นกลุ่มแม่ มีเครื่องมือรายตัวใช้งานได้ {item.active_child_count || 0} ชิ้น
                  ต้องเลือกรหัสลูกก่อนออกใบสั่งงานจริงตามกฎมาตรฐาน QMS
                </p>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    if (onOpenGroupWorkOrderCheck) onOpenGroupWorkOrderCheck(item);
                  }}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold shadow-2xs transition-colors cursor-pointer"
                >
                  <FolderTree size={15} />
                  <span>ตรวจรหัสลูกก่อนออกใบงาน</span>
                </button>
              </div>
            )}
          </div>

          {/* Drawer Footer Actions */}
          <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3">
            {canEditPlan ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    if (onOpenAddItem) onOpenAddItem(item);
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 text-sm font-semibold shadow-2xs transition-colors cursor-pointer"
                >
                  <Edit2 size={14} />
                  <span>แก้ไข</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    if (onDeleteItem) onDeleteItem(item);
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-sm font-semibold shadow-2xs transition-colors cursor-pointer"
                >
                  <Trash2 size={14} />
                  <span>นำออกจากแผน</span>
                </button>
              </div>
            ) : (
              <div />
            )}

            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-800 text-sm font-semibold transition-colors cursor-pointer"
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
