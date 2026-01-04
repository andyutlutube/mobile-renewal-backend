const nodemailer = require('nodemailer');

// Create email transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD
  }
});

// Format date nicely
function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });
}

// Calculate days until renewal
function getDaysUntilRenewal(renewalDate) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const renewal = new Date(renewalDate);
  renewal.setHours(0, 0, 0, 0);
  const diffTime = renewal - today;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
}

// Send reminder email
async function sendReminderEmail(plan) {
  const daysUntil = getDaysUntilRenewal(plan.renewal_date);
  
  const subject = `📱 Reminder: ${plan.provider} Mobile Plan Renews in ${daysUntil} ${daysUntil === 1 ? 'Day' : 'Days'}`;
  
  const promotionInfo = plan.is_promotion ? 
    `\n⚠️ PROMOTION: ${plan.promotion_details}\n(Check if this promotional rate continues after renewal)` : '';
  
  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb; border-radius: 10px;">
      <h2 style="color: #2563eb; border-bottom: 3px solid #2563eb; padding-bottom: 10px;">
        📱 Mobile Plan Renewal Reminder
      </h2>
      
      <div style="background-color: white; padding: 20px; border-radius: 8px; margin: 20px 0; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
        <p style="font-size: 18px; color: #dc2626; font-weight: bold; margin-bottom: 15px;">
          ⏰ Your mobile plan renews in <strong>${daysUntil} ${daysUntil === 1 ? 'day' : 'days'}</strong>!
        </p>
        
        <div style="background-color: #f3f4f6; padding: 15px; border-radius: 6px; margin: 15px 0;">
          <h3 style="margin-top: 0; color: #1f2937;">Plan Details:</h3>
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #4b5563;">Provider:</td>
              <td style="padding: 8px 0; color: #1f2937;">${plan.provider}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #4b5563;">Phone Number:</td>
              <td style="padding: 8px 0; color: #1f2937;">${plan.phone_number}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #4b5563;">Plan Name:</td>
              <td style="padding: 8px 0; color: #1f2937;">${plan.plan_name}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #4b5563;">Renewal Date:</td>
              <td style="padding: 8px 0; color: #1f2937;">${formatDate(plan.renewal_date)}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #4b5563;">Monthly Cost:</td>
              <td style="padding: 8px 0; color: #1f2937; font-size: 18px;">$${plan.cost}</td>
            </tr>
          </table>
        </div>
        
        ${plan.is_promotion ? `
          <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; border-radius: 4px; margin: 15px 0;">
            <p style="margin: 0; color: #92400e;">
              <strong>🎉 Promotional Pricing:</strong><br>
              ${plan.promotion_details}
              <br><br>
              <em>Remember to check if this rate continues or if pricing changes after renewal!</em>
            </p>
          </div>
        ` : ''}
        
        <div style="background-color: #dbeafe; padding: 15px; border-radius: 6px; margin-top: 20px;">
          <h4 style="margin-top: 0; color: #1e40af;">💡 Action Items:</h4>
          <ul style="color: #1e3a8a; margin: 10px 0; padding-left: 20px;">
            <li>Review your current usage and plan suitability</li>
            <li>Compare with competitor offers</li>
            <li>Check for any new promotions from ${plan.provider}</li>
            <li>Ensure payment method is up to date</li>
            ${plan.is_promotion ? '<li><strong>Verify post-promotion pricing</strong></li>' : ''}
          </ul>
        </div>
      </div>
      
      <p style="color: #6b7280; font-size: 12px; text-align: center; margin-top: 20px;">
        This is an automated reminder from your Mobile Renewal Tracker.<br>
        To stop receiving these reminders, remove this plan from your tracker.
      </p>
    </div>
  `;
  
  const mailOptions = {
    from: `"Mobile Renewal Tracker" <${process.env.EMAIL_USER}>`,
    to: plan.user_email,
    subject: subject,
    html: htmlContent
  };
  
  try {
    await transporter.sendMail(mailOptions);
    console.log(`✅ Reminder sent to ${plan.user_email} for ${plan.provider} plan`);
    return true;
  } catch (error) {
    console.error(`❌ Failed to send email to ${plan.user_email}:`, error);
    return false;
  }
}

// Check all plans and send reminders
async function checkAndSendReminders(pool) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  try {
    // Get all plans that need reminders
    const query = `
      SELECT * FROM plans 
      WHERE (last_reminder_sent IS NULL OR last_reminder_sent < CURRENT_DATE)
    `;
    
    const result = await pool.query(query);
    let sentCount = 0;
    
    for (const plan of result.rows) {
      const daysUntil = getDaysUntilRenewal(plan.renewal_date);
      
      // Send reminder if within reminder window and not sent today
      if (daysUntil <= plan.reminder_days && daysUntil >= 0) {
        const sent = await sendReminderEmail(plan);
        
        if (sent) {
          // Update last reminder sent date
          await pool.query(
            'UPDATE plans SET last_reminder_sent = CURRENT_DATE WHERE id = $1',
            [plan.id]
          );
          sentCount++;
        }
      }
    }
    
    console.log(`📧 Sent ${sentCount} reminder email(s)`);
    return sentCount;
  } catch (error) {
    console.error('Error checking and sending reminders:', error);
    throw error;
  }
}

module.exports = { sendReminderEmail, checkAndSendReminders };
