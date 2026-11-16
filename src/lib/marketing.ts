/** Every "Start free" button: sign up, then create (or ask to join) the company's workspace. */
export const startFreeHref = (src: string) => `/sign-up?src=${encodeURIComponent(src)}&next=${encodeURIComponent("/workspaces/new")}`;
