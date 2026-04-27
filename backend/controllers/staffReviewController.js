const db = require('../config/db');

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
  const { staff_profile_id, rating, review_text } = req.body;
  const user_id = req.user?.user_id; // Get user_id from authenticated user

  try {
    // Fetch client_profile_id from database
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

    // Validation
    if (!staff_profile_id || !rating || !review_text) {
      return res.status(400).json({ 
        message: "Missing required fields: staff_profile_id, rating, review_text" 
      });
    }

    if (rating < 1 || rating > 5) {
      return res.status(400).json({ 
        message: "Rating must be between 1 and 5" 
      });
    }

    // Check if staff exists
    const staffCheck = await db.pool.query(
      'SELECT staff_profile_id FROM staff_profiles WHERE staff_profile_id = $1',
      [staff_profile_id]
    );

    if (staffCheck.rows.length === 0) {
      return res.status(404).json({ message: "Staff profile not found" });
    }

    // Check if the client is also a staff member trying to review their own profile
    const associatedStaff = await getStaffProfileByClientProfileId(client_profile_id);
    if (associatedStaff && associatedStaff.staff_profile_id === parseInt(staff_profile_id)) {
      return res.status(403).json({ 
        message: "You cannot review your own staff profile" 
      });
    }

    // Create the review
    const result = await db.pool.query(
      `INSERT INTO staff_reviews (staff_profile_id, client_profile_id, rating, review_text)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [staff_profile_id, client_profile_id, rating, review_text]
    );

    const newReview = result.rows[0];

    // Update staff's average rating and total reviews
    await updateStaffRating(staff_profile_id);

    res.status(201).json({
      message: "Review created successfully",
      review: newReview
    });

  } catch (error) {
    console.error("Error creating review:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Get all reviews (with pagination and filtering)
exports.getAllReviews = async (req, res) => {
  const { page = 1, limit = 10, is_visible, min_rating, max_rating, staff_profile_id } = req.query;
  const offset = (page - 1) * limit;

  try {
    let query = `
      SELECT sr.*, sp.full_name as staff_name, cp.full_name as client_name
      FROM staff_reviews sr
      LEFT JOIN staff_profiles sp ON sr.staff_profile_id = sp.staff_profile_id
      LEFT JOIN client_profiles cp ON sr.client_profile_id = cp.client_profile_id
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

    query += ` ORDER BY sr.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    queryParams.push(limit, offset);

    const result = await db.pool.query(query, queryParams);

    // Get total count for pagination
    let countQuery = 'SELECT COUNT(*) FROM staff_reviews WHERE 1=1';
    const countParams = [];
    let countIndex = 1;

    if (is_visible !== undefined) {
      countQuery += ` AND is_visible = $${countIndex}`;
      countParams.push(is_visible === 'true');
      countIndex++;
    }

    if (min_rating) {
      countQuery += ` AND rating >= $${countIndex}`;
      countParams.push(min_rating);
      countIndex++;
    }

    if (max_rating) {
      countQuery += ` AND rating <= $${countIndex}`;
      countParams.push(max_rating);
      countIndex++;
    }

    if (staff_profile_id) {
      countQuery += ` AND staff_profile_id = $${countIndex}`;
      countParams.push(staff_profile_id);
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
      `SELECT sr.*, sp.full_name as staff_name
       FROM staff_reviews sr
       LEFT JOIN staff_profiles sp ON sr.staff_profile_id = sp.staff_profile_id
       WHERE sr.client_profile_id = $1
       ORDER BY sr.created_at DESC
       LIMIT $2 OFFSET $3`,
      [client_id, limit, offset]
    );

    // Get total count
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