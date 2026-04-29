import { FileClock } from 'lucide-react'

import { Button } from '@/components/ui/button'

interface Props {
  onOpen?: () => void
}

export default function UpdateLogCenter({ onOpen }: Props) {
  return (
    <Button
      type="button"
      aria-label="更新日志"
      variant="secondary"
      size="sm"
      onClick={onOpen}
      className="h-9 rounded-full border border-border/60 bg-secondary/70 px-2.5 shadow-sm sm:px-3"
    >
      <FileClock className="h-4 w-4 shrink-0" />
      <span className="hidden sm:inline">更新日志</span>
    </Button>
  )
}
