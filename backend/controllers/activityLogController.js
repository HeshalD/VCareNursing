const db = require('../config/db');

exports.getActivityLog = async (req, res) => {
  const { page = 1, limit = 50, action_type, from, to } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  try {
    const params = [];
    const conditions = [];

    if (action_type) {
      params.push(action_type);
      conditions.push(`action_type = $${params.length}`);
    }
    if (from) {
      params.push(from);
      conditions.push(`created_at >= $${params.length}`);
    }
    if (to) {
      params.push(to);
      conditions.push(`created_at <= $${params.length}`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    params.push(parseInt(limit));
    const limitParam = params.length;
    params.push(offset);
    const offsetParam = params.length;

    const [rows, countResult] = await Promise.all([
      db.query(
        `SELECT * FROM activity_log ${whereClause} ORDER BY created_at DESC LIMIT $${limitParam} OFFSET $${offsetParam}`,
        params
      ),
      db.query(
        `SELECT COUNT(*) FROM activity_log ${whereClause}`,
        params.slice(0, params.length - 2)
      )
    ]);

    res.status(200).json({
      status: 'success',
      data: rows.rows,
      pagination: {
        total: parseInt(countResult.rows[0].count),
        page: parseInt(page),
        limit: parseInt(limit)
      }
    });

  } catch (error) {
    console.error('getActivityLog Error:', error);
    res.status(500).json({ status: 'error', message: 'Internal server error' });
  }
};

exports.getActivityLogByActor = async (req, res) => {
  const { user_id } = req.params;
  const { page = 1, limit = 50, action_type, from, to } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  try {
    const params = [user_id];
    const conditions = ['actor_user_id = $1'];

    if (action_type) {
      params.push(action_type);
      conditions.push(`action_type = $${params.length}`);
    }
    if (from) {
      params.push(from);
      conditions.push(`created_at >= $${params.length}`);
    }
    if (to) {
      params.push(to);
      conditions.push(`created_at <= $${params.length}`);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    params.push(parseInt(limit));
    const limitParam = params.length;
    params.push(offset);
    const offsetParam = params.length;

    const [rows, countResult] = await Promise.all([
      db.query(
        `SELECT * FROM activity_log ${whereClause} ORDER BY created_at DESC LIMIT $${limitParam} OFFSET $${offsetParam}`,
        params
      ),
      db.query(
        `SELECT COUNT(*) FROM activity_log ${whereClause}`,
        params.slice(0, params.length - 2)
      )
    ]);

    res.status(200).json({
      status: 'success',
      data: rows.rows,
      pagination: {
        total: parseInt(countResult.rows[0].count),
        page: parseInt(page),
        limit: parseInt(limit)
      }
    });

  } catch (error) {
    console.error('getActivityLogByActor Error:', error);
    res.status(500).json({ status: 'error', message: 'Internal server error' });
  }
};
