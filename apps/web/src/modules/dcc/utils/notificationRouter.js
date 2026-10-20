/**
 * notificationRouter.js
 * 
 * Enterprise Notification Routing & Deep-Linking Engine for QMS Portal.
 * Maps notification metadata and links to verified, registered application routes.
 * Strictly prevents 404 Page Not Found errors with safe dynamic fallbacks.
 */

/**
 * Maps any legacy, shorthand, or misconfigured route to a canonical registered route.
 */
export const normalizeRoutePath = (rawPath) => {
  if (!rawPath || typeof rawPath !== 'string') return '/dcc/tasks';
  
  const trimmed = rawPath.trim();
  const [pathname, search] = trimmed.split('?');
  const queryStr = search ? `?${search}` : '';

  // Ensure leading slash
  let path = pathname.startsWith('/') ? pathname : `/${pathname}`;

  // 1. Map known misconfigured or legacy paths
  if (path === '/dcc/documents' || path === '/documents') {
    return `/dcc/library${queryStr}`;
  }
  if (path.startsWith('/dcc/documents/') || path.startsWith('/documents/')) {
    const docId = path.replace(/^\/(dcc\/)?documents\//, '');
    return `/dcc/library/${docId}${queryStr}`;
  }
  if (path === '/dcc/external/library' || path === '/external/library' || path === '/external-docs/library') {
    return `/dcc/external-docs${queryStr}`;
  }
  if (path === '/dcc/external-requests' || path === '/external-requests') {
    return `/dcc/external/my-requests${queryStr}`;
  }
  if (path === '/dcc/dar-requests' || path === '/dar-requests' || path === '/dcc/requests' || path === '/requests') {
    return `/dcc/dar/list${queryStr}`;
  }
  if (path === '/dcc/my-tasks' || path === '/my-tasks' || path === '/dcc/task-dashboard' || path === '/task-dashboard') {
    return `/dcc/tasks${queryStr}`;
  }
  if (['/master-list', '/registry', '/master-register', '/document-register', '/dcc/master-list', '/dcc/registry', '/dcc/master-register', '/dcc/document-register'].includes(path)) {
    return `/dcc/library${queryStr}`;
  }

  // 2. Extract EDR query id if pointing to external/my-requests?id=...
  if (path === '/dcc/external/my-requests' || path === '/external/my-requests') {
    if (search) {
      const params = new URLSearchParams(search);
      const edrId = params.get('id');
      if (edrId) {
        return `/dcc/external/requests/${edrId}`;
      }
    }
    return `/dcc/external/my-requests${queryStr}`;
  }

  // 3. Ensure DCC prefix for core modules
  const dccPrefixable = [
    '/tasks', '/dar', '/library', '/viewer', '/controlled-copy',
    '/external-docs', '/external', '/periodic-reviews',
    '/admin', '/dashboard', '/reports'
  ];

  for (const prefix of dccPrefixable) {
    if (path === prefix || path.startsWith(`${prefix}/`)) {
      return `/dcc${path}${queryStr}`;
    }
  }

  return `${path}${queryStr}`;
};

/**
 * Resolves a notification to a guaranteed valid navigation target.
 * Supports deep-linking into specific Tasks, DAR details, EDR details, or Library document modals.
 * 
 * @param {Object} item - Notification object
 * @param {Object} storeState - Current useStore state (tasks, dars, documents, etc.)
 * @returns {{ path: string, state?: Object }}
 */
export const resolveNotificationNavigation = (item, storeState = {}) => {
  if (!item || typeof item !== 'object') {
    return { path: '/dcc/tasks' };
  }

  const tasks = storeState.tasks || [];
  const dars = storeState.dars || [];
  const documents = storeState.documents || [];

  const taskId = item.relatedTaskId || item.taskId;
  const refId = item.refId || item.darId || item.requestId || item.docId;
  const docCode = item.docCode || item.doc_code;
  const category = (item.category || '').toUpperCase();
  const rawLink = item.link || '';

  // 1. Task-directed notification: If tied to a task, route to specific task action
  if (taskId) {
    const task = tasks.find(t => String(t.id) === String(taskId));
    if (task) {
      const taskType = String(task.type || task.taskType || '').trim();
      if (taskType === 'Review') {
        return { path: `/dcc/tasks/review/${task.id}`, state: { targetTaskId: task.id } };
      }
      if (taskType === 'Approve') {
        return { path: `/dcc/tasks/approve/${task.id}`, state: { targetTaskId: task.id } };
      }
      if (taskType === 'Acknowledge' || taskType === 'Ack') {
        return { path: `/dcc/tasks/ack/${task.id}`, state: { targetTaskId: task.id } };
      }
      if (taskType === 'Revise') {
        return { path: `/dcc/tasks/revise/${task.id}`, state: { targetTaskId: task.id } };
      }
      if (taskType === 'ApproveReplacement' || taskType === 'REPLACEMENT_APPROVAL') {
        return { path: `/dcc/tasks/approve-replacement/${task.id}`, state: { targetTaskId: task.id } };
      }
      if (taskType === 'RECEIPT_CONFIRMATION' || taskType === 'CONFIRM_RECEIPT') {
        return { path: `/dcc/tasks/confirm-receipt/${task.id}`, state: { targetTaskId: task.id } };
      }
      return { path: '/dcc/tasks', state: { targetTaskId: task.id } };
    }
  }

  // 2. If an explicit link is provided, sanitize and normalize it
  if (rawLink && typeof rawLink === 'string' && rawLink.trim()) {
    const normalized = normalizeRoutePath(rawLink);

    // If link points to library and we have docCode/refId, deep link to doc
    if (normalized.startsWith('/dcc/library') && !normalized.includes('/dcc/library/')) {
      const targetDoc = documents.find(d => 
        (refId && String(d.id) === String(refId)) ||
        (docCode && (d.document_code === docCode || d.doc_code === docCode || d.code === docCode))
      );
      if (targetDoc) {
        return {
          path: `/dcc/library?docId=${encodeURIComponent(targetDoc.id)}`,
          state: { openDocId: targetDoc.id, docCode: targetDoc.document_code }
        };
      }
    }

    return { path: normalized };
  }

  // 3. Category & Metadata-based Intelligent Routing (when link is missing)
  if (category === 'DAR' || item.title?.includes('DAR') || item.message?.includes('DAR')) {
    if (refId) {
      const dar = dars.find(d => String(d.id) === String(refId) || d.darNumber === refId);
      if (dar) {
        if (dar.status === 'DRAFT') {
          const basePath = (dar.type === 'NEW' || dar.type === 'NEW_DOCUMENT') ? '/dcc/dar/new/document' : 
                          (dar.type === 'REVISION' || dar.type === 'REVISE') ? '/dcc/dar/new/revision' : 
                          '/dcc/dar/new/obsolete';
          return {
            path: `${basePath}?draftId=${encodeURIComponent(dar.id)}`,
            state: { draftId: dar.id, draftData: dar }
          };
        }
        return { path: `/dcc/dar/${dar.id}` };
      }
      return { path: `/dcc/dar/${refId}` };
    }
    return { path: '/dcc/dar/list' };
  }

  if (category === 'EXTERNAL_DOC' || item.title?.includes('ภายนอก') || item.message?.includes('ภายนอก')) {
    if (refId && String(refId).startsWith('EDR-')) {
      return { path: `/dcc/external/requests/${refId}` };
    }
    if (docCode) {
      return { 
        path: `/dcc/external-docs?docCode=${encodeURIComponent(docCode)}`,
        state: { openDocCode: docCode }
      };
    }
    return { path: '/dcc/external-docs' };
  }

  if (category === 'CONTROLLED_COPY' || item.title?.includes('สำเนา') || item.message?.includes('สำเนา')) {
    if (item.title?.includes('เรียกคืน') || item.message?.includes('เรียกคืน')) {
      return { path: '/dcc/controlled-copy?tab=RECALL_CHECKLIST' };
    }
    if (item.title?.includes('พิมพ์') || item.title?.includes('แจกจ่าย') || item.message?.includes('ตรวจรับ')) {
      return { path: '/dcc/controlled-copy?tab=PENDING_ISSUE' };
    }
    return { path: '/dcc/controlled-copy' };
  }

  if (category === 'PERIODIC_REVIEW') {
    if (refId) {
      return { path: `/dcc/periodic-reviews/${refId}` };
    }
    return { path: '/dcc/periodic-reviews' };
  }

  // 4. Safe Default Fallback
  return { path: '/dcc/tasks' };
};
