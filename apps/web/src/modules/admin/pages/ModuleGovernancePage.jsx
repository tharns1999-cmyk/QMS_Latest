import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, RefreshCw, ShieldCheck, Wrench, LockKeyhole, CheckCircle2, Save, FileCheck, AlertTriangle } from 'lucide-react';
import { apiGet, apiPut, apiPost, apiDelete, isApiMode } from '../../../api/client';
import { useModuleAccess } from '../../../shared/components/ModuleAccessProvider';
import useStore from '../../../store/useStore';
import { MASTER_DEPARTMENTS } from '../../dcc/config/qmsRegistry';
import GovernanceConfirmation from '../components/GovernanceConfirmation';
import ModuleProfileEditor from '../components/ModuleProfileEditor';
import ModulePermissionPanel from '../components/ModulePermissionPanel';

const statuses = {
  ACTIVE: 'เปิดใช้งาน',
  READ_ONLY: 'อ่านอย่างเดียว',
  MAINTENANCE: 'ปรับปรุงระบบ',
  DISABLED: 'ปิดใช้งาน'
};

const statusStyle = {
  ACTIVE: 'bg-emerald-50 text-emerald-800 border border-emerald-200',
  READ_ONLY: 'bg-blue-50 text-blue-800 border border-blue-200',
  MAINTENANCE: 'bg-amber-50 text-amber-900 border border-amber-200',
  DISABLED: 'bg-slate-100 text-slate-700 border border-slate-200'
};

const actionLabels = {
  MODULE_STATUS_CHANGED: 'เปลี่ยนสถานะ VCC',
  MODULE_DEPARTMENT_CHANGED: 'เปลี่ยนการเปิดรับงานของแผนก',
  VCC_DOCUMENT_PROFILE_UPDATED: 'เปลี่ยนแบบฟอร์มและผู้รับผิดชอบ',
  MODULE_PERMISSION_GRANTED: 'มอบหมายสิทธิ์',
  MODULE_PERMISSION_REVOKED: 'ถอนสิทธิ์'
};

export default function ModuleGovernancePage() {
  const { refresh } = useModuleAccess();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [successNotice, setSuccessNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedStatus, setSelectedStatus] = useState('ACTIVE');
  const [message, setMessage] = useState('');
  const [tab, setTab] = useState('departments');
  const [departmentFilter, setDepartmentFilter] = useState('enabled');
  const [alertFilter, setAlertFilter] = useState('PENDING');
  const [editingDepartment, setEditingDepartment] = useState('');
  const [confirmation, setConfirmation] = useState(null);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    setSuccessNotice('');

    if (isApiMode) {
      try {
        const [config, history, alerts] = await Promise.all([
          apiGet('/api/module-governance/vcc'),
          apiGet('/api/module-governance/vcc/history'),
          apiGet('/api/module-governance/vcc/alerts')
        ]);
        const grants = config.platformAdmin ? (await apiGet('/api/module-governance/permissions')).grants : [];
        setData({ ...config, history: history.history, alerts: alerts.alerts, grants });
        setSelectedStatus(config.module.status);
        setMessage(config.module.maintenance_message);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
      return;
    }

    // Demo Mode / Local Storage initialization
    try {
      const state = useStore.getState?.() || {};
      const storeDepts = state.departments || state.masterDepartments || MASTER_DEPARTMENTS;
      const storeDocs = state.documents || [];
      const storeUsers = state.users || [];

      // Module status from localStorage or default
      let savedStatus = 'ACTIVE';
      let savedMessage = '';
      try {
        savedStatus = localStorage.getItem('qms_vcc_module_status') || 'ACTIVE';
        savedMessage = localStorage.getItem('qms_vcc_maintenance_message') || '';
      } catch {}

      // Enabled departments from localStorage or default
      let enabledDeptCodes = ['DC', 'QC', 'QA', 'MGT', 'LB'];
      try {
        const rawEnabled = localStorage.getItem('qms_vcc_enabled_departments');
        if (rawEnabled) {
          const parsed = JSON.parse(rawEnabled);
          if (Array.isArray(parsed)) enabledDeptCodes = parsed;
        }
      } catch {}

      // Profiles from localStorage or default
      let profiles = {
        QC: {
          document_code: 'FM-QC-46',
          revision: '03',
          reviewer_dept: 'QC',
          approver_dept: 'QA',
          min_preparer_level: 4,
          required_reviewer_level: 5,
          required_approver_level: 6,
          assigned_reviewer_id: 'U003',
          assigned_approver_id: 'U004'
        },
        LB: {
          document_code: 'FM-LB-11',
          revision: '01',
          reviewer_dept: 'LB',
          approver_dept: 'QA',
          min_preparer_level: 4,
          required_reviewer_level: 5,
          required_approver_level: 6
        }
      };
      try {
        const rawProfiles = localStorage.getItem('qms_vcc_document_profiles');
        if (rawProfiles) {
          const parsed = JSON.parse(rawProfiles);
          if (parsed && typeof parsed === 'object') profiles = { ...profiles, ...parsed };
        }
      } catch {}

      // Map departments from master data
      const depts = storeDepts.map((d) => {
        const code = String(d.code || d.id).toUpperCase();
        return {
          code,
          name_th: d.nameTh || d.name_th || d.name || code,
          status: d.status || 'ACTIVE',
          enabled: enabledDeptCodes.includes(code) ? 1 : 0
        };
      });

      // Ensure standard departments exist in list
      const existingCodes = depts.map((d) => d.code);
      if (!existingCodes.includes('QC')) depts.unshift({ code: 'QC', name_th: 'ควบคุมคุณภาพ', status: 'ACTIVE', enabled: enabledDeptCodes.includes('QC') ? 1 : 0 });
      if (!existingCodes.includes('LB')) depts.push({ code: 'LB', name_th: 'ห้องปฏิบัติการจุลชีววิทยา', status: 'ACTIVE', enabled: enabledDeptCodes.includes('LB') ? 1 : 0 });
      if (!existingCodes.includes('QA')) depts.push({ code: 'QA', name_th: 'ประกันคุณภาพ', status: 'ACTIVE', enabled: enabledDeptCodes.includes('QA') ? 1 : 0 });
      if (!existingCodes.includes('MGT')) depts.push({ code: 'MGT', name_th: 'ฝ่ายบริหาร', status: 'ACTIVE', enabled: enabledDeptCodes.includes('MGT') ? 1 : 0 });

      // Calculate readiness per department
      const readiness = {};
      depts.forEach((d) => {
        const p = profiles[d.code];
        const issues = [];
        if (!p || !p.document_code) issues.push('ยังไม่ผูกแบบฟอร์ม DCC ควบคุม');
        if (!p || !p.reviewer_dept || !p.approver_dept) issues.push('ยังไม่กำหนดสายการอนุมัติ');
        readiness[d.code] = {
          status: issues.length === 0 ? 'READY' : 'CONFIGURATION_INCOMPLETE',
          issues
        };
      });

      // Map forms from documents
      const forms = storeDocs
        .filter((doc) => doc.document_type === 'FM' || doc.type === 'FM' || doc.doc_code?.startsWith('FM-') || doc.docNumber?.startsWith('FM-'))
        .map((doc) => ({
          id: doc.id || doc.doc_code || doc.docNumber,
          doc_code: doc.doc_code || doc.docNumber || doc.code,
          revision: doc.revision || doc.current_version || doc.rev || '01',
          name: doc.title || doc.name || doc.nameTh
        }));

      if (!forms.some((f) => f.doc_code === 'FM-QC-46')) {
        forms.unshift({ id: 'FM-QC-46', doc_code: 'FM-QC-46', revision: '03', name: 'แผนการสอบเทียบและทวนสอบเครื่องมือวัดประจำปี (QC)' });
      }
      if (!forms.some((f) => f.doc_code === 'FM-LB-11')) {
        forms.unshift({ id: 'FM-LB-11', doc_code: 'FM-LB-11', revision: '01', name: 'แผนการสอบเทียบและทวนสอบเครื่องมือวิทยาศาสตร์ (LB)' });
      }

      // Map users
      const users = storeUsers.map((u) => ({
        id: u.id || u.empId,
        name: u.fullName || u.name,
        departments: [u.department, u.dept, ...(u.depts || []), ...(u.affiliated_departments || [])].filter(Boolean),
        approval_level: Number(u.approval_level ?? u.approvalLevel ?? u.level ?? 1)
      }));

      // History
      let savedHistory = [];
      try {
        const rawH = localStorage.getItem('qms_vcc_history');
        if (rawH) savedHistory = JSON.parse(rawH);
      } catch {}

      const configData = {
        module: {
          status: savedStatus,
          version: 1,
          maintenance_message: savedMessage
        },
        platformAdmin: true,
        profiles,
        departments: depts,
        readiness,
        users,
        forms,
        policy: {
          min_requester_level: 4,
          required_reviewer_level: 5,
          required_approver_level: 6
        },
        history: savedHistory,
        alerts: [],
        grants: []
      };

      setData(configData);
      setSelectedStatus(savedStatus);
      setMessage(savedMessage);

      // Sync Zustand store
      useStore.setState?.({
        vccModuleStatus: savedStatus,
        vccMaintenanceMessage: savedMessage,
        vccEnabledDepartments: enabledDeptCodes
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const review = async (title, path, body, department, method = 'put') => {
    setError('');
    setSuccessNotice('');
    try {
      const impact = await apiGet(`/api/module-governance/vcc/impact${department ? `?department=${encodeURIComponent(department)}` : ''}`);
      setSaveError('');
      setConfirmation({ title, path, body, impact, method });
    } catch (err) {
      setError(err.message);
    }
  };

  const confirm = async (reason) => {
    setBusy(true);
    setSaveError('');
    try {
      const send = confirmation.method === 'post' ? apiPost : confirmation.method === 'delete' ? apiDelete : apiPut;
      await send(confirmation.path, { ...confirmation.body, version: data.module.version, reason });
      setConfirmation(null);
      setEditingDepartment('');
      await load();
      await refresh();
      setSuccessNotice('บันทึกการเปลี่ยนแปลงเข้าระบบเรียบร้อยแล้ว');
    } catch (err) {
      setSaveError(err.message);
    } finally {
      setBusy(false);
    }
  };

  // Demo Mode action handlers
  const handleToggleDepartment = (dept) => {
    if (isApiMode) {
      review(
        `${dept.enabled ? 'ปิด' : 'เปิด'}รับงานใหม่ของ ${dept.code}`,
        `/api/module-governance/vcc/departments/${encodeURIComponent(dept.code)}`,
        { enabled: !dept.enabled },
        dept.code
      );
      return;
    }

    const nextDepts = data.departments.map((d) => (d.code === dept.code ? { ...d, enabled: d.enabled ? 0 : 1 } : d));
    const nextEnabledCodes = nextDepts.filter((d) => d.enabled).map((d) => d.code);

    try {
      localStorage.setItem('qms_vcc_enabled_departments', JSON.stringify(nextEnabledCodes));
      useStore.setState?.({ vccEnabledDepartments: nextEnabledCodes });

      const newHistoryItem = {
        id: Date.now(),
        action: 'MODULE_DEPARTMENT_CHANGED',
        details: JSON.stringify({
          department: dept.code,
          reason: `${dept.enabled ? 'ปิด' : 'เปิด'}รับงานใหม่ของ ${dept.code} (โหมดสาธิต)`
        }),
        created_at: new Date().toISOString(),
        actor_name: 'ผู้ดูแลระบบ (Demo)'
      };
      const updatedHistory = [newHistoryItem, ...(data.history || [])];
      localStorage.setItem('qms_vcc_history', JSON.stringify(updatedHistory));

      setData((prev) => ({ ...prev, departments: nextDepts, history: updatedHistory }));
      setSuccessNotice(`ปรับเปลี่ยนสิทธิ์การเข้าใช้งานของแผนก ${dept.code} เป็น ${dept.enabled ? 'ปิดรับงานใหม่' : 'เปิดรับงานใหม่'} สำเร็จ`);
      window.dispatchEvent(new CustomEvent('qms:module-access-updated'));
    } catch (err) {
      setError(err.message);
    }
  };

  const handleSaveModuleStatusDemo = () => {
    if (selectedStatus === 'MAINTENANCE' && !message.trim()) {
      setError('กรุณาระบุข้อความแจ้งผู้ใช้งานเมื่อเลือกปรับปรุงระบบ');
      return;
    }
    setError('');
    try {
      localStorage.setItem('qms_vcc_module_status', selectedStatus);
      localStorage.setItem('qms_vcc_maintenance_message', message);
      useStore.setState?.({
        vccModuleStatus: selectedStatus,
        vccMaintenanceMessage: message
      });

      const newHistoryItem = {
        id: Date.now(),
        action: 'MODULE_STATUS_CHANGED',
        details: JSON.stringify({
          before: { status: data.module.status },
          after: { status: selectedStatus },
          reason: message || 'เปลี่ยนสถานะโมดูล VCC (โหมดสาธิต)'
        }),
        created_at: new Date().toISOString(),
        actor_name: 'ผู้ดูแลระบบ (Demo)'
      };
      const updatedHistory = [newHistoryItem, ...(data.history || [])];
      localStorage.setItem('qms_vcc_history', JSON.stringify(updatedHistory));

      setData((prev) => ({
        ...prev,
        module: { ...prev.module, status: selectedStatus, maintenance_message: message },
        history: updatedHistory
      }));
      setSuccessNotice(`บันทึกสถานะโมดูล VCC เป็น "${statuses[selectedStatus]}" สำเร็จ`);
      window.dispatchEvent(new CustomEvent('qms:module-access-updated'));
    } catch (err) {
      setError(err.message);
    }
  };

  const handleSaveProfileDemo = (department, profile) => {
    try {
      const nextProfiles = { ...data.profiles, [department]: profile };
      localStorage.setItem('qms_vcc_document_profiles', JSON.stringify(nextProfiles));

      const nextReadiness = { ...data.readiness, [department]: { status: 'READY', issues: [] } };

      const newHistoryItem = {
        id: Date.now(),
        action: 'VCC_DOCUMENT_PROFILE_UPDATED',
        details: JSON.stringify({
          department,
          reason: `บันทึกแบบฟอร์ม ${profile.document_code} ฉบับ ${profile.revision} และสายอนุมัติ (โหมดสาธิต)`
        }),
        created_at: new Date().toISOString(),
        actor_name: 'ผู้ดูแลระบบ (Demo)'
      };
      const updatedHistory = [newHistoryItem, ...(data.history || [])];
      localStorage.setItem('qms_vcc_history', JSON.stringify(updatedHistory));

      setData((prev) => ({
        ...prev,
        profiles: nextProfiles,
        readiness: nextReadiness,
        history: updatedHistory
      }));
      setEditingDepartment('');
      setSuccessNotice(`บันทึกการตั้งค่าแบบฟอร์มและสายอนุมัติของแผนก ${department} เรียบร้อยแล้ว`);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleSaveAllChanges = () => {
    if (isApiMode) {
      if (selectedStatus !== data.module.status || message !== data.module.maintenance_message) {
        review(`เปลี่ยน VCC เป็น${statuses[selectedStatus]}`, '/api/module-governance/vcc/status', {
          status: selectedStatus,
          maintenance_message: message
        });
      } else {
        setSuccessNotice('ข้อมูลการตั้งค่าทั้งหมดเป็นปัจจุบันแล้ว');
      }
      return;
    }

    // Demo save all
    handleSaveModuleStatusDemo();
  };

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 pb-8 text-slate-900">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link to="/portal" className="mb-3 inline-flex items-center gap-2 text-sm text-slate-600 hover:text-indigo-700">
            <ArrowLeft size={16} />
            กลับพอร์ทัล
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">จัดการระบบย่อย</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            ควบคุมสถานะ VCC แผนกที่เปิดรับงาน และผู้รับผิดชอบ พร้อมตรวจผลกระทบและประวัติทุกครั้ง
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            disabled={loading || busy}
            onClick={load}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-50 shadow-sm"
          >
            <RefreshCw size={16} />
            โหลดข้อมูลล่าสุด
          </button>
        </div>
      </header>

      {!isApiMode && (
        <div role="status" className="flex items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50/80 p-4 text-sm text-amber-900 shadow-sm">
          <div className="flex items-center gap-2.5">
            <AlertTriangle size={18} className="shrink-0 text-amber-700" />
            <p>
              <strong>โหมดสาธิต</strong> — กำลังทำงานในโหมดจัดเก็บข้อมูลในเครื่อง (Local Storage) การตั้งค่าทั้งหมดจะถูกบันทึกและมีผลทันทีบนหน้าจอจำลอง
            </p>
          </div>
          <span className="shrink-0 rounded-lg bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800 border border-amber-300">
            Local Storage Active
          </span>
        </div>
      )}

      {error && <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-800 border border-red-200">{error}</p>}
      {successNotice && (
        <div className="flex items-center gap-2 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800 border border-emerald-200 shadow-sm">
          <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
          <span>{successNotice}</span>
        </div>
      )}

      {loading && <p role="status" className="py-8 text-slate-600">กำลังตรวจสอบค่าตั้งค่าและสิทธิ์…</p>}

      {data && (
        <>
          {/* SECTION 1: MODULE STATUS CONTROL */}
          <section aria-label="สถานะระบบย่อย" className="divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            {/* DCC CARD */}
            <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4 sm:px-6 bg-slate-50/50">
              <div className="flex items-center gap-3">
                <LockKeyhole size={20} className="text-slate-500" />
                <div>
                  <h2 className="font-semibold text-slate-900">ระบบควบคุมเอกสาร · DCC</h2>
                  <p className="mt-1 text-sm text-slate-600">รักษาการทำงานเดิม การควบคุมสถานะ DCC ยังไม่เปิดในหน้านี้</p>
                </div>
              </div>
              <span className="rounded-lg bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-800 border border-emerald-200">
                เปิดใช้งาน
              </span>
            </div>

            {/* VCC CARD */}
            <div className="space-y-5 p-5 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="flex items-center gap-3 font-semibold text-slate-900">
                  <Wrench size={20} className="text-indigo-600" />
                  ศูนย์ทวนสอบและสอบเทียบ · VCC
                </h2>
                <span className={`rounded-lg px-3 py-1 text-sm font-medium ${statusStyle[data.module.status] || 'bg-slate-100 text-slate-800'}`}>
                  {statuses[data.module.status]}
                </span>
              </div>

              <div className="grid items-end gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto]">
                <label className="text-sm font-medium text-slate-700">
                  เปลี่ยนสถานะ
                  <select
                    disabled={loading || busy}
                    value={selectedStatus}
                    onChange={(e) => setSelectedStatus(e.target.value)}
                    className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    {Object.entries(statuses).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="text-sm font-medium text-slate-700">
                  ข้อความแจ้งผู้ใช้งาน
                  <input
                    disabled={loading || busy}
                    value={message}
                    maxLength={1000}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="ระบุเมื่อปรับปรุงระบบ"
                    className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </label>

                {isApiMode ? (
                  <button
                    disabled={
                      loading ||
                      busy ||
                      (selectedStatus === data.module.status && message === data.module.maintenance_message) ||
                      (selectedStatus === 'MAINTENANCE' && !message.trim())
                    }
                    onClick={() =>
                      review(`เปลี่ยน VCC เป็น${statuses[selectedStatus]}`, '/api/module-governance/vcc/status', {
                        status: selectedStatus,
                        maintenance_message: message
                      })
                    }
                    className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 shadow-sm"
                  >
                    ตรวจผลกระทบ
                  </button>
                ) : (
                  <button
                    onClick={handleSaveModuleStatusDemo}
                    disabled={loading || busy || (selectedStatus === 'MAINTENANCE' && !message.trim())}
                    className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 shadow-sm"
                  >
                    บันทึกการตั้งค่า (Save Changes)
                  </button>
                )}
              </div>

              <p className="text-sm leading-6 text-slate-600">
                อ่านอย่างเดียว: ดูข้อมูลได้แต่บันทึกไม่ได้ · ปรับปรุงระบบ: พักการเข้าใช้งานและการอนุมัติ การติดตามกำหนดและเก็บการแจ้งเตือนยังทำงานต่อ · ปิดใช้งาน: ระงับการเข้า VCC โดยเก็บข้อมูลเดิม
              </p>
            </div>
          </section>

          {/* TAB LIST */}
          <div role="tablist" aria-label="การจัดการ VCC" className="flex gap-1 overflow-x-auto border-b border-slate-200">
            {[
              ['departments', 'แผนกและแบบฟอร์ม'],
              ['alerts', `การแจ้งเตือนค้าง (${data.alerts.length})`],
              ['history', 'ประวัติการตั้งค่า'],
              ...(data.platformAdmin ? [['permissions', 'ผู้ดูแลที่ได้รับมอบหมาย']] : [])
            ].map(([key, label]) => (
              <button
                key={key}
                role="tab"
                aria-selected={tab === key}
                onClick={() => setTab(key)}
                className={`whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
                  tab === key ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-600 hover:text-slate-900'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* SECTION 2: DEPARTMENT ACCESS MATRIX */}
          {tab === 'departments' && (
            <section aria-label="แผนกและแบบฟอร์ม" className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">การเปิดรับงานของแผนก</h2>
                  <p className="mt-1 text-sm text-slate-600">
                    ดึงรายชื่อแผนกทั้งหมดจาก Master Data Store พร้อมสวิตช์เปิด/ปิดสิทธิ์ และตรวจสอบแบบฟอร์ม DCC ควบคุม
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <label className="text-sm text-slate-700">
                    แสดงแผนก
                    <select
                      value={departmentFilter}
                      onChange={(e) => setDepartmentFilter(e.target.value)}
                      className="ml-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="enabled">เปิดรับงานใหม่</option>
                      <option value="disabled">ปิดรับงานใหม่</option>
                      <option value="all">ทุกแผนก</option>
                    </select>
                  </label>
                  <button
                    onClick={handleSaveAllChanges}
                    className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 shadow-sm"
                  >
                    <Save size={16} />
                    บันทึกการตั้งค่า (Save Changes)
                  </button>
                </div>
              </div>

              <ul className="divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                {data.departments
                  .filter((d) => (departmentFilter === 'all' ? true : Boolean(d.enabled) === (departmentFilter === 'enabled')))
                  .map((d) => {
                    const prof = data.profiles[d.code];
                    const read = data.readiness[d.code] || { status: 'CONFIGURATION_INCOMPLETE', issues: ['ยังไม่ตั้งค่า'] };
                    const hasDccForm = Boolean(prof?.document_code);

                    return (
                      <li key={d.code} className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:px-6 hover:bg-slate-50/50 transition-colors">
                        <div className="min-w-0 space-y-1.5">
                          <div className="flex flex-wrap items-center gap-2.5">
                            <h3 className="font-semibold text-slate-900">
                              {d.code} · {d.name_th}
                            </h3>
                            {hasDccForm ? (
                              <span className="inline-flex items-center gap-1 rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700 border border-indigo-200">
                                <FileCheck size={12} />
                                ผูกแบบฟอร์มแล้ว: {prof.document_code} (ฉบับ {prof.revision})
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 border border-slate-200">
                                ยังไม่ผูกแบบฟอร์ม DCC ควบคุม
                              </span>
                            )}
                          </div>
                          <p className={`text-sm ${read.status === 'READY' ? 'text-emerald-800' : 'text-amber-900'}`}>
                            {read.status === 'READY' ? 'พร้อมใช้งาน' : 'Configuration Incomplete · ตั้งค่ายังไม่ครบ'}
                          </p>
                          <p className="break-words text-xs leading-5 text-slate-600">
                            {read.issues.join(' · ') || `${prof?.document_code} · ฉบับ ${prof?.revision}`}
                          </p>
                        </div>

                        <div className="flex shrink-0 flex-wrap items-center gap-2">
                          <button
                            onClick={() => setEditingDepartment(d.code)}
                            className="rounded-xl border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50 shadow-sm"
                          >
                            ตั้งค่า {d.code}
                          </button>
                          <button
                            disabled={busy || (!d.enabled && (d.status !== 'ACTIVE' || read.status !== 'READY'))}
                            onClick={() => handleToggleDepartment(d)}
                            className={`rounded-xl border px-3 py-2 text-sm font-medium shadow-sm transition-colors disabled:opacity-50 ${
                              d.enabled
                                ? 'border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100'
                                : 'border-indigo-300 bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
                            }`}
                          >
                            {d.enabled ? 'ปิดรับงานใหม่' : 'เปิดรับงานใหม่'}
                          </button>
                        </div>
                      </li>
                    );
                  })}
              </ul>

              {editingDepartment && (
                <ModuleProfileEditor
                  key={editingDepartment}
                  department={editingDepartment}
                  data={data}
                  onClose={() => setEditingDepartment('')}
                  onReview={(profile) => {
                    if (isApiMode) {
                      review(
                        `บันทึกแบบฟอร์มและผู้รับผิดชอบของ ${editingDepartment}`,
                        `/api/module-governance/vcc/profiles/${encodeURIComponent(editingDepartment)}`,
                        profile,
                        editingDepartment
                      );
                    } else {
                      handleSaveProfileDemo(editingDepartment, profile);
                    }
                  }}
                />
              )}
            </section>
          )}

          {tab === 'alerts' && (
            <section className="space-y-4">
              <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
                <ShieldCheck size={20} className="text-emerald-700" />
                ติดตามกำหนดระหว่างปรับปรุงระบบ
              </h2>
              <p className="text-sm text-slate-600">
                รายการยังคงอยู่จนดำเนินการตามขั้นตอนเดิม ไม่มีการเลื่อนวันครบกำหนดหรือยืนยันรับทราบแทนผู้รับผิดชอบ
              </p>
              <label className="block text-sm text-slate-700">
                สถานะการแจ้งเตือน
                <select
                  value={alertFilter}
                  onChange={(e) => setAlertFilter(e.target.value)}
                  className="ml-2 rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="PENDING">ยังไม่รับทราบ</option>
                  <option value="ACKNOWLEDGED">รับทราบแล้ว</option>
                </select>
              </label>
              <ul className="divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                {data.alerts
                  .filter((a) => a.status === alertFilter)
                  .map((a) => (
                    <li key={a.id} className="space-y-1 p-4">
                      <p className="font-medium text-slate-900">{a.title}</p>
                      <p className="text-sm text-slate-600">
                        {a.department} · {a.asset_code} · ครบกำหนด {a.due_date || '—'} · ระดับแจ้งเตือน {a.escalation_level}
                      </p>
                      <p className="text-sm text-slate-800">{a.message}</p>
                    </li>
                  ))}
              </ul>
              {!data.alerts.some((a) => a.status === alertFilter) && (
                <p className="py-6 text-sm text-slate-600">ไม่มีการแจ้งเตือนในสถานะนี้</p>
              )}
            </section>
          )}

          {tab === 'history' && (
            <section>
              <h2 className="mb-4 text-lg font-semibold text-slate-900">ประวัติการตั้งค่า</h2>
              <ul className="divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                {data.history.map((row) => {
                  const details = typeof row.details === 'string' ? JSON.parse(row.details || '{}') : row.details || {};
                  return (
                    <li key={row.id} className="space-y-1 p-4 text-sm">
                      <p className="font-medium text-slate-900">
                        {actionLabels[row.action] || row.action}
                        {details.department ? ` · ${details.department}` : ''}
                      </p>
                      <p className="text-slate-700">{details.reason || 'ไม่ได้ระบุเหตุผลในประวัติเดิม'}</p>
                      <p className="text-xs text-slate-500">
                        {row.actor_name || row.actor_id || 'ระบบ'} ·{' '}
                        {new Date(row.created_at).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}
                      </p>
                      {details.after?.status && (
                        <p className="text-xs font-medium text-indigo-700">
                          {statuses[details.before?.status] || '—'} → {statuses[details.after.status]}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
              {!data.history.length && <p className="py-6 text-sm text-slate-600">ยังไม่มีประวัติการเปลี่ยนค่าตั้งค่า</p>}
            </section>
          )}

          {tab === 'permissions' && data.platformAdmin && (
            <ModulePermissionPanel
              users={data.users}
              grants={data.grants}
              onReview={(method, grant) =>
                review(
                  method === 'post' ? 'มอบหมายสิทธิ์ผู้ดูแล' : 'ถอนสิทธิ์ผู้ดูแล',
                  '/api/module-governance/permissions',
                  grant,
                  null,
                  method
                )
              }
            />
          )}
        </>
      )}

      {confirmation && (
        <GovernanceConfirmation
          {...confirmation}
          error={saveError}
          busy={busy}
          onCancel={() => setConfirmation(null)}
          onConfirm={confirm}
        />
      )}
    </div>
  );
}
