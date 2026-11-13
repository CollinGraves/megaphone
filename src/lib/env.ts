export function appUrl() {
  return (
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "http://localhost:3000")
  ).replace(/\/$/, "");
}

export const hasAnthropic = () => Boolean(process.env.ANTHROPIC_API_KEY);
export const hasResend = () => Boolean(process.env.RESEND_API_KEY);
