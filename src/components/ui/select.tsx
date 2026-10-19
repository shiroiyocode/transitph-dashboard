import type { SelectHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={cn(
        'h-11 rounded-[14px] border border-[var(--border)] bg-[#f8fbff] px-3 text-sm text-[var(--text-primary)] outline-none ring-[var(--accent)] transition focus:bg-white focus:ring-2',
        className,
      )}
    />
  )
}
