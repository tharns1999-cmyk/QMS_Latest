import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useSearchParams, useParams, useLocation } from 'react-router-dom';
import useStore from '../../../../store/useStore';
import { QMS_CONFIG, calculateDueDateBySla } from '../../config/qmsRegistry';
import toast from 'react-hot-toast';
import { 
  FileText, 
  User, 
  X, 
  ShieldAlert, 
  ChevronLeft, 
  UploadCloud, 
  Settings,
  CheckCircle2,
  MapPin
} from 'lucide-react';
import UserSelector from '../../components/UserSelector';
import DistributionSetup from '../../components/workflow/DistributionSetup';
import RelatedStandardsSelector from '../../components/workflow/RelatedStandardsSelector';
import DocumentAccessControlSelector from '../../components/workflow/DocumentAccessControlSelector';
import ConfirmRegistrationModal from '../../components/modals/ConfirmRegistrationModal';
import Button from '../../../../shared/components/ui/Button';
import { generateDynamicWorkflow } from '../../utils/workflowEngine';
import { 
  calculateCopyAllocations, 
  cleanLocationName,
  formatDocumentRunningNumber, 
  calculateNextDocumentSequence 
} from '../../services/MasterDataService';
import { ACCESS_SCOPE_METADATA } from '../../utils/accessControl';
import { normalizeDraftToFormState } from '../../utils/draftNormalizer';
import { saveFile } from '../../utils/fileStorage';
import { standardizeDepartmentCode } from '../../services/darService';

const DarNewForm = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const params = useParams();
  const location = useLocation();

  const rawDraftId = searchParams.get('draftId') || params?.draftId || params?.id || location.state?.draftId;
  const targetDraftId = rawDraftId ? decodeURIComponent(String(rawDraftId)).trim() : null;
  const { 
    currentUser, 
    addDar, 
    submitDar,
    saveDarDraft, 
    deleteDar, 
    dars, 
    darRequests, 
    documents, 
    masterDocuments,
    tasks,
    masterUsers, 
    approvalMatrix,
    documentTypes, 
    departments, 
    masterDepartments, 
    simulatedDate 
  } = useStore();
  
  // Departments: prefer runtime store data (admin-customised), fall back to registry seed
  const availableDepartments = useMemo(() => {
    const storeDepts = masterDepartments || departments || [];
    if (storeDepts.length > 0) return storeDepts;
    // Fallback: convert registry option objects back to dept-shape objects
    return QMS_CONFIG.departments.filter(d => !d.status || d.status === 'ACTIVE');
  }, [masterDepartments, departments]);

  // Document types: prefer runtime store data, fall back to registry
  const activeDocumentTypes = useMemo(() => {
    const storeTypes = documentTypes || [];
    const source = storeTypes.length > 0 ? storeTypes : QMS_CONFIG.documentTypes;
    return source.filter(t =>
      t &&
      (t.status === 'ACTIVE' || t.status === 'Active' || t.isActive !== false) &&
      t.allowDar !== false &&
      t.category !== 'EXTERNAL' &&
      t.code !== 'ED' &&
      t.id !== 'ED'
    );
  }, [documentTypes]);

  const initialDocType = useMemo(() => {
    const pType = params?.docType;
    if (pType && pType !== 'document' && pType !== 'create') {
      return pType.toUpperCase();
    }
    return '';
  }, [params?.docType]);

  const initialFormState = useMemo(() => ({
    id: '',
    darNo: '',
    docType: initialDocType,
    docIdInput: '',
    docCode: '',
    title: '',
    department: standardizeDepartmentCode(currentUser?.department || 'PD'),
    date: new Date().toISOString().split('T')[0],
    requestDetail: '',
    requestReason: '',
    reasonCategory: 'NEW_PROCESS',
    confidentialityLevel: 'INTERNAL',
    slaPriority: 'NORMAL',
    isFastTrack: false,
    dueDate: calculateDueDateBySla('NORMAL'),
    ackRequirement: 'NOT_REQUIRED',
    ackUserId: '',
    distributions: [],
    effectiveDate: '',
    file: null,
    relatedStandards: [],
    otherStandardDetail: '',
    accessScope: 'GENERAL',
    authorizedDepartments: [],
    access_control: {
      scope: 'GENERAL',
      authorized_depts: [],
      authorized_users: [],
      min_access_level: 4
    }
  }), [initialDocType, currentUser?.department]);

  const [formData, setFormData] = useState(initialFormState);
  const [selectedFile, setSelectedFile] = useState(null);
  const [errors, setErrors] = useState({});
  const [showConfirm, setShowConfirm] = useState(false);
  const isSubmittedRef = useRef(false);
  const hasHydratedDraftRef = useRef(false);

  // Universal Hydration Lifecycle: ดึงข้อมูลแบบร่างกลับมาหยอดลงฟอร์มทันทีที่เปิดหน้า
  useEffect(() => {
    if (hasHydratedDraftRef.current || isSubmittedRef.current) return;
    if (targetDraftId || location.state?.draftData) {
      const allDarsList = dars || darRequests || [];
      const draft = location.state?.draftData || allDarsList.find(d => {
        if (!targetDraftId) return false;
        return (
          String(d.id) === targetDraftId || 
          String(d.dar_no) === targetDraftId || 
          String(d.darNo) === targetDraftId
        );
      });
      if (draft) {
        hasHydratedDraftRef.current = true;
        const hydrated = normalizeDraftToFormState(draft, initialFormState);
        setFormData(hydrated);
      }
    }
  }, [targetDraftId, dars, darRequests, currentUser?.department, location.state, initialFormState]);

  // ตรวจสอบว่าเป็นเอกสารประเภท FM หรือไม่
  const isFormDocument = formData.docType === 'FM' || formData.doc_type === 'FM';

  // Auto-calculated Workflow Participants for Auto-Whitelisting
  const workflowParticipants = useMemo(() => {
    const targetDept = standardizeDepartmentCode(formData.department || currentUser?.department || 'PD');
    const dynamicSteps = generateDynamicWorkflow(currentUser, targetDept, masterUsers || [], formData.docType, approvalMatrix);
    if (dynamicSteps && dynamicSteps.length > 0) {
      return dynamicSteps.map(step => ({
        id: step.userId,
        empId: step.userId,
        name: step.userName,
        department: targetDept,
        role: step.role,
        roleTitle: step.role === 'REQUESTER' ? 'ผู้จัดทำ (Requester)' : (step.role === 'REVIEWER' ? 'ผู้ทบทวน (Reviewer)' : 'ผู้อนุมัติ (Approver)')
      }));
    }
    return [];
  }, [currentUser, formData.department, formData.docType, masterUsers, approvalMatrix]);

  const getPreviewCode = () => {
    if (!formData?.docType) return '[กรุณาเลือกชนิดเอกสารเพื่อสร้างรหัส]';
    const dept = standardizeDepartmentCode(formData?.department || currentUser?.department || 'PD');
    const selectedTypeObj = (documentTypes || []).find(t => t && (t.code || t.id) === formData.docType);
    const pattern = selectedTypeObj?.namingPattern || `${formData.docType}-{Dept}-{###}`;
    const allDocs = [...(documents || []), ...(masterDocuments || [])];
    const allDars = [...(dars || []), ...(darRequests || [])];
    const nextSeq = calculateNextDocumentSequence(formData.docType, dept, allDocs, allDars, tasks || []);
    const seqFormatted = formatDocumentRunningNumber(nextSeq || 1);
    
    if (pattern && (pattern.includes('{Type}') || pattern.includes('{Dept}') || pattern.includes('{###}') || pattern.includes('{##}'))) {
      return pattern
        .replace('{Type}', formData.docType)
        .replace('{Dept}', dept)
        .replace('{###}', seqFormatted)
        .replace('{##}', seqFormatted);
    }
    return `${formData.docType}-${dept}-${seqFormatted}`;
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.type && file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
        toast.error('รองรับเฉพาะไฟล์ PDF เท่านั้น');
        e.target.value = '';
        return;
      }
      setSelectedFile(file);
      setFormData(prev => ({ ...prev, file }));

      // Synchronous In-Memory Registry caching immediately upon selection
      window.__PDF_CACHE__ = window.__PDF_CACHE__ || new Map();
      window.__UPLOADED_FILES_MAP__ = window.__UPLOADED_FILES_MAP__ || new Map();
      window.__PDF_CACHE__.set(file.name, file);
      window.__UPLOADED_FILES_MAP__.set(file.name, file);
      const previewCode = getPreviewCode();
      if (previewCode) {
        window.__PDF_CACHE__.set(previewCode, file);
        window.__UPLOADED_FILES_MAP__.set(previewCode, file);
      }
    }
  };

  const validate = () => {
    const newErrors = {};
    if (!formData.docType) newErrors.docType = 'กรุณาเลือกชนิดเอกสาร';
    if (!formData.title) newErrors.title = 'กรุณาระบุชื่อเอกสาร';
    if (!formData.requestDetail) newErrors.requestDetail = 'กรุณาระบุรายละเอียดคำร้องขอ';
    if (!formData.requestReason?.trim() && !formData.reason?.trim()) newErrors.requestReason = 'กรุณาระบุเหตุผลที่ร้องขอ';
    
    if (formData.relatedStandards?.includes('อื่น ๆ (Others)') && !formData.otherStandardDetail?.trim()) {
      newErrors.otherStandardDetail = 'กรุณาระบุมาตรฐานอื่นๆ';
    }
    
    if (formData.ackRequirement === 'REQUIRED' && !formData.ackUserId) {
      newErrors.ackUserId = 'กรุณาเลือกผู้รับ Acknowledgement 1 คน';
    }
    
    if (!formData.effectiveDate) {
      newErrors.effectiveDate = 'กรุณาระบุวันที่มีผลบังคับใช้';
    } else {
      const today = new Date(simulatedDate || Date.now());
      today.setHours(0,0,0,0);
      const selected = new Date(formData.effectiveDate);
      if (selected < today) newErrors.effectiveDate = 'ห้ามเลือกวันย้อนหลัง (นับจาก Simulated Date)';
    }
    
    if (!formData.file) newErrors.file = 'กรุณาแนบไฟล์ PDF';
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleDraft = () => {
    const draftPayload = {
      id: targetDraftId || formData.id,
      dar_no: formData.darNo || formData.id,
      type: 'NEW',
      status: 'DRAFT',
      title: formData.title || 'Untitled Draft',
      requesterId: currentUser?.id,
      requester_id: currentUser?.id,
      requester_name: currentUser?.name,
      department: standardizeDepartmentCode(currentUser?.department || formData.department || 'PD'),
      date: formData.date || new Date().toISOString().split('T')[0],
      docType: formData.docType,
      docIdInput: formData.docIdInput || getPreviewCode(),
      document_code: formData.docCode || formData.docIdInput,
      requestDetail: formData.requestDetail,
      request_detail: formData.requestDetail,
      reasonDetails: formData.requestReason || formData.reason || '',
      requestReason: formData.requestReason || formData.reason || '',
      request_reason: formData.requestReason || formData.reason || '',
      reason: formData.requestReason || formData.reason || '',
      reasonCategory: formData.reasonCategory || 'NEW_PROCESS',
      confidentialityLevel: formData.confidentialityLevel || 'INTERNAL',
      confidentiality: formData.confidentialityLevel || 'INTERNAL',
      slaPriority: formData.slaPriority || 'NORMAL',
      priority: formData.slaPriority || 'NORMAL',
      isFastTrack: Boolean(formData.isFastTrack || formData.slaPriority === 'FAST_TRACK'),
      dueDate: formData.dueDate || calculateDueDateBySla(formData.slaPriority || 'NORMAL'),
      ackRequirement: formData.ackRequirement,
      requireAck: formData.ackRequirement === 'REQUIRED',
      ackUserIds: formData.ackRequirement === 'REQUIRED' ? (formData.ackUserId ? [formData.ackUserId] : []) : [],
      ackUserId: formData.ackUserId,
      distributions: isFormDocument ? [] : (formData.distributions || []),
      effectiveDate: formData.effectiveDate,
      effective_date: formData.effectiveDate,
      relatedStandards: formData.relatedStandards || [],
      otherStandardDetail: formData.otherStandardDetail,
      access_control: formData.access_control,
      accessScope: formData.access_control?.scope || formData.accessScope || 'GENERAL',
      isDraft: true
    };

    if (saveDarDraft) {
      saveDarDraft(draftPayload);
    } else {
      if (targetDraftId && deleteDar) deleteDar(targetDraftId);
      addDar(draftPayload);
    }

    toast.success('บันทึกแบบร่างสำเร็จ');
    navigate('/dcc/dar/list');
  };

  const handleFormSubmit = (e) => {
    e.preventDefault();
    if (validate()) {
      setShowConfirm(true);
    } else {
      toast.error('กรุณากรอกข้อมูลให้ครบถ้วนและถูกต้อง');
    }
  };

  const executeSubmit = async () => {
    const activeFile = selectedFile || formData.file;
    if (!activeFile) {
      toast.error('กรุณาเลือกไฟล์ PDF ที่ต้องการอัปโหลด');
      return;
    }

    const docCode = formData.docCode || getPreviewCode();
    const fileId = `file_${Date.now()}_${activeFile.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
    const fileName = activeFile.name; // บังคับใช้ชื่อไฟล์จริงจาก OS ไม่ใช่ Title

    let attachedFile = {
      fileId: fileId,
      name: fileName,
      size: activeFile.size,
      type: activeFile.type || 'application/pdf',
      file: activeFile,
      uploadedAt: new Date().toISOString()
    };

    // 1. บันทึกลง Synchronous In-Memory Registry ทันที (Synchronous Access)
    window.__PDF_CACHE__ = window.__PDF_CACHE__ || new Map();
    window.__UPLOADED_FILES_MAP__ = window.__UPLOADED_FILES_MAP__ || new Map();
    [window.__PDF_CACHE__, window.__UPLOADED_FILES_MAP__].forEach(cache => {
      cache.set(fileId, activeFile);
      cache.set(fileName, activeFile);
      if (docCode) cache.set(docCode, activeFile);
    });

    // 2. บันทึกลง IndexedDB ควบคู่กัน
    try {
      await saveFile(fileId, activeFile);
      if (docCode) await saveFile(docCode, activeFile);
    } catch (err) {
      console.warn('saveFile error fallback:', err);
    }

    const targetDept = standardizeDepartmentCode(formData.department || currentUser?.department || 'PD');
    const dynamicSteps = generateDynamicWorkflow(currentUser, targetDept, masterUsers || [], formData.docType, approvalMatrix);

    const newDar = {
      type: 'NEW',
      title: formData.title,
      fileName: fileName, // บังคับใช้ชื่อไฟล์จริงจาก OS
      requesterId: currentUser?.id,
      requester_id: currentUser?.id,
      requester_name: currentUser?.name,
      department: targetDept,
      workflowSteps: dynamicSteps,
      date: new Date().toISOString().split('T')[0],
      submittedAt: new Date().toISOString(),
      docType: formData.docType,
      docIdInput: docCode,
      document_code: docCode,
      docCode: docCode,
      requestDetail: formData.requestDetail,
      request_detail: formData.requestDetail,
      requestReason: formData.requestReason || formData.reason || '',
      request_reason: formData.requestReason || formData.reason || '',
      reason: formData.requestReason || formData.reason || '',
      reasonDetails: formData.requestReason || formData.reason || '',
      reasonCategory: formData.reasonCategory || 'NEW_PROCESS',
      confidentialityLevel: formData.confidentialityLevel || 'INTERNAL',
      confidentiality: formData.confidentialityLevel || 'INTERNAL',
      slaPriority: formData.slaPriority || 'NORMAL',
      priority: formData.slaPriority || 'NORMAL',
      isFastTrack: Boolean(formData.isFastTrack || formData.slaPriority === 'FAST_TRACK'),
      dueDate: formData.dueDate || calculateDueDateBySla(formData.slaPriority || 'NORMAL'),
      ackRequirement: formData.ackRequirement,
      requireAck: formData.ackRequirement === 'REQUIRED',
      require_ack: formData.ackRequirement === 'REQUIRED',
      ackUserIds: formData.ackRequirement === 'REQUIRED' ? (formData.ackUserId ? [formData.ackUserId] : []) : [],
      ackUserId: formData.ackRequirement === 'REQUIRED' ? formData.ackUserId : null,
      distributions: isFormDocument ? [] : (formData.distributions || []),
      effectiveDate: formData.effectiveDate,
      effective_date: formData.effectiveDate,
      isDraft: false,
      relatedStandards: formData.relatedStandards || [],
      otherStandardDetail: formData.otherStandardDetail,
      access_control: formData.access_control,
      fileId: fileId,
      file_id: fileId,
      file: activeFile,
      fileBlob: activeFile,
      attachedFile
    };
    if (targetDraftId && deleteDar) deleteDar(targetDraftId);
    
    // ส่งทั้ง metadata และ File Object ตัวจริง
    const result = await submitDar(newDar, activeFile);
    if (!result) return; // API mode: the server refused and the reason was shown

    if (result) {
      const allocatedId = result.id || result.darNumber || result.darNo;
      if (allocatedId) {
        [window.__PDF_CACHE__, window.__UPLOADED_FILES_MAP__].forEach(cache => {
          cache.set(allocatedId, activeFile);
          if (result.darNumber) cache.set(result.darNumber, activeFile);
        });
      }
    }
    
    isSubmittedRef.current = true;
    setShowConfirm(false);
    toast.success('ยื่นคำร้อง DAR สำเร็จเรียบร้อย และส่งต่อให้ผู้ทบทวนแล้ว');
    navigate('/dcc/dar/list');
  };

  return (
    <div className="max-w-4xl mx-auto space-y-4 pb-2 w-full max-w-full h-auto">
      <div className="flex items-center justify-between px-6 py-4 bg-white border border-slate-200/80 rounded-xl shadow-2xs">
        <div className="flex items-center gap-3">
          <FileText className="w-5 h-5 text-slate-700 shrink-0" strokeWidth={1.75} />
          <div>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">ยื่นคำร้องสร้างเอกสารใหม่ (New Document DAR)</h1>
            <p className="text-xs text-slate-500 mt-0.5">ออกรหัสเอกสารฉบับใหม่และกำหนดสายการอนุมัติตามมาตรฐาน ISO 9001</p>
          </div>
        </div>
        <button onClick={() => navigate('/dar/new')} className="h-9 px-3 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors inline-flex items-center gap-1 cursor-pointer">
          <ChevronLeft size={16} /> เปลี่ยนประเภท DAR
        </button>
      </div>
      
      <form onSubmit={handleFormSubmit} noValidate className="space-y-4 h-auto">
        
        {/* ================= UNIFIED HIGH-DENSITY FORM CANVAS ================= */}
        <div className="card-surface overflow-hidden divide-y divide-[#F1F5F9] shadow-2xs">
          
          {/* Section 1: ข้อมูลผู้ร้องขอ (Compact Metadata Strip) */}
          <div className="bg-[#F8FAFC] px-5 py-3 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex flex-wrap items-center gap-4 sm:gap-6">
              <div className="flex items-center gap-2">
                <User className="text-[#0D99FF] shrink-0" size={15} />
                <span className="text-sm font-bold text-[#1E293B] hidden sm:inline">ส่วนที่ 1: ข้อมูลผู้ร้องขอ (Requester Information)</span>
                <span className="text-[#CBD5E1] hidden sm:inline">•</span>
                <label className="text-sm font-semibold text-[#64748B] flex items-center gap-1.5 cursor-default">
                  <span>ชื่อผู้ร้องขอ (Requester):</span>
                  <strong className="text-[#1E293B] font-bold text-sm">{currentUser?.name || 'ผู้ร้องขอ'}</strong>
                </label>
              </div>

              <div className="flex items-center gap-1.5">
                <label className="text-sm font-semibold text-[#64748B] flex items-center gap-1.5 cursor-default">
                  <span>แผนกต้นทาง (Department):</span>
                  <span className="px-2 py-0.5 rounded bg-white border border-[#CBD5E1] font-mono font-bold text-[#0D99FF] text-xs">
                    {currentUser?.department || 'PD'}
                  </span>
                </label>
              </div>

              <div className="flex items-center gap-1.5">
                <label className="text-sm font-semibold text-[#64748B] flex items-center gap-1.5 cursor-default">
                  <span>วันที่เปิดคำขอ (Request Date):</span>
                  <span className="font-mono text-[#334155] font-semibold text-xs">
                    {new Date().toLocaleDateString('th-TH')}
                  </span>
                </label>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[11px] font-semibold text-slate-500 bg-slate-100 px-2.5 py-0.5 rounded-full border border-slate-200">
                [ ฉบับร่าง (รอออกเลข DAR หลังส่งคำร้อง) ]
              </span>
              <div className="text-[11px] font-semibold text-[#0D99FF] bg-[#E5F4FF] px-2.5 py-0.5 rounded-full border border-[#B8E1FF]">
                ร่างคำร้อง DAR ใหม่
              </div>
            </div>
          </div>

          {/* Section 2: กำหนดรหัสและประเภทเอกสาร และวันที่มีผลบังคับใช้ (4-Column Grid) */}
          <div className="p-5 space-y-3 bg-white">
            <div className="flex items-center justify-between pb-1">
              <h3 className="font-bold text-sm text-[#1E293B] uppercase tracking-wider flex items-center gap-2">
                <Settings className="text-[#0D99FF]" size={16} />
                <span className="font-bold text-sm text-[#1E293B]">ส่วนที่ 2: กำหนดรหัสและประเภทเอกสาร และวันที่มีผลบังคับใช้</span>
              </h3>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3.5 items-start pt-1">
              {/* 1. ชนิดเอกสาร (3 Cols) */}
              <div className="lg:col-span-3">
                <label className="block text-sm font-semibold text-[#334155] mb-1.5">
                  ชนิดเอกสาร <span className="text-[#EF4444]">*</span>
                </label>
                <select 
                  value={formData.docType}
                  onChange={(e) => {
                    const val = e.target.value;
                    const typeObj = (documentTypes || []).find(t => (t.code || t.id) === val);
                    setFormData({
                      ...formData, 
                      docType: val,
                      ...(typeObj?.is_form_type || val === 'FM' ? { ackRequirement: 'NOT_REQUIRED', ackUserId: '' } : {})
                    });
                  }}
                  className={`w-full h-10.5 px-3.5 text-sm bg-white border border-[#CBD5E1] rounded-lg text-[#1E293B] focus:outline-none focus:border-[#0D99FF] focus:ring-2 focus:ring-[#0D99FF]/15 transition-all cursor-pointer ${errors.docType ? 'border-rose-400 bg-rose-50/50' : ''}`}
                >
                  <option value="">-- เลือกชนิดเอกสาร --</option>
                  {activeDocumentTypes.length > 0 ? (
                    activeDocumentTypes.map(t => {
                      const code = t.code || t.id;
                      const name = t.nameTh || t.name;
                      return <option key={code} value={code}>{name} ({code})</option>;
                    })
                  ) : (
                    <option value="" disabled>-- ไม่พบข้อมูลประเภทเอกสาร (กรุณาตั้งค่าใน Master Data) --</option>
                  )}
                </select>
                {errors.docType && <p className="text-rose-500 text-xs mt-1">{errors.docType}</p>}
              </div>

              {/* 2. ชื่อเอกสาร (4 Cols) */}
              <div className="lg:col-span-4">
                <label className="block text-sm font-semibold text-[#334155] mb-1.5">
                  ชื่อเอกสาร (ไทย / อังกฤษ) <span className="text-[#EF4444]">*</span>
                </label>
                <input 
                  type="text" 
                  placeholder="ระบุชื่อเอกสารภาษาไทย หรืออังกฤษ..."
                  value={formData.title}
                  onChange={(e) => setFormData({...formData, title: e.target.value})}
                  className={`w-full h-10.5 px-3.5 text-sm bg-white border border-[#CBD5E1] rounded-lg text-[#1E293B] placeholder:text-[#94A3B8] focus:outline-none focus:border-[#0D99FF] focus:ring-2 focus:ring-[#0D99FF]/15 transition-all ${errors.title ? 'border-rose-400 bg-rose-50/50' : ''}`}
                />
                {errors.title && <p className="text-rose-500 text-xs mt-1">{errors.title}</p>}
              </div>

              {/* 3. วันที่มีผลบังคับใช้ (3 Cols) */}
              <div className="lg:col-span-3">
                <label className="block text-sm font-semibold text-[#334155] mb-1.5">
                  วันที่มีผลบังคับใช้ (Effective Date) <span className="text-[#EF4444]">*</span>
                </label>
                <input 
                  type="date"
                  value={formData.effectiveDate}
                  min={new Date(simulatedDate || Date.now()).toISOString().split('T')[0]}
                  onChange={(e) => setFormData({...formData, effectiveDate: e.target.value})}
                  className={`w-full h-10.5 px-3.5 text-sm bg-white border border-[#CBD5E1] rounded-lg text-[#1E293B] focus:outline-none focus:border-[#0D99FF] focus:ring-2 focus:ring-[#0D99FF]/15 transition-all font-mono ${errors.effectiveDate ? 'border-rose-400 bg-rose-50/50' : ''}`}
                />
                {errors.effectiveDate && <p className="text-rose-500 text-xs mt-1">{errors.effectiveDate}</p>}
              </div>

              {/* 4. รหัสเอกสารอัตโนมัติ (2 Cols) */}
              <div className="lg:col-span-2">
                <label className="block text-sm font-semibold text-[#334155] mb-1.5">
                  รหัสเอกสารอัตโนมัติ
                </label>
                <div className="h-10.5 px-3.5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg text-sm font-mono font-bold text-[#0D99FF] flex items-center justify-between select-none">
                  <span className="truncate">{getPreviewCode()}</span>
                  <span className="text-[10px] text-[#64748B] font-sans font-normal shrink-0">Rev. 00</span>
                </div>
              </div>


            </div>
          </div>

          {/* Section 3: รายละเอียดคำร้องและข้อกำหนด (50/50 Symmetrical Equal-Height Grid) */}
          <div className="p-5 space-y-4 bg-white">
            <div className="flex items-center justify-between pb-1">
              <h3 className="font-bold text-sm text-[#1E293B] uppercase tracking-wider flex items-center gap-2">
                <FileText className="text-[#0D99FF]" size={16} />
                <span className="font-bold text-sm text-[#1E293B]">ส่วนที่ 3: รายละเอียดคำร้องและเอกสารแนบ</span>
              </h3>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
              
              {/* ================= ฝั่งซ้าย (50%): Textareas ================= */}
              <div className="flex flex-col justify-between space-y-4 h-full">
                {/* 1. วัตถุประสงค์และขอบเขตคำร้องขอ */}
                <div className="flex-1 flex flex-col">
                  <label className="block text-sm font-semibold text-[#334155] mb-1.5">
                    วัตถุประสงค์และขอบเขตคำร้องขอ (รายละเอียดคำร้องขอ) <span className="text-[#EF4444]">*</span>
                  </label>
                  <textarea 
                    rows={5}
                    value={formData.requestDetail}
                    onChange={(e) => setFormData({...formData, requestDetail: e.target.value})}
                    className={`w-full flex-1 min-h-[100px] lg:min-h-[125px] p-3.5 text-sm bg-white border border-[#CBD5E1] rounded-xl text-[#1E293B] placeholder:text-[#94A3B8] focus:outline-none focus:border-[#0D99FF] focus:ring-2 focus:ring-[#0D99FF]/15 transition-all leading-relaxed resize-none ${errors.requestDetail ? 'border-rose-400 bg-rose-50/50' : ''}`}
                    placeholder="ระบุขอบเขตและเนื้อหาสำคัญของเอกสารฉบับนี้..."
                  />
                  {errors.requestDetail && <p className="text-rose-500 text-xs mt-1">{errors.requestDetail}</p>}
                </div>

                {/* 2. เหตุผลความจำเป็นในการร้องขอ */}
                <div className="flex-1 flex flex-col">
                  <label className="block text-sm font-semibold text-[#334155] mb-1.5">
                    เหตุผลในการร้องขอ <span className="text-[#EF4444]">*</span>
                  </label>
                  <textarea 
                    rows={5}
                    required
                    value={formData.requestReason || formData.reason || ''}
                    onChange={(e) => setFormData(prev => ({
                      ...prev,
                      requestReason: e.target.value,
                      reason: e.target.value,
                      reasonDetails: e.target.value
                    }))}
                    className={`w-full flex-1 min-h-[100px] lg:min-h-[125px] p-3.5 text-sm bg-white border border-[#CBD5E1] rounded-xl text-[#1E293B] placeholder:text-[#94A3B8] focus:outline-none focus:border-[#0D99FF] focus:ring-2 focus:ring-[#0D99FF]/15 transition-all leading-relaxed resize-none ${errors.requestReason ? 'border-rose-400 bg-rose-50/50' : ''}`}
                    placeholder="ระบุเหตุผลความจำเป็นในการจัดทำ หรือการอ้างอิงข้อกำหนด ISO..."
                  />
                  {errors.requestReason && <p className="text-rose-500 text-xs mt-1">{errors.requestReason}</p>}
                </div>
              </div>

              {/* ================= ฝั่งขวา (50%): Standards, Upload & Ack Protocol ================= */}
              <div className="flex flex-col justify-between space-y-4 bg-[#F8FAFC] border border-[#E2E8F0] p-4.5 rounded-xl h-full">
                
                {/* 1. ระบบมาตรฐานที่เกี่ยวข้อง */}
                <div>
                  <RelatedStandardsSelector
                    value={{
                      relatedStandards: formData.relatedStandards,
                      otherStandardDetail: formData.otherStandardDetail
                    }}
                    onChange={(newVals) => setFormData({ ...formData, ...newVals })}
                    error={errors.otherStandardDetail}
                  />
                </div>

                {/* 2. อัปโหลดไฟล์เอกสาร (Compact Dropzone) */}
                <div>
                  <label className="block text-sm font-semibold text-[#334155] mb-1.5">
                    อัปโหลดไฟล์เอกสาร (PDF เท่านั้น) <span className="text-[#EF4444]">*</span>
                  </label>
                  <div 
                    onClick={() => {
                      const fileInput = document.getElementById('dar-pdf-file-input');
                      if (fileInput) fileInput.click();
                    }}
                    className="h-20 border-2 border-dashed border-[#CBD5E1] hover:border-[#0D99FF] rounded-xl p-3 flex items-center justify-center gap-3 bg-white hover:bg-[#F0F7FF]/40 transition-all cursor-pointer group"
                  >
                    <div className="p-2 bg-[#F1F5F9] group-hover:bg-[#E5F4FF] rounded-lg text-[#0D99FF] transition-colors shrink-0">
                      <UploadCloud size={20} />
                    </div>
                    <div className="text-left min-w-0 flex-1">
                      <p className="text-xs font-semibold text-[#1E293B] truncate">
                        {(selectedFile || formData.file) ? (selectedFile || formData.file).name : 'คลิกเพื่อเลือกไฟล์ หรือลากไฟล์มาวาง'}
                      </p>
                      <p className="text-[10px] text-[#94A3B8]">รองรับไฟล์ PDF สูงสุด 25 MB</p>
                    </div>
                    <input 
                      id="dar-pdf-file-input"
                      type="file" 
                      accept="application/pdf"
                      onChange={handleFileChange}
                      className="sr-only"
                    />
                  </div>
                  {errors.file && <p className="text-rose-500 text-xs mt-1.5">{errors.file}</p>}
                </div>

                {/* 3. การรับทราบเอกสาร */}
                <div className="pt-2 border-t border-[#E2E8F0] space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-semibold text-[#334155]">
                      การรับทราบเอกสาร <span className="text-[#EF4444]">*</span>
                    </label>
                    {formData.docType === 'FM' ? (
                      <div className="flex items-center gap-1.5 text-indigo-900 bg-[#E5F4FF]/70 px-2.5 py-1 rounded-md text-xs font-medium border border-indigo-100">
                        <ShieldAlert className="w-3.5 h-3.5 shrink-0 text-[#0D99FF]" />
                        <span>แบบฟอร์ม (FM): ไม่ต้องรับทราบ</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-4 text-xs sm:text-sm">
                        <label className="flex items-center gap-2 cursor-pointer font-medium text-[#475569]">
                          <input 
                            type="radio" 
                            name="ack" 
                            value="NOT_REQUIRED" 
                            checked={formData.ackRequirement === 'NOT_REQUIRED'} 
                            onChange={(e) => setFormData({...formData, ackRequirement: e.target.value, ackUserId: ''})} 
                            className="w-4 h-4 text-[#0D99FF] focus:ring-[#0D99FF]" 
                          />
                          <span>ไม่ต้องรับทราบ</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer font-medium text-[#475569]">
                          <input 
                            type="radio" 
                            name="ack" 
                            value="REQUIRED" 
                            checked={formData.ackRequirement === 'REQUIRED'} 
                            onChange={(e) => setFormData({...formData, ackRequirement: e.target.value})} 
                            className="w-4 h-4 text-[#0D99FF] focus:ring-[#0D99FF]" 
                          />
                          <span>ต้องรับทราบ</span>
                        </label>
                      </div>
                    )}
                  </div>

                  {formData.ackRequirement === 'REQUIRED' && formData.docType !== 'FM' && (
                    <div className={`p-3 rounded-lg border ${errors.ackUserId ? 'border-rose-300 bg-rose-50' : 'border-indigo-100 bg-white'}`}>
                      <p className="text-xs font-semibold text-[#334155] mb-1.5">เลือกผู้ที่ต้องรับทราบเอกสารนี้ (1 คน)</p>
                      <UserSelector 
                        value={formData.ackUserId} 
                        onChange={(id) => setFormData({...formData, ackUserId: id})} 
                        error={errors.ackUserId} 
                        users={(masterUsers || []).filter(u => u && u.id !== currentUser?.id && !u.isDcc && u.role !== 'DCC_ADMIN')} 
                      />
                      {errors.ackUserId && <p className="text-rose-500 text-xs mt-1">{errors.ackUserId}</p>}
                    </div>
                  )}
                </div>

              </div>

            </div>
          </div>

        </div>

        {/* Section: ระดับการเข้าถึงและความลับของเอกสาร */}
        <DocumentAccessControlSelector
          value={formData.access_control}
          onChange={(access_control) => setFormData({ ...formData, access_control })}
          ownerDept={currentUser?.department || formData?.department || 'PD'}
          masterDepartments={availableDepartments}
          masterUsers={masterUsers || []}
          workflowParticipants={workflowParticipants || []}
        />

        {/* Section: การแจกจ่ายเอกสาร */}
        {isFormDocument ? (
          <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-emerald-50/80 border border-emerald-200/70 text-emerald-900 text-xs font-medium shadow-2xs">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>แบบฟอร์มเปล่า (FM) จะพร้อมให้ดาวน์โหลดตามสิทธิ์การเข้าถึงทันทีเมื่ออนุมัติเสร็จสมบูรณ์ (Bypass การออกเล่มสำเนาควบคุม)</span>
          </div>
        ) : (
          <DistributionSetup 
            ownerDept={currentUser?.department || formData?.department || 'PD'}
            distributions={formData.distributions || []}
            onChange={(distributions) => setFormData({ ...formData, distributions })}
            documentType={formData.docType}
            accessControl={formData.access_control}
            accessScope={formData.access_control?.scope}
            targetDepartments={formData.access_control?.authorized_depts || formData.access_control?.targetDepartments || []}
          />
        )}

        {/* Action Buttons */}
        <div className="card-surface p-4 mt-6 flex items-center justify-end gap-3 shadow-2xs">
          <Button 
            variant="ghost"
            type="button" 
            onClick={() => navigate('/dashboard')}
          >
            <X size={15} className="mr-1"/> ยกเลิก (Cancel)
          </Button>
          <Button 
            variant="secondary"
            type="button" 
            onClick={handleDraft}
          >
            บันทึกแบบร่าง (Draft)
          </Button>
          <Button 
            variant="primary"
            type="submit" 
          >
            ส่งคำขอ (Submit DAR)
          </Button>
        </div>
      </form>

      {(() => {
        const selectedDocTypeObj = (documentTypes || []).find(t => (t.code || t.id) === formData.docType);
        const targetDept = formData.department || currentUser?.department || 'PD';
        const dynamicSteps = generateDynamicWorkflow(currentUser, targetDept, masterUsers || [], formData.docType, approvalMatrix);
        const step2 = dynamicSteps.find(s => s.role === 'REVIEWER');
        const resolvedReviewerObj = (masterUsers || []).find(u => u && (u.id === step2?.userId || u.userId === step2?.userId));

        return (
          <ConfirmRegistrationModal
            isOpen={showConfirm}
            onClose={() => setShowConfirm(false)}
            onConfirm={executeSubmit}
            title="ยืนยันการส่งคำร้องขอขึ้นทะเบียนเอกสารใหม่ (Confirm New Document Registration)"
            actionType="submit"
            confirmText="ยืนยันการส่งคำร้องขอ"
            cancelText="ยกเลิก / กลับไปแก้ไข"
            summaryData={[
              {
                label: 'ผู้ร้องขอ / แผนก',
                value: (
                  <div className="flex items-center gap-1.5 text-xs text-slate-800 font-medium">
                    <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                    <span>{currentUser?.name || 'ผู้ร้องขอ'} • แผนก {currentUser?.department || 'PD'}</span>
                  </div>
                )
              },
              {
                label: 'รหัสเอกสาร',
                value: (
                  <span className="font-mono text-xs font-semibold px-2.5 py-1 bg-white text-blue-600 border border-blue-200 rounded-lg shadow-2xs">
                    {getPreviewCode()}
                  </span>
                )
              },
              {
                label: 'ชนิดเอกสาร',
                value: (
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-md bg-slate-100/90 text-slate-700 border border-slate-200 text-xs font-medium">
                    {selectedDocTypeObj?.nameTh || formData.docType} ({formData.docType})
                  </span>
                )
              },
              {
                label: 'ชื่อเอกสาร',
                value: formData.title
              },
              {
                label: 'รายละเอียดคำร้องขอ',
                value: formData.requestDetail
              },
              {
                label: 'เหตุผลการร้องขอ',
                value: formData.requestReason
              },
              {
                label: 'มาตรฐานที่เกี่ยวข้อง',
                value: (
                  <div className="flex flex-wrap gap-1.5 pt-0.5 break-words leading-normal">
                    {(formData.relatedStandards || []).length > 0 ? (
                      formData.relatedStandards.map((std, idx) => (
                        <span key={idx} className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100/80 text-slate-700 border border-slate-200 whitespace-nowrap">
                          {std === 'อื่น ๆ (Others)' ? `อื่นๆ: ${formData.otherStandardDetail || '-'}` : std}
                        </span>
                      ))
                    ) : (
                      <span className="text-slate-500 text-xs break-words leading-normal">ระเบียบปฏิบัติการทั่วไป (General Operation)</span>
                    )}
                  </div>
                )
              },
              {
                label: 'ระดับชั้นความลับ',
                value: (() => {
                  const scopeMeta = ACCESS_SCOPE_METADATA[formData.access_control?.scope || 'GENERAL'] || ACCESS_SCOPE_METADATA.GENERAL || { label: 'ทั่วไป (General)', badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
                  return (
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="bg-emerald-50 text-emerald-700 border border-emerald-200/80 text-xs px-2.5 py-0.5 rounded-full inline-flex items-center gap-1 font-medium">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        {scopeMeta.label}
                      </span>
                      {formData.access_control?.scope === 'TARGETED' && (
                        <span className="text-xs text-slate-500 font-mono">
                          ({(formData.access_control?.authorized_depts || []).join(', ')})
                        </span>
                      )}
                      {formData.access_control?.scope === 'RESTRICTED' && (
                        <span className="text-xs text-slate-500 font-mono">
                          (Min Level: {formData.access_control?.min_access_level || 4})
                        </span>
                      )}
                    </div>
                  );
                })()
              },
              {
                label: 'ไฟล์เอกสารแนบ',
                value: (selectedFile || formData.file) ? (
                  <div className="flex items-center justify-between p-2.5 px-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50/80 transition-colors w-full min-w-0">
                    <div className="flex items-center gap-2 min-w-0 mr-2">
                      <FileText size={16} className="text-rose-500 shrink-0" />
                      <span className="truncate text-xs font-medium text-slate-800" title={(selectedFile || formData.file).name}>
                        {(selectedFile || formData.file).name}
                      </span>
                    </div>
                    <span className="text-[11px] font-mono text-slate-400 ml-2 whitespace-nowrap shrink-0">
                      {(((selectedFile || formData.file).size) / (1024 * 1024)).toFixed(2)} MB
                    </span>
                  </div>
                ) : (
                  <div className="p-2.5 px-3 rounded-xl border border-slate-200 bg-slate-50 text-slate-400 text-xs">
                    ไม่มีไฟล์แนบ
                  </div>
                )
              },
              {
                label: 'จุดใช้งานและแผนกแจกจ่าย',
                value: isFormDocument ? (
                  <div className="flex items-center gap-2 p-2.5 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-medium">
                    <CheckCircle2 size={15} className="text-emerald-600 shrink-0" />
                    <span>แบบฟอร์มเปล่า (FM) ดิจิทัล - Bypass การออกเล่มสำเนาควบคุม</span>
                  </div>
                ) : (() => {
                  const allocs = calculateCopyAllocations(currentUser?.department || formData?.department || 'PD', formData.distributions || []);
                  const allList = allocs?.allAllocations || [];
                  const defaultCopyData = {
                    copyNo: 'Copy 01',
                    locationName: 'QC Office',
                    location: 'QC Office',
                    department: currentUser?.department || formData?.department || 'QC',
                    dept: currentUser?.department || formData?.department || 'QC',
                    locationDetail: '(สำนักงานประกันและควบคุมคุณภาพ)'
                  };
                  const distributionList = allList.length > 0 ? allList : [defaultCopyData];

                  return (
                    <div className="space-y-2">
                      {distributionList.map((item, idx) => {
                        const copyNum = item.copyNo 
                          ? (String(item.copyNo).startsWith('Copy') ? item.copyNo : `Copy ${item.copyNo}`)
                          : `Copy ${String(idx + 1).padStart(2, '0')}`;
                        const locName = cleanLocationName(item.locationName || item.station_name || item.name || item.location || 'QC Office');
                        const deptTag = item.department || item.dept || item.departmentId || currentUser?.department || 'QC';
                        const locDetail = item.locationDetail || item.fullLocationName || (item.dept_name ? `(${item.dept_name})` : '(สำนักงานประกันและควบคุมคุณภาพ)');

                        return (
                          <div 
                            key={idx} 
                            className="flex items-start gap-2.5 p-2.5 bg-slate-50 border border-slate-200/90 rounded-xl hover:bg-slate-100/60 transition-colors min-w-0"
                          >
                            {/* Copy Badge */}
                            <span className="shrink-0 px-2 py-0.5 rounded-md text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200/80">
                              {copyNum}
                            </span>

                            {/* Location & Dept Content */}
                            <div className="flex-1 min-w-0 space-y-0.5">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-xs font-bold text-slate-800 break-words line-clamp-2">
                                  {locName}
                                </span>
                                <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/70 shrink-0">
                                  {deptTag}
                                </span>
                              </div>
                              
                              {/* Subtitle / รายละเอียดจุดติดตั้ง */}
                              <div className="flex items-center gap-1 text-[11px] text-slate-500 min-w-0">
                                <MapPin className="w-3 h-3 text-slate-400 shrink-0"/>
                                <span className="truncate">
                                  {locDetail}
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()
              },
              {
                label: 'ขั้นตอนถัดไป / ผู้มีอำนาจทบทวน',
                value: `ส่งต่อให้: ${resolvedReviewerObj ? `${resolvedReviewerObj.name} (${resolvedReviewerObj.position || resolvedReviewerObj.department || 'Reviewer'})` : 'ผู้ทบทวนตามสายงาน (Reviewer Level 2)'}`
              }
            ]}
          />
        );
      })()}
    </div>
  );
};

export default DarNewForm;
