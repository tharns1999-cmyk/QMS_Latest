import { Library, Wrench } from 'lucide-react';

export const MODULE_STATUS = {
  ACTIVE: 'ACTIVE',
  COMING_SOON: 'COMING_SOON'
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
    dccOnly: true,
    order: 2
  }
];
