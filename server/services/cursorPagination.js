'use strict';

const DEFAULT_PAGE_LIMIT = 50;
const MAX_PAGE_LIMIT = 100;

function pageLimit(value, fallback = DEFAULT_PAGE_LIMIT, maximum = MAX_PAGE_LIMIT) {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    const error = new Error('limit must be a positive integer.');
    error.status = 400;
    throw error;
  }
  return Math.min(parsed, maximum);
}

function encodeCursor(value, id) {
  const normalizedValue = String(value || '').trim();
  const normalizedId = String(id || '').trim();
  if (!normalizedValue || !normalizedId) return null;
  return Buffer.from(JSON.stringify({ value: normalizedValue, id: normalizedId }), 'utf8').toString('base64url');
}

function decodeCursor(cursor) {
  if (!cursor) return null;
  try {
    const parsed = JSON.parse(Buffer.from(String(cursor), 'base64url').toString('utf8'));
    const value = String(parsed?.value || '').trim();
    const id = String(parsed?.id || '').trim();
    if (!value || !id || value.length > 500 || id.length > 160) throw new Error('invalid');
    return { value, id };
  } catch (_) {
    const error = new Error('cursor is invalid or expired.');
    error.status = 400;
    throw error;
  }
}

function pageEnvelope(documents, limit, cursorValue) {
  const hasMore = documents.length > limit;
  const pageDocuments = documents.slice(0, limit);
  const last = pageDocuments.at(-1);
  return {
    documents: pageDocuments,
    page: {
      limit,
      hasMore,
      nextCursor: hasMore && last ? encodeCursor(cursorValue(last), last.id) : null
    }
  };
}

module.exports = {
  DEFAULT_PAGE_LIMIT,
  MAX_PAGE_LIMIT,
  pageLimit,
  encodeCursor,
  decodeCursor,
  pageEnvelope
};
