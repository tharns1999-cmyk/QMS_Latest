import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ShieldAlert,
  AlertOctagon,
  RefreshCw,
  CheckCircle2,
  Clock,
  MapPin,
  Unlock,
  AlertTriangle,
  X
} from 'lucide-react';
import { fetchVccOnHoldTracker } from '../api/vccDashboardApi';
import { releaseVccWorkOrderHold } from '../api/vccWorkOrderApi';
import DepartmentBadge from '../../../shared/components/ui/DepartmentBadge';
import { formatVccDate } from '../utils/vccDateUtils';
import { useVccModalAccessibility } from '../hooks/useVccModalAccessibility';
import { VccDiscardConfirmDialog } from './VccDiscardConfirmDialog';

export default function VccOnHoldTrackerTab({ onNavigateToWorkOrder }) {
  const [trackerData, setTrackerData] = useState(null);
  const [filterDept, setFilterDept] = useState('');
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Release Hold Modal State
  const [selectedItem, setSelectedItem] = useState(null);
  const [impactAssessment, setImpactAssessment] = useState('');
  const [releaseReason, setReleaseReason] = useState('');
  const [submittingHold, setSubmittingHold] = useState(false);
  const [modalError, setModalError] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const data = await fetchVccOnHoldTracker({
        department: filterDept || undefined
      });
      setTrackerData(data);
    } catch (err) {
      setErrorMsg(err?.message || 'ไม่สามารถโหลดข้อมูลรายการระงับใช้ ได้');
    } finally {
      setLoading(false);
    }
  }, [filterDept]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleOpenReleaseModal = (item) => {
    setSelectedItem(item);
    setImpactAssessment(item.impact_assessment || '');
    setModalError('');
  };

  const handleCloseReleaseModal = () => {
    setSelectedItem(null);
    setImpactAssessment('');
    setReleaseReason('');
    setModalError('');
  };

  const isDirty = Boolean(releaseReason?.trim() || impactAssessment?.trim());

  const {
    dialogRef,
    requestClose,
    handleBackdropClick,
    showConfirmDiscard,
    confirmDiscard,
    cancelDiscard
  } = useVccModalAccessibility({
    isOpen: !!selectedItem,
    onClose: handleCloseReleaseModal,
    isDirty
  });

  const handleConfirmReleaseHold = async (e) => {
    e.preventDefault();
    if (!selectedItem?.wo_id) {
      setModalError('ไม่พบรหัสใบสั่งงานที่เชื่อมโยงกับเครื่องมือนี้');
      return;
    }
    const trimmed = String(impactAssessment || '').trim();
    const reason = releaseReason.trim();
    if (!reason) {
      setModalError('กรุณากรอกเหตุผลการปลดระงับและการแก้ไขที่ทำแล้ว');
      return;
    }
    if (!trimmed) {
      setModalError('กรุณากรอกผลการประเมินผลกระทบย้อนหลัง (NC Impact Assessment) ก่อนปลดระงับ');
      return;
    }

    setSubmittingHold(true);
    setModalError('');
    try {
      await releaseVccWorkOrderHold(selectedItem.wo_id, trimmed, reason);
      handleCloseReleaseModal();
      setSuccessMsg(`ปลดระงับการใช้งานเครื่องมือ ${selectedItem.asset_code} เรียบร้อยแล้ว`);
      await loadData();
    } catch (err) {
      setModalError(err?.message || 'ปลดระงับการใช้งานไม่สำเร็จ');
    } finally {
      setSubmittingHold(false);
    }
  };

  const items = trackerData?.items || [];
  const openNcCount = trackerData?.open_nc_count ?? 0;
  const totalItems = trackerData?.total_items ?? 0;

  const departmentList = useMemo(() => {
    const set = new Set();
    items.forEach((i) => {
      if (i.department) set.add(i.department);
    });
    return Array.from(set).sort();
  }, [items]);

  return (
    <div className="space-y-6 text-slate-800" data-testid="vcc-on-hold-tracker-tab">
      {/* 1. Toolbar & Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-2 border-b border-slate-200/80">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <ShieldAlert size={20} className="text-rose-600 shrink-0" />
            <div>
              <h2 className="text-base font-bold text-slate-900 tracking-tight">
                ติดตามเครื่องมือวัดระงับใช้และ NC
              </h2>
              <p className="text-xs text-slate-500">
                ระบบเฝ้าระวังเครื่องมือวัดที่ผลตรวจไม่ผ่านเกณฑ์ หรือเกิดข้อบกพร่องตามข้อกำหนด ISO 9001 / ISO/IEC 17025
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs text-slate-600">
            <span className="text-slate-400 font-normal">แผนก:</span>
            <select
              aria-label="กรองแผนกเครื่องมือระงับใช้"
              value={filterDept}
              onChange={(e) => setFilterDept(e.target.value)}
              className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-800 focus:outline-hidden cursor-pointer shadow-2xs"
            >
              <option value="">ทุกแผนก</option>
              {departmentList.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={loadData}
            title="รีเฟรชข้อมูล"
            className="h-8 w-8 inline-flex items-center justify-center rounded-lg bg-white hover:bg-slate-50 text-slate-600 border border-slate-200/90 transition-colors shadow-2xs cursor-pointer"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin text-indigo-600' : ''} />
          </button>
        </div>
      </div>

      {errorMsg && (
        <div role="alert" className="rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-sm font-medium text-rose-700">
          {errorMsg}
        </div>
      )}

      {successMsg && (
        <div data-testid="on-hold-success-banner" className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm font-semibold text-emerald-800">
          {successMsg}
        </div>
      )}

      {/* 2. Key Metrics Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 bg-white rounded-xl border border-slate-200/80 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              เครื่องมือที่ถูกระงับใช้
            </span>
            <div className="text-2xl font-bold font-mono text-rose-600 mt-1" data-testid="on-hold-count">
              {totalItems}
            </div>
          </div>
          <span className="p-3 bg-rose-50 text-rose-600 rounded-xl">
            <AlertOctagon size={24} />
          </span>
        </div>

        <div className="p-4 bg-white rounded-xl border border-slate-200/80 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              ข้อบกพร่องที่ยังเปิดอยู่ (NC)
            </span>
            <div className="text-2xl font-bold font-mono text-amber-600 mt-1" data-testid="open-nc-count">
              {openNcCount}
            </div>
          </div>
          <span className="p-3 bg-amber-50 text-amber-600 rounded-xl">
            <Clock size={24} />
          </span>
        </div>

        <div className="p-4 bg-white rounded-xl border border-slate-200/80 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              เกณฑ์การปลดระงับ (Hold Release)
            </span>
            <div className="text-xs font-medium text-slate-600 mt-1 leading-relaxed">
              ผู้อนุมัติระดับ <strong className="text-slate-900">L5+</strong> พร้อมบันทึกประเมินผลกระทบย้อนหลัง
            </div>
          </div>
          <span className="p-3 bg-slate-50 text-slate-600 rounded-xl">
            <Unlock size={24} />
          </span>
        </div>
      </div>

      {/* 3. Items Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-sm text-slate-400 font-medium">กำลังโหลดข้อมูล...</div>
        ) : items.length === 0 ? (
          <div className="py-16 text-center space-y-2" data-testid="on-hold-empty-state">
            <CheckCircle2 size={36} className="text-emerald-500 mx-auto" />
            <div className="text-sm font-semibold text-slate-800">
              ไม่มีเครื่องมือวัดหรือใบสั่งงานที่อยู่ในสถานะระงับใช้
            </div>
            <div className="text-xs text-slate-400">
              เครื่องมือวัดทั้งหมดพร้อมใช้งาน หรือได้รับการประเมินผลกระทบและปลดระงับเรียบร้อยแล้ว
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-50/75 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider text-xs">
                <tr>
                  <th className="py-3 px-4">เครื่องมือวัด</th>
                  <th className="py-3 px-3">แผนก / ตำแหน่ง</th>
                  <th className="py-3 px-3">ใบสั่งงานที่พบปัญหา</th>
                  <th className="py-3 px-3">ระยะเวลาระงับ</th>
                  <th className="py-3 px-4">การประเมินผลกระทบ (Impact Assessment)</th>
                  <th className="py-3 px-4 text-right">การจัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((item) => {
                  const days = item.days_on_hold ?? 0;
                  const daysBadgeClass =
                    days > 30
                      ? 'bg-rose-100 text-rose-800'
                      : days > 14
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-slate-100 text-slate-700';

                  return (
                    <tr key={`${item.asset_id}-${item.wo_id || 'no-wo'}`} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3.5 px-4 align-top">
                        <div className="font-mono font-bold text-slate-900 text-sm">{item.asset_code}</div>
                        <div className="font-medium text-slate-800 text-xs mt-0.5">{item.asset_name}</div>
                        <div className="text-xs text-slate-400 mt-0.5">{item.asset_type}</div>
                      </td>

                      <td className="py-3.5 px-3 align-top whitespace-nowrap">
                        <div className="flex flex-col gap-1">
                          <DepartmentBadge department={item.department} />
                          <span className="text-xs text-slate-500 inline-flex items-center gap-1">
                            <MapPin size={11} className="text-slate-400 shrink-0" />
                            {item.location || '-'}
                          </span>
                        </div>
                      </td>

                      <td className="py-3.5 px-3 align-top">
                        {item.wo_code ? (
                          <div>
                            <span className="font-mono font-bold text-slate-900 text-xs">{item.wo_code}</span>
                            <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                              <span className="px-1.5 py-0.5 rounded text-xs font-bold bg-rose-100 text-rose-700">
                                {item.result_status || 'FAIL'}
                              </span>
                              <span className="px-1.5 py-0.5 rounded text-xs font-semibold bg-rose-50 text-rose-800 border border-rose-200">
                                NC: {item.nc_status}
                              </span>
                            </div>
                            {item.result_remarks && (
                              <div className="text-xs text-slate-600 mt-1 italic line-clamp-2">
                                &ldquo;{item.result_remarks}&rdquo;
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">ระงับใช้ระดับทะเบียนเครื่องมือ</span>
                        )}
                      </td>

                      <td className="py-3.5 px-3 align-top whitespace-nowrap">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${daysBadgeClass}`}>
                          {days} วัน
                        </span>
                        {item.performed_at && (
                          <div className="text-xs text-slate-500 mt-1 font-sans" title={item.performed_at}>
                            บันทึกผล: {formatVccDate(item.performed_at)}
                          </div>
                        )}
                      </td>

                      <td className="py-3.5 px-4 align-top">
                        {item.impact_assessment ? (
                          <div className="p-2.5 rounded-lg bg-emerald-50/60 border border-emerald-200 text-xs text-emerald-900 leading-relaxed">
                            <div className="font-semibold text-emerald-800 text-xs mb-0.5">ผลการประเมิน:</div>
                            {item.impact_assessment}
                          </div>
                        ) : (
                          <div className="p-2.5 rounded-lg bg-amber-50/60 border border-amber-200 text-xs text-amber-900 leading-relaxed">
                            <div className="font-semibold text-amber-800 text-xs mb-0.5">รอการประเมิน:</div>
                            {item.recommendation}
                          </div>
                        )}
                      </td>

                      <td className="py-3.5 px-4 align-top text-right whitespace-nowrap">
                        {item.can_release_hold && item.wo_id ? (
                          <button
                            type="button"
                            onClick={() => handleOpenReleaseModal(item)}
                            data-testid={`release-hold-btn-${item.asset_code}`}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition-colors shadow-2xs cursor-pointer"
                          >
                            <Unlock size={13} />
                            <span>ปลดระงับ (L5+)</span>
                          </button>
                        ) : item.wo_code && onNavigateToWorkOrder ? (
                          <button
                            type="button"
                            onClick={() => onNavigateToWorkOrder(item.wo_id)}
                            className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 cursor-pointer"
                          >
                            ดูใบสั่งงาน
                          </button>
                        ) : (
                          <span className="text-xs text-slate-400 font-medium">รอผู้อนุมัติ L5+</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 4. Release Hold Confirmation Modal */}
      {selectedItem && (
        <>
          <div
            className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4"
            onClick={handleBackdropClick}
          >
            <div
              ref={dialogRef}
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="hold-release-title"
              tabIndex="-1"
              className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full overflow-hidden outline-none"
            >
              <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
                <div className="flex items-center gap-2">
                  <Unlock size={18} className="text-emerald-600" />
                  <h3 id="hold-release-title" className="text-base font-bold text-slate-900">
                    ปลดระงับการใช้งานเครื่องมือ
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={requestClose}
                  aria-label="ปิดหน้าต่าง"
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleConfirmReleaseHold} className="p-6 space-y-4">
                {modalError && (
                  <div role="alert" className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold flex items-center gap-2">
                    <AlertTriangle size={15} className="shrink-0" />
                    <span>{modalError}</span>
                  </div>
                )}

                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-slate-500">รหัสเครื่องมือ:</span>
                    <span className="font-mono font-bold text-slate-900">{selectedItem.asset_code}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">ชื่อเครื่องมือ:</span>
                    <span className="font-semibold text-slate-800">{selectedItem.asset_name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">ใบสั่งงาน:</span>
                    <span className="font-mono font-semibold text-slate-800">{selectedItem.wo_code}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">แผนก:</span>
                    <span className="font-semibold text-slate-800">{selectedItem.department}</span>
                  </div>
                </div>

                <div>
                  <label htmlFor="hold-release-reason" className="block text-xs font-bold text-slate-800 mb-1.5">
                    เหตุผลการปลดระงับและการแก้ไขที่ทำแล้ว <span className="text-rose-500">*</span>
                  </label>
                  <textarea
                    id="hold-release-reason"
                    required
                    rows={2}
                    value={releaseReason}
                    onChange={(e) => setReleaseReason(e.target.value)}
                    placeholder="เช่น ซ่อมและสอบเทียบซ้ำผ่าน ใบรับรองเลขที่..."
                    className="w-full rounded-xl border border-slate-300 p-3 text-xs text-slate-900 focus:outline-hidden focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 leading-relaxed"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1.5">
                    ผลการประเมินผลกระทบย้อนหลัง (NC Impact Assessment) <span className="text-rose-500">*</span>
                  </label>
                  <textarea
                    required
                    rows={4}
                    value={impactAssessment}
                    onChange={(e) => setImpactAssessment(e.target.value)}
                    placeholder="ระบุผลการตรวจสอบย้อนหลัง เช่น ตรวจสอบชิ้นงานหรือผลการผลิตย้อนหลังนับจากการสอบเทียบครั้งก่อน พบว่าไม่มีผลกระทบต่อคุณภาพผลิตภัณฑ์..."
                    className="w-full rounded-xl border border-slate-300 p-3 text-xs text-slate-900 focus:outline-hidden focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 leading-relaxed"
                  />
                  <p className="text-xs text-slate-400 mt-1">
                    ข้อกำหนด ISO 9001:2015 ข้อ 7.1.5.2 บังคับให้ประเมินความถูกต้องของผลการวัดที่ผ่านมาเมื่อพบว่าเครื่องมือไม่เป็นไปตามเกณฑ์
                  </p>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={requestClose}
                    disabled={submittingHold}
                    className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-50 cursor-pointer"
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="submit"
                    disabled={submittingHold}
                    data-testid="confirm-release-hold-btn"
                    className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-xs cursor-pointer inline-flex items-center gap-1.5"
                  >
                    <Unlock size={14} />
                    <span>{submittingHold ? 'กำลังปลดระงับ...' : 'ยืนยันปลดระงับการใช้งาน'}</span>
                  </button>
                </div>
              </form>
            </div>
          </div>

          <VccDiscardConfirmDialog
            isOpen={showConfirmDiscard}
            onConfirm={confirmDiscard}
            onCancel={cancelDiscard}
          />
        </>
      )}
    </div>
  );
}

