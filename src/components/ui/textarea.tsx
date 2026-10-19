import type { TextareaHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={cn(
        'w-full rounded-[14px] border border-[var(--border)] bg-[#f8fbff] px-3 py-2 text-sm text-[var(--text-primary)] outline-none ring-[var(--accent)] transition focus:bg-white focus:ring-2',
        props.className,
      )}
    />
  )
}
