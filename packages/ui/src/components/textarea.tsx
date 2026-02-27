import * as React from 'react';
import { cn } from '../lib/utils';

export interface TextareaProps extends React.ComponentProps<'textarea'> {
  label?: string;
  error?: string;
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, label, error, id, ...props }, ref) => {
    const textareaId = id || React.useId();

    if (label || error) {
      return (
        <div className="w-full">
          {label && (
            <label
              htmlFor={textareaId}
              className="block text-sm font-medium text-foreground mb-1.5"
            >
              {label}
            </label>
          )}
          <textarea
            id={textareaId}
            className={cn(
              'flex min-h-[60px] w-full rounded-md border bg-transparent px-3 py-2 text-base shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm resize-y',
              error ? 'border-destructive' : 'border-input',
              className
            )}
            ref={ref}
            {...props}
          />
          {error && <p className="mt-1.5 text-sm text-destructive">{error}</p>}
        </div>
      );
    }

    return (
      <textarea
        className={cn(
          'flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm resize-y',
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Textarea.displayName = 'Textarea';

export { Textarea };
