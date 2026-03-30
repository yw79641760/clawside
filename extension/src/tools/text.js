// ClawSide - Text Utilities
// Truncates text to a maximum length, appending an ellipsis if truncated.

function truncate(str, max) {
  if (!str) return '';
  return str.length > max ? str.slice(0, max) + '\u2026' : str;
}

window.truncate = truncate;
