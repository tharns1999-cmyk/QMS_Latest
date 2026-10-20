import React from 'react';
import useStore from '../../store/useStore';
import DashboardHeader from '../../modules/dcc/pages/Dashboard/components/DashboardHeader';
import Topbar from './Topbar';

/**
 * Universal Header Component
 * Can render route Topbar or Dashboard Greeting Header while maintaining
 * reactive single-source-of-truth subscription to currentUser in store.
 */
const Header = (props) => {
  const currentUser = useStore((state) => state.currentUser);

  if (props.type === 'dashboard' || props.greeting || props.isDashboard) {
    return <DashboardHeader {...props} currentUser={currentUser} />;
  }

  return <Topbar {...props} currentUser={currentUser} />;
};

export { DashboardHeader, Topbar };
export default Header;
