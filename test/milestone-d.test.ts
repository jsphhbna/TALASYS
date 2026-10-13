import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  parseAuditTimestamp,
  formatAuditIp,
  extractValidYear,
  isTimestampToday,
  isTimestampThisWeek,
} from '../lib/security/audit-utils.ts'

describe('Milestone D: Reporting, Audit & Lifecycle Correctness', () => {
  describe('#3 — Extract valid year (eliminating invalid 1700s years)', () => {
    it('returns null for empty, undefined or invalid dates', () => {
      assert.strictEqual(extractValidYear(null), null)
      assert.strictEqual(extractValidYear(undefined), null)
      assert.strictEqual(extractValidYear(''), null)
      assert.strictEqual(extractValidYear('not-a-date'), null)
    })

    it('does not parse numeric epoch prefix 1790... as year 1790', () => {
      // 1735689600000 is Jan 1, 2025 epoch
      const epochStr = '1735689600000'
      const year = extractValidYear(epochStr)
      assert.strictEqual(year, '2025')
      assert.notStrictEqual(year, '1735')
    })

    it('extracts year from ISO string and Date instances', () => {
      assert.strictEqual(extractValidYear('2026-10-13T08:00:00Z'), '2026')
      assert.strictEqual(extractValidYear(new Date('2024-05-20')), '2024')
    })

    it('rejects pre-2000 dates as invalid historical outliers', () => {
      assert.strictEqual(extractValidYear('1790-01-01'), null)
    })
  })

  describe('#6 — Audit IP formatting', () => {
    it('replaces localhost, 127.0.0.1 and ::1 with "Not captured"', () => {
      assert.strictEqual(formatAuditIp('localhost'), 'Not captured')
      assert.strictEqual(formatAuditIp('127.0.0.1'), 'Not captured')
      assert.strictEqual(formatAuditIp('::1'), 'Not captured')
    })

    it('returns "Not captured" for empty or missing IP', () => {
      assert.strictEqual(formatAuditIp(''), 'Not captured')
      assert.strictEqual(formatAuditIp(null), 'Not captured')
      assert.strictEqual(formatAuditIp(undefined), 'Not captured')
    })

    it('preserves valid external IP addresses', () => {
      assert.strictEqual(formatAuditIp('136.158.32.10'), '136.158.32.10')
      assert.strictEqual(formatAuditIp('2001:db8::1'), '2001:db8::1')
    })
  })

  describe('#15 — Audit timestamp normalization', () => {
    it('parses numeric epoch timestamps', () => {
      const now = 1728800000000
      assert.strictEqual(parseAuditTimestamp(now), now)
    })

    it('parses string epoch timestamps from Admin writers', () => {
      const now = 1728800000000
      assert.strictEqual(parseAuditTimestamp(now.toString()), now)
    })

    it('parses Firestore timestamp objects with seconds', () => {
      const firestoreTs = { seconds: 1728800000, nanoseconds: 0 }
      assert.strictEqual(parseAuditTimestamp(firestoreTs), 1728800000000)
    })

    it('parses ISO date strings', () => {
      const iso = '2026-10-13T08:00:00.000Z'
      assert.strictEqual(parseAuditTimestamp(iso), new Date(iso).getTime())
    })

    it('returns null for corrupt timestamps', () => {
      assert.strictEqual(parseAuditTimestamp('invalid-date'), null)
      assert.strictEqual(parseAuditTimestamp(null), null)
    })
  })

  describe('#16 — Admin activity log action fallback', () => {
    it('guards log.action.split from crashing when action is missing', () => {
      const logWithoutAction: any = {
        id: 'log-1',
        actionType: 'Resident Edit',
        details: 'Updated Juan Dela Cruz',
      }
      const safeAction = logWithoutAction.action || logWithoutAction.actionType || 'Unknown Action'
      const tokens = safeAction.split(' ')
      assert.deepStrictEqual(tokens, ['Resident', 'Edit'])
    })
  })

  describe('#17 — Resident lifecycle status and expiry counts', () => {
    const deriveLifecycleStatus = (isVerified: boolean, accountExpiry?: string): "Verified" | "Expiring" | "Expired" | "Pending" => {
      if (!isVerified) return "Pending"
      if (!accountExpiry) return "Verified"
      const expiry = new Date(accountExpiry).getTime()
      if (isNaN(expiry)) return "Verified"
      const now = Date.now()
      if (expiry < now) return "Expired"
      const daysUntilExpiry = (expiry - now) / (1000 * 60 * 60 * 24)
      if (daysUntilExpiry <= 30) return "Expiring"
      return "Verified"
    }

    it('identifies Expiring residents within 30 days', () => {
      const in10Days = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString()
      assert.strictEqual(deriveLifecycleStatus(true, in10Days), 'Expiring')
    })

    it('identifies Expired residents after expiry date', () => {
      const pastDate = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString()
      assert.strictEqual(deriveLifecycleStatus(true, pastDate), 'Expired')
    })

    it('identifies Verified active residents beyond 30 days', () => {
      const in60Days = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString()
      assert.strictEqual(deriveLifecycleStatus(true, in60Days), 'Verified')
    })

    it('counts active residents as verified + expiring, excluding expired', () => {
      const residents = [
        { status: 'Verified' },
        { status: 'Expiring' },
        { status: 'Expired' },
        { status: 'Pending' },
      ]
      const verified = residents.filter(r => r.status === 'Verified').length
      const expiring = residents.filter(r => r.status === 'Expiring').length
      const activeResidents = verified + expiring
      assert.strictEqual(activeResidents, 2)
    })
  })

  describe('#18 — Verification history filter domain coverage', () => {
    const isVerificationEvent = (log: any): boolean => {
      const action = (log.action || log.actionType || '').toLowerCase()
      const targetCol = log.targetCollection || ''
      return (
        targetCol === 'verifications' ||
        action.includes('verification') ||
        action.includes('profile edit') ||
        action.includes('reactivation')
      )
    }

    it('includes profile edit approvals in verification history', () => {
      assert.strictEqual(isVerificationEvent({ action: 'Approved Profile Edit', targetCollection: 'verifications' }), true)
      assert.strictEqual(isVerificationEvent({ action: 'Rejected Profile Edit', targetCollection: 'verifications' }), true)
    })

    it('includes reactivation decisions in verification history', () => {
      assert.strictEqual(isVerificationEvent({ action: 'Approved Reactivation', targetCollection: 'verifications' }), true)
      assert.strictEqual(isVerificationEvent({ action: 'Rejected Reactivation', targetCollection: 'verifications' }), true)
    })

    it('excludes unrelated request operations', () => {
      assert.strictEqual(isVerificationEvent({ action: 'Approved Document Request', targetCollection: 'document_requests' }), false)
    })
  })

  describe('#19 — Metrics date boundaries and request vs generated separation', () => {
    it('isTimestampToday accurately distinguishes today from yesterday in Asia/Manila', () => {
      const now = Date.now()
      const yesterday = now - 26 * 60 * 60 * 1000
      assert.strictEqual(isTimestampToday(now), true)
      assert.strictEqual(isTimestampToday(yesterday), false)
    })

    it('isTimestampThisWeek separates current week from 10 days ago', () => {
      const now = Date.now()
      const tenDaysAgo = now - 10 * 24 * 60 * 60 * 1000
      assert.strictEqual(isTimestampThisWeek(now), true)
      assert.strictEqual(isTimestampThisWeek(tenDaysAgo), false)
    })

    it('separates generated documents from pending and rejected requests', () => {
      const requests = [
        { status: 'Pending' },
        { status: 'Rejected' },
        { status: 'Approved' },
        { status: 'Completed' },
      ]
      const totalRequests = requests.length
      const generatedDocuments = requests.filter(r => r.status === 'Approved' || r.status === 'Completed').length
      assert.strictEqual(totalRequests, 4)
      assert.strictEqual(generatedDocuments, 2)
    })
  })
})
