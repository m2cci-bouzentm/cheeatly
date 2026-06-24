import * as React from 'react';

import { cn } from '@/lib/utils';

interface InputProps extends React.ComponentProps<'input'> {
  glass?: boolean;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, glass, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          'flex h-9 w-full rounded-md border px-3 py-1 text-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
          glass
            ? 'bg-[var(--overlay-input-bg)] border-[var(--overlay-border-soft)] text-[var(--overlay-text-primary)] placeholder:text-[var(--overlay-text-placeholder)] hover:bg-[var(--overlay-input-hover-bg)] focus:bg-[var(--overlay-input-focus-bg)]'
            : 'border-input bg-background text-foreground',
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = 'Input';

export { Input };
