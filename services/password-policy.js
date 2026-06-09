// Shared password-complexity policy used by all server-side password-change routes.
// Update this one file to adjust the rules across the whole application.
const PASSWORD_REGEX = /^(?=.*[A-Z])(?=.*\d).{8,}$/;

const PASSWORD_HINT = 'Minimum 8 characters, at least one uppercase letter and one digit.';

function validatePassword(password) {
  if (!password || !PASSWORD_REGEX.test(password)) {
    return { valid: false, error: PASSWORD_HINT };
  }
  return { valid: true, error: null };
}

module.exports = { validatePassword, PASSWORD_HINT };
