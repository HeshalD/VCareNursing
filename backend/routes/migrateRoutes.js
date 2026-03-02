const express = require('express');
const migrate = require('../migrate');
const router = express.Router();

// Run database migration
router.post('/run', async (req, res) => {
  try {
    console.log('Starting database migration via API...');
    await migrate();
    console.log('Database migration completed successfully');
    res.json({ 
      success: true, 
      message: 'Database migration completed successfully' 
    });
  } catch (error) {
    console.error('Database migration failed:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Database migration failed', 
      error: error.message 
    });
  }
});

// Check migration status
router.get('/status', (req, res) => {
  res.json({ 
    message: 'Migration endpoint is available',
    instructions: 'POST /api/migrate/run to run migration'
  });
});

module.exports = router;
