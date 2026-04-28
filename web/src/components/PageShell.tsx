import type { ComponentPropsWithoutRef, ReactNode } from 'react'

import { cn } from '@/lib/utils'

type PageShellWidth = 'default' | 'wide' | 'narrow'

type PageShellProps = ComponentPropsWithoutRef<'div'> & {
  children: ReactNode
  width?: PageShellWidth
  className?: string
}

const widthClassNameMap: Record<PageShellWidth, string> = {
  default: 'max-w-7xl',
  wide: 'max-w-[88rem]',
  narrow: 'max-w-5xl',
}

export default function PageShell({ children, className, width = 'default', ...props }: PageShellProps) {
  return (
    <div
      className={cn(
        'mx-auto w-full px-4 py-6 lg:px-8 lg:py-8',
        widthClassNameMap[width],
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
}
