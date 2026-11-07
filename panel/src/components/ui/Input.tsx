'use client';

import { InputHTMLAttributes, forwardRef } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  icon?: React.ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, icon, className = '', ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <label className="block text-sm font-medium text-[#0F172A] mb-1.5">
            {label}
          </label>
        )}
        <div className="relative">
          {icon && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8] w-4 h-4">
              {icon}
            </div>
          )}
          <input
            ref={ref}
            className={`
              w-full px-3 py-2 rounded-lg text-sm
              border border-[#E2E8F0] bg-white
              text-[#0F172A] placeholder:text-[#94A3B8]
              focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]
              disabled:bg-[#F8FAFC] disabled:text-[#94A3B8]
              transition-all duration-150
              ${icon ? 'pl-10' : ''}
              ${error ? 'border-[#DC2626] focus:ring-[#DC2626]/20 focus:border-[#DC2626]' : ''}
              ${className}
            `}
            {...props}
          />
        </div>
        {error && (
          <p className="mt-1 text-xs text-[#DC2626]">{error}</p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';