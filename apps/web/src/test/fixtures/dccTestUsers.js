export const TEST_PERSONAS = {
  GENERAL_USER: {
    id: 'T_U001', name: 'General User', role: 'USER', isDcc: false,
    depts: ['PC'], departmentMemberships: [{ departmentId: 'PC', positionLevel: 1, isActive: true }]
  },
  DOCUMENT_OWNER: {
    id: 'T_U002', name: 'Document Owner', role: 'USER', isDcc: false,
    depts: ['PD'], departmentMemberships: [{ departmentId: 'PD', positionLevel: 3, isActive: true }]
  },
  DEPT_SUPERVISOR: {
    id: 'T_U003', name: 'Department Supervisor', role: 'USER', isDcc: false,
    depts: ['PD'], departmentMemberships: [{ departmentId: 'PD', positionLevel: 4, isActive: true }]
  },
  ASST_DEPT_MANAGER: {
    id: 'T_U004', name: 'Asst. Dept Manager', role: 'USER', isDcc: false,
    depts: ['PD'], departmentMemberships: [{ departmentId: 'PD', positionLevel: 5, isActive: true }]
  },
  QAQC_MONITOR: {
    id: 'T_U005', name: 'QAQC Monitor', role: 'USER', isDcc: true,
    depts: ['QA'], departmentMemberships: [{ departmentId: 'QA', positionLevel: 2, isActive: true }]
  },
  DCC_ADMIN: {
    id: 'T_U006', name: 'DCC Admin', role: 'DCC_ADMIN', isDcc: true,
    depts: ['QA'], departmentMemberships: [{ departmentId: 'QA', positionLevel: 4, isActive: true }]
  },
  MULTI_DEPT_USER: {
    id: 'T_U007', name: 'Multi Dept User', role: 'USER', isDcc: false,
    depts: ['PD', 'WH'], 
    departmentMemberships: [
      { departmentId: 'PD', positionLevel: 4, isActive: true },
      { departmentId: 'WH', positionLevel: 1, isActive: true }
    ]
  },
  UNRELATED_DEPT: {
    id: 'T_U008', name: 'Unrelated User', role: 'USER', isDcc: false,
    depts: ['MKT'], departmentMemberships: [{ departmentId: 'MKT', positionLevel: 6, isActive: true }]
  },
  DISTRIBUTION_ONLY: {
    id: 'T_U009', name: 'Distribution Only', role: 'USER', isDcc: false,
    depts: ['HR&GA'], departmentMemberships: [{ departmentId: 'HR&GA', positionLevel: 2, isActive: true }]
  },
  INACTIVE_MEMBERSHIP: {
    id: 'T_U010', name: 'Inactive User', role: 'USER', isDcc: false,
    depts: ['PD'], departmentMemberships: [{ departmentId: 'PD', positionLevel: 4, isActive: false }]
  }
};
