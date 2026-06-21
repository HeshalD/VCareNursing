const db = require('../config/db');
const { logActivity } = require('../utils/activityLogger');

function extractActorRole(role) {
  const raw = Array.isArray(role) ? role[0] : role;
  return typeof raw === 'string' ? raw.replace(/\{|\}/g, '').split(',')[0].trim() : String(raw);
}

async function getActorName(userId) {
  const result = await db.query('SELECT full_name FROM staff_profiles WHERE user_id = $1', [userId]);
  return result.rows[0]?.full_name || 'Admin';
}

// POST /api/bookings/:booking_id/notes
exports.addNote = async (req, res) => {
  const { booking_id } = req.params;
  const { note_text, note_type = 'GENERAL' } = req.body;

  if (!note_text?.trim()) {
    return res.status(400).json({ status: 'error', message: 'Note text is required' });
  }

  try {
    const bookingResult = await db.query(
      'SELECT booking_id, client_id FROM bookings WHERE booking_id = $1',
      [booking_id]
    );
    if (!bookingResult.rows[0]) {
      return res.status(404).json({ status: 'error', message: 'Booking not found' });
    }
    const { client_id } = bookingResult.rows[0];

    const actorName = await getActorName(req.user.user_id);

    const result = await db.query(
      `INSERT INTO client_notes (client_id, booking_id, note_text, note_type, created_by_user_id, created_by_name)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [client_id, booking_id, note_text.trim(), note_type, req.user.user_id, actorName]
    );

    await db.query(
      'UPDATE bookings SET admin_notes = $1 WHERE booking_id = $2',
      [note_text.trim(), booking_id]
    );

    await logActivity({
      actorUserId: req.user.user_id,
      actorName,
      actorRole: extractActorRole(req.user.role),
      actionType: 'BOOKING_NOTE_ADDED',
      entityType: 'BOOKING',
      entityId: booking_id,
      details: { note_id: result.rows[0].note_id, note_type, client_id }
    });

    res.status(201).json({ status: 'success', data: result.rows[0] });
  } catch (error) {
    console.error('addNote Error:', error);
    res.status(500).json({ status: 'error', message: 'Internal server error' });
  }
};

// GET /api/bookings/:booking_id/notes
exports.getBookingNotes = async (req, res) => {
  const { booking_id } = req.params;
  try {
    const result = await db.query(
      'SELECT * FROM client_notes WHERE booking_id = $1 ORDER BY created_at DESC',
      [booking_id]
    );
    res.status(200).json({ status: 'success', data: result.rows });
  } catch (error) {
    console.error('getBookingNotes Error:', error);
    res.status(500).json({ status: 'error', message: 'Internal server error' });
  }
};

// GET /api/client/:client_id/notes
exports.getClientNotes = async (req, res) => {
  const { client_id } = req.params;
  const { page = 1, limit = 50 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  try {
    const [rows, countResult] = await Promise.all([
      db.query(
        `SELECT cn.*, b.status AS booking_status, b.service_type AS booking_service_type
         FROM client_notes cn
         LEFT JOIN bookings b ON cn.booking_id = b.booking_id
         WHERE cn.client_id = $1
         ORDER BY cn.created_at DESC
         LIMIT $2 OFFSET $3`,
        [client_id, parseInt(limit), offset]
      ),
      db.query('SELECT COUNT(*) FROM client_notes WHERE client_id = $1', [client_id])
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
    console.error('getClientNotes Error:', error);
    res.status(500).json({ status: 'error', message: 'Internal server error' });
  }
};

// POST /api/client/:client_id/notes  (general profile-level note, no booking)
exports.addClientNote = async (req, res) => {
  const { client_id } = req.params;
  const { note_text, note_type = 'GENERAL' } = req.body;

  if (!note_text?.trim()) {
    return res.status(400).json({ status: 'error', message: 'Note text is required' });
  }

  try {
    const clientResult = await db.query(
      'SELECT client_profile_id FROM client_profiles WHERE client_profile_id = $1',
      [client_id]
    );
    if (!clientResult.rows[0]) {
      return res.status(404).json({ status: 'error', message: 'Client not found' });
    }

    const actorName = await getActorName(req.user.user_id);

    const result = await db.query(
      `INSERT INTO client_notes (client_id, booking_id, note_text, note_type, created_by_user_id, created_by_name)
       VALUES ($1, NULL, $2, $3, $4, $5)
       RETURNING *`,
      [client_id, note_text.trim(), note_type, req.user.user_id, actorName]
    );

    await logActivity({
      actorUserId: req.user.user_id,
      actorName,
      actorRole: extractActorRole(req.user.role),
      actionType: 'CLIENT_NOTE_ADDED',
      entityType: 'CLIENT',
      entityId: client_id,
      details: { note_id: result.rows[0].note_id, note_type }
    });

    res.status(201).json({ status: 'success', data: result.rows[0] });
  } catch (error) {
    console.error('addClientNote Error:', error);
    res.status(500).json({ status: 'error', message: 'Internal server error' });
  }
};

// PATCH /api/client/:client_id/notes/:note_id
exports.updateClientNote = async (req, res) => {
  const { client_id, note_id } = req.params;
  const { note_text, note_type } = req.body;

  if (!note_text?.trim()) {
    return res.status(400).json({ status: 'error', message: 'Note text is required' });
  }

  try {
    const result = await db.query(
      `UPDATE client_notes
       SET note_text = $1, note_type = COALESCE($2, note_type), updated_at = NOW()
       WHERE note_id = $3 AND client_id = $4
       RETURNING *`,
      [note_text.trim(), note_type || null, note_id, client_id]
    );
    if (!result.rows[0]) {
      return res.status(404).json({ status: 'error', message: 'Note not found' });
    }

    // If linked to a booking, keep admin_notes in sync
    const { booking_id } = result.rows[0];
    if (booking_id) {
      await db.query(
        `UPDATE bookings SET admin_notes = (
           SELECT note_text FROM client_notes WHERE booking_id = $1 ORDER BY created_at DESC LIMIT 1
         ) WHERE booking_id = $1`,
        [booking_id]
      );
    }

    const actorName = await getActorName(req.user.user_id);
    await logActivity({
      actorUserId: req.user.user_id,
      actorName,
      actorRole: extractActorRole(req.user.role),
      actionType: 'CLIENT_NOTE_UPDATED',
      entityType: 'CLIENT',
      entityId: client_id,
      details: { note_id, note_type }
    });

    res.status(200).json({ status: 'success', data: result.rows[0] });
  } catch (error) {
    console.error('updateClientNote Error:', error);
    res.status(500).json({ status: 'error', message: 'Internal server error' });
  }
};

// DELETE /api/client/:client_id/notes/:note_id
exports.deleteClientNote = async (req, res) => {
  const { client_id, note_id } = req.params;
  try {
    const result = await db.query(
      'DELETE FROM client_notes WHERE note_id = $1 AND client_id = $2 RETURNING note_id, booking_id',
      [note_id, client_id]
    );
    if (!result.rows[0]) {
      return res.status(404).json({ status: 'error', message: 'Note not found' });
    }

    const { booking_id } = result.rows[0];
    if (booking_id) {
      await db.query(
        `UPDATE bookings SET admin_notes = (
           SELECT note_text FROM client_notes WHERE booking_id = $1 ORDER BY created_at DESC LIMIT 1
         ) WHERE booking_id = $1`,
        [booking_id]
      );
    }

    const actorName = await getActorName(req.user.user_id);
    await logActivity({
      actorUserId: req.user.user_id,
      actorName,
      actorRole: extractActorRole(req.user.role),
      actionType: 'CLIENT_NOTE_DELETED',
      entityType: 'CLIENT',
      entityId: client_id,
      details: { note_id }
    });

    res.status(200).json({ status: 'success', message: 'Note deleted successfully' });
  } catch (error) {
    console.error('deleteClientNote Error:', error);
    res.status(500).json({ status: 'error', message: 'Internal server error' });
  }
};

// PATCH /api/bookings/:booking_id/notes/:note_id
exports.updateNote = async (req, res) => {
  const { booking_id, note_id } = req.params;
  const { note_text, note_type } = req.body;

  if (!note_text?.trim()) {
    return res.status(400).json({ status: 'error', message: 'Note text is required' });
  }

  try {
    const result = await db.query(
      `UPDATE client_notes
       SET note_text = $1, note_type = COALESCE($2, note_type), updated_at = NOW()
       WHERE note_id = $3 AND booking_id = $4
       RETURNING *`,
      [note_text.trim(), note_type || null, note_id, booking_id]
    );
    if (!result.rows[0]) {
      return res.status(404).json({ status: 'error', message: 'Note not found' });
    }

    // Sync booking's admin_notes to the most recent note
    await db.query(
      `UPDATE bookings SET admin_notes = (
         SELECT note_text FROM client_notes WHERE booking_id = $1 ORDER BY created_at DESC LIMIT 1
       ) WHERE booking_id = $1`,
      [booking_id]
    );

    const actorName = await getActorName(req.user.user_id);
    await logActivity({
      actorUserId: req.user.user_id,
      actorName,
      actorRole: extractActorRole(req.user.role),
      actionType: 'BOOKING_NOTE_UPDATED',
      entityType: 'BOOKING',
      entityId: booking_id,
      details: { note_id, note_type }
    });

    res.status(200).json({ status: 'success', data: result.rows[0] });
  } catch (error) {
    console.error('updateNote Error:', error);
    res.status(500).json({ status: 'error', message: 'Internal server error' });
  }
};

// DELETE /api/bookings/:booking_id/notes/:note_id
exports.deleteNote = async (req, res) => {
  const { booking_id, note_id } = req.params;
  try {
    const result = await db.query(
      'DELETE FROM client_notes WHERE note_id = $1 AND booking_id = $2 RETURNING note_id',
      [note_id, booking_id]
    );
    if (!result.rows[0]) {
      return res.status(404).json({ status: 'error', message: 'Note not found' });
    }

    // Sync booking's admin_notes to the most recent remaining note
    await db.query(
      `UPDATE bookings SET admin_notes = (
         SELECT note_text FROM client_notes WHERE booking_id = $1 ORDER BY created_at DESC LIMIT 1
       ) WHERE booking_id = $1`,
      [booking_id]
    );

    const actorName = await getActorName(req.user.user_id);
    await logActivity({
      actorUserId: req.user.user_id,
      actorName,
      actorRole: extractActorRole(req.user.role),
      actionType: 'BOOKING_NOTE_DELETED',
      entityType: 'BOOKING',
      entityId: booking_id,
      details: { note_id }
    });

    res.status(200).json({ status: 'success', message: 'Note deleted successfully' });
  } catch (error) {
    console.error('deleteNote Error:', error);
    res.status(500).json({ status: 'error', message: 'Internal server error' });
  }
};
