import { isDccAdmin } from '../dcc/utils/taskFilter';
import { isApiMode } from '../../api/client';

// One rule for every System Administration surface (route guard, sidebar, portal card, page bodies).
// Connected to the server it is exactly the server's rule for its admin endpoints: `is_dcc`. The role column is only
// derived from it (and can be stale on old rows), so the role is not consulted. In demo mode the role decides,
// and DCC_STAFF is never an admin. The API still enforces this on every call, so hiding a menu never grants anything.
export const isSystemAdmin = (user) => {
  if (!user) return false;
  if (isApiMode) return Boolean(user.isDcc);
  return user.role !== 'DCC_STAFF' && isDccAdmin(user);
};
