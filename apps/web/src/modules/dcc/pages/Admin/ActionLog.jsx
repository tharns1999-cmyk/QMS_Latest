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
  Activity
} from 'lucide-react';
import dayjs from 'dayjs';
import { isApiMode, apiGet } from '../../../../api/client';
import ApiAdminPanel from './ApiAdminPanel';
import { TablePagination } from '../../../../shared/components/common/TablePagination';
import { useTablePagination } from '../../../../shared/hooks/useTablePagination';

// Server audit rows carry a code and a JSON blob; show them the way a reader says them.
const ACTION_TH = {
  LOGIN: 'เข้าสู่ระบบ', LOGIN_FAILED: 'เข้าสู่ระบบไม่สำเร็จ', PASSWORD_CHANGED: 'เปลี่ยนรหัสผ่าน', USER_PASSWORD_RESET: 'รีเซ็ตรหัสผ่านผู้ใช้',
  USER_CREATED: 'สร้างผู้ใช้', USER_UPDATED: 'แก้ไขผู้ใช้', USER_UNLOCKED: 'ปลดล็อกผู้ใช้', TWO_FACTOR_RESET: 'รีเซ็ต 2FA', SIGNATURE_UPDATED: 'อัปเดตลายเซ็น',
  DAR_SUBMITTED: 'ยื่นคำขอ DAR', DAR_FILE_ATTACHED: 'แนบไฟล์ DAR', DAR_REVIEWED: 'ทบทวน DAR', DAR_APPROVED: 'อนุมัติ DAR', DAR_REJECTED: 'ไม่อนุมัติ DAR',
  DAR_RETURNED: 'ส่งคำขอกลับแก้ไข', DAR_RESUBMITTED: 'ยื่นคำขอใหม่อีกครั้ง', DAR_WITHDRAWN: 'ถอนคำขอ DAR',
  DOCUMENT_PUBLISHED: 'ประกาศใช้เอกสาร', DOCUMENT_OBSOLETED: 'ยกเลิกเอกสาร', DOCUMENT_VIEWED: 'เปิดดูไฟล์เอกสาร', DOCUMENT_DOWNLOADED: 'ดาวน์โหลดไฟล์เอกสาร', DOCUMENT_ACKNOWLEDGED: 'รับทราบเอกสาร',
  CC_ADDITIONAL_REQUESTED: 'ขอสำเนาควบคุมเพิ่ม', CC_RECALLED: 'เรียกคืนสำเนาควบคุม', CC_DISPOSED: 'ทำลาย/จัดเก็บสำเนาควบคุม',
  PERIODIC_REVIEW_SUBMITTED: 'ยื่นทบทวนตามรอบ', PERIODIC_REVIEW_APPROVED: 'อนุมัติทบทวนตามรอบ', PERIODIC_REVIEW_REJECTED: 'ไม่อนุมัติทบทวนตามรอบ',
  APPROVAL_MATRIX_UPDATED: 'แก้ไขสายอนุมัติ', DOCUMENT_TYPES_UPDATED: 'แก้ไขประเภทเอกสาร', SECURITY_SETTINGS_UPDATED: 'แก้ไขตั้งค่าความปลอดภัย', SLA_SETTINGS_UPDATED: 'แก้ไขตั้งค่า SLA',
  DEPARTMENT_CREATED: 'สร้างแผนก', DEPARTMENT_UPDATED: 'แก้ไขแผนก', LOCATION_CREATED: 'สร้างจุดแจกจ่าย', LOCATION_UPDATED: 'แก้ไขจุดแจกจ่าย', AUDIT_LOG_EXPORTED: 'ส่งออก Audit Log'
};
const DETAIL_TH = {
  doc_code: 'เอกสาร', revision: 'Rev', dar_id: 'DAR #', type: 'ประเภท', status: 'สถานะ', copy_no: 'สำเนาเล่มที่', department: 'แผนก',
  method: 'วิธีทำลาย', witness: 'พยาน', reference_no: 'เลขอ้างอิง', note: 'หมายเหตุ', notes: 'หมายเหตุ', comment: 'ความเห็น', rows: 'จำนวนแถว', bytes: 'ขนาด (ไบต์)'
};
const VALUE_TH = {
  NEW: 'ขอใหม่', REVISION: 'แก้ไข', OBSOLETE: 'ยกเลิก', EFFECTIVE: 'มีผลบังคับใช้', SUPERSEDED: 'ตกรุ่น', DESTROY: 'ทำลาย', STAMP_AND_ARCHIVE: 'ประทับตราและเก็บเข้าคลัง'
};
const describeDetails = (raw) => {
  let obj;
  try { obj = JSON.parse(raw); } catch { return raw || '-'; }
  const parts = Object.entries(obj || {})
    .filter(([k, v]) => DETAIL_TH[k] && v !== null && v !== '')
    .map(([k, v]) => `${DETAIL_TH[k]} ${VALUE_TH[v] || v}`);
  return parts.length ? parts.join(' · ') : '-';
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
  const [selectedCategory, setSelectedCategory] = useState('ALL');

  // Protect route for DCC Admin / Staff
  const isDccAdmin = Boolean(
    currentUser?.isDcc || 
    currentUser?.role === 'DCC_ADMIN' || 
    currentUser?.role === 'DCC_STAFF' || 
    currentUser?.role === 'SUPER_ADMIN' ||
    currentUser?.isDccAdmin
  );

  // API mode: the server's audit log is the record; the browser-side logs below only exist in demo mode.
  const [serverRows, setServerRows] = useState([]);
  useEffect(() => {
    if (!isApiMode || !isDccAdmin) return;
    apiGet('/api/audit-log?limit=1000').then((r) => setServerRows(r.entries || []), (err) => toast.error(err.message));
  }, [isDccAdmin]);

  // --- Safe Extraction Helpers (Guaranteed string return, zero React 19 child crash) ---

  const getActorName = (log) => {
    const raw = log?.actor || log?.actorName || log?.userName || log?.performed_by || log?.user;
    if (!raw) return 'System';
    if (typeof raw === 'object') {
      return raw.name || raw.user || raw.userName || raw.id || 'System';
    }
    return String(raw);
  };

  const getActorRole = (log) => {
    const raw = log?.actorRole || log?.role || log?.position;
    if (!raw) return 'User';
    if (typeof raw === 'object') {
      return raw.name || raw.role || raw.title || 'User';
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
    // If log is directly a date string/number/Date
    if (typeof log === 'string' || typeof log === 'number' || log instanceof Date) {
      try {
        const d = dayjs(log);
        if (d.isValid()) return d.format('DD/MM/YYYY HH:mm:ss');
        const parsed = new Date(log);
        if (!isNaN(parsed.getTime())) return dayjs(parsed).format('DD/MM/YYYY HH:mm:ss');
        return String(log);
      } catch {
        return String(log);
      }
    }

    // Check all possible multi-key variations
    const raw = log?.rawDate || log?.timestamp || log?.created_at || log?.createdAt || log?.date || log?.time || log?.dateTime || log?.datetime;
    if (!raw) return '-';

    try {
      if (typeof raw === 'string' || typeof raw === 'number' || raw instanceof Date) {
        const d = dayjs(raw);
        if (d.isValid()) {
          return d.format('DD/MM/YYYY HH:mm:ss');
        }
        const parsed = new Date(raw);
        if (!isNaN(parsed.getTime())) {
          return dayjs(parsed).format('DD/MM/YYYY HH:mm:ss');
        }
      }
      return String(raw);
    } catch {
      return String(raw);
    }
  };

  const getDetailsFormatted = (log) => {
    const raw = log?.details !== undefined ? log?.details : (log?.remarks || log?.remark || log?.comment || '');
    if (raw === null || raw === undefined || raw === '') return '-';
    if (typeof raw === 'object') {
      try {
        return JSON.stringify(raw, null, 2);
      } catch {
        return String(raw);
      }
    }
    return String(raw);
  };

  // --- Aggregate & Normalize All System Activity Streams ---
  const allNormalizedLogs = useMemo(() => {
    if (isApiMode) {
      const categoryOf = (a) => (a.startsWith('DAR_') ? 'DAR' : a.startsWith('CC_') ? 'CONTROLLED_COPY' : a.startsWith('PERIODIC_REVIEW_') ? 'PERIODIC_REVIEW' : 'SYSTEM');
      return serverRows.map((r) => ({
        id: `srv-${r.id}`, rawDate: r.at, timestamp: r.at, created_at: r.at, createdAt: r.at, date: r.at,
        actionType: r.action, actionLabel: ACTION_TH[r.action], action: r.action, actor: r.actor_name || r.actor_id || 'System', actorRole: r.actor_email || '',
        details: describeDetails(r.details), category: categoryOf(r.action)
      }));
    }
    const combined = [];

    // 1. Primary Action Log
    if (Array.isArray(actionLog)) {
      actionLog.forEach((l, idx) => {
        if (!l) return;
        const actType = getActionType(l);
        let category = l.category || 'SYSTEM';
        if (actType.startsWith('DAR_')) category = 'DAR';
        else if (actType.startsWith('CC_')) category = 'CONTROLLED_COPY';
        else if (actType.startsWith('EXT_DOC_') || actType.startsWith('EXT_')) category = 'EXTERNAL_DOCS';
        else if (actType.startsWith('PERIODIC_REVIEW_') || actType.startsWith('REVIEW_')) category = 'PERIODIC_REVIEW';

        const rawTime = l.timestamp || l.created_at || l.createdAt || l.date || l.time || l.dateTime || l.datetime || l.rawDate || new Date().toISOString();

        combined.push({
          id: l.id || `act-log-${idx}`,
          rawDate: rawTime,
          timestamp: rawTime,
          created_at: rawTime,
          createdAt: rawTime,
          date: rawTime,
          actionType: actType,
          action: actType,
          actor: getActorName(l),
          actorRole: getActorRole(l),
          details: getDetailsFormatted(l),
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
          rawDate: rawTime,
          timestamp: rawTime,
          created_at: rawTime,
          createdAt: rawTime,
          date: rawTime,
          actionType: l.action || 'CC_AUDIT',
          action: l.action || 'CC_AUDIT',
          actor: getActorName(l),
          actorRole: getActorRole(l) || 'DCC Officer',
          details: `${docInfo}${copyInfo}: ${getDetailsFormatted(l)}`,
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
          rawDate: rawTime,
          timestamp: rawTime,
          created_at: rawTime,
          createdAt: rawTime,
          date: rawTime,
          actionType: l.action ? `EXT_${l.action}` : 'EXT_AUDIT',
          action: l.action ? `EXT_${l.action}` : 'EXT_AUDIT',
          actor: getActorName(l),
          actorRole: getActorRole(l) || 'User',
          details: docInfo ? `[${docInfo}] ${getDetailsFormatted(l)}` : getDetailsFormatted(l),
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
          rawDate: rawTime,
          timestamp: rawTime,
          created_at: rawTime,
          createdAt: rawTime,
          date: rawTime,
          actionType: l.action ? `DAR_${l.action}` : 'DAR_WORKFLOW',
          action: l.action ? `DAR_${l.action}` : 'DAR_WORKFLOW',
          actor: getActorName(l),
          actorRole: getActorRole(l) || 'Workflow Actor',
          details: l.darId ? `[${l.darId}] ${getDetailsFormatted(l)}` : getDetailsFormatted(l),
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

  // --- Filtering ---
  const filteredLogs = useMemo(() => {
    const searchLower = searchTerm.trim().toLowerCase();

    return allNormalizedLogs.filter(log => {
      // Category Filter
      if (selectedCategory !== 'ALL' && log.category !== selectedCategory) {
        return false;
      }

      // Search Term Filter
      if (!searchLower) return true;

      const actTypeStr = String(log.actionType || '').toLowerCase();
      const actorStr = String(log.actor || '').toLowerCase();
      const roleStr = String(log.actorRole || '').toLowerCase();
      const detailsStr = String(log.details || '').toLowerCase();

      return (
        actTypeStr.includes(searchLower) ||
        actorStr.includes(searchLower) ||
        roleStr.includes(searchLower) ||
        detailsStr.includes(searchLower)
      );
    });
  }, [allNormalizedLogs, selectedCategory, searchTerm]);

  // --- Universal Pagination Engine ---
  const pagination = useTablePagination(filteredLogs, 20);

  // --- CSV Export with Thai Excel UTF-8 BOM ---
  const handleExportCSV = () => {
    let csv = 'Log ID,Date/Time,Category,Action Type,User,Role,Details\n';
    filteredLogs.forEach((log, index) => {
      const logId = log.id || `LOG-${index + 1}`;
      const dateStr = getDateFormatted(log);
      const category = log.category || '-';
      const actionType = log.actionType || '-';
      const actor = log.actor || 'System';
      const actorRole = log.actorRole || 'User';
      const details = String(log.details || '-').replace(/"/g, '""');

      csv += `"${logId}","${dateStr}","${category}","${actionType}","${actor}","${actorRole}","${details}"\n`;
    });

    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `QMS_Audit_Action_Log_${dayjs().format('YYYYMMDD_HHmmss')}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const categories = [
    { id: 'ALL', label: 'ทั้งหมด', icon: Activity, count: allNormalizedLogs.length },
    { id: 'DAR', label: 'คำร้อง DAR', icon: FileCheck, count: allNormalizedLogs.filter(l => l.category === 'DAR').length },
    { id: 'CONTROLLED_COPY', label: 'สำเนาควบคุม', icon: Layers, count: allNormalizedLogs.filter(l => l.category === 'CONTROLLED_COPY').length },
    { id: 'EXTERNAL_DOCS', label: 'เอกสารภายนอก', icon: Globe, count: allNormalizedLogs.filter(l => l.category === 'EXTERNAL_DOCS').length },
    { id: 'PERIODIC_REVIEW', label: 'ทบทวนตามรอบ', icon: Calendar, count: allNormalizedLogs.filter(l => l.category === 'PERIODIC_REVIEW').length },
    { id: 'SYSTEM', label: 'ระบบ/ข้อมูลหลัก', icon: Settings, count: allNormalizedLogs.filter(l => l.category === 'SYSTEM').length },
  ];

  if (!isDccAdmin) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center min-h-[50vh]">
        <div className="w-14 h-14 bg-rose-100 text-rose-600 rounded-2xl flex items-center justify-center mb-3 shadow-xs">
          <ShieldAlert size={28} />
        </div>
        <h2 className="text-xl font-bold text-[#1E293B]">Access Denied (จำกัดสิทธิ์)</h2>
        <p className="text-sm text-[#64748B] mt-1 max-w-md">
          เฉพาะเจ้าหน้าที่ DCC และผู้ดูแลระบบเท่านั้นที่สามารถดูบันทึกประวัติการทำงานของระบบได้
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12 w-full max-w-full overflow-hidden">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold text-[#0D99FF] uppercase tracking-wider mb-1">
            <History size={15} /> Compliance & Audit Trail
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-[#1E293B] tracking-tight">
            บันทึกประวัติการทำงาน (System Action Log)
          </h1>
          <p className="text-xs sm:text-sm text-[#64748B] mt-0.5">
            ศูนย์รวมบันทึกกิจกรรมและการปฏิบัติงานทั้งหมดในระบบ QMS สำหรับตรวจสอบย้อนกลับ (Audit Readiness)
          </p>
        </div>
        <button
          onClick={handleExportCSV}
          className="btn-primary flex items-center gap-2 h-10 px-4 text-sm font-semibold shrink-0 cursor-pointer shadow-xs"
        >
          <Download size={16} /> ส่งออกไฟล์ CSV (Excel)
        </button>
      </div>

      {isApiMode && <ApiAdminPanel />}

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
        {categories.map((cat) => {
          const Icon = cat.icon;
          const isActive = selectedCategory === cat.id;
          return (
            <button
              key={cat.id}
              onClick={() => {
                setSelectedCategory(cat.id);
                pagination.setCurrentPage(1);
              }}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer border ${
                isActive
                  ? 'bg-[#0D99FF] text-white border-[#0D99FF] shadow-xs'
                  : 'bg-white text-[#64748B] hover:text-[#1E293B] hover:bg-[#F8FAFC] border-[#E2E8F0]'
              }`}
            >
              <Icon size={14} className={isActive ? 'text-white' : 'text-[#94A3B8]'} />
              <span>{cat.label}</span>
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                isActive ? 'bg-white/20 text-white' : 'bg-[#F1F5F9] text-[#64748B]'
              }`}>
                {cat.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Main Table Card */}
      <div className="w-full bg-white border border-[#E2E8F0] rounded-xl overflow-hidden shadow-2xs h-auto">
        {/* Search & Meta Bar */}
        <div className="p-4 border-b border-[#F1F5F9] bg-white flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="relative w-full sm:max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#94A3B8]" size={16} />
            <input
              type="text"
              placeholder="ค้นหาตาม action, ชื่อผู้ใช้งาน, รหัสเอกสาร, หรือรายละเอียด..."
              className="w-full pl-10 pr-9 h-10 text-sm bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl focus:bg-white focus:border-[#0D99FF] focus:ring-2 focus:ring-[#0D99FF]/15 outline-none transition-all text-[#1E293B] placeholder:text-[#94A3B8]"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                pagination.setCurrentPage(1);
              }}
            />
            {searchTerm && (
              <button
                onClick={() => {
                  setSearchTerm('');
                  pagination.setCurrentPage(1);
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#94A3B8] hover:text-[#475569] p-0.5 rounded-md"
              >
                <X size={15} />
              </button>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs text-[#64748B] font-mono font-medium self-end sm:self-auto">
            <span>พบทั้งหมด</span>
            <span className="font-bold text-[#1E293B] bg-[#F1F5F9] px-2 py-0.5 rounded-md">
              {filteredLogs.length}
            </span>
            <span>รายการ</span>
          </div>
        </div>

        {/* Data Table */}
        <div className="w-full overflow-x-auto overflow-y-auto max-h-[560px] scrollbar-thin">
          <table className="w-full text-left text-sm table-fixed min-w-[700px] border-collapse">
            <thead className="table-header sticky top-0 z-10 bg-[#F8FAFC] border-b border-[#E2E8F0] shadow-xs backdrop-blur-sm whitespace-nowrap">
              <tr>
                <th className="py-3 px-4 w-44 font-mono bg-[#F8FAFC]">Date / Time</th>
                <th className="py-3 px-4 w-48 bg-[#F8FAFC]">Action Type</th>
                <th className="py-3 px-4 w-48 bg-[#F8FAFC]">User / Role</th>
                <th className="py-3 px-4 bg-[#F8FAFC]">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F1F5F9]">
              {pagination.paginatedData.length > 0 ? (
                pagination.paginatedData.map((log, index) => {
                  const dateStr = getDateFormatted(log);
                  const actType = log.actionType || 'ACTIVITY';
                  const actor = log.actor || 'System';
                  const role = log.actorRole || 'User';
                  const details = log.details || '-';

                  return (
                    <tr key={log.id || `log-row-${index}`} className="hover:bg-[#F8FAFC] transition-colors">
                      {/* Date */}
                      <td className="py-3.5 px-4 whitespace-nowrap font-mono text-[#64748B] text-xs sm:text-sm">
                        {dateStr}
                      </td>

                      {/* Action Type Badge */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span className="badge-system font-mono text-xs font-bold text-[#0D99FF] bg-[#E5F4FF] border border-[#B8E1FF] px-2.5 py-1 rounded-md">
                          {log.actionLabel || actType}
                        </span>
                        {log.actionLabel && <div className="font-mono text-[10px] text-[#94A3B8] mt-1">{actType}</div>}
                      </td>

                      {/* User & Role */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="font-bold text-[#1E293B] text-sm leading-snug">{actor}</div>
                        <div className="text-xs text-[#64748B] font-medium mt-0.5">{role}</div>
                      </td>

                      {/* Details */}
                      <td className="py-3.5 px-4 text-[#334155] text-sm break-all break-words min-w-0 [overflow-wrap:anywhere] leading-relaxed">
                        {details}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={4} className="py-16 px-4 text-center text-[#64748B]">
                    <div className="w-12 h-12 rounded-2xl bg-[#F1F5F9] text-[#94A3B8] flex items-center justify-center mx-auto mb-3">
                      <FileText size={24} />
                    </div>
                    <p className="text-sm font-semibold text-[#1E1E1E]">ไม่พบรายการบันทึกประวัติการทำงาน</p>
                    <p className="text-xs text-[#64748B] mt-1">
                      {searchTerm ? 'ลองเปลี่ยนคำค้นหาหรือตัวกรองหมวดหมู่' : 'ยังไม่มีกิจกรรมในหมวดหมู่นี้'}
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Universal Pagination Footer */}
        <TablePagination
          currentPage={pagination.currentPage}
          totalItems={pagination.totalItems}
          pageSize={pagination.pageSize}
          onPageChange={pagination.setCurrentPage}
          onPageSizeChange={pagination.setPageSize}
          pageSizeOptions={[10, 20, 50, 100]}
        />
      </div>
    </div>
  );
};

export default ActionLog;
