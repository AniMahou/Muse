/**
 * A User-Agent for every outbound provider call.
 *
 * Node's fetch sends no User-Agent by default, and Groq sits behind Cloudflare,
 * which began rejecting header-less requests with a 1010 block. The symptom is
 * `fetch failed` — no status, no body, nothing to read — which surfaced as
 * generic retryable errors, so the evaluation dutifully backed off and retried
 * a request that was never going to succeed. Forty-four of a hundred and five
 * clips were lost that way and looked exactly like rate limiting.
 *
 * Identifying the client is also simply correct: a provider that can see who is
 * calling can rate-limit and debug precisely instead of guessing.
 */
export const USER_AGENT = "Muse/0.1 (+https://github.com/AniMahou/Muse)";
