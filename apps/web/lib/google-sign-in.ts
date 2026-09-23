"use client";

/**
 * Full-page POST so the OAuth state cookie is set on the navigation to Google.
 * next-auth's fetch-then-redirect loses that cookie on the first attempt.
 */
export async function signInWithGoogle(callbackUrl = "/dashboard") {
  const response = await fetch("/api/auth/csrf");
  if (!response.ok) {
    window.location.href = "/api/auth/signin?error=Configuration";
    return;
  }
  const payload = (await response.json()) as { csrfToken?: string };
  if (!payload.csrfToken) {
    window.location.href = "/api/auth/signin?error=Configuration";
    return;
  }

  const form = document.createElement("form");
  form.method = "POST";
  form.action = "/api/auth/signin/google";

  for (const [name, value] of [
    ["csrfToken", payload.csrfToken],
    ["callbackUrl", callbackUrl],
  ] as const) {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = name;
    input.value = value;
    form.appendChild(input);
  }

  document.body.appendChild(form);
  form.submit();
}
