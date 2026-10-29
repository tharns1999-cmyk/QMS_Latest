import React, { useState, useMemo, useEffect } from 'react';
import toast from 'react-hot-toast';
import useStore from '../../../../store/useStore';
import { 
  Download, 
  Search, 
  ShieldAlert, 
  History, 
  FileText, 
  X,
  Layers,
  FileCheck,
  Globe,
  Calendar,
  Settings,
  Activity,
  Wrench,
  CheckCircle2,
  CalendarDays,
  Eye
} from 'lucide-react';
import dayjs from 'dayjs';
import { isApiMode, apiGet } from '../../../../api/client';
import ApiAdminPanel from './ApiAdminPanel';
import { TablePagination } from '../../../../shared/components/common/TablePagination';
import { useTablePagination } from '../../../../shared/hooks/useTablePagination';

// Server audit rows carry a code and a JSON blob; show them the way a reader says them.
export const ACTION_TH = {
  // Authentication & User Management
  LOGIN: 'เข้าสู่ระบบ', 
  LOGIN_FAILED: 'เข้าสู่ระบบไม่สำเร็จ', 
  PASSWORD_CHANGED: 'เปลี่ยนรหัสผ่าน', 
  USER_PASSWORD_RESET: 'รีเซ็ตรหัสผ่านผู้ใช้',
  USER_CREATED: 'สร้างผู้ใช้', 
  USER_UPDATED: 'แก้ไขผู้ใช้', 
  USER_UNLOCKED: 'ปลดล็อกผู้ใช้', 
  TWO_FACTOR_RESET: 'รีเซ็ต 2FA', 
  SIGNATURE_UPDATED: 'อัปเดตลายเซ็น',
  
  // DAR Workflow
  DAR_SUBMITTED: 'ยื่นคำขอ DAR', 
  DAR_SUBMIT: 'ยื่นคำขอ DAR',
  DAR_FILE_ATTACHED: 'แนบไฟล์ DAR', 
  DAR_REVIEWED: 'ทบทวน DAR', 
  DAR_APPROVED: 'อนุมัติ DAR', 
  DAR_REJECTED: 'ไม่อนุมัติ DAR',
  DAR_RETURNED: 'ส่งคำขอกลับแก้ไข', 
  DAR_RESUBMITTED: 'ยื่นคำขอใหม่อีกครั้ง', 
  DAR_WITHDRAWN: 'ถอนคำขอ DAR',
  
  // Document Lifecycle
  DOCUMENT_PUBLISHED: 'ประกาศใช้เอกสาร', 
  DOCUMENT_OBSOLETED: 'ยกเลิกเอกสาร', 
  DOCUMENT_VIEWED: 'เปิดดูไฟล์เอกสาร', 
  DOCUMENT_DOWNLOADED: 'ดาวน์โหลดไฟล์เอกสาร', 
  DOCUMENT_ACKNOWLEDGED: 'รับทราบเอกสาร',
  
  // Controlled Copies
  CC_ADDITIONAL_REQUESTED: 'ขอสำเนาควบคุมเพิ่ม', 
  CC_RECALLED: 'เรียกคืนสำเนาควบคุม', 
  CC_DISPOSED: 'ทำลาย/จัดเก็บสำเนาควบคุม',
  CC_ISSUE: 'ออกสำเนาควบคุม',
  
  // External Documents
  EXT_DOC_REGISTER: 'ขึ้นทะเบียนเอกสารภายนอก',
  
  // Periodic Reviews
  PERIODIC_REVIEW_SUBMITTED: 'ยื่นทบทวนตามรอบ', 
  PERIODIC_REVIEW_APPROVED: 'อนุมัติทบทวนตามรอบ', 
  PERIODIC_REVIEW_REJECTED: 'ไม่อนุมัติทบทวนตามรอบ',
  
  // System Master Data
  APPROVAL_MATRIX_UPDATED: 'แก้ไขสายอนุมัติ', 
  DOCUMENT_TYPES_UPDATED: 'แก้ไขประเภทเอกสาร', 
  SECURITY_SETTINGS_UPDATED: 'แก้ไขตั้งค่าความปลอดภัย', 
  SLA_SETTINGS_UPDATED: 'แก้ไขตั้งค่า SLA',
  DEPARTMENT_CREATED: 'สร้างแผนก', 
  DEPARTMENT_UPDATED: 'แก้ไขแผนก', 
  LOCATION_CREATED: 'สร้างจุดแจกจ่าย', 
  LOCATION_UPDATED: 'แก้ไขจุดแจกจ่าย', 
  AUDIT_LOG_EXPORTED: 'ส่งออก Audit Log',

  // VCC Module Event Codes
  VCC_ASSET_CREATED: 'สร้างทะเบียนเครื่องมือ',
  VCC_ASSET_UPDATED: 'แก้ไขทะเบียนเครื่องมือ',
  VCC_ASSET_RETIRED: 'ระงับ/ปลดระวางเครื่องมือ',
  VCC_ASSET_REACTIVATED: 'เปิดใช้งานเครื่องมืออีกครั้ง',
  VCC_ASSET_IMPORTED: 'นำเข้าข้อมูลเครื่องมือ (Excel)',
  VCC_ASSET_TYPE_CREATED: 'สร้างประเภทเครื่องมือ',
  VCC_ASSET_TYPE_DELETED: 'ลบประเภทเครื่องมือ',
  VCC_PLAN_CREATED: 'สร้างแผนประจำปี FM-QC-46',
  VCC_PLAN_SUBMITTED: 'ส่งแผนประจำปีขออนุมัติ',
  VCC_PLAN_REVIEWED: 'ทบทวนแผนประจำปี (ผ่าน)',
  VCC_PLAN_APPROVED: 'อนุมัติแผนประจำปี',
  VCC_PLAN_REJECTED: 'ส่งกลับแก้ไข/ไม่อนุมัติแผน',
  VCC_WO_CREATED: 'สร้างใบสั่งงานสอบเทียบ/ทวนสอบ',
  VCC_WO_RESULT_SAVED: 'บันทึกผลการปฏิบัติงาน',
  VCC_WO_REVIEWED: 'ตรวจรับงาน (ผ่าน)',
  VCC_WO_REJECTED: 'ส่งกลับแก้ไขงาน (ไม่ผ่าน)',
  VCC_WO_HOLD_RELEASED: 'ปลดสถานะระงับใช้เครื่องมือ',
  VCC_NOTIFICATION_SETTINGS_UPDATED: 'แก้ไขกติกาแจ้งเตือน VCC',
  VCC_EXPORT_ANNUAL_PLAN: 'ส่งออกแผนประจำปี (CSV)',
  VCC_EXPORT_WORK_ORDERS: 'ส่งออกรายการใบสั่งงาน (CSV)',
  VCC_EXPORT_CALIBRATION_SHEET: 'ส่งออกใบบันทึกผลสอบเทียบ',
  VCC_DISPOSITION_APPLIED: 'บันทึกมาตรการจัดการเครื่องมือ'
};

const DETAIL_TH = {
  doc_code: 'รหัสเอกสาร', revision: 'Rev', dar_id: 'DAR #', type: 'ประเภท', status: 'สถานะ', copy_no: 'สำเนาเล่มที่', department: 'แผนก',
  method: 'วิธีทำลาย', witness: 'พยาน', reference_no: 'เลขอ้างอิง', note: 'หมายเหตุ', notes: 'หมายเหตุ', comment: 'ความเห็น', rows: 'จำนวนแถว', bytes: 'ขนาด (ไบต์)',
  asset_code: 'รหัสเครื่องมือ', asset_name: 'ชื่อเครื่องมือ', wo_code: 'เลขที่ใบงาน', year: 'ปีแผน', result: 'ผลการตรวจ', pass_fail: 'ผลตรวจ', reason: 'เหตุผล'
};

const VALUE_TH = {
  NEW: 'ขอใหม่', REVISION: 'แก้ไข', OBSOLETE: 'ยกเลิก', EFFECTIVE: 'มีผลบังคับใช้', SUPERSEDED: 'ตกรุ่น', DESTROY: 'ทำลาย', STAMP_AND_ARCHIVE: 'ประทับตราและเก็บเข้าคลัง',
  PASS: 'ผ่านเกณฑ์', FAIL: 'ไม่ผ่านเกณฑ์', ON_HOLD: 'ระงับใช้งาน'
};

export const describeDetails = (raw) => {
  if (!raw) return '-';
  let obj;
  if (typeof raw === 'object') {
    obj = raw;
  } else {
    try { 
      obj = JSON.parse(raw); 
    } catch { 
      return String(raw || '-'); 
    }
  }
  const parts = Object.entries(obj || {})
    .filter(([k, v]) => DETAIL_TH[k] && v !== null && v !== '')
    .map(([k, v]) => `${DETAIL_TH[k]}: ${VALUE_TH[v] || v}`);
  return parts.length ? parts.join(' · ') : (typeof raw === 'string' ? raw : '-');
};

const ActionLog = () => {
  const { 
    actionLog, 
    controlledCopyAuditTrail, 
    externalAuditTrail, 
    timeline,
    currentUser 
  } = useStore();

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedModule, setSelectedModule] = useState('ALL'); // ALL, DCC, VCC
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [activeDetailItem, setActiveDetailItem] = useState(null);

  // Protect route for DCC Admin / Staff
  const isDccAdmin = Boolean(
    currentUser?.isDcc || 
    currentUser?.role === 'DCC_ADMIN' || 
    currentUser?.role === 'DCC_STAFF' || 
    currentUser?.role === 'SUPER_ADMIN' ||
    currentUser?.isDccAdmin
  );

  // API mode: the server's audit log is the master record
  const [serverRows, setServerRows] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isApiMode || !isDccAdmin) return;
    setLoading(true);
    let query = '/api/audit-log?limit=1000';
    if (dateFrom) query += `&from=${dateFrom}`;
    if (dateTo) query += `&to=${dateTo}`;
    if (selectedModule !== 'ALL') query += `&module=${selectedModule}`;
    
    apiGet(query)
      .then((r) => setServerRows(r.entries || []))
      .catch((err) => toast.error(err.message || 'ไม่สามารถโหลดข้อมูล Audit Log จากเซิร์ฟเวอร์ได้'))
      .finally(() => setLoading(false));
  }, [isDccAdmin, dateFrom, dateTo, selectedModule]);

  // Safe Extraction Helpers
  const getActorName = (log) => {
    const raw = log?.actor || log?.actorName || log?.userName || log?.performed_by || log?.user || log?.actor_name;
    if (!raw) return 'System';
    if (typeof raw === 'object') {
      return raw.name || raw.user || raw.userName || raw.id || 'System';
    }
    return String(raw);
  };

  const getActorRole = (log) => {
    const raw = log?.actorRole || log?.role || log?.position || log?.actor_email;
    if (!raw) return '';
    if (typeof raw === 'object') {
      return raw.name || raw.role || raw.title || '';
    }
    return String(raw);
  };

  const getActionType = (log) => {
    const raw = log?.actionType || log?.action || 'ACTIVITY';
    if (typeof raw === 'object') {
      return raw.name || raw.type || 'ACTIVITY';
    }
    return String(raw);
  };

  const getDateFormatted = (log) => {
    if (!log) return '-';
    const raw = typeof log === 'string' || typeof log === 'number' || log instanceof Date
      ? log
      : (log?.rawDate || log?.timestamp || log?.created_at || log?.createdAt || log?.date || log?.at || log?.time);
    if (!raw) return '-';

    try {
      const d = dayjs(raw);
      if (d.isValid()) return d.format('DD/MM/YYYY HH:mm:ss');
      const parsed = new Date(raw);
      if (!isNaN(parsed.getTime())) return dayjs(parsed).format('DD/MM/YYYY HH:mm:ss');
      return String(raw);
    } catch {
      return String(raw);
    }
  };

  // Aggregate & Normalize All Activity Streams
  const allNormalizedLogs = useMemo(() => {
    if (isApiMode) {
      return serverRows.map((r) => {
        const isVcc = String(r.action || '').startsWith('VCC_');
        let category = 'SYSTEM';
        if (isVcc) {
          if (r.action.startsWith('VCC_ASSET')) category = 'VCC_ASSET';
          else if (r.action.startsWith('VCC_PLAN')) category = 'VCC_PLAN';
          else if (r.action.startsWith('VCC_WO')) category = 'VCC_WO';
          else category = 'VCC_OTHER';
        } else {
          if (r.action.startsWith('DAR_')) category = 'DAR';
          else if (r.action.startsWith('CC_')) category = 'CONTROLLED_COPY';
          else if (r.action.startsWith('EXT_')) category = 'EXTERNAL_DOCS';
          else if (r.action.startsWith('PERIODIC_REVIEW_')) category = 'PERIODIC_REVIEW';
          else category = 'SYSTEM';
        }

        return {
          id: `srv-${r.id}`,
          originalId: r.id,
          rawDate: r.at,
          timestamp: r.at,
          created_at: r.at,
          module: isVcc ? 'VCC' : 'DCC',
          actionType: r.action,
          actionLabel: ACTION_TH[r.action] || r.action,
          action: r.action,
          actor: r.actor_name || r.actor_id || 'System',
          actorRole: r.actor_email || '',
          details: describeDetails(r.details),
          rawDetails: r.details,
          category
        };
      });
    }

    const combined = [];

    // 1. Primary Action Log
    if (Array.isArray(actionLog)) {
      actionLog.forEach((l, idx) => {
        if (!l) return;
        const actType = getActionType(l);
        const isVcc = actType.startsWith('VCC_');
        let category = l.category || 'SYSTEM';
        if (isVcc) {
          if (actType.startsWith('VCC_ASSET')) category = 'VCC_ASSET';
          else if (actType.startsWith('VCC_PLAN')) category = 'VCC_PLAN';
          else if (actType.startsWith('VCC_WO')) category = 'VCC_WO';
          else category = 'VCC_OTHER';
        } else {
          if (actType.startsWith('DAR_')) category = 'DAR';
          else if (actType.startsWith('CC_')) category = 'CONTROLLED_COPY';
          else if (actType.startsWith('EXT_DOC_') || actType.startsWith('EXT_')) category = 'EXTERNAL_DOCS';
          else if (actType.startsWith('PERIODIC_REVIEW_') || actType.startsWith('REVIEW_')) category = 'PERIODIC_REVIEW';
        }

        const rawTime = l.timestamp || l.created_at || l.createdAt || l.date || l.time || l.rawDate || new Date().toISOString();

        combined.push({
          id: l.id || `act-log-${idx}`,
          originalId: l.id || idx,
          rawDate: rawTime,
          timestamp: rawTime,
          created_at: rawTime,
          module: isVcc ? 'VCC' : (l.module || 'DCC'),
          actionType: actType,
          actionLabel: ACTION_TH[actType] || actType,
          action: actType,
          actor: getActorName(l),
          actorRole: getActorRole(l),
          details: describeDetails(l.details || l.remarks || l.comment),
          rawDetails: l.details || l.remarks,
          category
        });
      });
    }

    // 2. Controlled Copy Audit Trail
    if (Array.isArray(controlledCopyAuditTrail)) {
      controlledCopyAuditTrail.forEach((l, idx) => {
        if (!l) return;
        const copyInfo = l.copy_number || l.ccNumber ? ` (Copy ${l.copy_number || l.ccNumber})` : '';
        const rev = l.revision || l.docRev;
        const docInfo = `${l.document_code || l.docTitle || l.doc_code || ''}${rev ? ` Rev.${String(rev).replace(/^rev\.?\s*/i, '')}` : ''}`;
        const rawTime = l.timestamp || l.created_at || l.createdAt || l.date || l.time || l.rawDate || new Date().toISOString();

        combined.push({
          id: l.id || `cc-audit-${idx}`,
          originalId: l.id || idx,
          rawDate: rawTime,
          timestamp: rawTime,
          created_at: rawTime,
          module: 'DCC',
          actionType: l.action || 'CC_AUDIT',
          actionLabel: ACTION_TH[l.action] || l.action || 'กิจกรรมสำเนาควบคุม',
          action: l.action || 'CC_AUDIT',
          actor: getActorName(l),
          actorRole: getActorRole(l) || 'DCC Officer',
          details: `${docInfo}${copyInfo}: ${describeDetails(l.details || l.note)}`,
          rawDetails: l,
          category: 'CONTROLLED_COPY'
        });
      });
    }

    // 3. External Documents Audit Trail
    if (Array.isArray(externalAuditTrail)) {
      externalAuditTrail.forEach((l, idx) => {
        if (!l) return;
        const docInfo = l.docCode || l.docTitle || '';
        const rawTime = l.date || l.timestamp || l.created_at || l.createdAt || l.time || l.rawDate || new Date().toISOString();

        combined.push({
          id: l.id || `ext-audit-${idx}`,
          originalId: l.id || idx,
          rawDate: rawTime,
          timestamp: rawTime,
          created_at: rawTime,
          module: 'DCC',
          actionType: l.action ? `EXT_${l.action}` : 'EXT_AUDIT',
          actionLabel: ACTION_TH[l.action] || 'กิจกรรมเอกสารภายนอก',
          action: l.action ? `EXT_${l.action}` : 'EXT_AUDIT',
          actor: getActorName(l),
          actorRole: getActorRole(l) || 'User',
          details: docInfo ? `[${docInfo}] ${describeDetails(l.details || l.comment)}` : describeDetails(l.details),
          rawDetails: l,
          category: 'EXTERNAL_DOCS'
        });
      });
    }

    // 4. DAR Workflow Timeline
    if (Array.isArray(timeline)) {
      timeline.forEach((l, idx) => {
        if (!l || l.isChat) return;
        const rawTime = l.date || l.timestamp || l.created_at || l.createdAt || l.time || l.rawDate || new Date().toISOString();

        combined.push({
          id: l.id ? `tl-${l.id}` : `tl-item-${idx}`,
          originalId: l.id || idx,
          rawDate: rawTime,
          timestamp: rawTime,
          created_at: rawTime,
          module: 'DCC',
          actionType: l.action ? `DAR_${l.action}` : 'DAR_WORKFLOW',
          actionLabel: ACTION_TH[l.action] || 'กิจกรรมขั้นตอนคำร้อง DAR',
          action: l.action ? `DAR_${l.action}` : 'DAR_WORKFLOW',
          actor: getActorName(l),
          actorRole: getActorRole(l) || 'Workflow Actor',
          details: l.darId ? `[${l.darId}] ${describeDetails(l.comment || l.details)}` : describeDetails(l.details),
          rawDetails: l,
          category: 'DAR'
        });
      });
    }

    // Deduplicate by ID and sort descending by timestamp
    const seenIds = new Set();
    const unique = [];
    for (const item of combined) {
      if (item.id && !seenIds.has(item.id)) {
        seenIds.add(item.id);
        unique.push(item);
      }
    }

    return unique.sort((a, b) => new Date(b.rawDate || 0) - new Date(a.rawDate || 0));
  }, [actionLog, controlledCopyAuditTrail, externalAuditTrail, timeline, serverRows]);

  // Filtering Logic
  const filteredLogs = useMemo(() => {
    const searchLower = searchTerm.trim().toLowerCase();

    return allNormalizedLogs.filter((log) => {
      // Module Filter
      if (selectedModule !== 'ALL' && log.module !== selectedModule) {
        return false;
      }

      // Category Filter
      if (selectedCategory !== 'ALL' && log.category !== selectedCategory) {
        return false;
      }

      // Date Range Filter (Demo mode)
      if (!isApiMode) {
        if (dateFrom && dayjs(log.rawDate).isBefore(dayjs(dateFrom).startOf('day'))) {
          return false;
        }
        if (dateTo && dayjs(log.rawDate).isAfter(dayjs(dateTo).endOf('day'))) {
          return false;
        }
      }

      // Search Term Filter
      if (!searchLower) return true;

      const actTypeStr = String(log.actionType || '').toLowerCase();
      const labelStr = String(log.actionLabel || '').toLowerCase();
      const actorStr = String(log.actor || '').toLowerCase();
      const roleStr = String(log.actorRole || '').toLowerCase();
      const detailsStr = String(log.details || '').toLowerCase();

      return (
        actTypeStr.includes(searchLower) ||
        labelStr.includes(searchLower) ||
        actorStr.includes(searchLower) ||
        roleStr.includes(searchLower) ||
        detailsStr.includes(searchLower)
      );
    });
  }, [allNormalizedLogs, selectedModule, selectedCategory, dateFrom, dateTo, searchTerm]);

  // Pagination Engine
  const pagination = useTablePagination(filteredLogs, 20);

  // CSV Export with Thai Excel UTF-8 BOM
  const handleExportCSV = () => {
    let csv = 'Log ID,Date/Time,Module,Category,Action Type,Action Label,User,Role/Email,Details\n';
    filteredLogs.forEach((log, index) => {
      const logId = log.id || `LOG-${index + 1}`;
      const dateStr = getDateFormatted(log);
      const mod = log.module || 'DCC';
      const category = log.category || '-';
      const actionType = log.actionType || '-';
      const actionLabel = log.actionLabel || '-';
      const actor = log.actor || 'System';
      const actorRole = log.actorRole || '-';
      const details = String(log.details || '-').replace(/"/g, '""');

      csv += `"${logId}","${dateStr}","${mod}","${category}","${actionType}","${actionLabel}","${actor}","${actorRole}","${details}"\n`;
    });

    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `QMS_Audit_Trail_${dayjs().format('YYYYMMDD_HHmmss')}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    toast.success('ส่งออกไฟล์ประวัติการดำเนินการ (CSV) สำเร็จ');
  };

  // Category Tabs Configuration
  const categories = [
    { id: 'ALL', label: 'ทั้งหมด', icon: Activity, count: allNormalizedLogs.length },
    { id: 'DAR', label: 'คำร้อง DAR', icon: FileCheck, count: allNormalizedLogs.filter(l => l.category === 'DAR').length },
    { id: 'CONTROLLED_COPY', label: 'สำเนาควบคุม', icon: Layers, count: allNormalizedLogs.filter(l => l.category === 'CONTROLLED_COPY').length },
    { id: 'EXTERNAL_DOCS', label: 'เอกสารภายนอก', icon: Globe, count: allNormalizedLogs.filter(l => l.category === 'EXTERNAL_DOCS').length },
    { id: 'PERIODIC_REVIEW', label: 'ทบทวนตามรอบ', icon: Calendar, count: allNormalizedLogs.filter(l => l.category === 'PERIODIC_REVIEW').length },
    { id: 'VCC_ASSET', label: 'เครื่องมือ VCC', icon: Wrench, count: allNormalizedLogs.filter(l => l.category === 'VCC_ASSET').length },
    { id: 'VCC_PLAN', label: 'แผนสอบเทียบ VCC', icon: CalendarDays, count: allNormalizedLogs.filter(l => l.category === 'VCC_PLAN').length },
    { id: 'VCC_WO', label: 'ใบสั่งงาน VCC', icon: CheckCircle2, count: allNormalizedLogs.filter(l => l.category === 'VCC_WO').length },
    { id: 'SYSTEM', label: 'ระบบ/ความปลอดภัย', icon: Settings, count: allNormalizedLogs.filter(l => l.category === 'SYSTEM').length },
  ];

  // RBAC Access Denied Fallback
  if (!isDccAdmin) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center min-h-[50vh]">
        <div className="w-14 h-14 bg-rose-100 text-rose-600 rounded-2xl flex items-center justify-center mb-3 shadow-xs">
          <ShieldAlert size={28} />
        </div>
        <h2 className="text-xl font-bold text-slate-900">Access Denied (จำกัดสิทธิ์)</h2>
        <p className="text-sm text-slate-500 mt-1 max-w-md">
          เฉพาะเจ้าหน้าที่ DCC Admin และผู้ดูแลระบบเท่านั้นที่สามารถดูบันทึกประวัติการดำเนินการ (Audit Trail) ได้
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 w-full min-w-0 pb-12" data-testid="centralized-audit-trail-page">
      {/* 1. Header Banner */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-2 border-b border-slate-200/80">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
            <History size={15} className="text-indigo-600" />
            <span>Centralized Compliance & Audit Trail</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
            บันทึกประวัติการดำเนินการ (Audit Trail)
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            ศูนย์รวมบันทึกประวัติกิจกรรมและการเปลี่ยนแปลงทั้งหมดในระบบ QMS (รองรับทั้ง DCC และ VCC) สำหรับตรวจสอบย้อนหลัง
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            type="button"
            onClick={handleExportCSV}
            className="h-9 inline-flex items-center gap-2 px-3.5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-200/90 text-xs sm:text-sm font-semibold transition-colors shadow-2xs cursor-pointer"
          >
            <Download size={15} className="text-slate-500" />
            <span>ส่งออกไฟล์ CSV</span>
          </button>
        </div>
      </div>

      {isApiMode && <ApiAdminPanel />}

      {/* 2. Filter Toolbar (Module, Date Range, Category, Search) */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs p-4 sm:p-5 space-y-4">
        {/* Module Switcher & Date Controls */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* Module Tabs */}
          <div className="flex items-center gap-1.5 p-1 bg-slate-100/90 rounded-xl border border-slate-200/60 self-start">
            {[
              { id: 'ALL', label: 'ทุกโมดูล' },
              { id: 'DCC', label: 'DCC (ควบคุมเอกสาร)' },
              { id: 'VCC', label: 'VCC (สอบเทียบ/ทวนสอบ)' }
            ].map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => {
                  setSelectedModule(m.id);
                  pagination.setCurrentPage(1);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  selectedModule === m.id
                    ? 'bg-white text-slate-900 shadow-2xs border border-slate-200/70'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>

          {/* Date Range Inputs */}
          <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-600">
            <span className="text-slate-500">ช่วงวันที่:</span>
            <input
              type="date"
              aria-label="วันที่เริ่มต้น"
              value={dateFrom}
              onChange={(e) => {
                setDateFrom(e.target.value);
                pagination.setCurrentPage(1);
              }}
              className="h-8 px-2.5 rounded-lg border border-slate-200 bg-white text-xs font-mono text-slate-800 focus:outline-hidden focus:border-indigo-500"
            />
            <span className="text-slate-400">ถึง</span>
            <input
              type="date"
              aria-label="วันที่สิ้นสุด"
              value={dateTo}
              onChange={(e) => {
                setDateTo(e.target.value);
                pagination.setCurrentPage(1);
              }}
              className="h-8 px-2.5 rounded-lg border border-slate-200 bg-white text-xs font-mono text-slate-800 focus:outline-hidden focus:border-indigo-500"
            />
            {(dateFrom || dateTo) && (
              <button
                type="button"
                onClick={() => {
                  setDateFrom('');
                  setDateTo('');
                  pagination.setCurrentPage(1);
                }}
                className="h-8 px-2 text-xs text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
              >
                ล้างวันที่
              </button>
            )}
          </div>
        </div>

        {/* Category Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          {categories
            .filter((cat) => {
              if (selectedModule === 'DCC') return !cat.id.startsWith('VCC_');
              if (selectedModule === 'VCC') return cat.id === 'ALL' || cat.id.startsWith('VCC_');
              return true;
            })
            .map((cat) => {
              const Icon = cat.icon;
              const isActive = selectedCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => {
                    setSelectedCategory(cat.id);
                    pagination.setCurrentPage(1);
                  }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition-all cursor-pointer border ${
                    isActive
                      ? 'bg-slate-900 text-white border-slate-900 shadow-2xs font-semibold'
                      : 'bg-slate-50 text-slate-600 hover:text-slate-900 hover:bg-slate-100 border-slate-200/80'
                  }`}
                >
                  <Icon size={13} className={isActive ? 'text-white' : 'text-slate-400'} />
                  <span>{cat.label}</span>
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                    isActive ? 'bg-white/20 text-white font-bold' : 'bg-slate-200/70 text-slate-600'
                  }`}>
                    {cat.count}
                  </span>
                </button>
              );
            })}
        </div>

        {/* Search Bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 border-t border-slate-100">
          <div className="relative w-full sm:max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
            <input
              type="text"
              placeholder="ค้นหาตาม action, ชื่อผู้ใช้งาน, รหัสเอกสาร/เครื่องมือ, หรือรายละเอียด..."
              className="w-full pl-9 pr-8 h-9 text-xs sm:text-sm bg-slate-50/80 border border-slate-200 rounded-xl focus:bg-white focus:border-indigo-500 focus:outline-hidden text-slate-900 placeholder:text-slate-400 transition-colors"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                pagination.setCurrentPage(1);
              }}
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => {
                  setSearchTerm('');
                  pagination.setCurrentPage(1);
                }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 rounded cursor-pointer"
              >
                <X size={14} />
              </button>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500 font-mono font-medium self-end sm:self-auto">
            <span>พบ</span>
            <span className="font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded-md">
              {filteredLogs.length}
            </span>
            <span>รายการ</span>
          </div>
        </div>
      </div>

      {/* 3. Main Data Table (Clean Swiss Enterprise Data Grid) */}
      <div className="bg-white border border-slate-200/80 rounded-2xl overflow-hidden shadow-2xs">
        <div className="w-full overflow-x-auto">
          <table className="w-full text-left text-xs sm:text-sm border-collapse min-w-[760px]">
            <thead>
              <tr className="bg-slate-50/90 text-slate-600 border-b border-slate-200/80 font-bold uppercase tracking-wider text-xs">
                <th className="py-3 px-4 w-44 font-mono font-semibold">วันที่ / เวลา</th>
                <th className="py-3 px-3 w-24 font-semibold text-center">โมดูล</th>
                <th className="py-3 px-4 w-60 font-semibold">กิจกรรม (Action)</th>
                <th className="py-3 px-4 w-48 font-semibold">ผู้ดำเนินการ</th>
                <th className="py-3 px-4 font-semibold">รายละเอียด</th>
                <th className="py-3 px-3 w-24 text-right font-semibold">การจัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-16 text-center text-slate-400 font-medium">
                    กำลังโหลดข้อมูล Audit Trail...
                  </td>
                </tr>
              ) : pagination.paginatedData.length > 0 ? (
                pagination.paginatedData.map((log, index) => {
                  const dateStr = getDateFormatted(log);
                  const actType = log.actionType || 'ACTIVITY';
                  const actor = log.actor || 'System';
                  const role = log.actorRole || '';
                  const details = log.details || '-';
                  const isVcc = log.module === 'VCC';

                  return (
                    <tr key={log.id || `log-row-${index}`} className="hover:bg-slate-50/70 transition-colors">
                      {/* Date */}
                      <td className="py-3 px-4 whitespace-nowrap font-mono text-slate-500 text-xs">
                        {dateStr}
                      </td>

                      {/* Module Badge */}
                      <td className="py-3 px-3 text-center whitespace-nowrap">
                        <span className={`px-2 py-0.5 rounded-md font-mono text-xs font-semibold border ${
                          isVcc
                            ? 'bg-indigo-50 text-indigo-700 border-indigo-200/70'
                            : 'bg-blue-50 text-blue-700 border-blue-200/70'
                        }`}>
                          {log.module || 'DCC'}
                        </span>
                      </td>

                      {/* Action Type with Thai Label & Original Code */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="font-bold text-slate-900 text-xs sm:text-sm">
                          {log.actionLabel || actType}
                        </div>
                        <div className="font-mono text-[10px] text-slate-400 mt-0.5">
                          {actType}
                        </div>
                      </td>

                      {/* User & Role */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="font-semibold text-slate-800 text-xs sm:text-sm leading-snug">
                          {actor}
                        </div>
                        {role && (
                          <div className="text-[11px] text-slate-400 font-medium truncate max-w-[160px]">
                            {role}
                          </div>
                        )}
                      </td>

                      {/* Details */}
                      <td className="py-3 px-4 text-slate-600 text-xs leading-relaxed max-w-md truncate">
                        {details}
                      </td>

                      {/* View Action */}
                      <td className="py-3 px-3 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => setActiveDetailItem(log)}
                          title="ดูรายละเอียดเชิงลึก"
                          aria-label="ดูรายละเอียด"
                          className="h-7 px-2.5 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-600 text-xs font-medium border border-slate-200/80 transition-colors inline-flex items-center gap-1 cursor-pointer"
                        >
                          <Eye size={12} />
                          <span>ดู</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={6} className="py-16 px-4 text-center text-slate-500">
                    <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
                      <FileText size={22} />
                    </div>
                    <p className="text-sm font-semibold text-slate-800">ไม่พบรายการบันทึกประวัติการทำงาน</p>
                    <p className="text-xs text-slate-400 mt-1">
                      {searchTerm ? 'ลองเปลี่ยนคำค้นหาหรือตัวกรองหมวดหมู่' : 'ยังไม่มีกิจกรรมในหมวดหมู่นี้'}
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Universal Pagination Footer — Clean Page Density without Nested Scrollbar */}
        <TablePagination
          currentPage={pagination.currentPage}
          totalItems={pagination.totalItems}
          pageSize={pagination.pageSize}
          onPageChange={pagination.setCurrentPage}
          onPageSizeChange={pagination.setPageSize}
          pageSizeOptions={[10, 20, 50, 100]}
        />
      </div>

      {/* 4. Event Detail Modal */}
      {activeDetailItem && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl space-y-4 border border-slate-200/80 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-700 flex items-center justify-center border border-indigo-200/60 font-bold">
                  <Activity size={16} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">รายละเอียดเหตุการณ์ Audit Log</h3>
                  <p className="text-xs font-mono text-slate-400">ID: {activeDetailItem.id}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveDetailItem(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3 text-xs sm:text-sm">
              <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50/80 rounded-xl border border-slate-200/70">
                <div>
                  <span className="text-slate-400 block text-xs">โมดูล</span>
                  <span className="font-bold text-slate-900">{activeDetailItem.module}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-xs">วันเวลาบันทึก</span>
                  <span className="font-mono text-slate-800">{getDateFormatted(activeDetailItem)}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-xs">กิจกรรม (Event)</span>
                  <span className="font-bold text-slate-900">{activeDetailItem.actionLabel}</span>
                  <span className="font-mono text-[11px] text-slate-400 block">{activeDetailItem.actionType}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-xs">ผู้ดำเนินการ</span>
                  <span className="font-bold text-slate-900">{activeDetailItem.actor}</span>
                  <span className="text-slate-500 text-[11px] block">{activeDetailItem.actorRole || '-'}</span>
                </div>
              </div>

              <div>
                <span className="font-semibold text-slate-700 block mb-1">สรุปรายละเอียด</span>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/60 text-slate-800 font-medium text-xs leading-relaxed">
                  {activeDetailItem.details}
                </div>
              </div>

              {activeDetailItem.rawDetails && (
                <div>
                  <span className="font-semibold text-slate-700 block mb-1">ข้อมูลเชิงเทคนิค (JSON Payload)</span>
                  <pre className="p-3 bg-slate-900 text-slate-100 rounded-xl font-mono text-[11px] overflow-x-auto max-h-40">
                    {typeof activeDetailItem.rawDetails === 'string'
                      ? activeDetailItem.rawDetails
                      : JSON.stringify(activeDetailItem.rawDetails, null, 2)}
                  </pre>
                </div>
              )}
            </div>

            <div className="flex justify-end pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setActiveDetailItem(null)}
                className="h-9 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold cursor-pointer transition-colors"
              >
                ปิดหน้าต่าง
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ActionLog;
