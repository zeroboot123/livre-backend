'use client';

interface BadgeProps {
  variant?: 'default' | 'success' | 'warning' | 'error' | 'info';
  children: React.ReactNode;
  className?: string;
}

const variants = {
  default: 'bg-[#F1F5F9] text-[#64748B]',
  success: 'bg-[#F0FDF4] text-[#16A34A]',
  warning: 'bg-[#FFFBEB] text-[#D97706]',
  error: 'bg-[#FEF2F2] text-[#DC2626]',
  info: 'bg-[#EFF6FF] text-[#2563EB]',
};

export function Badge({ variant = 'default', children, className = '' }: BadgeProps) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${variants[variant]} ${className}`}>
      {children}
    </span>
  );
}