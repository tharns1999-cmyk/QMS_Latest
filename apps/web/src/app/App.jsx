import React, { useEffect, Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useParams, useLocation } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import useStore from '../store/useStore';
import Layout from './layout/Layout';
import SLAEngine from '../modules/dcc/components/SLAEngine';
import ProtectedRoute from './auth/ProtectedRoute';
import ApiSessionGate from './auth/ApiSessionGate';
import { isApiMode } from '../api/client';

// [Safe Cache Maintenance: รันตอน Boot เพื่อเคลียร์ Temporary Cache ที่บวมเกิน 1.5MB โดยไม่แตะต้อง Vault หลัก]
(() => {
  try {
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key !== 'qms-enterprise-storage' && key !== 'qms-storage-vault') {
        const val = localStorage.getItem(key);
        if (val && val.length > 1.5 * 1024 * 1024) {
          keysToRemove.push(key);
        }
      }
    }
    keysToRemove.forEach(k => {
      console.warn(`[Auto-Purge] Removing bloated temporary cache key: ${k}`);
      localStorage.removeItem(k);
    });
  } catch (e) {
    console.error('Storage cleanup check failed', e);
  }
})();
// --- Lazy Load Pages ---

// Portal
const PortalLandingPage = lazy(() => import('../modules/portal/pages/PortalLandingPage'));

// DCC Dashboard
const Dashboard = lazy(() => import('../modules/dcc/pages/Dashboard/Dashboard'));

// DCC DAR Workflow
const DarSelection = lazy(() => import('../modules/dcc/pages/DarWorkflow/DarSelection'));
const DarNewForm = lazy(() => import('../modules/dcc/pages/DarWorkflow/DarNewForm'));
const DarRevisionForm = lazy(() => import('../modules/dcc/pages/DarWorkflow/DarRevisionForm'));
const DarObsoleteForm = lazy(() => import('../modules/dcc/pages/DarWorkflow/DarObsoleteForm'));
const DarList = lazy(() => import('../modules/dcc/pages/DarWorkflow/DarList'));
const DarDetail = lazy(() => import('../modules/dcc/pages/DarWorkflow/DarDetail'));

// DCC Library
const Library = lazy(() => import('../modules/dcc/pages/Library/Library'));
const LibraryDetail = lazy(() => import('../modules/dcc/pages/Library/LibraryDetail'));
const Viewer = lazy(() => import('../modules/dcc/pages/Library/Viewer'));

// DCC Admin & Master List
const Reports = lazy(() => import('../modules/dcc/pages/Admin/Reports'));
const ActionLog = lazy(() => import('../modules/dcc/pages/Admin/ActionLog'));
const MasterDataHub = lazy(() => import('../modules/dcc/pages/Admin/MasterDataHub'));
const ControlledCopyRegister = lazy(() => import('../modules/dcc/pages/ControlledCopy/ControlledCopyRegister'));
const ExternalDocsList = lazy(() => import('../modules/dcc/pages/ExternalDocs/ExternalDocsList'));
const MyExternalRequests = lazy(() => import('../modules/dcc/pages/ExternalDocs/MyExternalRequests'));
const ExternalRequestDetail = lazy(() => import('../modules/dcc/pages/ExternalDocs/ExternalRequestDetail'));

// DCC Tasks
const TaskInbox = lazy(() => import('../modules/dcc/pages/Tasks/TaskInbox'));
const TaskReview = lazy(() => import('../modules/dcc/pages/Tasks/TaskReview'));
const TaskApprove = lazy(() => import('../modules/dcc/pages/Tasks/TaskApprove'));
const TaskAck = lazy(() => import('../modules/dcc/pages/Tasks/TaskAck'));
const TaskRevise = lazy(() => import('../modules/dcc/pages/Tasks/TaskRevise'));
const TaskApproveReplacement = lazy(() => import('../modules/dcc/pages/Tasks/TaskApproveReplacement'));
const TaskConfirmHardcopyReceipt = lazy(() => import('../modules/dcc/pages/Tasks/TaskConfirmHardcopyReceipt'));

// DCC Periodic Reviews
const PeriodicReviewDashboard = lazy(() => import('../modules/dcc/pages/PeriodicReviews/PeriodicReviewDashboard'));
const PeriodicReviewDetail = lazy(() => import('../modules/dcc/pages/PeriodicReviews/PeriodicReviewDetail'));

// Placeholders
const AdminHealth = lazy(() => import('../modules/dcc/pages/Placeholders').then(m => ({ default: m.AdminHealth })));
const NotFound = lazy(() => import('../modules/dcc/pages/Placeholders').then(m => ({ default: m.NotFound })));
const DistributionDemo = lazy(() => import('../modules/dcc/pages/Placeholders/DistributionDemo'));


// --- Helper Components ---

const SuspenseLoader = () => (
  <div className="flex-1 flex flex-col items-center justify-center h-full min-h-[400px]">
    <div className="w-8 h-8 border-4 border-zinc-200 border-t-zinc-900 rounded-full animate-spin"></div>
    <p className="mt-4 text-sm text-zinc-500 font-medium">Loading module...</p>
  </div>
);

const withSuspense = (Component) => (
  <Suspense fallback={<SuspenseLoader />}>
    <Component />
  </Suspense>
);

export const AliasRedirect = ({ to }) => {
  const params = useParams();
  const location = useLocation();
  let resolvedPath = to;
  Object.keys(params).forEach(key => {
    resolvedPath = resolvedPath.replace(`:${key}`, params[key]);
  });
  const search = location.search || '';
  return <Navigate to={`${resolvedPath}${search}`} replace state={location.state} />;
};

function App() {
  const hydrateMasterData = useStore(state => state.hydrateMasterData);
  const initializePeriodicReviews = useStore(state => state.initializePeriodicReviews);
  const checkScheduledEffectiveDocs = useStore(state => state.checkScheduledEffectiveDocs);

  useEffect(() => {
    // โหลดข้อมูลลายเซ็นและ Master Data ที่เคยแก้ไขกลับคืนมาทันทีที่เปิดแอป (Blueprint B)
    hydrateMasterData?.();
    initializePeriodicReviews();
    checkScheduledEffectiveDocs?.();
    useStore.getState().syncPeriodicReviewSchedulesAndTasks?.();
  }, [hydrateMasterData, initializePeriodicReviews, checkScheduledEffectiveDocs]);

  const app = (
    <BrowserRouter>

      <Toaster position="top-right" />
      <SLAEngine />
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route path="portal" element={withSuspense(PortalLandingPage)} />
          
          <Route path="dcc">
            <Route index element={<Navigate to="dashboard" replace />} />
            <Route path="dashboard" element={withSuspense(Dashboard)} />

            <Route path="dar/new" element={withSuspense(DarSelection)} />
            <Route path="dar/new/document" element={withSuspense(DarNewForm)} />
            <Route path="dar/new/create" element={withSuspense(DarNewForm)} />
            <Route path="dar/new/revision" element={withSuspense(DarRevisionForm)} />
            <Route path="dar/new/obsolete" element={withSuspense(DarObsoleteForm)} />
            <Route path="dar/new/:docType" element={withSuspense(DarNewForm)} />
            <Route path="dar/list" element={withSuspense(DarList)} />
            <Route path="dar/:id" element={withSuspense(DarDetail)} />

            <Route path="tasks" element={withSuspense(TaskInbox)} />
            <Route path="tasks/review/:id" element={withSuspense(TaskReview)} />
            <Route path="tasks/approve/:id" element={withSuspense(TaskApprove)} />
            <Route path="tasks/ack/:id" element={withSuspense(TaskAck)} />
            <Route path="tasks/revise/:id" element={withSuspense(TaskRevise)} />
            <Route path="tasks/approve-replacement/:id" element={withSuspense(TaskApproveReplacement)} />
            <Route path="tasks/confirm-receipt/:id" element={withSuspense(TaskConfirmHardcopyReceipt)} />

            <Route path="library" element={withSuspense(Library)} />
            <Route path="library/:id" element={withSuspense(LibraryDetail)} />
            <Route path="viewer/:docId/:rev" element={withSuspense(Viewer)} />

            <Route path="admin/health" element={withSuspense(AdminHealth)} />
            <Route path="admin/action-log" element={<ProtectedRoute requireAdmin deniedToastMessage="คุณไม่มีสิทธิ์เข้าถึงประวัติการทำงาน">{withSuspense(ActionLog)}</ProtectedRoute>} />
            <Route path="admin/master-data" element={<ProtectedRoute requireAdmin deniedToastMessage="คุณไม่มีสิทธิ์เข้าถึงศูนย์จัดการข้อมูลหลัก">{withSuspense(MasterDataHub)}</ProtectedRoute>} />
            <Route path="reports" element={withSuspense(Reports)} />

            <Route path="controlled-copy" element={<ProtectedRoute requireDcc deniedToastMessage="คุณไม่มีสิทธิ์เข้าถึงศูนย์ควบคุมงาน DCC">{withSuspense(ControlledCopyRegister)}</ProtectedRoute>} />
            <Route path="external-docs" element={withSuspense(ExternalDocsList)} />
            <Route path="external/my-requests" element={withSuspense(MyExternalRequests)} />
            <Route path="external/requests/:id" element={withSuspense(ExternalRequestDetail)} />
            <Route path="external/my-requests/:id" element={<AliasRedirect to="/dcc/external/requests/:id" />} />
            <Route path="external-docs/my-requests" element={<AliasRedirect to="/dcc/external/my-requests" />} />
            {/* Alias redirects within /dcc */}
            <Route path="documents" element={<AliasRedirect to="/dcc/library" />} />
            <Route path="documents/:id" element={<AliasRedirect to="/dcc/library/:id" />} />
            <Route path="external/library" element={<AliasRedirect to="/dcc/external-docs" />} />
            <Route path="external-docs/library" element={<AliasRedirect to="/dcc/external-docs" />} />
            <Route path="external-requests" element={<AliasRedirect to="/dcc/external/my-requests" />} />
            <Route path="dar-requests" element={<AliasRedirect to="/dcc/dar/list" />} />
            <Route path="requests" element={<AliasRedirect to="/dcc/dar/list" />} />
            <Route path="dar/my-requests" element={<AliasRedirect to="/dcc/dar/list" />} />
            <Route path="dar/tracking" element={<AliasRedirect to="/dcc/dar/list" />} />
            <Route path="my-requests" element={<AliasRedirect to="/dcc/dar/list" />} />
            <Route path="dar-tracking" element={<AliasRedirect to="/dcc/dar/list" />} />
            <Route path="my-tasks" element={<AliasRedirect to="/dcc/tasks" />} />
            <Route path="task-dashboard" element={<AliasRedirect to="/dcc/tasks" />} />

            {/* Master List Registry Deprecation Fallback Redirects -> Document Library */}
            <Route path="master-list" element={<AliasRedirect to="/dcc/library" />} />
            <Route path="registry" element={<AliasRedirect to="/dcc/library" />} />
            <Route path="master-register" element={<AliasRedirect to="/dcc/library" />} />
            <Route path="document-register" element={<AliasRedirect to="/dcc/library" />} />
            
            <Route path="periodic-reviews" element={withSuspense(PeriodicReviewDashboard)} />
            <Route path="periodic-reviews/:reviewId" element={withSuspense(PeriodicReviewDetail)} />
            <Route path="periodic-review/record/:docCode" element={withSuspense(PeriodicReviewDetail)} />
            <Route path="periodic-reviews/record/:docCode" element={withSuspense(PeriodicReviewDetail)} />

          </Route>

          {/* Aliases for backwards compatibility */}
          <Route path="dashboard" element={<AliasRedirect to="/dcc/dashboard" />} />
          <Route path="dar/new" element={<AliasRedirect to="/dcc/dar/new" />} />
          <Route path="dar/new/document" element={<AliasRedirect to="/dcc/dar/new/document" />} />
          <Route path="dar/new/create" element={<AliasRedirect to="/dcc/dar/new/document" />} />
          <Route path="dar/new/revision" element={<AliasRedirect to="/dcc/dar/new/revision" />} />
          <Route path="dar/new/obsolete" element={<AliasRedirect to="/dcc/dar/new/obsolete" />} />
          <Route path="dar/new/:docType" element={<AliasRedirect to="/dcc/dar/new/:docType" />} />
          <Route path="dar/list" element={<AliasRedirect to="/dcc/dar/list" />} />
          <Route path="dar/:id" element={<AliasRedirect to="/dcc/dar/:id" />} />
          <Route path="dar-requests" element={<AliasRedirect to="/dcc/dar/list" />} />
          <Route path="requests" element={<AliasRedirect to="/dcc/dar/list" />} />
          <Route path="dar/my-requests" element={<AliasRedirect to="/dcc/dar/list" />} />
          <Route path="dar/tracking" element={<AliasRedirect to="/dcc/dar/list" />} />
          <Route path="my-requests" element={<AliasRedirect to="/dcc/dar/list" />} />
          <Route path="dar-tracking" element={<AliasRedirect to="/dcc/dar/list" />} />

          <Route path="tasks" element={<AliasRedirect to="/dcc/tasks" />} />
          <Route path="my-tasks" element={<AliasRedirect to="/dcc/tasks" />} />
          <Route path="task-dashboard" element={<AliasRedirect to="/dcc/tasks" />} />
          <Route path="tasks/review/:id" element={<AliasRedirect to="/dcc/tasks/review/:id" />} />
          <Route path="tasks/approve/:id" element={<AliasRedirect to="/dcc/tasks/approve/:id" />} />
          <Route path="tasks/ack/:id" element={<AliasRedirect to="/dcc/tasks/ack/:id" />} />
          <Route path="tasks/revise/:id" element={<AliasRedirect to="/dcc/tasks/revise/:id" />} />
          <Route path="tasks/approve-replacement/:id" element={<AliasRedirect to="/dcc/tasks/approve-replacement/:id" />} />
          <Route path="tasks/confirm-receipt/:id" element={<AliasRedirect to="/dcc/tasks/confirm-receipt/:id" />} />

          <Route path="library" element={<AliasRedirect to="/dcc/library" />} />
          <Route path="library/:id" element={<AliasRedirect to="/dcc/library/:id" />} />
          <Route path="documents" element={<AliasRedirect to="/dcc/library" />} />
          <Route path="documents/:id" element={<AliasRedirect to="/dcc/library/:id" />} />
          <Route path="viewer/:docId/:rev" element={<AliasRedirect to="/dcc/viewer/:docId/:rev" />} />

          <Route path="admin/health" element={<AliasRedirect to="/dcc/admin/health" />} />
          <Route path="admin/action-log" element={<AliasRedirect to="/dcc/admin/action-log" />} />
          <Route path="admin/master-data" element={<AliasRedirect to="/dcc/admin/master-data" />} />
          <Route path="master-data" element={<AliasRedirect to="/dcc/admin/master-data" />} />
          <Route path="reports" element={<AliasRedirect to="/dcc/reports" />} />

          <Route path="controlled-copy" element={<AliasRedirect to="/dcc/controlled-copy" />} />
          <Route path="external-docs" element={<AliasRedirect to="/dcc/external-docs" />} />
          <Route path="external/library" element={<AliasRedirect to="/dcc/external-docs" />} />
          <Route path="external-docs/library" element={<AliasRedirect to="/dcc/external-docs" />} />
          <Route path="external/my-requests" element={<AliasRedirect to="/dcc/external/my-requests" />} />
          <Route path="external-requests" element={<AliasRedirect to="/dcc/external/my-requests" />} />
          <Route path="external/requests/:id" element={<AliasRedirect to="/dcc/external/requests/:id" />} />
          <Route path="external/my-requests/:id" element={<AliasRedirect to="/dcc/external/requests/:id" />} />
          <Route path="external-docs/my-requests" element={<AliasRedirect to="/dcc/external/my-requests" />} />
          {/* Master List Registry Deprecation Fallbacks -> Document Library */}
          <Route path="master-list" element={<AliasRedirect to="/dcc/library" />} />
          <Route path="registry" element={<AliasRedirect to="/dcc/library" />} />
          <Route path="master-register" element={<AliasRedirect to="/dcc/library" />} />
          <Route path="document-register" element={<AliasRedirect to="/dcc/library" />} />
          
          <Route path="periodic-reviews" element={<AliasRedirect to="/dcc/periodic-reviews" />} />
          <Route path="periodic-reviews/manage" element={<AliasRedirect to="/dcc/periodic-reviews" />} />
          <Route path="periodic-reviews/:reviewId" element={<AliasRedirect to="/dcc/periodic-reviews/:reviewId" />} />
          <Route path="periodic-review/record/:docCode" element={<AliasRedirect to="/dcc/periodic-review/record/:docCode" />} />
          <Route path="periodic-reviews/record/:docCode" element={<AliasRedirect to="/dcc/periodic-reviews/record/:docCode" />} />

          {/* Prototypes */}
          <Route path="demo-distribution" element={withSuspense(DistributionDemo)} />

          <Route path="*" element={withSuspense(NotFound)} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
  return isApiMode ? <ApiSessionGate>{app}</ApiSessionGate> : app;
}

export default App;
