import { useEffect } from 'react';
import useStore from '../../../store/useStore';

const SLAEngine = () => {
  const { checkSLA } = useStore();

  useEffect(() => {
    // Run the SLA and Lifecycle engine every 5 seconds (mocking a background job)
    const interval = setInterval(() => {
      checkSLA();
    }, 5000);

    return () => clearInterval(interval);
  }, [checkSLA]);

  return null; // This component is invisible
};

export default SLAEngine;
