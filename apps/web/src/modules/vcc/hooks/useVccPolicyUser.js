import { useMemo } from 'react';
import { isApiMode } from '../../../api/client';
import { useModuleAccess } from '../../../shared/components/ModuleAccessProvider';

// UI hints come from the same server response as the portal; every write is still checked by the API.
export default function useVccPolicyUser(user) {
  const { modules } = useModuleAccess();
  const module = modules?.find((m) => m.moduleId === 'vcc');
  return useMemo(() => !isApiMode || !user ? user : {
    ...user,
    vccDepartments: (module?.departments || []).map((d) => d.department),
    vccEnabledDepartments: (module?.departments || []).filter((d) => d.enabled && d.department_status === 'ACTIVE').map((d) => d.department),
    vccReadOnly: module?.status !== 'ACTIVE'
  }, [user, module]);
}
