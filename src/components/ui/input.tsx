import type { InputHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        'h-11 w-full rounded-[14px] border border-[var(--border)] bg-[#f8fbff] px-3 text-sm text-[var(--text-primary)] outline-none ring-[var(--accent)] transition focus:bg-white focus:ring-2',
        props.className,
      )}
    />
  )
}
