import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { apiGet, isApiMode } from '../../api/client';

const ModuleAccessContext = createContext({ modules: null, loading: false, error: '', refresh: async () => {} });
export const useModuleAccess = () => useContext(ModuleAccessContext);

export default function ModuleAccessProvider({ userId, children }) {
  const [state, setState] = useState({ modules: null, userId: null, loading: true, error: '' });
  const currentId = useRef(userId);
  currentId.current = userId;
  const refresh = useCallback(async () => {
    if (!isApiMode || !userId) return;
    try {
      const data = await apiGet('/api/modules');
      if (currentId.current === userId) setState({ ...data, userId, loading: false, error: '' });
    } catch (err) {
      if (currentId.current === userId) setState({ modules: null, userId, loading: false, error: err.message });
    }
  }, [userId]);
  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, 30000);
    window.addEventListener('focus', refresh);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, [refresh]);
  const value = state.userId === userId ? state : { modules: null, loading: true, error: '' };
  return <ModuleAccessContext.Provider value={{ ...value, refresh }}>{children}</ModuleAccessContext.Provider>;
}
