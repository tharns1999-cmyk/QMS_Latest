import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  FileCheck2,
  FileSpreadsheet,
  Download,
  RefreshCw,
  Search,
  Filter,
  CheckCircle,
  AlertTriangle,
  Clock,
  ShieldAlert,
  Hash,
  ExternalLink,
  Copy,
  Check,
  Building2,
  Layers
} from 'lucide-react';
import {
  fetchVccComplianceReport,
  exportVccComplianceReportCsv,
  exportVccComplianceReportExcel
} from '../api/vccDashboardApi';
import { downloadVccWorkOrderCertificate } from '../api/vccWorkOrderApi';
import { DigitalRecordModal } from './DigitalRecordModal';
import DepartmentBadge from '../../../shared/components/ui/DepartmentBadge';
import useStore from '../../../store/useStore';
import { canReadAllVccDepartments, filterReadableDepartments } from '../utils/departmentScope';

const VERDICT_OPTIONS = [
  { value: '', label: 'ทุกผลการประเมิน (All Verdicts)' },
  { value: 'COMPLIANT', label: 'เป็นไปตามเกณฑ์ (COMPLIANT)' },
  { value: 'COMPLIANT_AMENDED', label: 'เป็นไปตามเกณฑ์-แก้ไขผล (COMPLIANT_AMENDED)' },
  { value: 'NON_COMPLIANT_OVERDUE', label: 'ไม่เป็นไปตามเกณฑ์-เลยกำหนด (OVERDUE)' },
  { value: 'NON_COMPLIANT_HOLD', label: 'ไม่เป็นไปตามเกณฑ์-ระงับใช้ (ON_HOLD/FAIL)' },
  { value: 'IN_PROGRESS', label: 'อยู่ระหว่างดำเนินการ (IN_PROGRESS)' },
  { value: 'CANCELLED', label: 'ยกเลิกตามเกณฑ์ (CANCELLED)' }
];

const triggerBlobDownload = (textOrBlob, filename, mimeType = 'text/csv;charset=utf-8;') => {
  try {
    if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
      const blob = typeof textOrBlob === 'string' ? new Blob([textOrBlob], { type: mimeType }) : textOrBlob;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }
  } catch {
    // fallback
  }
};

export default function VccComplianceReportTab() {
  const currentYear = useMemo(() => new Date().getFullYear(), []);
  const [year, setYear] = useState(currentYear);
  const [department, setDepartment] = useState('');
  const currentUser = useStore((s) => s.currentUser);
  const departmentOptions = useMemo(
    () => filterReadableDepartments(currentUser, ['DC', 'QC', 'QA', 'MGT', 'LB', 'PD', 'WH', 'ENG']),
    [currentUser]
  );
  const [verdict, setVerdict] = useState('');
  const [status, setStatus] = useState('');
  const [resultStatus, setResultStatus] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  const availableYears = useMemo(() => {
    const list = [currentYear - 2, currentYear - 1, currentYear, currentYear + 1, currentYear + 2];
    if (!list.includes(year)) list.push(year);
    return Array.from(new Set(list)).sort((a, b) => a - b);
  }, [currentYear, year]);

  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [exportMsg, setExportMsg] = useState('');
  const [exporting, setExporting] = useState(false);

  // Digital Record Modal State
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [copiedHash, setCopiedHash] = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const data = await fetchVccComplianceReport({
        year,
        department: department || undefined,
        verdict: verdict || undefined,
        status: status || undefined,
        result_status: resultStatus || undefined,
        asset_code: searchTerm || undefined
      });
      setReportData(data);
    } catch (err) {
      setErrorMsg(err?.message || 'ไม่สามารถโหลดรายงานตรวจสอบย้อนกลับ (Compliance Report) ได้');
    } finally {
      setLoading(false);
    }
  }, [year, department, verdict, status, resultStatus, searchTerm]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleExportCsv = async () => {
    setExporting(true);
    setErrorMsg('');
    setExportMsg('');
    try {
      const csvText = await exportVccComplianceReportCsv({
        year,
        department: department || undefined,
        status: status || undefined,
        result_status: resultStatus || undefined,
        verdict: verdict || undefined,
        asset_code: searchTerm || undefined
      });
      triggerBlobDownload(csvText, `VCC_Compliance_Report_${year}${department ? `_${department}` : ''}.csv`);
      setExportMsg(`ส่งออกรายงาน Compliance Report (${year}) เป็นไฟล์ CSV สำเร็จ`);
    } catch (err) {
      setErrorMsg(err?.message || 'ส่งออกรายงาน CSV ไม่สำเร็จ');
    } finally {
      setExporting(false);
    }
  };

  const handleExportExcel = () => {
    if (!reportData?.records?.length) {
      setErrorMsg('ไม่มีข้อมูลสำหรับส่งออก Excel');
      return;
    }
    setExporting(true);
    setErrorMsg('');
    setExportMsg('');
    try {
      exportVccComplianceReportExcel(reportData.records, {
        year,
        department: department || undefined
      });
      setExportMsg(`ส่งออกรายงาน Compliance Report (${year}) เป็นไฟล์ Excel (.xlsx) สำเร็จ`);
    } catch (err) {
      setErrorMsg(err?.message || 'ส่งออกไฟล์ Excel ไม่สำเร็จ');
    } finally {
      setExporting(false);
    }
  };

  const handleCopyHash = (hash) => {
    if (!hash) return;
    try {
      navigator.clipboard?.writeText(hash);
      setCopiedHash(hash);
      setTimeout(() => setCopiedHash(null), 2500);
    } catch {
      // ignore
    }
  };

  const handleDownloadCert = async (workOrderId) => {
    try {
      const blob = await downloadVccWorkOrderCertificate(workOrderId, { purpose: 'download' });
      triggerBlobDownload(blob, `Certificate_${workOrderId}.pdf`, 'application/pdf');
    } catch (err) {
      alert(err?.message || 'ดาวน์โหลดไฟล์ใบรับรองไม่สำเร็จ');
    }
  };

  const records = reportData?.records || [];
  const summary = reportData?.summary || {};
  const hasRecords = Boolean(summary.total_records && summary.total_records > 0);
  const complianceRate = summary.compliance_rate;
  const complianceRateDisplay = hasRecords && complianceRate !== null && complianceRate !== undefined
    ? `${complianceRate}%`
    : 'N/A';

  return (
    <div className="space-y-6 text-slate-800" data-testid="vcc-compliance-report-tab">
      {/* 1. Header Toolbar */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 pb-2 border-b border-slate-200/80">
        <div>
          <div className="flex items-center gap-2">
            <FileCheck2 size={20} className="text-indigo-600 shrink-0" />
            <h2 className="text-base font-bold text-slate-900 tracking-tight">
              รายงานการตรวจสอบย้อนกลับสำหรับผู้ตรวจประเมิน (Compliance Report for Auditor)
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            สอดคล้องตามข้อกำหนด ISO 9001:2015 (ข้อ 7.1.5), ISO/IEC 17025:2017 (ข้อ 7.8) และ FSSC 22000
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={exporting || loading}
            data-testid="export-compliance-csv-btn"
            className="h-8 inline-flex items-center gap-1.5 px-3 rounded-lg bg-white hover:bg-slate-50 text-slate-700 border border-slate-200/90 text-xs font-semibold transition-colors shadow-2xs cursor-pointer"
          >
            <Download size={14} className="text-emerald-600 shrink-0" />
            <span>ส่งออก CSV (UTF-8 BOM)</span>
          </button>

          <button
            type="button"
            onClick={handleExportExcel}
            disabled={exporting || loading}
            data-testid="export-compliance-excel-btn"
            className="h-8 inline-flex items-center gap-1.5 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition-colors shadow-2xs cursor-pointer"
          >
            <FileSpreadsheet size={14} className="shrink-0" />
            <span>ส่งออก Excel (.xlsx)</span>
          </button>

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

      {exportMsg && (
        <div data-testid="compliance-export-success-banner" className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm font-semibold text-emerald-800">
          {exportMsg}
        </div>
      )}

      {/* 2. Compliance KPI Summary Strip */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="p-4 bg-white rounded-xl border border-slate-200/80 shadow-2xs">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
            ใบสั่งงานที่ตรวจประเมิน
          </span>
          <div className="text-2xl font-bold font-mono text-slate-900 mt-1" data-testid="summary-total-records">
            {summary.total_records ?? 0}
          </div>
          <span className="text-[11px] text-slate-400 mt-1 block">รอบปี {year}</span>
        </div>

        <div className="p-4 bg-white rounded-xl border border-slate-200/80 shadow-2xs">
          <span className="text-[11px] font-semibold text-emerald-700 uppercase tracking-wider">
            ผ่านเกณฑ์สมบูรณ์ (PASS)
          </span>
          <div className="text-2xl font-bold font-mono text-emerald-600 mt-1" data-testid="summary-compliant-count">
            {summary.compliant_count ?? 0}
          </div>
          <span className="text-[11px] text-emerald-600/80 mt-1 block">
            แก้ไขผล (Amended): {summary.compliant_amended_count ?? 0}
          </span>
        </div>

        <div className="p-4 bg-white rounded-xl border border-slate-200/80 shadow-2xs">
          <span className="text-[11px] font-semibold text-amber-700 uppercase tracking-wider">
            เลยกำหนดตามเกณฑ์
          </span>
          <div className="text-2xl font-bold font-mono text-amber-600 mt-1" data-testid="summary-overdue-count">
            {summary.non_compliant_overdue_count ?? 0}
          </div>
          <span className="text-[11px] text-amber-700/80 mt-1 block">นับจาก Required Due Date</span>
        </div>

        <div className="p-4 bg-white rounded-xl border border-slate-200/80 shadow-2xs">
          <span className="text-[11px] font-semibold text-rose-700 uppercase tracking-wider">
            ไม่ผ่านเกณฑ์ / ระงับใช้
          </span>
          <div className="text-2xl font-bold font-mono text-rose-600 mt-1" data-testid="summary-hold-count">
            {summary.non_compliant_hold_count ?? 0}
          </div>
          <span className="text-[11px] text-rose-600/80 mt-1 block">สถานะ ON_HOLD หรือ FAIL</span>
        </div>

        <div className="p-4 bg-white rounded-xl border border-slate-200/80 shadow-2xs col-span-2 md:col-span-1">
          <span className="text-[11px] font-semibold text-indigo-700 uppercase tracking-wider">
            อัตราความสอดคล้อง (Rate)
          </span>
          <div
            className={`text-2xl font-bold font-mono mt-1 ${
              !hasRecords || complianceRate === null || complianceRate === undefined
                ? 'text-slate-400'
                : complianceRate >= 95
                ? 'text-emerald-600'
                : complianceRate >= 80
                ? 'text-amber-600'
                : 'text-rose-600'
            }`}
            data-testid="summary-compliance-rate"
          >
            {complianceRateDisplay}
          </div>
          <span className="text-[11px] text-slate-400 mt-1 block">
            {hasRecords ? 'เกณฑ์มาตรฐาน QMS: 95%' : 'ไม่มีข้อมูลการตรวจประเมิน'}
          </span>
        </div>
      </div>

      {/* 3. Filters Control Bar */}
      <div className="p-4 bg-white rounded-xl border border-slate-200/80 shadow-2xs flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-600">ปี:</span>
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            aria-label="เลือกปีรายงาน Compliance"
            className="h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-900 cursor-pointer shadow-2xs"
          >
            {availableYears.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-600">แผนก:</span>
          <select
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
            aria-label="เลือกแผนกรายงาน Compliance"
            className="h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-900 cursor-pointer shadow-2xs"
          >
            <option value="">{canReadAllVccDepartments(currentUser) ? 'ทุกแผนก' : 'แผนกของฉัน'}</option>
            {departmentOptions.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-600">ผลประเมิน (Verdict):</span>
          <select
            value={verdict}
            onChange={(e) => setVerdict(e.target.value)}
            aria-label="เลือก Verdict รายงาน Compliance"
            className="h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-900 cursor-pointer shadow-2xs"
          >
            {VERDICT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex-1 min-w-[200px] relative">
          <Search size={14} className="absolute left-2.5 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="ค้นหารหัส หรือชื่อเครื่องมือ..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            aria-label="ค้นหาเครื่องมือวัด"
            className="w-full h-8 pl-8 pr-3 rounded-lg border border-slate-200 text-xs text-slate-900 focus:outline-hidden focus:border-indigo-500 shadow-2xs"
          />
        </div>
      </div>

      {/* 4. Traceability Records Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-sm text-slate-400 font-medium">กำลังค้นหารายการตรวจสอบย้อนกลับ...</div>
        ) : records.length === 0 ? (
          <div className="py-16 text-center space-y-2" data-testid="compliance-empty-state">
            <CheckCircle size={36} className="text-slate-300 mx-auto" />
            <div className="text-sm font-semibold text-slate-700">ไม่พบรายการที่ตรงกับเงื่อนไขการค้นหา</div>
            <div className="text-xs text-slate-400">ลองปรับเปลี่ยนตัวกรอง หรือค้นหาใหม่อีกครั้ง</div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-50/75 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="py-3 px-3">ใบสั่งงาน / วันที่</th>
                  <th className="py-3 px-3">เครื่องมือวัด & แผนก</th>
                  <th className="py-3 px-3">การสอบเทียบ & Traceability</th>
                  <th className="py-3 px-3">วันครบกำหนด (Required / Scheduled)</th>
                  <th className="py-3 px-3">ผลการตรวจ & ใบรับรอง</th>
                  <th className="py-3 px-3">หลักฐานดิจิทัล (Hash)</th>
                  <th className="py-3 px-3 text-right">ผลการประเมิน (Verdict)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {records.map((r) => {
                  let verdictBadgeClass = 'bg-slate-100 text-slate-700';
                  let verdictLabel = r.verdict;

                  if (r.verdict === 'COMPLIANT') {
                    verdictBadgeClass = 'bg-emerald-100 text-emerald-800 border-emerald-200';
                    verdictLabel = 'COMPLIANT';
                  } else if (r.verdict === 'COMPLIANT_AMENDED') {
                    verdictBadgeClass = 'bg-blue-100 text-blue-800 border-blue-200';
                    verdictLabel = 'COMPLIANT (AMENDED)';
                  } else if (r.verdict === 'NON_COMPLIANT_OVERDUE') {
                    verdictBadgeClass = 'bg-amber-100 text-amber-900 border-amber-300';
                    verdictLabel = 'NON-COMPLIANT (OVERDUE)';
                  } else if (r.verdict === 'NON_COMPLIANT_HOLD') {
                    verdictBadgeClass = 'bg-rose-100 text-rose-800 border-rose-300';
                    verdictLabel = 'NON-COMPLIANT (HOLD)';
                  } else if (r.verdict === 'IN_PROGRESS') {
                    verdictBadgeClass = 'bg-slate-100 text-slate-700';
                    verdictLabel = 'IN PROGRESS';
                  } else if (r.verdict === 'CANCELLED') {
                    verdictBadgeClass = 'bg-slate-200 text-slate-600';
                    verdictLabel = 'CANCELLED';
                  }

                  return (
                    <tr key={r.wo_id} className="hover:bg-slate-50/60 transition-colors">
                      {/* 1. WO Code & Performed date */}
                      <td className="py-3 px-3 align-top">
                        <button
                          type="button"
                          onClick={() => setSelectedRecord(r)}
                          data-testid={`view-record-btn-${r.wo_code}`}
                          className="font-mono font-bold text-indigo-600 hover:text-indigo-800 hover:underline text-xs inline-flex items-center gap-1 cursor-pointer"
                        >
                          <span>{r.wo_code}</span>
                          <ExternalLink size={11} />
                        </button>
                        <div className="text-[11px] text-slate-500 mt-1">
                          ตรวจจริง: <span className="font-semibold">{r.performed_at || '-'}</span>
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          ผู้บันทึก: {r.performed_by_name || '-'}
                        </div>
                      </td>

                      {/* 2. Asset & Dept */}
                      <td className="py-3 px-3 align-top">
                        <div className="font-mono font-bold text-slate-900">{r.asset_code}</div>
                        <div className="font-medium text-slate-800 text-xs mt-0.5">{r.asset_name}</div>
                        <div className="mt-1 flex items-center gap-1">
                          <DepartmentBadge department={r.department} />
                          <span className="text-[10px] text-slate-400">· {r.location || '-'}</span>
                        </div>
                      </td>

                      {/* 3. Method & Traceability */}
                      <td className="py-3 px-3 align-top max-w-[220px]">
                        <div className="font-semibold text-slate-800 text-xs">
                          {r.provider_name || 'ทวนสอบภายใน'}
                        </div>
                        <div className="text-[11px] text-slate-600 mt-0.5 truncate" title={r.calibration_method}>
                          วิธี: {r.calibration_method || '-'}
                        </div>
                        <div className="text-[11px] text-indigo-700 mt-0.5 truncate" title={r.traceability_ref}>
                          มาตรฐาน: {r.traceability_ref || '-'}
                        </div>
                      </td>

                      {/* 4. Due Dates */}
                      <td className="py-3 px-3 align-top">
                        <div className="text-xs font-semibold text-slate-900 font-mono">
                          {r.required_due_date}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          กำหนด: <span className="font-mono">{r.scheduled_date}</span>
                        </div>
                        {r.is_rescheduled && (
                          <span className="inline-block px-1.5 py-0.2 rounded text-[10px] font-semibold bg-amber-100 text-amber-800 mt-1 border border-amber-200">
                            มีการเลื่อนกำหนด
                          </span>
                        )}
                      </td>

                      {/* 5. Result & Certificate */}
                      <td className="py-3 px-3 align-top">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span
                            className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                              r.result_status === 'PASS'
                                ? 'bg-emerald-100 text-emerald-800'
                                : r.result_status === 'FAIL'
                                ? 'bg-rose-100 text-rose-800'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {r.result_status}
                          </span>
                          {r.is_amended && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-700 border border-blue-200">
                              AMENDED
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-700 font-mono mt-1">
                          Cert: {r.certificate_no || '-'}
                        </div>
                        {r.certificate_valid_until && (
                          <div className="text-[10px] text-slate-400">
                            หมดอายุ: {r.certificate_valid_until}
                          </div>
                        )}
                      </td>

                      {/* 6. Digital Hash Evidence */}
                      <td className="py-3 px-3 align-top">
                        {r.cert_sha256_hash ? (
                          <div className="flex items-center gap-1">
                            <span
                              className="font-mono text-[10px] bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 text-slate-700 max-w-[110px] truncate"
                              title={r.cert_sha256_hash}
                            >
                              {r.cert_sha256_hash.slice(0, 12)}...
                            </span>
                            <button
                              type="button"
                              onClick={() => handleCopyHash(r.cert_sha256_hash)}
                              title="คัดลอก SHA-256 Hash เต็ม"
                              className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700 cursor-pointer"
                            >
                              {copiedHash === r.cert_sha256_hash ? (
                                <Check size={12} className="text-emerald-600" />
                              ) : (
                                <Copy size={12} />
                              )}
                            </button>
                          </div>
                        ) : (
                          <span className="text-[11px] text-slate-400 italic">ไม่มีไฟล์แนบ</span>
                        )}
                        {r.has_certificate_file && (
                          <button
                            type="button"
                            onClick={() => handleDownloadCert(r.wo_id)}
                            className="text-[10px] text-indigo-600 hover:text-indigo-800 font-semibold mt-1 inline-block hover:underline cursor-pointer"
                          >
                            ดาวน์โหลด PDF
                          </button>
                        )}
                      </td>

                      {/* 7. Verdict */}
                      <td className="py-3 px-3 align-top text-right">
                        <span
                          className={`inline-block px-2.5 py-1 rounded-full text-[11px] font-bold border ${verdictBadgeClass}`}
                        >
                          {verdictLabel}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 5. Digital Record Modal View */}
      {selectedRecord && (
        <DigitalRecordModal
          workOrder={{
            id: selectedRecord.wo_id,
            wo_code: selectedRecord.wo_code,
            asset_code: selectedRecord.asset_code,
            asset_name: selectedRecord.asset_name,
            asset_type: selectedRecord.asset_type,
            department: selectedRecord.department,
            location: selectedRecord.location,
            status: selectedRecord.status || 'CLOSED',
            result_status: selectedRecord.result_status,
            performed_at: selectedRecord.performed_at,
            performed_by: selectedRecord.performed_by_name,
            reviewed_at: selectedRecord.reviewed_at,
            reviewed_by: selectedRecord.reviewed_by_name,
            review_comment: selectedRecord.review_comment,
            certificate_no: selectedRecord.certificate_no,
            certificate_valid_until: selectedRecord.certificate_valid_until,
            calibration_provider_name: selectedRecord.provider_name,
            calibration_method: selectedRecord.calibration_method,
            traceability_ref: selectedRecord.traceability_ref,
            acceptance_criteria: selectedRecord.acceptance_criteria,
            result_remarks: selectedRecord.result_remarks,
            is_amended: selectedRecord.is_amended,
            amended_at: selectedRecord.amended_at,
            amended_by: selectedRecord.amended_by_name,
            amendment_reason: selectedRecord.amendment_reason,
            certificate_file_name: selectedRecord.cert_file_name,
            certificate_sha256: selectedRecord.cert_sha256_hash
          }}
          onClose={() => setSelectedRecord(null)}
          onDownloadCert={selectedRecord.has_certificate_file ? () => handleDownloadCert(selectedRecord.wo_id) : undefined}
        />
      )}
    </div>
  );
}
