import { useEffect, useState } from 'react'

export const PAGE_SIZE = 12

/**
 * Splits [list] into pages of PAGE_SIZE. If the list shrinks (a filter
 * changes or a row is deleted), it moves back to the last page that exists.
 */
export function usePaged<T>(list: T[]) {
  const [page, setPage] = useState(1)
  const totalPages = Math.max(1, Math.ceil(list.length / PAGE_SIZE))
  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])
  const current = Math.min(page, totalPages)
  const rows = list.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE)
  return { rows, page: current, totalPages, setPage, total: list.length }
}
