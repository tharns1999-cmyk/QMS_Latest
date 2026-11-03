import { isDccAdmin } from '../dcc/utils/taskFilter';

// One rule for every System Administration surface (route guard, sidebar, portal card, page bodies).
// The API grants admin endpoints to `is_dcc` users only, and the DCC_ADMIN role is derived from it; DCC_STAFF and
// other roles are not admins. The API still enforces this on every call, so hiding a menu never grants anything.
export const isSystemAdmin = (user) => isDccAdmin(user);
