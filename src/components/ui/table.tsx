import type { TableHTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export function Table(props: TableHTMLAttributes<HTMLTableElement>) {
  return <table {...props} className={cn('w-full border-collapse text-sm', props.className)} />
}

export function Th(props: ThHTMLAttributes<HTMLTableCellElement>) {
  return <th {...props} className={cn('cursor-pointer border-b border-[var(--border)] px-3 py-2 text-left font-semibold text-[var(--text-primary)]', props.className)} />
}

export function Td(props: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td {...props} className={cn('border-b border-[var(--border)] px-3 py-2 align-top text-[var(--text-primary)]', props.className)} />
}
