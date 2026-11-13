"use client";

import type { ComponentProps } from "react";
import { Select } from "@/components/ui";

/**
 * A <select> that submits its parent form on change. Give it `key={savedValue}` so React's
 * post-action form reset doesn't snap it back to the option selected at first mount.
 */
export function AutoSubmitSelect(props: ComponentProps<typeof Select>) {
  return <Select {...props} onChange={(e) => e.currentTarget.form?.requestSubmit()} />;
}
