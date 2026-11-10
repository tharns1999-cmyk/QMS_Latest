import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ModuleGovernancePage from '../pages/ModuleGovernancePage';
import { apiGet, apiPut } from '../../../api/client';
import ModuleAccessProvider from '../../../shared/components/ModuleAccessProvider';
import ProtectedRoute from '../../../app/auth/ProtectedRoute';
import { isUserAuthorizedForModule } from '../../portal/moduleRegistry';

vi.mock('../../../api/client', () => ({ isApiMode:true,apiGet:vi.fn(),apiPut:vi.fn(),apiPost:vi.fn(),apiDelete:vi.fn() }));
vi.mock('../../../store/useStore', () => ({ default:(selector) => selector({currentUser:{id:'EN-USER',department:'EN',depts:['EN']}}) }));
vi.mock('react-hot-toast', () => ({default:{error:vi.fn()}}));
const profile={document_code:'TEST-FM-EN',revision:'01',reviewer_dept:'PD',approver_dept:'MGT',min_preparer_level:4,required_reviewer_level:5,required_approver_level:6,assigned_reviewer_id:'REVIEW',assigned_approver_id:'APPROVE'};
let config, capabilities;
const impact={plans:[{status:'APPROVED',count:2}],workOrders:[{status:'SCHEDULED',count:3}],pendingAlerts:1};
const show=()=>render(<MemoryRouter><ModuleGovernancePage /></MemoryRouter>);

beforeEach(() => {
  vi.clearAllMocks();
  HTMLDialogElement.prototype.showModal=function(){this.open=true;};
  capabilities={modules:[{moduleId:'vcc',allowed:true,canEnter:true,status:'ACTIVE',canManage:true}]};
  config={module:{status:'ACTIVE',version:7,maintenance_message:''},platformAdmin:false,profiles:{QC:profile,EN:profile},
    departments:[{code:'QC',name_th:'ควบคุมคุณภาพ',status:'ACTIVE',enabled:1},{code:'EN',name_th:'วิศวกรรม',status:'ACTIVE',enabled:0},{code:'PD',name_th:'ผลิต',status:'ACTIVE',enabled:0},{code:'MGT',name_th:'บริหาร',status:'ACTIVE',enabled:0}],
    readiness:{QC:{status:'READY',issues:[]},EN:{status:'READY',issues:[]},PD:{status:'CONFIGURATION_INCOMPLETE',issues:['ยังไม่ตั้งค่า']},MGT:{status:'CONFIGURATION_INCOMPLETE',issues:['ยังไม่ตั้งค่า']}},
    users:[{id:'REVIEW',name:'ผู้ทบทวนที่ผ่านเกณฑ์',departments:['PD'],approval_level:5},{id:'LOW',name:'ระดับไม่ถึง',departments:['PD'],approval_level:4},{id:'WRONG',name:'แผนกไม่ตรง',departments:['EN'],approval_level:5},{id:'APPROVE',name:'ผู้อนุมัติที่ผ่านเกณฑ์',departments:['MGT'],approval_level:6}],
    forms:[{id:'FORM',doc_code:'TEST-FM-EN',revision:'01',name:'[ข้อมูลทดสอบ] แบบฟอร์ม'}],policy:{min_requester_level:4,required_reviewer_level:5,required_approver_level:6}};
  apiGet.mockImplementation(async(path)=>path==='/api/modules'?capabilities:path.endsWith('/history')?{history:[]}:path.endsWith('/alerts')?{alerts:[]}:path.includes('/impact')?impact:path.endsWith('/permissions')?{grants:[]}:config);
  apiPut.mockResolvedValue({success:true});
});

describe('Module Governance interface', () => {
  it('shows the actual module state and preserves DCC as a protected entry', async()=>{
    show(); await screen.findByText('ศูนย์ทวนสอบและสอบเทียบ · VCC');
    expect(screen.getByText('รักษาการทำงานเดิม การควบคุมสถานะ DCC ยังไม่เปิดในหน้านี้')).toBeVisible();
    expect(screen.queryByRole('tab',{name:'ผู้ดูแลที่ได้รับมอบหมาย'})).not.toBeInTheDocument();
    expect(screen.getByLabelText('เปลี่ยนสถานะ')).toHaveValue('ACTIVE');
  });
  it('separates enabled departments from disabled departments', async()=>{
    show(); await screen.findByRole('button',{name:'ตั้งค่า QC'});
    expect(screen.queryByRole('button',{name:'ตั้งค่า EN'})).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('แสดงแผนก'),{target:{value:'disabled'}});
    expect(screen.getByRole('button',{name:'ตั้งค่า EN'})).toBeVisible();
    expect(screen.queryByRole('button',{name:'ตั้งค่า QC'})).not.toBeInTheDocument();
  });
  it('loads any master department and offers only qualified assigned reviewers/approvers', async()=>{
    show(); await screen.findByRole('button',{name:'ตั้งค่า QC'});
    fireEvent.change(screen.getByLabelText('แสดงแผนก'),{target:{value:'disabled'}});
    fireEvent.click(screen.getByRole('button',{name:'ตั้งค่า EN'}));
    expect(screen.getByText('แบบฟอร์มและผู้รับผิดชอบ · EN')).toBeVisible();
    const reviewers=screen.getByLabelText('ชื่อผู้ทบทวน');
    expect(within(reviewers).getByText('ผู้ทบทวนที่ผ่านเกณฑ์ · L5')).toBeInTheDocument();
    expect(within(reviewers).queryByText(/ระดับไม่ถึง|แผนกไม่ตรง|ผู้อนุมัติที่ผ่านเกณฑ์/)).not.toBeInTheDocument();
  });
  it('operates as a native digital record and does not require legacy DCC paper forms', async()=>{
    config.forms=[];show();await screen.findByRole('button',{name:'ตั้งค่า QC'});fireEvent.click(screen.getByRole('button',{name:'ตั้งค่า QC'}));
    expect(screen.getByText('แบบฟอร์มและผู้รับผิดชอบ · QC')).toBeVisible();
    expect(screen.getByText(/บังคับใช้กฎ Segregation of Duties/)).toBeVisible();
    expect(screen.getByRole('button',{name:'ตรวจสอบและบันทึกค่าของแผนก'})).toBeEnabled();
    expect(apiPut).not.toHaveBeenCalled();
  });
  it('shows impact before mutation and requires a nonempty reason in confirmation', async()=>{
    show();await screen.findByRole('button',{name:'ตั้งค่า QC'});
    fireEvent.change(screen.getByLabelText('เปลี่ยนสถานะ'),{target:{value:'READ_ONLY'}});
    fireEvent.click(screen.getByRole('button',{name:'ตรวจผลกระทบ'}));
    const dialog=await screen.findByRole('dialog'); expect(within(dialog).getByText(/ใบสั่งงาน 3 รายการ/)).toBeVisible();
    const confirm=within(dialog).getByRole('button',{name:'ยืนยันการเปลี่ยนแปลง'});expect(confirm).toBeDisabled(); expect(apiPut).not.toHaveBeenCalled();
    fireEvent.change(within(dialog).getByLabelText('เหตุผลในการเปลี่ยนแปลง'),{target:{value:'   '}});expect(confirm).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText('เหตุผลในการเปลี่ยนแปลง'),{target:{value:'ตรวจสอบค่าตั้งค่า'}});fireEvent.click(confirm);
    await waitFor(()=>expect(apiPut).toHaveBeenCalledWith('/api/module-governance/vcc/status',{status:'READ_ONLY',maintenance_message:'',version:7,reason:'ตรวจสอบค่าตั้งค่า'}));
  });
  it('retains the confirmation and shows the actual API refusal on failure', async()=>{
    apiPut.mockRejectedValue(new Error('ค่าตั้งค่าถูกเปลี่ยนแล้ว กรุณาโหลดใหม่'));
    show();await screen.findByRole('button',{name:'ตั้งค่า QC'});fireEvent.click(screen.getByRole('button',{name:'ปิดรับงานใหม่'}));
    const dialog=await screen.findByRole('dialog');fireEvent.change(within(dialog).getByLabelText('เหตุผลในการเปลี่ยนแปลง'),{target:{value:'หยุดรับงานใหม่'}});fireEvent.click(within(dialog).getByRole('button',{name:'ยืนยันการเปลี่ยนแปลง'}));
    expect(await screen.findByRole('alert')).toHaveTextContent('ค่าตั้งค่าถูกเปลี่ยนแล้ว กรุณาโหลดใหม่');expect(screen.getByRole('dialog')).toBeVisible();
    expect(apiGet).toHaveBeenCalledWith('/api/module-governance/vcc/impact?department=QC');
  });
  it('never offers maintenance without a notice', async()=>{
    show();await screen.findByRole('button',{name:'ตั้งค่า QC'});fireEvent.change(screen.getByLabelText('เปลี่ยนสถานะ'),{target:{value:'MAINTENANCE'}});
    expect(screen.getByRole('button',{name:'ตรวจผลกระทบ'})).toBeDisabled();
    fireEvent.change(screen.getByLabelText('ข้อความแจ้งผู้ใช้งาน'),{target:{value:'กำลังปรับปรุง'}});expect(screen.getByRole('button',{name:'ตรวจผลกระทบ'})).toBeEnabled();
  });
  it('shows a useful empty critical-alert view during maintenance', async()=>{
    config.module.status='MAINTENANCE';show();await screen.findByRole('button',{name:'ตั้งค่า QC'});fireEvent.click(screen.getByRole('tab',{name:'การแจ้งเตือนค้าง (0)'}));
    expect(screen.getByText('ไม่มีการแจ้งเตือนในสถานะนี้')).toBeVisible();expect(screen.getByText(/ไม่มีการเลื่อนวันครบกำหนดหรือยืนยันรับทราบแทน/)).toBeVisible();
  });
  it('supports split-pane master-detail module switching and search filtering', async () => {
    show();
    await screen.findByRole('button', { name: 'ตั้งค่า QC' });

    // 1. Verify module rail lists DCC, CAPA, and Training
    expect(screen.getByText('ระบบควบคุมเอกสาร · DCC')).toBeVisible();
    expect(screen.getByText('ระบบจัดการข้อบกพร่อง · CAPA')).toBeVisible();
    expect(screen.getByText('ระบบฝึกอบรมและทักษะ · Training')).toBeVisible();

    // 2. Click DCC -> detail pane shows DCC baseline overview
    fireEvent.click(screen.getByText('ระบบควบคุมเอกสาร · DCC'));
    expect(screen.getByText('ระบบควบคุมเอกสาร (DCC)')).toBeVisible();
    expect(screen.getByText(/แกนกลางการควบคุมสารสนเทศเอกสารและระเบียบปฏิบัติงานขององค์กร/)).toBeVisible();
    expect(screen.getByRole('link', { name: /เปิดดูทะเบียนเอกสารควบคุม/ })).toBeVisible();

    // 3. Click CAPA -> detail pane shows Coming Soon view
    fireEvent.click(screen.getByText('ระบบจัดการข้อบกพร่อง · CAPA'));
    expect(screen.getByText('ระบบจัดการข้อบกพร่องและการปฏิบัติการแก้ไข (CAPA)')).toBeVisible();
    expect(screen.getByRole('button', { name: 'สลับกลับไปจัดการโมดูลศูนย์ทวนสอบ (VCC)' })).toBeVisible();

    // 4. Click back button to VCC
    fireEvent.click(screen.getByRole('button', { name: 'สลับกลับไปจัดการโมดูลศูนย์ทวนสอบ (VCC)' }));
    expect(screen.getByRole('button', { name: 'ตั้งค่า QC' })).toBeVisible();

    // 5. Test search filter in module rail
    const searchInput = screen.getByPlaceholderText('ค้นหาโมดูล...');
    fireEvent.change(searchInput, { target: { value: 'CAPA' } });
    expect(screen.getByText('ระบบจัดการข้อบกพร่อง · CAPA')).toBeVisible();
    expect(screen.queryByText('ระบบฝึกอบรมและทักษะ · Training')).not.toBeInTheDocument();
  });
});

describe('Portal and route guards use backend capabilities',()=>{
  it('accepts EN when the server grants access and rejects a client-side admin claim without it',()=>{
    const module={moduleId:'vcc',allowedDepartments:['QC']};
    expect(isUserAuthorizedForModule(module,{department:'EN'},{allowed:true})).toBe(true);
    expect(isUserAuthorizedForModule(module,{isDcc:true},{allowed:false})).toBe(false);
  });
  it('shows the maintenance notice instead of rendering the operational page',async()=>{
    capabilities.modules[0]={...capabilities.modules[0],status:'MAINTENANCE',canEnter:false,maintenance_message:'พักระบบเพื่อทดสอบ'};
    render(<MemoryRouter><ModuleAccessProvider userId="EN-USER"><ProtectedRoute requireVcc><p>operational page</p></ProtectedRoute></ModuleAccessProvider></MemoryRouter>);
    expect(await screen.findByText('พักระบบเพื่อทดสอบ')).toBeVisible();expect(screen.queryByText('operational page')).not.toBeInTheDocument();
  });
  it('allows authorized reads while explaining READ_ONLY',async()=>{
    capabilities.modules[0].status='READ_ONLY';
    render(<MemoryRouter><ModuleAccessProvider userId="EN-USER"><ProtectedRoute requireVcc><p>operational page</p></ProtectedRoute></ModuleAccessProvider></MemoryRouter>);
    expect(await screen.findByText('operational page')).toBeVisible();expect(screen.getByText(/VCC เปิดให้อ่านอย่างเดียว/)).toBeVisible();
  });
});
