import React, { useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import useStore from '../../store/useStore';
import toast from 'react-hot-toast';

/**
 * Route Guard for Role-Based Access Control (RBAC)
 * @param {Object} props
 * @param {React.ReactNode} props.children
 * @param {boolean} [props.requireDcc=false] - Requires DCC staff or DCC admin
 * @param {boolean} [props.requireAdmin=false] - Requires DCC admin or Super admin
 * @param {string} [props.redirectPath='/dcc/dashboard'] - Target path on denial
 * @param {string} [props.deniedToastMessage] - Custom toast message when access is denied
 */
export const ProtectedRoute = ({
  children,
  requireDcc = false,
  requireAdmin = false,
  redirectPath = '/dcc/dashboard',
  deniedToastMessage
}) => {
  const currentUser = useStore(state => state.currentUser);
  const location = useLocation();

  const isDccUser = Boolean(
    currentUser?.isDcc || 
    currentUser?.role === 'DCC_ADMIN' || 
    currentUser?.role === 'DCC_STAFF'
  );

  const isDccAdmin = Boolean(
    currentUser?.role === 'DCC_ADMIN' || 
    currentUser?.role === 'SUPER_ADMIN' || 
    currentUser?.isDcc
  );

  let isAllowed = true;
  let fallbackMessage = 'คุณไม่มีสิทธิ์เข้าถึงหน้านี้';

  if (requireAdmin) {
    if (!isDccAdmin) {
      isAllowed = false;
      fallbackMessage = deniedToastMessage || 'คุณไม่มีสิทธิ์เข้าถึงศูนย์จัดการข้อมูลหลัก';
    }
  } else if (requireDcc) {
    if (!isDccUser) {
      isAllowed = false;
      fallbackMessage = deniedToastMessage || 'คุณไม่มีสิทธิ์เข้าถึงศูนย์ควบคุมงาน DCC';
    }
  }

  useEffect(() => {
    if (!isAllowed) {
      toast.error(fallbackMessage, { id: 'rbac-denied-toast' });
    }
  }, [isAllowed, fallbackMessage]);

  if (!isAllowed) {
    return <Navigate to={redirectPath} replace state={{ unauthorized: true, from: location }} />;
  }

  return children;
};

export default ProtectedRoute;
