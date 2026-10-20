import React from 'react';
import { getDarStatusBadgeMeta } from '../../utils/darHelper';

const VARIANTS = {
  active: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  effective: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  success: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  pending: 'bg-amber-50 text-amber-700 border border-amber-200',
  warning: 'bg-amber-50 text-amber-700 border border-amber-200',
  review: 'bg-amber-50 text-amber-700 border border-amber-200',
  superseded: 'bg-amber-50 text-amber-700 border border-amber-200',
  rejected: 'bg-rose-50 text-rose-700 border border-rose-200',
  danger: 'bg-rose-50 text-rose-700 border border-rose-200',
  obsolete: 'bg-rose-50 text-rose-700 border border-rose-200',
  cancelled: 'bg-slate-100 text-slate-600 border border-slate-200',
  draft: 'bg-slate-100 text-slate-700 border border-slate-200',
  neutral: 'bg-slate-100 text-slate-700 border border-slate-200',
  info: 'bg-blue-50 text-blue-700 border border-blue-200',
  system: 'bg-blue-50 text-blue-700 border border-blue-200',
  inactive: 'bg-slate-100 text-slate-500 border border-slate-200'
};

export const getStatusBadgeStyles = (status) => {
  const normalized = (status || 'active').toLowerCase();
  return VARIANTS[normalized] || VARIANTS.active;
};

export const DarStatusBadge = ({ status }) => {
  const meta = getDarStatusBadgeMeta(status);
  return <span className={meta.className}>{meta.label}</span>;
};

const StatusBadge = ({ 
  children, 
  variant = 'active', 
  status,
  customLabel,
  icon,
  className = '', 
  dot = false,
  ...props 
}) => {
  const normalizedVariant = (status || variant || 'active').toLowerCase();
  const variantClass = VARIANTS[normalizedVariant] || VARIANTS.active;

  return (
    <span 
      className={`font-semibold text-xs px-2.5 py-1 rounded-full inline-flex items-center gap-1.5 leading-snug whitespace-nowrap ${variantClass} ${className}`}
      {...props}
    >
      {icon ? (
        <span className="shrink-0">{icon}</span>
      ) : dot ? (
        <span className="w-1.5 h-1.5 rounded-full bg-current shrink-0 opacity-80" />
      ) : null}
      {customLabel || children || status}
    </span>
  );
};

export default StatusBadge;
export { StatusBadge, StatusBadge as Badge };
