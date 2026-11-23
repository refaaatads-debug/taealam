import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect } from 'vitest';
import { Users } from 'lucide-react';
import AccountDeletedBlocked from '../AccountDeletedBlocked';
import TeacherApprovalBlocked from '../TeacherApprovalBlocked';
import { AdminTable } from './AdminTable';
import { AdminKPIBar } from './AdminKPIBar';

describe('VPS source reconciliation UI', () => {
 it('deleted account retains support access', () => {
  render(<MemoryRouter><AccountDeletedBlocked /></MemoryRouter>);
  expect(screen.getByRole('link')).toHaveAttribute('href','/support');
 });
 it('rejected teacher retains support access', () => {
  render(<MemoryRouter><TeacherApprovalBlocked /></MemoryRouter>);
  expect(screen.getByRole('link')).toHaveAttribute('href','/support');
 });
 it('sorts table numeric values in both directions', () => {
  const {container}=render(<AdminTable columns={[{key:'name',label:'الاسم'},{key:'minutes',label:'الدقائق',sortable:true}]} data={[{id:'b',name:'سارة',minutes:20},{id:'a',name:'أحمد',minutes:5}]} rowKey={r=>r.id}/>);
  fireEvent.click(screen.getByText('الدقائق'));
  expect(container.querySelector('tbody tr')?.textContent).toContain('أحمد');
  fireEvent.click(screen.getByText('الدقائق'));
  expect(container.querySelector('tbody tr')?.textContent).toContain('سارة');
 });
 it('renders zero KPI values without dropping the label', () => {
  render(<AdminKPIBar kpis={[{label:'طلبات معلقة',value:0,icon:Users}]}/>);
  expect(screen.getByText('0')).toBeInTheDocument();
  expect(screen.getByText('طلبات معلقة')).toBeInTheDocument();
 });
});
