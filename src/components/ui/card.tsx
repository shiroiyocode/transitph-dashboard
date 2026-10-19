import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-[20px] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[0_10px_26px_rgba(46,124,246,0.09)]', className)} {...props} />
}
