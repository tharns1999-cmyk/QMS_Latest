import '@testing-library/jest-dom';
import { configure } from '@testing-library/react';
import { afterEach } from 'vitest';
import useStore from '../store/useStore';

// เครื่องที่โหลดหนัก (รันเทสต์ทั้งโปรเจกต์พร้อมกัน) render ช้ากว่าค่าเริ่มต้น 1 วินาที
configure({ asyncUtilTimeout: 5000 });

// Polyfill localStorage in test environment if unconfigured
if (typeof window !== 'undefined') {
  let store = {};
  const mockStorage = {
    getItem: (key) => store[key] ?? null,
    setItem: (key, val) => { store[key] = String(val); },
    removeItem: (key) => { delete store[key]; },
    clear: () => { store = {}; },
    get length() { return Object.keys(store).length; },
    key: (i) => Object.keys(store)[i] ?? null
  };
  Object.defineProperty(window, 'localStorage', { value: mockStorage, writable: true });
  Object.defineProperty(globalThis, 'localStorage', { value: mockStorage, writable: true });
}

afterEach(() => {
  useStore.getState().resetStore();
});
