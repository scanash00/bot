function validateCommandOptions(interaction, requiredOptions = []) {
  for (const option of requiredOptions) {
    const value = interaction.options.getString(option);
    if (!value || value.trim() === '') {
      return {
        isValid: false,
        message: `Missing required option: ${option}`,
      };
    }
  }
  return { isValid: true };
}

function sanitizeInput(input) {
  if (!input) return '';
  return input.replace(/[<>"']/g, '').substring(0, 1000);
}

function isValidUrl(url) {
  try {
    new URL(url);
    return true;
  } catch (e) {
    return false;
  }
}

function validateTimeString(timeStr) {
  if (typeof timeStr !== 'string') return false;

  const timeRegex = /^(\d+h)?(\d+m)?$|^(\d+m)?(\d+h)?$/i;
  return timeRegex.test(timeStr);
}

function parseTimeString(timeStr) {
  if (!validateTimeString(timeStr)) return null;

  let minutes = 0;
  const hoursMatch = timeStr.match(/(\d+)h/i);
  const minsMatch = timeStr.match(/(\d+)m/i);

  if (hoursMatch) minutes += parseInt(hoursMatch[1], 10) * 60;
  if (minsMatch) minutes += parseInt(minsMatch[1], 10);

  return minutes > 0 ? minutes : null;
}

function formatTimeString(minutes) {
  if (!minutes || minutes < 0) return '0m';

  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;

  const parts = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (mins > 0 || hours === 0) parts.push(`${mins}m`);

  return parts.join(' ');
}

module.exports = {
  validateCommandOptions,
  validateTimeString,
  parseTimeString,
  formatTimeString,
  sanitizeInput,
  isValidUrl,
};
