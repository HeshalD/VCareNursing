const db = require('../config/db');
const { logActivity } = require('../utils/activityLogger');
const { sendReviewRequest: sendReviewRequestWA } = require('../utils/metaWhatsapp');

// Helper function to find staff profile associated with a client profile
async function getStaffProfileByClientProfileId(client_profile_id) {
  try {
    const query = `
      SELECT sp.staff_profile_id, sp.full_name
      FROM staff_profiles sp
      JOIN users u ON sp.user_id = u.user_id
      JOIN client_profiles cp ON u.user_id = cp.user_id
      WHERE cp.client_profile_id = $1
    `;
    
    const result = await db.pool.query(query, [client_profile_id]);
    return result.rows.length > 0 ? result.rows[0] : null;
  } catch (error) {
    console.error("Error finding staff profile for client:", error);
    throw error;
  }
}

// Create a new staff review
exports.createReview = async (req, res) => {
  const { staff_profile_id, rating, review_text, booking_id } = req.body;
  const user_id = req.user?.user_id;

  try {
    let client_profile_id;
    if (user_id) {
      const clientResult = await db.pool.query(
        'SELECT client_profile_id FROM client_profiles WHERE user_id = $1',
        [user_id]
      );
      if (clientResult.rows.length === 0) {
        return res.status(403).json({ message: "Only clients can create reviews" });
      }
      client_profile_id = clientResult.rows[0].client_profile_id;
    } else {
      return res.status(401).json({ message: "User not authenticated" });
    }

    if (!staff_profile_id || !rating || !review_text) {
      return res.status(400).json({ message: "Missing required fields: staff_profile_id, rating, review_text" });
    }

    if (rating < 1 || rating > 5) {
      return res.status(400).json({ message: "Rating must be between 1 and 5" });
    }

    const staffCheck = await db.pool.query(
      'SELECT staff_profile_id FROM staff_profiles WHERE staff_profile_id = $1',
      [staff_profile_id]
    );
    if (staffCheck.rows.length === 0) {
      return res.status(404).json({ message: "Staff profile not found" });
    }

    const associatedStaff = await getStaffProfileByClientProfileId(client_profile_id);
    if (associatedStaff && associatedStaff.staff_profile_id === parseInt(staff_profile_id)) {
      return res.status(403).json({ message: "You cannot review your own staff profile" });
    }

    // Booking-level enforcement: one review per booking
    if (booking_id) {
      const bookingCheck = await db.pool.query(
        'SELECT booking_id, status FROM bookings WHERE booking_id = $1 AND client_id = $2',
        [booking_id, client_profile_id]
      );
      if (bookingCheck.rows.length === 0) {
        return res.status(403).json({ message: "Booking not found or does not belong to this client" });
      }
      if (!['ACTIVE', 'COMPLETED', 'TERMINATED'].includes(bookingCheck.rows[0].status)) {
        return res.status(400).json({ message: "You can only review active, completed, or terminated bookings" });
      }
      const dupCheck = await db.pool.query(
        'SELECT review_id FROM staff_reviews WHERE booking_id = $1 AND client_profile_id = $2',
        [booking_id, client_profile_id]
      );
      if (dupCheck.rows.length > 0) {
        return res.status(409).json({ message: "You have already reviewed this booking" });
      }
    }

    const result = await db.pool.query(
      `INSERT INTO staff_reviews (staff_profile_id, client_profile_id, rating, review_text, booking_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [staff_profile_id, client_profile_id, rating, review_text, booking_id || null]
    );

    const newReview = result.rows[0];
    await updateStaffRating(staff_profile_id);

    res.status(201).json({ message: "Review created successfully", review: newReview });

  } catch (error) {
    console.error("Error creating review:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Get all reviews (with pagination and filtering)
exports.getAllReviews = async (req, res) => {
  const { page = 1, limit = 10, is_visible, min_rating, max_rating, staff_profile_id, search } = req.query;
  const offset = (page - 1) * limit;

  try {
    let query = `
      SELECT sr.*,
             sp.full_name as staff_name,
             cp.full_name as client_name,
             b.service_type as booking_service_type,
             b.status as booking_status,
             b.start_date as booking_start_date
      FROM staff_reviews sr
      LEFT JOIN staff_profiles sp ON sr.staff_profile_id = sp.staff_profile_id
      LEFT JOIN client_profiles cp ON sr.client_profile_id = cp.client_profile_id
      LEFT JOIN bookings b ON sr.booking_id = b.booking_id
      WHERE 1=1
    `;

    const queryParams = [];
    let paramIndex = 1;

    if (is_visible !== undefined) {
      query += ` AND sr.is_visible = $${paramIndex}`;
      queryParams.push(is_visible === 'true');
      paramIndex++;
    }

    if (min_rating) {
      query += ` AND sr.rating >= $${paramIndex}`;
      queryParams.push(min_rating);
      paramIndex++;
    }

    if (max_rating) {
      query += ` AND sr.rating <= $${paramIndex}`;
      queryParams.push(max_rating);
      paramIndex++;
    }

    if (staff_profile_id) {
      query += ` AND sr.staff_profile_id = $${paramIndex}`;
      queryParams.push(staff_profile_id);
      paramIndex++;
    }

    if (search) {
      query += ` AND (sp.full_name ILIKE $${paramIndex} OR cp.full_name ILIKE $${paramIndex} OR sr.review_text ILIKE $${paramIndex})`;
      queryParams.push(`%${search}%`);
      paramIndex++;
    }

    query += ` ORDER BY sr.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    queryParams.push(limit, offset);

    const result = await db.pool.query(query, queryParams);

    // Get total count for pagination
    let countQuery = `
      SELECT COUNT(*) FROM staff_reviews sr
      LEFT JOIN staff_profiles sp ON sr.staff_profile_id = sp.staff_profile_id
      LEFT JOIN client_profiles cp ON sr.client_profile_id = cp.client_profile_id
      WHERE 1=1
    `;
    const countParams = [];
    let countIndex = 1;

    if (is_visible !== undefined) {
      countQuery += ` AND sr.is_visible = $${countIndex}`;
      countParams.push(is_visible === 'true');
      countIndex++;
    }

    if (min_rating) {
      countQuery += ` AND sr.rating >= $${countIndex}`;
      countParams.push(min_rating);
      countIndex++;
    }

    if (max_rating) {
      countQuery += ` AND sr.rating <= $${countIndex}`;
      countParams.push(max_rating);
      countIndex++;
    }

    if (staff_profile_id) {
      countQuery += ` AND sr.staff_profile_id = $${countIndex}`;
      countParams.push(staff_profile_id);
      countIndex++;
    }

    if (search) {
      countQuery += ` AND (sp.full_name ILIKE $${countIndex} OR cp.full_name ILIKE $${countIndex} OR sr.review_text ILIKE $${countIndex})`;
      countParams.push(`%${search}%`);
      countIndex++;
    }

    const countResult = await db.pool.query(countQuery, countParams);
    const totalCount = parseInt(countResult.rows[0].count);

    res.json({
      reviews: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalCount,
        pages: Math.ceil(totalCount / limit)
      }
    });

  } catch (error) {
    console.error("Error fetching reviews:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Get reviews by staff ID
exports.getReviewsByStaffId = async (req, res) => {
  const { staff_id } = req.params;
  const { page = 1, limit = 10, is_visible = 'true' } = req.query;
  const offset = (page - 1) * limit;

  try {
    // Check if staff exists
    const staffCheck = await db.pool.query(
      'SELECT full_name, average_rating, total_reviews FROM staff_profiles WHERE staff_profile_id = $1',
      [staff_id]
    );

    if (staffCheck.rows.length === 0) {
      return res.status(404).json({ message: "Staff profile not found" });
    }

    const staffInfo = staffCheck.rows[0];

    // Get reviews for this staff
    const reviewsQuery = `
      SELECT sr.*, cp.full_name as client_name
      FROM staff_reviews sr
      LEFT JOIN client_profiles cp ON sr.client_profile_id = cp.client_profile_id
      WHERE sr.staff_profile_id = $1 AND sr.is_visible = $2
      ORDER BY sr.created_at DESC
      LIMIT $3 OFFSET $4
    `;

    const reviewsResult = await db.pool.query(reviewsQuery, [
      staff_id, 
      is_visible === 'true', 
      limit, 
      offset
    ]);

    // Get rating distribution
    const ratingDistributionQuery = `
      SELECT rating, COUNT(*) as count
      FROM staff_reviews
      WHERE staff_profile_id = $1 AND is_visible = $2
      GROUP BY rating
      ORDER BY rating
    `;

    const distributionResult = await db.pool.query(ratingDistributionQuery, [
      staff_id, 
      is_visible === 'true'
    ]);

    // Get total count for pagination
    const countResult = await db.pool.query(
      'SELECT COUNT(*) FROM staff_reviews WHERE staff_profile_id = $1 AND is_visible = $2',
      [staff_id, is_visible === 'true']
    );

    const totalCount = parseInt(countResult.rows[0].count);

    res.json({
      staff_info: staffInfo,
      reviews: reviewsResult.rows,
      rating_distribution: distributionResult.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalCount,
        pages: Math.ceil(totalCount / limit)
      }
    });

  } catch (error) {
    console.error("Error fetching staff reviews:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Get a single review by ID
exports.getReviewById = async (req, res) => {
  const { review_id } = req.params;

  try {
    const result = await db.pool.query(
      `SELECT sr.*, sp.full_name as staff_name, cp.full_name as client_name
       FROM staff_reviews sr
       LEFT JOIN staff_profiles sp ON sr.staff_profile_id = sp.staff_profile_id
       LEFT JOIN client_profiles cp ON sr.client_profile_id = cp.client_profile_id
       WHERE sr.review_id = $1`,
      [review_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Review not found" });
    }

    res.json({ review: result.rows[0] });

  } catch (error) {
    console.error("Error fetching review:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Update a review (only by the client who wrote it or admin)
exports.updateReview = async (req, res) => {
  const { review_id } = req.params;
  const { rating, review_text } = req.body;
  const user_id = req.user?.user_id;
  const userRole = req.user?.role;

  // Fetch client_profile_id if user is a client
  let client_profile_id;
  if (userRole !== 'admin' && user_id) {
    const clientResult = await db.pool.query(
      'SELECT client_profile_id FROM client_profiles WHERE user_id = $1',
      [user_id]
    );
    if (clientResult.rows.length > 0) {
      client_profile_id = clientResult.rows[0].client_profile_id;
    }
  }

  try {
    // Check if review exists and get current data
    const currentReview = await db.pool.query(
      'SELECT * FROM staff_reviews WHERE review_id = $1',
      [review_id]
    );

    if (currentReview.rows.length === 0) {
      return res.status(404).json({ message: "Review not found" });
    }

    const review = currentReview.rows[0];

    // Check authorization (client can only update their own review, admin can update any)
    if (userRole !== 'admin' && review.client_profile_id !== client_profile_id) {
      return res.status(403).json({ message: "Not authorized to update this review" });
    }

    // Validate rating if provided
    if (rating && (rating < 1 || rating > 5)) {
      return res.status(400).json({ message: "Rating must be between 1 and 5" });
    }

    // Update the review
    const updateFields = [];
    const updateValues = [];
    let paramIndex = 1;

    if (rating !== undefined) {
      updateFields.push(`rating = $${paramIndex}`);
      updateValues.push(rating);
      paramIndex++;
    }

    if (review_text !== undefined) {
      updateFields.push(`review_text = $${paramIndex}`);
      updateValues.push(review_text);
      paramIndex++;
    }

    if (updateFields.length === 0) {
      return res.status(400).json({ message: "No fields to update" });
    }

    updateValues.push(review_id);

    const updateQuery = `
      UPDATE staff_reviews 
      SET ${updateFields.join(', ')}
      WHERE review_id = $${paramIndex}
      RETURNING *
    `;

    const result = await db.pool.query(updateQuery, updateValues);
    const updatedReview = result.rows[0];

    // Update staff's average rating if rating was changed
    if (rating !== undefined) {
      await updateStaffRating(review.staff_profile_id);
    }

    res.json({
      message: "Review updated successfully",
      review: updatedReview
    });

  } catch (error) {
    console.error("Error updating review:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Toggle review visibility (admin only)
exports.toggleReviewVisibility = async (req, res) => {
  const { review_id } = req.params;

  try {
    const result = await db.pool.query(
      'UPDATE staff_reviews SET is_visible = NOT is_visible WHERE review_id = $1 RETURNING *',
      [review_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Review not found" });
    }

    const updatedReview = result.rows[0];

    // Update staff's average rating since visibility changed
    await updateStaffRating(updatedReview.staff_profile_id);

    // Activity log (non-fatal)
    try {
      const actorRole = Array.isArray(req.user.role) ? req.user.role[0] : req.user.role;
      const actorNameResult = await db.pool.query('SELECT full_name FROM staff_profiles WHERE user_id = $1', [req.user.user_id]);
      const actorName = actorNameResult.rows[0]?.full_name || 'Admin';
      await logActivity({
        actorUserId: req.user.user_id,
        actorName,
        actorRole: typeof actorRole === 'string' ? actorRole.replace(/\{|\}/g, '').split(',')[0].trim() : String(actorRole),
        actionType: 'REVIEW_VISIBILITY_TOGGLED',
        entityType: 'STAFF_REVIEW',
        entityId: String(updatedReview.review_id),
        details: {
          is_visible: updatedReview.is_visible,
          staff_profile_id: updatedReview.staff_profile_id,
          client_profile_id: updatedReview.client_profile_id,
          rating: updatedReview.rating,
        }
      });
    } catch (logErr) {
      console.error('Activity log failed (toggleReviewVisibility):', logErr.message);
    }

    res.json({
      message: `Review ${updatedReview.is_visible ? 'shown' : 'hidden'} successfully`,
      review: updatedReview
    });

  } catch (error) {
    console.error("Error toggling review visibility:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Delete a review (admin only, or client can delete their own)
exports.deleteReview = async (req, res) => {
  const { review_id } = req.params;
  const user_id = req.user?.user_id;
  const userRole = req.user?.role;

  // Fetch client_profile_id if user is a client
  let client_profile_id;
  if (userRole !== 'admin' && user_id) {
    const clientResult = await db.pool.query(
      'SELECT client_profile_id FROM client_profiles WHERE user_id = $1',
      [user_id]
    );
    if (clientResult.rows.length > 0) {
      client_profile_id = clientResult.rows[0].client_profile_id;
    }
  }

  try {
    // Check if review exists
    const currentReview = await db.pool.query(
      'SELECT * FROM staff_reviews WHERE review_id = $1',
      [review_id]
    );

    if (currentReview.rows.length === 0) {
      return res.status(404).json({ message: "Review not found" });
    }

    const review = currentReview.rows[0];

    // Check authorization
    if (userRole !== 'admin' && review.client_profile_id !== client_profile_id) {
      return res.status(403).json({ message: "Not authorized to delete this review" });
    }

    // Delete the review
    await db.pool.query('DELETE FROM staff_reviews WHERE review_id = $1', [review_id]);

    // Update staff's average rating
    await updateStaffRating(review.staff_profile_id);

    res.json({ message: "Review deleted successfully" });

  } catch (error) {
    console.error("Error deleting review:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Get review statistics
exports.getReviewStatistics = async (req, res) => {
  try {
    const statsQuery = `
      SELECT 
        COUNT(*) as total_reviews,
        AVG(rating) as overall_average,
        COUNT(CASE WHEN rating = 5 THEN 1 END) as five_star,
        COUNT(CASE WHEN rating = 4 THEN 1 END) as four_star,
        COUNT(CASE WHEN rating = 3 THEN 1 END) as three_star,
        COUNT(CASE WHEN rating = 2 THEN 1 END) as two_star,
        COUNT(CASE WHEN rating = 1 THEN 1 END) as one_star
      FROM staff_reviews
      WHERE is_visible = true
    `;

    const result = await db.pool.query(statsQuery);
    const stats = result.rows[0];

    res.json({
      statistics: {
        total_reviews: parseInt(stats.total_reviews),
        overall_average: parseFloat(stats.overall_average) || 0,
        rating_distribution: {
          5: parseInt(stats.five_star),
          4: parseInt(stats.four_star),
          3: parseInt(stats.three_star),
          2: parseInt(stats.two_star),
          1: parseInt(stats.one_star)
        }
      }
    });

  } catch (error) {
    console.error("Error fetching review statistics:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Helper function to update staff's average rating and total reviews
async function updateStaffRating(staff_profile_id) {
  try {
    const ratingQuery = `
      SELECT 
        AVG(rating) as avg_rating,
        COUNT(*) as total_reviews
      FROM staff_reviews
      WHERE staff_profile_id = $1 AND is_visible = true
    `;

    const result = await db.pool.query(ratingQuery, [staff_profile_id]);
    const ratingData = result.rows[0];

    await db.pool.query(
      'UPDATE staff_profiles SET average_rating = $1, total_reviews = $2 WHERE staff_profile_id = $3',
      [
        parseFloat(ratingData.avg_rating) || 0,
        parseInt(ratingData.total_reviews) || 0,
        staff_profile_id
      ]
    );

  } catch (error) {
    console.error("Error updating staff rating:", error);
    throw error;
  }
}

// Get reviews by client ID
exports.getReviewsByClientId = async (req, res) => {
  const { client_id } = req.params;
  const { page = 1, limit = 10 } = req.query;
  const offset = (page - 1) * limit;

  try {
    const result = await db.pool.query(
      `SELECT sr.*,
              sp.full_name as staff_name,
              b.service_type as booking_service_type,
              b.status as booking_status,
              b.start_date as booking_start_date
       FROM staff_reviews sr
       LEFT JOIN staff_profiles sp ON sr.staff_profile_id = sp.staff_profile_id
       LEFT JOIN bookings b ON sr.booking_id = b.booking_id
       WHERE sr.client_profile_id = $1
       ORDER BY sr.created_at DESC
       LIMIT $2 OFFSET $3`,
      [client_id, limit, offset]
    );

    const countResult = await db.pool.query(
      'SELECT COUNT(*) FROM staff_reviews WHERE client_profile_id = $1',
      [client_id]
    );

    const totalCount = parseInt(countResult.rows[0].count);

    res.json({
      reviews: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalCount,
        pages: Math.ceil(totalCount / limit)
      }
    });

  } catch (error) {
    console.error("Error fetching client reviews:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Shared by the client's own "reviewable bookings" list and the admin
// manual-review picker below — active/completed/terminated bookings for a
// given client that don't already have a review attached.
async function fetchReviewableBookingsForClient(clientId) {
  const result = await db.pool.query(
    `SELECT
       b.booking_id,
       b.service_type,
       b.service_model,
       b.start_date,
       b.status,
       sp.full_name as staff_name,
       sp.staff_profile_id,
       sp.designation
     FROM bookings b
     LEFT JOIN LATERAL (
       SELECT bsa.staff_profile_id
       FROM booking_staff_assignments bsa
       WHERE bsa.booking_id = b.booking_id
       ORDER BY bsa.assigned_on DESC
       LIMIT 1
     ) last_bsa ON true
     LEFT JOIN staff_profiles sp ON COALESCE(b.assigned_staff_id, last_bsa.staff_profile_id) = sp.staff_profile_id
     WHERE b.client_id = $1
       AND b.status IN ('ACTIVE', 'COMPLETED', 'TERMINATED')
       AND NOT EXISTS (
         SELECT 1 FROM staff_reviews sr
         WHERE sr.booking_id = b.booking_id AND sr.client_profile_id = $1
       )
       AND COALESCE(b.assigned_staff_id, last_bsa.staff_profile_id) IS NOT NULL
     ORDER BY b.start_date DESC`,
    [clientId]
  );
  return result.rows;
}

// Get active/completed/terminated bookings this client can still review
exports.getReviewableBookings = async (req, res) => {
  const user_id = req.user?.user_id;
  try {
    const clientRes = await db.pool.query(
      'SELECT client_profile_id FROM client_profiles WHERE user_id = $1',
      [user_id]
    );
    if (clientRes.rows.length === 0) {
      return res.status(404).json({ message: 'Client profile not found' });
    }
    const clientId = clientRes.rows[0].client_profile_id;

    const rows = await fetchReviewableBookingsForClient(clientId);
    res.status(200).json({ status: 'success', data: rows });
  } catch (error) {
    console.error('Error fetching reviewable bookings:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Admin: same reviewable-bookings list, but for an arbitrary client — powers
// the "Add Review" picker on the admin reviews page (phone-call reviews).
exports.getReviewableBookingsForClient = async (req, res) => {
  const { client_id } = req.params;
  try {
    const clientRes = await db.pool.query(
      'SELECT client_profile_id FROM client_profiles WHERE client_profile_id = $1',
      [client_id]
    );
    if (clientRes.rows.length === 0) {
      return res.status(404).json({ message: 'Client profile not found' });
    }

    const rows = await fetchReviewableBookingsForClient(client_id);
    res.status(200).json({ status: 'success', data: rows });
  } catch (error) {
    console.error('Error fetching reviewable bookings for client:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Admin: every booking for a client (most recent first), regardless of status
// or whether it already has a review — the first step of the "Add Review"
// picker, where the admin browses a client's bookings to find the right one.
exports.getClientBookingsForAdmin = async (req, res) => {
  const { client_id } = req.params;
  try {
    const clientRes = await db.pool.query(
      'SELECT client_profile_id FROM client_profiles WHERE client_profile_id = $1',
      [client_id]
    );
    if (clientRes.rows.length === 0) {
      return res.status(404).json({ message: 'Client profile not found' });
    }

    const rows = await db.pool.query(
      `SELECT b.booking_id, b.service_type, b.service_model, b.start_date, b.status
       FROM bookings b
       WHERE b.client_id = $1
       ORDER BY b.start_date DESC NULLS LAST, b.created_at DESC`,
      [client_id]
    );
    res.status(200).json({ status: 'success', data: rows.rows });
  } catch (error) {
    console.error('Error fetching client bookings for admin:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Admin: the staff members who worked a given booking — the second step of
// the "Add Review" picker, after a booking has been chosen.
exports.getBookingStaffForReview = async (req, res) => {
  const { booking_id } = req.params;
  try {
    const bookingRes = await db.pool.query(
      'SELECT booking_id, assigned_staff_id FROM bookings WHERE booking_id = $1',
      [booking_id]
    );
    if (bookingRes.rows.length === 0) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    const assignedRes = await db.pool.query(
      `SELECT sp.staff_profile_id, sp.full_name, sp.designation, MAX(bsa.assigned_on) as last_assigned_on
       FROM booking_staff_assignments bsa
       JOIN staff_profiles sp ON bsa.staff_profile_id = sp.staff_profile_id
       WHERE bsa.booking_id = $1
       GROUP BY sp.staff_profile_id, sp.full_name, sp.designation
       ORDER BY last_assigned_on DESC`,
      [booking_id]
    );

    const staff = assignedRes.rows;
    const assignedStaffId = bookingRes.rows[0].assigned_staff_id;
    if (assignedStaffId && !staff.some(s => s.staff_profile_id === assignedStaffId)) {
      const directRes = await db.pool.query(
        'SELECT staff_profile_id, full_name, designation FROM staff_profiles WHERE staff_profile_id = $1',
        [assignedStaffId]
      );
      if (directRes.rows.length > 0) {
        staff.unshift({ ...directRes.rows[0], last_assigned_on: null });
      }
    }

    res.status(200).json({ status: 'success', data: staff });
  } catch (error) {
    console.error('Error fetching booking staff for review:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Admin: manually log a review on a client's behalf — e.g. after calling the
// client and getting verbal feedback. The admin explicitly picks which staff
// member (of those who worked the booking) the review is for.
exports.adminCreateReview = async (req, res) => {
  const { client_id, booking_id, staff_profile_id, rating, review_text } = req.body;

  if (!client_id || !booking_id || !staff_profile_id || !rating || !review_text) {
    return res.status(400).json({ message: 'Missing required fields: client_id, booking_id, staff_profile_id, rating, review_text' });
  }
  if (rating < 1 || rating > 5) {
    return res.status(400).json({ message: 'Rating must be between 1 and 5' });
  }

  try {
    const bookingRes = await db.pool.query(
      `SELECT booking_id, status, client_id, assigned_staff_id
       FROM bookings
       WHERE booking_id = $1 AND client_id = $2`,
      [booking_id, client_id]
    );
    if (bookingRes.rows.length === 0) {
      return res.status(404).json({ message: 'Booking not found for this client' });
    }
    const booking = bookingRes.rows[0];

    // Confirm the chosen staff member actually worked this booking, so the
    // client-supplied staff_profile_id can't be spoofed.
    const staffWorkedBooking =
      booking.assigned_staff_id === staff_profile_id ||
      (await db.pool.query(
        'SELECT 1 FROM booking_staff_assignments WHERE booking_id = $1 AND staff_profile_id = $2 LIMIT 1',
        [booking_id, staff_profile_id]
      )).rows.length > 0;
    if (!staffWorkedBooking) {
      return res.status(400).json({ message: 'This staff member did not work this booking' });
    }

    const dupCheck = await db.pool.query(
      'SELECT review_id FROM staff_reviews WHERE booking_id = $1 AND client_profile_id = $2 AND staff_profile_id = $3',
      [booking_id, client_id, staff_profile_id]
    );
    if (dupCheck.rows.length > 0) {
      return res.status(409).json({ message: 'This staff member already has a review for this booking' });
    }

    const actorNameResult = await db.pool.query('SELECT full_name FROM staff_profiles WHERE user_id = $1', [req.user.user_id]);
    const actorName = actorNameResult.rows[0]?.full_name || 'Admin';

    const result = await db.pool.query(
      `INSERT INTO staff_reviews (staff_profile_id, client_profile_id, rating, review_text, booking_id, submitted_by_admin, submitted_by_name)
       VALUES ($1, $2, $3, $4, $5, TRUE, $6)
       RETURNING *`,
      [staff_profile_id, client_id, rating, review_text, booking_id, actorName]
    );
    const newReview = result.rows[0];
    await updateStaffRating(staff_profile_id);

    try {
      const actorRole = Array.isArray(req.user.role) ? req.user.role[0] : req.user.role;
      await logActivity({
        actorUserId: req.user.user_id,
        actorName,
        actorRole: typeof actorRole === 'string' ? actorRole.replace(/\{|\}/g, '').split(',')[0].trim() : String(actorRole),
        actionType: 'REVIEW_ADDED_BY_ADMIN',
        entityType: 'STAFF_REVIEW',
        entityId: String(newReview.review_id),
        details: { booking_id, client_id, staff_profile_id, rating },
      });
    } catch (logErr) {
      console.error('Activity log failed (non-fatal):', logErr);
    }

    res.status(201).json({ message: 'Review created successfully', review: newReview });
  } catch (error) {
    console.error('Error creating admin review:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Admin: completed/terminated bookings that have no review yet
exports.getUnreviewedBookings = async (req, res) => {
  const { page = 1, limit = 10, search } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);
  const params = [];
  let paramIdx = 1;

  let searchClause = '';
  if (search && search.trim()) {
    searchClause = ` AND (cp.full_name ILIKE $${paramIdx} OR sp.full_name ILIKE $${paramIdx} OR b.service_type ILIKE $${paramIdx})`;
    params.push(`%${search.trim()}%`);
    paramIdx++;
  }

  const baseFrom = `
    FROM bookings b
    JOIN client_profiles cp ON b.client_id = cp.client_profile_id
    JOIN users u ON cp.user_id = u.user_id
    LEFT JOIN LATERAL (
      SELECT bsa.staff_profile_id
      FROM booking_staff_assignments bsa
      WHERE bsa.booking_id = b.booking_id
      ORDER BY bsa.assigned_on DESC
      LIMIT 1
    ) last_bsa ON true
    LEFT JOIN staff_profiles sp ON COALESCE(b.assigned_staff_id, last_bsa.staff_profile_id) = sp.staff_profile_id
    WHERE b.status IN ('COMPLETED', 'TERMINATED')
      AND NOT EXISTS (
        SELECT 1 FROM staff_reviews sr WHERE sr.booking_id = b.booking_id
      )
    ${searchClause}
  `;

  try {
    const countRes = await db.pool.query(`SELECT COUNT(*) ${baseFrom}`, params);
    const total = parseInt(countRes.rows[0].count);

    const dataRes = await db.pool.query(
      `SELECT
         b.booking_id, b.service_type, b.status, b.start_date, b.end_date,
         cp.full_name as client_name, cp.client_profile_id,
         u.mobile_number as client_mobile,
         sp.full_name as staff_name, sp.staff_profile_id
       ${baseFrom}
       ORDER BY COALESCE(b.end_date, b.start_date) DESC NULLS LAST
       LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      [...params, parseInt(limit), offset]
    );

    res.json({
      bookings: dataRes.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      }
    });
  } catch (err) {
    console.error('Error fetching unreviewed bookings:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Admin: send WhatsApp review request to client for a completed booking
exports.sendReviewRequest = async (req, res) => {
  const { booking_id } = req.body;
  if (!booking_id) return res.status(400).json({ message: 'booking_id is required' });

  try {
    const result = await db.pool.query(
      `SELECT
         b.booking_id, b.service_type, b.status,
         cp.full_name as client_name, cp.client_profile_id,
         u.mobile_number as client_mobile,
         sp.full_name as staff_name
       FROM bookings b
       JOIN client_profiles cp ON b.client_id = cp.client_profile_id
       JOIN users u ON cp.user_id = u.user_id
       LEFT JOIN LATERAL (
         SELECT bsa.staff_profile_id
         FROM booking_staff_assignments bsa
         WHERE bsa.booking_id = b.booking_id
         ORDER BY bsa.assigned_on DESC
         LIMIT 1
       ) last_bsa ON true
       LEFT JOIN staff_profiles sp ON COALESCE(b.assigned_staff_id, last_bsa.staff_profile_id) = sp.staff_profile_id
       WHERE b.booking_id = $1`,
      [booking_id]
    );

    if (result.rows.length === 0) return res.status(404).json({ message: 'Booking not found' });

    const booking = result.rows[0];

    if (!['COMPLETED', 'TERMINATED'].includes(booking.status)) {
      return res.status(400).json({ message: 'Review requests can only be sent for completed or terminated bookings' });
    }

    const dupCheck = await db.pool.query('SELECT review_id FROM staff_reviews WHERE booking_id = $1', [booking_id]);
    if (dupCheck.rows.length > 0) {
      return res.status(409).json({ message: 'This booking already has a review' });
    }

    if (!booking.client_mobile) {
      return res.status(400).json({ message: 'Client has no mobile number on record' });
    }

    await sendReviewRequestWA(
      booking.client_mobile,
      booking.client_name,
      booking.service_type || 'Care',
      booking.staff_name || 'your caregiver'
    );

    // Activity log (non-fatal)
    try {
      const actorRole = Array.isArray(req.user.role) ? req.user.role[0] : req.user.role;
      const actorNameResult = await db.pool.query('SELECT full_name FROM staff_profiles WHERE user_id = $1', [req.user.user_id]);
      const actorName = actorNameResult.rows[0]?.full_name || 'Admin';
      await logActivity({
        actorUserId: req.user.user_id,
        actorName,
        actorRole: typeof actorRole === 'string' ? actorRole.replace(/\{|\}/g, '').split(',')[0].trim() : String(actorRole),
        actionType: 'REVIEW_REQUEST_SENT',
        entityType: 'BOOKING',
        entityId: String(booking_id),
        details: {
          client_name: booking.client_name,
          client_mobile: booking.client_mobile,
          staff_name: booking.staff_name,
          service_type: booking.service_type,
        }
      });
    } catch (logErr) {
      console.error('Activity log failed (sendReviewRequest):', logErr.message);
    }

    res.json({ message: 'Review request sent successfully' });
  } catch (err) {
    console.error('Error sending review request:', err);
    res.status(500).json({ message: 'Failed to send review request' });
  }
};