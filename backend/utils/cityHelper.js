const db = require('../config/db');

/**
 * Resolves an incoming city_id (from a form/body) against sl_cities.
 *
 * Returns:
 *   - null                      when no city was supplied (caller keeps its existing behaviour)
 *   - { city_id, name }         for a valid, active city
 *   - throws an Error with .status = 400 when a city_id was supplied but is not valid
 *
 * The caller stores city_id AND writes `name` into the legacy free-text `location`
 * column so everything that still reads `location` sees a clean, consistent value.
 */
async function resolveCity(rawCityId, client = db) {
  if (rawCityId === undefined || rawCityId === null || rawCityId === '' || rawCityId === 'null') return null;

  const cityId = Number(rawCityId);
  if (!Number.isInteger(cityId) || cityId <= 0) {
    const err = new Error('Invalid city selected');
    err.status = 400;
    throw err;
  }

  const result = await client.query(
    'SELECT city_id, name FROM sl_cities WHERE city_id = $1 AND is_active = true',
    [cityId]
  );
  if (result.rows.length === 0) {
    const err = new Error('Selected city was not found');
    err.status = 400;
    throw err;
  }
  return result.rows[0];
}

module.exports = { resolveCity };
