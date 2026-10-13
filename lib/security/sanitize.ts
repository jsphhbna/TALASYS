/**
 * Security sanitization helpers for HTML escaping and template rendering.
 * Prevents stored and reflected XSS attacks when rendering resident-controlled inputs (#50).
 */

const HTML_ESCAPE_MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#039;",
}

/**
 * Escapes characters with special meaning in HTML to their entity representations.
 */
export function escapeHtml(input: unknown): string {
  if (input === null || input === undefined) return ""
  return String(input).replace(/[&<>"']/g, (char) => HTML_ESCAPE_MAP[char] || char)
}

/**
 * Replaces placeholders in document templates with safely escaped values.
 * Only explicit structural formatting tags (<strong>, <em>, <br>, <u>, <b>) in the template itself are preserved.
 */
export function renderSafeTemplate(
  template: string,
  variables: Record<string, string | number | undefined | null>
): string {
  let output = template

  for (const [key, value] of Object.entries(variables)) {
    const safeValue = escapeHtml(value ?? "")
    const regex = new RegExp(`{{${key}}}`, "g")
    output = output.replace(regex, safeValue)
  }

  // Strip any dangerous injected tags that may exist in the raw template itself
  output = output.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
  output = output.replace(/\bon\w+\s*=/gi, "data-blocked-handler=")
  output = output.replace(/javascript:/gi, "blocked-scheme:")

  return output
}
