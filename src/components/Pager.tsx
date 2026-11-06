import { PAGE_SIZE } from '@/hooks/usePaged'

/** The "Showing 1-12 of 30  < Page 1 / 3 >" bar, same as the Users page.
 * Hidden when everything fits on one page. Use with usePaged. */
export function Pager({ page, totalPages, setPage, total }: {
  page: number
  totalPages: number
  setPage: (page: number) => void
  total: number
}) {
  if (total <= PAGE_SIZE) return null
  return (
    <div className="pagination">
      <span className="pagination-info">
        Showing {(page - 1) * PAGE_SIZE + 1}-{Math.min(page * PAGE_SIZE, total)} of {total}
      </span>
      <div className="pagination-controls">
        <button className="page-btn" disabled={page <= 1} onClick={() => setPage(page - 1)}>{'<'}</button>
        <span className="page-indicator">Page {page} / {totalPages}</span>
        <button className="page-btn" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>{'>'}</button>
      </div>
    </div>
  )
}
