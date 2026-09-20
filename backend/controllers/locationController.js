const db = require('../config/db');

// GET /api/locations/cities
// Public: the worker registration form needs this before anyone is logged in.
// The whole list is small (a few hundred rows), so it is returned in one call
// and searched client-side.
exports.getCities = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT city_id, name, district, province,
              latitude::float AS latitude, longitude::float AS longitude, is_district_hq
       FROM sl_cities
       WHERE is_active = true
       ORDER BY province, district, is_district_hq DESC, name`
    );
    res.set('Cache-Control', 'public, max-age=3600');
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Get cities error:', error);
    res.status(500).json({ success: false, message: 'Failed to load cities' });
  }
};
