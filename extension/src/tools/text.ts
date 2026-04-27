/**
 * ClawSide - Text Utilities
 * Truncates text to a maximum length, appending an ellipsis if truncated.
 */

/**
 * Truncates a string to a maximum length
 * @param str - The string to truncate
 * @param max - Maximum length
 * @returns The truncated string with ellipsis if needed, or empty string if input is falsy
 */
export function truncate(str: string | null | undefined, max: number): string {
  if (!str) return '';
  return str.length > max ? str.slice(0, max) + '\u2026' : str;
}

// Export for global usage (compatibility)
window.truncate = truncate;
