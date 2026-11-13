import { describe, expect, it } from "vitest";
import { classifyEmail, companyDomain, guessCompanyName, isWorkEmail } from "./email-domains";

describe("classifyEmail", () => {
  it("separates work, personal, disposable, academic and invalid addresses", () => {
    expect(classifyEmail("jane@acme.com")).toBe("work");
    expect(classifyEmail("Jane@Gmail.com")).toBe("personal");
    expect(classifyEmail("x@outlook.co.uk".replace("co.uk", "com"))).toBe("personal");
    expect(classifyEmail("x@comcast.net")).toBe("personal");
    expect(classifyEmail("x@mailinator.com")).toBe("disposable");
    expect(classifyEmail("x@stanford.edu")).toBe("academic");
    expect(classifyEmail("x@ox.ac.uk")).toBe("academic");
    expect(classifyEmail("not-an-email")).toBe("invalid");
    expect(isWorkEmail("ops@northlabs.io")).toBe(true);
  });
});

describe("company domains", () => {
  it("reduces subdomains to the registrable domain", () => {
    expect(companyDomain("mail.us.acme.com")).toBe("acme.com");
    expect(companyDomain("eu.acme.co.uk")).toBe("acme.co.uk");
    expect(companyDomain("acme.com")).toBe("acme.com");
  });
  it("guesses a display name from the domain", () => {
    expect(guessCompanyName("acme-corp.com")).toBe("Acme Corp");
    expect(guessCompanyName("ibm.com")).toBe("IBM");
    expect(guessCompanyName("sales.globex.co.uk")).toBe("Globex");
  });
});
