import React from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  CheckCircle2,
  Archive,
  AlertTriangle,
  Wrench,
  RotateCcw,
  Edit3,
  Clock,
  MapPin,
  Building2,
  Layers,
  ShieldCheck,
  FileText
} from 'lucide-react';
import { useVccModalAccessibility } from '../hooks/useVccModalAccessibility';

const ACTION_LABELS = {
  VCC_ASSET_CREATED: { label: 'เพิ่มเครื่องมือใหม่', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  VCC_ASSET_UPDATED: { label: 'แก้ไขข้อมูลเครื่องมือ', badge: 'bg-blue-50 text-blue-700 border-blue-200' },
  VCC_ASSET_RETIRED: { label: 'ปลดออกเครื่องมือ (Retire)', badge: 'bg-rose-50 text-rose-700 border-rose-200' },
  VCC_ASSET_REACTIVATED: { label: 'นำกลับมาใช้งาน (Reactivate)', badge: 'bg-amber-50 text-amber-700 border-amber-200' }
};

const FIELD_LABELS = {
  asset_code: 'รหัสเครื่องมือ',
  name: 'ชื่อเครื่องมือ',
  asset_type: 'ประเภท',
  serial_no: 'Serial No.',
  model: 'รุ่น (Model)',
  location: 'ที่ตั้ง',
  department: 'แผนก',
  is_group: 'รูปแบบกลุ่ม',
  parent_id: 'กลุ่มเครื่องมือเดิม',
  group_nature: 'ลักษณะหน่วยสอบเทียบ',
  composite_details: 'รายละเอียดอุปกรณ์ในชุด'
};

const formatThaiDateTime = (iso) => {
  if (!iso) return '-';
  try {
    return new Intl.DateTimeFormat('th-TH', {
      timeZone: 'Asia/Bangkok',
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(iso));
  } catch {
    return iso;
  }
};

export const AssetDetailDrawer = ({
  isOpen,
  onClose,
  loading = false,
  data = null,
  // Backward-compatibility props with AssetDetailHistoryModal
  detailModalOpen,
  setDetailModalOpen,
  loadingDetail,
  detailData,
  onEdit,
  onRetire,
  onReactivate,
  canManage = false
}) => {
  const isActualOpen = Boolean(isOpen ?? detailModalOpen);
  const actualOnClose = onClose || (() => setDetailModalOpen && setDetailModalOpen(false));
  const actualLoading = Boolean(loading || loadingDetail);
  const actualData = data || detailData;

  const {
    dialogRef,
    requestClose,
    handleBackdropClick
  } = useVccModalAccessibility({
    isOpen: isActualOpen,
    onClose: actualOnClose
  });

  if (!isActualOpen) return null;
  if (typeof document === 'undefined') return null;

  const asset = actualData?.asset || null;
  const history = actualData?.history || [];
  const isComposite = asset?.group_nature === 'COMPOSITE_SET';

  return createPortal(
    <div
      className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-end sm:items-stretch justify-end overflow-hidden animate-in fade-in duration-200"
      onClick={handleBackdropClick}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="asset-detail-history-title"
        tabIndex="-1"
        className="w-full sm:max-w-xl md:max-w-2xl bg-white shadow-2xl flex flex-col h-[90dvh] sm:h-full rounded-t-3xl sm:rounded-none sm:border-l border-slate-200 outline-none animate-in slide-in-from-bottom sm:slide-in-from-right duration-250 ease-out transition-transform"
      >
        {/* Mobile Drag Indicator */}
        <div className="sm:hidden w-12 h-1.5 bg-slate-300 rounded-full mx-auto mt-2.5 mb-1 shrink-0" />

        {/* Header */}
        <div className="px-5 sm:px-6 py-4 border-b border-slate-200 flex items-center justify-between shrink-0 bg-slate-50/70">
          <div className="space-y-0.5 min-w-0 pr-3">
            <h2 id="asset-detail-history-title" className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">
              รายละเอียดและประวัติการแก้ไข (Audit Log)
            </h2>
            <p className="text-xs text-slate-500 font-medium">
              ประวัติการเปลี่ยนแปลงและบันทึกคุณภาพของเครื่องมือวัด
            </p>
          </div>

          <button
            type="button"
            onClick={requestClose}
            aria-label="ปิด"
            title="ปิด"
            className="min-w-[44px] min-h-[44px] flex items-center justify-center p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 active:bg-slate-300 transition-colors cursor-pointer select-none shrink-0"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 sm:p-6 overflow-y-auto flex-1 overscroll-y-contain space-y-5">
          {actualLoading || !asset ? (
            <div className="py-16 text-center space-y-2">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-2 border-indigo-600 border-t-transparent" />
              <div className="text-sm text-slate-500 font-medium">กำลังโหลดรายละเอียดและประวัติเครื่องมือ...</div>
            </div>
          ) : (
            <>
              {/* SECTION 1: ข้อมูลทั่วไป (General Information) */}
              <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-2xs space-y-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                  <div className="flex items-center gap-2">
                    <FileText size={16} className="text-indigo-600 shrink-0" />
                    <h3 className="text-sm font-bold text-slate-900">ข้อมูลทั่วไปของเครื่องมือ</h3>
                  </div>
                  <div>
                    {asset.status === 'ACTIVE' ? (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-bold">
                        <CheckCircle2 size={13} />
                        ใช้งานปกติ
                      </span>
                    ) : asset.status === 'ON_HOLD' ? (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-300 text-xs font-bold">
                        <AlertTriangle size={13} />
                        ระงับใช้
                      </span>
                    ) : asset.status === 'UNDER_REPAIR' ? (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-sky-50 text-sky-800 border border-sky-300 text-xs font-bold">
                        <Wrench size={13} />
                        ซ่อมบำรุง
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-50 text-rose-800 border border-rose-200 text-xs font-bold">
                        <Archive size={13} />
                        ปลดออกแล้ว
                      </span>
                    )}
                  </div>
                </div>

                <div className="font-mono font-bold text-base sm:text-lg text-slate-900">
                  {asset.asset_code} — {asset.name}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs sm:text-sm text-slate-600">
                  <div>
                    <span className="font-semibold text-slate-900 block text-xs text-slate-500">ประเภท:</span>
                    <span className="text-slate-800">{asset.asset_type}</span>
                  </div>
                  <div>
                    <span className="font-semibold text-slate-900 block text-xs text-slate-500">Serial No.:</span>
                    <span className="font-mono text-slate-800">{asset.serial_no || '-'}</span>
                  </div>
                  <div>
                    <span className="font-semibold text-slate-900 block text-xs text-slate-500">รุ่น (Model):</span>
                    <span className="text-slate-800">{asset.model || '-'}</span>
                  </div>
                  <div className="col-span-2 sm:col-span-3">
                    <span className="font-semibold text-slate-900 block text-xs text-slate-500">ลักษณะหน่วย:</span>
                    {isComposite ? (
                      <span className="text-teal-700 font-bold inline-flex items-center gap-1 mt-0.5">
                        <Layers size={13} />
                        ชุดเครื่องมือ (Composite Set)
                      </span>
                    ) : (
                      <span className="mt-0.5 inline-block">เครื่องมือเดี่ยว</span>
                    )}
                  </div>
                  {isComposite && (
                    <div className="col-span-2 sm:col-span-3 text-teal-800 bg-teal-50/80 border border-teal-200 px-3.5 py-2.5 rounded-xl text-xs space-y-1">
                      <div className="font-bold flex items-center gap-1.5">
                        <Layers size={14} className="text-teal-700" />
                        ลักษณะ: ชุดเครื่องมือสอบเทียบร่วมกัน 1 หน่วย (Physical Composite Set)
                      </div>
                      {asset.composite_details && (
                        <div>
                          <span className="font-semibold">อุปกรณ์ในชุด:</span> {asset.composite_details}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* SECTION 2: สถานะและการสอบเทียบ (Status & Calibration Information) */}
              <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-2xs space-y-3">
                <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
                  <ShieldCheck size={16} className="text-indigo-600" />
                  <h3 className="text-sm font-bold text-slate-900">สถานะและการควบคุมคุณภาพ</h3>
                </div>

                {asset.status === 'ACTIVE' && (
                  <div className="text-xs text-slate-600 bg-emerald-50/60 border border-emerald-100 rounded-xl p-3 space-y-1">
                    <div className="font-bold text-emerald-900 flex items-center gap-1.5">
                      <CheckCircle2 size={14} className="text-emerald-700" />
                      สถานะ: ใช้งานปกติ (ACTIVE)
                    </div>
                    <p className="text-emerald-800">
                      เครื่องมือมีความพร้อมใช้งาน และสามารถวางแผนการทวนสอบ/สอบเทียบในแผนประจำปี (FM-QC-46) ได้ตามปกติ
                    </p>
                  </div>
                )}

                {asset.status === 'ON_HOLD' && (
                  <div className="text-xs text-slate-600 bg-amber-50/80 border border-amber-200 rounded-xl p-3 space-y-1">
                    <div className="font-bold text-amber-900 flex items-center gap-1.5">
                      <AlertTriangle size={14} className="text-amber-700" />
                      สถานะ: ระงับใช้ (ON_HOLD)
                    </div>
                    <p className="text-amber-800">
                      เครื่องมือถูกระงับใช้เนื่องจากผลการตรวจไม่ผ่านเกณฑ์ (FAIL) หรือติดข้อบกพร่อง (NC) การปลดระงับใช้ต้องดำเนินการผ่านหน้า “ใบสั่งงาน” โดยหัวหน้าแผนก (L5+) หรือ DCC พร้อมบันทึกผลการประเมินผลกระทบ
                    </p>
                  </div>
                )}

                {asset.status === 'UNDER_REPAIR' && (
                  <div className="text-xs text-slate-600 bg-sky-50/80 border border-sky-200 rounded-xl p-3 space-y-1">
                    <div className="font-bold text-sky-900 flex items-center gap-1.5">
                      <Wrench size={14} className="text-sky-700" />
                      สถานะ: ซ่อมบำรุง (UNDER_REPAIR)
                    </div>
                    <p className="text-sky-800">
                      เครื่องมืออยู่ระหว่างการส่งซ่อมบำรุง เมื่อซ่อมเสร็จต้องผ่านการทวนสอบ/สอบเทียบยืนยันความถูกต้องก่อนนำกลับมาใช้งานปกติ
                    </p>
                  </div>
                )}

                {asset.status === 'RETIRED' && (
                  <div className="text-xs text-slate-600 bg-rose-50/80 border border-rose-200 rounded-xl p-3 space-y-1.5">
                    <div className="font-bold text-rose-900 flex items-center gap-1.5">
                      <Archive size={14} className="text-rose-700" />
                      สถานะ: ปลดออกจากทะเบียนแล้ว (RETIRED)
                    </div>
                    <p className="text-rose-800">
                      เครื่องมือนี้ถูกปลดออกจากทะเบียนแล้ว เลิกใช้งานในระบบ แต่ข้อมูลและประวัติการสอบเทียบทั้งหมดถูกเก็บรักษาอย่างถาวรตามมาตรฐาน QMS
                    </p>
                    {asset.retired_reason && (
                      <div className="mt-1 text-xs text-rose-900 bg-white/80 border border-rose-200/80 rounded-lg px-2.5 py-1.5">
                        <span className="font-bold">เหตุผลที่ปลดออก:</span> {asset.retired_reason}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* SECTION 3: ผู้รับผิดชอบและสถานที่ (Ownership & Location) */}
              <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-2xs space-y-3">
                <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
                  <Building2 size={16} className="text-indigo-600" />
                  <h3 className="text-sm font-bold text-slate-900">ผู้รับผิดชอบและสถานที่จัดเก็บ</h3>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs sm:text-sm text-slate-600">
                  <div className="flex items-start gap-2.5">
                    <Building2 size={16} className="text-slate-400 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-semibold text-slate-900 block text-xs text-slate-500">แผนกเจ้าของเครื่องมือ:</span>
                      <span className="text-slate-800 font-medium">
                        {asset.department} {asset.department_name_th ? `— ${asset.department_name_th}` : ''}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-start gap-2.5">
                    <MapPin size={16} className="text-slate-400 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-semibold text-slate-900 block text-xs text-slate-500">สถานที่จัดเก็บ/จุดใช้งาน:</span>
                      <span className="text-slate-800 font-medium">{asset.location || 'ไม่ระบุที่ตั้ง'}</span>
                    </div>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                  <span className="text-slate-500">สิทธิ์ในการจัดการเครื่องมือ:</span>
                  <span
                    className={`inline-flex px-2.5 py-1 rounded-lg border font-semibold ${
                      canManage
                        ? 'bg-indigo-50 text-indigo-800 border-indigo-200'
                        : 'bg-slate-50 text-slate-600 border-slate-200'
                    }`}
                  >
                    {canManage ? 'คุณมีสิทธิ์จัดการเครื่องมือนี้' : 'คุณมีสิทธิ์ดูข้อมูลอย่างเดียว'}
                  </span>
                </div>
              </div>

              {/* SECTION 4: ประวัติการใช้งานและ Audit Log */}
              <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-2xs space-y-3.5">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                  <div className="flex items-center gap-2">
                    <Clock size={16} className="text-indigo-600" />
                    <h3 className="text-sm font-bold text-slate-900">
                      ประวัติการแก้ไข (Audit Log: VCC_ASSET_*)
                    </h3>
                  </div>
                  <span className="text-xs text-slate-500 font-medium">
                    {history.length} รายการ
                  </span>
                </div>

                {history.length === 0 ? (
                  <div className="py-6 text-center text-xs text-slate-500">ไม่พบประวัติการแก้ไข</div>
                ) : (
                  <div className="space-y-3">
                    {history.map((h) => {
                      const meta = ACTION_LABELS[h.action] || {
                        label: h.action,
                        badge: 'bg-slate-100 text-slate-700 border-slate-200'
                      };
                      const details = h.details || {};
                      const changedKeys =
                        h.action === 'VCC_ASSET_UPDATED' && details.before && details.after
                          ? Object.keys(details.after).filter(
                              (k) => String(details.before[k] ?? '') !== String(details.after[k] ?? '')
                            )
                          : [];

                      return (
                        <div key={h.id} className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/50 space-y-2 text-xs">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className={`px-2.5 py-0.5 rounded-md border font-bold text-[11px] ${meta.badge}`}>
                              {meta.label} ({h.action})
                            </span>
                            <span className="text-slate-500 font-medium">
                              {formatThaiDateTime(h.at)} • โดย {h.actor_name || h.actor_id || 'DCC'}
                            </span>
                          </div>

                          {details.reason && (
                            <div className="text-slate-800 bg-white px-3 py-1.5 rounded-lg border border-slate-200">
                              <span className="font-bold">เหตุผล:</span> {details.reason}
                            </div>
                          )}

                          {changedKeys.length > 0 && (
                            <div className="space-y-1 pt-1">
                              {changedKeys.map((k) => (
                                <div key={k} className="text-slate-700">
                                  <span className="font-semibold">{FIELD_LABELS[k] || k}:</span>{' '}
                                  <span className="line-through text-rose-600">{String(details.before[k] || '-')}</span>{' '}
                                  → <span className="font-semibold text-emerald-700">{String(details.after[k] || '-')}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 sm:px-6 py-4 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0 pb-[max(1rem,env(safe-area-inset-bottom,0px))]">
          <div className="flex items-center gap-2">
            {canManage && asset && asset.status === 'ACTIVE' && onEdit && (
              <button
                type="button"
                onClick={() => {
                  requestClose();
                  onEdit(asset);
                }}
                className="min-h-[44px] inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-indigo-200 bg-indigo-50 text-indigo-700 text-xs font-semibold hover:bg-indigo-100 cursor-pointer select-none"
              >
                <Edit3 size={14} />
                <span>แก้ไขเครื่องมือ</span>
              </button>
            )}

            {canManage && asset && asset.status === 'ACTIVE' && onRetire && (
              <button
                type="button"
                onClick={() => {
                  requestClose();
                  onRetire(asset);
                }}
                className="min-h-[44px] inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-rose-200 bg-rose-50 text-rose-700 text-xs font-semibold hover:bg-rose-100 cursor-pointer select-none"
              >
                <Archive size={14} />
                <span>ปลดออกจากทะเบียน</span>
              </button>
            )}

            {canManage && asset && asset.status === 'RETIRED' && onReactivate && (
              <button
                type="button"
                onClick={() => {
                  requestClose();
                  onReactivate(asset);
                }}
                className="min-h-[44px] inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-amber-300 bg-amber-50 text-amber-800 text-xs font-semibold hover:bg-amber-100 cursor-pointer select-none"
              >
                <RotateCcw size={14} />
                <span>นำกลับมาใช้</span>
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={requestClose}
            className="w-full sm:w-auto min-h-[44px] sm:min-h-[40px] px-5 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-xs sm:text-sm font-semibold cursor-pointer active:scale-[0.98] select-none text-center"
          >
            ปิดหน้าต่าง
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default AssetDetailDrawer;
