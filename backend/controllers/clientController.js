const db = require('../config/db');

// 0. Get Client Profile by User ID
exports.getClientProfileByUserId = async (req, res) => {
  const { user_id } = req.params;

  try {
    const result = await db.query(
      'SELECT cp.*, u.email, u.mobile_number, u.created_at as user_created_at FROM client_profiles cp JOIN users u ON cp.user_id = u.user_id WHERE cp.user_id = $1',
      [user_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ 
        message: "Client profile not found for this user" 
      });
    }

    res.status(200).json({
      message: "Client profile retrieved successfully",
      data: result.rows[0]
    });

  } catch (error) {
    console.error("Error fetching client profile by user ID:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// 0.1. Get Client Profile by Client ID
exports.getClientProfile = async (req, res) => {
  const { client_id } = req.params;

  try {
    const result = await db.query(
      'SELECT * FROM client_profiles WHERE client_profile_id = $1',
      [client_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ 
        message: "Client profile not found" 
      });
    }

    res.status(200).json({
      message: "Client profile retrieved successfully",
      data: result.rows[0]
    });

  } catch (error) {
    console.error("Error fetching client profile by client ID:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// 1. Update Client Profile
exports.updateMe = async (req, res) => {
  const { full_name, latitude, longitude, gender } = req.body;
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

    if (gender !== undefined) {
      updates.push(`gender = $${paramIndex}::gender_enum`);
      values.push(gender);
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

// 3. Retrieve active bookings for a specific client. Client ID can be supplied
// as a URL parameter or derived from the authenticated user.
exports.getActiveBookingByClientID = async (req, res) => {
  try {
    let clientId = req.params.client_id;

    if (!clientId) {
      // derive from logged-in user
      const userId = req.user.user_id;
      const clientRes = await db.query(
        'SELECT client_profile_id FROM client_profiles WHERE user_id = $1',
        [userId]
      );
      if (clientRes.rows.length === 0) {
        return res.status(404).json({ message: 'Client profile not found' });
      }
      clientId = clientRes.rows[0].client_profile_id;
    }

    const bookingsRes = await db.query(
      'SELECT * FROM bookings WHERE client_id = $1 AND status = $2 ORDER BY created_at DESC',
      [clientId, 'ACTIVE']
    );

    res.status(200).json({
      status: 'success',
      results: bookingsRes.rows.length,
      data: bookingsRes.rows
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error fetching bookings for client' });
  }
};

exports.getAllBookingsForClient = async (req, res) => {
  try {
    let clientId = req.params.client_id;

    if (!clientId) {
      // derive from logged-in user
      const userId = req.user.user_id;
      const clientRes = await db.query(
        'SELECT client_profile_id FROM client_profiles WHERE user_id = $1',
        [userId]
      );
      if (clientRes.rows.length === 0) {
        return res.status(404).json({ message: 'Client profile not found' });
      }
      clientId = clientRes.rows[0].client_profile_id;
    }

    const bookingsRes = await db.query(
      'SELECT * FROM bookings WHERE client_id = $1 ORDER BY created_at DESC',
      [clientId]
    );

    res.status(200).json({
      status: 'success',
      results: bookingsRes.rows.length,
      data: bookingsRes.rows
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error fetching active bookings for client' });
  }
};

// 4.5. Get all client service requests, quotes, and payments in chronological order
exports.getClientServiceHistory = async (req, res) => {
  const { client_id } = req.params;

  try {
    // Get all service requests for this client
    const serviceRequestsResult = await db.query(`
      SELECT 
        sr.*,
        u.mobile_number as client_mobile
      FROM service_requests sr
      JOIN users u ON sr.payer_mobile = u.mobile_number
      WHERE sr.client_id = $1
      ORDER BY sr.created_at DESC
    `, [client_id]);

    // Get all quotes for this client
    const quotesResult = await db.query(`
      SELECT 
        q.*,
        sr.payer_name,
        sr.payer_mobile,
        sr.patient_name,
        sr.service_type,
        sr.status as request_status
      FROM quotations q
      JOIN service_requests sr ON q.request_id = sr.request_id
      WHERE sr.client_id = $1
      ORDER BY q.created_at DESC
    `, [client_id]);

    // Get all payment slips for this client
    const paymentSlipsResult = await db.query(`
      SELECT 
        ps.*,
        q.estimate_number,
        q.total_amount,
        sr.payer_name,
        sr.payer_mobile
      FROM payment_slips ps
      JOIN quotations q ON ps.quote_id = q.quote_id
      JOIN service_requests sr ON q.request_id = sr.request_id
      WHERE sr.client_id = $1
      ORDER BY ps.created_at DESC
    `, [client_id]);

    // Combine all data into a single timeline
    const timeline = [];

    // Add service requests
    serviceRequestsResult.rows.forEach(request => {
      timeline.push({
        ...request,
        type: 'service_request',
        date: request.created_at,
        sortKey: request.created_at
      });
    });

    // Add quotes
    quotesResult.rows.forEach(quote => {
      timeline.push({
        ...quote,
        type: 'quote',
        date: quote.created_at,
        sortKey: quote.created_at
      });
    });

    // Add payment slips
    paymentSlipsResult.rows.forEach(payment => {
      timeline.push({
        ...payment,
        type: 'payment',
        date: payment.created_at,
        sortKey: payment.created_at
      });
    });

    // Sort all items by date (newest first)
    timeline.sort((a, b) => new Date(b.sortKey) - new Date(a.sortKey));

    res.status(200).json({
      status: 'success',
      results: timeline.length,
      data: timeline
    });

  } catch (error) {
    console.error('Error fetching client service history:', error);
    res.status(500).json({ 
      message: 'Failed to fetch service history' 
    });
  }
};

// 5. Get all clients
exports.getAllClients = async (req, res) => {
  try {
    const clientsRes = await db.query(
      'SELECT cp.*, u.email, u.created_at as user_created_at FROM client_profiles cp JOIN users u ON cp.user_id = u.user_id ORDER BY cp.created_at DESC'
    );

    res.status(200).json({
      status: 'success',
      results: clientsRes.rows.length,
      data: clientsRes.rows
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error fetching clients' });
  }
};