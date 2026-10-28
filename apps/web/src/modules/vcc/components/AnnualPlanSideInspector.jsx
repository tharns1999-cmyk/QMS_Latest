import React from 'react';
import {
  X,
  FileText,
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
  Wrench
} from 'lucide-react';

const THAI_MONTH_NAMES = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
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

            {/* Section 2: Calibration Rules */}
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
                  {item.completion_status === 'COMPLETED' ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-800 font-semibold text-[11px] mt-0.5">
                      <CheckCircle2 size={12} className="text-emerald-700" />
                      <span>ทวนสอบเสร็จแล้ว • มีใบรับรอง</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-50 border border-amber-200 text-amber-900 font-semibold text-[11px] mt-0.5">
                      <Clock size={12} className="text-amber-700" />
                      <span>วางแผนเท่านั้น • ยังไม่มีหลักฐานใบงาน</span>
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
                  const wos = matchingWos.filter((w) => Number(w.planned_month) === m);
                  if (!isPlanned && wos.length === 0) return null;

                  return (
                    <div key={m} className="p-2.5 flex items-start justify-between gap-2 text-xs">
                      <div className="space-y-0.5">
                        <div className="font-semibold text-slate-800 flex items-center gap-1.5">
                          <span>เดือนที่ {m} ({THAI_MONTH_NAMES[m - 1]})</span>
                          {isPlanned && (
                            <span className="px-1.5 py-0.2 rounded bg-indigo-100 text-indigo-700 font-mono text-[10px] font-bold">
                              Plan
                            </span>
                          )}
                        </div>

                        {wos.length > 0 ? (
                          wos.map((w) => (
                            <div key={w.id} className="text-[11px] text-slate-600 flex items-center gap-1 pt-0.5">
                              <FileText size={11} className="text-slate-400" />
                              <span className="font-mono font-medium">{w.wo_code}</span>
                              <span>• {w.status}</span>
                              {w.certificate_no && (
                                <span className="text-emerald-700 font-mono font-bold">
                                  Cert: {w.certificate_no}
                                </span>
                              )}
                            </div>
                          ))
                        ) : (
                          <div className="text-[11px] text-amber-700">
                            ยังไม่มีใบสั่งงาน
                          </div>
                        )}
                      </div>

                      <div className="text-right font-mono text-[11px] text-slate-500">
                        {item.due_dates && item.due_dates[(item.planned_months || []).indexOf(m)]}
                      </div>
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
