import type { CSSProperties } from 'react'
import type { Board } from '../../../api/types'

/** Название списка его собственным цветом на лёгкой подложке того же цвета. */
export function ListLabel({ board }: { board: Board }) {
  return (
    <span
      style={{ '--list-color': board.color || 'rgb(var(--color-primary))' } as CSSProperties}
      className="inline-flex max-w-[12rem] items-center gap-1 rounded-sm bg-[color:color-mix(in_srgb,var(--list-color)_14%,transparent)] px-1.5 font-medium text-[color:color-mix(in_srgb,var(--list-color)_80%,black)] dark:text-[color:color-mix(in_srgb,var(--list-color)_60%,white)]"
    >
      {board.icon ? <span aria-hidden="true">{board.icon}</span> : null}
      <span className="truncate">{board.name}</span>
    </span>
  )
}
