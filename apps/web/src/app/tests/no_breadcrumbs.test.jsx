import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import useStore from '../../store/useStore';
import { resetVccLocalStore } from '../../modules/vcc/api/vccApi';
import AssetRegisterPage from '../../modules/vcc/pages/AssetRegisterPage';
import WorkOrderSection from '../../modules/vcc/components/WorkOrderSection';
import MyExternalRequests from '../../modules/dcc/pages/ExternalDocs/MyExternalRequests';

// The "พอร์ทัลหลัก / module / page" trail was removed from every page; the sidebar and the page title carry the context.
const expectNoTrail = () => {
  expect(screen.queryByText('พอร์ทัลหลัก')).toBeNull();
  expect(screen.queryByText('ศูนย์ทวนสอบและสอบเทียบ (VCC)')).toBeNull();
};

describe('pages show their title and description without a breadcrumb trail', () => {
  beforeEach(() => {
    useStore.getState().resetStore();
    resetVccLocalStore();
    useStore.setState({
      currentUser: { id: 'dc4', name: 'DCC', department: 'DC', depts: ['DC'], isDcc: true, role: 'DCC_ADMIN', approval_level: 4, approvalLevel: 4, level: 4 },
      masterDepartments: [{ code: 'QC', name_th: 'ควบคุมคุณภาพ', status: 'ACTIVE' }]
    });
  });

  it.each([
    ['/vcc/dashboard', /ภาพรวมและแจ้งเตือน \(Dashboard & Alerts\)/, /สรุป KPI/],
    ['/vcc/plans', /แผนการทวนสอบเครื่องมือประจำปี/, /วางรอบทวนสอบ/],
    ['/vcc/assets', /ทะเบียนเครื่องมือวัด \(Equipment Register\)/, /จัดการทะเบียนเครื่องมือวัด/],
    ['/vcc/tasks', /งานที่ต้องดำเนินการ \(VCC Task Inbox\)/, /ศูนย์กลางการทบทวน/]
  ])('VCC %s', async (path, title, description) => {
    render(<MemoryRouter initialEntries={[path]}><AssetRegisterPage /></MemoryRouter>);
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: title })).toBeInTheDocument());
    expect(screen.getAllByText(description).length).toBeGreaterThan(0);
    expectNoTrail();
  });

  it('VCC work orders', async () => {
    render(<MemoryRouter><WorkOrderSection /></MemoryRouter>);
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: /ใบสั่งงานและบันทึกผล \(Work Orders\)/ })).toBeInTheDocument());
    expect(screen.getByText(/เปิดใบสั่งงานตามแผน/)).toBeInTheDocument();
    expectNoTrail();
  });

  it('DCC my external requests keeps its title and the back button, without the trail', () => {
    render(<MemoryRouter><MyExternalRequests /></MemoryRouter>);
    expect(screen.getByRole('heading', { level: 1, name: /คำร้องเอกสารภายนอกของฉัน/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /กลับไปคลังเอกสารภายนอก/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^คลังเอกสารภายนอก$/ })).toBeNull();
  });
});
