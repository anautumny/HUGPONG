// Presentation only: paginate the authorized records already supplied by the API.
export function paginate(items, requestedPage = 1, pageSize = 10) {
  const size = Math.max(1, Math.floor(Number(pageSize) || 10));
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / size));
  const page = Math.min(totalPages, Math.max(1, Math.floor(Number(requestedPage) || 1)));
  const offset = (page - 1) * size;
  return {
    items: items.slice(offset, offset + size),
    page,
    total,
    totalPages,
    start: total === 0 ? 0 : offset + 1,
    end: Math.min(offset + size, total),
  };
}
