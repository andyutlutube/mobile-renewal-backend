require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const { Pool } = require('pg');
const { checkAndSendReminders } = require('./emailService');

const app = express();
const PORT = process.env.PORT || 3000;

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Middleware
app.use(cors());
app.use(express.json());

// Initialize database table
async function initDB() {
  const createTableQuery = `
    CREATE TABLE IF NOT EXISTS plans (
      id SERIAL PRIMARY KEY,
      user_email VARCHAR(255) NOT NULL,
      provider VARCHAR(255) NOT NULL,
      phone_number VARCHAR(50) NOT NULL,
      plan_name VARCHAR(255) NOT NULL,
      renewal_date DATE NOT NULL,
      cost DECIMAL(10, 2) NOT NULL,
      reminder_days INTEGER DEFAULT 7,
      is_promotion BOOLEAN DEFAULT false,
      promotion_details TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      last_reminder_sent DATE
    );
  `;
  
  try {
    await pool.query(createTableQuery);
    console.log('✅ Database initialized');
  } catch (err) {
    console.error('❌ Error initializing database:', err);
  }
}

initDB();

// API Routes

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'Mobile Renewal Tracker API' });
});

// Get all plans for a user
app.get('/api/plans', async (req, res) => {
  const { email } = req.query;
  
  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }
  
  try {
    const result = await pool.query(
      'SELECT * FROM plans WHERE user_email = $1 ORDER BY renewal_date ASC',
      [email]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching plans:', err);
    res.status(500).json({ error: 'Failed to fetch plans' });
  }
});

// Add a new plan
app.post('/api/plans', async (req, res) => {
  const {
    userEmail,
    provider,
    phoneNumber,
    planName,
    renewalDate,
    cost,
    reminderDays = 7,
    isPromotion = false,
    promotionDetails = ''
  } = req.body;
  
  if (!userEmail || !provider || !phoneNumber || !planName || !renewalDate || !cost) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  
  try {
    const result = await pool.query(
      `INSERT INTO plans (user_email, provider, phone_number, plan_name, renewal_date, cost, reminder_days, is_promotion, promotion_details)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [userEmail, provider, phoneNumber, planName, renewalDate, cost, reminderDays, isPromotion, promotionDetails]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error adding plan:', err);
    res.status(500).json({ error: 'Failed to add plan' });
  }
});

// Update a plan
app.put('/api/plans/:id', async (req, res) => {
  const { id } = req.params;
  const {
    provider,
    phoneNumber,
    planName,
    renewalDate,
    cost,
    reminderDays,
    isPromotion,
    promotionDetails
  } = req.body;
  
  try {
    const result = await pool.query(
      `UPDATE plans SET 
        provider = $1, 
        phone_number = $2, 
        plan_name = $3, 
        renewal_date = $4, 
        cost = $5, 
        reminder_days = $6,
        is_promotion = $7,
        promotion_details = $8
       WHERE id = $9 RETURNING *`,
      [provider, phoneNumber, planName, renewalDate, cost, reminderDays, isPromotion, promotionDetails, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Plan not found' });
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating plan:', err);
    res.status(500).json({ error: 'Failed to update plan' });
  }
});

// Delete a plan
app.delete('/api/plans/:id', async (req, res) => {
  const { id } = req.params;
  
  try {
    const result = await pool.query('DELETE FROM plans WHERE id = $1 RETURNING *', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Plan not found' });
    }
    
    res.json({ message: 'Plan deleted successfully' });
  } catch (err) {
    console.error('Error deleting plan:', err);
    res.status(500).json({ error: 'Failed to delete plan' });
  }
});

// Manual trigger for testing email reminders
app.post('/api/check-reminders', async (req, res) => {
  try {
    await checkAndSendReminders(pool);
    res.json({ message: 'Reminder check completed' });
  } catch (err) {
    console.error('Error checking reminders:', err);
    res.status(500).json({ error: 'Failed to check reminders' });
  }
});

// Schedule daily reminder checks at 9 AM
cron.schedule('0 9 * * *', async () => {
  console.log('🔔 Running scheduled reminder check...');
  await checkAndSendReminders(pool);
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📧 Email reminders scheduled for 9 AM daily`);
});