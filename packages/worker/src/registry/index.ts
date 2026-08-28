export interface JobContext {
    jobId: string;
    retryCount: number;
}

export type JobHandler = (payload: Record<string, any>, ctx: JobContext) => Promise<void>;

export const JobHandlers: Record<string, JobHandler> = {
    // Echoes payload.message to the log. Always succeeds. Useful as a smoke-test handler.
    echo: async (payload, ctx) => {
        console.log(`[JobHandlers:echo] job=${ctx.jobId} message=${payload.message ?? '(no message)'}`);
    },

    // Waits payload.ms (default 1000) before resolving. Replaces the old hardcoded setTimeout stand-in.
    sleep: async (payload, ctx) => {
        const ms = typeof payload.ms === 'number' ? payload.ms : 1000;
        console.log(`[JobHandlers:sleep] job=${ctx.jobId} sleeping ${ms}ms`);
        await new Promise((res) => setTimeout(res, ms));
    },

    // Throws until ctx.retryCount >= payload.failTimes, then succeeds.
    // Lets Phase 5 retry behavior be demonstrated with a job that's configured to fail its
    // first N attempts before finally completing.
    'fail-n-times': async (payload, ctx) => {
        const failTimes = typeof payload.failTimes === 'number' ? payload.failTimes : 2;
        if (ctx.retryCount < failTimes) {
            throw new Error(
                `[JobHandlers:fail-n-times] job=${ctx.jobId} intentionally failing (attempt ${ctx.retryCount + 1}/${failTimes + 1})`
            );
        }
        console.log(`[JobHandlers:fail-n-times] job=${ctx.jobId} succeeding on attempt ${ctx.retryCount + 1}`);
    },
};
