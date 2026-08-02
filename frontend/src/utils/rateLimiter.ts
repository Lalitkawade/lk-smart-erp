/**
 * Client-side rate limiting utility to prevent rapid brute force submission
 * of authentication forms or sensitive actions.
 */

interface RateLimiterOptions {
  maxAttempts: number; // Maximum allowed attempts in window
  windowMs: number;    // Time window in milliseconds
}

class RateLimiter {
  private attempts: Map<string, number[]> = new Map();

  /**
   * Check if action for a specific key (e.g. email or action name) is rate limited.
   * Returns true if allowed, false if rate limited.
   */
  isAllowed(key: string, options: RateLimiterOptions = { maxAttempts: 5, windowMs: 60000 }): boolean {
    const now = Date.now();
    const timestamps = (this.attempts.get(key) || []).filter(
      (ts) => now - ts < options.windowMs
    );

    if (timestamps.length >= options.maxAttempts) {
      return false;
    }

    timestamps.push(now);
    this.attempts.set(key, timestamps);
    return true;
  }

  /**
   * Reset rate limit state for a key upon successful action (e.g. successful login).
   */
  reset(key: string): void {
    this.attempts.delete(key);
  }
}

export const authRateLimiter = new RateLimiter();
