import * as React from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { cn } from '@/lib/utils'

export const Dialog = DialogPrimitive.Root
export const DialogTrigger = DialogPrimitive.Trigger
export const DialogClose = DialogPrimitive.Close

export function DialogContent({ className, children, ...props }: React.ComponentProps<typeof DialogPrimitive.Content>) {
  const { style, ...contentProps } = props
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 1100,
          background: 'rgba(15, 29, 53, 0.56)',
        }}
      />
      <DialogPrimitive.Content
        className={cn(className)}
        style={{
          position: 'fixed',
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 1101,
          width: '95vw',
          maxWidth: '40rem',
          borderRadius: 16,
          border: '1px solid var(--border)',
          background: '#fff',
          padding: 20,
          boxShadow: '0 16px 48px rgba(15, 29, 53, 0.12)',
          maxHeight: '90vh',
          overflowY: 'auto',
          ...style,
        }}
        {...contentProps}
      >
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
}

export function DialogHeader(props: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('mb-3', props.className)} {...props} />
}

export function DialogTitle(props: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return <DialogPrimitive.Title className={cn('text-lg font-semibold text-[var(--text-primary)]', props.className)} {...props} />
}
