import '@testing-library/jest-dom';
import { configure } from '@testing-library/react';
import { afterEach } from 'vitest';
import useStore from '../store/useStore';

// เครื่องที่โหลดหนัก (รันเทสต์ทั้งโปรเจกต์พร้อมกัน) render ช้ากว่าค่าเริ่มต้น 1 วินาที
configure({ asyncUtilTimeout: 5000 });

afterEach(() => {
  useStore.getState().resetStore();
});
