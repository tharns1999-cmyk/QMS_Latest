import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { 
  Users, 
  Building2, 
  FileCode, 
  MapPin, 
  Clock, 
  Search, 
  Plus, 
  Edit, 
  Trash2, 
  ShieldAlert, 
  ShieldCheck, 
  Unlock, 
  RotateCcw, 
  X, 
  Layers, 
  Save, 
  ArrowLeft,
  Crown,
  Sparkles,
  PenTool,
  CheckCircle2,
  AlertCircle,
  Upload,
  Sliders,
  Check,
  ChevronDown,
  AlertTriangle,
  FileText,
  RefreshCw
} from 'lucide-react';
import useStore, { SYSTEM_CORE_DEPTS } from '../../../../store/useStore';
import { QMS_CONFIG } from '../../config/qmsRegistry';
import { normalizeDepartmentId } from '../../services/MasterDataService';
import toast from 'react-hot-toast';
import { TablePagination } from '../../../../shared/components/common/TablePagination';
import { useTablePagination } from '../../../../shared/hooks/useTablePagination';
import { generateCursiveSignatureDataUrl } from '../../utils/pdfStamper';
import { isApiMode } from '../../../../api/client';
import * as serverData from '../../../../api/masterData';
import { PasswordNotice, SecurityTab } from './ApiMasterData';

const MasterDataHub = () => {
  const navigate = useNavigate();
  const {
    currentUser,
    adminUsers,
    masterUsers: storeMasterUsers,
    masterDepartments, 
    departments: storeDepts,
    documentTypes, 
    distributionLocations, 
    slaSettings,
    approvalMatrix,
    approval_matrix,
    controlledCopyInstances,
    documentControlledCopies,
    documents,
    // Actions
    addMasterUser,
    updateMasterUser,
    toggleUserStatus,
    resetUserPassword,
    unlockUserAccount,
    updateUserSignatureProfile,
    updateUserSignature,
    addDepartment,
    updateDepartment,
    checkDepartmentDependencies,
    deactivateDepartment,
    reactivateDepartment,
    addDocumentType,
    updateDocumentType,
    toggleDocumentTypeStatus,
    addDistributionLocation,
    updateDistributionLocation,
    deleteDistributionLocation,
    toggleLocationStatus,
    updateSlaSettings,
    updateApprovalMatrixEntry,
    resetTransactionDataToCleanSlate,
    seedComprehensiveQaMockData
  } = useStore();

  // With a server, the list also holds closed and locked accounts, and users/departments/places/levels are saved there.
  const masterUsers = isApiMode ? adminUsers : storeMasterUsers;
  const [passwordNotice, setPasswordNotice] = useState(null);
  const [activeTab, setActiveTab] = useState('users'); // users, departments, docTypes, locations, security, sla
  const [isCleanSlateModalOpen, setIsCleanSlateModalOpen] = useState(false);

  // --- FILTERS & SEARCH STATES ---
  const [userSearch, setUserSearch] = useState('');
  const [userDeptFilter, setUserDeptFilter] = useState('');
  const [userRoleFilter, setUserRoleFilter] = useState('');

  const [deptSearch, setDeptSearch] = useState('');
  const [deptStatusFilter, setDeptStatusFilter] = useState('ALL'); // 'ALL' | 'ACTIVE' | 'INACTIVE'
  const [deactivatingDept, setDeactivatingDept] = useState(null);
  const [deactivationCheckResult, setDeactivationCheckResult] = useState(null);
  const [fallbackDeptId, setFallbackDeptId] = useState('');
  const [isDeactivatingLoading, setIsDeactivatingLoading] = useState(false);

  const [typeSearch, setTypeSearch] = useState('');
  
  const [locSearch, setLocSearch] = useState('');
  const [selectedLocDept, setSelectedLocDept] = useState('ALL');
  const [isLocDeptDropdownOpen, setIsLocDeptDropdownOpen] = useState(false);
  const [locDeptSearchText, setLocDeptSearchText] = useState('');
  const locDeptDropdownRef = useRef(null);


  // --- MODAL STATES ---
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [userFormData, setUserFormData] = useState({
    name: '',
    empId: '',
    email: '',
    department: 'QA',
    primary_department: 'QA',
    depts: ['QA'],
    affiliated_departments: ['QA'],
    position: 'Staff',
    role: 'GENERAL_USER',
    level: 1,
    approval_level: 1,
    permissions: ['DAR_CREATE', 'TASK_ACCESS', 'VIEW_REGISTER'],
    canCreateDar: true,
    canAccessTasks: true,
    canViewRegister: true,
    isWorkflowUser: true
  });

  const [isDeptModalOpen, setIsDeptModalOpen] = useState(false);
  const [editingDept, setEditingDept] = useState(null);
  const [deptFormData, setDeptFormData] = useState({
    id: '',
    nameTh: '',
    nameEn: '',
    headUserId: ''
  });

  const [isTypeModalOpen, setIsTypeModalOpen] = useState(false);
  const [editingType, setEditingType] = useState(null);
  const [typeFormData, setTypeFormData] = useState({
    code: '',
    nameTh: '',
    name: '',
    namingPattern: '{Type}-{Dept}-{##}',
    is_form_type: false,
    category: 'INTERNAL',
    allowDar: true,
    reviewCycleMonths: 12,
    retentionPeriodYears: 3,
    description: ''
  });

  const [isLocModalOpen, setIsLocModalOpen] = useState(false);
  const [editingLoc, setEditingLoc] = useState(null);
  const [locFormData, setLocFormData] = useState({
    id: '',
    code: '',
    name: '',
    departmentId: 'PD',
    description: '',
    isMasterOffice: false
  });

  const [orphanWarningModal, setOrphanWarningModal] = useState({
    isOpen: false,
    message: ''
  });


  // Signature Asset Modal States (Draw, Upload, Font)
  const [isSignatureModalOpen, setIsSignatureModalOpen] = useState(false);
  const [selectedUserForSignature, setSelectedUserForSignature] = useState(null);
  const [signatureActiveTab, setSignatureActiveTab] = useState('DRAWN'); // 'DRAWN', 'IMAGE', 'TYPOGRAPHIC'
  const [signatureFormData, setSignatureFormData] = useState({
    signatureType: 'DRAWN',
    signatureStyle: 'BRUSH_SCRIPT',
    signatureInitials: '',
    signatureImage: '',
    certificateSerial: ''
  });
  const sigCanvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);

  // Digital Stamp Simulator Modal States
  const [isStampSimulatorModalOpen, setIsStampSimulatorModalOpen] = useState(false);
  const [stampSimulatorUser, setStampSimulatorUser] = useState(null);
  const [stampSimulatorRole, setStampSimulatorRole] = useState('APPROVER');

  // SLA Form
  const [slaForm, setSlaForm] = useState({
    reviewSlaDays: slaSettings?.reviewSlaDays || 3,
    approvalSlaDays: slaSettings?.approvalSlaDays || 3,
    hardcopyReceiptSlaDays: slaSettings?.hardcopyReceiptSlaDays || 5,
    recallSlaDays: slaSettings?.recallSlaDays || 7
  });

  // Dynamic Approval Rows: Linked directly to Tab 3's documentTypes (Single Source of Truth)
  const dynamicApprovalRows = useMemo(() => {
    const rawMatrix = approvalMatrix || approval_matrix || [];
    const types = (documentTypes && documentTypes.length > 0) ? documentTypes : [
      { code: 'QM', name: 'คู่มือคุณภาพ (Quality Manual)', nameTh: 'คู่มือคุณภาพ', description: 'คู่มือคุณภาพระดับสูงสุดขององค์กร' },
      { code: 'SOP', name: 'ระเบียบปฏิบัติ (Standard Operating Procedure)', nameTh: 'ระเบียบปฏิบัติ', description: 'ขั้นตอนการทำงานข้ามสายงาน' },
      { code: 'WI', name: 'วิธีปฏิบัติงาน (Work Instruction)', nameTh: 'วิธีปฏิบัติงาน', description: 'ขั้นตอนการปฏิบัติงานเฉพาะจุด' },
      { code: 'FM', name: 'แบบฟอร์ม (Form / Record)', nameTh: 'แบบฟอร์ม', description: 'แบบฟอร์มบันทึกข้อมูลคุณภาพ' },
      { code: 'SD', name: 'เอกสารสนับสนุน (Supporting Document)', nameTh: 'เอกสารสนับสนุน', description: 'เอกสารสนับสนุนและอ้างอิงภายนอก' }
    ];

    return types.map((docType) => {
      const code = docType.code || docType.id;
      const existingConfig = rawMatrix.find(
        (m) => (m.doc_type || m.docType) === code
      );

      const defaultApprover = code === 'QM' ? 8 : (code === 'SOP' ? 6 : 5);

      return {
        code,
        docType: code,
        doc_type: code,
        name: docType.nameTh || docType.name || code,
        nameTh: docType.nameTh || docType.name || code,
        description: docType.description || '',
        category: docType.category || (code === 'ED' ? 'EXTERNAL' : 'INTERNAL'),
        minRequesterLevel: existingConfig?.min_requester_level ?? existingConfig?.minRequesterLevel ?? 1,
        min_requester_level: existingConfig?.min_requester_level ?? existingConfig?.minRequesterLevel ?? 1,
        requiredReviewerLevel: existingConfig?.required_reviewer_level ?? existingConfig?.requiredReviewerLevel ?? 4,
        required_reviewer_level: existingConfig?.required_reviewer_level ?? existingConfig?.requiredReviewerLevel ?? 4,
        requiredApproverLevel: existingConfig?.required_approver_level ?? existingConfig?.requiredApproverLevel ?? defaultApprover,
        required_approver_level: existingConfig?.required_approver_level ?? existingConfig?.requiredApproverLevel ?? defaultApprover,
        requireAckDefault: existingConfig?.require_ack_default ?? existingConfig?.requireAckDefault ?? false,
        require_ack_default: existingConfig?.require_ack_default ?? existingConfig?.requireAckDefault ?? false,
      };
    });
  }, [documentTypes, approvalMatrix, approval_matrix]);

  const approvalMatrixPagination = useTablePagination(dynamicApprovalRows, 10);

  const [isMatrixModalOpen, setIsMatrixModalOpen] = useState(false);
  const [matrixFormData, setMatrixFormData] = useState({
    docType: 'SOP',
    nameTh: '',
    minRequesterLevel: 1,
    requiredReviewerLevel: 4,
    requiredApproverLevel: 6,
    requireAckDefault: true,
    description: ''
  });

  // Access Control: Only DCC Admin or Super Admin
  const isAdmin = currentUser?.isDcc || currentUser?.role === 'DCC_ADMIN' || currentUser?.role === 'SUPER_ADMIN';

  // Fallback dept list — sourced from registry (no hardcoded dept objects)
  const departmentsList = useMemo(() => {
    if (masterDepartments && masterDepartments.length > 0) return masterDepartments;
    if (storeDepts && storeDepts.length > 0) {
      return storeDepts.map(d => ({
        id: d,
        nameTh: d,
        nameEn: d,
        headName: 'Department Head'
      }));
    }
    // Final fallback: use the centralised registry (zero hardcoding)
    return QMS_CONFIG.departments.filter(d => !d.status || d.status === 'ACTIVE');
  }, [masterDepartments, storeDepts]);

  const allCopies = useMemo(() => {
    return (controlledCopyInstances && controlledCopyInstances.length > 0) 
      ? controlledCopyInstances 
      : (documentControlledCopies || []);
  }, [controlledCopyInstances, documentControlledCopies]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (locDeptDropdownRef.current && !locDeptDropdownRef.current.contains(event.target)) {
        setIsLocDeptDropdownOpen(false);
      }
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setIsLocDeptDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);


  // --- TAB 1 HANDLERS (Users) ---
  const filteredUsers = (masterUsers || []).filter(u => {
    const matchSearch = !userSearch || 
      (u.name || '').toLowerCase().includes(userSearch.toLowerCase()) ||
      (u.id || '').toLowerCase().includes(userSearch.toLowerCase()) ||
      (u.empId || '').toLowerCase().includes(userSearch.toLowerCase()) ||
      (u.email || '').toLowerCase().includes(userSearch.toLowerCase()) ||
      (u.position || '').toLowerCase().includes(userSearch.toLowerCase());
    const matchDept = !userDeptFilter || u.department === userDeptFilter || (u.depts && u.depts.includes(userDeptFilter));
    const matchRole = !userRoleFilter || u.role === userRoleFilter || (userRoleFilter === 'DCC_ADMIN' && u.isDcc);
    return matchSearch && matchDept && matchRole;
  });

  const userPagination = useTablePagination(filteredUsers, 50);

  const handleOpenUserModal = (user = null) => {
    if (user) {
      setEditingUser(user);
      let primary = user.primary_department || user.department || user.depts?.[0] || 'QA';
      if (primary === 'QA/QC' || primary === 'QAQC') primary = 'QC';
      const rawAffiliated = user.affiliated_departments || user.depts || (user.department ? [user.department] : [primary]);
      let affiliated = Array.from(new Set([primary, ...(Array.isArray(rawAffiliated) ? rawAffiliated : [rawAffiliated])]));
      if (primary === 'QC') {
        affiliated = affiliated.map(d => (d === 'QA/QC' || d === 'QAQC') ? 'QC' : d);
      }
      affiliated = Array.from(new Set(affiliated));
      setUserFormData({
        name: user.name,
        empId: user.empId || '',
        email: user.email || '',
        department: primary,
        primary_department: primary,
        depts: affiliated,
        departments: affiliated,
        affiliated_departments: affiliated,
        position: user.position || '',
        role: user.isDcc ? 'DCC_ADMIN' : user.isQmr ? 'QMR' : (user.role || 'GENERAL_USER'),
        level: user.approval_level || user.level || 1,
        approval_level: user.approval_level || user.level || 1
      });
    } else {
      setEditingUser(null);
      setUserFormData({
        name: '',
        empId: '',
        email: '',
        department: 'QA',
        primary_department: 'QA',
        depts: ['QA'],
        departments: ['QA'],
        affiliated_departments: ['QA'],
        position: 'Staff',
        role: 'GENERAL_USER',
        level: 1,
        approval_level: 1,
        permissions: ['DAR_CREATE', 'TASK_ACCESS', 'VIEW_REGISTER'],
        canCreateDar: true,
        canAccessTasks: true,
        canViewRegister: true,
        isWorkflowUser: true
      });
    }
    setIsUserModalOpen(true);
  };

  const handleSaveUser = async (e) => {
    e.preventDefault();
    if (!userFormData.name.trim()) {
      toast.error('กรุณาระบุชื่อ-นามสกุล');
      return;
    }

    if (isApiMode) {
      const form = {
        ...userFormData,
        department: userFormData.primary_department || userFormData.department,
        depts: userFormData.depts,
        approval_level: userFormData.approval_level || userFormData.level,
        isDcc: userFormData.role === 'DCC_ADMIN',
        isQmr: userFormData.role === 'QMR'
      };
      const result = editingUser ? await serverData.updateUser(editingUser.id, form) : await serverData.createUser(form);
      if (!result) return;
      setIsUserModalOpen(false);
      if (!editingUser) setPasswordNotice({ name: form.name, email: form.email.trim().toLowerCase(), password: result.temporaryPassword });
      return;
    }

    try {
      if (editingUser) {
        updateMasterUser(editingUser.id, {
          ...userFormData,
          permissions: userFormData.permissions || editingUser.permissions || ['DAR_CREATE', 'TASK_ACCESS', 'VIEW_REGISTER'],
          canCreateDar: userFormData.canCreateDar !== undefined ? userFormData.canCreateDar : (editingUser.canCreateDar ?? true),
          canAccessTasks: userFormData.canAccessTasks !== undefined ? userFormData.canAccessTasks : (editingUser.canAccessTasks ?? true),
          canViewRegister: userFormData.canViewRegister !== undefined ? userFormData.canViewRegister : (editingUser.canViewRegister ?? true),
          isWorkflowUser: userFormData.isWorkflowUser !== undefined ? userFormData.isWorkflowUser : (editingUser.isWorkflowUser ?? true)
        });
        toast.success(`อัปเดตข้อมูลผู้ใช้ "${userFormData.name}" เรียบร้อยแล้ว`);
      } else {
        addMasterUser({
          ...userFormData,
          permissions: userFormData.permissions || ['DAR_CREATE', 'TASK_ACCESS', 'VIEW_REGISTER'],
          canCreateDar: true,
          canAccessTasks: true,
          canViewRegister: true,
          isWorkflowUser: true
        });
        toast.success(`เพิ่มผู้ใช้งาน "${userFormData.name}" เรียบร้อยแล้ว`);
      }
      setIsUserModalOpen(false);
    } catch (err) {
      toast.error(err.message || 'เกิดข้อผิดพลาดในการบันทึกข้อมูล');
    }
  };

  // --- TAB 2 HANDLERS (Departments) ---
  const filteredDepartments = departmentsList.filter(d => {
    const matchSearch = (d.id || '').toLowerCase().includes(deptSearch.toLowerCase()) ||
      (d.nameTh || d.name || '').toLowerCase().includes(deptSearch.toLowerCase()) ||
      (d.nameEn || '').toLowerCase().includes(deptSearch.toLowerCase()) ||
      (d.headName || '').toLowerCase().includes(deptSearch.toLowerCase());

    const isDeptActive = d.status !== 'INACTIVE';
    const matchStatus = deptStatusFilter === 'ALL'
      ? true
      : (deptStatusFilter === 'ACTIVE' ? isDeptActive : !isDeptActive);

    return matchSearch && matchStatus;
  });

  const handleInitiateDeactivateDept = (dept) => {
    if (isApiMode) {
      // The server refuses while anyone still belongs to the department.
      if (window.confirm(`ปิดแผนก ${dept.id}? ปิดได้เมื่อไม่มีผู้ใช้สังกัดอยู่`)) serverData.updateDepartment(dept.id, { status: 'INACTIVE' });
      return;
    }
    if (SYSTEM_CORE_DEPTS.includes(dept.id)) {
      toast.error(`แผนก "${dept.id}" เป็นแผนกหลักของระบบควบคุมคุณภาพ (Core Department) ไม่อนุญาตให้ระงับการใช้งาน`);
      return;
    }

    const check = checkDepartmentDependencies(dept.id);
    setDeactivationCheckResult(check);
    setDeactivatingDept(dept);

    // Pick first available active fallback dept that is not target
    const availableFallbacks = departmentsList.filter(d => d.id !== dept.id && d.status !== 'INACTIVE' && !SYSTEM_CORE_DEPTS.includes(d.id));
    const fallback = availableFallbacks.length > 0 
      ? availableFallbacks[0].id 
      : (departmentsList.find(d => d.id !== dept.id && d.status !== 'INACTIVE')?.id || '');
    setFallbackDeptId(fallback);
  };

  const handleConfirmDeactivateDept = async () => {
    if (!deactivatingDept) return;
    setIsDeactivatingLoading(true);
    try {
      deactivateDepartment(deactivatingDept.id, fallbackDeptId);
      toast.success(`ระงับการใช้งานแผนก "${deactivatingDept.id}" และโอนย้ายพนักงานเรียบร้อยแล้ว`);
      setDeactivatingDept(null);
      setDeactivationCheckResult(null);
    } catch (err) {
      toast.error(err.message || 'ไม่สามารถระงับแผนกได้');
    } finally {
      setIsDeactivatingLoading(false);
    }
  };

  const handleReactivateDept = (deptId) => {
    if (isApiMode) {
      serverData.updateDepartment(deptId, { status: 'ACTIVE' });
      return;
    }
    try {
      reactivateDepartment(deptId);
      toast.success(`เปิดใช้งานแผนก "${deptId}" อีกครั้งเรียบร้อยแล้ว`);
    } catch (err) {
      toast.error(err.message || 'ไม่สามารถเปิดใช้งานแผนกได้');
    }
  };

  const handleOpenDeptModal = (dept = null) => {
    if (dept) {
      const deptCode = dept.id || dept.code || dept.deptCode || '';
      const nameTh = dept.nameTh || dept.name || dept.name_th || '';
      const nameEn = dept.nameEn || dept.name_en || '';
      setEditingDept({
        ...dept,
        id: deptCode,
        code: deptCode,
        deptCode: deptCode,
        oldCode: deptCode
      });
      setDeptFormData({
        id: deptCode,
        code: deptCode,
        deptCode: deptCode,
        nameTh: nameTh,
        name: nameTh,
        name_th: nameTh,
        nameEn: nameEn,
        name_en: nameEn,
        headUserId: dept.headUserId || ''
      });
    } else {
      setEditingDept(null);
      setDeptFormData({
        id: '',
        code: '',
        deptCode: '',
        nameTh: '',
        name: '',
        name_th: '',
        nameEn: '',
        name_en: '',
        headUserId: ''
      });
    }
    setIsDeptModalOpen(true);
  };

  const handleCloseDeptModal = () => {
    setIsDeptModalOpen(false);
    setEditingDept(null);
    setDeptFormData({
      id: '',
      code: '',
      deptCode: '',
      nameTh: '',
      name: '',
      name_th: '',
      nameEn: '',
      name_en: '',
      headUserId: ''
    });
  };

  const handleSaveDept = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (isApiMode) {
      const code = (deptFormData.id || '').toString().trim().toUpperCase();
      const nameTh = (deptFormData.nameTh || '').toString().trim();
      if (!code || !nameTh) {
        toast.error('กรุณากรอกรหัสแผนกและชื่อภาษาไทย');
        return;
      }
      const nameEn = (deptFormData.nameEn || '').toString().trim();
      const saved = editingDept
        ? await serverData.updateDepartment(editingDept.oldCode || editingDept.id, { name_th: nameTh, name_en: nameEn })
        : await serverData.createDepartment({ code, nameTh, nameEn });
      if (saved) handleCloseDeptModal();
      return;
    }
    try {
      const currentDeptId = (editingDept?.id || editingDept?.code || editingDept?.deptCode || editingDept?.oldCode || '').toString().trim().toUpperCase();
      const newCode = (deptFormData.id || deptFormData.code || deptFormData.deptCode || '').toString().trim().toUpperCase();
      const rawNameTh = (deptFormData.nameTh || deptFormData.name || deptFormData.name_th || '').toString().trim();

      if (!newCode || !rawNameTh) {
        toast.error('กรุณากรอกรหัสแผนกและชื่อภาษาไทย');
        return;
      }

      // Safe access to departments list (harmonized across all store aliases)
      const departments = (masterDepartments && masterDepartments.length > 0)
        ? masterDepartments
        : ((storeDepts && storeDepts.length > 0) ? storeDepts : (departmentsList || []));

      // ตรวจสอบซ้ำเฉพาะกรณีที่รหัสไม่ตรงกับตัวมันเอง (Exclude ตัวเองออกเสมอ)
      const isDuplicate = departments.some(d => {
        const existingId = (d.id || d.code || d.deptCode || '').toString().trim().toUpperCase();
        return existingId === newCode && existingId !== currentDeptId;
      });

      if (isDuplicate) {
        // แจ้งเตือนว่ารหัสซ้ำกับแผนกอื่น
        toast.error(`รหัสแผนก ${newCode} มีอยู่ในระบบแล้ว`);
        return;
      }

      const headUser = (masterUsers || []).find(u => u.id === deptFormData.headUserId);
      const headName = headUser ? headUser.name : (editingDept?.headName || editingDept?.manager || 'ยังไม่ได้กำหนด');

      const payload = {
        ...deptFormData,
        id: newCode,
        code: newCode,
        deptCode: newCode,
        name: rawNameTh,
        nameTh: rawNameTh,
        name_th: rawNameTh,
        nameEn: (deptFormData.nameEn || deptFormData.name_en || '').toString().trim(),
        name_en: (deptFormData.nameEn || deptFormData.name_en || '').toString().trim(),
        headUserId: deptFormData.headUserId || '',
        headName: headName,
        manager: headName
      };

      if (editingDept) {
        const targetId = editingDept.oldCode || editingDept.id || editingDept.code;
        updateDepartment(targetId, payload);
        toast.success(`อัปเดตแผนก "${payload.id}" เรียบร้อยแล้ว`);
      } else {
        addDepartment(payload);
        toast.success(`เพิ่มแผนก "${payload.id}" เรียบร้อยแล้ว`);
      }

      handleCloseDeptModal();
    } catch (err) {
      console.error('handleSaveDept error:', err);
      toast.error(err.message || 'เกิดข้อผิดพลาดในการบันทึกข้อมูลแผนก');
    }
  };

  // --- TAB 3 HANDLERS (Document Types) ---
  const filteredDocTypes = (documentTypes || []).filter(t => {
    return (t.code || t.id || '').toLowerCase().includes(typeSearch.toLowerCase()) ||
      (t.nameTh || '').toLowerCase().includes(typeSearch.toLowerCase()) ||
      (t.name || '').toLowerCase().includes(typeSearch.toLowerCase());
  });

  const docTypePagination = useTablePagination(filteredDocTypes, 10);

  const handleOpenTypeModal = (type = null) => {
    if (type) {
      setEditingType(type);
      const isExt = type.category === 'EXTERNAL' || type.code === 'ED';
      setTypeFormData({
        code: type.code || type.id,
        nameTh: type.nameTh || '',
        name: type.name || '',
        namingPattern: type.namingPattern || '',
        is_form_type: Boolean(type.is_form_type),
        category: type.category || (isExt ? 'EXTERNAL' : 'INTERNAL'),
        allowDar: type.allowDar !== undefined ? type.allowDar : !isExt,
        reviewCycleMonths: type.reviewCycleMonths || 12,
        retentionPeriodYears: type.retentionPeriodYears || 3,
        description: type.description || ''
      });
    } else {
      setEditingType(null);
      setTypeFormData({
        code: '',
        nameTh: '',
        name: '',
        namingPattern: '{Type}-{Dept}-{##}',
        is_form_type: false,
        category: 'INTERNAL',
        allowDar: true,
        reviewCycleMonths: 12,
        retentionPeriodYears: 3,
        description: ''
      });
    }
    setIsTypeModalOpen(true);
  };

  const handleSaveType = (e) => {
    e.preventDefault();
    if (!typeFormData.code.trim() || !typeFormData.nameTh.trim()) {
      toast.error('กรุณากรอกรหัสประเภทและชื่อประเภทเอกสาร');
      return;
    }

    const payload = {
      ...typeFormData,
      code: typeFormData.code.toUpperCase(),
      name: typeFormData.name || typeFormData.nameTh
    };

    try {
      if (editingType) {
        updateDocumentType(editingType.code || editingType.id, payload);
        toast.success(`อัปเดตประเภทเอกสาร "${payload.code}" เรียบร้อยแล้ว`);
      } else {
        addDocumentType(payload);
        toast.success(`เพิ่มประเภทเอกสาร "${payload.code}" เรียบร้อยแล้ว`);
      }
      if (isApiMode) serverData.saveDocumentTypes(useStore.getState().documentTypes);
      setIsTypeModalOpen(false);
    } catch (err) {
      toast.error(err.message || 'เกิดข้อผิดพลาด');
    }
  };

  // --- TAB 4 HANDLERS (Distribution Locations) ---
  const stationCountByDept = useMemo(() => {
    const counts = {};
    (distributionLocations || []).forEach(loc => {
      const dept = loc.departmentId || loc.department || 'PD';
      counts[dept] = (counts[dept] || 0) + 1;
    });
    return counts;
  }, [distributionLocations]);

  const filteredDeptOptions = useMemo(() => {
    const query = locDeptSearchText.trim().toLowerCase();
    if (!query) return departmentsList;
    return departmentsList.filter(d => 
      (d.id || '').toLowerCase().includes(query) ||
      (d.nameTh || '').toLowerCase().includes(query) ||
      (d.nameEn || '').toLowerCase().includes(query) ||
      (d.name || '').toLowerCase().includes(query)
    );
  }, [departmentsList, locDeptSearchText]);

  const filteredLocations = (distributionLocations || []).filter(l => {
    const dept = l.departmentId || l.department || '';
    const matchDept = selectedLocDept === 'ALL' || dept === selectedLocDept;
    const matchSearch = (l.name || '').toLowerCase().includes(locSearch.toLowerCase()) ||
      (l.id || '').toLowerCase().includes(locSearch.toLowerCase()) ||
      (l.code || '').toLowerCase().includes(locSearch.toLowerCase()) ||
      (l.description || '').toLowerCase().includes(locSearch.toLowerCase());
    return matchDept && matchSearch;
  });

  const locationPagination = useTablePagination(filteredLocations, 10);

  const handleOpenLocModal = (loc = null) => {
    if (loc) {
      setEditingLoc(loc);
      setLocFormData({
        id: loc.id,
        code: loc.code || loc.id,
        name: loc.name,
        departmentId: loc.departmentId || 'PD',
        description: loc.description || '',
        isMasterOffice: Boolean(loc.isMasterOffice)
      });
    } else {
      setEditingLoc(null);
      setLocFormData({
        id: '',
        code: '',
        name: '',
        departmentId: selectedLocDept !== 'ALL' ? selectedLocDept : 'PD',
        description: '',
        isMasterOffice: false
      });
    }
    setIsLocModalOpen(true);
  };

  const handleSaveLoc = async (e) => {
    e.preventDefault();
    if (!locFormData.name.trim() || !locFormData.departmentId) {
      toast.error('กรุณาระบุชื่อสถานีปฏิบัติงานและเลือกแผนก');
      return;
    }

    if (isApiMode) {
      const saved = editingLoc
        ? await serverData.updateLocation(editingLoc.id, { name: locFormData.name, description: locFormData.description, is_master: Boolean(locFormData.isMasterOffice) })
        : await serverData.createLocation({ department: locFormData.departmentId, name: locFormData.name, description: locFormData.description, is_master: Boolean(locFormData.isMasterOffice) });
      if (saved) setIsLocModalOpen(false);
      return;
    }

    try {
      if (editingLoc) {
        updateDistributionLocation(editingLoc.id, locFormData);
        toast.success(`อัปเดตจุดใช้งาน "${locFormData.name}" เรียบร้อยแล้ว`);
      } else {
        addDistributionLocation(locFormData);
        toast.success(`เพิ่มจุดใช้งาน "${locFormData.name}" เรียบร้อยแล้ว`);
      }
      setIsLocModalOpen(false);
    } catch (err) {
      toast.error(err.message || 'เกิดข้อผิดพลาด');
    }
  };

  const handleDeleteLoc = (locId) => {
    if (isApiMode) {
      // Copies already issued remember their place, so the server keeps it and it is closed instead.
      serverData.updateLocation(locId, { status: 'INACTIVE' });
      return;
    }
    try {
      deleteDistributionLocation(locId);
      toast.success('ลบจุดใช้งานเรียบร้อยแล้ว');
    } catch (err) {
      setOrphanWarningModal({
        isOpen: true,
        message: err.message
      });
    }
  };

  // --- SIGNATURE ASSET HANDLERS (Drawing, Upload, Typography) ---
  const handleOpenSignatureModal = (user) => {
    setSelectedUserForSignature(user);
    const initialType = user.signatureType || (user.signatureImage ? 'IMAGE' : 'TYPOGRAPHIC');
    setSignatureActiveTab(initialType);
    setSignatureFormData({
      signatureType: initialType,
      signatureStyle: user.signatureStyle || 'BRUSH_SCRIPT',
      signatureInitials: user.signatureInitials || (user.name ? user.name.split(' ').map(n => n[0]).join('') : 'SIG'),
      signatureImage: user.signatureImage || '',
      certificateSerial: user.certificateSerial || `SIG-${user.id || '000'}`
    });
    setIsSignatureModalOpen(true);
  };

  const startDrawing = (e) => {
    const canvas = sigCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    const clientX = e.clientX || (e.touches && e.touches[0] ? e.touches[0].clientX : 0);
    const clientY = e.clientY || (e.touches && e.touches[0] ? e.touches[0].clientY : 0);
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
  };

  const draw = (e) => {
    if (!isDrawing) return;
    const canvas = sigCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    const clientX = e.clientX || (e.touches && e.touches[0] ? e.touches[0].clientX : 0);
    const clientY = e.clientY || (e.touches && e.touches[0] ? e.touches[0].clientY : 0);
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    ctx.lineWidth = 2.8;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#0f172a';
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    const canvas = sigCanvasRef.current;
    if (canvas) {
      const dataUrl = canvas.toDataURL('image/png');
      setSignatureFormData(prev => ({
        ...prev,
        signatureType: 'DRAWN',
        signatureImage: dataUrl
      }));
    }
  };

  const clearCanvas = () => {
    const canvas = sigCanvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      setSignatureFormData(prev => ({
        ...prev,
        signatureImage: ''
      }));
    }
  };

  const handleSignatureFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error('ขนาดไฟล์ภาพต้องไม่เกิน 2MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      setSignatureFormData(prev => ({
        ...prev,
        signatureType: 'IMAGE',
        signatureImage: event.target.result
      }));
      toast.success('โหลดรูปภาพลายเซ็นสำเร็จ');
    };
    reader.readAsDataURL(file);
  };

  const handleSaveSignatureProfile = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!selectedUserForSignature) return;

    try {
      let finalSigImage = signatureFormData.signatureImage;
      if (signatureActiveTab === 'TYPOGRAPHIC' && !finalSigImage) {
        finalSigImage = generateCursiveSignatureDataUrl(
          signatureFormData.signatureInitials || selectedUserForSignature.name,
          signatureFormData.signatureStyle
        );
      }

      // 1. Direct persistence to IndexedDB
      if (finalSigImage && typeof updateUserSignature === 'function') {
        await updateUserSignature(selectedUserForSignature.id, finalSigImage);
      }

      // 2. Sync user signature profile metadata
      updateUserSignatureProfile(selectedUserForSignature.id, {
        ...signatureFormData,
        signatureImage: finalSigImage || signatureFormData.signatureImage,
        signatureType: signatureActiveTab
      });
      if (isApiMode) {
        const saved = await serverData.saveSignature(selectedUserForSignature.id, { ...signatureFormData, signatureType: signatureActiveTab, signatureImage: finalSigImage || signatureFormData.signatureImage });
        if (!saved) return;
      } else {
        toast.success(`บันทึกสินทรัพย์ลายเซ็นของ "${selectedUserForSignature.name}" เรียบร้อยแล้ว`);
      }
      setIsSignatureModalOpen(false);
    } catch (err) {
      toast.error(err.message || 'เกิดข้อผิดพลาดในการบันทึกลายเซ็น');
    }
  };

  const handleOpenStampSimulator = (user) => {
    setStampSimulatorUser(user);
    setStampSimulatorRole('APPROVER');
    setIsStampSimulatorModalOpen(true);
  };

  // --- TAB 6 HANDLERS (SLA & Approval Matrix Settings) ---
  const handleAdjustSla = (field, delta) => {
    setSlaForm(prev => {
      const current = Number(prev[field]) || 1;
      const updated = Math.max(1, Math.min(30, current + delta));
      return { ...prev, [field]: updated };
    });
  };

  const handleOpenMatrixModal = (entry) => {
    const code = entry.docType || entry.code || entry.doc_type || 'SOP';
    const matchedType = (documentTypes || []).find(t => (t.code || t.id) === code);
    setMatrixFormData({
      docType: code,
      nameTh: entry.nameTh || entry.name || matchedType?.nameTh || matchedType?.name || entry.description || code,
      minRequesterLevel: entry.minRequesterLevel ?? entry.min_requester_level ?? 1,
      requiredReviewerLevel: entry.requiredReviewerLevel ?? entry.required_reviewer_level ?? 4,
      requiredApproverLevel: entry.requiredApproverLevel ?? entry.required_approver_level ?? (code === 'QM' ? 8 : code === 'SOP' ? 6 : 5),
      requireAckDefault: entry.requireAckDefault ?? entry.require_ack_default ?? false,
      description: entry.description || matchedType?.description || ''
    });
    setIsMatrixModalOpen(true);
  };

  const handleSaveMatrixEntry = (e) => {
    e.preventDefault();
    if (!matrixFormData.docType) return;
    if (matrixFormData.requiredApproverLevel < matrixFormData.requiredReviewerLevel) {
      toast.error('ระดับผู้อนุมัติขั้นสุดท้าย (Approver Level) ต้องไม่ต่ำกว่าระดับผู้ทบทวน (Reviewer Level)');
      return;
    }
    if (isApiMode) {
      const current = (approvalMatrix || []).find((m) => m.doc_type === matrixFormData.docType);
      serverData.saveMatrixEntry(matrixFormData.docType, {
        min_requester_level: matrixFormData.minRequesterLevel,
        required_reviewer_level: matrixFormData.requiredReviewerLevel,
        required_approver_level: matrixFormData.requiredApproverLevel,
        obsolete_approver_level: current?.obsolete_approver_level ?? null
      }).then((saved) => saved && setIsMatrixModalOpen(false));
      return;
    }
    updateApprovalMatrixEntry(matrixFormData.docType, matrixFormData);
    toast.success(`อัปเดตสายการอนุมัติสำหรับ ${matrixFormData.docType} เรียบร้อยแล้ว`);
    setIsMatrixModalOpen(false);
  };

  const handleSaveAllSlaAndMatrix = (e) => {
    e.preventDefault();
    updateSlaSettings(slaForm);
    if (isApiMode) {
      serverData.saveSla(Object.fromEntries(Object.entries(slaForm).map(([k, v]) => [k, Number(v)])));
      return;
    }
    toast.success('บันทึกการตั้งค่าสายการอนุมัติและ SLAs เรียบร้อยแล้ว');
  };

  // If unauthorized, render Access Denied Card
  if (!isAdmin) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl p-8 border border-rose-200 shadow-none max-w-md w-full text-center space-y-4">
          <div className="w-16 h-16 bg-rose-100 text-rose-600 rounded-xl flex items-center justify-center mx-auto">
            <ShieldAlert size={32} />
          </div>
          <h2 className="text-xl font-bold text-[#1E1E1E]">การเข้าถึงถูกปฏิเสธ (Access Denied)</h2>
          <p className="text-sm text-[#666666]">
            ระบบสงวนสิทธิ์การเข้าใช้งานศูนย์ข้อมูลหลัก (Master Data Management Hub) ให้เฉพาะเจ้าหน้าที่ควบคุมเอกสาร (DCC Admin) หรือ Super Admin เท่านั้น
          </p>
          <button
            onClick={() => navigate('/portal')}
            className="w-full py-3 bg-slate-900 text-white font-bold rounded-xl text-sm hover:bg-slate-800 transition-colors"
          >
            กลับสู่หน้าหลัก (Portal Home)
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 w-full min-w-0 pb-12 overflow-hidden">
      {/* 1. Minimalist Page Header (Clean Single-Row <= 48px) */}
      <div className="flex items-center justify-between gap-3 h-11">
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            onClick={() => navigate('/dcc/dashboard')}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors shrink-0"
            title="กลับ Dashboard"
          >
            <ArrowLeft size={16} />
          </button>
          <div className="flex items-center gap-2 min-w-0">
            <h1 className="text-base sm:text-lg font-semibold tracking-tight text-slate-900 truncate">
              จัดการข้อมูลหลัก (Master Data)
            </h1>
            <span className="hidden sm:inline-flex px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-slate-100 text-slate-600 border border-slate-200 shrink-0">
              ADMIN CONFIG
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {!isApiMode && (<>
          <button
            type="button"
            onClick={() => {
              seedComprehensiveQaMockData();
              toast.success('โหลดชุดข้อมูลจำลอง QA Workflow (DARs, Tasks, สำเนาควบคุม) เรียบร้อยแล้ว');
            }}
            className="h-8 px-2.5 rounded-lg text-xs font-medium text-sky-700 bg-sky-50 hover:bg-sky-100 border border-sky-200/80 transition-colors flex items-center gap-1.5"
            title="โหลดชุดข้อมูลจำลองคำร้อง QA ครบทุก Flow"
          >
            <Sparkles size={12} className="text-sky-600" />
            <span className="hidden md:inline">Mock Data (QA)</span>
          </button>

          <button
            type="button"
            onClick={() => setIsCleanSlateModalOpen(true)}
            className="h-8 px-2.5 rounded-lg text-xs font-medium text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200/80 transition-colors flex items-center gap-1.5"
            title="ล้างข้อมูลธุรกรรมจำลองทั้งหมด"
          >
            <RotateCcw size={12} className="text-rose-600" />
            <span className="hidden md:inline">Clean Slate</span>
          </button>
          </>)}

          <div className="h-4 w-px bg-slate-200 mx-1 hidden sm:block" />

          <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-mono font-medium text-slate-600 bg-slate-50 border border-slate-200/80">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
            ACTIVE
          </span>
        </div>
      </div>

      {/* 2. Modern Linear-Style Segmented Tabs */}
      <div className="flex items-center gap-1 p-1 bg-slate-100/90 rounded-xl border border-slate-200/80 overflow-x-auto scrollbar-none">
        {[
          { id: 'users', label: 'ผู้ใช้งาน (Users)', legacyLabel: '1. ผู้ใช้งานและสิทธิ์', icon: Users, count: (masterUsers || []).length },
          { id: 'departments', label: 'แผนก (Departments)', legacyLabel: '2. แผนกและโครงสร้าง', icon: Building2, count: departmentsList.length },
          { id: 'docTypes', label: 'ประเภทเอกสาร (Doc Types)', legacyLabel: '3. ประเภทเอกสารและรหัส', icon: FileCode, count: (documentTypes || []).length },
          { id: 'locations', label: 'จุดใช้งาน (Stations)', legacyLabel: '4. จุดใช้งานและไลน์ผลิต', icon: MapPin, count: (distributionLocations || []).length },
          { id: 'sla', label: 'สายอนุมัติ & SLA', legacyLabel: '5. สายการอนุมัติและ SLAs', icon: Clock },
          ...(isApiMode ? [{ id: 'security', label: 'ความปลอดภัย (2FA)', icon: ShieldCheck }] : [])
        ].map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 h-8 px-3 rounded-lg text-xs font-medium transition-all whitespace-nowrap shrink-0 ${
                isActive
                  ? 'bg-white text-slate-900 shadow-2xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
              }`}
            >
              <Icon size={14} className={isActive ? 'text-sky-600' : 'text-slate-400'} />
              <span>{tab.label}</span>
              <span className="sr-only">{tab.legacyLabel}</span>
              {tab.count !== undefined && (
                <span className={`text-[11px] font-mono px-1.5 py-0.2 rounded-full ${
                  isActive ? 'bg-sky-100 text-sky-700 font-semibold' : 'bg-slate-200/70 text-slate-600'
                }`}>
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Content Container */}
      <div className="w-full max-w-full overflow-hidden">
        {isApiMode && activeTab === 'security' && <SecurityTab />}
        {passwordNotice && <PasswordNotice notice={passwordNotice} onClose={() => setPasswordNotice(null)} />}
        {/* ================= TAB 1: USERS & ROLES ================= */}
        {activeTab === 'users' && (
          <div className="space-y-3">
            {/* Unified Action Toolbar */}
            <div className="bg-white border border-slate-200/80 rounded-xl p-2.5 flex flex-col sm:flex-row items-center justify-between gap-2.5 shadow-2xs">
              <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto flex-1 min-w-0">
                <div className="relative flex-1 min-w-[200px]">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    placeholder="ค้นหาชื่อ, รหัสพนักงาน, อีเมล..."
                    className="w-full h-9 pl-9 pr-3 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:border-sky-500 outline-none transition-all placeholder:text-slate-400"
                  />
                </div>

                <select
                  value={userDeptFilter}
                  onChange={(e) => setUserDeptFilter(e.target.value)}
                  className="h-9 px-2.5 text-xs bg-slate-50 border border-slate-200 rounded-lg outline-none text-slate-700 cursor-pointer"
                >
                  <option value="">ทุกแผนก (All Depts)</option>
                  {departmentsList.map(d => (
                    <option key={d.id} value={d.id}>{d.id} - {d.nameTh || d.name}</option>
                  ))}
                </select>

                <select
                  value={userRoleFilter}
                  onChange={(e) => setUserRoleFilter(e.target.value)}
                  className="h-9 px-2.5 text-xs bg-slate-50 border border-slate-200 rounded-lg outline-none text-slate-700 cursor-pointer"
                >
                  <option value="">ทุกบทบาท (All Roles)</option>
                  <option value="DCC_ADMIN">DCC Admin</option>
                  <option value="DEPT_ADMIN">Dept Admin / Manager</option>
                  <option value="GENERAL_USER">General User</option>
                </select>
              </div>

              <button
                onClick={() => handleOpenUserModal()}
                className="h-9 px-3.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold shrink-0 whitespace-nowrap inline-flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer"
              >
                <Plus size={14} /> เพิ่มผู้ใช้งานใหม่ (Add User)
              </button>
            </div>

            {/* Users Elevated Table */}
            <div className="w-full max-w-full overflow-hidden bg-white border border-slate-200/80 rounded-xl shadow-2xs flex flex-col min-h-0">
              <div className="overflow-x-auto overflow-y-auto max-h-[560px] w-full max-w-full scrollbar-thin">
                <table className="w-full text-left text-xs table-auto min-w-[960px] border-collapse">
                  <thead className="bg-slate-50 text-slate-600 font-semibold text-[11px] uppercase tracking-wider border-b border-slate-200 whitespace-nowrap sticky top-0 z-10">
                    <tr>
                      <th className="py-2.5 px-3 min-w-[240px] bg-slate-50">ชื่อ-นามสกุล / อีเมล</th>
                      <th className="py-2.5 px-3 w-28 whitespace-nowrap bg-slate-50">แผนก</th>
                      <th className="py-2.5 px-3 min-w-[140px] whitespace-nowrap bg-slate-50">ตำแหน่งงาน</th>
                      <th className="py-2.5 px-3 text-center w-32 whitespace-nowrap bg-slate-50">บทบาท (Role)</th>
                      <th className="py-2.5 px-3 text-center w-24 whitespace-nowrap bg-slate-50">ระดับอนุมัติ</th>
                      <th className="py-2.5 px-3 text-center w-24 whitespace-nowrap bg-slate-50">สถานะ</th>
                      <th className="py-2.5 px-3 text-right w-32 whitespace-nowrap bg-slate-50">การจัดการ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {userPagination.paginatedData.map(user => (
                      <tr key={user.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-2 px-3 min-w-[240px]">
                          <div className="font-semibold text-slate-900 flex items-center gap-1.5 text-xs">
                            <span>{user.name}</span>
                            {user.isLocked && (
                              <span className="px-1.5 py-0.2 bg-rose-100 text-rose-700 text-[10px] rounded font-mono font-bold">LOCKED</span>
                            )}
                          </div>
                          <div className="text-slate-400 text-[11px] font-mono leading-none mt-0.5">
                            {user.empId || user.id} • {user.email}
                          </div>
                        </td>
                        <td className="py-2 px-3 font-semibold text-slate-800 whitespace-nowrap">
                          <div className="flex flex-wrap items-center gap-1 max-w-[220px]">
                            {(user.affiliated_departments && user.affiliated_departments.length > 0
                              ? user.affiliated_departments
                              : (user.depts && user.depts.length > 0 ? user.depts : [user.primary_department || user.department || 'QA'])
                            ).map(dept => {
                              const isPrimary = dept === (user.primary_department || user.department);
                              return (
                                <span 
                                  key={dept}
                                  className={`px-1.5 py-0.5 rounded font-mono text-[10px] font-semibold inline-flex items-center gap-0.5 ${
                                    isPrimary 
                                      ? 'bg-sky-50 text-sky-700 border border-sky-200' 
                                      : 'bg-slate-100 text-slate-600 border border-slate-200'
                                  }`}
                                  title={isPrimary ? 'แผนกหลัก (Primary Department)' : 'แผนกที่สังกัดร่วม (Affiliated)'}
                                >
                                  {isPrimary && <span>⭐</span>}
                                  <span>{dept}</span>
                                </span>
                              );
                            })}
                          </div>
                        </td>
                        <td className="py-2 px-3 text-slate-600 whitespace-nowrap text-xs">
                          {user.position || '-'}
                        </td>
                        <td className="py-2 px-3 text-center whitespace-nowrap">
                          <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${
                            user.role === 'DCC_ADMIN' || user.isDcc
                              ? 'bg-purple-50 text-purple-700 border border-purple-200'
                              : user.role === 'DEPT_ADMIN'
                              ? 'bg-sky-50 text-sky-700 border border-sky-200'
                              : 'bg-slate-100 text-slate-600'
                          }`}>
                            {user.role || (user.isDcc ? 'DCC_ADMIN' : 'GENERAL_USER')}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-center whitespace-nowrap">
                          <span className="px-2 py-0.5 bg-slate-100 text-slate-700 font-mono font-medium rounded text-xs border border-slate-200">
                            L{user.level}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-center whitespace-nowrap">
                          <button
                            onClick={() => (isApiMode
                              ? (user.id !== currentUser?.id || user.status !== 'ACTIVE') && serverData.setUserStatus(user.id, user.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE')
                              : toggleUserStatus(user.id))}
                            className={`px-2 py-0.5 rounded-full text-[11px] font-medium cursor-pointer transition-colors ${
                              user.status === 'ACTIVE'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
                                : 'bg-slate-100 text-slate-400 border border-slate-200 hover:bg-slate-200'
                            }`}
                          >
                            {user.status === 'ACTIVE' ? '🟢 Active' : '⚪ Inactive'}
                          </button>
                        </td>
                        <td className="py-2 px-3 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => handleOpenSignatureModal(user)}
                              className="w-7 h-7 rounded hover:bg-slate-100 flex items-center justify-center text-slate-500 hover:text-slate-800 transition-colors"
                              title="จัดการลายเซ็นอิเล็กทรอนิกส์ (Signature Asset)"
                            >
                              <PenTool size={13} />
                            </button>
                            <button
                              onClick={() => handleOpenStampSimulator(user)}
                              className="w-7 h-7 rounded hover:bg-emerald-50 flex items-center justify-center text-slate-500 hover:text-emerald-700 transition-colors"
                              title="ทดสอบตราประทับจำลอง (21 CFR Part 11 Stamp Simulator)"
                            >
                              <ShieldCheck size={13} />
                            </button>
                            <button
                              onClick={() => handleOpenUserModal(user)}
                              className="w-7 h-7 rounded hover:bg-slate-100 flex items-center justify-center text-slate-500 hover:text-slate-800 transition-colors"
                              title="แก้ไขข้อมูลผู้ใช้"
                            >
                              <Edit size={13} />
                            </button>
                            <button
                              onClick={async () => {
                                if (isApiMode) {
                                  if (!window.confirm(`รีเซ็ตรหัสผ่านของ ${user.name}? รหัสเดิมและการเข้าระบบอยู่ตอนนี้จะใช้ไม่ได้`)) return;
                                  const result = await serverData.resetUserPassword(user.id);
                                  if (result) setPasswordNotice({ name: user.name, email: user.email, password: result.temporaryPassword });
                                  return;
                                }
                                resetUserPassword(user.id);
                                toast.success(`รีเซ็ตรหัสผ่านของ ${user.name} เรียบร้อยแล้ว`);
                              }}
                              className="w-7 h-7 rounded hover:bg-amber-50 flex items-center justify-center text-slate-500 hover:text-amber-600 transition-colors"
                              title="รีเซ็ตรหัสผ่านเริ่มต้น"
                            >
                              <RotateCcw size={13} />
                            </button>
                            {isApiMode && user.twoFactorEnabled && (
                              <button
                                onClick={() => window.confirm(`รีเซ็ตการยืนยันสองขั้นตอนของ ${user.name}? เขาจะถูกออกจากระบบและต้องตั้งค่าใหม่`) && serverData.resetUserTwoFactor(user.id)}
                                className="h-7 px-1.5 rounded hover:bg-amber-50 text-[11px] font-semibold text-amber-700 transition-colors"
                                title="รีเซ็ตการยืนยันสองขั้นตอน (2FA)"
                              >
                                2FA
                              </button>
                            )}
                            {user.isLocked && (
                              <button
                                onClick={() => {
                                  if (isApiMode) { serverData.setUserStatus(user.id, 'ACTIVE'); return; }
                                  unlockUserAccount(user.id);
                                  toast.success(`ปลดล็อกบัญชี ${user.name} เรียบร้อยแล้ว`);
                                }}
                                className="w-7 h-7 rounded hover:bg-emerald-50 flex items-center justify-center text-emerald-600 transition-colors"
                                title="ปลดล็อกบัญชี"
                              >
                                <Unlock size={13} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {filteredUsers.length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                          ไม่พบข้อมูลผู้ใช้งานที่ค้นหา
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <TablePagination
                currentPage={userPagination.currentPage}
                totalItems={userPagination.totalItems}
                pageSize={userPagination.pageSize}
                onPageChange={userPagination.setCurrentPage}
                onPageSizeChange={userPagination.setPageSize}
              />
            </div>
          </div>
        )}

        {/* ================= TAB 2: DEPARTMENTS ================= */}
        {activeTab === 'departments' && (
          <div className="space-y-3">
            {/* Action Bar */}
            <div className="bg-white border border-slate-200/80 rounded-xl p-2.5 flex flex-col sm:flex-row items-center justify-between gap-2.5 shadow-2xs">
              <div className="relative flex-1 w-full min-w-0">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={deptSearch}
                  onChange={(e) => setDeptSearch(e.target.value)}
                  placeholder="ค้นหารหัสแผนก หรือชื่อภาษาไทย/อังกฤษ..."
                  className="w-full h-9 pl-9 pr-3 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:border-sky-500 outline-none transition-all placeholder:text-slate-400"
                />
              </div>

              {/* Status Filter Tabs */}
              <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs shrink-0 self-stretch sm:self-auto">
                <button
                  type="button"
                  onClick={() => setDeptStatusFilter('ALL')}
                  className={`h-7.5 px-2.5 rounded-md font-medium text-xs transition-all ${
                    deptStatusFilter === 'ALL'
                      ? 'bg-white text-slate-900 shadow-2xs font-semibold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  ทั้งหมด ({departmentsList.length})
                </button>
                <button
                  type="button"
                  onClick={() => setDeptStatusFilter('ACTIVE')}
                  className={`h-7.5 px-2.5 rounded-md font-medium text-xs transition-all ${
                    deptStatusFilter === 'ACTIVE'
                      ? 'bg-white text-emerald-700 shadow-2xs font-semibold'
                      : 'text-slate-600 hover:text-emerald-700'
                  }`}
                >
                  🟢 ใช้งานอยู่ ({departmentsList.filter(d => d.status !== 'INACTIVE').length})
                </button>
                <button
                  type="button"
                  onClick={() => setDeptStatusFilter('INACTIVE')}
                  className={`h-7.5 px-2.5 rounded-md font-medium text-xs transition-all ${
                    deptStatusFilter === 'INACTIVE'
                      ? 'bg-white text-slate-700 shadow-2xs font-semibold'
                      : 'text-slate-600 hover:text-slate-700'
                  }`}
                >
                  ⚪ ระงับแล้ว ({departmentsList.filter(d => d.status === 'INACTIVE').length})
                </button>
              </div>

              <button
                onClick={() => handleOpenDeptModal()}
                className="h-9 px-3.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold shrink-0 whitespace-nowrap inline-flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer"
              >
                <Plus size={14} /> เพิ่มแผนกใหม่ (Add Department)
              </button>
            </div>

            {/* High-Density Departments Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {filteredDepartments.map(dept => {
                const docCount = (documents || []).filter(d => d.department === dept.id || d.owner_dept === dept.id).length;
                const copyCount = allCopies.filter(c => c.holder_dept === dept.id || c.department === dept.id).length;
                const isCore = SYSTEM_CORE_DEPTS.includes(dept.id);
                const isInactive = dept.status === 'INACTIVE';

                return (
                  <div 
                    key={dept.id}
                    className={`card-surface bg-white p-3 rounded-xl border border-slate-200/80 hover:border-slate-300 transition-all flex flex-col justify-between space-y-2.5 shadow-2xs ${
                      isInactive ? 'opacity-80 bg-slate-50/70 border-dashed border-slate-300' : ''
                    }`}
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-1.5">
                        <div className="flex items-center gap-1.5">
                          <span className={`px-2 py-0.5 font-mono font-bold text-xs rounded-md ${
                            isInactive ? 'bg-slate-400 text-white' : 'bg-sky-600 text-white'
                          }`}>
                            {dept.id}
                          </span>
                          {isCore && (
                            <span 
                              className="px-1.5 py-0.2 bg-sky-100 text-sky-800 text-[10px] font-semibold rounded flex items-center gap-0.5"
                              title="แผนกหลักของระบบควบคุมคุณภาพ (ห้ามระงับ)"
                            >
                              🛡️ Core
                            </span>
                          )}
                        </div>

                        {/* Status / Deactivate / Reactivate Controls */}
                        {isCore ? (
                          <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                            🟢 Active
                          </span>
                        ) : isInactive ? (
                          <div className="flex items-center gap-1">
                            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-500 border border-slate-200">
                              ⚪ Inactive
                            </span>
                            <button
                              onClick={() => handleReactivateDept(dept.id)}
                              className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 transition-colors flex items-center gap-1"
                              title="เปิดใช้งานแผนกนี้อีกครั้ง"
                            >
                              <RefreshCw size={10} /> เปิดใช้งาน
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => handleInitiateDeactivateDept(dept)}
                            className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-700 hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200 border border-emerald-200 transition-colors group cursor-pointer"
                            title="คลิกเพื่อระงับการใช้งานแผนก (Deactivate)"
                          >
                            <span className="group-hover:hidden">🟢 Active</span>
                            <span className="hidden group-hover:inline">⚠️ ระงับ</span>
                          </button>
                        )}
                      </div>

                      <div>
                        <div className="flex items-baseline gap-1.5">
                          <h3 className={`font-semibold text-xs truncate ${isInactive ? 'text-slate-500 line-through' : 'text-slate-900'}`}>
                            {dept.nameTh || dept.name}
                          </h3>
                        </div>
                        <p className="text-[11px] text-slate-400 truncate">
                          {dept.nameEn || dept.name}
                        </p>
                      </div>

                      <div className="px-2.5 py-1.5 bg-slate-50 border border-slate-100 rounded-lg text-xs flex items-center justify-between gap-1">
                        <span className="text-slate-500 text-[11px] shrink-0">หัวหน้า:</span>
                        <span className="font-medium text-slate-700 truncate text-[11px]" title={dept.headName || 'ยังไม่ได้กำหนด'}>
                          {dept.headName || 'ยังไม่ได้กำหนด'}
                        </span>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5">
                        <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-[11px] font-medium font-mono inline-flex items-center gap-1" title="เอกสารแม่บท">
                          <FileText size={11} strokeWidth={1.5} className="text-slate-400" />
                          <span>{docCount}</span>
                        </span>
                        <span className="px-2 py-0.5 bg-sky-50 text-sky-700 rounded text-[11px] font-medium font-mono inline-flex items-center gap-1" title="สำเนาควบคุม">
                          <Layers size={11} strokeWidth={1.5} className="text-sky-500" />
                          <span>{copyCount}</span>
                        </span>
                      </div>

                      <button
                        onClick={() => handleOpenDeptModal(dept)}
                        className="w-7 h-7 rounded hover:bg-slate-100 flex items-center justify-center text-slate-500 hover:text-slate-800 transition-colors"
                        title="แก้ไขข้อมูลแผนก"
                      >
                        <Edit size={13} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ================= TAB 3: DOCUMENT TYPES ================= */}
        {activeTab === 'docTypes' && (
          <div className="space-y-3">
            {/* Action Bar */}
            <div className="bg-white border border-slate-200/80 rounded-xl p-2.5 flex flex-col sm:flex-row items-center justify-between gap-2.5 shadow-2xs">
              <div className="relative flex-1 w-full min-w-0">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={typeSearch}
                  onChange={(e) => setTypeSearch(e.target.value)}
                  placeholder="ค้นหารหัสประเภทเอกสาร เช่น QM, SOP, WI, FM..."
                  className="w-full h-9 pl-9 pr-3 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:border-sky-500 outline-none transition-all placeholder:text-slate-400"
                />
              </div>

              <button
                onClick={() => handleOpenTypeModal()}
                className="h-9 px-3.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold shrink-0 whitespace-nowrap inline-flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer"
              >
                <Plus size={14} /> เพิ่มประเภทเอกสาร (Add Document Type)
              </button>
            </div>

            {/* Types Table */}
            <div className="w-full max-w-full overflow-hidden bg-white border border-slate-200/80 rounded-xl shadow-2xs flex flex-col min-h-0">
              <div className="overflow-x-auto overflow-y-auto max-h-[560px] w-full max-w-full scrollbar-thin">
                <table className="w-full text-left text-xs table-auto min-w-[960px] border-collapse">
                  <thead className="bg-slate-50 text-slate-600 font-semibold text-[11px] uppercase tracking-wider border-b border-slate-200 whitespace-nowrap sticky top-0 z-10">
                    <tr>
                      <th className="py-2.5 px-3 w-28 font-mono bg-slate-50">Type Code</th>
                      <th className="py-2.5 px-3 min-w-[200px] bg-slate-50">ชื่อประเภทเอกสาร</th>
                      <th className="py-2.5 px-3 min-w-[160px] font-mono bg-slate-50">รูปแบบการตั้งรหัส</th>
                      <th className="py-2.5 px-3 text-center w-28 whitespace-nowrap bg-slate-50">ขอบเขต & DAR</th>
                      <th className="py-2.5 px-3 text-center w-32 whitespace-nowrap bg-slate-50">Form Bypass</th>
                      <th className="py-2.5 px-3 text-center w-24 whitespace-nowrap bg-slate-50">รอบทบทวน</th>
                      <th className="py-2.5 px-3 text-center w-24 whitespace-nowrap bg-slate-50">อายุจัดเก็บ</th>
                      <th className="py-2.5 px-3 text-center w-24 whitespace-nowrap bg-slate-50">สถานะ</th>
                      <th className="py-2.5 px-3 text-right w-20 whitespace-nowrap bg-slate-50">การจัดการ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {docTypePagination.paginatedData.map(type => (
                      <tr key={type.code || type.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-2 px-3 font-mono font-bold text-sky-700 whitespace-nowrap">
                          {type.code || type.id}
                        </td>
                        <td className="py-2 px-3 min-w-[200px]">
                          <div className="font-medium text-slate-900 text-xs">
                            {type.nameTh || type.name}
                          </div>
                        </td>
                        <td className="py-2 px-3 font-mono text-slate-700 whitespace-nowrap">
                          <span className="bg-slate-100 px-2 py-0.5 rounded text-[11px] font-mono text-slate-600 border border-slate-200">
                            {type.namingPattern || `${type.code}-{Dept}-{##}`}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-center whitespace-nowrap">
                          {(type.allowDar !== false && type.category !== 'EXTERNAL' && type.code !== 'ED') ? (
                            <span className="px-2 py-0.5 bg-sky-50 text-sky-700 font-medium rounded-full border border-sky-200 text-[11px] inline-flex items-center gap-1">
                              📑 ภายใน (DAR)
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 bg-amber-50 text-amber-700 font-medium rounded-full border border-amber-200 text-[11px] inline-flex items-center gap-1">
                              🌐 ภายนอก (External)
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-center whitespace-nowrap">
                          {type.is_form_type ? (
                            <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 font-medium rounded-full border border-emerald-200 text-[11px]">
                              ✅ Bypass
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 bg-slate-100 text-slate-500 rounded-full text-[11px]">
                              Watermark
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-center whitespace-nowrap text-slate-700 text-xs font-mono">
                          {type.reviewCycleMonths || 12} เดือน
                        </td>
                        <td className="py-2 px-3 text-center whitespace-nowrap text-slate-700 text-xs font-mono">
                          {type.retentionPeriodYears || 3} ปี
                        </td>
                        <td className="py-2 px-3 text-center whitespace-nowrap">
                          <button
                            onClick={() => {
                              toggleDocumentTypeStatus(type.code || type.id);
                              if (isApiMode) serverData.saveDocumentTypes(useStore.getState().documentTypes);
                            }}
                            className={`px-2 py-0.5 rounded-full text-[11px] font-medium cursor-pointer transition-colors ${
                              type.status !== 'INACTIVE'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-slate-100 text-slate-400 border border-slate-200'
                            }`}
                          >
                            {type.status !== 'INACTIVE' ? '🟢 Active' : '⚪ Inactive'}
                          </button>
                        </td>
                        <td className="py-2 px-3 text-right whitespace-nowrap">
                          <button
                            onClick={() => handleOpenTypeModal(type)}
                            className="w-7 h-7 rounded hover:bg-slate-100 inline-flex items-center justify-center text-slate-500 hover:text-slate-800 transition-colors"
                            title="แก้ไขประเภทเอกสาร"
                          >
                            <Edit size={13} />
                          </button>
                        </td>
                      </tr>
                    ))}
                    {docTypePagination.paginatedData.length === 0 && (
                      <tr>
                        <td colSpan={9} className="px-4 py-8 text-center text-slate-400 text-xs">
                          ไม่พบข้อมูลประเภทเอกสารที่ค้นหา
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <TablePagination
                currentPage={docTypePagination.currentPage}
                totalItems={docTypePagination.totalItems}
                pageSize={docTypePagination.pageSize}
                onPageChange={docTypePagination.setCurrentPage}
                onPageSizeChange={docTypePagination.setPageSize}
              />
            </div>
          </div>
        )}

        {/* ================= TAB 4: LOCATIONS MATRIX ================= */}
        {activeTab === 'locations' && (
          <div className="space-y-3">
            {/* Unified Enterprise Search & Filter Toolbar */}
            <div className="bg-white border border-slate-200/80 rounded-xl p-2.5 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-2.5 shadow-2xs">
              {/* Left Section: Search Input + Searchable Department Combobox + Clear Filters */}
              <div className="flex flex-1 flex-wrap items-center gap-2 min-w-0">
                {/* Station Free-text Search Field */}
                <div className="relative flex-1 min-w-[180px] sm:min-w-[220px]">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={locSearch}
                    onChange={(e) => setLocSearch(e.target.value)}
                    placeholder="ค้นหาชื่อจุดใช้งาน, รหัสสถานี..."
                    className="w-full h-9 pl-9 pr-8 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:border-sky-500 outline-none transition-all placeholder:text-slate-400 font-normal"
                  />
                  {locSearch && (
                    <button
                      type="button"
                      onClick={() => setLocSearch('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 rounded-full hover:bg-slate-200 transition-colors"
                      title="ล้างคำค้นหา"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>

                {/* Searchable Department Combobox / Autocomplete Dropdown */}
                <div className="relative shrink-0" ref={locDeptDropdownRef}>
                  <button
                    type="button"
                    onClick={() => {
                      setIsLocDeptDropdownOpen(prev => !prev);
                      setLocDeptSearchText('');
                    }}
                    className={`h-9 px-3 rounded-lg border transition-all text-xs font-medium flex items-center justify-between gap-2 min-w-[180px] sm:w-60 bg-slate-50 ${
                      isLocDeptDropdownOpen ? 'border-sky-500 bg-white ring-1 ring-sky-500/20' : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 min-w-0 truncate">
                      <Building2 size={13} className="text-sky-600 shrink-0" />
                      <span className="truncate text-slate-700 font-medium">
                        {selectedLocDept === 'ALL'
                          ? 'ทุกแผนก (All Depts)'
                          : `${selectedLocDept} — ${departmentsList.find(d => d.id === selectedLocDept)?.nameTh || departmentsList.find(d => d.id === selectedLocDept)?.name || selectedLocDept}`}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {selectedLocDept !== 'ALL' && (
                        <span className="px-1.5 py-0.2 rounded bg-sky-100 text-sky-700 font-mono text-[10px] font-bold">
                          {stationCountByDept[selectedLocDept] || 0}
                        </span>
                      )}
                      <ChevronDown size={13} className={`text-slate-400 transition-transform ${isLocDeptDropdownOpen ? 'rotate-180 text-sky-600' : ''}`} />
                    </div>
                  </button>

                  {/* Dropdown Popover */}
                  {isLocDeptDropdownOpen && (
                    <div className="absolute left-0 top-full mt-1.5 w-72 sm:w-80 bg-white border border-slate-200 rounded-xl shadow-lg z-30 p-2 space-y-1.5 animate-in fade-in zoom-in-95 duration-100">
                      <div className="relative">
                        <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                          type="text"
                          autoFocus
                          value={locDeptSearchText}
                          onChange={(e) => setLocDeptSearchText(e.target.value)}
                          placeholder="พิมพ์ค้นหาชื่อ/รหัสแผนก..."
                          className="w-full pl-8 pr-7 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium outline-none focus:bg-white focus:border-sky-500"
                        />
                        {locDeptSearchText && (
                          <button
                            type="button"
                            onClick={() => setLocDeptSearchText('')}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                          >
                            <X size={12} />
                          </button>
                        )}
                      </div>

                      <div className="max-h-56 overflow-y-auto space-y-0.5 scrollbar-thin">
                        {/* All Departments Option */}
                        {(!locDeptSearchText || 'ทุกแผนก all departments'.includes(locDeptSearchText.toLowerCase())) && (
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedLocDept('ALL');
                              setIsLocDeptDropdownOpen(false);
                            }}
                            className={`w-full px-2.5 py-1.5 rounded-lg text-xs font-medium text-left flex items-center justify-between transition-colors ${
                              selectedLocDept === 'ALL'
                                ? 'bg-sky-50 text-sky-700 font-bold'
                                : 'text-slate-700 hover:bg-slate-50'
                            }`}
                          >
                            <span>ทุกแผนก (All Departments)</span>
                            <span className="text-[11px] font-mono text-slate-400">
                              {(distributionLocations || []).length} จุด
                            </span>
                          </button>
                        )}

                        {filteredDeptOptions.map(dept => {
                          const count = stationCountByDept[dept.id] || 0;
                          const isSelected = selectedLocDept === dept.id;
                          return (
                            <button
                              key={dept.id}
                              type="button"
                              onClick={() => {
                                setSelectedLocDept(dept.id);
                                setIsLocDeptDropdownOpen(false);
                              }}
                              className={`w-full px-2.5 py-1.5 rounded-lg text-xs text-left flex items-center justify-between transition-colors ${
                                isSelected
                                  ? 'bg-sky-50 text-sky-700 font-bold'
                                  : 'text-slate-700 hover:bg-slate-50'
                              }`}
                            >
                              <div className="flex items-center gap-2 min-w-0 truncate">
                                <span className="font-mono font-bold px-1.5 py-0.2 rounded bg-slate-100 text-slate-800 text-[10px]">
                                  {dept.id}
                                </span>
                                <span className="truncate">{dept.nameTh || dept.name || dept.nameEn}</span>
                              </div>
                              <span className={`text-[11px] font-mono shrink-0 ${isSelected ? 'text-sky-700 font-bold' : 'text-slate-400'}`}>
                                {count} จุด
                              </span>
                            </button>
                          );
                        })}

                        {filteredDeptOptions.length === 0 && (
                          <div className="py-3 text-center text-xs text-slate-400">
                            ไม่พบแผนกที่ค้นหา
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Clear Filters Button */}
                {(selectedLocDept !== 'ALL' || locSearch.trim() !== '') && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedLocDept('ALL');
                      setLocSearch('');
                      setLocDeptSearchText('');
                    }}
                    className="h-9 px-2.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:text-rose-600 hover:border-rose-200 hover:bg-rose-50 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
                    title="ล้างตัวกรองและคำค้นหาทั้งหมด"
                  >
                    <RotateCcw size={12} className="text-slate-400 group-hover:text-rose-600" />
                    <span>ล้างตัวกรอง</span>
                  </button>
                )}
              </div>

              {/* Right Section: Counter Badge + Primary Action Button */}
              <div className="flex items-center gap-2 shrink-0 self-end lg:self-auto flex-wrap justify-end">
                <div 
                  data-testid="station-count-badge"
                  className="text-xs font-mono font-medium text-slate-500 px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-200 whitespace-nowrap"
                >
                  พบ <strong className="text-slate-900">{filteredLocations.length}</strong> / {(distributionLocations || []).length} จุด
                </div>

                <button
                  type="button"
                  onClick={() => handleOpenLocModal()}
                  className="h-9 px-3.5 rounded-lg bg-sky-600 text-white hover:bg-sky-700 font-semibold text-xs shadow-2xs transition-colors flex items-center gap-1.5 shrink-0 cursor-pointer"
                >
                  <Plus size={14} />
                  <span>เพิ่มจุดใช้งานใหม่ (Add Location)</span>
                </button>
              </div>
            </div>

            {/* Locations Elevated Table */}
            <div className="w-full max-w-full overflow-hidden bg-white border border-slate-200/80 rounded-xl shadow-2xs flex flex-col min-h-0">
              <div className="overflow-x-auto overflow-y-auto max-h-[560px] w-full max-w-full scrollbar-thin">
                <table className="w-full text-left text-xs table-auto min-w-[980px] border-collapse">
                  <thead className="bg-slate-50 text-slate-600 font-semibold text-[11px] uppercase tracking-wider border-b border-slate-200 whitespace-nowrap sticky top-0 z-10">
                    <tr>
                      <th className="py-2.5 px-3 w-24 whitespace-nowrap bg-slate-50">แผนก</th>
                      <th className="py-2.5 px-3 w-28 font-mono whitespace-nowrap bg-slate-50">Location ID</th>
                      <th className="py-2.5 px-3 min-w-[260px] bg-slate-50">ชื่อจุดใช้งานหน้างาน (Station)</th>
                      <th className="py-2.5 px-3 text-center w-36 whitespace-nowrap bg-slate-50">จุดคุมงานต้นทาง (Copy 01)</th>
                      <th className="py-2.5 px-3 text-center w-28 whitespace-nowrap bg-slate-50">สำเนาผูกอยู่</th>
                      <th className="py-2.5 px-3 text-center w-24 whitespace-nowrap bg-slate-50">สถานะ</th>
                      <th className="py-2.5 px-3 text-right w-24 whitespace-nowrap bg-slate-50">การจัดการ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {locationPagination.paginatedData.map(loc => {
                      const activeCopies = allCopies.filter(c => 
                        (c.location_id === loc.id || c.locationId === loc.id || c.location === loc.name) &&
                        (c.status === 'ISSUED_ACTIVE' || c.status === 'ACTIVE' || c.status === 'PENDING_ISSUE' || c.status === 'DISPATCHED_PENDING_RECEIPT')
                      );

                      return (
                        <tr key={loc.id} className="hover:bg-slate-50/70 transition-colors">
                          <td className="py-2 px-3 font-semibold text-slate-800 whitespace-nowrap">
                            <span className="px-2 py-0.5 bg-slate-100 rounded text-slate-700 font-mono text-xs font-bold">
                              {loc.departmentId}
                            </span>
                          </td>
                          <td className="py-2 px-3 font-mono font-bold text-sky-700 whitespace-nowrap">
                            {loc.id}
                          </td>
                          <td className="py-2 px-3 min-w-[260px]">
                            <div className="font-medium text-slate-900 text-xs">
                              {loc.name}
                            </div>
                          </td>
                          <td className="py-2 px-3 text-center whitespace-nowrap">
                            {loc.isMasterOffice ? (
                              <span className="bg-sky-50 text-sky-700 border border-sky-200 text-[11px] font-medium px-2.5 py-0.5 rounded-full inline-flex items-center gap-1">
                                <Crown size={12} className="text-sky-600" /> จุดคุมงานต้นทาง
                              </span>
                            ) : (
                              <span className="text-slate-400 text-xs font-mono">-</span>
                            )}
                          </td>
                          <td className="py-2 px-3 text-center whitespace-nowrap">
                            <span className={`px-2 py-0.5 rounded-full text-[11px] font-mono font-medium ${
                              activeCopies.length > 0
                                ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                : 'bg-slate-100 text-slate-400'
                            }`}>
                              {activeCopies.length} เล่ม
                            </span>
                          </td>
                          <td className="py-2 px-3 text-center whitespace-nowrap">
                            <button
                              onClick={() => (isApiMode
                                ? serverData.updateLocation(loc.id, { status: loc.status === 'INACTIVE' ? 'ACTIVE' : 'INACTIVE' })
                                : toggleLocationStatus(loc.id))}
                              className={`px-2 py-0.5 rounded-full text-[11px] font-medium cursor-pointer transition-colors ${
                                loc.status !== 'INACTIVE'
                                   ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : 'bg-slate-100 text-slate-400 border border-slate-200'
                              }`}
                            >
                              {loc.status !== 'INACTIVE' ? '🟢 Active' : '⚪ Inactive'}
                            </button>
                          </td>
                          <td className="py-2 px-3 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => handleOpenLocModal(loc)}
                                className="w-7 h-7 rounded hover:bg-slate-100 flex items-center justify-center text-slate-500 hover:text-slate-800 transition-colors"
                                title="แก้ไขจุดใช้งาน"
                              >
                                <Edit size={13} />
                              </button>
                              <button
                                onClick={() => handleDeleteLoc(loc.id)}
                                className="w-7 h-7 rounded hover:bg-rose-50 flex items-center justify-center text-slate-400 hover:text-rose-600 transition-colors"
                                title="ลบจุดใช้งาน"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {locationPagination.paginatedData.length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-4 py-12 text-center text-slate-400">
                          <div className="flex flex-col items-center justify-center space-y-2 max-w-sm mx-auto">
                            <div className="w-10 h-10 rounded-full bg-[#F5F5F5] flex items-center justify-center text-slate-400">
                              <MapPin size={20} />
                            </div>
                            <p className="text-sm font-bold text-slate-700">ไม่พบจุดใช้งานตรงตามเงื่อนไขที่ค้นหา</p>
                            <p className="text-xs text-slate-400">
                              ลองเปลี่ยนคำค้นหา หรือกดปุ่มล้างตัวกรองเพื่อแสดงจุดใช้งานทั้งหมด
                            </p>
                            {(selectedLocDept !== 'ALL' || locSearch.trim() !== '') && (
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedLocDept('ALL');
                                  setLocSearch('');
                                  setLocDeptSearchText('');
                                }}
                                className="mt-2 px-3 py-1.5 rounded-lg bg-[#E5F4FF] text-[#007BE5] text-xs font-semibold hover:bg-[#D1EFFF] transition-colors"
                              >
                                ล้างตัวกรองทั้งหมด
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <TablePagination
                currentPage={locationPagination.currentPage}
                totalItems={locationPagination.totalItems}
                pageSize={locationPagination.pageSize}
                onPageChange={locationPagination.setCurrentPage}
                onPageSizeChange={locationPagination.setPageSize}
              />
            </div>
          </div>
        )}

        {/* ================= TAB 5: APPROVAL MATRIX & SLAS ================= */}
        {activeTab === 'sla' && (
          <div className="space-y-4">
            {/* ส่วนที่ 1: กำหนดกรอบเวลาการปฏิบัติงาน (SLA Timelines) */}
            <div className="space-y-2.5">
              <div className="flex items-center gap-2">
                <Clock size={15} className="text-sky-600" />
                <h2 className="text-xs font-semibold text-slate-800 uppercase tracking-wide">ส่วนที่ 1: กำหนดกรอบเวลาการปฏิบัติงาน (SLA Timelines)</h2>
                <span className="text-[11px] text-slate-400 font-normal">จำนวนวันทำการสูงสุดตามมาตรฐาน ISO 9001</span>
              </div>

              {/* Compact SLA Metric Cards with Stepper Controls */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                {/* Card 1: Review SLA */}
                <div className="bg-white p-3 border border-slate-200/80 rounded-xl transition-all flex flex-col justify-between space-y-2 shadow-2xs">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-800">1. ทบทวนคำขอ (Review)</span>
                    <span className="text-[10px] font-mono font-medium px-1.5 py-0.2 rounded bg-sky-50 text-sky-700 border border-sky-200">
                      Review
                    </span>
                  </div>

                  {/* Compact Stepper */}
                  <div className="flex items-center gap-2 justify-center py-1 bg-slate-50 p-1.5 rounded-lg border border-slate-200">
                    <button
                      type="button"
                      onClick={() => handleAdjustSla('reviewSlaDays', -1)}
                      className="w-6 h-6 rounded bg-white hover:bg-slate-200 text-slate-700 font-bold text-sm flex items-center justify-center transition-colors shadow-2xs border border-slate-200 cursor-pointer"
                      title="ลดจำนวนวัน"
                    >
                      -
                    </button>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min="1"
                        max="30"
                        value={slaForm.reviewSlaDays}
                        onChange={(e) => setSlaForm({ ...slaForm, reviewSlaDays: parseInt(e.target.value) || 1 })}
                        className="w-10 h-6 text-center text-xs font-bold font-mono text-slate-900 bg-white border border-slate-200 rounded focus:border-sky-500 outline-none"
                      />
                      <span className="text-[11px] text-slate-500 font-medium">วัน</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleAdjustSla('reviewSlaDays', 1)}
                      className="w-6 h-6 rounded bg-white hover:bg-slate-200 text-slate-700 font-bold text-sm flex items-center justify-center transition-colors shadow-2xs border border-slate-200 cursor-pointer"
                      title="เพิ่มจำนวนวัน"
                    >
                      +
                    </button>
                  </div>
                </div>

                {/* Card 2: Approve SLA */}
                <div className="bg-white p-3 border border-slate-200/80 rounded-xl transition-all flex flex-col justify-between space-y-2 shadow-2xs">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-800">2. อนุมัติเอกสาร (Approve)</span>
                    <span className="text-[10px] font-mono font-medium px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                      Approve
                    </span>
                  </div>

                  {/* Compact Stepper */}
                  <div className="flex items-center gap-2 justify-center py-1 bg-slate-50 p-1.5 rounded-lg border border-slate-200">
                    <button
                      type="button"
                      onClick={() => handleAdjustSla('approvalSlaDays', -1)}
                      className="w-6 h-6 rounded bg-white hover:bg-slate-200 text-slate-700 font-bold text-sm flex items-center justify-center transition-colors shadow-2xs border border-slate-200 cursor-pointer"
                      title="ลดจำนวนวัน"
                    >
                      -
                    </button>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min="1"
                        max="30"
                        value={slaForm.approvalSlaDays}
                        onChange={(e) => setSlaForm({ ...slaForm, approvalSlaDays: parseInt(e.target.value) || 1 })}
                        className="w-10 h-6 text-center text-xs font-bold font-mono text-slate-900 bg-white border border-slate-200 rounded focus:border-emerald-500 outline-none"
                      />
                      <span className="text-[11px] text-slate-500 font-medium">วัน</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleAdjustSla('approvalSlaDays', 1)}
                      className="w-6 h-6 rounded bg-white hover:bg-slate-200 text-slate-700 font-bold text-sm flex items-center justify-center transition-colors shadow-2xs border border-slate-200 cursor-pointer"
                      title="เพิ่มจำนวนวัน"
                    >
                      +
                    </button>
                  </div>
                </div>

                {/* Card 3: Receipt SLA */}
                <div className="bg-white p-3 border border-slate-200/80 rounded-xl transition-all flex flex-col justify-between space-y-2 shadow-2xs">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-800">3. ตรวจรับเล่ม (Receipt)</span>
                    <span className="text-[10px] font-mono font-medium px-1.5 py-0.2 rounded bg-amber-50 text-amber-700 border border-amber-200">
                      Receipt
                    </span>
                  </div>

                  {/* Compact Stepper */}
                  <div className="flex items-center gap-2 justify-center py-1 bg-slate-50 p-1.5 rounded-lg border border-slate-200">
                    <button
                      type="button"
                      onClick={() => handleAdjustSla('hardcopyReceiptSlaDays', -1)}
                      className="w-6 h-6 rounded bg-white hover:bg-slate-200 text-slate-700 font-bold text-sm flex items-center justify-center transition-colors shadow-2xs border border-slate-200 cursor-pointer"
                      title="ลดจำนวนวัน"
                    >
                      -
                    </button>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min="1"
                        max="30"
                        value={slaForm.hardcopyReceiptSlaDays}
                        onChange={(e) => setSlaForm({ ...slaForm, hardcopyReceiptSlaDays: parseInt(e.target.value) || 1 })}
                        className="w-10 h-6 text-center text-xs font-bold font-mono text-slate-900 bg-white border border-slate-200 rounded focus:border-amber-500 outline-none"
                      />
                      <span className="text-[11px] text-slate-500 font-medium">วัน</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleAdjustSla('hardcopyReceiptSlaDays', 1)}
                      className="w-6 h-6 rounded bg-white hover:bg-slate-200 text-slate-700 font-bold text-sm flex items-center justify-center transition-colors shadow-2xs border border-slate-200 cursor-pointer"
                      title="เพิ่มจำนวนวัน"
                    >
                      +
                    </button>
                  </div>
                </div>

                {/* Card 4: Recall SLA */}
                <div className="bg-white p-3 border border-slate-200/80 rounded-xl transition-all flex flex-col justify-between space-y-2 shadow-2xs">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-800">4. เรียกคืนทำลาย (Recall)</span>
                    <span className="text-[10px] font-mono font-medium px-1.5 py-0.2 rounded bg-rose-50 text-rose-700 border border-rose-200">
                      Recall
                    </span>
                  </div>

                  {/* Compact Stepper */}
                  <div className="flex items-center gap-2 justify-center py-1 bg-slate-50 p-1.5 rounded-lg border border-slate-200">
                    <button
                      type="button"
                      onClick={() => handleAdjustSla('recallSlaDays', -1)}
                      className="w-6 h-6 rounded bg-white hover:bg-slate-200 text-slate-700 font-bold text-sm flex items-center justify-center transition-colors shadow-2xs border border-slate-200 cursor-pointer"
                      title="ลดจำนวนวัน"
                    >
                      -
                    </button>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min="1"
                        max="30"
                        value={slaForm.recallSlaDays}
                        onChange={(e) => setSlaForm({ ...slaForm, recallSlaDays: parseInt(e.target.value) || 1 })}
                        className="w-10 h-6 text-center text-xs font-bold font-mono text-slate-900 bg-white border border-slate-200 rounded focus:border-rose-500 outline-none"
                      />
                      <span className="text-[11px] text-slate-500 font-medium">วัน</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleAdjustSla('recallSlaDays', 1)}
                      className="w-6 h-6 rounded bg-white hover:bg-slate-200 text-slate-700 font-bold text-sm flex items-center justify-center transition-colors shadow-2xs border border-slate-200 cursor-pointer"
                      title="เพิ่มจำนวนวัน"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* ส่วนที่ 2: ผังเมทริกซ์สายการอนุมัติตามประเภทเอกสาร */}
            <div className="space-y-2.5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Sliders size={15} className="text-indigo-600" />
                  <h2 className="text-xs font-semibold text-slate-800 uppercase tracking-wide">ส่วนที่ 2: ผังเมทริกซ์สายการอนุมัติ (Approval Matrix by Doc Type)</h2>
                </div>

                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 font-medium rounded-md text-[11px] border border-indigo-200 inline-flex items-center gap-1">
                    <CheckCircle2 size={12} className="text-indigo-600" />
                    <span>Single Source of Truth (Tab 3)</span>
                  </span>
                </div>
              </div>

              {/* Elevated Matrix Table with Visual Workflow Pipeline */}
              <div className="w-full max-w-full overflow-hidden bg-white border border-slate-200/80 rounded-xl shadow-2xs flex flex-col min-h-0">
                <div className="overflow-x-auto overflow-y-auto max-h-[560px] w-full max-w-full scrollbar-thin">
                  <table className="w-full text-left text-xs table-auto min-w-[920px] border-collapse">
                    <thead className="bg-slate-50 text-slate-600 font-semibold text-[11px] uppercase tracking-wider border-b border-slate-200 whitespace-nowrap sticky top-0 z-10">
                      <tr>
                        <th className="py-2.5 px-3 w-48 bg-slate-50">ประเภทเอกสาร (Doc Type)</th>
                        <th className="py-2.5 px-3 min-w-[460px] bg-slate-50">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span>สายการอนุมัติ (Pipeline:</span>
                            <span className="text-[11px] font-normal text-slate-500 normal-case">ผู้ยื่น</span>
                            <span className="text-slate-400">➔</span>
                            <span className="text-[11px] font-normal text-sky-600 normal-case">ผู้ทบทวน</span>
                            <span className="text-slate-400">➔</span>
                            <span className="text-[11px] font-normal text-indigo-600 normal-case">ผู้อนุมัติ</span>
                            <span>)</span>
                          </div>
                        </th>
                        <th className="py-2.5 px-3 text-center w-32 whitespace-nowrap bg-slate-50">การรับทราบ (Default Ack)</th>
                        <th className="py-2.5 px-3 text-right w-20 whitespace-nowrap bg-slate-50">การจัดการ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {approvalMatrixPagination.paginatedData.map((item) => {
                        const code = item.code || item.docType || item.doc_type;
                        const minReq = item.minRequesterLevel ?? item.min_requester_level ?? 1;
                        const reqRev = item.requiredReviewerLevel ?? item.required_reviewer_level ?? 4;
                        const reqApp = item.requiredApproverLevel ?? item.required_approver_level ?? 6;
                        const isAck = item.requireAckDefault ?? item.require_ack_default ?? false;

                        return (
                          <tr key={code} className="hover:bg-slate-50/70 transition-colors">
                            {/* Document Type Column */}
                            <td className="py-2 px-3 align-middle">
                              <div className="flex items-center gap-2">
                                <span className="font-mono font-bold text-xs px-2 py-0.5 rounded bg-sky-50 text-sky-700 border border-sky-200">
                                  {code}
                                </span>
                                <div className="min-w-0">
                                  <div className="font-medium text-xs text-slate-800 truncate">{item.name || code}</div>
                                </div>
                              </div>
                            </td>

                            {/* Visual Workflow Pipeline Column */}
                            <td className="py-2 px-3 align-middle">
                              <div className="flex items-center gap-1.5 flex-wrap sm:flex-nowrap text-xs">
                                {/* Step 1: Requester */}
                                <div className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200 font-mono text-[11px] whitespace-nowrap">
                                  <span className="text-[10px] text-slate-500 font-sans">ผู้ยื่น:</span>
                                  <span className="font-bold">L{minReq}+</span>
                                  <span className="text-[10px] text-slate-500 font-sans">({minReq === 1 ? 'ทุกคน' : 'Sup+'})</span>
                                </div>

                                <span className="text-slate-400 text-xs shrink-0">➔</span>

                                {/* Step 2: Reviewer */}
                                <div className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-sky-50 text-sky-700 border border-sky-200 font-mono text-[11px] whitespace-nowrap">
                                  <span className="text-[10px] text-sky-600 font-sans">ทบทวน:</span>
                                  <span className="font-bold">L{reqRev}+</span>
                                  <span className="text-[10px] text-sky-600 font-sans">({reqRev >= 6 ? 'GM' : reqRev >= 5 ? 'Mgr' : 'Sup'})</span>
                                </div>

                                <span className="text-slate-400 text-xs shrink-0">➔</span>

                                {/* Step 3: Approver */}
                                <div className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200 font-mono text-[11px] whitespace-nowrap">
                                  <span className="text-[10px] text-indigo-600 font-sans">อนุมัติ:</span>
                                  <span className="font-bold">L{reqApp}+</span>
                                  <span className="text-[10px] text-indigo-600 font-sans">({reqApp >= 8 ? 'MD' : reqApp >= 6 ? 'GM' : 'Mgr'})</span>
                                </div>
                              </div>
                            </td>

                            {/* Default Ack Column */}
                            <td className="py-2 px-3 text-center align-middle whitespace-nowrap">
                              {isAck ? (
                                <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 font-medium rounded-full text-[11px] border border-emerald-200 inline-flex items-center gap-1">
                                  <Check size={11} /> บังคับรับทราบ
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 bg-slate-100 text-slate-500 rounded-full text-[11px]">
                                  ไม่ต้องรับทราบ
                                </span>
                              )}
                            </td>

                            {/* Action Button */}
                            <td className="py-2 px-3 text-right align-middle whitespace-nowrap">
                              <button
                                type="button"
                                onClick={() => handleOpenMatrixModal(item)}
                                className="w-7 h-7 rounded hover:bg-slate-100 inline-flex items-center justify-center text-slate-500 hover:text-slate-800 transition-colors"
                                title={`แก้ไขผังสายการอนุมัติของ ${code}`}
                              >
                                <Edit size={13} />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                      {approvalMatrixPagination.paginatedData.length === 0 && (
                        <tr>
                          <td colSpan={4} className="px-4 py-8 text-center text-slate-400 text-xs">
                            ไม่พบข้อมูลสายการอนุมัติ
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <TablePagination
                  currentPage={approvalMatrixPagination.currentPage}
                  totalItems={approvalMatrixPagination.totalItems}
                  pageSize={approvalMatrixPagination.pageSize}
                  onPageChange={approvalMatrixPagination.setCurrentPage}
                  onPageSizeChange={approvalMatrixPagination.setPageSize}
                />
              </div>
            </div>

            {/* Unified Save Card */}
            <div className="bg-white p-3 flex flex-col sm:flex-row items-center justify-between gap-3 border border-slate-200/80 rounded-xl shadow-2xs">
              <div>
                <h3 className="font-semibold text-slate-900 text-xs">บันทึกการตั้งค่าสายการอนุมัติและ SLAs</h3>
                <p className="text-[11px] text-slate-400 mt-0.5">ระบบจะนำ SLA และ Routing Matrix ไปใช้คำนวณวันครบกำหนดและคัดเลือกผู้มีสิทธิ์อัตโนมัติ</p>
              </div>

              <button
                type="button"
                onClick={handleSaveAllSlaAndMatrix}
                className="h-9 px-4 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold shrink-0 whitespace-nowrap flex items-center gap-1.5 shadow-2xs cursor-pointer transition-colors"
              >
                <Save size={14} /> บันทึกการตั้งค่า
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ================= USER MODAL ================= */}
      {isUserModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-900/60 backdrop-blur-sm overflow-y-auto animate-in fade-in duration-150">
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="relative w-full max-w-xl max-h-[90vh] bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150"
          >
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
              <h3 className="font-bold text-sm sm:text-base text-white">
                {editingUser ? 'แก้ไขข้อมูลผู้ใช้งาน' : 'เพิ่มผู้ใช้งานใหม่'}
              </h3>
              <button 
                type="button"
                onClick={() => setIsUserModalOpen(false)} 
                className="p-1.5 text-slate-300 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
                title="ปิดหน้าต่าง"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveUser} className="flex-1 flex flex-col min-h-0 overflow-hidden">
              <div className="flex-1 overflow-y-auto p-6 space-y-4 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">ชื่อ-นามสกุล <span className="text-rose-500">*</span>:</label>
                <input
                  type="text"
                  required
                  value={userFormData.name}
                  onChange={(e) => setUserFormData({ ...userFormData, name: e.target.value })}
                  placeholder="เช่น สมชาย สายผลิต"
                  className="w-full px-3 py-2 bg-[#F5F5F5] border border-[#E5E5E5] rounded-xl"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">รหัสพนักงาน (Emp ID):</label>
                  <input
                    type="text"
                    value={userFormData.empId}
                    onChange={(e) => setUserFormData({ ...userFormData, empId: e.target.value })}
                    placeholder="เช่น EMP-015"
                    className="w-full px-3 py-2 bg-[#F5F5F5] border border-[#E5E5E5] rounded-xl font-mono"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">อีเมล:</label>
                  <input
                    type="email"
                    value={userFormData.email}
                    onChange={(e) => setUserFormData({ ...userFormData, email: e.target.value })}
                    placeholder="user@company.com"
                    className="w-full px-3 py-2 bg-[#F5F5F5] border border-[#E5E5E5] rounded-xl"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">ตำแหน่งงาน:</label>
                <input
                  type="text"
                  value={userFormData.position}
                  onChange={(e) => setUserFormData({ ...userFormData, position: e.target.value })}
                  placeholder="เช่น Production Supervisor"
                  className="w-full px-3 py-2 bg-[#F5F5F5] border border-[#E5E5E5] rounded-xl"
                />
              </div>

              {/* Multi-Department Membership Tag Input */}
              <div className="space-y-2 p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
                <div className="flex items-center justify-between">
                  <label className="font-bold text-slate-800 flex items-center gap-1.5 text-xs">
                    <Building2 size={14} className="text-[#0D99FF]" />
                    <span>สังกัดแผนก (Multi-Department Membership):</span>
                  </label>
                  <span className="text-[11px] text-slate-500 font-medium">
                    {userFormData.affiliated_departments?.length || 1} แผนกที่สังกัด
                  </span>
                </div>

                {/* Selected Departments Tag Tray */}
                <div className="flex flex-wrap items-center gap-1.5 min-h-[40px] p-2 bg-white border border-slate-200 rounded-lg">
                  {(userFormData.affiliated_departments || []).map((deptCode) => {
                    const normDeptCode = (deptCode === 'QA/QC') ? 'QC' : normalizeDepartmentId(deptCode);
                    const currentPrimary = (userFormData.primary_department === 'QA/QC') ? 'QC' : (userFormData.primary_department || userFormData.department);
                    const isPrimary = normDeptCode === currentPrimary || normalizeDepartmentId(deptCode) === normalizeDepartmentId(currentPrimary);
                    const deptObj = departmentsList.find(d => d.id === normDeptCode || normalizeDepartmentId(d.id) === normalizeDepartmentId(deptCode));
                    const displayCode = normDeptCode === 'QA/QC' ? 'QC' : normDeptCode;
                    const deptLabel = deptObj ? `${displayCode} - ${deptObj.nameTh || deptObj.name}` : displayCode;

                    return (
                      <div
                        key={deptCode}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs transition-all ${
                          isPrimary
                            ? 'bg-[#E5F4FF] border border-[#B8E1FF] text-[#007BE5] shadow-2xs font-bold'
                            : 'bg-slate-100 border border-slate-200 text-slate-700 font-medium'
                        }`}
                      >
                        {isPrimary ? (
                          <span className="px-1.5 py-0.5 rounded bg-[#0D99FF] text-white text-[9px] font-bold uppercase tracking-wider flex items-center gap-0.5">
                            ⭐ แผนกหลัก
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              const cleanDept = (deptCode === 'QA/QC') ? 'QC' : deptCode;
                              setUserFormData(prev => ({
                                ...prev,
                                primary_department: cleanDept,
                                department: cleanDept
                              }));
                              toast.success(`ตั้ง ${cleanDept} เป็นแผนกหลัก`);
                            }}
                            className="text-[10px] text-slate-500 hover:text-[#0D99FF] underline cursor-pointer"
                            title="คลิกเพื่อตั้งเป็นแผนกหลัก (Set as Primary)"
                          >
                            ตั้งเป็นหลัก
                          </button>
                        )}

                        <span className="font-mono text-xs">{deptLabel}</span>

                        <button
                          type="button"
                          onClick={() => {
                            if ((userFormData.affiliated_departments || []).length <= 1) {
                              toast.error('ผู้ใช้งานต้องสังกัดอย่างน้อย 1 แผนก');
                              return;
                            }
                            const updated = (userFormData.affiliated_departments || []).filter(d => d !== deptCode);
                            let newPrimary = userFormData.primary_department;
                            if (newPrimary === deptCode) {
                              newPrimary = updated[0];
                            }
                            setUserFormData(prev => ({
                              ...prev,
                              affiliated_departments: updated,
                              departments: updated,
                              depts: updated,
                              primary_department: newPrimary,
                              department: newPrimary
                            }));
                          }}
                          className="text-slate-400 hover:text-rose-600 hover:bg-rose-50 p-0.5 rounded cursor-pointer transition-colors"
                          title="ลบแผนกนี้ออกจากการสังกัด"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    );
                  })}
                </div>

                {/* Dropdown to add department */}
                <div className="flex items-center gap-2 pt-1">
                  <label htmlFor="add-dept-selector" className="sr-only">เพิ่มแผนกที่สังกัดร่วม</label>
                  <select
                    id="add-dept-selector"
                    defaultValue=""
                    onChange={(e) => {
                      const selected = e.target.value;
                      if (!selected) return;
                      const cleanSelected = (selected === 'QA/QC') ? 'QC' : selected;
                      const current = userFormData.affiliated_departments || [];
                      const hasSelected = current.some(c => c === cleanSelected || ((c === 'QC' || c === 'QA/QC') && (cleanSelected === 'QC' || cleanSelected === 'QA/QC')));
                      if (!hasSelected) {
                        const updated = [...current, cleanSelected];
                        setUserFormData(prev => ({
                          ...prev,
                          affiliated_departments: updated,
                          departments: updated,
                          depts: updated
                        }));
                        toast.success(`เพิ่มแผนก ${cleanSelected} เรียบร้อยแล้ว`);
                      }
                      e.target.value = '';
                    }}
                    className="flex-1 px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg outline-none focus:border-[#0D99FF]"
                  >
                    <option value="" disabled>+ เลือกเพิ่มแผนกที่สังกัดร่วม...</option>
                    {departmentsList
                      .filter(d => {
                        const dCode = (d.id === 'QA/QC') ? 'QC' : d.id;
                        const primaryCode = (userFormData.primary_department === 'QA/QC')
                          ? 'QC'
                          : (userFormData.primary_department || userFormData.department);
                        // Exclude primary department
                        if (dCode === primaryCode) return false;
                        // Exclude if already in affiliated_departments
                        const affCodes = (userFormData.affiliated_departments || []).map(a => (a === 'QA/QC') ? 'QC' : a);
                        if (affCodes.includes(dCode)) return false;
                        return true;
                      })
                      .map(d => {
                        const dCode = (d.id === 'QA/QC') ? 'QC' : d.id;
                        return (
                          <option key={d.id} value={dCode}>
                            + เพิ่ม: {dCode} ({d.nameTh || d.name})
                          </option>
                        );
                      })}
                  </select>
                </div>

                {/* DCC_ADMIN / QMR Wildcard Notice */}
                {(userFormData.role === 'DCC_ADMIN' || userFormData.role === 'QMR') && (
                  <div className="p-2.5 bg-purple-50 border border-purple-200 rounded-lg flex items-start gap-2 text-[11px] text-purple-700">
                    <ShieldCheck size={14} className="text-purple-600 shrink-0 mt-0.5" />
                    <span>
                      <strong>Wildcard Access:</strong> เนื่องจากผู้ใช้มีสิทธิ์ <strong>{userFormData.role}</strong> ระบบจะอนุญาตให้เข้าถึงและจัดการ Task ของทุกแผนกโดยอัตโนมัติ โดยไม่จำเป็นต้องเลือกแผนกจนครบ
                    </span>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="user-role-select" className="font-bold text-slate-700 block mb-1">บทบาทสิทธิ์ (Role):</label>
                  <select
                    id="user-role-select"
                    value={userFormData.role}
                    onChange={(e) => setUserFormData({ ...userFormData, role: e.target.value })}
                    className="w-full px-3 py-2 bg-[#F5F5F5] border border-[#E5E5E5] rounded-xl"
                  >
                    <option value="GENERAL_USER">General User (ผู้ใช้งานทั่วไป)</option>
                    <option value="DEPT_ADMIN">Dept Admin / Reviewer</option>
                    <option value="QMR">QMR (ตัวแทนฝ่ายบริหารคุณภาพ)</option>
                    <option value="DCC_ADMIN">DCC Admin (ผู้ควบคุมเอกสาร)</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="user-approval-level-select" className="font-bold text-slate-700 block mb-1">ระดับอำนาจอนุมัติ (Approval Level):</label>
                  <select
                    id="user-approval-level-select"
                    value={userFormData.approval_level || userFormData.level || 1}
                    onChange={(e) => {
                      const lvl = parseInt(e.target.value) || 1;
                      setUserFormData({ ...userFormData, level: lvl, approval_level: lvl });
                    }}
                    className="w-full px-3 py-2 bg-[#F5F5F5] border border-[#E5E5E5] rounded-xl"
                  >
                    <option value="1">Level 1: Staff / Operator</option>
                    <option value="2">Level 2: Officer</option>
                    <option value="3">Level 3: Supervisor</option>
                    <option value="4">Level 4: Supervisor (Senior)</option>
                    <option value="5">Level 5: Dept Manager</option>
                    <option value="6">Level 6: General Manager</option>
                    <option value="7">Level 7: Director</option>
                    <option value="8">Level 8: Managing Director</option>
                  </select>
                </div>
              </div>

              {editingUser && (
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
                  <div>
                    <div className="font-bold text-slate-800 text-xs">ลายเซ็นอิเล็กทรอนิกส์ (Signature Asset):</div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      {editingUser.signatureType === 'DRAWN' ? '✍️ วาดลายเซ็นเรียบร้อย' : editingUser.signatureType === 'IMAGE' ? '🖼️ อัปโหลดไฟล์ภาพเรียบร้อย' : `🔤 Typographic Font: ${editingUser.signatureStyle || 'Brush Script'}`}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setIsUserModalOpen(false);
                      handleOpenSignatureModal(editingUser);
                    }}
                    className="px-3 py-1.5 bg-[#E5F4FF] hover:bg-[#D1EFFF] text-[#0D99FF] rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <PenTool size={13} />
                    <span>จัดการลายเซ็น</span>
                  </button>
                </div>
              )}

                </div>

                <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setIsUserModalOpen(false)}
                    className="btn-secondary text-xs cursor-pointer"
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="submit"
                    className="btn-primary text-xs cursor-pointer"
                  >
                    บันทึกข้อมูล
                  </button>
                </div>
              </form>
          </motion.div>
        </div>
      )}

      {/* ================= DEPARTMENT MODAL ================= */}
      {isDeptModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-900/60 backdrop-blur-sm overflow-y-auto animate-in fade-in duration-150">
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="relative w-full max-w-xl max-h-[90vh] bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150"
          >
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
              <h3 className="font-bold text-sm sm:text-base text-white">
                {editingDept ? 'แก้ไขข้อมูลแผนก' : 'เพิ่มแผนกใหม่'}
              </h3>
              <button 
                type="button"
                onClick={handleCloseDeptModal} 
                className="p-1.5 text-slate-300 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
                title="ปิดหน้าต่าง"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveDept} className="flex-1 flex flex-col min-h-0 overflow-hidden">
              <div className="flex-1 overflow-y-auto p-6 space-y-4 text-xs">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">รหัสแผนก (Dept Code) <span className="text-rose-500">*</span>:</label>
                  <input
                    type="text"
                    required
                    value={deptFormData.id || deptFormData.code || ''}
                    onChange={(e) => setDeptFormData({ ...deptFormData, id: e.target.value.toUpperCase(), code: e.target.value.toUpperCase(), deptCode: e.target.value.toUpperCase() })}
                    placeholder="เช่น PD, QA, QC, WH, EN..."
                    className="w-full px-3 py-2 bg-white border border-[#E5E5E5] rounded-xl font-mono uppercase focus:outline-none focus:border-[#0D99FF] focus:ring-1 focus:ring-[#0D99FF] transition-all"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">ชื่อแผนกภาษาไทย <span className="text-rose-500">*</span>:</label>
                  <input
                    type="text"
                    required
                    value={deptFormData.nameTh || deptFormData.name || ''}
                    onChange={(e) => setDeptFormData({ ...deptFormData, nameTh: e.target.value, name: e.target.value, name_th: e.target.value })}
                    placeholder="เช่น ฝ่ายผลิต"
                    className="w-full px-3 py-2 bg-[#F5F5F5] border border-[#E5E5E5] rounded-xl"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">ชื่อแผนกภาษาอังกฤษ:</label>
                  <input
                    type="text"
                    value={deptFormData.nameEn || deptFormData.name_en || ''}
                    onChange={(e) => setDeptFormData({ ...deptFormData, nameEn: e.target.value, name_en: e.target.value })}
                    placeholder="เช่น Production Department"
                    className="w-full px-3 py-2 bg-[#F5F5F5] border border-[#E5E5E5] rounded-xl"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">หัวหน้าแผนก / ผู้มีอำนาจลงนามประจำแผนก:</label>
                  <select
                    value={deptFormData.headUserId || ''}
                    onChange={(e) => setDeptFormData({ ...deptFormData, headUserId: e.target.value })}
                    className="w-full px-3 py-2 bg-[#F5F5F5] border border-[#E5E5E5] rounded-xl"
                  >
                    <option value="">-- เลือกหัวหน้าแผนก --</option>
                    {(masterUsers || []).map(u => (
                      <option key={u.id} value={u.id}>{u.name} ({u.department})</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleCloseDeptModal}
                  className="btn-secondary text-xs cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  className="btn-primary text-xs cursor-pointer"
                >
                  บันทึกแผนก
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* ================= SMART DEPARTMENT DEACTIVATION MODAL ================= */}
      {deactivatingDept && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-900/60 backdrop-blur-sm overflow-y-auto animate-in fade-in duration-150">
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="relative w-full max-w-xl max-h-[90vh] bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150"
          >
            {/* Header */}
            <div className="px-6 py-4 bg-amber-500 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center text-white">
                  <AlertTriangle size={18} />
                </div>
                <div>
                  <h3 className="font-bold text-sm sm:text-base text-white">
                    ยืนยันการระงับการใช้งานฝ่าย {deactivatingDept.nameTh || deactivatingDept.name} ({deactivatingDept.id})
                  </h3>
                  <p className="text-xs text-amber-100 mt-0.5">
                    Department Deactivation & User Re-assignment (ISO 9001)
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => { setDeactivatingDept(null); setDeactivationCheckResult(null); }}
                className="p-1.5 text-amber-100 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
                title="ปิดหน้าต่าง"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-5 text-xs">
              {/* Warning Banner */}
              <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3 text-amber-900">
                <AlertCircle size={18} className="text-amber-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-bold text-xs">
                    คำเตือน: การระงับแผนกเป็นการปิดการใช้งานแบบ Soft Delete
                  </p>
                  <p className="text-[11px] text-amber-800 leading-relaxed">
                    แผนกนี้จะไม่ปรากฏใน Dropdown การออก DAR หรือแบบฟอร์มขอขึ้นทะเบียนใหม่ แต่ประวัติการลงนามและรหัสเอกสารเดิมจะยังคงอยู่เพื่อการตรวจสอบย้อนกลับ (Audit Trail)
                  </p>
                </div>
              </div>

              {/* Dependency Pre-check Summary Card */}
              <div className="card-surface p-4 border border-slate-200 rounded-xl space-y-3">
                <h4 className="font-bold text-slate-800 text-xs flex items-center gap-1.5">
                  <Layers size={14} className="text-[#0D99FF]" />
                  สรุปการตรวจสอบภาระผูกพัน (Dependency Pre-check)
                </h4>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <div className={`p-2.5 rounded-lg border text-center ${
                    deactivationCheckResult?.activeDocsCount > 0 ? 'bg-rose-50 border-rose-200 text-rose-700' : 'bg-slate-50 border-slate-200 text-slate-700'
                  }`}>
                    <div className="text-lg font-black">{deactivationCheckResult?.activeDocsCount || 0}</div>
                    <div className="text-[10px] font-medium mt-0.5">เอกสาร Effective</div>
                  </div>

                  <div className={`p-2.5 rounded-lg border text-center ${
                    deactivationCheckResult?.activeCopiesCount > 0 ? 'bg-rose-50 border-rose-200 text-rose-700' : 'bg-slate-50 border-slate-200 text-slate-700'
                  }`}>
                    <div className="text-lg font-black">{deactivationCheckResult?.activeCopiesCount || 0}</div>
                    <div className="text-[10px] font-medium mt-0.5">สำเนาควบคุมจริง</div>
                  </div>

                  <div className={`p-2.5 rounded-lg border text-center ${
                    deactivationCheckResult?.pendingTasksCount > 0 ? 'bg-rose-50 border-rose-200 text-rose-700' : 'bg-slate-50 border-slate-200 text-slate-700'
                  }`}>
                    <div className="text-lg font-black">{deactivationCheckResult?.pendingTasksCount || 0}</div>
                    <div className="text-[10px] font-medium mt-0.5">งานค้างในระบบ</div>
                  </div>

                  <div className="p-2.5 rounded-lg border bg-blue-50 border-blue-200 text-blue-700 text-center">
                    <div className="text-lg font-black">{deactivationCheckResult?.affectedUsers?.length || 0}</div>
                    <div className="text-[10px] font-medium mt-0.5">พนักงานที่ผูกอยู่</div>
                  </div>
                </div>

                {/* Blocking Banner if activeDocs, activeCopies, or pendingTasks exist */}
                {(deactivationCheckResult?.activeDocsCount > 0 || deactivationCheckResult?.activeCopiesCount > 0 || deactivationCheckResult?.pendingTasksCount > 0) && (
                  <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 space-y-1.5 mt-2">
                    <div className="font-bold flex items-center gap-1.5 text-rose-700">
                      <ShieldAlert size={15} />
                      ไม่สามารถระงับแผนกได้เนื่องจากยังมีงานหรือเอกสารคงค้างในระบบ
                    </div>
                    <ul className="list-disc list-inside text-[11px] text-rose-700 space-y-0.5 pl-1">
                      {deactivationCheckResult.activeDocsCount > 0 && (
                        <li>มีเอกสารแม่บทที่มีผลบังคับใช้ ({deactivationCheckResult.activeDocsCount} ฉบับ) ต้องทำการโอนย้ายเจ้าของ หรือยกเลิกด้วย DAR ก่อน</li>
                      )}
                      {deactivationCheckResult.activeCopiesCount > 0 && (
                        <li>มีเล่มสำเนาควบคุมที่แผนกนี้ถือครองอยู่ ({deactivationCheckResult.activeCopiesCount} เล่ม) ต้องทำการเรียกคืน (Recall) หรือโอนย้ายสถานที่ติดตั้งก่อน</li>
                      )}
                      {deactivationCheckResult.pendingTasksCount > 0 && (
                        <li>มีงาน DAR/คิวงานที่ยังไม่เสร็จสิ้น ({deactivationCheckResult.pendingTasksCount} รายการ) ต้องเคลียร์ให้เสร็จก่อนระงับแผนก</li>
                      )}
                    </ul>
                  </div>
                )}
              </div>

              {/* User Migration Section */}
              {deactivationCheckResult?.affectedUsers?.length > 0 && (
                <div className="card-surface p-4 border border-slate-200 rounded-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-slate-800 text-xs flex items-center gap-1.5">
                      <Users size={14} className="text-[#0D99FF]" />
                      การจัดสรรพนักงานในแผนก ({deactivationCheckResult.affectedUsers.length} คน)
                    </h4>
                  </div>

                  {/* Fallback Department Selector (for Single-dept users) */}
                  {deactivationCheckResult.affectedUsers.some(u => u.isSingleDept) && (
                    <div className="p-3 bg-blue-50/70 border border-blue-100 rounded-xl space-y-1.5">
                      <label className="font-bold text-slate-800 text-xs block">
                        ย้ายพนักงานที่ไม่มีแผนกรองไปยังแผนกใหม่ (Fallback Department): <span className="text-rose-500">*</span>
                      </label>
                      <select
                        value={fallbackDeptId}
                        onChange={(e) => setFallbackDeptId(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-[#E5E5E5] rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:border-[#0D99FF]"
                      >
                        <option value="">-- กรุณาเลือกแผนกปลายทาง --</option>
                        {departmentsList
                          .filter(d => d.id !== deactivatingDept.id && d.status !== 'INACTIVE')
                          .map(d => (
                            <option key={d.id} value={d.id}>
                              {d.id} - {d.nameTh || d.name}
                            </option>
                          ))}
                      </select>
                      <p className="text-[11px] text-slate-500">
                        พนักงานที่มีแผนกนี้เพียงแผนกเดียว จะถูกย้ายสังกัดหลักและสังกัดย่อยไปยังแผนกที่เลือก
                      </p>
                    </div>
                  )}

                  {/* Affected Users List */}
                  <div className="max-h-40 overflow-y-auto rounded-lg border border-slate-100 divide-y divide-slate-100">
                    {deactivationCheckResult.affectedUsers.map(u => (
                      <div key={u.id} className="p-2.5 flex items-center justify-between gap-3 text-xs bg-white">
                        <div className="min-w-0">
                          <div className="font-bold text-slate-800 truncate">{u.name}</div>
                          <div className="text-[10px] text-slate-400 truncate">
                            รหัส: {u.empId || u.id} | ตำแหน่ง: {u.position || 'พนักงาน'}
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          {u.isSingleDept ? (
                            <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded text-[10px] font-bold">
                              ย้ายไป {fallbackDeptId || '...'}
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 bg-purple-100 text-purple-800 rounded text-[10px] font-bold">
                              ตัดแผนกออก (หลักใหม่: {u.nextPrimary})
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Modal Footer */}
              </div>
              <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2.5 shrink-0">
                <button
                  type="button"
                  onClick={() => { setDeactivatingDept(null); setDeactivationCheckResult(null); }}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                >
                  ยกเลิก (Cancel)
                </button>

                <button
                  type="button"
                  disabled={
                    isDeactivatingLoading ||
                    deactivationCheckResult?.activeDocsCount > 0 ||
                    deactivationCheckResult?.activeCopiesCount > 0 ||
                    deactivationCheckResult?.pendingTasksCount > 0 ||
                    (deactivationCheckResult?.affectedUsers?.some(u => u.isSingleDept) && !fallbackDeptId)
                  }
                  onClick={handleConfirmDeactivateDept}
                  className={`px-4 py-2 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 ${
                    (deactivationCheckResult?.activeDocsCount > 0 || deactivationCheckResult?.activeCopiesCount > 0 || deactivationCheckResult?.pendingTasksCount > 0 || (deactivationCheckResult?.affectedUsers?.some(u => u.isSingleDept) && !fallbackDeptId))
                      ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                      : 'bg-rose-600 text-white hover:bg-rose-700 shadow-sm cursor-pointer'
                  }`}
                >
                  {isDeactivatingLoading ? (
                    <>
                      <RefreshCw size={13} className="animate-spin" />
                      กำลังดำเนินการ...
                    </>
                  ) : (
                    'ยืนยันระงับการใช้งาน (Confirm Deactivation)'
                  )}
                </button>
              </div>
          </motion.div>
        </div>
      )}

      {/* ================= DOCUMENT TYPE MODAL ================= */}
      {isTypeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-900/60 backdrop-blur-sm overflow-y-auto animate-in fade-in duration-150">
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="relative w-full max-w-xl max-h-[90vh] bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150"
          >
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
              <h3 className="font-bold text-sm sm:text-base text-white">
                {editingType ? 'แก้ไขประเภทเอกสาร' : 'เพิ่มประเภทเอกสารใหม่'}
              </h3>
              <button 
                type="button"
                onClick={() => setIsTypeModalOpen(false)} 
                className="p-1.5 text-slate-300 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
                title="ปิดหน้าต่าง"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveType} className="flex-1 flex flex-col min-h-0 overflow-hidden">
              <div className="flex-1 overflow-y-auto p-6 space-y-4 text-xs">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">รหัสประเภท (Type Code) <span className="text-rose-500">*</span>:</label>
                    <input
                      type="text"
                      required
                      disabled={Boolean(editingType)}
                      value={typeFormData.code}
                      onChange={(e) => setTypeFormData({ ...typeFormData, code: e.target.value.toUpperCase() })}
                      placeholder="เช่น SOP, WI, FM..."
                      className="w-full px-3 py-2 bg-[#F5F5F5] border border-[#E5E5E5] rounded-xl font-mono uppercase"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">รูปแบบรหัส (Pattern):</label>
                    <input
                      type="text"
                      value={typeFormData.namingPattern}
                      onChange={(e) => setTypeFormData({ ...typeFormData, namingPattern: e.target.value })}
                      placeholder="{Type}-{Dept}-{##}"
                      className="w-full px-3 py-2 bg-[#F5F5F5] border border-[#E5E5E5] rounded-xl font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">ชื่อประเภทภาษาไทย <span className="text-rose-500">*</span>:</label>
                  <input
                    type="text"
                    required
                    value={typeFormData.nameTh}
                    onChange={(e) => setTypeFormData({ ...typeFormData, nameTh: e.target.value })}
                    placeholder="เช่น ระเบียบปฏิบัติงาน"
                    className="w-full px-3 py-2 bg-[#F5F5F5] border border-[#E5E5E5] rounded-xl"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">หมวดหมู่เอกสาร & สิทธิ์ DAR (Category & DAR Scope) <span className="text-rose-500">*</span>:</label>
                  <select
                    value={typeFormData.category || 'INTERNAL'}
                    onChange={(e) => {
                      const cat = e.target.value;
                      setTypeFormData({
                        ...typeFormData,
                        category: cat,
                        allowDar: cat === 'INTERNAL'
                      });
                    }}
                    className="w-full px-3 py-2 bg-[#F5F5F5] border border-[#E5E5E5] rounded-xl font-medium"
                  >
                    <option value="INTERNAL">เอกสารภายใน (Internal - รองรับการสร้างและเปิดคำร้อง DAR)</option>
                    <option value="EXTERNAL">เอกสารภายนอก (External - ควบคุมผ่านโมดูล ED ไม่ผ่าน DAR)</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">รอบเวลาทบทวน (เดือน):</label>
                    <input
                      type="number"
                      min="1"
                      value={typeFormData.reviewCycleMonths}
                      onChange={(e) => setTypeFormData({ ...typeFormData, reviewCycleMonths: parseInt(e.target.value) || 12 })}
                      className="w-full px-3 py-2 bg-[#F5F5F5] border border-[#E5E5E5] rounded-xl"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">อายุจัดเก็บ (ปี):</label>
                    <input
                      type="number"
                      min="1"
                      value={typeFormData.retentionPeriodYears}
                      onChange={(e) => setTypeFormData({ ...typeFormData, retentionPeriodYears: parseInt(e.target.value) || 3 })}
                      className="w-full px-3 py-2 bg-[#F5F5F5] border border-[#E5E5E5] rounded-xl"
                    />
                  </div>
                </div>

                <div className="p-3 bg-[#F5F5F5] border border-[#E5E5E5] rounded-xl">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={typeFormData.is_form_type}
                      onChange={(e) => setTypeFormData({ ...typeFormData, is_form_type: e.target.checked })}
                      className="w-4 h-4 text-[#0D99FF] rounded"
                    />
                    <div>
                      <span className="font-bold text-slate-800">เป็นแบบฟอร์มเปล่า (Blank Form Type)</span>
                      <p className="text-xs text-slate-400">ใช้กฎ Form Clean Bypass ไม่ประทับลายน้ำเมื่ออยู่ในสถานะบังคับใช้</p>
                    </div>
                  </label>
                </div>
              </div>

              <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsTypeModalOpen(false)}
                  className="btn-secondary text-xs cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  className="btn-primary text-xs cursor-pointer"
                >
                  บันทึกประเภทเอกสาร
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* ================= LOCATION MODAL ================= */}
      {isLocModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-900/60 backdrop-blur-sm overflow-y-auto animate-in fade-in duration-150">
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="relative w-full max-w-xl max-h-[90vh] bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150"
          >
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
              <h3 className="font-bold text-sm sm:text-base text-white">
                {editingLoc ? 'แก้ไขจุดใช้งานหน้างาน' : 'เพิ่มจุดใช้งานใหม่'}
              </h3>
              <button 
                type="button"
                onClick={() => setIsLocModalOpen(false)} 
                className="p-1.5 text-slate-300 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
                title="ปิดหน้าต่าง"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveLoc} className="flex-1 flex flex-col min-h-0 overflow-hidden">
              <div className="flex-1 overflow-y-auto p-6 space-y-4 text-xs">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">สังกัดแผนก <span className="text-rose-500">*</span>:</label>
                  <select
                    value={locFormData.departmentId}
                    onChange={(e) => setLocFormData({ ...locFormData, departmentId: e.target.value })}
                    className="w-full px-3 py-2 bg-[#F5F5F5] border border-[#E5E5E5] rounded-xl"
                  >
                    {departmentsList.map(d => (
                      <option key={d.id} value={d.id}>{d.id} - {d.nameTh || d.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">รหัสจุดใช้งาน (Location ID/Code):</label>
                  <input
                    type="text"
                    disabled={Boolean(editingLoc)}
                    value={locFormData.id}
                    onChange={(e) => setLocFormData({ ...locFormData, id: e.target.value, code: e.target.value })}
                    placeholder="เช่น PD-L5 (เว้นว่างเพื่อสร้างอัตโนมัติ)"
                    className="w-full px-3 py-2 bg-[#F5F5F5] border border-[#E5E5E5] rounded-xl font-mono"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">ชื่อจุดใช้งาน/สถานีปฏิบัติงาน <span className="text-rose-500">*</span>:</label>
                  <input
                    type="text"
                    required
                    value={locFormData.name}
                    onChange={(e) => setLocFormData({ ...locFormData, name: e.target.value })}
                    placeholder="เช่น Line 5 - Baking Area 2"
                    className="w-full px-3 py-2 bg-[#F5F5F5] border border-[#E5E5E5] rounded-xl"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">คำอธิบายพื้นที่:</label>
                  <textarea
                    value={locFormData.description}
                    onChange={(e) => setLocFormData({ ...locFormData, description: e.target.value })}
                    rows={2}
                    placeholder="รายละเอียดจุดติดตั้งเอกสารฉบับควบคุม..."
                    className="w-full px-3 py-2 bg-[#F5F5F5] border border-[#E5E5E5] rounded-xl resize-none"
                  />
                </div>

                <div className="p-3 bg-[#F5F5F5] border border-[#E5E5E5] rounded-xl">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={locFormData.isMasterOffice}
                      onChange={(e) => setLocFormData({ ...locFormData, isMasterOffice: e.target.checked })}
                      className="w-4 h-4 text-[#0D99FF] rounded"
                    />
                    <div>
                      <span className="font-bold text-slate-800">เป็นจุดคุมงานหลักประจำแผนก (Origin Office)</span>
                      <p className="text-xs text-slate-400">สำหรับล็อกหมายเลข Copy 01 (สำเนาควบคุม) ประจำแผนกเจ้าของเอกสาร</p>
                    </div>
                  </label>
                </div>
              </div>

              <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsLocModalOpen(false)}
                  className="btn-secondary text-xs cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  className="btn-primary text-xs cursor-pointer"
                >
                  บันทึกจุดใช้งาน
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* ================= CLEAN SLATE CONFIRMATION MODAL ================= */}
      {isCleanSlateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-900/60 backdrop-blur-sm overflow-y-auto animate-in fade-in duration-150">
          <div className="relative w-full max-w-xl max-h-[90vh] bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4 border-b border-slate-200 bg-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3 text-rose-600">
                <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl">
                  <RotateCcw size={24} className="text-rose-600" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-slate-900">ล้างข้อมูลเพื่อเริ่มทดสอบใหม่ (Clean Slate)</h3>
                  <p className="text-xs text-slate-500 font-normal">Factory Reset Transaction Data for E2E Testing</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsCleanSlateModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-3 text-xs text-slate-600 leading-relaxed">
              <p>
                การดำเนินการนี้จะ <strong>ลบข้อมูลจำลองเชิงธุรกรรม (Transaction Data) ทั้งหมด</strong> เพื่อให้ระบบกลับสู่สภาพเริ่มต้นที่สะอาด (Clean Slate) สำหรับการทดสอบ Workflow ตั้งแต่ต้น:
              </p>

              <div className="p-3.5 bg-rose-50/70 border border-rose-200/80 rounded-xl space-y-1.5 text-rose-950 font-medium">
                <div className="font-bold text-rose-800 flex items-center gap-1.5">
                  <span>🗑️ ข้อมูลที่จะถูกล้างเป็นค่าว่าง (`[]`):</span>
                </div>
                <ul className="list-disc list-inside space-y-0.5 text-rose-900 text-xs pl-1">
                  <li>คำร้อง DAR ทั้งหมด (`dars`, `darRequests`, `timeline`)</li>
                  <li>เอกสารในคลังและเอกสารแม่บท (`documents`, `externalDocuments`)</li>
                  <li>ทะเบียนสำเนาควบคุมทั้งหมด (`controlledCopyInstances`, `documentControlledCopies`)</li>
                  <li>กล่องงานและแจ้งเตือนทั้งหมด (`tasks: []`, `notifications: []`)</li>
                  <li>ประวัติการทำงานและ Audit Trail ทั้งหมด (`actionLog`, `auditTrail`)</li>
                </ul>
              </div>

              <div className="p-3.5 bg-emerald-50/70 border border-emerald-200/80 rounded-xl space-y-1.5 text-emerald-950 font-medium">
                <div className="font-bold text-emerald-800 flex items-center gap-1.5">
                  <span>✅ ข้อมูลหลักที่ยังคงไว้ 100% (Preserved Master Data):</span>
                </div>
                <ul className="list-disc list-inside space-y-0.5 text-emerald-900 text-xs pl-1">
                  <li>บัญชีผู้ใช้ 10 บัญชีมาตรฐาน พร้อมรหัส PIN 123456</li>
                  <li>แผนก 9 แผนกมาตรฐาน (`PD`, `QA/QC`, `WH`, `EN` ฯลฯ)</li>
                  <li>ประเภทเอกสาร 6 ประเภท (`QM`, `SOP`, `WI`, `FM`, `SD`, `SPEC`)</li>
                  <li>จุดใช้งานและสถานีมาตรฐานประจำโรงงาน</li>
                  <li>การตั้งค่าความปลอดภัย e-Signature และ SLAs</li>
                </ul>
              </div>
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2.5 shrink-0">
              <button
                type="button"
                onClick={() => setIsCleanSlateModalOpen(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                ยกเลิก (Cancel)
              </button>
              <button
                type="button"
                onClick={() => {
                  resetTransactionDataToCleanSlate();
                  setIsCleanSlateModalOpen(false);
                  toast.success('ล้างข้อมูลธุรกรรมทั้งหมดเรียบร้อยแล้ว ระบบพร้อมสำหรับการทดสอบ Clean Slate');
                }}
                className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl transition-colors shadow-xs flex items-center gap-1.5 cursor-pointer"
              >
                <RotateCcw size={14} />
                <span>ยืนยันล้างข้อมูล (Confirm Reset)</span>
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ================= USER SIGNATURE PROFILE MODAL ================= */}
      {/* ================= USER SIGNATURE ASSET MODAL (Draw, Upload, Font) ================= */}
      {isSignatureModalOpen && selectedUserForSignature && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-900/60 backdrop-blur-sm overflow-y-auto animate-in fade-in duration-150">
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="relative w-full max-w-2xl max-h-[90vh] bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150"
          >
            {/* Header */}
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-[#0D99FF]/20 rounded-xl text-[#0D99FF]">
                  <PenTool size={18} />
                </div>
                <div>
                  <h3 className="font-bold text-sm sm:text-base text-white">
                    จัดการลายเซ็นอิเล็กทรอนิกส์ (Signature Asset)
                  </h3>
                  <p className="text-xs text-slate-400">
                    สำหรับผู้ใช้งาน: {selectedUserForSignature.name} ({selectedUserForSignature.department})
                  </p>
                </div>
              </div>
              <button 
                type="button"
                onClick={() => setIsSignatureModalOpen(false)} 
                className="p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
                title="ปิดหน้าต่าง"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveSignatureProfile} className="flex-1 flex flex-col min-h-0 overflow-hidden">
              <div className="flex-1 overflow-y-auto p-6 space-y-5 text-xs">
              {/* User Identity Banner */}
              <div className="p-3.5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl flex items-center justify-between">
                <div>
                  <div className="font-bold text-slate-800 text-sm">
                    {selectedUserForSignature.name}
                  </div>
                  <div className="text-slate-500 font-mono text-[11px] mt-0.5">
                    {selectedUserForSignature.empId || selectedUserForSignature.id} • แผนก {selectedUserForSignature.department} • {selectedUserForSignature.position || 'User'}
                  </div>
                </div>
                <span className="px-2.5 py-1 rounded-full text-[10px] font-mono font-bold bg-[#E5F4FF] text-[#007BE5] border border-[#B8E1FF]">
                  Level {selectedUserForSignature.level || 1}
                </span>
              </div>

              {/* Mode Selection Tabs (3 Modes) */}
              <div>
                <label className="font-bold text-slate-700 block mb-2">
                  เลือกวิธีสร้างลายเซ็น (Signature Mode):
                </label>
                <div className="grid grid-cols-3 gap-2 p-1 bg-[#F1F5F9] rounded-xl border border-slate-200">
                  <button
                    type="button"
                    onClick={() => {
                      setSignatureActiveTab('DRAWN');
                      setSignatureFormData(prev => ({ ...prev, signatureType: 'DRAWN' }));
                    }}
                    className={`py-2 px-3 rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      signatureActiveTab === 'DRAWN'
                        ? 'bg-white text-slate-900 shadow-xs border border-slate-200/80'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <span>✍️ วาดลายเซ็น</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSignatureActiveTab('IMAGE');
                      setSignatureFormData(prev => ({ ...prev, signatureType: 'IMAGE' }));
                    }}
                    className={`py-2 px-3 rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      signatureActiveTab === 'IMAGE'
                        ? 'bg-white text-slate-900 shadow-xs border border-slate-200/80'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <span>🖼️ อัปโหลดรูป</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSignatureActiveTab('TYPOGRAPHIC');
                      setSignatureFormData(prev => ({ ...prev, signatureType: 'TYPOGRAPHIC' }));
                    }}
                    className={`py-2 px-3 rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      signatureActiveTab === 'TYPOGRAPHIC'
                        ? 'bg-white text-slate-900 shadow-xs border border-slate-200/80'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <span>🔤 เลือก Font</span>
                  </button>
                </div>
              </div>

              {/* Mode 1: Canvas Draw */}
              {signatureActiveTab === 'DRAWN' && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-700">วาดลายเซ็นด้วยเมาส์หรือระบบสัมผัส:</span>
                    <button
                      type="button"
                      onClick={clearCanvas}
                      className="px-2.5 py-1 text-[11px] font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 rounded-lg transition-colors cursor-pointer border border-rose-200"
                    >
                      ล้างลายเซ็น (Clear)
                    </button>
                  </div>
                  <div className="border-2 border-dashed border-slate-300 rounded-xl bg-white p-2 overflow-hidden flex items-center justify-center shadow-inner">
                    <canvas
                      ref={sigCanvasRef}
                      width={480}
                      height={140}
                      onMouseDown={startDrawing}
                      onMouseMove={draw}
                      onMouseUp={stopDrawing}
                      onMouseLeave={stopDrawing}
                      onTouchStart={startDrawing}
                      onTouchMove={draw}
                      onTouchEnd={stopDrawing}
                      className="cursor-crosshair w-full max-w-full bg-white touch-none"
                    />
                  </div>
                  <p className="text-[11px] text-slate-400 text-center">
                    ลากเมาส์หรือใช้นิ้วเขียนลายเซ็นลงในกรอบด้านบน ลายเซ็นจะถูกแปลงเป็นไฟล์ภาพโปร่งใสโดยอัตโนมัติ
                  </p>
                </div>
              )}

              {/* Mode 2: Image Upload */}
              {signatureActiveTab === 'IMAGE' && (
                <div className="space-y-3">
                  <span className="font-semibold text-slate-700 block">อัปโหลดไฟล์ภาพลายเซ็น (PNG / JPG):</span>
                  <div className="p-6 border-2 border-dashed border-slate-300 hover:border-[#0D99FF] rounded-xl bg-[#F8FAFC] text-center space-y-3 transition-colors">
                    {signatureFormData.signatureImage && signatureFormData.signatureType === 'IMAGE' ? (
                      <div className="space-y-3">
                        <div className="max-h-28 flex items-center justify-center p-2 bg-white rounded-lg border border-slate-200">
                          <img
                            src={signatureFormData.signatureImage}
                            alt="Signature Preview"
                            className="max-h-24 max-w-full object-contain"
                          />
                        </div>
                        <div className="flex justify-center gap-2">
                          <label className="px-3 py-1.5 bg-[#0D99FF] text-white rounded-lg text-xs font-bold hover:bg-[#007BE5] cursor-pointer transition-colors">
                            เปลี่ยนรูปภาพ
                            <input
                              type="file"
                              accept="image/png,image/jpeg,image/webp"
                              onChange={handleSignatureFileUpload}
                              className="hidden"
                            />
                          </label>
                          <button
                            type="button"
                            onClick={() => setSignatureFormData(prev => ({ ...prev, signatureImage: '' }))}
                            className="px-3 py-1.5 bg-rose-50 text-rose-600 rounded-lg text-xs font-bold hover:bg-rose-100 transition-colors cursor-pointer"
                          >
                            ลบรูปภาพ
                          </button>
                        </div>
                      </div>
                    ) : (
                      <label className="cursor-pointer block space-y-2">
                        <div className="w-10 h-10 mx-auto rounded-full bg-[#E5F4FF] text-[#0D99FF] flex items-center justify-center">
                          <Upload size={18} />
                        </div>
                        <div>
                          <span className="font-bold text-slate-700 text-xs block">คลิกเพื่อเลือกไฟล์รูปภาพ</span>
                          <span className="text-[11px] text-slate-400">แนะนำภาพพื้นหลังโปร่งใส (PNG) ขนาดไม่เกิน 2MB</span>
                        </div>
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          onChange={handleSignatureFileUpload}
                          className="hidden"
                        />
                      </label>
                    )}
                  </div>
                </div>
              )}

              {/* Mode 3: Typographic Font Style */}
              {signatureActiveTab === 'TYPOGRAPHIC' && (
                <div className="space-y-3">
                  <div>
                    <label className="font-semibold text-slate-700 block mb-1.5">
                      ข้อความ / อักษรย่อลายเซ็น (Initials or Display Name):
                    </label>
                    <input
                      type="text"
                      value={signatureFormData.signatureInitials}
                      onChange={(e) => setSignatureFormData({ ...signatureFormData, signatureInitials: e.target.value })}
                      placeholder="เช่น สมชาย ส. หรือ BM-QA"
                      className="w-full px-3 py-2 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl font-medium focus:bg-white focus:border-[#0D99FF] outline-none text-xs"
                    />
                  </div>

                  <div>
                    <label className="font-semibold text-slate-700 block mb-1.5">
                      เลือกรูปแบบฟอนต์ลายเซ็น:
                    </label>
                    <div className="grid grid-cols-2 gap-2.5">
                      {[
                        { id: 'BRUSH_SCRIPT', label: 'Brush Script (พู่กันพลิ้วไหว)', fontClass: 'font-serif italic font-bold' },
                        { id: 'FORMAL_SERIF', label: 'Formal Executive (ทางการสากล)', fontClass: 'font-serif tracking-widest uppercase' },
                        { id: 'MODERN_SANS', label: 'Modern Sans (โมเดิร์นคมชัด)', fontClass: 'font-sans font-extrabold tracking-wide uppercase' },
                        { id: 'CLASSIC_CALLIGRAPHY', label: 'Classic Calligraphy (ตวัดคลาสสิก)', fontClass: 'font-mono italic font-semibold' }
                      ].map(style => {
                        const isSelected = signatureFormData.signatureStyle === style.id;
                        return (
                          <button
                            key={style.id}
                            type="button"
                            onClick={() => setSignatureFormData({ ...signatureFormData, signatureStyle: style.id })}
                            className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                              isSelected
                                ? 'bg-[#E5F4FF] border-[#0D99FF] ring-2 ring-[#0D99FF]/20 shadow-xs'
                                : 'bg-white border-[#E2E8F0] hover:bg-[#F8FAFC]'
                            }`}
                          >
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-[11px] font-bold text-slate-700">{style.label}</span>
                              {isSelected && <Check size={14} className="text-[#0D99FF]" />}
                            </div>
                            <div className={`text-slate-800 text-sm truncate py-1 ${style.fontClass}`}>
                              {signatureFormData.signatureInitials || selectedUserForSignature.name}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* Real-time Signature Preview */}
              <div>
                <label className="font-bold text-slate-700 block mb-1.5">
                  ตัวอย่างลายเซ็นบนเอกสาร (Live Asset Preview):
                </label>
                <div className="p-4 bg-white border border-slate-200 rounded-xl flex items-center justify-between shadow-2xs">
                  <div className="h-14 flex items-center justify-center">
                    {signatureActiveTab === 'IMAGE' && signatureFormData.signatureImage ? (
                      <img src={signatureFormData.signatureImage} alt="Preview" className="max-h-12 max-w-[200px] object-contain" />
                    ) : signatureActiveTab === 'DRAWN' && signatureFormData.signatureImage ? (
                      <img src={signatureFormData.signatureImage} alt="Drawn" className="max-h-12 max-w-[200px] object-contain" />
                    ) : (
                      <div className={`text-slate-900 text-lg ${
                        signatureFormData.signatureStyle === 'FORMAL_SERIF' ? 'font-serif tracking-widest uppercase' :
                        signatureFormData.signatureStyle === 'MODERN_SANS' ? 'font-sans font-extrabold tracking-wide uppercase' :
                        signatureFormData.signatureStyle === 'CLASSIC_CALLIGRAPHY' ? 'font-mono italic font-semibold' : 'font-serif italic font-bold'
                      }`}>
                        {signatureFormData.signatureInitials || selectedUserForSignature.name}
                      </div>
                    )}
                  </div>
                  <div className="text-right text-[11px] text-slate-500 space-y-0.5">
                    <div><strong className="text-slate-800">ผู้ลงนาม:</strong> {selectedUserForSignature.name}</div>
                    <div><strong className="text-slate-800">สังกัด:</strong> {selectedUserForSignature.department}</div>
                    <div className="text-emerald-600 font-bold inline-flex items-center gap-1 justify-end">
                      <CheckCircle2 size={13} strokeWidth={1.5} className="text-emerald-600" />
                      <span>Active Signature Asset</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

              {/* Actions */}
              <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setIsSignatureModalOpen(false)}
                    className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="submit"
                    className="btn-primary text-xs flex items-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <Save size={14} />
                    <span>บันทึกสินทรัพย์ลายเซ็น</span>
                  </button>
                </div>
              </form>
          </motion.div>
        </div>
      )}

      {/* ================= DIGITAL STAMP SIMULATOR MODAL ================= */}
      {isStampSimulatorModalOpen && stampSimulatorUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-900/60 backdrop-blur-sm overflow-y-auto animate-in fade-in duration-150">
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="relative w-full max-w-xl max-h-[90vh] bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150"
          >
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-emerald-500/20 rounded-xl text-emerald-400">
                  <ShieldCheck size={18} />
                </div>
                <div>
                  <h3 className="font-bold text-sm sm:text-base text-white">
                    ทดสอบประทับตราจำลอง (21 CFR Part 11 Stamp Simulator)
                  </h3>
                  <p className="text-xs text-slate-400">
                    จำลองผลลัพธ์การประทับตราบนเอกสาร DAR / PDF Watermark
                  </p>
                </div>
              </div>
              <button 
                type="button"
                onClick={() => setIsStampSimulatorModalOpen(false)} 
                className="p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
                title="ปิดหน้าต่าง"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-5 text-xs">
              {/* Role Selector */}
              <div>
                <label className="font-bold text-slate-700 block mb-1.5">เลือกลำดับขั้นตอนการลงนามใน DAR Workflow:</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: 'REQUESTER', label: '1. ผู้ยื่นคำร้อง (Requester)', meaning: 'I declare that this DAR request is accurate and complete.' },
                    { id: 'REVIEWER', label: '2. ผู้ทบทวน (Reviewer)', meaning: 'I have reviewed and verified the technical contents.' },
                    { id: 'APPROVER', label: '3. ผู้อนุมัติ (Approver)', meaning: 'I approve the document for release and effective use.' },
                    { id: 'DCC_RECEIVER', label: '4. ผู้ควบคุมเอกสาร (DCC)', meaning: 'Official document registration and controlled copy issuance.' }
                  ].map(roleItem => {
                    const isSelected = stampSimulatorRole === roleItem.id;
                    return (
                      <button
                        key={roleItem.id}
                        type="button"
                        onClick={() => setStampSimulatorRole(roleItem.id)}
                        className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-[#E5F4FF] border-[#0D99FF] text-[#007BE5] font-bold shadow-2xs'
                            : 'bg-white border-[#E2E8F0] text-slate-700 hover:bg-[#F8FAFC]'
                        }`}
                      >
                        {roleItem.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Rendered Stamp Simulation */}
              <div className="p-5 bg-gradient-to-b from-slate-50 to-white border border-[#0D99FF]/40 rounded-2xl space-y-3 relative shadow-xs">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                    <span className="text-[11px] font-bold font-mono text-slate-800 uppercase">
                      QMS DIGITAL SIGNATURE SEAL
                    </span>
                  </div>
                  <span className="text-[10px] font-mono text-[#0D99FF] font-bold bg-[#E5F4FF] px-2 py-0.5 rounded-full">
                    {stampSimulatorUser.certificateSerial || 'CERT-2026-QA001'}
                  </span>
                </div>

                <div className="flex items-center gap-4">
                  <div className="w-32 h-14 bg-white border border-slate-300/80 rounded-xl flex items-center justify-center font-serif italic text-slate-900 font-bold text-lg px-3 truncate shadow-2xs">
                    {stampSimulatorUser.signatureInitials || stampSimulatorUser.name}
                  </div>
                  <div className="space-y-1 text-xs text-slate-700 flex-1 min-w-0">
                    <div className="font-bold text-slate-900 text-sm truncate">{stampSimulatorUser.name}</div>
                    <div className="text-[11px] text-slate-500 font-mono">{stampSimulatorUser.empId || stampSimulatorUser.id} • {stampSimulatorUser.department} • Level {stampSimulatorUser.level || 1}</div>
                    <div className="text-[11px] text-[#0D99FF] font-semibold">
                      Intent: {stampSimulatorRole === 'REQUESTER' ? 'ผู้ยื่นคำร้อง (Submission)' :
                        stampSimulatorRole === 'REVIEWER' ? 'ผู้ทบทวนเอกสาร (Reviewed)' :
                        stampSimulatorRole === 'APPROVER' ? 'ผู้อนุมัติเอกสาร (Approved)' : 'ผู้ควบคุมเอกสาร (DCC Released)'}
                    </div>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-200 text-[10px] font-mono text-slate-500 flex flex-col gap-0.5">
                  <div>Timestamp: 25/08/2026 22:15:00 (+07:00 Bangkok)</div>
                  <div className="truncate">SHA-256 Checksum: e9a4f21d8b73a45c991e60f83d21b7a44f128c93b</div>
                </div>
              </div>

              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center gap-2">
                <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                <span>
                  ตราประทับอิเล็กทรอนิกส์นี้ผ่านการรับรองตามมาตรฐาน <strong>21 CFR Part 11 Subpart B</strong> และสามารถตรวจสอบความถูกต้องย้อนกลับได้ 100%
                </span>
              </div>
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end shrink-0">
              <button
                type="button"
                onClick={() => setIsStampSimulatorModalOpen(false)}
                className="btn-primary text-xs px-5 cursor-pointer"
              >
                ปิดหน้าต่าง (Close)
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* ================= APPROVAL MATRIX EDIT MODAL ================= */}
      {isMatrixModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-900/60 backdrop-blur-sm overflow-y-auto animate-in fade-in duration-150">
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="relative w-full max-w-xl max-h-[90vh] bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150"
          >
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-[#0D99FF]/20 rounded-xl text-[#0D99FF]">
                  <Sliders size={18} />
                </div>
                <div>
                  <h3 className="font-bold text-sm sm:text-base text-white">
                    แก้ไขผังสายการอนุมัติ ({matrixFormData.docType})
                  </h3>
                  <p className="text-xs text-slate-400">
                    กำหนดระดับอำนาจอนุมัติและเงื่อนไขการรับทราบ
                  </p>
                </div>
              </div>
              <button 
                type="button"
                onClick={() => setIsMatrixModalOpen(false)} 
                className="p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
                title="ปิดหน้าต่าง"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveMatrixEntry} className="flex-1 flex flex-col min-h-0 overflow-hidden">
              <div className="flex-1 overflow-y-auto p-6 space-y-4 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">ประเภทเอกสาร (Document Type):</label>
                <div className="flex items-center gap-2.5 p-3 bg-[#F8FAFC] rounded-xl border border-[#E2E8F0]">
                  <span className="font-mono font-bold text-xs px-2.5 py-1 rounded-md bg-[#E5F4FF] text-[#007BE5] border border-[#B8E1FF] shadow-2xs">
                    {matrixFormData.docType}
                  </span>
                  <div>
                    <span className="font-bold text-slate-800 text-sm block">{matrixFormData.nameTh || matrixFormData.docType}</span>
                    {matrixFormData.description && (
                      <span className="text-[11px] text-slate-400">{matrixFormData.description}</span>
                    )}
                  </div>
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">1. ระดับผู้มีสิทธิ์ยื่นคำขอขั้นต่ำ (Min Requester Level):</label>
                <select
                  aria-label="ระดับผู้มีสิทธิ์ยื่นคำขอขั้นต่ำ"
                  value={matrixFormData.minRequesterLevel}
                  onChange={(e) => setMatrixFormData({ ...matrixFormData, minRequesterLevel: parseInt(e.target.value) || 1 })}
                  className="w-full px-3 py-2.5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl font-medium text-slate-800 focus:bg-white focus:border-[#0D99FF] outline-none text-xs"
                >
                  <option value="1">Level 1 ขึ้นไป (ทุกคนในแผนก / Staff & Officer)</option>
                  <option value="2">Level 2 ขึ้นไป (Officer ขึ้นไป)</option>
                  <option value="3">Level 3 ขึ้นไป (Senior Staff ขึ้นไป)</option>
                  <option value="4">Level 4 ขึ้นไป (Supervisor / หัวหน้างานขึ้นไป)</option>
                  <option value="5">Level 5 ขึ้นไป (Asst. Mgr / Lead ขึ้นไป)</option>
                  <option value="6">Level 6 ขึ้นไป (General Manager / ฝ่ายบริหาร)</option>
                </select>
                <p className="text-[11px] text-slate-400 mt-1">ผู้ใช้ที่มีระดับตำแหน่งต่ำกว่านี้จะไม่สามารถสร้างคำร้อง DAR สำหรับประเภทนี้ได้</p>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">2. ระดับผู้ทบทวนที่ต้องการ (Required Reviewer Level):</label>
                <select
                  aria-label="ระดับผู้ทบทวนที่ต้องการ"
                  value={matrixFormData.requiredReviewerLevel}
                  onChange={(e) => setMatrixFormData({ ...matrixFormData, requiredReviewerLevel: parseInt(e.target.value) || 4 })}
                  className="w-full px-3 py-2.5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl font-medium text-slate-800 focus:bg-white focus:border-[#0D99FF] outline-none text-xs"
                >
                  <option value="3">Level 3 (Senior Staff ประจำแผนก)</option>
                  <option value="4">Level 4 (Supervisor ประจำแผนก)</option>
                  <option value="5">Level 5 (Assistant Manager / Lead ประจำแผนก)</option>
                  <option value="6">Level 6 (General Manager / ฝ่ายบริหาร)</option>
                  <option value="7">Level 7 (Director / คณะกรรมการ)</option>
                </select>
                <p className="text-[11px] text-slate-400 mt-1">ระดับตำแหน่งขั้นต่ำที่จะถูกดึงเข้ามาเป็นผู้ทบทวน (Reviewer) ในสายงาน</p>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">3. ระดับผู้อนุมัติขั้นสุดท้าย (Final Approver Level):</label>
                <select
                  aria-label="ระดับผู้อนุมัติขั้นสุดท้าย"
                  value={matrixFormData.requiredApproverLevel}
                  onChange={(e) => setMatrixFormData({ ...matrixFormData, requiredApproverLevel: parseInt(e.target.value) || 6 })}
                  className="w-full px-3 py-2.5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl font-medium text-slate-800 focus:bg-white focus:border-[#0D99FF] outline-none text-xs"
                >
                  <option value="5">Level 5 (Assistant Manager / Dept Manager)</option>
                  <option value="6">Level 6 (General Manager / ผู้จัดการทั่วไป)</option>
                  <option value="7">Level 7 (Director / ผู้อำนวยการสายงาน)</option>
                  <option value="8">Level 8 (Managing Director / กรรมการผู้จัดการ / QMR)</option>
                </select>
                <p className="text-[11px] text-slate-400 mt-1">ระดับตำแหน่งขั้นสุดท้ายที่มีอำนาจลงนามอนุมัติบังคับใช้เอกสารฉบับนี้</p>
              </div>

              {matrixFormData.requiredApproverLevel < matrixFormData.requiredReviewerLevel && (
                <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
                  <AlertCircle size={15} className="shrink-0 text-rose-600" />
                  <span>คำเตือน: ระดับผู้อนุมัติ (Level {matrixFormData.requiredApproverLevel}) ต่ำกว่าระดับผู้ทบทวน (Level {matrixFormData.requiredReviewerLevel}) กรุณาเลือกระดับให้ถูกต้อง</span>
                </div>
              )}

              <div className="pt-2 border-t border-slate-100">
                <label className="font-bold text-slate-700 block mb-2">4. การบังคับรับทราบเป็นค่าเริ่มต้น (Default Acknowledgement):</label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer text-slate-700 font-medium">
                    <input
                      type="radio"
                      name="modalAck"
                      checked={matrixFormData.requireAckDefault === true}
                      onChange={() => setMatrixFormData({ ...matrixFormData, requireAckDefault: true })}
                      className="w-4 h-4 text-[#0D99FF] focus:ring-[#0D99FF]"
                    />
                    <span>บังคับต้องรับทราบ (Required)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-slate-700 font-medium">
                    <input
                      type="radio"
                      name="modalAck"
                      checked={matrixFormData.requireAckDefault === false}
                      onChange={() => setMatrixFormData({ ...matrixFormData, requireAckDefault: false })}
                      className="w-4 h-4 text-[#0D99FF] focus:ring-[#0D99FF]"
                    />
                    <span>ไม่ต้องรับทราบ (Optional / No Ack)</span>
                  </label>
                </div>
              </div>

                </div>

                <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setIsMatrixModalOpen(false)}
                    className="btn-secondary text-xs cursor-pointer"
                  >
                    ยกเลิก (Cancel)
                  </button>
                  <button
                    type="submit"
                    className="btn-primary text-xs cursor-pointer shadow-xs"
                  >
                    บันทึกการเปลี่ยนแปลง
                  </button>
                </div>
              </form>
          </motion.div>
        </div>
      )}

      {/* ================= ORPHAN PROTECTION MODAL ================= */}
      {orphanWarningModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-900/60 backdrop-blur-sm overflow-y-auto animate-in fade-in duration-150">
          <div className="relative w-full max-w-md max-h-[90vh] bg-white rounded-2xl shadow-2xl border border-rose-200 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4 bg-white border-b border-rose-100 flex items-center gap-3 text-rose-600 shrink-0">
              <ShieldAlert size={24} />
              <h3 className="font-bold text-base text-slate-900">ไม่สามารถลบจุดใช้งานได้ (Orphan Protection)</h3>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 space-y-4 text-xs">
              <p className="text-xs text-slate-600 leading-relaxed break-words">
                {orphanWarningModal.message}
              </p>
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800">
                💡 <strong>คำแนะนำด้านความปลอดภัย:</strong> หากไม่ต้องการใช้งานสถานีนี้ ให้คลิกเปลี่ยนสถานะเป็น <strong>Inactive</strong> แทนการลบข้อมูลถาวร
              </div>
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 shrink-0">
              <button
                type="button"
                onClick={() => setOrphanWarningModal({ isOpen: false, message: '' })}
                className="w-full py-2.5 bg-slate-900 text-white font-bold rounded-xl text-xs hover:bg-slate-800 transition-colors cursor-pointer"
              >
                รับทราบ (Close)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MasterDataHub;
