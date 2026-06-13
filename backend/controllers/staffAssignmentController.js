const db = require('../config/db');
const { sendSms } = require('../utils/sms');
const { sendBookingConfirmed, sendStaffNewAssignment } = require('../utils/metaWhatsapp');

/**
 * STAFF ASSIGNMENT CONTROLLER
 * Handles staff assignment to bookings after payment is recorded
 * Part of 3-step workflow: Record Payment → Convert to Booking → Assign Staff
 */

/**
 * Get assignment form data with payment and booking information
 * @desc    Retrieves quotation, payment info, and available staff for assignment form
 * @access  Private
 * @route   GET /api/bookings/:booking_id/assignment-form
 */
exports.getAssignmentFormData = async (req, res) => {
  try {
    const { booking_id } = req.params;

    // UUID validation
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(booking_id)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid booking ID format'
      });
    }

    // Get booking with quotation details using the real schema:
    // bookings -> service_requests -> quotations
    const bookingQuery = `
      SELECT 
        b.booking_id,
        b.request_id,
        sr.active_quote_id AS quote_id,
        b.status AS booking_status,
        b.start_date,
        b.amount_quotated,
        b.amount_paid,
        q.estimate_number,
        q.daily_rate AS quote_daily_rate,
        q.qty_days,
        sr.client_id,
        q.total_amount,
        COALESCE(c.full_name, sr.payer_name) AS client_name,
        sr.patient_name,
        sr.service_type,
        sr.payer_mobile,
        sr.location_address
      FROM bookings b
      LEFT JOIN service_requests sr ON b.request_id = sr.request_id
      LEFT JOIN quotations q ON sr.active_quote_id = q.quote_id
      LEFT JOIN client_profiles c ON sr.client_id = c.client_profile_id
      WHERE b.booking_id = $1
    `;
    const bookingResult = await db.query(bookingQuery, [booking_id]);

    if (bookingResult.rows.length === 0) {
      return res.status(404).json({
        status: 'error',
        message: 'Booking not found'
      });
    }

    const booking = bookingResult.rows[0];
    const quote_id = booking.quote_id;

    if (!quote_id) {
      return res.status(400).json({
        status: 'error',
        message: 'No quotation is linked to this booking'
      });
    }

    // Get payment summary
    const paymentQuery = `
      SELECT 
        COALESCE(SUM(CASE WHEN status = 'VERIFIED' THEN amount_received ELSE 0 END), 0) as total_verified,
        COUNT(*) as payment_count,
        MAX(payment_date) as last_payment_date
      FROM payment_tracking
      WHERE quote_id = $1
    `;
    const paymentResult = await db.query(paymentQuery, [quote_id]);
    const paymentInfo = paymentResult.rows[0];

    // Get current staff assignments for this booking
    const assignmentsQuery = `
      SELECT 
        bsa.assignment_id,
        bsa.staff_profile_id,
        bsa.daily_rate,
        bsa.service_start_date,
        bsa.service_end_date,
        bsa.amount_allocated,
        bsa.status,
        sp.full_name,
        sp.designation
      FROM booking_staff_assignments bsa
      JOIN staff_profiles sp ON bsa.staff_profile_id = sp.staff_profile_id
      WHERE bsa.booking_id = $1
        AND bsa.status = 'ACTIVE'
      ORDER BY bsa.service_start_date ASC
    `;
    const assignmentsResult = await db.query(assignmentsQuery, [booking_id]);
    const currentAssignments = assignmentsResult.rows;

    // Calculate total allocated
    const totalAllocated = currentAssignments.reduce((sum, a) => sum + parseFloat(a.amount_allocated || 0), 0);
    const remainingBudget = booking.amount_paid - totalAllocated;

    // Get available staff (NURSE, CARETAKER, NANNY) with their profiles
    const staffQuery = `
      SELECT 
        sp.staff_profile_id,
        sp.full_name,
        sp.designation,
        sp.current_status,
        sp.current_earnings,
        sp.average_rating,
        sp.total_reviews
      FROM staff_profiles sp
      JOIN users u ON sp.user_id = u.user_id
      WHERE sp.is_active = true 
        AND sp.current_status = 'AVAILABLE' 
        AND u.role && ARRAY['NURSE'::user_role_enum, 'CARETAKER'::user_role_enum, 'NANNY'::user_role_enum]
      ORDER BY sp.full_name ASC
    `;
    const staffResult = await db.query(staffQuery);
    const availableStaff = staffResult.rows.map(s => ({
      staff_profile_id: s.staff_profile_id,
      staff_name: s.full_name,
      specialization: s.designation,
      current_status: s.current_status,
      current_earnings: parseFloat(s.current_earnings || 0),
      average_rating: s.average_rating !== null ? parseFloat(s.average_rating) : null,
      total_reviews: s.total_reviews !== null ? parseInt(s.total_reviews, 10) : 0
    }));

    return res.status(200).json({
      status: 'success',
      data: {
        booking: {
          booking_id: booking.booking_id,
          booking_status: booking.booking_status,
          start_date: booking.start_date,
          estimate_number: booking.estimate_number,
          client_name: booking.client_name,
          patient_name: booking.patient_name,
          service_type: booking.service_type,
          quote_daily_rate: parseFloat(booking.quote_daily_rate || 0),
          qty_days: parseInt(booking.qty_days || 0, 10),
          amount_quotated: parseFloat(booking.amount_quotated),
          amount_paid: parseFloat(booking.amount_paid),
          total_amount: parseFloat(booking.total_amount)
        },
        payment_info: {
          total_verified: parseFloat(paymentInfo.total_verified),
          payment_count: parseInt(paymentInfo.payment_count),
          last_payment_date: paymentInfo.last_payment_date
        },
        assignment_info: {
          current_assignments: currentAssignments.length,
          total_allocated: parseFloat(totalAllocated),
          remaining_budget: parseFloat(remainingBudget),
          can_add_staff: remainingBudget > 0
        },
        current_assignments: currentAssignments,
        available_staff: availableStaff
      }
    });
  } catch (error) {
    console.error('Error in getAssignmentFormData:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Error retrieving assignment form data',
      error: error.message
    });
  }
};

/**
 * Create a new staff assignment for a booking
 * @desc    Assigns staff to booking, calculates service end date based on payment
 *          NOTE: Staff earnings are NOT updated here. Instead, the daily invoicing cron
 *          (dailyInvoicing.js) runs every day at 23:59 and:
 *          1. Queries booking_staff_assignments where TODAY falls between service_start_date and service_end_date
 *          2. Adds daily_rate to staff_profiles.current_earnings
 *          3. Creates STAFF_SALARY transactions for earnings tracking
 *          This ensures staff only earn money for days they actually work (no early termination issues).
 * @access  Private
 * @route   POST /api/bookings/:booking_id/assign-staff
 * @body    { staff_profile_id, service_start_date, daily_rate (optional), ot_rate (optional), notes (optional) }
 */
exports.assignStaffToBooking = async (req, res) => {
  try {
    const { booking_id } = req.params;
    const { staff_profile_id, service_start_date, daily_rate, ot_rate, notes } = req.body;
    const assigned_by = req.user.user_id;

    // UUID validation
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(booking_id) || !uuidRegex.test(staff_profile_id)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid booking or staff ID format'
      });
    }

    // Required field validation
    if (!staff_profile_id || !service_start_date) {
      return res.status(400).json({
        status: 'error',
        message: 'staff_profile_id and service_start_date are required'
      });
    }

    // Validate service_start_date format
    const startDate = new Date(service_start_date);
    if (isNaN(startDate.getTime())) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid service_start_date format. Use YYYY-MM-DD'
      });
    }

    // Get booking with payment info
    const bookingQuery = `
      SELECT 
        b.booking_id,
        b.request_id,
        sr.active_quote_id AS quote_id,
        b.amount_paid,
        q.total_amount,
        q.daily_rate AS quote_daily_rate,
        b.ot_rate AS booking_ot_rate
      FROM bookings b
      LEFT JOIN service_requests sr ON b.request_id = sr.request_id
      LEFT JOIN quotations q ON sr.active_quote_id = q.quote_id
      WHERE b.booking_id = $1
    `;
    const bookingResult = await db.query(bookingQuery, [booking_id]);

    if (bookingResult.rows.length === 0) {
      return res.status(404).json({
        status: 'error',
        message: 'Booking not found'
      });
    }

    const booking = bookingResult.rows[0];
    if (!booking.quote_id) {
      return res.status(400).json({
        status: 'error',
        message: 'No quotation is linked to this booking'
      });
    }
    const amount_paid = parseFloat(booking.amount_paid);

    // Validate: Must have payment to assign staff
    if (amount_paid <= 0) {
      return res.status(400).json({
        status: 'error',
        message: 'Cannot assign staff without payment. Record payment first.'
      });
    }

    // Get staff profile details
    const staffQuery = `
      SELECT 
        sp.staff_profile_id,
        sp.current_status,
        sp.full_name,
        sp.designation
      FROM staff_profiles sp
      WHERE sp.staff_profile_id = $1 AND sp.current_status = 'AVAILABLE'
    `;
    const staffResult = await db.query(staffQuery, [staff_profile_id]);

    if (staffResult.rows.length === 0) {
      return res.status(404).json({
        status: 'error',
        message: 'Staff member not found or inactive'
      });
    }

    const staff = staffResult.rows[0];
    const staffDailyRate = daily_rate || parseFloat(booking.quote_daily_rate);

    const bookingOtRate = ot_rate !== undefined && ot_rate !== null
      ? parseFloat(ot_rate)
      : parseFloat(booking.booking_ot_rate || 500);

    if (!bookingOtRate || bookingOtRate <= 0) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid ot_rate. It must be greater than 0.'
      });
    }

    if (!staffDailyRate || staffDailyRate <= 0) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid daily rate. Quotation must have a valid daily rate configured.'
      });
    }

    // Get current assignments for this booking
    const currentAssignmentsQuery = `
      SELECT COALESCE(SUM(amount_allocated), 0) as total_allocated
      FROM booking_staff_assignments
      WHERE booking_id = $1 
        AND status = 'ACTIVE'
    `;
    const currentAssignmentsResult = await db.query(currentAssignmentsQuery, [booking_id]);
    const totalAllocated = parseFloat(currentAssignmentsResult.rows[0].total_allocated || 0);

    // Calculate amount to allocate for this assignment
    const amount_allocated = amount_paid - totalAllocated;

    // Validation: Check budget
    if (amount_allocated <= 0) {
      return res.status(400).json({
        status: 'error',
        message: `No budget remaining. Total allocated (${totalAllocated}) already equals amount paid (${amount_paid})`,
        current_allocation: totalAllocated,
        amount_paid: amount_paid
      });
    }

    // Validation: Cannot exceed total quotation amount
    if (totalAllocated + amount_allocated > parseFloat(booking.total_amount)) {
      return res.status(400).json({
        status: 'error',
        message: `Total allocation would exceed quotation amount (${booking.total_amount})`,
        total_allocated: totalAllocated,
        proposed_allocation: amount_allocated,
        quotation_total: parseFloat(booking.total_amount)
      });
    }

    // Calculate service_end_date: service_start_date + (amount_allocated / daily_rate)
    const daysOfService = Math.floor(amount_allocated / staffDailyRate);
    const service_end_date = new Date(startDate);
    service_end_date.setDate(service_end_date.getDate() + daysOfService);

    // Create assignment record
    const insertQuery = `
      INSERT INTO booking_staff_assignments 
        (booking_id, staff_profile_id, assigned_on, assigned_by, daily_rate, 
         service_start_date, service_end_date, amount_allocated, status, notes)
      VALUES 
        ($1, $2, NOW(), $3, $4, $5, $6, $7, 'ACTIVE', $8)
      RETURNING 
        assignment_id, booking_id, staff_profile_id, assigned_on, daily_rate,
        service_start_date, service_end_date, amount_allocated, status
    `;

    const values = [
      booking_id,
      staff_profile_id,
      assigned_by,
      staffDailyRate,
      service_start_date,
      service_end_date.toISOString().split('T')[0],
      amount_allocated,
      notes || null
    ];

    const insertResult = await db.query(insertQuery, values);
    const assignment = insertResult.rows[0];

    await db.query(
      `UPDATE staff_profiles
       SET current_status = 'ASSIGNED'
       WHERE staff_profile_id = $1`,
      [staff_profile_id]
    );

    await db.query(
      `UPDATE bookings
       SET status = 'ACTIVE', ot_rate = $2, assigned_staff_id = $3
       WHERE booking_id = $1`,
      [booking_id, bookingOtRate, staff_profile_id]
    );

    (async () => {
      try {
        const [clientRes, bookingRes, staffMobileRes] = await Promise.all([
          db.query(
            `SELECT cp.full_name, u.mobile_number
             FROM bookings b
             JOIN client_profiles cp ON b.client_id = cp.client_profile_id
             JOIN users u ON cp.user_id = u.user_id
             WHERE b.booking_id = $1`,
            [booking_id]
          ),
          db.query(
            `SELECT
               COALESCE(pp.full_name, sr.patient_name) AS patient_name,
               COALESCE(pp.medical_condition, sr.patient_condition) AS medical_condition,
               sr.location_address
             FROM bookings b
             LEFT JOIN service_requests sr ON b.request_id = sr.request_id
             LEFT JOIN patient_profiles pp ON b.patient_id = pp.patient_id
             WHERE b.booking_id = $1`,
            [booking_id]
          ),
          db.query(
            `SELECT u.mobile_number FROM staff_profiles sp JOIN users u ON sp.user_id = u.user_id WHERE sp.staff_profile_id = $1`,
            [staff_profile_id]
          ),
        ]);

        if (clientRes.rows.length === 0) return;

        const { full_name: clientName, mobile_number: clientMobile } = clientRes.rows[0];
        const { patient_name, medical_condition, location_address } = bookingRes.rows[0] || {};
        const staffMobile = staffMobileRes.rows[0]?.mobile_number;

        const formattedDate = new Date(service_start_date).toLocaleDateString('en-GB', {
          day: 'numeric', month: 'long', year: 'numeric'
        });
        const staffProfileUrl = `https://vcarenursing.com/services/staff-profile/${staff_profile_id}`;
        const conditions = medical_condition || 'Not specified';

        const clientSms = `Hi ${clientName}, your booking has been confirmed!\n\nStaff Member: ${staff.full_name}\nDate: ${formattedDate}\n\nView staff profile: ${staffProfileUrl}\n\nIf you need any changes, please contact us. - VCare Nursing`;
        const staffSms = `Hi ${staff.full_name}, you have been assigned to a new booking.\n\nPatient: ${patient_name || 'N/A'}\nLocation: ${location_address || 'N/A'}\nConditions: ${conditions}\nStart Date: ${formattedDate}\n\nLog in to the staff portal for full details. - VCare Nursing`;

        const results = await Promise.allSettled([
          sendBookingConfirmed(clientMobile, clientName, staff.full_name, formattedDate, '9:00 AM', staffProfileUrl),
          sendSms(clientMobile, clientSms),
          ...(staffMobile ? [
            sendStaffNewAssignment(staffMobile, staff.full_name, patient_name || 'N/A', location_address || 'N/A', conditions, formattedDate),
            sendSms(staffMobile, staffSms),
          ] : []),
        ]);

        results.forEach((r, i) => {
          if (r.status === 'rejected') {
            const label = ['Client WA', 'Client SMS', 'Staff WA', 'Staff SMS'][i];
            console.error(`[BookingConfirmed] ${label} failed:`, r.reason?.message);
          }
        });
      } catch (e) {
        console.error('[BookingConfirmed] Notification error:', e.message);
      }
    })();

    return res.status(201).json({
      status: 'success',
      message: `${staff.full_name} assigned successfully`,
      data: {
        assignment_id: assignment.assignment_id,
        booking_id: assignment.booking_id,
        staff_name: staff.full_name,
        staff_profile_id: assignment.staff_profile_id,
        daily_rate: parseFloat(assignment.daily_rate),
        service_start_date: assignment.service_start_date,
        service_end_date: assignment.service_end_date,
        amount_allocated: parseFloat(assignment.amount_allocated),
        days_allocated: daysOfService,
        ot_rate: bookingOtRate,
        status: assignment.status
      },
      assignment_summary: {
        amount_paid: amount_paid,
        total_allocated: totalAllocated + amount_allocated,
        remaining_budget: parseFloat((booking.total_amount - (totalAllocated + amount_allocated)).toFixed(2))
      }
    });
  } catch (error) {
    console.error('Error in assignStaffToBooking:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Error assigning staff to booking',
      error: error.message
    });
  }
};

/**
 * Get bookings for a specific staff member from assignment records
 * @desc    Returns assignment-centric booking list for worker app screens
 * @access  Private
 * @route   GET /api/assignments/staff/:staff_profile_id/bookings
 */
exports.getStaffAssignmentBookings = async (req, res) => {
  try {
    const { staff_profile_id } = req.params;

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(staff_profile_id)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid staff profile ID format'
      });
    }

    const staffResult = await db.query(
      `SELECT staff_profile_id FROM staff_profiles WHERE staff_profile_id = $1`,
      [staff_profile_id]
    );

    if (staffResult.rows.length === 0) {
      return res.status(404).json({
        status: 'error',
        message: 'Staff profile not found'
      });
    }

    const query = `
      SELECT
        bsa.assignment_id,
        bsa.booking_id,
        bsa.staff_profile_id,
        bsa.daily_rate,
        bsa.service_start_date,
        bsa.service_end_date,
        bsa.amount_allocated,
        bsa.notes as assignment_notes,
        bsa.status as assignment_status,
        b.status as booking_status,
        CASE
          WHEN st.status = 'PENDING' THEN 'PENDING_TERMINATION'
          WHEN st.status = 'APPROVED' THEN 'TERMINATED'
          ELSE b.status
        END as status,
        b.start_date,
        b.scheduled_end_time,
        b.actual_end_time,
        b.service_model,
        COALESCE(b.service_type, sr.service_type) as service_type,
        b.ot_rate,
        cp.full_name as client_name,
        uc.mobile_number as client_mobile,
        COALESCE(pp.full_name, sr.patient_name) as patient_name,
        pp.full_name as patient_full_name,
        pp.age as patient_age,
        pp.gender as patient_gender,
        pp.medical_condition,
        pp.residential_address as patient_address,
        pp.emergency_contact_name,
        pp.emergency_contact_number,
        sr.payer_name,
        sr.payer_mobile,
        sr.location_address,
        sr.gps_coordinates,
        sr.remarks as service_remarks,
        st.status as termination_status,
        st.requested_end_date,
        st.reason as termination_reason,
        GREATEST((bsa.service_end_date - bsa.service_start_date), 0) as duration_days
      FROM booking_staff_assignments bsa
      JOIN bookings b ON bsa.booking_id = b.booking_id
      LEFT JOIN service_requests sr ON b.request_id = sr.request_id
      LEFT JOIN client_profiles cp ON b.client_id = cp.client_profile_id
      LEFT JOIN users uc ON cp.user_id = uc.user_id
      LEFT JOIN patient_profiles pp ON b.patient_id = pp.patient_id
      LEFT JOIN LATERAL (
        SELECT status, requested_end_date, reason
        FROM service_terminations
        WHERE booking_id = b.booking_id
        ORDER BY created_at DESC
        LIMIT 1
      ) st ON true
      WHERE bsa.staff_profile_id = $1
      ORDER BY bsa.assigned_on DESC, bsa.service_start_date DESC
    `;

    const result = await db.query(query, [staff_profile_id]);

    return res.status(200).json({
      status: 'success',
      count: result.rowCount,
      data: result.rows
    });
  } catch (error) {
    console.error('Error in getStaffAssignmentBookings:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Error retrieving staff assignment bookings',
      error: error.message
    });
  }
};

/**
 * Get all staff assignments for a booking
 * @desc    Retrieves assignment history with staff details and status
 * @access  Private
 * @route   GET /api/bookings/:booking_id/assignments
 */
exports.getBookingAssignments = async (req, res) => {
  try {
    const { booking_id } = req.params;

    // UUID validation
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(booking_id)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid booking ID format'
      });
    }

    // Verify booking exists
    const bookingQuery = `SELECT booking_id FROM bookings WHERE booking_id = $1 AND status <> 'TERMINATED'`;
    const bookingResult = await db.query(bookingQuery, [booking_id]);

    if (bookingResult.rows.length === 0) {
      return res.status(404).json({
        status: 'error',
        message: 'Booking not found'
      });
    }

    // Get all assignments for booking
    const assignmentsQuery = `
      SELECT 
        bsa.assignment_id,
        bsa.booking_id,
        bsa.staff_profile_id,
        bsa.assigned_on,
        bsa.assigned_by,
        bsa.daily_rate,
        bsa.service_start_date,
        bsa.service_end_date,
        bsa.amount_allocated,
        bsa.status,
        bsa.notes,
        bsa.updated_at,
        sp.full_name as staff_name,
        sp.designation,
        u.email as assigned_by_email
      FROM booking_staff_assignments bsa
      JOIN staff_profiles sp ON bsa.staff_profile_id = sp.staff_profile_id
      LEFT JOIN users u ON bsa.assigned_by = u.user_id
      WHERE bsa.booking_id = $1
      ORDER BY bsa.service_start_date ASC
    `;

    const assignmentsResult = await db.query(assignmentsQuery, [booking_id]);
    const assignments = assignmentsResult.rows;

    // Calculate summary
    const totalAllocated = assignments.reduce((sum, a) => sum + parseFloat(a.amount_allocated || 0), 0);
    const activeCount = assignments.filter(a => a.status === 'ACTIVE').length;

    return res.status(200).json({
      status: 'success',
      data: {
        assignments: assignments.map(a => ({
          assignment_id: a.assignment_id,
          staff_name: a.staff_name,
          staff_profile_id: a.staff_profile_id,
          specialization: a.designation,
          daily_rate: parseFloat(a.daily_rate),
          service_start_date: a.service_start_date,
          service_end_date: a.service_end_date,
          days_allocated: Math.ceil((new Date(a.service_end_date) - new Date(a.service_start_date)) / (1000 * 60 * 60 * 24)),
          amount_allocated: parseFloat(a.amount_allocated),
          status: a.status,
          assigned_on: a.assigned_on,
          assigned_by_email: a.assigned_by_email,
          notes: a.notes
        })),
        summary: {
          total_assignments: assignments.length,
          active_assignments: activeCount,
          total_allocated: parseFloat(totalAllocated.toFixed(2))
        }
      }
    });
  } catch (error) {
    console.error('Error in getBookingAssignments:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Error retrieving staff assignments',
      error: error.message
    });
  }
};

/**
 * Update staff assignment (admin only)
 * @desc    Update assignment details like dates or rate
 * @access  Private (SUPER_ADMIN, COORDINATOR only)
 * @route   PUT /api/assignments/:assignment_id
 * @body    { service_start_date (optional), service_end_date (optional), daily_rate (optional), notes (optional) }
 */
exports.updateAssignment = async (req, res) => {
  try {
    const { assignment_id } = req.params;
    const { service_start_date, service_end_date, daily_rate, notes } = req.body;

    // UUID validation
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(assignment_id)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid assignment ID format'
      });
    }

    // Require at least one field to update
    if (!service_start_date && !service_end_date && !daily_rate && !notes) {
      return res.status(400).json({
        status: 'error',
        message: 'At least one field is required for update'
      });
    }

    // Get current assignment
    const getQuery = `
      SELECT * FROM booking_staff_assignments 
      WHERE assignment_id = $1 AND status = 'ACTIVE'
    `;
    const getResult = await db.query(getQuery, [assignment_id]);

    if (getResult.rows.length === 0) {
      return res.status(404).json({
        status: 'error',
        message: 'Assignment not found'
      });
    }

    const assignment = getResult.rows[0];

    // Build update query dynamically
    let updateFields = [];
    let updateValues = [];
    let paramCount = 1;

    if (service_start_date) {
      const startDate = new Date(service_start_date);
      if (isNaN(startDate.getTime())) {
        return res.status(400).json({
          status: 'error',
          message: 'Invalid service_start_date format. Use YYYY-MM-DD'
        });
      }
      updateFields.push(`service_start_date = $${paramCount}`);
      updateValues.push(service_start_date);
      paramCount++;
    }

    if (service_end_date) {
      const endDate = new Date(service_end_date);
      if (isNaN(endDate.getTime())) {
        return res.status(400).json({
          status: 'error',
          message: 'Invalid service_end_date format. Use YYYY-MM-DD'
        });
      }
      updateFields.push(`service_end_date = $${paramCount}`);
      updateValues.push(service_end_date);
      paramCount++;
    }

    if (daily_rate) {
      if (daily_rate <= 0) {
        return res.status(400).json({
          status: 'error',
          message: 'Daily rate must be greater than 0'
        });
      }
      updateFields.push(`daily_rate = $${paramCount}`);
      updateValues.push(daily_rate);
      paramCount++;
    }

    if (notes) {
      updateFields.push(`notes = $${paramCount}`);
      updateValues.push(notes);
      paramCount++;
    }

    updateFields.push(`updated_at = NOW()`);

    // Add assignment_id as last parameter
    updateValues.push(assignment_id);

    const updateQuery = `
      UPDATE booking_staff_assignments 
      SET ${updateFields.join(', ')}
      WHERE assignment_id = $${paramCount}
      RETURNING *
    `;

    const updateResult = await db.query(updateQuery, updateValues);
    const updatedAssignment = updateResult.rows[0];

    return res.status(200).json({
      status: 'success',
      message: 'Assignment updated successfully',
      data: {
        assignment_id: updatedAssignment.assignment_id,
        service_start_date: updatedAssignment.service_start_date,
        service_end_date: updatedAssignment.service_end_date,
        daily_rate: parseFloat(updatedAssignment.daily_rate),
        amount_allocated: parseFloat(updatedAssignment.amount_allocated),
        status: updatedAssignment.status
      }
    });
  } catch (error) {
    console.error('Error in updateAssignment:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Error updating assignment',
      error: error.message
    });
  }
};

/**
 * Deactivate/Complete staff assignment
 * @desc    Marks assignment as COMPLETED and soft deletes
 * @access  Private (SUPER_ADMIN, COORDINATOR only)
 * @route   DELETE /api/assignments/:assignment_id
 */
exports.completeAssignment = async (req, res) => {
  try {
    const { assignment_id } = req.params;

    // UUID validation
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(assignment_id)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid assignment ID format'
      });
    }

    // Get assignment
    const getQuery = `
      SELECT bsa.*, sp.full_name as staff_name, sp.designation
      FROM booking_staff_assignments bsa
      JOIN staff_profiles sp ON bsa.staff_profile_id = sp.staff_profile_id
      WHERE bsa.assignment_id = $1 AND bsa.status = 'ACTIVE'
    `;
    const getResult = await db.query(getQuery, [assignment_id]);

    if (getResult.rows.length === 0) {
      return res.status(404).json({
        status: 'error',
        message: 'Assignment not found or already completed'
      });
    }

    const assignment = getResult.rows[0];

    // Update to COMPLETED status and soft delete
    const updateQuery = `
      UPDATE booking_staff_assignments 
      SET status = 'COMPLETED', updated_at = NOW()
      WHERE assignment_id = $1
      RETURNING *
    `;

    const updateResult = await db.query(updateQuery, [assignment_id]);
    const completedAssignment = updateResult.rows[0];

    return res.status(200).json({
      status: 'success',
      message: `Assignment for ${assignment.staff_name} marked as completed`,
      data: {
        assignment_id: completedAssignment.assignment_id,
        staff_name: assignment.staff_name,
        designation: assignment.designation,
        status: completedAssignment.status,
        completed_at: completedAssignment.updated_at
      }
    });
  } catch (error) {
    console.error('Error in completeAssignment:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Error completing assignment',
      error: error.message
    });
  }
};

module.exports = exports;
