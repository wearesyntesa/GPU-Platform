import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationProps {
  page: number;
  pageCount: number;
  total: number;
  label: string;
  base: string;
}

export function Pagination({ page, pageCount, total, label, base }: PaginationProps) {
  if (pageCount <= 1) return null;
  return (
    <nav className="pagination" aria-label={`${label} pagination`}>
      <div className="pagination-meta">
        <span className="pagination-page">
          Page {page} of {pageCount}
        </span>
        <span>
          {total} {label}
        </span>
      </div>
      <div className="pagination-actions">
        {page > 1 ? (
          <a
            href={`${base}?page=${page - 1}`}
            className="pagination-link"
            aria-label="Previous page"
          >
            <ChevronLeft size={16} aria-hidden="true" />
            Previous
          </a>
        ) : (
          <span className="pagination-link is-disabled" aria-disabled="true">
            <ChevronLeft size={16} aria-hidden="true" />
            Previous
          </span>
        )}
        {page < pageCount ? (
          <a href={`${base}?page=${page + 1}`} className="pagination-link" aria-label="Next page">
            Next
            <ChevronRight size={16} aria-hidden="true" />
          </a>
        ) : (
          <span className="pagination-link is-disabled" aria-disabled="true">
            Next
            <ChevronRight size={16} aria-hidden="true" />
          </span>
        )}
      </div>
    </nav>
  );
}
