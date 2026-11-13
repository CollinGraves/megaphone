"use client";

import type { ComponentProps } from "react";
import { Select } from "@/components/ui";

/** A <select> that submits its parent form on change (with a no-JS submit button kept by the caller). */
export function AutoSubmitSelect(props: ComponentProps<typeof Select>) {
  return <Select {...props} onChange={(e) => e.currentTarget.form?.requestSubmit()} />;
}
