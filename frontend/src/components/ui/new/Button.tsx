'use client';

import { forwardRef, ButtonHTMLAttributes } from 'react';
import { Loader2 } from 'lucide-react';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  fullWidth?: boolean;
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      loading = false,
      fullWidth = false,
      icon,
      iconPosition = 'left',
      children,
      className = '',
      disabled,
      ...props
    },
    ref
  ) => {
    const baseStyles =
      'inline-flex items-center justify-center gap-2 font-medium rounded-xl transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:opacity-50 disabled:cursor-not-allowed';

    const variantStyles = {
      primary:
        'bg-primary text-white shadow-[0_4px_16px_-4px_rgba(124,92,252,0.4)] hover:shadow-[0_6px_24px_-6px_rgba(124,92,252,0.5)] hover:bg-primary-hover active:bg-primary/90 active:scale-[0.98]',
      secondary:
        'bg-surface-elevated text-text-primary border border-border hover:bg-surface-hover hover:border-border-strong active:bg-surface',
      ghost:
        'bg-transparent text-text-secondary hover:bg-surface hover:text-text-primary active:bg-surface/50',
      outline:
        'bg-transparent text-primary border border-primary hover:bg-primary-soft active:bg-primary-soft/50',
    };

    const sizeStyles = {
      sm: 'px-3 py-1.5 text-sm gap-1.5',
      md: 'px-5 py-2.5 text-sm gap-2',
      lg: 'px-7 py-3 text-base gap-2.5',
    };

    const widthStyle = fullWidth ? 'w-full' : '';

    return (
      <button
        ref={ref}
        className={`${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]} ${widthStyle} ${className}`}
        disabled={disabled || loading}
        {...props}
      >
        {loading ? (
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
        ) : icon && iconPosition === 'left' ? (
          <span aria-hidden="true">{icon}</span>
        ) : null}
        <span>{children}</span>
        {icon && iconPosition === 'right' && !loading && (
          <span aria-hidden="true">{icon}</span>
        )}
      </button>
    );
  }
);

Button.displayName = 'Button';