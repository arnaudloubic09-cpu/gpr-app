import Link from 'next/link';
import type { ReactNode } from 'react';
import { PERIODS } from '@/lib/format';

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="page-header">
      <div>
        <h1>{title}</h1>
        {subtitle ? <p className="muted">{subtitle}</p> : null}
      </div>
      {actions ? <div className="actions">{actions}</div> : null}
    </div>
  );
}

export function Kpi({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: 'warn' | 'danger';
}) {
  return (
    <div className={`card kpi ${tone ?? ''}`}>
      <div className="muted">{label}</div>
      <div className="kpi-value">{value}</div>
      {hint ? <div className="muted small">{hint}</div> : null}
    </div>
  );
}

export function Badge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'ok' | 'warn' | 'danger';
}) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function PeriodPicker({ current, basePath }: { current: string; basePath: string }) {
  return (
    <nav className="segmented" aria-label="Période">
      {PERIODS.map((p) => (
        <Link
          key={p.value}
          href={`${basePath}?period=${p.value}`}
          className={p.value === current ? 'active' : ''}
          aria-current={p.value === current ? 'page' : undefined}
        >
          {p.label}
        </Link>
      ))}
    </nav>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="muted empty">{children}</p>;
}
