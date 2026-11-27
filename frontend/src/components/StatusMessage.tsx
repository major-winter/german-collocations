import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

// B4 of docs/ui-review-2026-11-27-search-and-cohesion.md: one look for the
// word page's loading, error, not-found and empty states - left-aligned like
// the content they stand in for, a sans heading that never hyphenates, one
// muted sentence, an optional action.

interface StatusMessageProps {
    title?: ReactNode;
    children?: ReactNode;
    action?: ReactNode;
    role?: 'status' | 'alert';
    className?: string;
}

export function StatusMessage({ title, children, action, role, className }: StatusMessageProps) {
    return (
        <div role={role} className={cn('mt-8 space-y-3', className)}>
            {title && <h2 className="text-lg font-semibold break-words">{title}</h2>}
            {children && <div className="text-sm text-muted-foreground leading-snug">{children}</div>}
            {action}
        </div>
    );
}
