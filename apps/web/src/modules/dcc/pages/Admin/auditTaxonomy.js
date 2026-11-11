import { 
  Activity, 
  FileCheck, 
  Layers, 
  Globe, 
  Calendar, 
  Wrench, 
  CalendarDays, 
  CheckCircle2, 
  Settings 
} from 'lucide-react';

/**
 * Single Source of Truth for Audit Trail Modules & Taxonomy
 */
export const AUDIT_MODULES = [
  { id: 'ALL', label: 'ทุกโมดูล' },
  { id: 'DCC', label: 'DCC (ควบคุมเอกสาร)' },
  { id: 'VCC', label: 'VCC (สอบเทียบ/ทวนสอบ)' },
  { id: 'SYSTEM', label: 'ระบบและความปลอดภัย' }
];

export const AUDIT_TAXONOMY = {
  ALL: {
    id: 'ALL',
    label: 'ทุกโมดูล',
    categories: []
  },
  DCC: {
    id: 'DCC',
    label: 'DCC (ควบคุมเอกสาร)',
    categories: [
      { id: 'ALL', label: 'ทั้งหมดใน DCC', icon: Activity },
      { id: 'DAR', label: 'คำร้อง DAR', icon: FileCheck },
      { id: 'CONTROLLED_COPY', label: 'สำเนาควบคุม', icon: Layers },
      { id: 'EXTERNAL_DOCS', label: 'เอกสารภายนอก', icon: Globe },
      { id: 'PERIODIC_REVIEW', label: 'ทบทวนตามรอบ', icon: Calendar }
    ]
  },
  VCC: {
    id: 'VCC',
    label: 'VCC (สอบเทียบ/ทวนสอบ)',
    categories: [
      { id: 'ALL', label: 'ทั้งหมดใน VCC', icon: Activity },
      { id: 'VCC_ASSET', label: 'เครื่องมือวัด', icon: Wrench },
      { id: 'VCC_PLAN', label: 'แผนสอบเทียบ', icon: CalendarDays },
      { id: 'VCC_WO', label: 'ใบสั่งงาน/บันทึกผล', icon: CheckCircle2 }
    ]
  },
  SYSTEM: {
    id: 'SYSTEM',
    label: 'ระบบและความปลอดภัย',
    categories: [
      { id: 'ALL', label: 'ทั้งหมดในระบบ', icon: Activity },
      { id: 'SYSTEM', label: 'ตั้งค่า/ความปลอดภัย', icon: Settings }
    ]
  }
};

/**
 * Predicate to match a log entry with the selected module
 */
export const matchesAuditModule = (log, selectedModule) => {
  if (!selectedModule || selectedModule === 'ALL') return true;
  if (selectedModule === 'SYSTEM') {
    return log.category === 'SYSTEM' || log.module === 'SYSTEM';
  }
  if (selectedModule === 'DCC') {
    return log.module === 'DCC' && log.category !== 'SYSTEM';
  }
  if (selectedModule === 'VCC') {
    return log.module === 'VCC';
  }
  return log.module === selectedModule;
};

/**
 * Predicate to match a log entry with the selected category
 */
export const matchesAuditCategory = (log, selectedCategory) => {
  if (!selectedCategory || selectedCategory === 'ALL') return true;
  return log.category === selectedCategory;
};
