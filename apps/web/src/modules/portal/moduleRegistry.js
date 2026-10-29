import { Library, Wrench } from 'lucide-react';

export const MODULE_STATUS = {
  ACTIVE: 'ACTIVE',
  COMING_SOON: 'COMING_SOON'
};

export const isUserAuthorizedForModule = (module, user) => {
  if (!module) return false;
  if (!module.allowedDepartments && !module.dccOnly) return true;
  if (!user) return false;
  if (user.isDcc || user.isQmr) return true;
  if (Array.isArray(module.allowedDepartments)) {
    const userDepts = [user.department, ...(user.depts || [])]
      .filter(Boolean)
      .map((d) => String(d).toUpperCase());
    return module.allowedDepartments.some((d) => userDepts.includes(d.toUpperCase()));
  }
  if (module.dccOnly) {
    return Boolean(user.isDcc);
  }
  return true;
};

export const moduleRegistry = [
  {
    moduleId: 'dcc',
    name: 'ระบบควบคุมเอกสาร (DCC)',
    description: 'Document control, DAR, document library, external documents, periodic review, controlled copy.',
    status: MODULE_STATUS.ACTIVE,
    route: '/dcc',
    icon: Library,
    permission: 'DCC_ACCESS', // Not strictly checked here, handled at route level or by checking if user has any access
    order: 1
  },
  {
    moduleId: 'vcc',
    name: 'VCC (Verify and Calibration Center)',
    description: 'ศูนย์ควบคุมการทวนสอบและสอบเทียบเครื่องมือวัด ทะเบียนเครื่องมือ กลุ่มเครื่องมือ และประวัติการแก้ไข',
    status: MODULE_STATUS.ACTIVE,
    route: '/vcc',
    icon: Wrench,
    allowedDepartments: ['DC', 'QC', 'QA'],
    order: 2
  }
];
