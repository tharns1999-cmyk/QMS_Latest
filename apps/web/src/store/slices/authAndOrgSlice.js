/**
 * Auth, Users & Organization Zustand Slice
 * Extracted from useStore.js (Phase 7 Refactor)
 */
import { 
  MASTER_DATA_USER,
  REQUEST_MASTER_DATA_USER,
  REVIEW_MASTER_DATA_USER,
  APPROVE_MASTER_DATA_USER
} from '../fixtures/seedData';
import {
  MASTER_DEPARTMENTS,
  SYSTEM_CORE_DEPTS,
  DEFAULT_SIGNATURE_SETTINGS,
  DEFAULT_SLA_SETTINGS,
  DEFAULT_APPROVAL_MATRIX
} from '../../modules/dcc/config/qmsRegistry';
import { STANDARD_STATIONS, cleanLocationName } from '../../modules/dcc/services/MasterDataService';
import { saveFile, resolveRawFileBlob } from '../../modules/dcc/utils/fileStorage';
import { isSameDepartment } from '../../modules/dcc/utils/taskFilter';

export const createAuthAndOrgSlice = (set, get) => ({
  // State
  masterUsers: MASTER_DATA_USER,
  isHydrated: false,
  requestUsers: REQUEST_MASTER_DATA_USER,
  reviewUsers: REVIEW_MASTER_DATA_USER,
  approveUsers: APPROVE_MASTER_DATA_USER,
  masterDepartments: MASTER_DEPARTMENTS,
  departments: MASTER_DEPARTMENTS,
  distributionLocations: JSON.parse(JSON.stringify(STANDARD_STATIONS.map(s => ({ ...s, status: s.status || 'ACTIVE' })))),
  signatureSettings: { ...DEFAULT_SIGNATURE_SETTINGS },
  slaSettings: { ...DEFAULT_SLA_SETTINGS },
  approvalMatrix: JSON.parse(JSON.stringify(DEFAULT_APPROVAL_MATRIX)),
  approval_matrix: JSON.parse(JSON.stringify(DEFAULT_APPROVAL_MATRIX)),

  // Additional Helper Routing Actions (Backward Compatibility)
  getApproversForDepartment: (departmentId, minLevel = 5) => {
    const users = get().masterUsers || MASTER_DATA_USER;
    return users.filter(u => {
      const matchDept = isSameDepartment(u.department || u.dept || u.primary_department, departmentId) ||
                        (Array.isArray(u.depts) && u.depts.some(d => isSameDepartment(d, departmentId))) ||
                        (Array.isArray(u.departments) && u.departments.some(d => isSameDepartment(d, departmentId))) ||
                        (Array.isArray(u.managedDepartments) && u.managedDepartments.includes('*'));
      const level = Number(u.approval_level || u.level) || 1;
      return matchDept && level >= minLevel && (u.status === 'ACTIVE' || u.status === 'Active');
    });
  },

  resolveApprovalRouting: (docType, departmentId) => {
    const matrix = get().approvalMatrix || DEFAULT_APPROVAL_MATRIX;
    const entry = matrix.find(m => (m.docType || m.doc_type) === docType) || matrix[0];
    const reviewers = get().getApproversForDepartment(departmentId, entry?.requiredReviewerLevel || entry?.required_reviewer_level || 4);
    const approvers = get().getApproversForDepartment(departmentId, entry?.requiredApproverLevel || entry?.required_approver_level || 5);
    return {
      entry,
      reviewers,
      approvers
    };
  },

  canUserApprove: (user, documentDept, requiredLevel = 4) => {
    if (!user) return false;
    if (user.role === 'QMR' || Boolean(user.isQmr)) return true;
    const userLevel = Number(user.approval_level || user.level) || 1;
    if (userLevel < requiredLevel) return false;
    if (Array.isArray(user.managedDepartments) && user.managedDepartments.includes('*')) return true;
    return isSameDepartment(user.department || user.dept || user.primary_department, documentDept) ||
      (Array.isArray(user.depts) && user.depts.some(d => isSameDepartment(d, documentDept)));
  },

  currentUser: { 
    ...MASTER_DATA_USER[0], 
    department: 'DC', 
    departments: ['DC'],
    secondaryDepartments: [],
    depts: ['DC'],
    primary_department: 'DC',
    affiliated_departments: ['DC']
  },

  setCurrentUser: (userId) => set((state) => {
    const targetId = typeof userId === 'object' && userId !== null ? (userId.id || userId.empId) : userId;
    const baseUser = state.masterUsers.find(u => u.id === targetId || u.empId === targetId) || (typeof userId === 'object' && userId !== null ? userId : null);
    if (!baseUser) return state;

    // Find departments from any of the lists
    const req = state.requestUsers.find(u => u.id === targetId || u.empId === targetId);
    const rev = state.reviewUsers.find(u => u.id === targetId || u.empId === targetId);
    const app = state.approveUsers.find(u => u.id === targetId || u.empId === targetId);
    let depts = baseUser.depts || req?.depts || rev?.depts || app?.depts || (baseUser.department ? [baseUser.department] : ['DC']);

    // The primary active department
    let userDeptsList = Array.isArray(baseUser.departments) ? baseUser.departments : (Array.isArray(depts) ? depts : [baseUser.department].filter(Boolean));
    let activeDept = baseUser.primary_department || baseUser.department || userDeptsList[0] || 'DC';
    if (activeDept === 'QA/QC') activeDept = 'QC';

    userDeptsList = userDeptsList.map(d => (d === 'QA/QC') ? 'QC' : d);
    depts = depts.map(d => (d === 'QA/QC') ? 'QC' : d);

    const rawSecondary = baseUser.secondaryDepartments || (Array.isArray(baseUser.affiliated_departments) ? baseUser.affiliated_departments.filter(d => d !== activeDept) : userDeptsList.filter(d => d !== activeDept));
    const secondaryDepts = rawSecondary.map(d => (d === 'QA/QC') ? 'QC' : d).filter(d => d !== activeDept);
    const affiliated = Array.from(new Set([activeDept, ...secondaryDepts, ...userDeptsList])).map(d => (d === 'QA/QC') ? 'QC' : d);

    const permissions = (baseUser.permissions && baseUser.permissions.length > 0)
      ? baseUser.permissions
      : ['DAR_CREATE', 'TASK_ACCESS', 'VIEW_REGISTER'];

    return { 
      currentUser: { 
        ...baseUser, 
        department: activeDept, 
        primary_department: activeDept, 
        primaryDepartment: activeDept,
        departments: Array.from(new Set(userDeptsList)),
        departmentMemberships: Array.from(new Set(userDeptsList)),
        secondaryDepartments: Array.from(new Set(secondaryDepts)),
        affiliated_departments: affiliated,
        depts: Array.from(new Set(depts)),
        permissions,
        canCreateDar: baseUser.canCreateDar !== undefined ? Boolean(baseUser.canCreateDar) : true,
        canAccessTasks: baseUser.canAccessTasks !== undefined ? Boolean(baseUser.canAccessTasks) : true,
        canViewRegister: baseUser.canViewRegister !== undefined ? Boolean(baseUser.canViewRegister) : true,
        isWorkflowUser: baseUser.isWorkflowUser !== undefined ? Boolean(baseUser.isWorkflowUser) : true
      }
    };
  }),

  switchUser: (userId) => {
    get().setCurrentUser(userId);
  },

  getCurrentUser: () => get().currentUser,

  selectCurrentUser: (state) => state.currentUser,

  addMasterUser: (userData) => {
    let finalUsersList = [];
    let createdUser = null;

    set((state) => {
      const newId = userData.id || `U${String(Date.now()).slice(-4)}`;
      const empId = userData.empId || `EMP-${String((state.masterUsers || []).length + 1).padStart(3, '0')}`;
      const primaryDept = userData.primary_department || userData.department || userData.dept || 'QA/QC';
      const rawAffiliated = userData.affiliated_departments || userData.depts || (userData.department ? [userData.department] : [primaryDept]);
      const affiliatedDepts = Array.from(new Set([primaryDept, ...(Array.isArray(rawAffiliated) ? rawAffiliated : [rawAffiliated])]));
      const approvalLevel = Number(userData.approval_level || userData.level) || 1;
      const isQmr = userData.role === 'QMR' || Boolean(userData.isQmr);
      const isDcc = userData.role === 'DCC_ADMIN' || Boolean(userData.isDcc);

      const basePermissions = ['DAR_CREATE', 'TASK_ACCESS', 'VIEW_REGISTER'];
      if (isDcc) basePermissions.push('DCC_ADMIN');
      if (isQmr) basePermissions.push('QMR_ACCESS');
      const userPermissions = (userData.permissions && userData.permissions.length > 0)
        ? Array.from(new Set([...basePermissions, ...userData.permissions]))
        : basePermissions;

      const newUser = {
        id: newId,
        empId,
        name: userData.name,
        fullName: userData.fullName || userData.name,
        email: userData.email || `${newId.toLowerCase()}@company.com`,
        department: primaryDept,
        dept: primaryDept,
        primary_department: primaryDept,
        depts: affiliatedDepts,
        affiliated_departments: affiliatedDepts,
        position: userData.position || 'Staff',
        role: userData.role || 'GENERAL_USER',
        level: approvalLevel,
        approval_level: approvalLevel,
        isDcc,
        isQmr,
        status: userData.status || 'Active',
        pin: userData.pin || '123456',
        failedPinAttempts: 0,
        isLocked: false,
        lastPinChangedAt: new Date().toISOString(),
        permissions: userPermissions,
        canCreateDar: userData.canCreateDar !== undefined ? Boolean(userData.canCreateDar) : true,
        canAccessTasks: userData.canAccessTasks !== undefined ? Boolean(userData.canAccessTasks) : true,
        canViewRegister: userData.canViewRegister !== undefined ? Boolean(userData.canViewRegister) : true,
        isWorkflowUser: userData.isWorkflowUser !== undefined ? Boolean(userData.isWorkflowUser) : true,
        signatureType: userData.signatureType || 'TYPOGRAPHIC',
        signatureStyle: userData.signatureStyle || 'MODERN_SANS',
        signatureInitials: userData.signatureInitials || `${(userData.name || newId).slice(0, 3).toUpperCase()}-${primaryDept}`,
        signatureImage: userData.signatureImage || null,
        hasRegisteredSignature: Boolean(userData.signatureImage || userData.hasRegisteredSignature)
      };

      const updatedUsers = [...(state.masterUsers || []), newUser];
      finalUsersList = updatedUsers;
      createdUser = newUser;

      const userRoleObj = (u) => ({
        id: u.id,
        empId: u.empId || u.id,
        name: u.name,
        depts: u.affiliated_departments || u.depts,
        affiliated_departments: u.affiliated_departments || u.depts,
        department: u.primary_department || u.department,
        primary_department: u.primary_department || u.department,
        level: u.approval_level || u.level,
        approval_level: u.approval_level || u.level,
        signatureImage: u.signatureImage
      });

      return {
        masterUsers: updatedUsers,
        requestUsers: updatedUsers.map(userRoleObj),
        reviewUsers: updatedUsers.map(userRoleObj),
        approveUsers: updatedUsers.map(userRoleObj),
        actionLog: [{
          id: `LOG-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          actionType: 'MASTER_USER_CREATED',
          actor: state.currentUser?.name || 'DCC Officer',
          details: `Created user ${newUser.name} (${newUser.id}) with role ${newUser.role}`,
          timestamp: new Date().toISOString()
        }, ...(state.actionLog || [])]
      };
    });

    if (createdUser?.signatureImage) {
      const sigKey = `user_sig_${createdUser.id}`;
      saveFile(sigKey, createdUser.signatureImage).catch(err => console.error('Failed to save user signature:', err));
    }
    // Direct persistence of masterUsers to IndexedDB
    const cleanUsers = (finalUsersList || []).map(u => ({ ...u, signatureImage: null }));
    saveFile('master_users_persistent_data', cleanUsers).catch(err => console.error('Failed to sync masterUsers list:', err));
  },

  updateMasterUser: (userId, userData) => {
    let finalUsersList = [];

    set((state) => {
      const updatedUsers = (state.masterUsers || []).map(u => {
        if (u.id === userId || u.userId === userId) {
          const primaryDept = userData.primary_department || userData.department || u.primary_department || u.department || 'QA/QC';
          const rawAffiliated = userData.affiliated_departments || userData.depts || u.affiliated_departments || u.depts || [primaryDept];
          const affiliatedDepts = Array.from(new Set([primaryDept, ...(Array.isArray(rawAffiliated) ? rawAffiliated : [rawAffiliated])]));
          const approvalLevel = userData.approval_level !== undefined 
            ? Number(userData.approval_level) 
            : (userData.level !== undefined ? Number(userData.level) : (u.approval_level || u.level || 1));
          const isQmr = userData.role === 'QMR' ? true : (userData.isQmr !== undefined ? Boolean(userData.isQmr) : Boolean(u.isQmr));

          const updated = {
            ...u,
            ...userData,
            department: primaryDept,
            dept: primaryDept,
            primary_department: primaryDept,
            depts: affiliatedDepts,
            affiliated_departments: affiliatedDepts,
            level: approvalLevel,
            approval_level: approvalLevel,
            isDcc: userData.role === 'DCC_ADMIN' ? true : (userData.role ? false : u.isDcc),
            isQmr: isQmr,
            permissions: (userData.permissions && userData.permissions.length > 0) ? userData.permissions : (u.permissions?.length > 0 ? u.permissions : ['DAR_CREATE', 'TASK_ACCESS', 'VIEW_REGISTER']),
            canCreateDar: userData.canCreateDar !== undefined ? Boolean(userData.canCreateDar) : (u.canCreateDar ?? true),
            canAccessTasks: userData.canAccessTasks !== undefined ? Boolean(userData.canAccessTasks) : (u.canAccessTasks ?? true),
            canViewRegister: userData.canViewRegister !== undefined ? Boolean(userData.canViewRegister) : (u.canViewRegister ?? true),
            isWorkflowUser: userData.isWorkflowUser !== undefined ? Boolean(userData.isWorkflowUser) : (u.isWorkflowUser ?? true)
          };
          return updated;
        }
        return u;
      });

      finalUsersList = updatedUsers;

      const updatedCurrentUser = (state.currentUser?.id === userId || state.currentUser?.userId === userId)
        ? { ...state.currentUser, ...(updatedUsers.find(u => u.id === userId || u.userId === userId) || {}) }
        : state.currentUser;

      const userRoleObj = (u) => ({
        id: u.id,
        empId: u.empId || u.id,
        name: u.name,
        depts: u.affiliated_departments || u.depts,
        affiliated_departments: u.affiliated_departments || u.depts,
        department: u.primary_department || u.department,
        primary_department: u.primary_department || u.department,
        level: u.approval_level || u.level,
        approval_level: u.approval_level || u.level,
        signatureImage: u.signatureImage
      });

      return {
        masterUsers: updatedUsers,
        currentUser: updatedCurrentUser,
        requestUsers: updatedUsers.map(userRoleObj),
        reviewUsers: updatedUsers.map(userRoleObj),
        approveUsers: updatedUsers.map(userRoleObj),
        actionLog: [{
          id: `LOG-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          actionType: 'MASTER_USER_UPDATED',
          actor: state.currentUser?.name || 'DCC Officer',
          details: `Updated user ${userId}`,
          timestamp: new Date().toISOString()
        }, ...(state.actionLog || [])]
      };
    });

    if (userData?.signatureImage) {
      const sigKey = `user_sig_${userId}`;
      saveFile(sigKey, userData.signatureImage).catch(err => console.error('Failed to save signature to IndexedDB:', err));
    }
    // Direct persistence of masterUsers to IndexedDB
    const cleanUsers = (finalUsersList || []).map(u => ({ ...u, signatureImage: null }));
    saveFile('master_users_persistent_data', cleanUsers).catch(err => console.error('Failed to sync masterUsers to IndexedDB:', err));
  },

  toggleUserStatus: (userId) => {
    let finalUsersList = [];

    set((state) => {
      const updatedUsers = (state.masterUsers || []).map(u => {
        if (u.id === userId || u.userId === userId) {
          const newStatus = u.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
          return { ...u, status: newStatus };
        }
        return u;
      });

      finalUsersList = updatedUsers;

      const userRoleObj = (u) => ({
        id: u.id,
        empId: u.empId || u.id,
        name: u.name,
        depts: u.affiliated_departments || u.depts,
        affiliated_departments: u.affiliated_departments || u.depts,
        department: u.primary_department || u.department,
        primary_department: u.primary_department || u.department,
        level: u.approval_level || u.level,
        approval_level: u.approval_level || u.level,
        signatureImage: u.signatureImage
      });

      return {
        masterUsers: updatedUsers,
        requestUsers: updatedUsers.map(userRoleObj),
        reviewUsers: updatedUsers.map(userRoleObj),
        approveUsers: updatedUsers.map(userRoleObj)
      };
    });

    const cleanUsers = (finalUsersList || []).map(u => ({ ...u, signatureImage: null }));
    saveFile('master_users_persistent_data', cleanUsers).catch(err => console.error('Failed to sync masterUsers status to IndexedDB:', err));
  },

  resetUserPassword: (userId) => set((state) => {
    return {
      actionLog: [{
        id: `LOG-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        actionType: 'MASTER_USER_PASSWORD_RESET',
        actor: state.currentUser?.name || 'DCC Officer',
        details: `Reset password to default for user ${userId}`,
        timestamp: new Date().toISOString()
      }, ...(state.actionLog || [])]
    };
  }),

  resetUserPin: (userId) => {
    let finalUsersList = [];

    set((state) => {
      const defaultPin = state.signatureSettings?.defaultPin || '123456';
      const updatedUsers = (state.masterUsers || []).map(u => {
        if (u.id === userId || u.userId === userId) {
          return { 
            ...u, 
            pin: defaultPin, 
            failedPinAttempts: 0, 
            isLocked: false, 
            lastPinChangedAt: new Date().toISOString() 
          };
        }
        return u;
      });

      finalUsersList = updatedUsers;

      return {
        masterUsers: updatedUsers,
        actionLog: [{
          id: `LOG-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          actionType: 'MASTER_USER_PIN_RESET',
          actor: state.currentUser?.name || 'DCC Officer',
          details: `Reset signing PIN to default for user ${userId}`,
          timestamp: new Date().toISOString()
        }, ...(state.actionLog || [])]
      };
    });

    const cleanUsers = (finalUsersList || []).map(u => ({ ...u, signatureImage: null }));
    saveFile('master_users_persistent_data', cleanUsers).catch(err => console.error('Failed to sync masterUsers after PIN reset:', err));
  },

  unlockUserAccount: (userId) => {
    let finalUsersList = [];

    set((state) => {
      const updatedUsers = (state.masterUsers || []).map(u => {
        if (u.id === userId || u.userId === userId) {
          return { ...u, isLocked: false, failedPinAttempts: 0 };
        }
        return u;
      });

      finalUsersList = updatedUsers;

      return {
        masterUsers: updatedUsers,
        actionLog: [{
          id: `LOG-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          actionType: 'MASTER_USER_UNLOCKED',
          actor: state.currentUser?.name || 'DCC Officer',
          details: `Unlocked account for user ${userId}`,
          timestamp: new Date().toISOString()
        }, ...(state.actionLog || [])]
      };
    });

    const cleanUsers = (finalUsersList || []).map(u => ({ ...u, signatureImage: null }));
    saveFile('master_users_persistent_data', cleanUsers).catch(err => console.error('Failed to sync masterUsers after unlock:', err));
  },

  updateUserSignatureProfile: (userId, profileData) => {
    let finalUsersList = [];

    set((state) => {
      const updatedUsers = (state.masterUsers || []).map(u => {
        if (u.id === userId || u.userId === userId) {
          return {
            ...u,
            ...profileData,
            hasRegisteredSignature: true,
            lastSignatureUpdatedAt: new Date().toISOString()
          };
        }
        return u;
      });

      finalUsersList = updatedUsers;

      const updatedCurrentUser = (state.currentUser?.id === userId || state.currentUser?.userId === userId)
        ? { ...state.currentUser, ...(updatedUsers.find(u => u.id === userId || u.userId === userId) || {}) }
        : state.currentUser;

      const userRoleObj = (u) => ({
        id: u.id,
        empId: u.empId || u.id,
        name: u.name,
        depts: u.affiliated_departments || u.depts,
        affiliated_departments: u.affiliated_departments || u.depts,
        department: u.primary_department || u.department,
        primary_department: u.primary_department || u.department,
        level: u.approval_level || u.level,
        approval_level: u.approval_level || u.level,
        signatureImage: u.signatureImage
      });

      return {
        masterUsers: updatedUsers,
        currentUser: updatedCurrentUser,
        requestUsers: updatedUsers.map(userRoleObj),
        reviewUsers: updatedUsers.map(userRoleObj),
        approveUsers: updatedUsers.map(userRoleObj),
        actionLog: [{
          id: `LOG-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
          actionType: 'MASTER_USER_SIGNATURE_UPDATED',
          action: 'อัปเดตโปรไฟล์ลายเซ็นดิจิทัล',
          actor: state.currentUser?.name || 'DCC Officer',
          user: state.currentUser?.name || 'DCC Officer',
          details: `Updated digital signature profile for user ${userId} (${profileData.signatureType || 'TYPOGRAPHIC'})`,
          timestamp: new Date().toISOString(),
          created_at: new Date().toISOString(),
          date: new Date().toISOString(),
          category: 'SYSTEM'
        }, ...(state.actionLog || [])]
      };
    });

    if (profileData?.signatureImage) {
      const sigKey = `user_sig_${userId}`;
      saveFile(sigKey, profileData.signatureImage).catch(err => console.error('Failed to persist signature to IndexedDB:', err));
    }
    const cleanUsers = (finalUsersList || []).map(u => ({ ...u, signatureImage: null }));
    saveFile('master_users_persistent_data', cleanUsers).catch(err => console.error('Failed to sync masterUsers list:', err));
  },

  updateUserSignature: async (userId, signatureDataUrl) => {
    // บันทึกภาพ Base64 ลง IndexedDB ทันที
    const sigKey = `user_sig_${userId}`;
    try {
      await saveFile(sigKey, signatureDataUrl);
    } catch (e) {
      console.error('Failed to persist signature to IndexedDB:', e);
    }

    // อัปเดต State ภายใน Store
    const updatedUsers = (get().masterUsers || []).map(user => {
      if (user.id === userId || user.userId === userId) {
        return {
          ...user,
          signatureImage: signatureDataUrl,
          hasSignature: Boolean(signatureDataUrl),
          hasRegisteredSignature: Boolean(signatureDataUrl),
          updatedAt: new Date().toISOString(),
          lastSignatureUpdatedAt: new Date().toISOString()
        };
      }
      return user;
    });

    const userRoleObj = (u) => ({
      id: u.id,
      empId: u.empId || u.id,
      name: u.name,
      depts: u.affiliated_departments || u.depts,
      affiliated_departments: u.affiliated_departments || u.depts,
      department: u.primary_department || u.department,
      primary_department: u.primary_department || u.department,
      level: u.approval_level || u.level,
      approval_level: u.approval_level || u.level,
      signatureImage: u.signatureImage
    });

    const currentUser = get().currentUser;
    const updatedCurrentUser = (currentUser?.id === userId || currentUser?.userId === userId)
      ? { ...currentUser, signatureImage: signatureDataUrl, hasSignature: Boolean(signatureDataUrl), hasRegisteredSignature: Boolean(signatureDataUrl) }
      : currentUser;

    set({
      masterUsers: updatedUsers,
      currentUser: updatedCurrentUser,
      requestUsers: updatedUsers.map(userRoleObj),
      reviewUsers: updatedUsers.map(userRoleObj),
      approveUsers: updatedUsers.map(userRoleObj)
    });

    // บันทึก MasterUsers Array ล่าสุดลง IndexedDB (ตัดก้อน base64 ออก เพื่อรักษา metadata)
    try {
      const cleanUsers = updatedUsers.map(u => ({
        ...u,
        signatureImage: null // ป้องกันข้อมูลบวม ให้ดึงจาก user_sig_${userId} แยกต่างหาก
      }));
      await saveFile('master_users_persistent_data', cleanUsers);
    } catch (e) {
      console.error('Failed to sync masterUsers list:', e);
    }
  },

  hydrateMasterData: async () => {
    try {
      // 3.1 ดึงรายชื่อ MasterUsers ล่าสุดจาก IndexedDB
      const savedUsersRaw = await resolveRawFileBlob('master_users_persistent_data');
      let savedUsers = savedUsersRaw;
      if (typeof savedUsers === 'string') {
        try {
          savedUsers = JSON.parse(savedUsers);
        } catch {
          // not json string
        }
      }

      let baseUsers = get().masterUsers || [];

      if (savedUsers && Array.isArray(savedUsers) && savedUsers.length > 0) {
        // Saved data from IndexedDB takes precedence to prevent seed overwrite
        const savedMap = new Map();
        savedUsers.forEach(u => {
          const key = u.id || u.userId;
          if (key) savedMap.set(key, u);
        });

        // Start with saved users, and append any unedited initial seed users if not already present
        const mergedUsers = [...savedUsers];
        (baseUsers || []).forEach(seedUser => {
          const key = seedUser.id || seedUser.userId;
          if (key && !savedMap.has(key)) {
            mergedUsers.push(seedUser);
          }
        });
        baseUsers = mergedUsers;
      }

      // 3.2 ดึงภาพลายเซ็นเฉพาะตัวของแต่ละ User จาก IndexedDB มาประกอบคืน
      const hydratedUsers = await Promise.all(
        baseUsers.map(async (user) => {
          const userId = user.id || user.userId;
          const sigKey = `user_sig_${userId}`;
          let savedSig = await resolveRawFileBlob(sigKey);

          if (typeof Blob !== 'undefined' && savedSig instanceof Blob) {
            savedSig = await new Promise((resolve) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result);
              reader.onerror = () => resolve(null);
              reader.readAsDataURL(savedSig);
            });
          }

          const finalSig = savedSig || user.signatureImage || null;
          return {
            ...user,
            signatureImage: finalSig,
            hasSignature: Boolean(finalSig),
            hasRegisteredSignature: Boolean(finalSig || user.hasRegisteredSignature)
          };
        })
      );

      const userRoleObj = (u) => ({
        id: u.id,
        empId: u.empId || u.id,
        name: u.name,
        depts: u.affiliated_departments || u.depts,
        affiliated_departments: u.affiliated_departments || u.depts,
        department: u.primary_department || u.department,
        primary_department: u.primary_department || u.department,
        level: u.approval_level || u.level,
        approval_level: u.approval_level || u.level,
        signatureImage: u.signatureImage
      });

      const current = get().currentUser;
      const updatedCurrentUser = current 
        ? (hydratedUsers.find(u => u.id === current.id || u.userId === current.id) 
            ? { ...current, ...(hydratedUsers.find(u => u.id === current.id || u.userId === current.id) || {}) } 
            : current)
        : current;

      set({
        masterUsers: hydratedUsers,
        currentUser: updatedCurrentUser,
        requestUsers: hydratedUsers.map(userRoleObj),
        reviewUsers: hydratedUsers.map(userRoleObj),
        approveUsers: hydratedUsers.map(userRoleObj),
        isHydrated: true
      });

      // Seed protection: If no savedUsers existed yet in IndexedDB, persist baseline
      if (!savedUsers || !Array.isArray(savedUsers) || savedUsers.length === 0) {
        const cleanUsers = hydratedUsers.map(u => ({ ...u, signatureImage: null }));
        await saveFile('master_users_persistent_data', cleanUsers);
      }

      console.log('✅ Master data & signatures hydrated successfully from IndexedDB');
    } catch (error) {
      console.error('Error hydrating master data from IndexedDB:', error);
      set({ isHydrated: true });
    }
  },

  addDepartment: (deptData) => {
    try {
      set((state) => {
        const rawId = String(deptData?.id || deptData?.code || deptData?.deptCode || '').toUpperCase().trim();
        const rawNameTh = String(deptData?.nameTh || deptData?.name || deptData?.name_th || rawId).trim();
        const rawNameEn = String(deptData?.nameEn || deptData?.name_en || deptData?.name || rawId).trim();
        const headNameVal = deptData?.headName || deptData?.manager || '';

        if (!rawId) {
          throw new Error('รหัสแผนกไม่ถูกต้อง');
        }

        const newDept = {
          id: rawId,
          code: rawId,
          deptCode: rawId,
          name: rawNameTh,
          nameTh: rawNameTh,
          name_th: rawNameTh,
          nameEn: rawNameEn,
          name_en: rawNameEn,
          headUserId: deptData?.headUserId || '',
          headName: headNameVal,
          manager: headNameVal,
          status: deptData?.status || 'ACTIVE',
          color: deptData?.color || 'indigo'
        };

        const currentDepts = state.departments || state.masterDepartments || [];
        if (currentDepts.some(d => String(d.id || d.code || d.deptCode || '').toUpperCase().trim() === newDept.id)) {
          throw new Error(`รหัสแผนก "${newDept.id}" มีอยู่ในระบบแล้ว`);
        }

        const updatedDepts = [...currentDepts, newDept];
        return {
          departments: updatedDepts,
          masterDepartments: updatedDepts,
          actionLog: [{
            id: `LOG-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            actionType: 'MASTER_DEPT_CREATED',
            actor: state.currentUser?.name || 'DCC Officer',
            details: `Created department ${newDept.id} (${newDept.nameTh})`,
            timestamp: new Date().toISOString()
          }, ...(state.actionLog || [])]
        };
      });
      return true;
    } catch (err) {
      console.error('addDepartment error:', err);
      throw err;
    }
  },

  updateDepartment: (deptId, deptData) => {
    try {
      set((state) => {
        const currentDepts = state.departments || state.masterDepartments || [];
        const oldCode = String(deptId || deptData?.oldCode || '').trim().toUpperCase();
        const newCode = String(deptData?.id || deptData?.code || deptData?.deptCode || deptId || '').trim().toUpperCase();
        const isCodeChanged = Boolean(oldCode && newCode && oldCode !== newCode);

        if (!newCode) {
          throw new Error('รหัสแผนกไม่ถูกต้อง');
        }

        // Case-Insensitive Uniqueness Check (prevent duplicate department code)
        if (isCodeChanged) {
          const duplicateDept = currentDepts.find(d => {
            const existingCode = String(d.id || d.code || d.deptCode || '').trim().toUpperCase();
            const isSelf = existingCode === oldCode;
            return !isSelf && existingCode === newCode;
          });
          if (duplicateDept) {
            throw new Error(`รหัสแผนก "${newCode}" มีอยู่ในระบบแล้ว กรุณาใช้รหัสอื่น`);
          }
        }

        const headNameVal = deptData.headName !== undefined 
          ? deptData.headName 
          : (deptData.manager !== undefined ? deptData.manager : undefined);

        // 1. Update Departments Collection
        const updatedDepts = currentDepts.map(d => {
          const c = String(d.id || d.code || d.deptCode || '').trim().toUpperCase();
          if (c === oldCode) {
            return {
              ...d,
              ...deptData,
              id: newCode,
              code: newCode,
              deptCode: newCode,
              name: deptData.name || deptData.nameTh || d.name,
              nameTh: deptData.nameTh || deptData.name || d.nameTh,
              name_th: deptData.nameTh || deptData.name || d.name_th || d.nameTh,
              nameEn: deptData.nameEn !== undefined ? deptData.nameEn : (d.nameEn || d.name_en || ''),
              name_en: deptData.nameEn !== undefined ? deptData.nameEn : (d.name_en || d.nameEn || ''),
              headUserId: deptData.headUserId !== undefined ? deptData.headUserId : d.headUserId,
              headName: headNameVal !== undefined ? headNameVal : (d.headName || d.manager || ''),
              manager: headNameVal !== undefined ? headNameVal : (d.manager || d.headName || '')
            };
          }
          return d;
        });

    // If code has NOT changed, return simple single-collection update
    if (!isCodeChanged) {
      return {
        departments: updatedDepts,
        masterDepartments: updatedDepts,
        actionLog: [{
          id: `LOG-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          actionType: 'MASTER_DEPT_UPDATED',
          actor: state.currentUser?.name || 'DCC Officer',
          details: `Updated department ${deptId}`,
          timestamp: new Date().toISOString()
        }, ...(state.actionLog || [])]
      };
    }

    // 2. Cascading Relational Propagation Engine (Atomic-like single set call)
    const matchDept = (val) => {
      if (!val) return false;
      if (typeof val === 'string') {
        return val.trim().toUpperCase() === oldCode;
      }
      if (typeof val === 'object') {
        const code = val.id || val.code || val.dept || val.department || val.departmentId;
        return typeof code === 'string' && code.trim().toUpperCase() === oldCode;
      }
      return false;
    };

    const replaceDeptString = (val) => {
      if (!val) return val;
      if (typeof val === 'string') {
        return val.trim().toUpperCase() === oldCode ? newCode : val;
      }
      return val;
    };

    // 2.1 Master Users & Participant lists
    const updateUsersCollection = (usersList) => {
      if (!Array.isArray(usersList)) return usersList;
      return usersList.map(u => {
        let changed = false;
        let updated = { ...u };
        if (matchDept(u.department)) { updated.department = newCode; changed = true; }
        if (matchDept(u.dept)) { updated.dept = newCode; changed = true; }
        if (matchDept(u.primary_department)) { updated.primary_department = newCode; changed = true; }
        if (matchDept(u.dept_code)) { updated.dept_code = newCode; changed = true; }
        if (Array.isArray(u.departments)) {
          updated.departments = u.departments.map(d => replaceDeptString(d));
          changed = true;
        }
        if (Array.isArray(u.secondaryDepartments)) {
          updated.secondaryDepartments = u.secondaryDepartments.map(d => replaceDeptString(d));
          changed = true;
        }
        if (Array.isArray(u.affiliated_departments)) {
          updated.affiliated_departments = u.affiliated_departments.map(d => replaceDeptString(d));
          changed = true;
        }
        if (Array.isArray(u.depts)) {
          updated.depts = u.depts.map(d => replaceDeptString(d));
          changed = true;
        }
        return changed ? updated : u;
      });
    };

    const updatedMasterUsers = updateUsersCollection(state.masterUsers);
    const updatedRequestUsers = updateUsersCollection(state.requestUsers);
    const updatedReviewUsers = updateUsersCollection(state.reviewUsers);
    const updatedApproveUsers = updateUsersCollection(state.approveUsers);

    // 2.2 Current Session User (Prevent privilege loss)
    let updatedCurrentUser = state.currentUser;
    if (state.currentUser) {
      let cuChanged = false;
      let newCu = { ...state.currentUser };
      if (matchDept(newCu.department)) { newCu.department = newCode; cuChanged = true; }
      if (matchDept(newCu.dept)) { newCu.dept = newCode; cuChanged = true; }
      if (matchDept(newCu.primary_department)) { newCu.primary_department = newCode; cuChanged = true; }
      if (matchDept(newCu.dept_code)) { newCu.dept_code = newCode; cuChanged = true; }
      if (Array.isArray(newCu.departments)) {
        newCu.departments = newCu.departments.map(d => replaceDeptString(d));
        cuChanged = true;
      }
      if (Array.isArray(newCu.secondaryDepartments)) {
        newCu.secondaryDepartments = newCu.secondaryDepartments.map(d => replaceDeptString(d));
        cuChanged = true;
      }
      if (Array.isArray(newCu.affiliated_departments)) {
        newCu.affiliated_departments = newCu.affiliated_departments.map(d => replaceDeptString(d));
        cuChanged = true;
      }
      if (Array.isArray(newCu.depts)) {
        newCu.depts = newCu.depts.map(d => replaceDeptString(d));
        cuChanged = true;
      }
      if (cuChanged) {
        updatedCurrentUser = newCu;
      }
    }

    // 2.3 Master Documents
    const updatedDocuments = (state.documents || []).map(doc => {
      let changed = false;
      let updated = { ...doc };

      if (matchDept(doc.department)) { updated.department = newCode; changed = true; }
      if (matchDept(doc.owner_dept)) { updated.owner_dept = newCode; changed = true; }
      if (matchDept(doc.dept)) { updated.dept = newCode; changed = true; }
      if (matchDept(doc.dept_code)) { updated.dept_code = newCode; changed = true; }

      if (Array.isArray(doc.controlledCopies)) {
        updated.controlledCopies = doc.controlledCopies.map(copy => {
          let copyChanged = false;
          let c = { ...copy };
          if (matchDept(c.department)) { c.department = newCode; copyChanged = true; }
          if (matchDept(c.holder_dept)) { c.holder_dept = newCode; copyChanged = true; }
          if (matchDept(c.dept)) { c.dept = newCode; copyChanged = true; }
          return copyChanged ? c : copy;
        });
        changed = true;
      }

      if (Array.isArray(doc.distributions)) {
        updated.distributions = doc.distributions.map(dist => {
          let distChanged = false;
          let d = { ...dist };
          if (matchDept(d.departmentId)) { d.departmentId = newCode; distChanged = true; }
          if (matchDept(d.department)) { d.department = newCode; distChanged = true; }
          if (matchDept(d.dept)) { d.dept = newCode; distChanged = true; }
          return distChanged ? d : dist;
        });
        changed = true;
      }
      if (Array.isArray(doc.distributed_depts)) {
        updated.distributed_depts = doc.distributed_depts.map(d => replaceDeptString(d));
        changed = true;
      }
      if (Array.isArray(doc.distributionTargets)) {
        updated.distributionTargets = doc.distributionTargets.map(d => replaceDeptString(d));
        changed = true;
      }

      if (doc.access_control && Array.isArray(doc.access_control.departments)) {
        updated.access_control = {
          ...doc.access_control,
          departments: doc.access_control.departments.map(d => replaceDeptString(d))
        };
        changed = true;
      }
      if (Array.isArray(doc.accessDepartments)) {
        updated.accessDepartments = doc.accessDepartments.map(d => replaceDeptString(d));
        changed = true;
      }

      return changed ? updated : doc;
    });

    // 2.4 Controlled Copies (Store Collections)
    const updateCopiesCollection = (copiesList) => {
      if (!Array.isArray(copiesList)) return copiesList;
      return copiesList.map(copy => {
        let changed = false;
        let c = { ...copy };
        if (matchDept(c.department)) { c.department = newCode; changed = true; }
        if (matchDept(c.holder_dept)) { c.holder_dept = newCode; changed = true; }
        if (matchDept(c.dept)) { c.dept = newCode; changed = true; }
        return changed ? c : copy;
      });
    };

    const updatedControlledCopyInstances = updateCopiesCollection(state.controlledCopyInstances);
    const updatedDocumentControlledCopies = updateCopiesCollection(state.documentControlledCopies);

    // 2.5 External Documents
    const updatedExternalDocuments = (state.externalDocuments || []).map(doc => {
      let changed = false;
      let updated = { ...doc };

      if (matchDept(doc.department)) { updated.department = newCode; changed = true; }
      if (matchDept(doc.dept)) { updated.dept = newCode; changed = true; }
      if (matchDept(doc.owner_dept)) { updated.owner_dept = newCode; changed = true; }

      if (Array.isArray(doc.distributions)) {
        updated.distributions = doc.distributions.map(dist => {
          let distChanged = false;
          let d = { ...dist };
          if (matchDept(d.departmentId)) { d.departmentId = newCode; distChanged = true; }
          if (matchDept(d.department)) { d.department = newCode; distChanged = true; }
          if (matchDept(d.dept)) { d.dept = newCode; distChanged = true; }
          return distChanged ? d : dist;
        });
        changed = true;
      }
      if (Array.isArray(doc.distributed_depts)) {
        updated.distributed_depts = doc.distributed_depts.map(d => replaceDeptString(d));
        changed = true;
      }
      if (Array.isArray(doc.accessDepartments)) {
        updated.accessDepartments = doc.accessDepartments.map(d => replaceDeptString(d));
        changed = true;
      }
      if (Array.isArray(doc.controlledCopies)) {
        updated.controlledCopies = doc.controlledCopies.map(copy => {
          let copyChanged = false;
          let c = { ...copy };
          if (matchDept(c.department)) { c.department = newCode; copyChanged = true; }
          if (matchDept(c.holder_dept)) { c.holder_dept = newCode; copyChanged = true; }
          if (matchDept(c.dept)) { c.dept = newCode; copyChanged = true; }
          return copyChanged ? c : copy;
        });
        changed = true;
      }

      return changed ? updated : doc;
    });

    // 2.6 DAR Workflow Records
    const updateDarsCollection = (darList) => {
      if (!Array.isArray(darList)) return darList;
      return darList.map(dar => {
        let changed = false;
        let updated = { ...dar };

        if (matchDept(dar.department)) { updated.department = newCode; changed = true; }
        if (matchDept(dar.requestingDepartment)) { updated.requestingDepartment = newCode; changed = true; }
        if (matchDept(dar.requesting_dept)) { updated.requesting_dept = newCode; changed = true; }
        if (matchDept(dar.dept)) { updated.dept = newCode; changed = true; }
        if (matchDept(dar.owner_dept)) { updated.owner_dept = newCode; changed = true; }
        if (matchDept(dar.targetDept)) { updated.targetDept = newCode; changed = true; }

        if (Array.isArray(dar.targetDepartments)) {
          updated.targetDepartments = dar.targetDepartments.map(d => replaceDeptString(d));
          changed = true;
        }
        if (Array.isArray(dar.distributions)) {
          updated.distributions = dar.distributions.map(dist => {
            let distChanged = false;
            let d = { ...dist };
            if (matchDept(d.departmentId)) { d.departmentId = newCode; distChanged = true; }
            if (matchDept(d.department)) { d.department = newCode; distChanged = true; }
            if (matchDept(d.dept)) { d.dept = newCode; distChanged = true; }
            return distChanged ? d : dist;
          });
          changed = true;
        }
        if (Array.isArray(dar.distributed_depts)) {
          updated.distributed_depts = dar.distributed_depts.map(d => replaceDeptString(d));
          changed = true;
        }

        return changed ? updated : dar;
      });
    };

    const updatedDars = updateDarsCollection(state.dars);
    const updatedDarRequests = updateDarsCollection(state.darRequests);

    // 2.7 Tasks Collections
    const updateTasksCollection = (taskList) => {
      if (!Array.isArray(taskList)) return taskList;
      return taskList.map(task => {
        let changed = false;
        let updated = { ...task };

        if (matchDept(task.department)) { updated.department = newCode; changed = true; }
        if (matchDept(task.dept)) { updated.dept = newCode; changed = true; }
        if (matchDept(task.assignedToDept)) { updated.assignedToDept = newCode; changed = true; }
        if (matchDept(task.assignee_dept)) { updated.assignee_dept = newCode; changed = true; }
        if (matchDept(task.target_department)) { updated.target_department = newCode; changed = true; }
        if (matchDept(task.targetDepartment)) { updated.targetDepartment = newCode; changed = true; }
        if (matchDept(task.currentHandlerDepartment)) { updated.currentHandlerDepartment = newCode; changed = true; }
        if (matchDept(task.requester_dept)) { updated.requester_dept = newCode; changed = true; }
        if (matchDept(task.owner_dept)) { updated.owner_dept = newCode; changed = true; }

        return changed ? updated : task;
      });
    };

    const updatedTasks = updateTasksCollection(state.tasks);
    const updatedPeriodicReviewTasks = updateTasksCollection(state.periodicReviewTasks);

    // 2.8 Approval Matrix
    const updateMatrixCollection = (matrixList) => {
      if (!Array.isArray(matrixList)) return matrixList;
      return matrixList.map(entry => {
        let changed = false;
        let updated = { ...entry };
        if (matchDept(entry.departmentId)) { updated.departmentId = newCode; changed = true; }
        if (matchDept(entry.department)) { updated.department = newCode; changed = true; }
        if (matchDept(entry.dept)) { updated.dept = newCode; changed = true; }
        return changed ? updated : entry;
      });
    };

    const updatedApprovalMatrix = updateMatrixCollection(state.approvalMatrix);
    const updatedApprovalMatrixAlt = updateMatrixCollection(state.approval_matrix);

    // 2.9 Distribution Locations & Copy Requests
    const updatedLocations = (state.distributionLocations || []).map(loc => {
      let changed = false;
      let updated = { ...loc };
      if (matchDept(loc.departmentId)) { updated.departmentId = newCode; changed = true; }
      if (matchDept(loc.department)) { updated.department = newCode; changed = true; }
      if (matchDept(loc.dept)) { updated.dept = newCode; changed = true; }
      return changed ? updated : loc;
    });

    const updatedCopyRequests = (state.copyRequests || []).map(req => {
      let changed = false;
      let updated = { ...req };
      if (matchDept(req.department)) { updated.department = newCode; changed = true; }
      if (matchDept(req.dept)) { updated.dept = newCode; changed = true; }
      if (matchDept(req.requesting_dept)) { updated.requesting_dept = newCode; changed = true; }
      return changed ? updated : req;
    });

    // Return all cascaded collections in a single atomic state batch
    return {
      departments: updatedDepts,
      masterDepartments: updatedDepts,
      masterUsers: updatedMasterUsers,
      requestUsers: updatedRequestUsers,
      reviewUsers: updatedReviewUsers,
      approveUsers: updatedApproveUsers,
      currentUser: updatedCurrentUser,
      documents: updatedDocuments,
      controlledCopyInstances: updatedControlledCopyInstances,
      documentControlledCopies: updatedDocumentControlledCopies,
      externalDocuments: updatedExternalDocuments,
      dars: updatedDars,
      darRequests: updatedDarRequests,
      tasks: updatedTasks,
      periodicReviewTasks: updatedPeriodicReviewTasks,
      approvalMatrix: updatedApprovalMatrix,
      approval_matrix: updatedApprovalMatrixAlt,
      distributionLocations: updatedLocations,
      copyRequests: updatedCopyRequests,
      actionLog: [{
        id: `LOG-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        actionType: 'MASTER_DEPT_UPDATED',
        actor: state.currentUser?.name || 'DCC Officer',
        details: `Updated department ${oldCode} to ${newCode} with cascading relational propagation`,
        timestamp: new Date().toISOString()
      }, ...(state.actionLog || [])]
    };
  });
  return true;
} catch (err) {
  console.error('updateDepartment error:', err);
  throw err;
}
},

  checkDepartmentDependencies: (targetDeptId) => {
    const state = get();
    const allDocs = state.documents || [];
    const activeDocs = allDocs.filter(d => 
      (d.department === targetDeptId || d.owner_dept === targetDeptId) && 
      (d.status === 'EFFECTIVE' || d.status === 'ACTIVE')
    );

    const instances = state.controlledCopyInstances || [];
    const docCopies = state.documentControlledCopies || [];
    const copyList = instances.length > 0 ? instances : docCopies;
    const activeCopies = copyList.filter(c => 
      (c.holder_dept === targetDeptId || c.department === targetDeptId) && 
      (c.status === 'ACTIVE' || c.status === 'RECEIVED')
    );

    const allTasks = state.tasks || [];
    const pendingTasks = allTasks.filter(t => 
      (t.target_department === targetDeptId || t.department === targetDeptId || t.dept === targetDeptId) && 
      t.status !== 'COMPLETED' && t.status !== 'CANCELLED'
    );

    const allUsers = state.masterUsers || [];
    const affectedUsers = [];
    allUsers.forEach(u => {
      const primary = u.primary_department || u.department || u.dept;
      const affiliated = Array.isArray(u.affiliated_departments) ? u.affiliated_departments : (Array.isArray(u.depts) ? u.depts : []);
      const uniqueDepts = Array.from(new Set([primary, ...affiliated].filter(Boolean)));
      if (uniqueDepts.includes(targetDeptId)) {
        const remainingDepts = uniqueDepts.filter(d => d !== targetDeptId);
        const isSingleDept = remainingDepts.length === 0;
        affectedUsers.push({
          ...u,
          isSingleDept,
          remainingDepts,
          currentPrimary: primary,
          nextPrimary: isSingleDept ? null : (primary === targetDeptId ? remainingDepts[0] : primary)
        });
      }
    });

    const isCoreDept = SYSTEM_CORE_DEPTS.includes(targetDeptId);

    return {
      targetDeptId,
      isCoreDept,
      activeDocsCount: activeDocs.length,
      activeCopiesCount: activeCopies.length,
      pendingTasksCount: pendingTasks.length,
      affectedUsers,
      activeDocs,
      activeCopies,
      pendingTasks
    };
  },

  deactivateDepartment: (targetDeptId, fallbackDepartmentId) => {
    const state = get();

    // Guardrail 1: System Core Departments Guard
    if (SYSTEM_CORE_DEPTS.includes(targetDeptId)) {
      throw new Error(`แผนก "${targetDeptId}" เป็นแผนกหลักของระบบควบคุมคุณภาพและเอกสาร (System Core Department) ไม่อนุญาตให้ระงับการใช้งาน`);
    }

    // Guardrail 2: Dependency Pre-check (Active Docs, Active Copies, Pending Tasks)
    const check = get().checkDepartmentDependencies(targetDeptId);
    if (check.activeDocsCount > 0 || check.activeCopiesCount > 0 || check.pendingTasksCount > 0) {
      const reasons = [];
      if (check.activeDocsCount > 0) reasons.push(`เอกสารแม่บทที่มีผลบังคับใช้ ${check.activeDocsCount} รายการ`);
      if (check.activeCopiesCount > 0) reasons.push(`สำเนาควบคุมถือครองจริง ${check.activeCopiesCount} เล่ม`);
      if (check.pendingTasksCount > 0) reasons.push(`งานคงค้างในระบบ ${check.pendingTasksCount} รายการ`);
      throw new Error(`ไม่สามารถระงับแผนก "${targetDeptId}" ได้เนื่องจากมีภาระผูกพันคงค้าง: ${reasons.join(', ')}`);
    }

    // Guardrail 3: Single-dept Users Fallback Validation
    const singleDeptUsers = check.affectedUsers.filter(u => u.isSingleDept);
    if (singleDeptUsers.length > 0) {
      if (!fallbackDepartmentId) {
        throw new Error(`กรุณาระบุแผนกใหม่ (Fallback Department) สำหรับย้ายพนักงานที่ไม่มีแผนกรอง (${singleDeptUsers.length} คน)`);
      }
      if (fallbackDepartmentId === targetDeptId) {
        throw new Error(`แผนกใหม่ต้องไม่ใช่แผนกที่กำลังจะถูกระงับการใช้งาน`);
      }
      const availableDepts = state.departments || state.masterDepartments || [];
      const targetFallback = availableDepts.find(d => d.id === fallbackDepartmentId);
      if (!targetFallback || targetFallback.status === 'INACTIVE') {
        throw new Error(`แผนกปลายทาง "${fallbackDepartmentId}" ไม่พร้อมใช้งานหรือถูกระงับอยู่`);
      }
    }

    // User Re-assignment Handling
    const migrateUser = (u) => {
      const primary = u.primary_department || u.department || u.dept;
      const affiliated = Array.isArray(u.affiliated_departments) ? u.affiliated_departments : (Array.isArray(u.depts) ? u.depts : []);
      const uniqueDepts = Array.from(new Set([primary, ...affiliated].filter(Boolean)));
      if (!uniqueDepts.includes(targetDeptId)) return u;

      const remainingDepts = uniqueDepts.filter(d => d !== targetDeptId);
      if (remainingDepts.length > 0) {
        // Multi-dept user: remove targetDeptId, shift primary if needed
        const newPrimary = (primary === targetDeptId) ? remainingDepts[0] : primary;
        return {
          ...u,
          primary_department: newPrimary,
          department: newPrimary,
          dept: newPrimary,
          affiliated_departments: remainingDepts,
          depts: remainingDepts
        };
      } else {
        // Single-dept user: re-assign to fallbackDepartmentId
        return {
          ...u,
          primary_department: fallbackDepartmentId,
          department: fallbackDepartmentId,
          dept: fallbackDepartmentId,
          affiliated_departments: [fallbackDepartmentId],
          depts: [fallbackDepartmentId]
        };
      }
    };

    const updatedMasterUsers = (state.masterUsers || []).map(migrateUser);
    const updatedRequestUsers = (state.requestUsers || []).map(migrateUser);
    const updatedReviewUsers = (state.reviewUsers || []).map(migrateUser);
    const updatedApproveUsers = (state.approveUsers || []).map(migrateUser);
    const updatedCurrentUser = state.currentUser ? migrateUser(state.currentUser) : state.currentUser;

    // Department Status & Lead Cleanup
    const currentDepts = state.departments || state.masterDepartments || [];
    const updatedDepts = currentDepts.map(d => {
      if (d.id === targetDeptId) {
        return {
          ...d,
          status: 'INACTIVE',
          headUserId: '',
          headName: 'ยังไม่ได้กำหนด (ระงับการใช้งานแล้ว)'
        };
      }
      return d;
    });

    set({
      masterUsers: updatedMasterUsers,
      requestUsers: updatedRequestUsers,
      reviewUsers: updatedReviewUsers,
      approveUsers: updatedApproveUsers,
      currentUser: updatedCurrentUser,
      departments: updatedDepts,
      masterDepartments: updatedDepts,
      actionLog: [{
        id: `LOG-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        actionType: 'MASTER_DEPT_DEACTIVATED',
        actor: state.currentUser?.name || 'DCC Admin',
        details: `Deactivated department ${targetDeptId}. Reassigned ${check.affectedUsers.length} user(s). Fallback: ${fallbackDepartmentId || 'N/A'}`,
        timestamp: new Date().toISOString()
      }, ...(state.actionLog || [])]
    });

    return {
      success: true,
      targetDeptId,
      migratedUsersCount: check.affectedUsers.length
    };
  },

  reactivateDepartment: (deptId) => set((state) => {
    const currentDepts = state.departments || state.masterDepartments || [];
    const updatedDepts = currentDepts.map(d => {
      if (d.id === deptId) {
        return {
          ...d,
          status: 'ACTIVE',
          headName: d.headName === 'ยังไม่ได้กำหนด (ระงับการใช้งานแล้ว)' ? 'ยังไม่ได้กำหนด' : d.headName
        };
      }
      return d;
    });

    return {
      departments: updatedDepts,
      masterDepartments: updatedDepts,
      actionLog: [{
        id: `LOG-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        actionType: 'MASTER_DEPT_REACTIVATED',
        actor: state.currentUser?.name || 'DCC Admin',
        details: `Reactivated department ${deptId}`,
        timestamp: new Date().toISOString()
      }, ...(state.actionLog || [])]
    };
  }),

  toggleDepartmentStatus: (deptId) => {
    const state = get();
    const currentDepts = state.departments || state.masterDepartments || [];
    const targetDept = currentDepts.find(d => d.id === deptId);
    if (!targetDept) return;

    if (targetDept.status === 'INACTIVE') {
      get().reactivateDepartment(deptId);
    } else {
      // Find a safe fallback if possible, else throws if single-dept exists
      const availableFallback = currentDepts.find(d => d.id !== deptId && d.status !== 'INACTIVE');
      get().deactivateDepartment(deptId, availableFallback?.id);
    }
  },

  addMasterStation: (departmentId, stationData) => {
    let created = null;
    set((state) => {
      const stationName = typeof stationData === 'string' ? stationData : stationData?.name || '';
      const cleanName = cleanLocationName(stationName.trim());
      const newStation = {
        id: (stationData && typeof stationData === 'object' && stationData.id) 
          ? stationData.id 
          : `STATION-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        name: cleanName,
        code: (stationData && typeof stationData === 'object' && stationData.code) || `STATION-${Date.now().toString().slice(-4)}`,
        departmentId: departmentId,
        isCustom: true,
        status: 'ACTIVE',
        createdAt: new Date().toISOString(),
        ...(typeof stationData === 'object' ? stationData : {})
      };
      newStation.name = cleanName;
      newStation.departmentId = departmentId;
      newStation.isCustom = true;
      newStation.status = 'ACTIVE';
      created = newStation;

      const currentLocs = state.distributionLocations || [];
      const updatedLocs = [...currentLocs, newStation];

      return {
        distributionLocations: updatedLocs,
        actionLog: [{
          id: `LOG-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          actionType: 'MASTER_STATION_CREATED',
          actor: state.currentUser?.name || 'Requester',
          details: `Created new point-of-use station "${newStation.name}" in department ${departmentId}`,
          timestamp: new Date().toISOString()
        }, ...(state.actionLog || [])]
      };
    });
    return created;
  },

  addDistributionLocation: (locData) => set((state) => {
    const newLoc = {
      id: locData.id || `${locData.departmentId}-${Date.now().toString().slice(-4)}`,
      departmentId: locData.departmentId,
      name: cleanLocationName(locData.name),
      code: locData.code || locData.id,
      isMasterOffice: Boolean(locData.isMasterOffice),
      description: locData.description || '',
      status: locData.status || 'ACTIVE'
    };

    const currentLocs = state.distributionLocations || [];
    const updatedLocs = [...currentLocs, newLoc];

    return {
      distributionLocations: updatedLocs,
      actionLog: [{
        id: `LOG-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        actionType: 'MASTER_LOCATION_CREATED',
        actor: state.currentUser?.name || 'DCC Officer',
        details: `Created station ${newLoc.name} (${newLoc.id}) in ${newLoc.departmentId}`,
        timestamp: new Date().toISOString()
      }, ...(state.actionLog || [])]
    };
  }),

  updateDistributionLocation: (locId, locData) => set((state) => {
    const currentLocs = state.distributionLocations || [];
    const updatedLocs = currentLocs.map(l => {
      if (l.id === locId) {
        return {
          ...l,
          ...locData,
          isMasterOffice: locData.isMasterOffice !== undefined ? Boolean(locData.isMasterOffice) : l.isMasterOffice
        };
      }
      return l;
    });

    return {
      distributionLocations: updatedLocs,
      actionLog: [{
        id: `LOG-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        actionType: 'MASTER_LOCATION_UPDATED',
        actor: state.currentUser?.name || 'DCC Officer',
        details: `Updated station ${locId}`,
        timestamp: new Date().toISOString()
      }, ...(state.actionLog || [])]
    };
  }),

  toggleLocationStatus: (locId) => set((state) => {
    const currentLocs = state.distributionLocations || [];
    const updatedLocs = currentLocs.map(l => {
      if (l.id === locId) {
        return { ...l, status: l.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' };
      }
      return l;
    });

    return {
      distributionLocations: updatedLocs
    };
  }),

  deleteDistributionLocation: (locId) => {
    const state = get();
    const allCopies = (state.controlledCopyInstances && state.controlledCopyInstances.length > 0)
      ? state.controlledCopyInstances
      : (state.documentControlledCopies || []);
    
    // Check if any copy is actively using or pending receipt/recall at this location
    const activeAttachedCopy = allCopies.find(c => 
      (c.location_id === locId || c.locationId === locId || c.location === locId) &&
      (c.status === 'ISSUED_ACTIVE' || c.status === 'ACTIVE' || c.status === 'PENDING_ISSUE' || c.status === 'DISPATCHED_PENDING_RECEIPT')
    );

    if (activeAttachedCopy) {
      throw new Error(`ไม่สามารถลบจุดใช้งานนี้ได้ เนื่องจากมีสำเนาควบคุม (${activeAttachedCopy.doc_code || activeAttachedCopy.docTitle} - Copy ${activeAttachedCopy.copy_no || activeAttachedCopy.ccNumber}) ใช้งานอยู่จริงหน้างาน (กรุณาเปลี่ยนสถานะเป็น Inactive แทน)`);
    }

    set(state => ({
      distributionLocations: (state.distributionLocations || []).filter(l => l.id !== locId),
      actionLog: [{
        id: `LOG-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        actionType: 'MASTER_LOCATION_DELETED',
        actor: state.currentUser?.name || 'DCC Officer',
        details: `Deleted point-of-use station ${locId}`,
        timestamp: new Date().toISOString()
      }, ...(state.actionLog || [])]
    }));
    return true;
  },

  updateSignatureSettings: (settings) => set((state) => ({
    signatureSettings: { ...(state.signatureSettings || DEFAULT_SIGNATURE_SETTINGS), ...settings },
    actionLog: [{
      id: `LOG-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      actionType: 'MASTER_SIGNATURE_SETTINGS_UPDATED',
      actor: state.currentUser?.name || 'DCC Officer',
      details: 'Updated e-signature security policies',
      timestamp: new Date().toISOString()
    }, ...(state.actionLog || [])]
  })),

  updateSlaSettings: (settings) => set((state) => ({
    slaSettings: { ...(state.slaSettings || DEFAULT_SLA_SETTINGS), ...settings },
    actionLog: [{
      id: `LOG-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      actionType: 'MASTER_SLA_SETTINGS_UPDATED',
      actor: state.currentUser?.name || 'DCC Officer',
      details: 'Updated workflow SLA thresholds',
      timestamp: new Date().toISOString()
    }, ...(state.actionLog || [])]
  })),

  updateApprovalMatrix: (matrix) => set((state) => ({
    approvalMatrix: matrix,
    approval_matrix: matrix,
    actionLog: [{
      id: `LOG-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      actionType: 'MASTER_APPROVAL_MATRIX_UPDATED',
      actor: state.currentUser?.name || 'DCC Officer',
      details: 'Updated approval routing matrix by document type',
      timestamp: new Date().toISOString()
    }, ...(state.actionLog || [])]
  })),

  updateApprovalMatrixEntry: (docType, entryData) => set((state) => {
    const current = state.approvalMatrix || DEFAULT_APPROVAL_MATRIX;
    const exists = current.some(item => (item.docType || item.doc_type) === docType);
    let updated;
    if (exists) {
      updated = current.map(item => {
        if ((item.docType || item.doc_type) === docType) {
          const minReq = entryData.minRequesterLevel ?? entryData.min_requester_level ?? item.minRequesterLevel ?? item.min_requester_level ?? 1;
          const reqRev = entryData.requiredReviewerLevel ?? entryData.required_reviewer_level ?? item.requiredReviewerLevel ?? item.required_reviewer_level ?? 4;
          const reqApp = entryData.requiredApproverLevel ?? entryData.required_approver_level ?? item.requiredApproverLevel ?? item.required_approver_level ?? 6;
          const reqAck = Boolean(entryData.requireAckDefault ?? entryData.require_ack_default ?? item.requireAckDefault ?? item.require_ack_default ?? false);
          
          return {
            ...item,
            ...entryData,
            docType,
            doc_type: docType,
            minRequesterLevel: minReq,
            min_requester_level: minReq,
            requiredReviewerLevel: reqRev,
            required_reviewer_level: reqRev,
            requiredApproverLevel: reqApp,
            required_approver_level: reqApp,
            requireAckDefault: reqAck,
            require_ack_default: reqAck
          };
        }
        return item;
      });
    } else {
      const minReq = entryData.minRequesterLevel ?? entryData.min_requester_level ?? 1;
      const reqRev = entryData.requiredReviewerLevel ?? entryData.required_reviewer_level ?? 4;
      const reqApp = entryData.requiredApproverLevel ?? entryData.required_approver_level ?? 5;
      const reqAck = Boolean(entryData.requireAckDefault ?? entryData.require_ack_default ?? false);
      const newEntry = {
        docType,
        doc_type: docType,
        ...entryData,
        minRequesterLevel: minReq,
        min_requester_level: minReq,
        requiredReviewerLevel: reqRev,
        required_reviewer_level: reqRev,
        requiredApproverLevel: reqApp,
        required_approver_level: reqApp,
        requireAckDefault: reqAck,
        require_ack_default: reqAck
      };
      updated = [...current, newEntry];
    }

    return {
      approvalMatrix: updated,
      approval_matrix: updated,
      actionLog: [{
        id: `LOG-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        actionType: 'MASTER_APPROVAL_MATRIX_ENTRY_UPDATED',
        actor: state.currentUser?.name || 'DCC Officer',
        details: `Updated approval routing matrix entry for document type ${docType}`,
        timestamp: new Date().toISOString()
      }, ...(state.actionLog || [])]
    };
  })
});
