import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  RefreshCw,
  ShieldCheck,
  Wrench,
  LockKeyhole,
  CheckCircle2,
  Save,
  AlertTriangle,
  Settings,
  FileText,
  Search,
  ShieldAlert,
  GraduationCap
} from 'lucide-react';
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
  MODULE_DEPARTMENT_CHANGED: 'เปลี่ยนสิทธิ์การเข้าใช้งานของแผนก',
  VCC_DOCUMENT_PROFILE_UPDATED: 'ปรับแต่งสายการอนุมัติ',
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

  // Split-Pane Master-Detail State
  const [selectedModuleId, setSelectedModuleId] = useState('vcc');
  const [moduleSearch, setModuleSearch] = useState('');

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

      let savedStatus = 'ACTIVE';
      let savedMessage = '';
      try {
        savedStatus = localStorage.getItem('qms_vcc_module_status') || 'ACTIVE';
        savedMessage = localStorage.getItem('qms_vcc_maintenance_message') || '';
      } catch {}

      let enabledDeptCodes = ['DC', 'QC', 'QA', 'MGT', 'LB'];
      try {
        const rawEnabled = localStorage.getItem('qms_vcc_enabled_departments');
        if (rawEnabled) {
          const parsed = JSON.parse(rawEnabled);
          if (Array.isArray(parsed)) enabledDeptCodes = parsed;
        }
      } catch {}

      let profiles = {
        QC: {
          document_code: 'VCC-AP-QC-2026',
          revision: '01',
          reviewer_dept: 'QC',
          approver_dept: 'QA',
          min_preparer_level: 4,
          required_reviewer_level: 4,
          required_approver_level: 5,
          assigned_reviewer_id: 'U003',
          assigned_approver_id: 'U004'
        },
        LB: {
          document_code: 'VCC-AP-LB-2026',
          revision: '01',
          reviewer_dept: 'LB',
          approver_dept: 'QA',
          min_preparer_level: 4,
          required_reviewer_level: 4,
          required_approver_level: 5
        }
      };
      try {
        const rawProfiles = localStorage.getItem('qms_vcc_document_profiles');
        if (rawProfiles) {
          const parsed = JSON.parse(rawProfiles);
          if (parsed && typeof parsed === 'object') profiles = { ...profiles, ...parsed };
        }
      } catch {}

      const depts = storeDepts.map((d) => {
        const code = String(d.code || d.id).toUpperCase();
        return {
          code,
          name_th: d.nameTh || d.name_th || d.name || code,
          status: d.status || 'ACTIVE',
          enabled: enabledDeptCodes.includes(code) ? 1 : 0
        };
      });

      const existingCodes = depts.map((d) => d.code);
      if (!existingCodes.includes('QC')) depts.unshift({ code: 'QC', name_th: 'ควบคุมคุณภาพ', status: 'ACTIVE', enabled: enabledDeptCodes.includes('QC') ? 1 : 0 });
      if (!existingCodes.includes('LB')) depts.push({ code: 'LB', name_th: 'ห้องปฏิบัติการจุลชีววิทยา', status: 'ACTIVE', enabled: enabledDeptCodes.includes('LB') ? 1 : 0 });
      if (!existingCodes.includes('QA')) depts.push({ code: 'QA', name_th: 'ประกันคุณภาพ', status: 'ACTIVE', enabled: enabledDeptCodes.includes('QA') ? 1 : 0 });
      if (!existingCodes.includes('MGT')) depts.push({ code: 'MGT', name_th: 'ฝ่ายบริหาร', status: 'ACTIVE', enabled: enabledDeptCodes.includes('MGT') ? 1 : 0 });

      // Native Digital Records: every enabled department is 100% READY
      const readiness = {};
      depts.forEach((d) => {
        readiness[d.code] = {
          status: 'READY',
          issues: []
        };
      });

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

      const users = storeUsers.map((u) => ({
        id: u.id || u.empId,
        name: u.fullName || u.name,
        departments: [u.department, u.dept, ...(u.depts || []), ...(u.affiliated_departments || [])].filter(Boolean),
        approval_level: Number(u.approval_level ?? u.approvalLevel ?? u.level ?? 1)
      }));

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
          required_reviewer_level: 4,
          required_approver_level: 5
        },
        history: savedHistory,
        alerts: [],
        grants: []
      };

      setData(configData);
      setSelectedStatus(savedStatus);
      setMessage(savedMessage);

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

  const handleToggleDepartment = (dept) => {
    if (isApiMode) {
      review(
        `${dept.enabled ? 'ปิดการใช้งาน' : 'เปิดการใช้งาน'}ของ ${dept.code}`,
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
          reason: `${dept.enabled ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}แผนก ${dept.code} (บันทึกดิจิทัล)`
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
          reason: message || 'เปลี่ยนสถานะโมดูล VCC'
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

      const newHistoryItem = {
        id: Date.now(),
        action: 'VCC_DOCUMENT_PROFILE_UPDATED',
        details: JSON.stringify({
          department,
          reason: `ปรับแต่งสายการอนุมัติของแผนก ${department}`
        }),
        created_at: new Date().toISOString(),
        actor_name: 'ผู้ดูแลระบบ (Demo)'
      };
      const updatedHistory = [newHistoryItem, ...(data.history || [])];
      localStorage.setItem('qms_vcc_history', JSON.stringify(updatedHistory));

      setData((prev) => ({
        ...prev,
        profiles: nextProfiles,
        history: updatedHistory
      }));
      setEditingDepartment('');
      setSuccessNotice(`บันทึกสายการอนุมัติของแผนก ${department} เรียบร้อยแล้ว`);
    } catch (err) {
      setError(err.message);
    }
  };

  // Module Master List Configuration
  const vccEnabledCount = data?.departments?.filter((d) => d.enabled)?.length ?? 0;
  const vccTotalCount = data?.departments?.length ?? 0;

  const modulesList = [
    {
      id: 'vcc',
      code: 'VCC',
      name: 'ศูนย์ทวนสอบและสอบเทียบ (VCC)',
      searchQuery: 'ศูนย์ทวนสอบและสอบเทียบ vcc',
      desc: 'ระบบบริหารการทวนสอบและสอบเทียบเครื่องมือวัด พร้อมบันทึกดิจิทัล',
      badgeText: data ? statuses[data.module.status] || 'เปิดใช้งาน' : 'เปิดใช้งาน',
      badgeStyle: data ? statusStyle[data.module.status] : statusStyle.ACTIVE,
      icon: Wrench,
      stats: `${vccEnabledCount}/${vccTotalCount} แผนกเปิดรับงาน`,
      isConfigurable: true
    },
    {
      id: 'dcc',
      code: 'DCC',
      name: 'ระบบควบคุมเอกสาร · DCC',
      searchQuery: 'ระบบควบคุมเอกสาร dcc',
      desc: 'รักษาการทำงานเดิม การควบคุมสถานะ DCC ยังไม่เปิดในหน้านี้',
      badgeText: 'เปิดใช้งาน',
      badgeStyle: statusStyle.ACTIVE,
      icon: LockKeyhole,
      stats: 'ทุกแผนก (ระบบหลัก)',
      isConfigurable: false
    },
    {
      id: 'capa',
      code: 'CAPA',
      name: 'ระบบจัดการข้อบกพร่อง · CAPA',
      searchQuery: 'ระบบจัดการข้อบกพร่อง capa car par',
      desc: 'บันทึกและติดตามข้อบกพร่อง NC/CAR/PAR ตามมาตรฐาน ISO 9001:2015 ข้อ 10.2',
      badgeText: 'เร็วๆ นี้',
      badgeStyle: 'bg-purple-50 text-purple-700 border border-purple-200',
      icon: ShieldAlert,
      stats: 'Roadmap พัฒนา',
      isConfigurable: false
    },
    {
      id: 'training',
      code: 'TRAINING',
      name: 'ระบบฝึกอบรมและทักษะ · Training',
      searchQuery: 'ระบบฝึกอบรมและทักษะ training skill matrix',
      desc: 'ทะเบียนประวัติการฝึกอบรมและแผนผังทักษะบุคลากร (Skill Matrix) ข้อ 7.2',
      badgeText: 'เร็วๆ นี้',
      badgeStyle: 'bg-purple-50 text-purple-700 border border-purple-200',
      icon: GraduationCap,
      stats: 'Roadmap พัฒนา',
      isConfigurable: false
    }
  ];

  const filteredModules = modulesList.filter((m) => {
    if (!moduleSearch.trim()) return true;
    const q = moduleSearch.toLowerCase();
    return m.name.toLowerCase().includes(q) || m.code.toLowerCase().includes(q) || m.desc.toLowerCase().includes(q) || m.searchQuery?.includes(q);
  });

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 pb-12 text-slate-900">
      {/* Top Header */}
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link to="/portal" className="mb-3 inline-flex items-center gap-2 text-sm text-slate-600 hover:text-indigo-700">
            <ArrowLeft size={16} />
            กลับพอร์ทัล
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">จัดการระบบย่อย</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            ระบบบริหารจัดการสิทธิ์โมดูลและสายการอนุมัติดิจิทัล (ISO 9001:2015 Clause 7.5 Digital Records)
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            disabled={loading || busy}
            onClick={load}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-50 shadow-2xs"
          >
            <RefreshCw size={16} />
            โหลดข้อมูลล่าสุด
          </button>
        </div>
      </header>

      {/* Demo Mode Notice */}
      {!isApiMode && (
        <div role="status" className="flex items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50/80 p-4 text-sm text-amber-900 shadow-2xs">
          <div className="flex items-center gap-2.5">
            <AlertTriangle size={18} className="shrink-0 text-amber-700" />
            <p>
              <strong>โหมดสาธิต</strong> — กำลังทำงานในโหมดจัดเก็บข้อมูลในเครื่อง (Local Storage) ข้อมูลสิทธิ์และสายอนุมัติจะถูกบันทึกและมีผลทันทีบนหน้าจอจำลอง
            </p>
          </div>
          <span className="shrink-0 rounded-lg bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800 border border-amber-300">
            Local Storage Active
          </span>
        </div>
      )}

      {error && <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-800 border border-red-200">{error}</p>}
      {successNotice && (
        <div className="flex items-center gap-2 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800 border border-emerald-200 shadow-2xs">
          <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
          <span>{successNotice}</span>
        </div>
      )}

      {loading && <p role="status" className="py-8 text-slate-600">กำลังตรวจสอบค่าตั้งค่าและสิทธิ์…</p>}

      {data && (
        <div className="space-y-6">
          {/* Mobile Horizontal Module Switcher (Visible on small screens) */}
          <div className="md:hidden flex items-center gap-2 overflow-x-auto pb-2 border-b border-slate-200">
            {modulesList.map((m) => {
              const Icon = m.icon;
              const isSelected = selectedModuleId === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setSelectedModuleId(m.id)}
                  className={`flex items-center gap-2 whitespace-nowrap px-3.5 py-2 rounded-xl text-xs font-semibold transition-all shrink-0 ${
                    isSelected
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <Icon size={14} className={isSelected ? 'text-white' : 'text-slate-500'} />
                  <span>{m.code}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${isSelected ? 'bg-indigo-700 text-indigo-100' : 'bg-slate-100 text-slate-600'}`}>
                    {m.badgeText}
                  </span>
                </button>
              );
            })}
          </div>

          {/* TWO-COLUMN SPLIT-PANE MASTER-DETAIL LAYOUT */}
          <div className="flex flex-col md:flex-row md:items-start gap-6">
            {/* LEFT RAIL / MODULE RAIL (Master Pane ~280px / 25-30%) */}
            <aside aria-label="รายการโมดูลระบบ" className="w-full md:w-72 lg:w-80 shrink-0 space-y-3">
              {/* Search Bar Header */}
              <div className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-2xs space-y-2.5">
                <div className="flex items-center justify-between px-0.5">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500">โมดูลระบบ (Modules)</span>
                  <span className="text-[11px] font-semibold text-slate-400 font-mono">{modulesList.length} ระบบ</span>
                </div>
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={moduleSearch}
                    onChange={(e) => setModuleSearch(e.target.value)}
                    placeholder="ค้นหาโมดูล..."
                    className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 bg-slate-50/70 text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all placeholder:text-slate-400"
                  />
                </div>
              </div>

              {/* Module Cards List */}
              <div className="space-y-2">
                {filteredModules.map((m) => {
                  const Icon = m.icon;
                  const isSelected = selectedModuleId === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setSelectedModuleId(m.id)}
                      className={`w-full text-left p-3.5 rounded-2xl border transition-all cursor-pointer relative ${
                        isSelected
                          ? 'bg-indigo-50/50 border-indigo-600 ring-1 ring-indigo-600 shadow-2xs'
                          : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/60 shadow-2xs'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div
                            className={`p-2 rounded-xl border shrink-0 ${
                              isSelected
                                ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                                : 'bg-slate-100 text-slate-600 border-slate-200'
                            }`}
                          >
                            <Icon size={16} />
                          </div>
                          <div className="min-w-0">
                            <div className={`text-sm font-bold truncate ${isSelected ? 'text-indigo-950' : 'text-slate-900'}`}>
                              {m.name}
                            </div>
                            <p className="text-[11px] text-slate-500 line-clamp-1 mt-0.5">
                              {m.desc}
                            </p>
                          </div>
                        </div>
                      </div>
                      <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
                        <span className="text-slate-500 font-medium truncate">{m.stats}</span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold shrink-0 ${m.badgeStyle}`}>
                          {m.badgeText}
                        </span>
                      </div>
                    </button>
                  );
                })}
                {filteredModules.length === 0 && (
                  <div className="p-4 text-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 text-xs text-slate-500">
                    ไม่พบโมดูลที่ตรงกับคำค้นหา
                  </div>
                )}
              </div>
            </aside>

            {/* RIGHT CONTENT PANE (Detail Pane ~70-75%) */}
            <main className="flex-1 min-w-0 space-y-6">
              {/* VIEW 1: VCC GOVERNANCE (Active Configurable Module) */}
              {selectedModuleId === 'vcc' && (
                <div className="space-y-6">
                  {/* SECTION 1: MODULE STATUS CONTROL (Compact Card) */}
                  <section aria-label="สถานะระบบย่อย" className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xs">
                    <div className="p-5 sm:p-6 space-y-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5">
                          <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-100">
                            <Wrench size={18} />
                          </div>
                          <div>
                            <h2 className="text-base font-bold text-slate-900">ศูนย์ทวนสอบและสอบเทียบ · VCC</h2>
                            <p className="text-xs text-slate-500">จัดการสถานะการทำงานและประกาศข้อความปรับปรุงระบบสำหรับผู้ใช้งานทั่วไป</p>
                          </div>
                        </div>
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold border ${statusStyle[data.module.status] || 'bg-slate-100 text-slate-800'}`}>
                          {statuses[data.module.status]}
                        </span>
                      </div>

                      {/* Status Selector + Maintenance Message + Single Save Button */}
                      <div className="grid items-end gap-3.5 sm:grid-cols-[minmax(0,220px)_1fr_auto]">
                        <label className="text-xs font-semibold text-slate-700">
                          <span>เปลี่ยนสถานะ</span>
                          <select
                            disabled={loading || busy}
                            value={selectedStatus}
                            onChange={(e) => setSelectedStatus(e.target.value)}
                            className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 shadow-2xs"
                          >
                            {Object.entries(statuses).map(([key, label]) => (
                              <option key={key} value={key}>
                                {label}
                              </option>
                            ))}
                          </select>
                        </label>

                        {/* Maintenance Message Input - visible or hidden depending on status */}
                        <label
                          className={`text-xs font-semibold text-slate-700 ${
                            selectedStatus === 'MAINTENANCE' ? 'block animate-in fade-in' : 'hidden'
                          }`}
                        >
                          <span>ข้อความแจ้งผู้ใช้งาน</span>
                          <input
                            disabled={loading || busy}
                            value={message}
                            maxLength={1000}
                            onChange={(e) => setMessage(e.target.value)}
                            placeholder="ระบุข้อความประกาศแจ้งเตือนเมื่อเลือกปรับปรุงระบบ..."
                            className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-2xs"
                          />
                        </label>

                        {/* Helper placeholder if not maintenance */}
                        {selectedStatus !== 'MAINTENANCE' && (
                          <div className="text-xs text-slate-500 self-center hidden sm:block">
                            อ่านอย่างเดียว: ดูข้อมูลได้แต่บันทึกไม่ได้ · ปรับปรุงระบบ: พักการเข้าใช้งาน · ปิดใช้งาน: ระงับการเข้า VCC
                          </div>
                        )}

                        {/* Single Button */}
                        <div className="shrink-0">
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
                              className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 shadow-2xs transition-colors cursor-pointer"
                            >
                              <Save size={16} />
                              <span>ตรวจผลกระทบ</span>
                            </button>
                          ) : (
                            <button
                              onClick={handleSaveModuleStatusDemo}
                              disabled={loading || busy || (selectedStatus === 'MAINTENANCE' && !message.trim())}
                              className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 shadow-2xs transition-colors cursor-pointer"
                            >
                              <Save size={16} />
                              <span>บันทึกการตั้งค่า (Save Changes)</span>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </section>

                  {/* TAB LIST */}
                  <div role="tablist" aria-label="การจัดการ VCC" className="flex gap-1 overflow-x-auto border-b border-slate-200">
                    {[
                      ['departments', 'สิทธิ์ระดับแผนกและสายอนุมัติ'],
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

                  {/* TAB 1: DEPARTMENT ACCESS MATRIX (Native Digital-First) */}
                  {tab === 'departments' && (
                    <section aria-label="แผนกและแบบฟอร์ม" className="space-y-4">
                      {/* Header Bar */}
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <h2 className="text-lg font-bold text-slate-900">การเปิดรับงานของแผนก</h2>
                          <p className="mt-0.5 text-xs text-slate-500">
                            เปิดสิทธิ์การใช้งานรายแผนกเพื่อจัดทำและลงนามแผนประจำปีดิจิทัลได้ทันที (ISO 9001:2015 Clause 7.5)
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <label className="text-xs font-semibold text-slate-600 flex items-center gap-2">
                            <span>แสดงแผนก</span>
                            <select
                              value={departmentFilter}
                              onChange={(e) => setDepartmentFilter(e.target.value)}
                              className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-2xs cursor-pointer"
                            >
                              <option value="enabled">เปิดรับงานใหม่</option>
                              <option value="disabled">ปิดรับงานใหม่</option>
                              <option value="all">ทุกแผนก</option>
                            </select>
                          </label>
                        </div>
                      </div>

                      {/* CLEAN MODERN ENTERPRISE TABLE */}
                      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xs">
                        {/* Table Header Row */}
                        <div className="hidden md:grid grid-cols-12 gap-4 px-6 py-3 bg-slate-50/75 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                          <div className="col-span-4">แผนก (Department)</div>
                          <div className="col-span-2 text-center">สิทธิ์ใช้งาน VCC</div>
                          <div className="col-span-3">รหัสเอกสารดิจิทัล</div>
                          <div className="col-span-2">สายการอนุมัติ</div>
                          <div className="col-span-1 text-right">การจัดการ</div>
                        </div>

                        {/* Table Rows (ul > li for accessibility and test resilience) */}
                        <ul className="divide-y divide-slate-100">
                          {data.departments
                            .filter((d) => (departmentFilter === 'all' ? true : Boolean(d.enabled) === (departmentFilter === 'enabled')))
                            .map((d) => {
                              const prof = data.profiles[d.code];
                              const hasCustomSignatories = Boolean(prof?.assigned_reviewer_id && prof?.assigned_approver_id);

                              return (
                                <li
                                  key={d.code}
                                  className="flex flex-col md:grid md:grid-cols-12 gap-3 md:gap-4 px-6 py-4 items-start md:items-center hover:bg-slate-50/60 transition-colors"
                                >
                                  {/* Col 1: แผนก */}
                                  <div className="col-span-4 flex items-center gap-2.5 min-w-0">
                                    <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-md bg-slate-100 text-slate-800 text-xs font-bold font-mono border border-slate-200 shrink-0">
                                      {d.code}
                                    </span>
                                    <span className="text-sm font-semibold text-slate-900 truncate">
                                      {d.code} · {d.name_th}
                                    </span>
                                  </div>

                                  {/* Col 2: สวิตช์ Toggle Switch (iOS / Tailwind) */}
                                  <div className="col-span-2 flex items-center justify-start md:justify-center gap-2.5">
                                    <button
                                      type="button"
                                      aria-label={d.enabled ? 'ปิดรับงานใหม่' : 'เปิดรับงานใหม่'}
                                      disabled={busy}
                                      onClick={() => handleToggleDepartment(d)}
                                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:opacity-50 ${
                                        d.enabled ? 'bg-emerald-600' : 'bg-slate-300'
                                      }`}
                                    >
                                      <span
                                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                                          d.enabled ? 'translate-x-5' : 'translate-x-0'
                                        }`}
                                      />
                                    </button>
                                    <span className={`text-xs font-semibold ${d.enabled ? 'text-emerald-700' : 'text-slate-500'}`}>
                                      {d.enabled ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}
                                    </span>
                                  </div>

                                  {/* Col 3: รหัสเอกสารดิจิทัล */}
                                  <div className="col-span-3 flex items-center">
                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono font-medium bg-indigo-50 text-indigo-700 border border-indigo-200">
                                      <FileText size={13} className="text-indigo-500" />
                                      VCC-AP-{d.code}-2026
                                    </span>
                                  </div>

                                  {/* Col 4: สายการอนุมัติ */}
                                  <div className="col-span-2 text-xs text-slate-600 truncate">
                                    {hasCustomSignatories ? (
                                      <span className="inline-flex items-center gap-1 font-medium text-indigo-700">
                                        <CheckCircle2 size={13} className="text-indigo-500 shrink-0" />
                                        ระบุผู้ลงนามเฉพาะ
                                      </span>
                                    ) : (
                                      <span>ทบทวน: L{prof?.required_reviewer_level || 4}+ | อนุมัติ: L{prof?.required_approver_level || 5}+</span>
                                    )}
                                  </div>

                                  {/* Col 5: ปุ่มแก้ไขสายอนุมัติ */}
                                  <div className="col-span-1 flex justify-end">
                                    <button
                                      type="button"
                                      aria-label={`ตั้งค่า ${d.code}`}
                                      onClick={() => setEditingDepartment(d.code)}
                                      className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:text-indigo-600 hover:border-indigo-300 shadow-2xs transition-colors cursor-pointer"
                                    >
                                      <Settings size={14} className="text-slate-500" />
                                      <span className="hidden xl:inline">แก้ไขสายอนุมัติ</span>
                                    </button>
                                  </div>
                                </li>
                              );
                            })}
                        </ul>
                      </div>

                      {/* SLIDE-OVER DRAWER FOR APPROVAL CHAIN EDITING */}
                      {editingDepartment && (
                        <ModuleProfileEditor
                          key={editingDepartment}
                          department={editingDepartment}
                          data={data}
                          onClose={() => setEditingDepartment('')}
                          onReview={(profile) => {
                            if (isApiMode) {
                              review(
                                `บันทึกสายการอนุมัติของ ${editingDepartment}`,
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

                  {/* TAB 2: ALERTS */}
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
                      <ul className="divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white shadow-2xs overflow-hidden">
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

                  {/* TAB 3: HISTORY */}
                  {tab === 'history' && (
                    <section>
                      <h2 className="mb-4 text-lg font-semibold text-slate-900">ประวัติการตั้งค่า</h2>
                      <ul className="divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white shadow-2xs overflow-hidden">
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

                  {/* TAB 4: PERMISSIONS */}
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
                </div>
              )}

              {/* VIEW 2: DCC GOVERNANCE (Baseline Document Control Center) */}
              {selectedModuleId === 'dcc' && (
                <div className="space-y-6">
                  <section aria-label="รายละเอียดระบบควบคุมเอกสาร" className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xs">
                    <div className="p-6 space-y-6">
                      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-5">
                        <div className="flex items-start gap-3.5">
                          <div className="p-2.5 rounded-xl bg-slate-100 text-slate-700 border border-slate-200 shrink-0">
                            <LockKeyhole size={22} />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h2 className="text-xl font-bold text-slate-900">ระบบควบคุมเอกสาร (DCC)</h2>
                              <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 border border-emerald-200">
                                ระบบหลัก (System Baseline)
                              </span>
                            </div>
                            <p className="mt-1 text-sm text-slate-600">
                              แกนกลางการควบคุมสารสนเทศเอกสารและระเบียบปฏิบัติงานขององค์กร ตามมาตรฐาน ISO 9001:2015 ข้อ 7.5
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="grid gap-4 sm:grid-cols-3">
                        <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 space-y-1.5">
                          <div className="flex items-center gap-2 text-xs font-bold text-slate-700 uppercase tracking-wide">
                            <ShieldCheck size={16} className="text-emerald-600" />
                            <span>การควบคุมสถานะ</span>
                          </div>
                          <p className="text-xs text-slate-600 leading-relaxed">
                            สถานะโมดูล DCC เป็นระบบพื้นฐานที่เปิดใช้งานตลอดเวลา โดยควบคุมตามระเบียบปฏิบัติงานและบทบาท DCC/QMR
                          </p>
                        </div>

                        <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 space-y-1.5">
                          <div className="flex items-center gap-2 text-xs font-bold text-slate-700 uppercase tracking-wide">
                            <FileText size={16} className="text-indigo-600" />
                            <span>ขอบเขตทุกแผนก</span>
                          </div>
                          <p className="text-xs text-slate-600 leading-relaxed">
                            ผู้ใช้งานทุกแผนกมีสิทธิ์เข้าถึงทะเบียนเอกสารควบคุม (Master Document Register) และขอยื่นคำร้อง DAR ตามระดับสิทธิ์
                          </p>
                        </div>

                        <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 space-y-1.5">
                          <div className="flex items-center gap-2 text-xs font-bold text-slate-700 uppercase tracking-wide">
                            <Settings size={16} className="text-amber-600" />
                            <span>การจัดการและนโยบาย</span>
                          </div>
                          <p className="text-xs text-slate-600 leading-relaxed">
                            นโยบายการจัดเก็บเอกสาร รอบการทบทวนประจำปี และสายการอนุมัติ DAR ถูกบริหารจัดการผ่านหน้าเมนู DCC
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                        <Link
                          to="/dcc/documents"
                          className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 shadow-2xs transition-colors"
                        >
                          <FileText size={16} />
                          <span>เปิดดูทะเบียนเอกสารควบคุม (DCC Library)</span>
                        </Link>
                        <button
                          type="button"
                          onClick={() => setSelectedModuleId('vcc')}
                          className="inline-flex items-center gap-1.5 text-sm font-medium text-indigo-600 hover:text-indigo-800 cursor-pointer"
                        >
                          <Wrench size={16} />
                          <span>สลับไปจัดการโมดูลศูนย์ทวนสอบ (VCC)</span>
                        </button>
                      </div>
                    </div>
                  </section>
                </div>
              )}

              {/* VIEW 3: CAPA & TRAINING (Coming Soon Roadmap Placeholders) */}
              {(selectedModuleId === 'capa' || selectedModuleId === 'training') && (
                <div className="space-y-6">
                  <section aria-label="โมดูลในแผนการพัฒนา" className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xs">
                    <div className="p-8 text-center space-y-4 max-w-xl mx-auto">
                      <div className="inline-flex p-3 rounded-2xl bg-purple-50 text-purple-700 border border-purple-200">
                        {selectedModuleId === 'capa' ? <ShieldAlert size={32} /> : <GraduationCap size={32} />}
                      </div>
                      <div>
                        <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold bg-purple-50 text-purple-700 border border-purple-200 mb-2">
                          เร็วๆ นี้ (Coming Soon)
                        </span>
                        <h2 className="text-xl font-bold text-slate-900">
                          {selectedModuleId === 'capa'
                            ? 'ระบบจัดการข้อบกพร่องและการปฏิบัติการแก้ไข (CAPA)'
                            : 'ระบบฝึกอบรมและประเมินทักษะบุคลากร (Training)'}
                        </h2>
                        <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                          {selectedModuleId === 'capa'
                            ? 'โมดูลรองรับการเปิดประเด็นความไม่สอดคล้อง (CAR/PAR) การวิเคราะห์หาสาเหตุที่แท้จริง (Root Cause Analysis) และติดตามผลการแก้ไขป้องกัน ตามมาตรฐาน ISO 9001:2015 ข้อ 10.2'
                            : 'โมดูลบันทึกและประเมินสมรรถนะบุคลากร ทะเบียนประวัติการอบรมรายบุคคล และแผนผังทักษะ (Skill Matrix) ตามมาตรฐาน ISO 9001:2015 ข้อ 7.2'}
                        </p>
                      </div>

                      <div className="pt-2">
                        <button
                          type="button"
                          onClick={() => setSelectedModuleId('vcc')}
                          className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 shadow-2xs transition-colors cursor-pointer"
                        >
                          <Wrench size={16} />
                          <span>สลับกลับไปจัดการโมดูลศูนย์ทวนสอบ (VCC)</span>
                        </button>
                      </div>
                    </div>
                  </section>
                </div>
              )}
            </main>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
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
