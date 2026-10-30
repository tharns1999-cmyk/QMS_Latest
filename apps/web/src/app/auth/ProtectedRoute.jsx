import React, { useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import useStore from '../../store/useStore';
import toast from 'react-hot-toast';

/**
 * Route Guard for Role-Based Access Control (RBAC)
 * @param {Object} props
 * @param {React.ReactNode} props.children
 * @param {boolean} [props.requireDcc=false] - Requires DCC staff or DCC admin
 * @param {boolean} [props.requireVcc=false] - Requires VCC authorized staff (DCC, QC, QA, QMR)
 * @param {string[]} [props.allowedDepartments=null] - Allowed department codes
 * @param {boolean} [props.requireAdmin=false] - Requires DCC admin or Super admin
 * @param {string} [props.redirectPath='/dcc/dashboard'] - Target path on denial
 * @param {string} [props.deniedToastMessage] - Custom toast message when access is denied
 */
export const ProtectedRoute = ({
  children,
  requireDcc = false,
  requireVcc = false,
  allowedDepartments = null,
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

  const userDepts = [
    currentUser?.department,
    currentUser?.dept,
    currentUser?.primary_department,
    ...(Array.isArray(currentUser?.depts) ? currentUser.depts : []),
    ...(Array.isArray(currentUser?.departments) ? currentUser.departments : []),
    ...(Array.isArray(currentUser?.secondaryDepartments) ? currentUser.secondaryDepartments : []),
    ...(Array.isArray(currentUser?.affiliated_departments) ? currentUser.affiliated_departments : [])
  ]
    .filter(Boolean)
    .map((d) => String(d).toUpperCase());

  const isVccUser = Boolean(
    currentUser?.isDcc ||
    currentUser?.isQmr ||
    Number(currentUser?.approval_level || currentUser?.level || 0) >= 6 ||
    userDepts.some((d) => ['DC', 'QC', 'QA'].includes(d))
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
  } else if (requireVcc) {
    if (!isVccUser) {
      isAllowed = false;
      fallbackMessage = deniedToastMessage || 'เฉพาะผู้ใช้งานแผนก DCC, QC และ QA เท่านั้นที่สามารถเข้าใช้งาน VCC ได้';
    }
  } else if (Array.isArray(allowedDepartments) && allowedDepartments.length > 0) {
    const isDeptAllowed = currentUser?.isDcc || currentUser?.isQmr ||
      userDepts.some((d) => allowedDepartments.map((ad) => ad.toUpperCase()).includes(d));
    if (!isDeptAllowed) {
      isAllowed = false;
      fallbackMessage = deniedToastMessage || 'คุณไม่มีสิทธิ์เข้าถึงหน้านี้';
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
