import { INITIAL_NOTIFICATIONS } from '../fixtures/seedData';
import { isActionableTask } from '../../modules/dcc/utils/taskFilter';
import { calculateTaskDueDate } from '../../modules/dcc/utils/slaCalculator';
import { calculateCopyAllocations, cleanLocationName } from '../../modules/dcc/services/MasterDataService';
import { resolveDccAdminUserId } from '../../modules/dcc/store/externalDocSlice';
import { buildControlledCopyId, cleanupDccTasks, sanitizeControlledCopies } from '../../modules/dcc/store/controlledCopySlice';

/**
 * Normalizes user departments into an array of unique non-empty department strings.
 */
export const getUserDepartments = (user) => {
  if (!user) return [];
  const depts = [];
  if (user.department) depts.push(user.department);
  if (user.primary_department) depts.push(user.primary_department);
  if (user.dept) depts.push(user.dept);
  if (user.dept_code) depts.push(user.dept_code);
  if (Array.isArray(user.departments)) depts.push(...user.departments);
  if (Array.isArray(user.secondaryDepartments)) depts.push(...user.secondaryDepartments);
  if (Array.isArray(user.depts)) depts.push(...user.depts);
  if (Array.isArray(user.affiliated_departments)) depts.push(...user.affiliated_departments);
  return [...new Set(depts.filter(Boolean))];
};

/**
 * Helper to determine if a notification is visible to the given user.
 */
export const isNotificationVisibleToUser = (notification, user) => {
  if (!notification) return false;
  if (!user) return true;

  // 1. Global / Organization-wide announcement
  if (notification.isGlobal || notification.global || notification.scope === 'GLOBAL') {
    return true;
  }

  // 2. Direct user targeting
  const targetId = notification.userId || notification.user_id;
  const userEmpId = user.empId || user.id;
  if (targetId && (targetId === user.id || targetId === userEmpId)) {
    return true;
  }

  // 3. Multi-user targeting
  if (Array.isArray(notification.targetUserIds) && notification.targetUserIds.length > 0) {
    if (notification.targetUserIds.includes(user.id) || (userEmpId && notification.targetUserIds.includes(userEmpId))) {
      return true;
    }
  }

  // 4. Department-level targeting
  const targetDept = notification.targetDepartment || notification.recipientDept || (notification.userId ? null : notification.department);
  if (targetDept) {
    const userDepts = [
      user.department,
      user.dept,
      user.primary_department,
      ...(Array.isArray(user.departments) ? user.departments : []),
      ...(Array.isArray(user.affiliated_departments) ? user.affiliated_departments : []),
      ...(Array.isArray(user.depts) ? user.depts : []),
      ...(Array.isArray(user.secondaryDepartments) ? user.secondaryDepartments : [])
    ].filter(Boolean);

    if (userDepts.some(d => String(d).trim().toLowerCase() === String(targetDept).trim().toLowerCase())) {
      return true;
    }
  }

  // 5. If no target specified at all -> broadcast
  if (!targetId && (!Array.isArray(notification.targetUserIds) || notification.targetUserIds.length === 0) && !targetDept) {
    return true;
  }

  return false;
};

/**
 * Helper to determine if a notification has been read by the given user.
 */
export const isNotificationReadByUser = (notification, userId) => {
  if (!notification) return true;
  if (!userId) return Boolean(notification.isRead || notification.read);

  // 1. Check per-user read tracking array
  if (Array.isArray(notification.readBy) && notification.readBy.includes(userId)) {
    return true;
  }

  // 2. If notification is specifically for this user and flagged as read
  const targetId = notification.userId || notification.user_id;
  if (targetId && targetId === userId && (notification.isRead || notification.read)) {
    return true;
  }

  // 3. If single-user notification without readBy array, check isRead / read
  if (!notification.isGlobal && !notification.targetDepartment && (!Array.isArray(notification.targetUserIds) || notification.targetUserIds.length <= 1) && (notification.isRead || notification.read)) {
    return true;
  }

  return false;
};

/**
 * Calculates SLA Status ('NORMAL', 'DUE_SOON', 'OVERDUE') based on effectiveDate and currentDate.
 */
export const calculateSLAStatus = (effectiveDate, currentDate) => {
  if (!effectiveDate) return 'NORMAL';

  const eff = new Date(effectiveDate);
  eff.setHours(0, 0, 0, 0);
  const cur = new Date(currentDate);
  cur.setHours(0, 0, 0, 0);

  const diffTime = eff.getTime() - cur.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return 'OVERDUE';
  if (diffDays <= 3) return 'DUE_SOON';
  return 'NORMAL';
};

/**
 * Returns actionable tasks for a specific user.
 */
export const getUserActionableTasks = (tasks = [], user = null, documents = [], referenceDate = new Date()) => {
  if (!user) return [];
  return (tasks || []).filter(t => isActionableTask(t, user, documents, referenceDate));
};

/**
 * Returns badge count of active pending tasks requiring action by the user.
 */
export const getUserTaskBadgeCount = (tasks = [], user = null, documents = [], referenceDate = new Date()) => {
  if (!user) return 0;
  const actionable = getUserActionableTasks(tasks, user, documents, referenceDate);
  return actionable.filter(t => t.actionRequired !== false && !t.is_completed && t.status !== 'COMPLETED').length;
};

/**
 * System and Task Slice: centralizes tasks, timeline, notifications, audit log, and time simulator.
 */
export const createSystemAndTaskSlice = (set, get) => ({
  // State
  tasks: [],
  completedTasks: [],
  timeline: [],
  notifications: [...INITIAL_NOTIFICATIONS],
  actionLog: [],
  distributionLogs: [],
  acknowledgments: [],
  simulatedSystemDate: null,
  simulatedDate: new Date().toISOString().split('T')[0],
  mockDateOffset: 0,

  // Time Travel Simulator
  setSimulatedDate: (dateString) => {
    set({ simulatedSystemDate: dateString });
    get().syncPeriodicReviewSchedulesAndTasks?.(dateString ? new Date(dateString) : new Date());
  },

  fastForwardSystemDate: (monthsToAdd) => {
    const baseDate = get().simulatedSystemDate 
      ? new Date(get().simulatedSystemDate) 
      : new Date();
    baseDate.setMonth(baseDate.getMonth() + monthsToAdd);
    const dateString = baseDate.toISOString().split('T')[0];
    set({ simulatedSystemDate: dateString });
    get().syncPeriodicReviewSchedulesAndTasks?.(baseDate);
  },

  resetSimulatedDate: () => {
    set({ simulatedSystemDate: null });
    get().syncPeriodicReviewSchedulesAndTasks?.(new Date());
  },

  getEffectiveToday: () => {
    const sim = get().simulatedSystemDate;
    return sim ? new Date(sim) : new Date();
  },

  setMockDateOffset: (days) => set({ mockDateOffset: days }),

  simulateNextDay: () => {
    set((state) => {
      const current = new Date(state.simulatedDate);
      current.setDate(current.getDate() + 1);
      return { simulatedDate: current.toISOString().split('T')[0] };
    });
    get().checkSLA();
  },

  // Notifications & Audit Logs
  logAction: (logEntry, maybeDetails) => set((state) => {
    let actionType = 'ACTIVITY';
    let details = '-';
    let actor = state.currentUser?.name || 'System';
    let actorId = state.currentUser?.id || 'SYSTEM';
    let actorRole = state.currentUser?.role || state.currentUser?.position || 'User';
    let category = 'SYSTEM';
    let timestamp = new Date().toISOString();

    if (typeof logEntry === 'string') {
      actionType = logEntry;
      details = maybeDetails !== undefined ? maybeDetails : '-';
    } else if (typeof logEntry === 'object' && logEntry !== null) {
      actionType = logEntry.actionType || logEntry.action || logEntry.action_type || 'ACTIVITY';
      details = logEntry.details || logEntry.detail || logEntry.remarks || logEntry.remark || logEntry.comment || '-';
      actor = logEntry.actor || logEntry.user || logEntry.actorName || logEntry.userName || state.currentUser?.name || 'System';
      actorId = logEntry.actorId || logEntry.userId || logEntry.user_id || state.currentUser?.id || 'SYSTEM';
      actorRole = logEntry.actorRole || logEntry.role || logEntry.user_role || state.currentUser?.role || 'User';
      category = logEntry.category || 'SYSTEM';
      timestamp = logEntry.timestamp || logEntry.created_at || logEntry.createdAt || logEntry.date || logEntry.time || new Date().toISOString();
    }

    const newLog = {
      id: (typeof logEntry === 'object' && logEntry?.id) ? logEntry.id : `LOG-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      actionType,
      action: actionType,
      action_type: actionType,
      details,
      actor,
      user: actor,
      actorId,
      user_id: actorId,
      actorRole,
      role: actorRole,
      user_role: actorRole,
      category,
      timestamp,
      created_at: timestamp,
      createdAt: timestamp,
      date: timestamp,
      rawDate: timestamp
    };

    return {
      actionLog: [newLog, ...(state.actionLog || [])]
    };
  }),

  addNotification: (arg1, arg2, arg3, arg4, arg5, arg6, arg7) => set(state => {
    let notifObj = {};
    if (typeof arg1 === 'object' && arg1 !== null) {
      notifObj = { ...arg1 };
    } else {
      notifObj = {
        userId: arg1,
        title: arg2,
        message: arg3,
        link: arg4,
        relatedTaskId: arg5,
        category: arg6,
        ...(arg7 || {})
      };
    }

    const title = notifObj.title || 'การแจ้งเตือน';
    const message = notifObj.message || notifObj.description || '';
    const nowIso = new Date().toISOString();

    const cat = notifObj.category || (
      title.includes('DAR') || notifObj.docCode?.includes('DAR') ? 'DAR' :
      (title.includes('เอกสารภายนอก') || notifObj.link?.includes('external') || notifObj.docCode?.startsWith('ED')) ? 'EXTERNAL_DOC' :
      (title.includes('สำเนา') || title.includes('ทดแทน') || title.includes('เรียกคืน')) ? 'CONTROLLED_COPY' :
      'SYSTEM'
    );

    const type = notifObj.type || (
      title.includes('รอการ') || title.includes('งานใหม่') || title.includes('ภาระงาน') ? 'TASK_ASSIGNED' :
      title.includes('ปฏิเสธ') || title.includes('ไม่ผ่าน') ? 'REJECTED' :
      title.includes('ส่งกลับ') ? 'ACTION_REQUIRED' :
      title.includes('สำเร็จ') || title.includes('อนุมัติแล้ว') ? 'SUCCESS' :
      title.includes('ยกเลิก') ? 'OBSOLETE' :
      'INFO'
    );

    const newEntry = {
      id: notifObj.id || `notif-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      userId: notifObj.userId || notifObj.user_id || null,
      user_id: notifObj.userId || notifObj.user_id || null,
      targetUserIds: Array.isArray(notifObj.targetUserIds) ? notifObj.targetUserIds : (notifObj.userId ? [notifObj.userId] : []),
      targetDepartment: notifObj.targetDepartment || notifObj.department || null,
      isGlobal: Boolean(notifObj.isGlobal || notifObj.global),
      title,
      message,
      description: message,
      type,
      category: cat,
      docCode: notifObj.docCode || notifObj.doc_code || null,
      refId: notifObj.refId || notifObj.referenceId || null,
      link: notifObj.link || '/dcc/tasks',
      isRead: false,
      read: false,
      readBy: [],
      timestamp: notifObj.timestamp || nowIso,
      createdAt: notifObj.createdAt || nowIso,
      created_at: notifObj.created_at || nowIso,
      relatedTaskId: notifObj.relatedTaskId || null
    };

    return {
      notifications: [newEntry, ...(state.notifications || [])]
    };
  }),

  markNotificationAsReadByTaskId: (taskId, userId) => set(state => {
    const currentUserId = userId || state.currentUser?.id;
    return {
      notifications: (state.notifications || []).map(n => {
        if (String(n.relatedTaskId) === String(taskId)) {
          const readBy = Array.isArray(n.readBy) ? [...n.readBy] : [];
          if (currentUserId && !readBy.includes(currentUserId)) {
            readBy.push(currentUserId);
          }
          return { ...n, isRead: true, read: true, readBy };
        }
        return n;
      })
    };
  }),

  markNotificationAsRead: (id, userId) => set(state => {
    const currentUserId = userId || state.currentUser?.id;
    return {
      notifications: (state.notifications || []).map(n => {
        if (String(n.id) === String(id)) {
          const readBy = Array.isArray(n.readBy) ? [...n.readBy] : [];
          if (currentUserId && !readBy.includes(currentUserId)) {
            readBy.push(currentUserId);
          }
          return { ...n, isRead: true, read: true, readBy };
        }
        return n;
      })
    };
  }),

  markAsRead: (id, userId) => set(state => {
    const currentUserId = userId || state.currentUser?.id;
    return {
      notifications: (state.notifications || []).map(n => {
        if (String(n.id) === String(id)) {
          const readBy = Array.isArray(n.readBy) ? [...n.readBy] : [];
          if (currentUserId && !readBy.includes(currentUserId)) {
            readBy.push(currentUserId);
          }
          return { ...n, isRead: true, read: true, readBy };
        }
        return n;
      })
    };
  }),

  markAllNotificationsAsRead: (userId) => set(state => {
    const currentUserId = userId || state.currentUser?.id;
    return {
      notifications: (state.notifications || []).map(n => {
        const isVisible = !currentUserId || isNotificationVisibleToUser(n, state.currentUser || { id: currentUserId });
        if (isVisible) {
          const readBy = Array.isArray(n.readBy) ? [...n.readBy] : [];
          if (currentUserId && !readBy.includes(currentUserId)) {
            readBy.push(currentUserId);
          }
          return { ...n, isRead: true, read: true, readBy };
        }
        return n;
      })
    };
  }),

  markAllAsRead: (userId) => set(state => {
    const currentUserId = userId || state.currentUser?.id;
    return {
      notifications: (state.notifications || []).map(n => {
        const isVisible = !currentUserId || isNotificationVisibleToUser(n, state.currentUser || { id: currentUserId });
        if (isVisible) {
          const readBy = Array.isArray(n.readBy) ? [...n.readBy] : [];
          if (currentUserId && !readBy.includes(currentUserId)) {
            readBy.push(currentUserId);
          }
          return { ...n, isRead: true, read: true, readBy };
        }
        return n;
      })
    };
  }),

  clearNotifications: (userId) => set(state => ({
    notifications: userId ? (state.notifications || []).filter(n => n.userId !== userId && n.user_id !== userId) : []
  })),

  pruneOldNotifications: () => set(state => {
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    return {
      notifications: (state.notifications || []).filter(
        n => (!n.isRead && !n.read) || ((n.created_at || n.createdAt || n.timestamp) && (n.created_at || n.createdAt || n.timestamp) >= ninetyDaysAgo)
      )
    };
  }),

  // Task & Workflow Management
  updateTask: (taskId, updates) => set((state) => {
    const newTasks = state.tasks.map(t => {
      if (t.id === taskId || t.taskId === taskId) {
        return { ...t, ...updates };
      }
      return t;
    });
    return { tasks: newTasks };
  }),

  removeTask: (taskId) => set((state) => ({
    tasks: state.tasks.filter(t => t.id !== taskId)
  })),

  createTask: (taskInput) => set((state) => {
    if (!taskInput) return state;
    const safeDars = state.dars || [];
    const safeDocs = state.documents || [];
    const matchedDar = safeDars.find(d => String(d.id) === String(taskInput.darId));
    const docCode = taskInput.doc_code || taskInput.docCode || taskInput.document_code || '';
    const docId = taskInput.docId || taskInput.doc_id;
    const matchedDoc = safeDocs.find(d => 
      (docId && String(d.id) === String(docId)) ||
      (docCode && (d.title === docCode || d.document_code === docCode || d.code === docCode))
    );

    let ownerDept = matchedDar?.department || matchedDoc?.department || taskInput.department;
    if (!ownerDept) {
      if (String(docCode).includes('-PD-') || String(taskInput.title).includes('-PD-') || String(taskInput.darId).includes('-PD-')) {
        ownerDept = 'PD';
      }
    }
    const cleanDept = ownerDept === 'DCC' ? 'DC' : (ownerDept || 'PD');

    const newTask = {
      ...taskInput,
      id: taskInput.id || `t-${Date.now()}`,
      department: cleanDept,
      target_department: cleanDept,
      owner_dept: cleanDept,
      currentHandlerDepartment: cleanDept
    };

    return {
      tasks: [newTask, ...state.tasks]
    };
  }),

  setTasks: (tasks) => set({ tasks }),
  setTimeline: (timeline) => set({ timeline }),

  getUserActionableTasks: (user) => {
    const s = get();
    const effectiveToday = s.getEffectiveToday ? s.getEffectiveToday() : (s.simulatedSystemDate ? new Date(s.simulatedSystemDate) : new Date());
    const allDocs = [...(s.documents || []), ...(s.externalDocuments || [])];
    return getUserActionableTasks(s.tasks, user || s.currentUser, allDocs, effectiveToday);
  },

  getUserTaskBadgeCount: (user) => {
    const s = get();
    const effectiveToday = s.getEffectiveToday ? s.getEffectiveToday() : (s.simulatedSystemDate ? new Date(s.simulatedSystemDate) : new Date());
    const allDocs = [...(s.documents || []), ...(s.externalDocuments || [])];
    return getUserTaskBadgeCount(s.tasks, user || s.currentUser, allDocs, effectiveToday);
  },

  // Centralized SLA Check & Auto-Transition Engine
  checkSLA: () => {
    let newlyCompletedDars = [];
    set((state) => {
      const today = state.simulatedSystemDate ? new Date(state.simulatedSystemDate) : new Date();
      today.setDate(today.getDate() + (state.mockDateOffset || 0));
      const todayStr = state.simulatedSystemDate || state.simulatedDate || today.toISOString().split('T')[0];
      const activeStatuses = ['DRAFT', 'UNDER_REVIEW', 'PENDING_APPROVAL', 'RETURNED_FOR_REVISION', 'WAITING_ACKNOWLEDGEMENT'];
      const activeExtStatuses = ['PENDING_EXT_REVIEW', 'PENDING_EXT_APPROVAL', 'RETURNED_FOR_REVISION'];
      
      const darIdsToCancel = state.dars
        .filter(d => activeStatuses.includes(d.status))
        .filter(d => calculateSLAStatus(d.effectiveDate, todayStr) === 'OVERDUE')
        .map(d => d.id);

      const extDocIdsToCancel = state.externalDocuments
        .filter(d => activeExtStatuses.includes(d.status))
        .filter(d => calculateSLAStatus(d.effectiveDate, todayStr) === 'OVERDUE')
        .map(d => d.id);
      
      let newTasks = state.tasks
        .filter(t => !darIdsToCancel.includes(t.darId) && !extDocIdsToCancel.includes(t.referenceId))
        .map(t => {
          let sla = 'NORMAL';
          if (t.darId) {
            const dar = state.dars.find(d => d.id === t.darId);
            if (dar && activeStatuses.includes(dar.status)) {
              sla = calculateSLAStatus(dar.effectiveDate, todayStr);
            }
          } else if (t.referenceType === 'EXTERNAL_DOC' && t.referenceId) {
            const extDoc = state.externalDocuments.find(d => d.id === t.referenceId);
            if (extDoc && activeExtStatuses.includes(extDoc.status)) {
              sla = calculateSLAStatus(extDoc.effectiveDate, todayStr);
            }
          }
          return { ...t, status: sla };
        });

      let newDars = state.dars.map(d => darIdsToCancel.includes(d.id) ? { ...d, status: 'CANCELLED_OVERDUE' } : d);
      let newExtDocs = state.externalDocuments.map(d => extDocIdsToCancel.includes(d.id) ? { ...d, status: 'CANCELLED_OVERDUE' } : d);
      let newDocuments = [...state.documents];
      const newTimeline = [...state.timeline];
      let newActionLog = state.actionLog ? [...state.actionLog] : [];
      let newExtAuditTrail = state.externalAuditTrail ? [...state.externalAuditTrail] : [];

      darIdsToCancel.forEach(darId => {
        newTimeline.push({
          id: Date.now() + Math.random(), darId, action: 'System Cancel', user: 'System (SLA Engine)', date: new Date().toLocaleString(), comment: 'Auto-cancelled due to Overdue Effective Date'
        });
      });

      extDocIdsToCancel.forEach(extId => {
        newActionLog.unshift({
          id: `LOG-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          actionType: 'SYSTEM_CANCEL',
          details: `External document cancelled due to Overdue SLA`,
          actor: 'System (SLA Engine)',
          actorId: 'SYS',
          date: new Date().toISOString()
        });
        newExtAuditTrail.unshift({
          id: `EXTA-${Date.now()}-${Math.random()}`,
          docId: extId,
          action: 'SYSTEM_CANCEL',
          actor: 'System (SLA Engine)',
          actorId: 'SYS',
          date: new Date().toISOString(),
          details: 'Auto-cancelled due to Overdue Effective Date'
        });
      });

      const waitingEffectiveDars = newDars.filter(d => d.status === 'APPROVED_WAITING_EFFECTIVE' && d.effectiveDate <= todayStr);

      let newControlledCopyInstances = [...state.controlledCopyInstances];
      let newAuditTrail = [...state.controlledCopyAuditTrail];
      let newNotifications = [...state.notifications];

      if (waitingEffectiveDars.length > 0) {
        waitingEffectiveDars.forEach(dar => {
          const completedDar = { ...dar, status: 'COMPLETED' };
          newlyCompletedDars.push(completedDar);
          newDars = newDars.map(d => d.id === dar.id ? completedDar : d);
          
          if (dar.type === 'NEW' || dar.type === 'NEW_DOCUMENT') {
            const isFormDoc = Boolean(
              dar.docType === 'FM' ||
              dar.doc_type === 'FM' ||
              dar.type === 'FM' ||
              String(dar.docIdInput || dar.title || '').startsWith('FM')
            );
            const newDoc = {
              id: `doc-${Date.now()}-${Math.random()}`,
              darId: dar.id,
              title: dar.docIdInput || 'TBD',
              name: dar.title,
              status: 'EFFECTIVE',
              rev: '00',
              department: dar.department,
              controlledCopy: 0,
              effectiveDate: dar.effectiveDate || todayStr,
              distributions: isFormDoc ? [] : (dar.distributions || []),
              access_control: dar.access_control || { scope: 'GENERAL' }
            };
            newDocuments.push(newDoc);
            newNotifications.push({ id: Date.now() + Math.random(), userId: dar.requesterId, title: 'เอกสารบังคับใช้แล้ว', message: `เอกสารใหม่ "${dar.title}" มีผลบังคับใช้แล้ว`, isRead: false, link: '/library', timestamp: new Date().toISOString() });

            if (!isFormDoc) {
              const allocations = calculateCopyAllocations(newDoc.department, newDoc.distributions || []);
              const allTargets = allocations.allAllocations || [];

              if (allTargets.length > 0) {
                const distSla = calculateTaskDueDate({
                  submissionDate: today,
                  effectiveDate: dar.effectiveDate || newDoc.effectiveDate,
                  stepSlaDays: state.slaSettings?.hardcopyReceiptSlaDays || 3,
                  mockDateOffset: state.mockDateOffset
                });
                const distDocOfficialTitle = newDoc.name || dar.name || newDoc.title;
                newTasks.push({
                  id: `task-dist-${Date.now()}-${Math.random()}`,
                  title: `แจกจ่ายเอกสาร Controlled Copy (NEW): ${distDocOfficialTitle} (${newDoc.title})`,
                  description: `กรุณาพิมพ์และแจกจ่ายสำเนาควบคุมสำหรับเอกสาร ${newDoc.title} (${distDocOfficialTitle}) จำนวน ${allTargets.length} แผนก/จุดใช้งาน`,
                  type: 'DCC_DISTRIBUTE',
                  assignee_department: 'DC',
                  document_department: 'QC',
                  taskType: 'DISTRIBUTION',
                  task_type: 'DISTRIBUTION',
                  status: 'PENDING',
                  assigneeId: resolveDccAdminUserId(state.masterUsers),
                  assignedToRole: 'DCC_ADMIN',
                  targetRole: 'DCC_ADMIN',
                  target_role: 'DCC_ADMIN',
                  department: 'DC',
                  target_department: 'DC',
                  docId: newDoc.id,
                  doc_id: newDoc.id,
                  document_code: newDoc.title,
                  doc_code: newDoc.title,
                  docCode: newDoc.title,
                  docTitle: distDocOfficialTitle,
                  docName: distDocOfficialTitle,
                  dueDate: distSla.dueDate,
                  cancelDate: distSla.cancelDate,
                  isUrgent: distSla.isUrgent,
                  isFastTrack: distSla.isFastTrack,
                  priority: distSla.isUrgent ? 'URGENT' : 'HIGH',
                  slaType: distSla.slaType,
                  effectiveDate: distSla.effectiveDate,
                  darId: dar.id
                });

                allTargets.forEach((dist, idx) => {
                  const deptName = dist.departmentId || dist.dept || dist.dept_code || newDoc.department;
                  const locName = cleanLocationName(dist.station_name || dist.locationName || dist.name || dist.location || `${deptName} Head Office`);
                  const locId = dist.station_id || dist.locationId || dist.id || `${deptName}-LOC-${idx + 1}`;
                  const copyNo = dist.copy_no || dist.copyNo || String(idx + 1).padStart(2, '0');
                  const nextCcNum = `CC-${String(idx + 1).padStart(3, '0')}`;
                  const isOrigin = dist.isOwner || dist.copyNo === '01' || copyNo === '01';
                  const copyDocCode = newDoc.document_code || newDoc.code || newDoc.doc_code || newDoc.title;
                  const copyDocTitle = newDoc.document_title || newDoc.docName || newDoc.name || dar.title || copyDocCode;
                  const copyId = buildControlledCopyId(copyDocCode, newDoc.rev, copyNo);
                  const newInst = {
                    id: copyId,
                    doc_id: newDoc.id,
                    docId: newDoc.id,
                    document_code: copyDocCode,
                    doc_code: copyDocCode,
                    docCode: copyDocCode,
                    document_title: copyDocTitle,
                    doc_title: copyDocTitle,
                    docName: copyDocTitle,
                    docTitle: copyDocCode,
                    doc_version: newDoc.rev,
                    rev: newDoc.rev,
                    copy_no: copyNo,
                    copyNo: copyNo,
                    ccNumber: nextCcNum,
                    issue_no: '01',
                    issueNumber: 'I01',
                    holder_dept: deptName,
                    department: deptName,
                    departmentId: deptName,
                    dept_code: deptName,
                    target_department: deptName,
                    targetDepartment: deptName,
                    recipientDepartment: deptName,
                    recipient_department: deptName,
                    owner_dept: newDoc.department,
                    holder_name: `${deptName} (${locName})`,
                    location: locName,
                    locationName: locName,
                    locationId: locId,
                    station_id: locId,
                    station_name: locName,
                    is_master: Boolean(isOrigin || dist.is_master || dist.isMaster),
                    isMaster: Boolean(isOrigin || dist.is_master || dist.isMaster),
                    is_owner: isOrigin,
                    isOwner: isOrigin,
                    copy_type: 'CONTROLLED',
                    copyType: 'CONTROLLED',
                    status: 'PENDING_ISSUE',
                    is_active_in_field: false,
                    received_by: null,
                    received_at: null,
                    is_replacement: false,
                    dispatched_at: null,
                    dispatched_by: null,
                    dateIssued: todayStr,
                    receipt_confirmed_at: null,
                    receipt_confirmed_by: null,
                    receipt_remarks: null,
                    recall_task_id: null
                  };
                  const alreadyExists = newControlledCopyInstances.some(inst => {
                    if (inst.id === copyId) return true;
                    const isMatchDoc = (String(inst.docId || inst.doc_id) === String(newDoc.id)) ||
                                       (inst.doc_code === newDoc.title || inst.docTitle === newDoc.title || inst.doc_code === copyDocCode);
                    const isMatchRev = String(inst.rev || inst.doc_version || inst.revision) === String(newDoc.rev);
                    const isMatchCopyNo = String(inst.copy_no || inst.copyNo || inst.ccNumber).replace(/\D/g, '') === String(copyNo).replace(/\D/g, '');
                    return isMatchDoc && isMatchRev && isMatchCopyNo;
                  });
                  if (!alreadyExists) {
                    newControlledCopyInstances.push(newInst);
                  }

                  newAuditTrail.push({
                    id: `audit-${Date.now()}-${idx}`,
                    timestamp: new Date().toISOString(),
                    user: 'System (SLA Engine)',
                    action: 'AUTO_GENERATE',
                    docTitle: newInst.docTitle,
                    docRev: newInst.rev,
                    ccNumber: newInst.ccNumber,
                    oldStatus: '-',
                    newStatus: newInst.status,
                    remarks: `Auto-generated CC for ${deptName} (${locName}) upon document effective`
                  });
                });
              }
            }
          } else if (dar.type === 'REVISION') {
            const targetDocId = dar.docIdRef || dar.docId || dar.doc_id;
            let targetCode = dar.document_code || dar.doc_code || dar.docCode || dar.docIdInput;
            if (!targetCode && targetDocId) {
              const found = newDocuments.find(d => String(d.id) === String(targetDocId));
              if (found) targetCode = found.document_code || found.code || found.title;
            }
            if (!targetCode && dar.title && !dar.title.startsWith('[')) {
              targetCode = dar.title;
            }

            const matchingOldDocs = newDocuments.filter(doc => {
              const code = doc.document_code || doc.code || doc.title;
              return (targetCode && code === targetCode) || (targetDocId && String(doc.id) === String(targetDocId));
            });
            const oldDoc = matchingOldDocs.find(d => d.status === 'EFFECTIVE') || matchingOldDocs[matchingOldDocs.length - 1];

            if (oldDoc || targetCode) {
              const oldRev = oldDoc ? (oldDoc.revision || oldDoc.rev) : (dar.previous_revision || dar.previousRev || '00');
              const currentRevNum = parseInt(oldRev, 10) || 0;
              const newRevNum = currentRevNum + 1;
              const newRevStr = dar.revision || dar.rev || (newRevNum < 10 ? `0${newRevNum}` : `${newRevNum}`);

              // Single Effective Invariant: Update ALL previous revisions of this document code to SUPERSEDED
              newDocuments = newDocuments.map(doc => {
                const code = doc.document_code || doc.code || doc.title;
                const isMatch = (targetCode && code === targetCode) || (targetDocId && String(doc.id) === String(targetDocId));
                if (isMatch) {
                  return { ...doc, status: 'SUPERSEDED', is_active: false, is_superseded: true, superseded_at: doc.superseded_at || new Date().toISOString() };
                }
                return doc;
              });
              
              const isFormDoc = Boolean(
                dar.docType === 'FM' ||
                dar.doc_type === 'FM' ||
                dar.type === 'FM' ||
                oldDoc?.docType === 'FM' ||
                String(targetCode || oldDoc?.document_code || oldDoc?.code || oldDoc?.title || dar.title || '').startsWith('FM')
              );
              const newDoc = {
                id: `doc-${Date.now()}-${Math.random()}`,
                darId: dar.id,
                document_code: targetCode || oldDoc?.document_code || oldDoc?.title,
                code: targetCode || oldDoc?.code || oldDoc?.title,
                title: oldDoc ? oldDoc.title : targetCode,
                name: dar.title || oldDoc?.name || 'Procedure Document',
                status: 'EFFECTIVE',
                is_active: true,
                is_superseded: false,
                is_obsolete: false,
                rev: newRevStr,
                revision: newRevStr,
                department: dar.department || oldDoc?.department || 'PD',
                controlledCopy: isFormDoc ? 0 : (oldDoc?.controlledCopy || 0),
                effectiveDate: dar.effectiveDate || todayStr,
                distributions: isFormDoc ? [] : (dar.distributions && dar.distributions.length > 0 ? dar.distributions : (oldDoc?.distributions || [])),
                access_control: dar.access_control || oldDoc?.access_control || { scope: 'GENERAL' }
              };
              newDocuments.push(newDoc);
              newNotifications.push({ id: Date.now() + Math.random(), userId: dar.requesterId, title: 'ฉบับปรับปรุงบังคับใช้แล้ว', message: `เอกสารปรับปรุง "${dar.title}" มีผลบังคับใช้เป็น Rev.${newDoc.rev} แล้ว`, isRead: false, link: '/library', timestamp: new Date().toISOString() });

              if (!isFormDoc) {
                const isMatchingOldCopy = (inst) => {
                  const copyCode = inst.document_code || inst.doc_code || inst.docTitle;
                  const isDocMatch = (oldDoc && String(inst.docId || inst.doc_id) === String(oldDoc.id)) ||
                                     (targetCode && copyCode === targetCode) ||
                                     (oldDoc?.title && copyCode === oldDoc.title);
                  const copyRev = inst.rev || inst.doc_version || inst.revision;
                  if (copyRev && String(copyRev) === String(newDoc.rev)) {
                    return false;
                  }
                  const isOldRev = copyRev ? (String(copyRev) === String(oldRev) || copyRev < newDoc.rev) : true;
                  const isActive = inst.status === 'ACTIVE' || inst.status === 'ISSUED_ACTIVE' || inst.status === 'RECEIVED' || inst.status === 'DISPATCHED_PENDING_RECEIPT';
                  return isDocMatch && isOldRev && isActive;
                };

                const oldCopiesToRecall = newControlledCopyInstances.filter(isMatchingOldCopy);

                newControlledCopyInstances = newControlledCopyInstances.map(inst => {
                  if (isMatchingOldCopy(inst)) {
                    newAuditTrail.unshift({
                      id: `audit-supersede-${Date.now()}-${inst.id}`,
                      timestamp: new Date().toISOString(),
                      user: 'System (SLA Engine)',
                      action: 'SUPERSEDED_PENDING_RECALL',
                      docTitle: inst.doc_code || inst.docTitle || targetCode,
                      docRev: inst.rev || inst.doc_version || oldRev,
                      ccNumber: inst.ccNumber || inst.copy_no,
                      oldStatus: inst.status,
                      newStatus: 'SUPERSEDED_PENDING_RECALL',
                      remarks: `Superseded by Rev.${newDoc.rev} (DAR ${dar.id}). Set to SUPERSEDED_PENDING_RECALL for physical recall/destruction.`
                    });

                    return {
                      ...inst,
                      status: 'PENDING_RECALL',
                      is_superseded: true,
                      superseded_at: new Date().toISOString(),
                      superseded_by_dar: dar.dar_no || dar.id,
                      superseded_by_rev: newDoc.rev,
                      recall_reason: `เอกสารมีการปรับปรุง Revision ใหม่ (Superseded by Rev.${newDoc.rev})`
                    };
                  }
                  return inst;
                });

                newActionLog.unshift({
                  id: `LOG-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                  actionType: 'REVISION_PUBLISHED',
                  actor: 'System (SLA Engine)',
                  details: `เอกสาร ${newDoc.title} ปรับปรุงเป็น Rev.${newDoc.rev}: สำเนาเดิม Rev.${oldRev} ทั้งหมด (${oldCopiesToRecall.length} เล่ม) ถูกตั้งสถานะเรียกคืน (SUPERSEDED_PENDING_RECALL)`,
                  timestamp: new Date().toISOString()
                });
                
                const allocations = calculateCopyAllocations(newDoc.department, newDoc.distributions || []);
                const allTargets = allocations.allAllocations || [];

                if (oldCopiesToRecall.length > 0 || (oldDoc && oldDoc.controlledCopy > 0)) {
                  const recallDocOfficialTitle = oldDoc?.name || newDoc.name || dar.name || targetCode;
                  newTasks.push({
                    id: `task-recall-${targetCode}-${oldRev}-${Date.now()}`,
                    type: 'DCC_RECALL',
                    assignee_department: 'DC',
                    document_department: 'QC',
                    taskType: 'RECALL',
                    task_type: 'RECALL',
                    targetRole: 'DCC_ADMIN',
                    target_role: 'DCC_ADMIN',
                    assignedToRole: 'DCC_ADMIN',
                    assigneeId: resolveDccAdminUserId(state.masterUsers),
                    department: 'DC',
                    target_department: 'DC',
                    docId: oldDoc?.id,
                    doc_id: oldDoc?.id,
                    document_code: targetCode,
                    doc_code: targetCode,
                    docCode: targetCode,
                    docTitle: recallDocOfficialTitle,
                    docName: recallDocOfficialTitle,
                    targetRevision: oldRev,
                    revision: oldRev,
                    doc_version: oldRev,
                    title: `[เรียกคืนสำเนาตกรุ่น] เรียกคืนเอกสาร Controlled Copy: ${recallDocOfficialTitle} (${targetCode} Rev.${oldRev})`,
                    description: `เอกสาร ${targetCode} (${recallDocOfficialTitle}) มีการอัปเดตเป็น Rev.${newDoc.rev} แล้ว กรุณาเรียกคืนเอกสารฉบับเดิม (Rev.${oldRev}) จากทุกสถานีใช้งาน (${oldCopiesToRecall.length} จุด)`,
                    copies_to_recall: oldCopiesToRecall.map(c => ({
                      id: c.id,
                      copy_no: c.copy_no || c.copyNo,
                      holder_dept: c.holder_dept || c.department,
                      location: c.location || c.locationName,
                      status: c.status
                    })),
                    supersededCopyIds: oldCopiesToRecall.map(c => c.id),
                    status: 'PENDING',
                    dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                    priority: 'HIGH',
                    darId: dar.id,
                    createdAt: new Date().toISOString()
                  });
                }

                if (allTargets.length > 0) {
                  const distSla = calculateTaskDueDate({
                    submissionDate: today,
                    effectiveDate: dar.effectiveDate || newDoc.effectiveDate,
                    stepSlaDays: state.slaSettings?.hardcopyReceiptSlaDays || 3,
                    mockDateOffset: state.mockDateOffset
                  });
                  const distDocOfficialTitle = newDoc.name || dar.name || newDoc.title;
                  newTasks.push({
                    id: `task-dist-${newDoc.title}-${newDoc.rev}-${Date.now()}`,
                    title: `แจกจ่ายเอกสาร Controlled Copy: ${distDocOfficialTitle} (${newDoc.title} Rev.${newDoc.rev})`,
                    description: `กรุณาพิมพ์และแจกจ่ายสำเนาควบคุมสำหรับเอกสาร ${newDoc.title} (${distDocOfficialTitle}) (Rev.${newDoc.rev}) จำนวน ${allTargets.length} แผนก/จุดใช้งาน`,
                    type: 'DCC_DISTRIBUTE',
                    assignee_department: 'DC',
                    document_department: 'QC',
                    taskType: 'DISTRIBUTION',
                    task_type: 'DISTRIBUTION',
                    targetRole: 'DCC_ADMIN',
                    target_role: 'DCC_ADMIN',
                    assignedToRole: 'DCC_ADMIN',
                    assigneeId: resolveDccAdminUserId(state.masterUsers),
                    department: 'DC',
                    target_department: 'DC',
                    docId: newDoc.id,
                    doc_id: newDoc.id,
                    document_code: newDoc.title,
                    doc_code: newDoc.title,
                    docCode: newDoc.title,
                    docTitle: distDocOfficialTitle,
                    docName: distDocOfficialTitle,
                    targetRevision: newDoc.rev,
                    revision: newDoc.rev,
                    doc_version: newDoc.rev,
                    status: 'PENDING',
                    dueDate: distSla.dueDate,
                    cancelDate: distSla.cancelDate,
                    isUrgent: distSla.isUrgent,
                    isFastTrack: distSla.isFastTrack,
                    priority: distSla.isUrgent ? 'URGENT' : 'HIGH',
                    slaType: distSla.slaType,
                    effectiveDate: distSla.effectiveDate,
                    darId: dar.id,
                    createdAt: new Date().toISOString()
                  });

                  allTargets.forEach((dist, idx) => {
                    const deptName = dist.departmentId || dist.dept || dist.dept_code || newDoc.department;
                    const locName = cleanLocationName(dist.station_name || dist.locationName || dist.name || dist.location || `${deptName} Head Office`);
                    const locId = dist.station_id || dist.locationId || dist.id || `${deptName}-LOC-${idx + 1}`;
                    const copyNo = dist.copy_no || dist.copyNo || String(idx + 1).padStart(2, '0');
                    const nextCcNum = `CC-${String(idx + 1).padStart(3, '0')}`;
                    const isOrigin = dist.isOwner || dist.copyNo === '01' || copyNo === '01';

                    const copyDocCode = newDoc.document_code || newDoc.code || newDoc.doc_code || newDoc.title;
                    const copyDocTitle = newDoc.document_title || newDoc.docName || newDoc.name || copyDocCode;
                    const copyId = buildControlledCopyId(copyDocCode, newDoc.rev, copyNo);
                    const newInst = {
                      id: copyId,
                      doc_id: newDoc.id,
                      docId: newDoc.id,
                      document_code: copyDocCode,
                      doc_code: copyDocCode,
                      docCode: copyDocCode,
                      document_title: copyDocTitle,
                      doc_title: copyDocTitle,
                      docName: copyDocTitle,
                      docTitle: copyDocCode,
                      doc_version: newDoc.rev,
                      rev: newDoc.rev,
                      revision: newDoc.rev,
                      copy_no: copyNo,
                      copyNo: copyNo,
                      ccNumber: nextCcNum,
                      issue_no: '01',
                      issueNumber: 'I01',
                      holder_dept: deptName,
                      department: deptName,
                      departmentId: deptName,
                      dept_code: deptName,
                      target_department: deptName,
                      targetDepartment: deptName,
                      recipientDepartment: deptName,
                      recipient_department: deptName,
                      owner_dept: newDoc.department,
                      holder_name: `${deptName} (${locName})`,
                      location: locName,
                      locationName: locName,
                      locationId: locId,
                      station_id: locId,
                      station_name: locName,
                      is_master: Boolean(isOrigin || dist.is_master || dist.isMaster),
                      isMaster: Boolean(isOrigin || dist.is_master || dist.isMaster),
                      is_owner: isOrigin,
                      isOwner: isOrigin,
                      copy_type: 'CONTROLLED',
                      copyType: 'CONTROLLED',
                      status: 'PENDING_ISSUE',
                      is_active_in_field: false,
                      received_by: null,
                      received_at: null,
                      is_replacement: false,
                      dispatched_at: null,
                      dispatched_by: null,
                      dateIssued: todayStr,
                      receipt_confirmed_at: null,
                      receipt_confirmed_by: null,
                      receipt_remarks: null,
                      recall_task_id: null
                    };
                    const alreadyExists = newControlledCopyInstances.some(inst => {
                      if (inst.id === copyId) return true;
                      const isMatchDoc = (String(inst.docId || inst.doc_id) === String(newDoc.id)) ||
                                         (inst.doc_code === newDoc.title || inst.docTitle === newDoc.title || inst.doc_code === copyDocCode);
                      const isMatchRev = String(inst.rev || inst.doc_version || inst.revision) === String(newDoc.rev);
                      const isMatchCopyNo = String(inst.copy_no || inst.copyNo || inst.ccNumber).replace(/\D/g, '') === String(copyNo).replace(/\D/g, '');
                      return isMatchDoc && isMatchRev && isMatchCopyNo;
                    });
                    if (!alreadyExists) {
                      newControlledCopyInstances.push(newInst);
                    }
                    
                    newAuditTrail.push({
                      id: `audit-${Date.now()}-${idx}`,
                      timestamp: new Date().toISOString(),
                      user: 'System (SLA Engine)',
                      action: 'AUTO_GENERATE',
                      docTitle: newInst.docTitle,
                      docRev: newInst.rev,
                      ccNumber: newInst.ccNumber,
                      oldStatus: '-',
                      newStatus: newInst.status,
                      remarks: `Auto-generated CC for ${deptName} (${locName}) upon new revision effective`
                    });
                  });
                }
              }
            }
          } else if (dar.type === 'OBSOLETE') {
            const targetDocId = dar.docIdRef || dar.docId || dar.doc_id;
            let targetDocCode = dar.document_code || dar.doc_code || dar.docCode || dar.docIdInput;
            if (!targetDocCode && targetDocId) {
              const found = newDocuments.find(d => String(d.id) === String(targetDocId));
              if (found) {
                targetDocCode = found.document_code || found.code || found.title;
              }
            }
            if (!targetDocCode) {
              targetDocCode = dar.title?.startsWith('[') ? dar.title.replace(/^\[.*?\]\s*/, '') : dar.title;
            }

            // 1. Cascade Obsolete across ALL revisions of targetDocCode
            newDocuments = newDocuments.map(doc => {
              const docCode = doc.document_code || doc.code || doc.title;
              const isMatch = (targetDocCode && docCode === targetDocCode) || (targetDocId && String(doc.id) === String(targetDocId));
              if (isMatch) {
                const existingHist = Array.isArray(doc.revision_history) ? [...doc.revision_history] : [];
                const curRev = String(doc.revision || doc.rev || '01').replace(/^Rev\.?/i, '').padStart(2, '0');
                if (!existingHist.some(h => String(h.revision || h.rev || '').replace(/^Rev\.?/i, '').padStart(2, '0') === curRev)) {
                  existingHist.push({
                    dar_no: doc.dar_no || doc.darNo || dar.dar_no || dar.id,
                    revision: curRev,
                    rev: curRev,
                    type: curRev === '00' ? 'NEW' : 'REVISION',
                    status: 'COMPLETED',
                    effective_date: doc.effectiveDate || doc.effective_date,
                    date: doc.effectiveDate || doc.effective_date,
                    reason: doc.reason || doc.change_details || 'ประวัติการประกาศใช้เดิม',
                    file: doc.file,
                    fileBlob: doc.fileBlob
                  });
                }
                if (!existingHist.some(h => (h.type === 'OBSOLETE' || h.request_type === 'OBSOLETE') || h.dar_no === (dar.dar_no || dar.id))) {
                  existingHist.push({
                    dar_no: dar.dar_no || dar.id,
                    revision: curRev,
                    rev: curRev,
                    target_revision: curRev,
                    type: 'OBSOLETE',
                    request_type: 'OBSOLETE',
                    status: 'COMPLETED',
                    effective_date: todayStr,
                    date: todayStr,
                    reason: dar.obsoleteReason || dar.reason || 'ขอยกเลิกเอกสาร'
                  });
                }

                return {
                  ...doc,
                  status: 'OBSOLETE',
                  is_obsolete: true,
                  obsolete_dar_id: dar.id,
                  obsolete_date: todayStr,
                  revision_history: existingHist
                };
              }
              return doc;
            });
            
            // 2. Mark active copies across ALL revisions as OBSOLETE_PENDING_RECALL
            const isTargetCopy = (inst) => {
              const cCode = inst.document_code || inst.doc_code || inst.docTitle;
              const isMatch = (targetDocCode && cCode === targetDocCode) || (targetDocId && String(inst.docId || inst.doc_id) === String(targetDocId));
              const isActive = inst.status === 'ACTIVE' || inst.status === 'ISSUED_ACTIVE' || inst.status === 'RECEIVED' || inst.status === 'DISPATCHED_PENDING_RECEIPT';
              return isMatch && isActive;
            };

            const obsoleteCopiesToRecall = newControlledCopyInstances.filter(isTargetCopy);

            newControlledCopyInstances = newControlledCopyInstances.map(inst => {
              if (isTargetCopy(inst)) {
                return {
                  ...inst,
                  status: 'OBSOLETE_PENDING_RECALL',
                  obsolete_at: new Date().toISOString(),
                  obsolete_by_dar: dar.dar_no || dar.id,
                  recall_reason: `เอกสารถูกประกาศยกเลิกการใช้งาน (Obsolete DAR ${dar.dar_no || dar.id})`
                };
              }
              return inst;
            });

            // 3. Invalidate/dismiss pending tasks for this document
            newTasks = newTasks.map(t => {
              const isTaskMatch = (t.document_code && t.document_code === targetDocCode) ||
                                  (t.doc_code && t.doc_code === targetDocCode) ||
                                  (t.docTitle && t.docTitle === targetDocCode) ||
                                  (t.doc_id && String(t.doc_id) === String(targetDocId)) ||
                                  (t.title && targetDocCode && t.title.includes(targetDocCode));
              const isPendingWorkflow = t.type === 'RECEIPT_CONFIRMATION' || t.type === 'DOCUMENT_RECEIPT' ||
                                        t.type === 'DCC_RECEIPT' || t.type === 'DAR_REVIEW' || t.type === 'DAR_APPROVE';
              if (isTaskMatch && isPendingWorkflow && t.status !== 'COMPLETED' && t.status !== 'DISMISSED') {
                return {
                  ...t,
                  status: 'DISMISSED',
                  is_dismissed: true,
                  dismissed_reason: `เอกสาร ${targetDocCode} ถูกยกเลิกการใช้งาน (OBSOLETE) จึงยกเลิกงานตกค้างอัตโนมัติ`
                };
              }
              return t;
            });
            
            // 4. Create DCC Recall Task
            const obsoleteTargetDoc = (newDocuments || []).find(d => (targetDocCode && (d.title === targetDocCode || d.document_code === targetDocCode)) || (targetDocId && String(d.id) === String(targetDocId)));
            const obsoleteDocOfficialTitle = obsoleteTargetDoc?.name || obsoleteTargetDoc?.document_name || dar.name || targetDocCode;
            newTasks.push({
              id: `task-recall-${targetDocCode}-ALL-${Date.now()}`,
              type: 'DCC_RECALL',
              assignee_department: 'DC',
              document_department: 'QC',
              taskType: 'RECALL',
              task_type: 'RECALL',
              targetRole: 'DCC_ADMIN',
              target_role: 'DCC_ADMIN',
              assignedToRole: 'DCC_ADMIN',
              assigneeId: resolveDccAdminUserId(state.masterUsers),
              department: 'DC',
              target_department: 'DC',
              docId: targetDocId,
              doc_id: targetDocId,
              document_code: targetDocCode,
              doc_code: targetDocCode,
              docCode: targetDocCode,
              docTitle: obsoleteDocOfficialTitle,
              docName: obsoleteDocOfficialTitle,
              targetRevision: 'ALL',
              revision: 'ALL',
              doc_version: 'ALL',
              title: `[เรียกคืนสำเนาเอกสารยกเลิก] ${obsoleteDocOfficialTitle} (${targetDocCode}) (ทั้งหมด ${obsoleteCopiesToRecall.length} เล่ม)`,
              description: `เอกสาร ${targetDocCode} (${obsoleteDocOfficialTitle}) ถูกประกาศยกเลิกการใช้งาน (OBSOLETE) แล้ว กรุณาเรียกคืนสำเนาทั้งหมด (${obsoleteCopiesToRecall.length} ชุด) เพื่อดำเนินการทำลายหรือจัดเก็บ`,
              copies_to_recall: obsoleteCopiesToRecall.map(c => ({
                id: c.id,
                copy_no: c.copy_no || c.copyNo,
                holder_dept: c.holder_dept || c.department,
                location: c.location || c.locationName,
                status: c.status
              })),
              supersededCopyIds: obsoleteCopiesToRecall.map(c => c.id),
              status: 'PENDING',
              dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
              priority: 'HIGH',
              darId: dar.id,
              createdAt: new Date().toISOString()
            });

            newNotifications.push({ id: Date.now() + Math.random(), userId: dar.requesterId, title: 'ยกเลิกเอกสารสำเร็จ', message: `เอกสาร "${targetDocCode}" ถูกยกเลิกและย้ายไปเก็บที่ Archive แล้ว`, isRead: false, link: '/library', timestamp: new Date().toISOString() });
          }

          newTimeline.push({
            id: Date.now() + Math.random(), darId: dar.id, action: 'Auto Publish', user: 'System (Lifecycle Engine)', date: new Date().toLocaleString(), comment: 'Document changed to EFFECTIVE status automatically'
          });
        });
      }

      if (darIdsToCancel.length === 0 && waitingEffectiveDars.length === 0 && JSON.stringify(newTasks) === JSON.stringify(state.tasks)) {
        return state;
      }

      return {
        tasks: cleanupDccTasks(newTasks, newControlledCopyInstances, newDocuments),
        dars: newDars,
        externalDocuments: newExtDocs,
        documents: newDocuments,
        timeline: newTimeline,
        documentControlledCopies: sanitizeControlledCopies(newControlledCopyInstances),
        controlledCopyInstances: sanitizeControlledCopies(newControlledCopyInstances),
        controlledCopies: sanitizeControlledCopies(newControlledCopyInstances),
        controlledCopyAuditTrail: newAuditTrail,
        notifications: newNotifications,
        actionLog: newActionLog,
        externalAuditTrail: newExtAuditTrail
      };
    });

    if (newlyCompletedDars.length > 0) {
      const store = get();
      newlyCompletedDars.forEach(dar => {
        store.syncRevisionEffective?.(dar);
        store.syncObsoleteCompleted?.(dar);
      });
    }
    get().checkScheduledEffectiveDocs?.();
    get().syncPeriodicReviewSchedulesAndTasks?.();
  }
});

