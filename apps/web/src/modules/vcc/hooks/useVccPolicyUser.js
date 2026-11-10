import { useMemo } from 'react';
import { isApiMode } from '../../../api/client';
import { useModuleAccess } from '../../../shared/components/ModuleAccessProvider';
import useStore from '../../../store/useStore';

// UI hints come from the same server response as the portal; every write is still checked by the API.
export default function useVccPolicyUser(user) {
  const { modules } = useModuleAccess();
  const storeEnabledDepts = useStore((s) => s.vccEnabledDepartments);
  const storeModuleStatus = useStore((s) => s.vccModuleStatus);
  const module = modules?.find((m) => m.moduleId === 'vcc');

  return useMemo(() => {
    if (!user) return user;
    if (isApiMode && module) {
      return {
        ...user,
        vccDepartments: (module?.departments || []).map((d) => d.department),
        vccEnabledDepartments: (module?.departments || []).filter((d) => d.enabled && d.department_status === 'ACTIVE').map((d) => d.department),
        vccReadOnly: module?.status !== 'ACTIVE'
      };
    }

    // Demo Mode / Local Storage fallback
    let enabledDepts = storeEnabledDepts;
    if (!enabledDepts || !Array.isArray(enabledDepts)) {
      try {
        const stored = localStorage.getItem('qms_vcc_enabled_departments');
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed)) enabledDepts = parsed;
        }
      } catch {
        enabledDepts = null;
      }
    }
    if (!enabledDepts || !Array.isArray(enabledDepts)) {
      enabledDepts = ['DC', 'QC', 'QA', 'MGT', 'LB'];
    }

    let currentStatus = storeModuleStatus;
    if (!currentStatus) {
      try {
        currentStatus = localStorage.getItem('qms_vcc_module_status');
      } catch {
        currentStatus = null;
      }
    }
    if (!currentStatus) {
      currentStatus = module?.status || 'ACTIVE';
    }

    return {
      ...user,
      vccDepartments: enabledDepts,
      vccEnabledDepartments: enabledDepts,
      vccReadOnly: currentStatus !== 'ACTIVE'
    };
  }, [user, module, storeEnabledDepts, storeModuleStatus]);
}

