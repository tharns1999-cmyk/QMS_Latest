import React, { useState, useMemo } from 'react';
import { 
  CheckCircle, 
  AlertTriangle, 
  XCircle, 
  FileText, 
  ArrowRight, 
  X, 
  Loader2, 
  Send,
  Building2,
  FileCheck,
  RotateCcw
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'react-hot-toast';

/**
 * @typedef {Object} SummaryItem
 * @property {string} label
 * @property {React.ReactNode} value
 */

/**
 * Helper to extract raw text content from React node or string
 */
const extractTextContent = (node) => {
  if (node === undefined || node === null) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(extractTextContent).join(' ');
  if (node.props) {
    if (node.props.children) return extractTextContent(node.props.children);
  }
  return '';
};

/**
 * ActionConfirmModal - Sleek Progressive Card Dialog for modern SaaS (Linear / Vercel style)
 *
 * @param {Object} props
 * @param {boolean} props.isOpen
 * @param {() => void} props.onClose
 * @param {() => void} props.onConfirm
 * @param {string} props.title
 * @param {'submit' | 'approve' | 'reject' | 'obsolete' | 'acknowledge' | 'distribute'} props.actionType
 * @param {SummaryItem[]} props.summaryData
 * @param {boolean} [props.requireTypeToConfirm=false]
 * @param {boolean} [props.isLoading=false]
 * @param {string} [props.confirmText]
 * @param {string} [props.cancelText]
 */
const ActionConfirmModal = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  actionType = 'submit',
  summaryData = [],
  summaryItems = null, // backward compatibility
  requireTypeToConfirm = false,
  isLoading = false,
  confirmText,
  cancelText,
  confirmLabel, // backward compatibility
  confirmButtonClass,
  dar = null,
  currentActor = null,
  currentStep = null,
  workflowSignatories = null
}) => {
  const [typedConfirmation, setTypedConfirmation] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Normalized items
  const items = useMemo(() => {
    return (summaryData && summaryData.length > 0) ? summaryData : (summaryItems || []);
  }, [summaryData, summaryItems]);


  const handleConfirmClick = async () => {
    if (isSubmitting || isSuccess) return;
    setIsSubmitting(true);
    try {
      if (onConfirm) {
        await onConfirm();
      }
      setIsSuccess(true);
      setTimeout(() => {
        if (onClose) onClose();
      }, 500);
    } catch (err) {
      console.error('ActionConfirmModal onConfirm error:', err);
      toast.error(err?.message || 'เกิดข้อผิดพลาด ไม่สามารถดำเนินการได้ กรุณาลองใหม่อีกครั้ง');
    } finally {
      setIsSubmitting(false);
    }
  };

  const isObsolete = useMemo(() => {
    return Boolean(
      dar?.type === 'OBSOLETE' || 
      dar?.darType === 'OBSOLETE' || 
      dar?.type === 'CANCEL' || 
      dar?.requestType === 'OBSOLETE' ||
      actionType === 'obsolete' ||
      (typeof title === 'string' && (title.includes('ยกเลิก') || title.includes('Obsolete') || title.includes('OBSOLETE'))) ||
      (typeof confirmText === 'string' && (confirmText.includes('ยกเลิก') || confirmText.includes('Obsolete')))
    );
  }, [dar, actionType, title, confirmText]);

  const approvalNextStep = useMemo(() => {
    return isObsolete ? {
      title: 'ส่งมอบงานต่อให้ Document Control Center (DCC)',
      description: 'เพื่อดำเนินการปลดระวาง เรียกคืนสำเนาควบคุมทั้งหมดในระบบ และบันทึกผลการทำลายตามระเบียบ (Recall & Disposition)',
      boxClass: 'bg-rose-50/60 border-rose-200/80 text-rose-900',
      iconBg: 'bg-rose-600 text-white',
      buttonText: 'ยืนยันการอนุมัติยกเลิกเอกสาร',
      buttonClass: 'bg-rose-600 hover:bg-rose-700 text-white'
    } : {
      title: 'ส่งมอบงานต่อให้ Document Control Center (DCC)',
      description: 'เพื่อดำเนินการขึ้นทะเบียน ประทับตรา และแจกจ่ายสำเนาควบคุมตามระเบียบ',
      boxClass: 'bg-blue-50/60 border-blue-200/80 text-blue-900',
      iconBg: 'bg-blue-600 text-white',
      buttonText: 'ยืนยันการอนุมัติเอกสาร',
      buttonClass: 'bg-emerald-600 hover:bg-emerald-700 text-white'
    };
  }, [isObsolete]);

  const getActionTheme = () => {
    switch (actionType) {
      case 'review':
        return {
          icon: <CheckCircle className="w-5 h-5 text-indigo-600" />,
          btn: 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm shadow-indigo-600/20 active:scale-[0.98]',
          confirmDefault: 'ยืนยันผ่านการทบทวน',
          badgeBg: 'bg-indigo-50 text-indigo-700 border-indigo-200/80',
          accentBorder: 'border-indigo-200/60'
        };
      case 'approve':
        if (isObsolete) {
          return {
            icon: <CheckCircle className="w-5 h-5 text-rose-600" />,
            btn: approvalNextStep.buttonClass,
            confirmDefault: approvalNextStep.buttonText,
            badgeBg: 'bg-rose-50 text-rose-700 border-rose-200/80',
            accentBorder: 'border-rose-200/60'
          };
        }
        return {
          icon: <CheckCircle className="w-5 h-5 text-emerald-600" />,
          btn: 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm shadow-emerald-600/20 active:scale-[0.98]',
          confirmDefault: 'ยืนยันการอนุมัติเอกสาร',
          badgeBg: 'bg-emerald-50 text-emerald-700 border-emerald-200/80',
          accentBorder: 'border-emerald-200/60'
        };
      case 'reject':
        return {
          icon: <XCircle className="w-5 h-5 text-rose-600" />,
          btn: 'bg-rose-600 hover:bg-rose-500 text-white shadow-sm shadow-rose-600/20 active:scale-[0.98]',
          confirmDefault: 'ยืนยันการไม่อนุมัติ / ส่งกลับแก้ไข',
          badgeBg: 'bg-rose-50 text-rose-700 border-rose-200/80',
          accentBorder: 'border-rose-200/60'
        };
      case 'obsolete':
        return {
          icon: <AlertTriangle className="w-5 h-5 text-rose-600" />,
          btn: approvalNextStep.buttonClass,
          confirmDefault: (currentStep === 'APPROVER' || currentStep === 'approver' || (typeof title === 'string' && title.includes('อนุมัติ'))) ? 'ยืนยันการอนุมัติยกเลิกเอกสาร' : 'ยืนยันการยกเลิกเอกสาร',
          badgeBg: 'bg-rose-50 text-rose-700 border-rose-200/80',
          accentBorder: 'border-rose-200/60'
        };
      case 'acknowledge':
        return {
          icon: <CheckCircle className="w-5 h-5 text-blue-600" />,
          btn: 'bg-blue-600 hover:bg-blue-500 text-white shadow-sm shadow-blue-600/20 active:scale-[0.98]',
          confirmDefault: 'รับทราบและยอมรับ',
          badgeBg: 'bg-blue-50 text-blue-700 border-blue-200/80',
          accentBorder: 'border-blue-200/60'
        };
      case 'distribute':
        return {
          icon: <Send className="w-5 h-5 text-blue-600" />,
          btn: 'bg-blue-600 hover:bg-blue-500 text-white shadow-sm shadow-blue-600/20 active:scale-[0.98]',
          confirmDefault: 'ยืนยันการแจกจ่ายสำเนา',
          badgeBg: 'bg-blue-50 text-blue-700 border-blue-200/80',
          accentBorder: 'border-blue-200/60'
        };
      case 'submit':
      default:
        return {
          icon: <FileText className="w-5 h-5 text-blue-600" />,
          btn: 'bg-blue-600 hover:bg-blue-700 text-white shadow-xs shadow-blue-500/20 active:scale-[0.98]',
          confirmDefault: 'ยืนยันการส่งคำร้องขอ',
          badgeBg: 'bg-blue-50 text-blue-700 border-blue-200/80',
          accentBorder: 'border-blue-200/60'
        };
    }
  };

  const theme = getActionTheme();
  const isTypeConfirmed = !requireTypeToConfirm || typedConfirmation.trim().toUpperCase() === 'CONFIRM';
  const isConfirmDisabled = isLoading || isSubmitting || !isTypeConfirmed || isSuccess;

  // Partition items into structured sections
  const categorized = useMemo(() => {
    let docCodeItem = null;
    let docTitleItem = null;
    let revItem = null;
    let nextStepItem = null;
    const detailItems = [];
    const metadataItems = [];

    items.forEach((item) => {
      const label = item.label || '';
      const textVal = extractTextContent(item.value);

      // Doc Code
      if (
        !docCodeItem &&
        (label.includes('รหัสเอกสาร') || label.includes('รหัสคำร้อง') || label.includes('เอกสารที่ขอยกเลิก') || label.includes('Doc No') || label.includes('Document Code'))
      ) {
        docCodeItem = item;
      }
      // Next Step / Signatory
      else if (
        !nextStepItem &&
        (label.includes('ขั้นตอนถัดไป') || label.includes('สายการอนุมัติ') || label.includes('ผู้มีอำนาจทบทวน') || label.includes('ส่งต่อไปยัง') || label.includes('Next Step'))
      ) {
        nextStepItem = item;
      }
      // Revision change
      else if (
        !revItem &&
        (label.includes('การเปลี่ยนแปลงฉบับ') || label.includes('ฉบับที่จะยกเลิก') || label.includes('ฉบับที่') || label.includes('Revision'))
      ) {
        revItem = item;
      }
      // Document Title
      else if (
        !docTitleItem &&
        (label.includes('ชื่อเอกสาร') || label.includes('ชื่อเอกสารฉบับใหม่') || label.includes('Document Name') || label.includes('Title'))
      ) {
        docTitleItem = item;
      }
      // Combined document field (e.g. "[SOP-QA-01] Work Instruction...")
      else if (!docCodeItem && (label.includes('เอกสาร') || label.includes('เอกสารที่ขอยกเลิก')) && textVal.startsWith('[')) {
        const match = textVal.match(/^\[(.*?)\]\s*(.*)$/);
        if (match) {
          docCodeItem = { label: 'รหัสเอกสาร', value: match[1] };
          if (!docTitleItem && match[2]) {
            docTitleItem = { label: 'ชื่อเอกสาร', value: match[2] };
          }
        } else {
          docCodeItem = item;
        }
      }
      // Detail or summary callout blocks (Unified Purpose & Justification)
      else if (
        label.includes('รายละเอียด') ||
        label.includes('เหตุผล') ||
        label.includes('วัตถุประสงค์') ||
        label.includes('สรุปการแก้ไข') ||
        label.includes('ผลกระทบ') ||
        label.includes('ความเห็นประกอบ')
      ) {
        detailItems.push(item);
      }
      // Standard metadata
      else {
        metadataItems.push(item);
      }
    });

    return {
      docCodeItem,
      docTitleItem,
      revItem,
      nextStepItem,
      detailItems,
      detailItem: detailItems[0] || null, // backward compatibility
      metadataItems
    };
  }, [items]);

  // Workflow Signatories List (Harmonized)
  const workflowList = useMemo(() => {
    const list = workflowSignatories || dar?.approvalWorkflow || dar?.workflowSignatories;
    return (list && Array.isArray(list)) ? list : [];
  }, [workflowSignatories, dar]);

  // Infer effective current step & current actor
  const effectiveCurrentStep = useMemo(() => {
    if (currentStep) return String(currentStep).toUpperCase();
    if (actionType === 'approve' || (typeof title === 'string' && title.includes('อนุมัติ'))) return 'APPROVER';
    if (actionType === 'review' || (typeof title === 'string' && title.includes('ทบทวน'))) return 'REVIEWER';
    if (actionType === 'submit') return 'REQUESTER';
    if (items.some(i => i.label && i.label.includes('ผู้อนุมัติ'))) return 'APPROVER';
    if (items.some(i => i.label && i.label.includes('ผู้ทบทวน'))) return 'REVIEWER';
    return null;
  }, [currentStep, actionType, title, items]);

  const currentActorInfo = useMemo(() => {
    if (currentActor) {
      return {
        id: currentActor.id || currentActor.empId || null,
        name: currentActor.name || currentActor.fullName || null
      };
    }
    const actorItem = items.find(i => i.label && (i.label.includes('ผู้อนุมัติ') || i.label.includes('ผู้ทบทวน') || i.label.includes('ผู้ดำเนินการ')));
    if (actorItem) {
      const text = extractTextContent(actorItem.value);
      const nameMatch = text.match(/^(.*?)\s*\(/);
      return { id: null, name: nameMatch ? nameMatch[1].trim() : text.trim() };
    }
    return { id: null, name: null };
  }, [currentActor, items]);

  // คำนวณขั้นตอนถัดไป (Next Signatory / Workflow Destination) พร้อมป้องกัน Self-Targeting
  const calculatedNextWorkflowStep = useMemo(() => {
    if (workflowList.length === 0) return null;

    // ถ้าขั้นตอนปัจจุบันคือ APPROVER (ผู้อนุมัติ)
    if (effectiveCurrentStep === 'APPROVER') {
      const approverIndex = workflowList.findIndex(s => 
        s.roleKey === 'APPROVER' || 
        (currentActorInfo.id && s.id === currentActorInfo.id) ||
        (currentActorInfo.name && (s.name === currentActorInfo.name || s.assignedTo === currentActorInfo.name))
      );

      const subsequent = approverIndex >= 0 
        ? workflowList.slice(approverIndex + 1)
        : workflowList.filter(s => s.roleKey !== 'REQUESTER' && s.roleKey !== 'REVIEWER' && s.roleKey !== 'APPROVER');

      // ตรวจสอบว่ามีขั้นตอน DCC หรือไม่
      const dcc = subsequent.find(s => 
        s.roleKey === 'DCC' || 
        s.roleKey === 'DCC_ADMIN' || 
        s.role === 'DCC' || 
        (typeof s.role === 'string' && s.role.toUpperCase().includes('DCC'))
      );

      if (dcc) {
        return {
          type: 'DCC',
          title: approvalNextStep.title,
          subtitle: approvalNextStep.description,
          description: approvalNextStep.description,
          name: dcc.name || dcc.assignedTo || 'Document Control Center (DCC)',
          role: isObsolete ? 'เรียกคืนสำเนาและทำลาย' : 'DCC'
        };
      }

      // ตรวจสอบว่ามีผู้พิจารณาขั้นต่อไปที่ไม่ใช่ตัวเองหรือไม่ (Strictly prevent self-targeting)
      const otherNext = subsequent.find(s => 
        (!currentActorInfo.id || s.id !== currentActorInfo.id) &&
        (!currentActorInfo.name || (s.name !== currentActorInfo.name && s.assignedTo !== currentActorInfo.name))
      );

      if (otherNext) {
        return {
          type: 'SIGNATORY',
          title: 'ส่งต่อเพื่อพิจารณาขั้นถัดไป',
          name: otherNext.name || otherNext.assignedTo || 'ผู้พิจารณาขั้นถัดไป',
          role: otherNext.role || ''
        };
      }

      // ผู้อนุมัติเป็นขั้นตอนสุดท้าย (Approver is the absolute final step)
      return {
        type: 'COMPLETED',
        title: 'สิ้นสุดขั้นตอนการอนุมัติ (Approval Completed)',
        subtitle: 'เอกสารจะถูกปรับสถานะเป็น "มีผลบังคับใช้ (Active)" ทันที',
        name: 'Approval Completed',
        role: 'มีผลบังคับใช้ (Active)'
      };
    }

    // ถ้าขั้นตอนปัจจุบันคือ REVIEWER (ผู้ทบทวน) -> ขั้นต่อไปคือ APPROVER
    if (effectiveCurrentStep === 'REVIEWER') {
      const approverStep = workflowList.find(s => 
        s.roleKey === 'APPROVER' &&
        (!currentActorInfo.id || s.id !== currentActorInfo.id) &&
        (!currentActorInfo.name || (s.name !== currentActorInfo.name && s.assignedTo !== currentActorInfo.name))
      );
      if (approverStep) {
        return {
          type: 'SIGNATORY',
          title: 'ส่งต่อเพื่อพิจารณาขั้นถัดไป',
          name: approverStep.name || approverStep.assignedTo || 'ผู้อนุมัติ (Approver)',
          role: approverStep.role || 'Approver'
        };
      }
    }

    // ถ้าขั้นตอนปัจจุบันคือ REQUESTER -> ขั้นต่อไปคือ REVIEWER
    if (effectiveCurrentStep === 'REQUESTER') {
      const reviewerStep = workflowList.find(s => s.roleKey === 'REVIEWER');
      if (reviewerStep) {
        return {
          type: 'SIGNATORY',
          title: 'ส่งต่อเพื่อพิจารณาขั้นถัดไป',
          name: reviewerStep.name || reviewerStep.assignedTo || 'ผู้ทบทวน (Reviewer)',
          role: reviewerStep.role || 'Reviewer'
        };
      }
    }

    return null;
  }, [workflowList, effectiveCurrentStep, currentActorInfo, approvalNextStep, isObsolete]);

  // Helper to parse Next Step actor details
  const nextActorData = useMemo(() => {
    const rawVal = categorized.nextStepItem?.value;
    const rawText = rawVal ? extractTextContent(rawVal) : '';

    if (!categorized.nextStepItem && !calculatedNextWorkflowStep) return null;

    // 1. ตรวจสอบการตีกลับ (RETURN) หรือ ไม่อนุมัติ (REJECT)
    if (rawText.includes('สิ้นสุดคำร้อง:') || rawText.includes('สิ้นสุดกระบวนการคำร้อง') || rawText.includes('ส่งเข้าคลังประวัติ')) {
      return {
        type: 'REJECTED',
        title: 'สิ้นสุดกระบวนการคำร้อง',
        subtitle: 'คำร้องจะถูกปฏิเสธและส่งเข้าคลังประวัติ (ไม่อนุมัติ)',
        name: rawText.replace(/.*(?:สิ้นสุดคำร้อง|สิ้นสุดกระบวนการคำร้อง):\s*/, '').trim() || 'ส่งเข้าคลังประวัติ (ไม่อนุมัติ)',
        role: 'Rejected',
        originalValue: rawVal
      };
    }

    if (rawText.includes('ส่งกลับไปยัง:') || rawText.includes('ส่งกลับเพื่อดำเนินการแก้ไข') || rawText.includes('แก้ไขคำร้อง')) {
      return {
        type: 'RETURNED',
        title: 'ส่งกลับเพื่อดำเนินการแก้ไข',
        subtitle: 'ส่งกลับไปยัง: ผู้ร้องขอ (แก้ไขคำร้อง)',
        name: rawText.replace(/.*ส่งกลับไปยัง:\s*/, '').trim() || 'ผู้ร้องขอ (แก้ไขคำร้อง)',
        role: 'Revision Required',
        originalValue: rawVal
      };
    }

    // 2. ตรวจสอบข้อความชัดเจนจาก summaryData
    if (rawText.includes('ส่งมอบงานต่อให้ Document Control Center') || rawText.includes('ส่งมอบงานต่อให้ DCC') || rawText.includes('Document Control Center (DCC)')) {
      return {
        type: 'DCC',
        title: approvalNextStep.title,
        subtitle: approvalNextStep.description,
        description: approvalNextStep.description,
        name: 'Document Control Center (DCC)',
        role: isObsolete ? 'เรียกคืนสำเนาและทำลาย' : 'ขึ้นทะเบียนและแจกจ่ายสำเนาควบคุม',
        originalValue: rawVal
      };
    }

    if (rawText.includes('สิ้นสุดขั้นตอนการอนุมัติ') || rawText.includes('Approval Completed') || rawText.includes('มีผลบังคับใช้ (Active)')) {
      return {
        type: 'COMPLETED',
        title: 'สิ้นสุดขั้นตอนการอนุมัติ (Approval Completed)',
        subtitle: 'เอกสารจะถูกปรับสถานะเป็น "มีผลบังคับใช้ (Active)" ทันที',
        name: 'Approval Completed',
        role: 'มีผลบังคับใช้ (Active)',
        originalValue: rawVal
      };
    }

    // 3. ผลลัพธ์จาก workflow resolution
    if (calculatedNextWorkflowStep) {
      if (calculatedNextWorkflowStep.type === 'DCC') {
        return {
          type: 'DCC',
          title: calculatedNextWorkflowStep.title,
          subtitle: calculatedNextWorkflowStep.subtitle,
          name: calculatedNextWorkflowStep.name,
          role: calculatedNextWorkflowStep.role,
          originalValue: rawVal
        };
      }
      if (calculatedNextWorkflowStep.type === 'COMPLETED') {
        return {
          type: 'COMPLETED',
          title: calculatedNextWorkflowStep.title,
          subtitle: calculatedNextWorkflowStep.subtitle,
          name: calculatedNextWorkflowStep.name,
          role: calculatedNextWorkflowStep.role,
          originalValue: rawVal
        };
      }
      if (calculatedNextWorkflowStep.type === 'SIGNATORY') {
        const name = calculatedNextWorkflowStep.name;
        const role = calculatedNextWorkflowStep.role;
        const initials = (name && name.length > 0) ? name.trim().substring(0, 1) : 'ผ';
        return {
          type: 'SIGNATORY',
          title: calculatedNextWorkflowStep.title,
          name,
          role,
          initials,
          originalValue: rawVal
        };
      }
    }

    // 4. Fallback parsing จาก rawText
    let title = 'ส่งต่อเพื่อพิจารณาขั้นถัดไป';
    let name = rawText;
    let role = '';

    if (rawText.includes('ส่งต่อไปยัง:')) {
      name = rawText.replace(/.*ส่งต่อไปยัง:\s*/, '').trim();
    } else if (rawText.includes('ส่งต่อให้:')) {
      name = rawText.replace(/.*ส่งต่อให้:\s*/, '').trim();
    }

    const parenMatch = name.match(/^(.*?)\s*\((.*?)\)$/);
    if (parenMatch) {
      name = parenMatch[1];
      role = parenMatch[2];
    }

    // ป้องกัน Self-Targeting fallback: ถ้าชื่อตรงกับ Actor ตัวเอง ไม่ส่งต่อให้ตัวเอง
    if (currentActorInfo.name && (name === currentActorInfo.name || name.includes(currentActorInfo.name))) {
      if (effectiveCurrentStep === 'APPROVER') {
        return {
          type: 'COMPLETED',
          title: 'สิ้นสุดขั้นตอนการอนุมัติ (Approval Completed)',
          subtitle: 'เอกสารจะถูกปรับสถานะเป็น "มีผลบังคับใช้ (Active)" ทันที',
          name: 'Approval Completed',
          role: 'มีผลบังคับใช้ (Active)',
          originalValue: rawVal
        };
      }
    }

    const initials = (name && name.length > 0) ? name.trim().substring(0, 1) : 'ผ';
    return {
      type: 'SIGNATORY',
      title,
      name: name || 'ผู้พิจารณาขั้นถัดไป',
      role,
      initials,
      originalValue: rawVal
    };
  }, [categorized.nextStepItem, calculatedNextWorkflowStep, currentActorInfo, effectiveCurrentStep, approvalNextStep, isObsolete]);

  // Helper to render values with proper typography
  const renderItemValue = (item) => {
    if (item.value === undefined || item.value === null || item.value === '') return '-';

    // If string represents a revision transition (e.g. Rev.00 ➔ Rev.01 or 00 -> 01)
    if (typeof item.value === 'string' && (item.value.includes('➔') || item.value.includes('->') || item.value.includes('→'))) {
      const parts = item.value.split(/\s*(?:➔|->|→)\s*/);
      if (parts.length === 2) {
        const fromRev = parts[0].trim();
        const toRev = parts[1].trim();
        return (
          <div className="flex items-center gap-1.5 font-mono text-xs font-semibold">
            <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded border border-slate-200">
              {fromRev.startsWith('Rev') ? fromRev : `Rev.${fromRev}`}
            </span>
            <ArrowRight className="w-3 h-3 text-slate-400 shrink-0" />
            <span className="bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded border border-emerald-200/80 font-bold">
              {toRev.startsWith('Rev') ? toRev : `Rev.${toRev}`}
            </span>
          </div>
        );
      }
    }

    return item.value;
  };

  // Parse title into main heading and subtext if contains parentheses
  const titleParts = useMemo(() => {
    if (typeof title !== 'string') return { main: title, sub: null };
    const match = title.match(/^(.*?)\s*(\(.*?\))$/);
    if (match) {
      return { main: match[1], sub: match[2] };
    }
    return { main: title, sub: null };
  }, [title]);

  const hasHeroSection = !!(categorized.docCodeItem || categorized.docTitleItem || categorized.revItem);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 overflow-hidden">
      {/* 1. Backdrop มืดเนียนตา ไม่มีจังหวะวูบ */}
      <div 
        onClick={isLoading || isSubmitting ? undefined : onClose}
        className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs transition-opacity animate-in fade-in duration-150"
      />

      {/* 2. Dialog Box เด้งขึ้นนุ่มนวล เริ่มเล่น Animation ทันที */}
      <div 
        className="relative w-full max-w-2xl max-h-[90vh] bg-white rounded-2xl border border-slate-200/80 shadow-2xl overflow-hidden flex flex-col z-10 animate-in fade-in zoom-in-95 duration-150 ease-out"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Strip */}
            <div className="px-6 pt-5 pb-4 border-b border-slate-100 flex items-center justify-between shrink-0 bg-white">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-slate-50 border border-slate-200/70 flex items-center justify-center shrink-0">
                  {theme.icon}
                </div>
                <div className="min-w-0">
                  <h2 className="text-base font-bold tracking-tight text-slate-900 leading-snug break-words flex flex-wrap items-baseline gap-1.5">
                    <span>{titleParts.main}</span>
                    {titleParts.sub && (
                      <span className="text-xs font-normal text-slate-500">
                        {titleParts.sub}
                      </span>
                    )}
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5 font-normal">
                    กรุณาตรวจสอบรายละเอียดสรุปก่อนดำเนินการยืนยัน
                  </p>
                </div>
              </div>
              <button 
                type="button"
                onClick={onClose}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors shrink-0 ml-2 outline-none cursor-pointer"
                disabled={isLoading || isSubmitting}
                title="ปิดหน้าต่าง"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body - Clean single scrollable area */}
            <div className="overflow-y-auto flex-1 p-0 custom-scrollbar divide-y divide-slate-100">
              {/* Hero Document Identity Card */}
              {hasHeroSection && (
                <div className="mx-6 mt-4 p-4 rounded-xl bg-slate-50/70 border border-slate-200/80 mb-3 flex items-start gap-3.5">
                  <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 border border-blue-200/60 flex items-center justify-center shrink-0 mt-0.5 shadow-2xs">
                    <FileText size={18} strokeWidth={2} />
                  </div>
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      {categorized.docCodeItem && (
                        <div className="flex items-center gap-2">
                          {React.isValidElement(categorized.docCodeItem.value) ? (
                            categorized.docCodeItem.value
                          ) : (
                            <span className="font-mono text-xs font-semibold px-2.5 py-1 bg-white text-blue-600 border border-blue-200 rounded-lg shadow-2xs">
                              {renderItemValue(categorized.docCodeItem)}
                            </span>
                          )}
                        </div>
                      )}
                      {categorized.revItem && (
                        <div className="flex items-center">
                          {renderItemValue(categorized.revItem)}
                        </div>
                      )}
                    </div>

                    {categorized.docTitleItem && (
                      <h3 className="text-base font-semibold text-slate-900 leading-snug break-words break-all">
                        {renderItemValue(categorized.docTitleItem)}
                      </h3>
                    )}
                  </div>
                </div>
              )}

              {/* Compact Spec-Sheet Grid (2-Column Key-Value) */}
              {categorized.metadataItems.length > 0 && (
                <div className="px-6 py-2 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3.5 text-xs">
                  {categorized.metadataItems.map((item, idx) => (
                    <div key={idx} className="space-y-1 min-w-0">
                      <p className="text-slate-400 font-medium text-[11px] tracking-wide">
                        {item.label}
                      </p>
                      <div className="text-slate-800 font-medium break-words leading-normal min-w-0">
                        {renderItemValue(item)}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Unified Purpose & Justification Callout */}
              {(categorized.detailItems?.length > 0 || categorized.detailItem) && (
                <div className="px-6 py-2">
                  <div className="bg-slate-50/60 border border-slate-200/80 rounded-xl p-3.5 mt-2 space-y-3">
                    {(categorized.detailItems?.length > 0 ? categorized.detailItems : [categorized.detailItem]).map((item, idx) => (
                      <div key={idx} className={idx > 0 ? "pt-2.5 border-t border-slate-200/60" : ""}>
                        <p className="text-xs font-medium text-slate-500 mb-1 flex items-center gap-1.5">
                          <FileText size={13} className="text-slate-400 shrink-0" />
                          <span>{item.label}</span>
                        </p>
                        <div className="text-xs text-slate-700 leading-relaxed break-words whitespace-pre-wrap pl-3 border-l-2 border-slate-300/70">
                          {renderItemValue(item)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Next Signatory / Pathway Card (Dynamic Presentation) */}
              {nextActorData && (
                <div className={`mx-6 my-4 p-3 rounded-xl border flex items-center justify-between text-xs transition-all ${
                  nextActorData.type === 'COMPLETED'
                    ? 'bg-emerald-50/70 border-emerald-200/80 text-emerald-900'
                    : nextActorData.type === 'DCC'
                      ? (isObsolete ? approvalNextStep.boxClass : 'bg-blue-50/70 border-blue-200/80 text-blue-900')
                      : nextActorData.type === 'REJECTED'
                        ? 'bg-rose-50/70 border-rose-200/80 text-rose-900'
                        : nextActorData.type === 'RETURNED'
                          ? 'bg-amber-50/70 border-amber-200/80 text-amber-900'
                          : 'bg-blue-50/60 border-blue-100 text-slate-900'
                }`}>
                  <div className="flex items-center gap-3 min-w-0">
                    {/* Left Icon / Avatar */}
                    {nextActorData.type === 'COMPLETED' ? (
                      <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-xs shrink-0">
                        <CheckCircle size={18} strokeWidth={2.2} />
                      </div>
                    ) : nextActorData.type === 'DCC' ? (
                      <div className={`w-9 h-9 rounded-xl ${isObsolete ? approvalNextStep.iconBg : 'bg-blue-600 text-white'} flex items-center justify-center shadow-xs shrink-0`}>
                        <Building2 size={18} strokeWidth={2} />
                      </div>
                    ) : nextActorData.type === 'REJECTED' ? (
                      <div className="w-9 h-9 rounded-xl bg-rose-600 text-white flex items-center justify-center shadow-xs shrink-0">
                        <XCircle size={18} strokeWidth={2} />
                      </div>
                    ) : nextActorData.type === 'RETURNED' ? (
                      <div className="w-9 h-9 rounded-xl bg-amber-600 text-white flex items-center justify-center shadow-xs shrink-0">
                        <RotateCcw size={18} strokeWidth={2} />
                      </div>
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-[13px] shadow-xs shrink-0">
                        {nextActorData.initials}
                      </div>
                    )}

                    <div className="min-w-0">
                      <p className={`text-[11px] font-semibold mb-0.5 ${
                        nextActorData.type === 'COMPLETED'
                          ? 'text-emerald-800'
                          : nextActorData.type === 'DCC'
                            ? (isObsolete ? 'text-rose-900 font-bold' : 'text-blue-900')
                            : nextActorData.type === 'REJECTED'
                              ? 'text-rose-800'
                              : nextActorData.type === 'RETURNED'
                                ? 'text-amber-800'
                                : 'text-blue-600'
                      }`}>
                        {nextActorData.title}
                      </p>

                      {nextActorData.subtitle ? (
                        <p className={`text-xs ${
                          nextActorData.type === 'COMPLETED'
                            ? 'text-emerald-700 font-medium'
                            : nextActorData.type === 'DCC'
                              ? (isObsolete ? 'text-rose-800 font-medium' : 'text-blue-700 font-medium')
                              : 'text-slate-600'
                        }`}>
                          {nextActorData.subtitle}
                        </p>
                      ) : React.isValidElement(nextActorData.originalValue) && nextActorData.originalValue.props?.['data-testid'] ? (
                        nextActorData.originalValue
                      ) : (
                        <p className="text-slate-900 font-semibold text-[13px] truncate">
                          {nextActorData.name} 
                          {nextActorData.role && (
                            <span className="text-slate-500 font-normal ml-1.5 text-[11px]">
                              ({nextActorData.role})
                            </span>
                          )}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Right Status / Action Icon */}
                  <div className={`w-8 h-8 rounded-full bg-white border flex items-center justify-center shadow-xs shrink-0 ${
                    nextActorData.type === 'COMPLETED'
                      ? 'border-emerald-200 text-emerald-600'
                      : nextActorData.type === 'DCC'
                        ? (isObsolete ? 'border-rose-200 text-rose-600' : 'border-blue-200 text-blue-600')
                        : nextActorData.type === 'REJECTED'
                          ? 'border-rose-200 text-rose-600'
                          : nextActorData.type === 'RETURNED'
                            ? 'border-amber-200 text-amber-600'
                            : 'border-blue-100 text-blue-600'
                  }`}>
                    {nextActorData.type === 'COMPLETED' ? (
                      <CheckCircle className="w-4 h-4" strokeWidth={2.2} />
                    ) : nextActorData.type === 'DCC' ? (
                      <FileCheck className="w-4 h-4" strokeWidth={2} />
                    ) : (
                      <Send className="w-4 h-4 relative -left-px mt-px" strokeWidth={2} />
                    )}
                  </div>
                </div>
              )}

              {/* Type to Confirm Guardrail (Obsolete / Critical Actions) */}
              {requireTypeToConfirm && (
                <div className="p-5 mx-6 my-3 rounded-xl border border-rose-200 bg-rose-50/30 space-y-2.5">
                  <label className="block text-xs font-semibold text-rose-800">
                    นี่เป็นการดำเนินการสำคัญ กรุณาพิมพ์{' '}
                    <span className="select-all bg-rose-100 px-1.5 py-0.5 rounded font-mono font-bold text-rose-900">
                      CONFIRM
                    </span>{' '}
                    เพื่อยืนยัน:
                  </label>
                  <input
                    type="text"
                    value={typedConfirmation}
                    onChange={(e) => setTypedConfirmation(e.target.value)}
                    placeholder="พิมพ์ CONFIRM"
                    className="w-full px-3 py-2 text-xs border border-rose-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-200 transition-all font-mono uppercase bg-white text-slate-900"
                    disabled={isLoading}
                  />
                </div>
              )}
            </div>

            {/* Action Footer Buttons (Linear-Grade Polish) */}
            <div className="px-6 py-4 bg-slate-50/50 border-t border-slate-100 flex items-center justify-end gap-3 shrink-0">
              <button
                type="button"
                onClick={onClose}
                className="text-xs font-medium text-slate-600 hover:text-slate-900 px-4 py-2.5 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer outline-none"
                disabled={isLoading || isSuccess}
              >
                {cancelText || 'ยกเลิก / กลับไปแก้ไข'}
              </button>
              <button
                type="button"
                onClick={handleConfirmClick}
                disabled={isConfirmDisabled}
                className={`text-xs font-medium px-5 py-2.5 rounded-xl shadow-xs transition-all flex items-center justify-center gap-1.5 min-w-[140px] cursor-pointer outline-none ${
                  isConfirmDisabled
                    ? 'opacity-50 cursor-not-allowed bg-slate-100 text-slate-400 border border-slate-200 shadow-none'
                    : (confirmButtonClass || (isObsolete && actionType === 'approve' ? approvalNextStep.buttonClass : theme.btn))
                }`}
              >
                <AnimatePresence mode="wait" initial={false}>
                  {isSuccess ? (
                    <motion.div
                      key="success"
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      transition={{ duration: 0.15 }}
                    >
                      <CheckCircle className="w-4 h-4 text-white" />
                    </motion.div>
                  ) : (isLoading || isSubmitting) ? (
                    <motion.div
                      key="loading"
                      initial={{ opacity: 0, y: 3 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -3 }}
                      className="flex items-center gap-1.5 text-white"
                    >
                      <Loader2 className="animate-spin h-3.5 w-3.5 text-current" strokeWidth={2} />
                      กำลังประมวลผล...
                    </motion.div>
                  ) : (
                    <motion.span
                      key="text"
                      initial={{ opacity: 0, y: -3 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 3 }}
                      className="flex items-center gap-1.5"
                    >
                      {confirmLabel || confirmText || theme.confirmDefault}
                    </motion.span>
                  )}
                </AnimatePresence>
              </button>
        </div>
      </div>
    </div>
  );
};

export default ActionConfirmModal;

