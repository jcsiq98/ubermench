const { db } = require('../config/database');

/**
 * Fetch providers that offer a given service type, ordered by rating (descending).
 * Only returns online providers.
 *
 * @param {string} serviceType - e.g. 'plumbing', 'electrical', 'cleaning'
 * @param {number} limit - max providers to return (default 10)
 * @returns {Array} providers with joined user data
 */
const getProvidersByServiceType = async (serviceType, limit = 10) => {
  try {
    // Fetch all online providers joined with their user record
    const providers = await db('providers')
      .join('users', 'providers.user_id', '=', 'users.id')
      .where('providers.is_online', true)
      .select(
        'providers.id as provider_id',
        'users.id as user_id',
        'users.name',
        'providers.service_types',
        'providers.rating_average',
        'providers.total_jobs',
        'providers.bio'
      )
      .orderBy('providers.rating_average', 'desc')
      .limit(50); // over-fetch so we can filter by service_type in-memory

    // service_types is stored as a JSON string array, filter in-memory
    const filtered = providers.filter((p) => {
      try {
        const types = JSON.parse(p.service_types);
        return Array.isArray(types) && types.includes(serviceType);
      } catch {
        return false;
      }
    });

    return filtered.slice(0, limit);
  } catch (error) {
    console.error('[ProviderService] Error fetching providers:', error.message);
    return [];
  }
};

/**
 * Fetch a single provider's full profile (joined with user data).
 *
 * @param {string} providerId - providers.id
 * @returns {Object|null}
 */
const getProviderDetail = async (providerId) => {
  try {
    const provider = await db('providers')
      .join('users', 'providers.user_id', '=', 'users.id')
      .where('providers.id', providerId)
      .select(
        'providers.id as provider_id',
        'users.id as user_id',
        'users.name',
        'providers.service_types',
        'providers.rating_average',
        'providers.total_jobs',
        'providers.bio',
        'providers.is_online',
        'users.phone'
      )
      .first();

    return provider || null;
  } catch (error) {
    console.error('[ProviderService] Error fetching provider detail:', error.message);
    return null;
  }
};

/**
 * Fetch the most recent reviews for a provider.
 * Reviews are stored in the `ratings` table with `ratee_id` = provider's user_id.
 *
 * @param {string} providerId - providers.id
 * @param {number} limit - max reviews to return (default 3)
 * @returns {Array} reviews with reviewer name
 */
const getProviderReviews = async (providerId, limit = 3) => {
  try {
    // Resolve the user_id for this provider row
    const provider = await db('providers')
      .where('id', providerId)
      .select('user_id')
      .first();

    if (!provider) return [];

    const reviews = await db('ratings')
      .join('users', 'ratings.rater_id', '=', 'users.id')
      .where('ratings.ratee_id', provider.user_id)
      .select(
        'ratings.stars',
        'ratings.comment',
        'ratings.created_at',
        'users.name as reviewer_name'
      )
      .orderBy('ratings.created_at', 'desc')
      .limit(limit);

    return reviews;
  } catch (error) {
    console.error('[ProviderService] Error fetching reviews:', error.message);
    return [];
  }
};

module.exports = {
  getProvidersByServiceType,
  getProviderDetail,
  getProviderReviews,
};

