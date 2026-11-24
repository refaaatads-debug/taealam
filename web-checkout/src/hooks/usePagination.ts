import { useState, useCallback } from "react";

export function usePagination(pageSize = 20) {
  const [page, setPage] = useState(0);

  const range = { from: page * pageSize, to: (page + 1) * pageSize - 1 };

  const nextPage = useCallback(() => setPage((p) => p + 1), []);
  const prevPage = useCallback(() => setPage((p) => Math.max(0, p - 1)), []);
  const resetPage = useCallback(() => setPage(0), []);

  return { page, range, nextPage, prevPage, resetPage, pageSize };
}
