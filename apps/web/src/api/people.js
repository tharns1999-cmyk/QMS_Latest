import useStore from '../store/useStore';

// Everyone a record can name: people who can be picked now, and deactivated ones who signed earlier records.
export const knownUsers = () => {
  const { masterUsers, formerUsers } = useStore.getState();
  return [...(masterUsers || []), ...(formerUsers || [])];
};
