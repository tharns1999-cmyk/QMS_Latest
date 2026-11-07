import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import useStore from '../../../store/useStore';
import { DraftGroupConversionModal } from '../components/AnnualPlanModals';
import { resetVccLocalStore } from '../api/vccApi';

// Regression: the parent passes `groupChildren={... || []}`, a new array on every render. The modal used to reset its
// selections, months and validation message whenever that identity changed, so any background re-render (a toast, a data
// load finishing) wiped what the person had chosen. This was also the cause of the flaky vcc_flat_architecture_e2e AC 5-9.
const draftGroup = {
  id: 'PI-GRP-DRAFT', plan_id: 'PLAN-DRAFT', asset_id: 'ASSET-GRP-01', asset_code: 'GRP-VERNIER', asset_name: 'ชุดเวอร์เนียร์',
  is_group: 1, group_nature: 'LOGICAL_GROUP', planned_months: [2, 9], is_persisted: 1
};
const activeAssets = [
  { id: 'ASSET-CH-01', asset_code: 'V001', name: 'เวอร์เนียร์ 01', is_group: 0, parent_id: 'ASSET-GRP-01', status: 'ACTIVE', department: 'QC' },
  { id: 'ASSET-CH-02', asset_code: 'V002', name: 'เวอร์เนียร์ 02', is_group: 0, parent_id: 'ASSET-GRP-01', status: 'ACTIVE', department: 'QC' }
];
const existingPlanItems = [draftGroup, { id: 'PI-V001-EXISTING', asset_id: 'ASSET-CH-01', asset_code: 'V001', planned_months: [2], remarks: '' }];

const modal = (props = {}) => (
  <DraftGroupConversionModal
    open
    onClose={vi.fn()}
    groupItem={draftGroup}
    groupChildren={[]}
    activeAssets={activeAssets}
    existingPlanItems={existingPlanItems}
    onConfirmConvert={vi.fn()}
    converting={false}
    {...props}
  />
);

describe('Legacy group conversion modal keeps the person\'s work across parent re-renders', () => {
  beforeEach(() => {
    resetVccLocalStore();
    useStore.setState({ currentUser: { id: 'dc4', name: 'DC หัวหน้า (DCC)', department: 'DC', approval_level: 4, isDcc: true } });
  });

  it('keeps the validation message when the parent re-renders with a new (equal) empty children array', () => {
    const { rerender } = render(modal());
    fireEvent.click(screen.getByRole('button', { name: /ดูตัวอย่างก่อนยืนยัน/i }));
    expect(screen.getByRole('alert')).toHaveTextContent(/V002/);

    rerender(modal({ groupChildren: [], activeAssets: [...activeAssets], existingPlanItems: [...existingPlanItems] }));
    expect(screen.getByRole('alert')).toHaveTextContent(/V002/);
  });

  it('keeps months the person picked when the parent re-renders', () => {
    const { rerender } = render(modal());
    fireEvent.click(screen.getByRole('button', { name: 'V002 เดือน 6' }));
    rerender(modal({ groupChildren: [], activeAssets: [...activeAssets] }));
    fireEvent.click(screen.getByRole('button', { name: /ดูตัวอย่างก่อนยืนยัน/i }));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByTestId('conversion-preview-summary')).toHaveTextContent('เดือน 6');
  });

  it('still starts fresh when a different group is opened', () => {
    const { rerender } = render(modal());
    fireEvent.click(screen.getByRole('button', { name: /ดูตัวอย่างก่อนยืนยัน/i }));
    expect(screen.getByRole('alert')).toBeInTheDocument();
    const otherGroup = { ...draftGroup, id: 'PI-GRP-OTHER' };
    rerender(modal({ groupItem: otherGroup, existingPlanItems: [otherGroup, existingPlanItems[1]] }));
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
