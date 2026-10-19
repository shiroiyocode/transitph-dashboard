import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center rounded-[14px] text-sm font-semibold transition-all disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-gradient-to-br from-[#4A7CE0] to-[#6A9EFF] text-white hover:brightness-95 shadow-[0_8px_18px_rgba(46,124,246,0.35)]',
        secondary: 'bg-[var(--surface-alt)] text-[var(--text-primary)] hover:bg-[#dce9ff]',
        outline: 'border border-[var(--border)] bg-white text-[var(--text-primary)] hover:bg-[var(--surface-alt)]',
        danger: 'bg-[var(--danger)] text-white hover:bg-[#c64c59]',
      },
      size: {
        default: 'h-10 px-4',
        sm: 'h-8 px-3 text-xs',
        lg: 'h-12 px-6',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

export function Button({ className, variant, size, asChild = false, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : 'button'
  return <Comp className={cn(buttonVariants({ variant, size, className }))} {...props} />
}
