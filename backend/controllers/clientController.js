const db = require('../config/db');

// 1. Update Client Profile
exports.updateMe = async (req, res) => {
  const { full_name, latitude, longitude } = req.body;
  const userId = req.user.user_id;

  try {
    // Build dynamic update query based on provided fields
    const updates = [];
    const values = [];
    let paramIndex = 1;

    if (full_name !== undefined) {
      updates.push(`full_name = $${paramIndex}`);
      values.push(full_name);
      paramIndex++;
    }

    if (latitude !== undefined && longitude !== undefined) {
      updates.push(`gps_coordinates = point($${paramIndex}, $${paramIndex + 1})`);
      values.push(latitude, longitude);
      paramIndex += 2;
    }

    if (updates.length === 0) {
      return res.status(400).json({ message: "No valid fields provided for update" });
    }

    const query = `
      UPDATE client_profiles 
      SET ${updates.join(', ')}
      WHERE user_id = $${paramIndex}
      RETURNING *;
    `;

    values.push(userId);
    const result = await db.query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Client profile not found." });
    }

    res.status(200).json({
      status: 'success',
      message: "Profile updated successfully",
      data: result.rows[0]
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error updating profile" });
  }
};

// 2. Delete Account (Hard Delete)
exports.deleteMe = async (req, res) => {
  const userId = req.user.user_id;

  try {
    // Because we set ON DELETE CASCADE in our schema, 
    // deleting the user will automatically remove their client_profile and staff_profile.
    await db.query('DELETE FROM users WHERE user_id = $1', [userId]);

    res.status(204).json({
      status: 'success',
      data: null,
      message: "Account deleted successfully."
    });
  } catch (error) {
    res.status(500).json({ message: "Error deleting account" });
  }
};