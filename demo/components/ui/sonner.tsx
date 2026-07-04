'use client';

import { Toaster as Sonner, type ToasterProps } from 'sonner';

/**
 * Sonner toaster themed with the app tokens. The `.dark` class cascade drives
 * the colors, so no theme prop wiring is needed; fire toasts with
 * `import { toast } from "sonner"`.
 */
function Toaster(props: ToasterProps) {
  return (
    <Sonner
      className="group"
      position="bottom-right"
      toastOptions={{
        classNames: {
          toast:
            'group w-(--width) rounded-xl border border-border bg-popover p-4 text-popover-foreground text-sm shadow-lg backdrop-blur-sm',
          title: 'font-medium text-sm',
          description: 'text-muted-foreground text-xs',
          actionButton:
            'rounded-md bg-primary px-2.5 py-1 font-medium text-primary-foreground text-xs',
          cancelButton: 'rounded-md bg-muted px-2.5 py-1 font-medium text-muted-foreground text-xs',
          icon: 'text-muted-foreground',
          error: '[&_[data-icon]]:text-destructive-foreground',
          success: '[&_[data-icon]]:text-success-foreground',
          warning: '[&_[data-icon]]:text-warning-foreground',
          info: '[&_[data-icon]]:text-info-foreground',
        },
        unstyled: true,
      }}
      {...props}
    />
  );
}

export { Toaster };
