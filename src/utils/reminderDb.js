const pool = require('./pgClient');
const logger = require('./logger');

async function saveReminder(reminderData) {
  const query = `
    INSERT INTO reminders (
      reminder_id, user_id, user_tag, channel_id, guild_id, 
      message, expires_at, metadata
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING *
  `;

  const values = [
    reminderData.reminder_id,
    reminderData.user_id,
    reminderData.user_tag,
    reminderData.channel_id,
    reminderData.guild_id,
    reminderData.message,
    reminderData.expires_at,
    reminderData.metadata || {},
  ];

  try {
    const result = await pool.query(query, values);
    return result.rows[0];
  } catch (error) {
    logger.error('Error saving reminder to database:', error);
    throw error;
  }
}

async function completeReminder(reminderId) {
  const query = `
    UPDATE reminders
    SET is_completed = TRUE, completed_at = CURRENT_TIMESTAMP
    WHERE reminder_id = $1
    RETURNING *
  `;

  try {
    const result = await pool.query(query, [reminderId]);
    return result.rows[0];
  } catch (error) {
    logger.error('Error completing reminder:', error);
    throw error;
  }
}

async function getActiveReminders() {
  const query = `
    SELECT * FROM reminders
    WHERE is_completed = FALSE
    AND expires_at > CURRENT_TIMESTAMP
    ORDER BY expires_at ASC
  `;

  try {
    const result = await pool.query(query);
    return result.rows;
  } catch (error) {
    logger.error('Error fetching active reminders:', error);
    throw error;
  }
}

async function getReminder(reminderId) {
  const query = 'SELECT * FROM reminders WHERE reminder_id = $1';

  try {
    const result = await pool.query(query, [reminderId]);
    return result.rows[0] || null;
  } catch (error) {
    logger.error('Error fetching reminder:', error);
    throw error;
  }
}

async function getUserReminders(userId) {
  const query = `
    SELECT * FROM reminders
    WHERE user_id = $1
    ORDER BY created_at DESC
    LIMIT 50
  `;

  try {
    const result = await pool.query(query, [userId]);
    return result.rows;
  } catch (error) {
    logger.error('Error fetching user reminders:', error);
    throw error;
  }
}

async function cleanupReminders(days = 30) {
  const query = `
    DELETE FROM reminders
    WHERE is_completed = TRUE
    AND completed_at < CURRENT_TIMESTAMP - ($1 * INTERVAL '1 day')
    RETURNING *
  `;

  try {
    const result = await pool.query(query, [days]);
    return result.rowCount;
  } catch (error) {
    logger.error('Error cleaning up old reminders:', error);
    throw error;
  }
}

module.exports = {
  saveReminder,
  completeReminder,
  getActiveReminders,
  getReminder,
  getUserReminders,
  cleanupReminders,
};
