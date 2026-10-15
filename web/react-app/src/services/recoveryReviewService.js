import { authenticatedRead, authenticatedRequest } from './apiClient';

export async function fetchRecoveryReviews({ force = false } = {}) {
  return authenticatedRead('/api/recovery-reviews', { force, maxAgeMs: 30 * 1000 });
}

export async function decideRecoveryReview(reviewId, approve) {
  return authenticatedRequest(`/api/recovery-reviews/${encodeURIComponent(reviewId)}/${approve ? 'approve' : 'reject'}`, {
    method: 'POST',
    body: {}
  });
}

export default { fetchRecoveryReviews, decideRecoveryReview };
