/** Which single sign-on providers are configured. Buttons for unconfigured ones render as "Coming soon". */
export function socialProvidersEnabled() {
  return {
    google: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    microsoft: Boolean(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET),
  };
}
export type SocialProviders = ReturnType<typeof socialProvidersEnabled>;
