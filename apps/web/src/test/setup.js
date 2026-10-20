import '@testing-library/jest-dom';
import { afterEach } from 'vitest';
import useStore from '../store/useStore';

afterEach(() => {
  useStore.getState().resetStore();
});
