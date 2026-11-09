import { isApiMode } from '../../api/client';
import { useModuleAccess } from '../../shared/components/ModuleAccessProvider';
import React, { useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import useStore from '../../store/useStore';
import toast from 'react-hot-toast';
import { isSystemAdmin } from '../../modules/admin/adminAccess';

/**
 * Route Guard for Role-Based Access Control (RBAC)
 * @param {Object} props
 * @param {React.ReactNode} props.children
 * @param {boolean} [props.requireDcc=false] - Requires DCC staff or DCC admin
 * @param {boolean} [props.requireVcc=false] - Requires VCC authorized staff (DCC, QC, QA, QMR)
 * @param {string[]} [props.allowedDepartments=null] - Allowed department codes
 * @param {boolean} [props.requireAdmin=false] - Requires a system administrator (isSystemAdmin); DCC staff are not admins
 * @param {string} [props.redirectPath='/dcc/dashboard'] - Target path on denial
 * @param {string} [props.deniedToastMessage] - Custom toast message when access is denied
 */
export const ProtectedRoute = ({
  children,
  requireDcc = false,
  requireVcc = false,
  requireModuleManage = false,
  allowedDepartments = null,
  requireAdmin = false,
  redirectPath = '/dcc/dashboard',
  deniedToastMessage
}) => {
  const currentUser = useStore(state => state.currentUser);
  const location = useLocation();
  const moduleAccess = useModuleAccess();
  const vcc = moduleAccess.modules?.find((m) => m.moduleId === 'vcc');

  const isDccUser = Boolean(
    currentUser?.isDcc || 
    currentUser?.role === 'DCC_ADMIN' || 
    currentUser?.role === 'DCC_STAFF'
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

  const isVccUser = isApiMode ? Boolean(vcc?.allowed) : Boolean(
    currentUser?.isDcc ||
    currentUser?.isQmr ||
    Number(currentUser?.approval_level || currentUser?.level || 0) >= 6 ||
    userDepts.some((d) => ['DC', 'QC', 'QA', 'MGT', 'LB'].includes(d))
  );

  let isAllowed = true;
  let fallbackMessage = 'คุณไม่มีสิทธิ์เข้าถึงหน้านี้';

  if (requireModuleManage) {
    isAllowed = !isApiMode || Boolean(vcc?.canManage);
    fallbackMessage = 'ต้องได้รับมอบหมายสิทธิ์จัดการระบบย่อย';
  } else if (requireAdmin) {
    if (!isSystemAdmin(currentUser)) {
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
      fallbackMessage = deniedToastMessage || 'เฉพาะผู้ใช้งานแผนก DCC, QC, QA, MGT และ LB เท่านั้นที่สามารถเข้าใช้งาน VCC ได้';
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
    if (!isAllowed && !(isApiMode && moduleAccess.loading && (requireVcc || requireModuleManage))) {
      toast.error(fallbackMessage, { id: 'rbac-denied-toast' });
    }
  }, [isAllowed, fallbackMessage, moduleAccess.loading, requireVcc, requireModuleManage]);

  if (isApiMode && (requireVcc || requireModuleManage) && moduleAccess.loading) return <p role="status" className="p-6">กำลังตรวจสอบสิทธิ์ระบบย่อย…</p>;
  if (isApiMode && (requireVcc || requireModuleManage) && moduleAccess.error) return <p role="alert" className="p-6 text-red-700">{moduleAccess.error}</p>;
  if (isApiMode && requireVcc && vcc?.allowed && !vcc.canEnter) return <section className="space-y-3 p-6"><h1 className="text-xl font-semibold">{vcc.status === 'MAINTENANCE' ? 'VCC กำลังปรับปรุงระบบ' : 'VCC ปิดใช้งานชั่วคราว'}</h1><p>{vcc.maintenance_message || 'กรุณาติดต่อผู้ดูแลระบบ'}</p><a href="/portal" className="text-indigo-700 underline">กลับพอร์ทัล</a></section>;
  if (isApiMode && requireVcc && vcc?.taskOnly && !location.pathname.startsWith('/vcc/tasks')) return <section className="space-y-3 p-6"><h1 className="text-xl font-semibold">สิทธิ์สำหรับงานที่ได้รับมอบหมาย</h1><p>คุณเข้าถึงแผนที่ได้รับมอบหมายผ่านหน้างานที่ต้องดำเนินการได้</p><a href="/vcc/tasks" className="text-indigo-700 underline">ไปงานที่ต้องดำเนินการ</a></section>;
  if (!isAllowed) {
    return <Navigate to={redirectPath} replace state={{ unauthorized: true, from: location }} />;
  }

  return requireVcc && isApiMode && vcc?.status === 'READ_ONLY' ? <><p role="status" className="mb-4 rounded-xl bg-blue-50 p-4 text-sm text-blue-800">VCC เปิดให้อ่านอย่างเดียว ขณะนี้ไม่สามารถบันทึกหรืออนุมัติข้อมูลได้</p>{children}</> : children;
};

export default ProtectedRoute;
