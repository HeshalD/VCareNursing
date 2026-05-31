const db = require('../config/db');

// --- STAFF CRUD ---

exports.getAllStaff = async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM internal_staff ORDER BY created_at DESC');
    res.status(200).json({ status: 'success', data: result.rows });
  } catch (error) {
    console.error("Error getting internal staff:", error);
    res.status(500).json({ message: "Failed to fetch internal staff." });
  }
};

exports.createStaff = async (req, res) => {
  const { full_name, role, email, phone, address, base_salary, joined_date, status } = req.body;
  
  // Convert empty string to null to avoid UNIQUE constraint violation
  const processedEmail = email && email.trim() !== '' ? email : null;
  
  try {
    const result = await db.query(
      `INSERT INTO internal_staff (full_name, role, email, phone, address, base_salary, joined_date, status) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [full_name, role, processedEmail, phone, address, base_salary || 0, joined_date || new Date(), status || 'Active']
    );
    res.status(201).json({ status: 'success', data: result.rows[0] });
  } catch (error) {
    console.error("Error creating internal staff:", error);
    if (error.code === '23505') { // Unique violation
      return res.status(400).json({ message: "Email already exists." });
    }
    res.status(500).json({ message: "Failed to create internal staff." });
  }
};

exports.updateStaff = async (req, res) => {
  const { id } = req.params;
  const { full_name, role, email, phone, address, base_salary, status } = req.body;
  
  // Convert empty string to null to avoid UNIQUE constraint violation
  const processedEmail = email && email.trim() !== '' ? email : null;
  
  try {
    const result = await db.query(
      `UPDATE internal_staff 
       SET full_name = $1, role = $2, email = $3, phone = $4, address = $5, base_salary = $6, status = $7, updated_at = CURRENT_TIMESTAMP
       WHERE id = $8 RETURNING *`,
      [full_name, role, processedEmail, phone, address, base_salary, status, id]
    );
    
    if (result.rows.length === 0) return res.status(404).json({ message: "Staff not found" });
    res.status(200).json({ status: 'success', data: result.rows[0] });
  } catch (error) {
    console.error("Error updating internal staff:", error);
    res.status(500).json({ message: "Failed to update internal staff." });
  }
};

exports.deleteStaff = async (req, res) => {
  const { id } = req.params;
  try {
    const result = await db.query('DELETE FROM internal_staff WHERE id = $1 RETURNING id', [id]);
    if (result.rows.length === 0) return res.status(404).json({ message: "Staff not found" });
    res.status(200).json({ status: 'success', message: "Staff deleted successfully." });
  } catch (error) {
    console.error("Error deleting internal staff:", error);
    res.status(500).json({ message: "Failed to delete internal staff." });
  }
};

// --- TASK MANAGEMENT ---

exports.getStaffTasks = async (req, res) => {
  const { id } = req.params; // Staff ID
  try {
    const result = await db.query('SELECT * FROM internal_staff_tasks WHERE staff_id = $1 ORDER BY created_at DESC', [id]);
    res.status(200).json({ status: 'success', data: result.rows });
  } catch (error) {
    console.error("Error fetching tasks:", error);
    res.status(500).json({ message: "Failed to fetch tasks." });
  }
};

exports.assignTask = async (req, res) => {
  const { staff_id, task_type, description, assigned_date } = req.body;
  try {
    const result = await db.query(
      `INSERT INTO internal_staff_tasks (staff_id, task_type, description, assigned_date) 
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [staff_id, task_type, description, assigned_date || new Date()]
    );
    res.status(201).json({ status: 'success', data: result.rows[0] });
  } catch (error) {
    console.error("Error assigning task:", error);
    res.status(500).json({ message: "Failed to assign task." });
  }
};

exports.updateTaskStatus = async (req, res) => {
  const { taskId } = req.params;
  const { status } = req.body;
  try {
    const completedDate = status === 'Completed' ? new Date() : null;
    const result = await db.query(
      `UPDATE internal_staff_tasks 
       SET status = $1, completed_date = $2 
       WHERE id = $3 RETURNING *`,
      [status, completedDate, taskId]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: "Task not found" });
    res.status(200).json({ status: 'success', data: result.rows[0] });
  } catch (error) {
    console.error("Error updating task status:", error);
    res.status(500).json({ message: "Failed to update task status." });
  }
};

exports.deleteTask = async (req, res) => {
  const { taskId } = req.params;
  try {
    const result = await db.query('DELETE FROM internal_staff_tasks WHERE id = $1 RETURNING id', [taskId]);
    if (result.rows.length === 0) return res.status(404).json({ message: "Task not found" });
    res.status(200).json({ status: 'success', message: "Task deleted successfully." });
  } catch (error) {
    console.error("Error deleting task:", error);
    res.status(500).json({ message: "Failed to delete task." });
  }
};

// --- PAYROLL MANAGEMENT ---

exports.getAllPayroll = async (req, res) => {
  try {
    const result = await db.query(`
      SELECT p.*, s.full_name, s.role 
      FROM internal_staff_payroll p
      JOIN internal_staff s ON p.staff_id = s.id
      ORDER BY p.created_at DESC
    `);
    res.status(200).json({ status: 'success', data: result.rows });
  } catch (error) {
    console.error("Error fetching all payroll:", error);
    res.status(500).json({ message: "Failed to fetch all payroll records." });
  }
};
exports.getStaffPayroll = async (req, res) => {
  const { id } = req.params; // Staff ID
  try {
    const result = await db.query('SELECT * FROM internal_staff_payroll WHERE staff_id = $1 ORDER BY created_at DESC', [id]);
    res.status(200).json({ status: 'success', data: result.rows });
  } catch (error) {
    console.error("Error fetching payroll:", error);
    res.status(500).json({ message: "Failed to fetch payroll records." });
  }
};

exports.addPayrollRecord = async (req, res) => {
  const { staff_id, amount, payment_month, status, notes } = req.body;
  try {
    const paidOn = status === 'Paid' ? new Date() : null;
    const result = await db.query(
      `INSERT INTO internal_staff_payroll (staff_id, amount, payment_month, status, paid_on, notes) 
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [staff_id, amount, payment_month, status || 'Pending', paidOn, notes]
    );
    res.status(201).json({ status: 'success', data: result.rows[0] });
  } catch (error) {
    console.error("Error adding payroll record:", error);
    res.status(500).json({ message: "Failed to add payroll record." });
  }
};

exports.updatePayrollStatus = async (req, res) => {
  const { payrollId } = req.params;
  const { status, notes } = req.body;
  try {
    const paidOn = status === 'Paid' ? new Date() : null;
    const result = await db.query(
      `UPDATE internal_staff_payroll 
       SET status = $1, paid_on = $2, notes = COALESCE($3, notes)
       WHERE id = $4 RETURNING *`,
      [status, paidOn, notes, payrollId]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: "Payroll record not found" });
    res.status(200).json({ status: 'success', data: result.rows[0] });
  } catch (error) {
    console.error("Error updating payroll status:", error);
    res.status(500).json({ message: "Failed to update payroll status." });
  }
};
