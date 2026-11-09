'use client';

import { ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  className?: string;
  padding?: 'sm' | 'md' | 'lg';
  border?: boolean;
  hover?: boolean;
}

const paddings = {
  sm: 'p-4',
  md: 'p-5',
  lg: 'p-6',
};

export function Card({ children, className = '', padding = 'md', border = true, hover = false }: CardProps) {
  return (
    <div
      className={`
        bg-white rounded-xl
        ${border ? 'border border-[#E2E8F0]' : ''}
        ${hover ? 'hover:border-[#2563EB]/30 hover:shadow-sm transition-all duration-150 cursor-pointer' : ''}
        ${paddings[padding]}
        ${className}
      `}
    >
      {children}
    </div>
  );
}

export function StatCard({ label, value, icon, trend }: { label: string; value: string | number; icon: string; trend?: { value: string; positive: boolean } }) {
  return (
    <Card hover>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-[#64748B]">{label}</p>
          <p className="text-2xl font-semibold text-[#0F172A] mt-1">{value}</p>
          {trend && (
            <p className={`text-xs mt-1 ${trend.positive ? 'text-[#16A34A]' : 'text-[#DC2626]'}`}>
              {trend.positive ? '↑' : '↓'} {trend.value}
            </p>
          )}
        </div>
        <span className="text-2xl">{icon}</span>
      </div>
    </Card>
  );
}

export function TableCard({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <Card padding="sm" className={className}>
      {children}
    </Card>
  );
}