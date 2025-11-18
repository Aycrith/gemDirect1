/**
 * Rate Limiter Service
 * 
 * Implements token bucket rate limiting with support for multiple
 * time windows (per-minute, per-hour) and burst limits.
 */

export interface RateLimitConfig {
    requestsPerMinute: number;
    requestsPerHour: number;
    burstLimit: number;
}

export interface RateLimitStatus {
    allowed: boolean;
    remaining: number;
    resetIn: number;
    message: string;
}

export interface RateLimitState {
    tokensMinute: number;
    tokensHour: number;
    lastRefillMinute: number;
    lastRefillHour: number;
}

const DEFAULT_CONFIG: RateLimitConfig = {
    requestsPerMinute: 60,
    requestsPerHour: 600,
    burstLimit: 5
};

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

/**
 * Rate limiter using token bucket algorithm
 */
class RateLimiter {
    private config: RateLimitConfig;
    private state: RateLimitState;
    private identifier: string;
    private lastBurstCheck: number = 0;
    private burstCounter: number = 0;

    constructor(config: Partial<RateLimitConfig> = {}, identifier: string = 'default') {
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.identifier = identifier;
        
        // Validate config
        if (this.config.requestsPerMinute < 1) {
            throw new Error('requestsPerMinute must be at least 1');
        }
        if (this.config.requestsPerHour < 1) {
            throw new Error('requestsPerHour must be at least 1');
        }
        if (this.config.burstLimit < 1) {
            throw new Error('burstLimit must be at least 1');
        }

        this.state = {
            tokensMinute: this.config.requestsPerMinute,
            tokensHour: this.config.requestsPerHour,
            lastRefillMinute: Date.now(),
            lastRefillHour: Date.now()
        };
    }

    /**
     * Check if request is allowed and consume tokens
     */
    checkLimit(): RateLimitStatus {
        const now = Date.now();

        // Refill tokens based on time elapsed
        this.refillTokens(now);

        // Check if we have tokens available
        if (this.state.tokensMinute < 1) {
            const resetIn = this.state.lastRefillMinute + MINUTE_MS - now;
            return {
                allowed: false,
                remaining: 0,
                resetIn,
                message: `Rate limit exceeded (per minute). Reset in ${resetIn}ms`
            };
        }

        if (this.state.tokensHour < 1) {
            const resetIn = this.state.lastRefillHour + HOUR_MS - now;
            return {
                allowed: false,
                remaining: 0,
                resetIn,
                message: `Rate limit exceeded (per hour). Reset in ${resetIn}ms`
            };
        }

        // Check burst limit - track consecutive requests per second
        const burstNow = Date.now();
        if (!this.lastBurstCheck || burstNow - this.lastBurstCheck > 1000) {
            this.lastBurstCheck = burstNow;
            this.burstCounter = 0;
        }
        
        this.burstCounter++;
        if (this.burstCounter > this.config.burstLimit) {
            return {
                allowed: false,
                remaining: 0,
                resetIn: 1000,
                message: `Burst limit exceeded. Maximum ${this.config.burstLimit} requests per second.`
            };
        }

        // Consume tokens
        this.state.tokensMinute -= 1;
        this.state.tokensHour -= 1;

        const remaining = Math.min(this.state.tokensMinute, this.state.tokensHour);

        return {
            allowed: true,
            remaining,
            resetIn: 0,
            message: `Request allowed. ${remaining} requests remaining.`
        };
    }

    /**
     * Refill tokens based on elapsed time
     */
    private refillTokens(now: number): void {
        // Refill minute tokens
        const minuteElapsed = now - this.state.lastRefillMinute;
        if (minuteElapsed >= MINUTE_MS) {
            this.state.tokensMinute = this.config.requestsPerMinute;
            this.state.lastRefillMinute = now;
        } else {
            // Proportional refill based on time
            const minuteFraction = minuteElapsed / MINUTE_MS;
            const tokensToAdd = Math.floor(this.config.requestsPerMinute * minuteFraction);
            this.state.tokensMinute = Math.min(
                this.config.requestsPerMinute,
                this.state.tokensMinute + tokensToAdd
            );
        }

        // Refill hour tokens
        const hourElapsed = now - this.state.lastRefillHour;
        if (hourElapsed >= HOUR_MS) {
            this.state.tokensHour = this.config.requestsPerHour;
            this.state.lastRefillHour = now;
        } else {
            // Proportional refill based on time
            const hourFraction = hourElapsed / HOUR_MS;
            const tokensToAdd = Math.floor(this.config.requestsPerHour * hourFraction);
            this.state.tokensHour = Math.min(
                this.config.requestsPerHour,
                this.state.tokensHour + tokensToAdd
            );
        }
    }

    /**
     * Reset the limiter
     */
    reset(): void {
        const now = Date.now();
        this.state = {
            tokensMinute: this.config.requestsPerMinute,
            tokensHour: this.config.requestsPerHour,
            lastRefillMinute: now,
            lastRefillHour: now
        };
        this.lastBurstCheck = 0;
        this.burstCounter = 0;
    }

    /**
     * Get current state
     */
    getState(): RateLimitState {
        return { ...this.state };
    }

    /**
     * Get remaining tokens
     */
    getRemaining(): { minute: number; hour: number } {
        this.refillTokens(Date.now());
        return {
            minute: this.state.tokensMinute,
            hour: this.state.tokensHour
        };
    }

    /**
     * Get configuration
     */
    getConfig(): RateLimitConfig {
        return { ...this.config };
    }

    /**
     * Get status report
     */
    getReport(): string {
        const remaining = this.getRemaining();
        const config = this.getConfig();

        return `
Rate Limiter Report [${this.identifier}]:
  Per Minute: ${remaining.minute}/${config.requestsPerMinute}
  Per Hour: ${remaining.hour}/${config.requestsPerHour}
  Burst Limit: ${config.burstLimit}
  State: ${this.state.tokensMinute > 0 && this.state.tokensHour > 0 ? 'ACTIVE' : 'LIMITED'}
        `.trim();
    }
}

/**
 * Global rate limiters by identifier
 */
const limiters = new Map<string, RateLimiter>();

/**
 * Get or create rate limiter for identifier
 */
const getLimiter = (identifier: string, config?: Partial<RateLimitConfig>): RateLimiter => {
    if (!limiters.has(identifier)) {
        limiters.set(identifier, new RateLimiter(config, identifier));
    }
    return limiters.get(identifier)!;
};

/**
 * Check rate limit
 */
export const checkRateLimit = (identifier: string): RateLimitStatus => {
    const limiter = getLimiter(identifier);
    return limiter.checkLimit();
};

/**
 * Create a rate limiter for an identifier
 */
export const createRateLimiter = (
    identifier: string,
    config: Partial<RateLimitConfig> = {}
): RateLimiter => {
    const limiter = new RateLimiter(config, identifier);
    limiters.set(identifier, limiter);
    return limiter;
};

/**
 * Get existing rate limiter
 */
export const getRateLimiter = (identifier: string): RateLimiter | undefined => {
    return limiters.get(identifier);
};

/**
 * Get rate limit status
 */
export const getRateLimitStatus = (identifier: string): RateLimitStatus => {
    return checkRateLimit(identifier);
};

/**
 * Reset rate limiter
 */
export const resetRateLimiter = (identifier: string): void => {
    const limiter = limiters.get(identifier);
    if (limiter) {
        limiter.reset();
    }
};

/**
 * Clear all rate limiters
 */
export const clearAllRateLimiters = (): void => {
    limiters.clear();
};

/**
 * Get all rate limiters
 */
export const getAllRateLimiters = (): Map<string, RateLimiter> => {
    return new Map(limiters);
};

/**
 * Middleware function for Express-like frameworks
 * Returns a function that checks rate limits
 */
export const createRateLimitMiddleware = (identifier: string, config?: Partial<RateLimitConfig>) => {
    const limiter = createRateLimiter(identifier, config);

    return (req?: unknown, res?: unknown, next?: () => void) => {
        const status = limiter.checkLimit();

        if (!status.allowed) {
            const error = new Error(status.message);
            if (res && typeof res === 'object' && 'status' in res && 'json' in res) {
                (res as any).status(429).json({
                    error: 'Too many requests',
                    message: status.message,
                    resetIn: status.resetIn
                });
            } else {
                throw error;
            }
        } else {
            if (next) next();
        }
    };
};

/**
 * Async rate limit check
 * Waits for tokens to be available if limit is exceeded
 */
export const waitForRateLimit = async (
    identifier: string,
    maxWaitMs: number = 60000
): Promise<boolean> => {
    const startTime = Date.now();
    const limiter = getLimiter(identifier);

    while (true) {
        const status = limiter.checkLimit();
        
        if (status.allowed) {
            return true;
        }

        const elapsed = Date.now() - startTime;
        if (elapsed > maxWaitMs) {
            return false;
        }

        // Wait for minimum of 100ms or the reset time (capped at 1s)
        const waitMs = Math.min(Math.max(100, status.resetIn), 1000);
        await new Promise(resolve => setTimeout(resolve, waitMs));
    }
};

/**
 * Get rate limit statistics
 */
export const getRateLimitStats = (): Array<{
    identifier: string;
    config: RateLimitConfig;
    remaining: { minute: number; hour: number };
}> => {
    const stats: Array<any> = [];

    limiters.forEach((limiter, identifier) => {
        stats.push({
            identifier,
            config: limiter.getConfig(),
            remaining: limiter.getRemaining()
        });
    });

    return stats;
};

/**
 * Generate rate limit report for all limiters
 */
export const generateRateLimitReport = (): string => {
    const stats = getRateLimitStats();
    
    if (stats.length === 0) {
        return 'No rate limiters configured';
    }

    const lines = ['Rate Limit Statistics:'];
    stats.forEach(stat => {
        lines.push(`  ${stat.identifier}:`);
        lines.push(`    Minute: ${stat.remaining.minute}/${stat.config.requestsPerMinute}`);
        lines.push(`    Hour: ${stat.remaining.hour}/${stat.config.requestsPerHour}`);
    });

    return lines.join('\n');
};
