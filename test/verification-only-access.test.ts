import test from "node:test"
import assert from "node:assert/strict"
import { isRouteAllowedForRole } from "../lib/auth/auth-types.ts"

for (const role of ["Verification Only", "Verifications"] as const) {
  test(`${role} route policy exposes only verification workspace routes`, () => {
    assert.equal(isRouteAllowedForRole("/admin/dashboard", role), true)
    assert.equal(isRouteAllowedForRole("/admin/verifications", role), true)
    assert.equal(isRouteAllowedForRole("/admin/verifications/profile-edits", role), true)
    assert.equal(isRouteAllowedForRole("/admin/verifications/reactivation", role), true)
    assert.equal(isRouteAllowedForRole("/admin/verifications/history", role), true)
    for (const forbidden of ["/admin/residents", "/admin/requests", "/admin/reports", "/admin/logs", "/admin/notifications", "/admin/generate", "/superadmin/dashboard"]) {
      assert.equal(isRouteAllowedForRole(forbidden, role), false, forbidden)
    }
  })
}
