import { Library } from 'lucide-react';

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
  }
];
