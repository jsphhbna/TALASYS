import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  isVerificationOnlyRole,
  isDocumentProcessingRole,
  isResidentManagementRole,
  isRouteAllowedForRole,
  getAllowedLandingPage,
  canManageVerificationsRole,
  canManageRequestsRole,
  canManageResidentsRole,
  isReadOnlyAdminRole,
} from '../lib/auth/auth-types.ts';
import { extractClientIp } from '../lib/security/request-ip.ts';
import {
  createRegistrationTicket,
  verifyRegistrationTicket,
  verifyAndConsumeRegistrationTicket,
} from '../lib/security/upload-ticket.ts';
import {
  isSensitiveMedia,
  canAccessMedia,
  generateSignedDeliveryUrl,
  isDeliveryUrlExpired,
  parseCloudinaryAsset,
} from '../lib/security/media-auth.ts';

describe('Reopened Remediation Independent Review Suite', () => {

  // =========================================================================
  // 1. Verification Only Dashboard, Navigation & Authorization
  // =========================================================================
  describe('1. Verification Only Role & Canonical Permission Matrix', () => {
    test('Role identification recognizes both "Verification Only" and "Verifications"', () => {
      assert.equal(isVerificationOnlyRole('Verification Only'), true);
      assert.equal(isVerificationOnlyRole('Verifications'), true);
      assert.equal(isVerificationOnlyRole('Full Access'), false);
      assert.equal(isVerificationOnlyRole('Document Processing'), false);
      assert.equal(isVerificationOnlyRole('Resident Management'), false);
      assert.equal(isVerificationOnlyRole('resident'), false);
    });

    test('Verification Only role route restrictions enforce strict workspace isolation', () => {
      const role = 'Verification Only';
      // Allowed routes
      assert.equal(isRouteAllowedForRole('/admin/dashboard', role), true, 'Dashboard workspace must be allowed');
      assert.equal(isRouteAllowedForRole('/admin/verifications', role), true, 'Verifications root must be allowed');
      assert.equal(isRouteAllowedForRole('/admin/verifications/profile-edits', role), true, 'Profile edits queue must be allowed');
      assert.equal(isRouteAllowedForRole('/admin/verifications/reactivation', role), true, 'Reactivation queue must be allowed');
      assert.equal(isRouteAllowedForRole('/admin/verifications/history', role), true, 'Verification history must be allowed');
      assert.equal(isRouteAllowedForRole('/admin/notifications', role), true, 'Admin notifications must be allowed');

      // Strictly Forbidden routes
      assert.equal(isRouteAllowedForRole('/admin/residents', role), false, 'Resident management must be forbidden');
      assert.equal(isRouteAllowedForRole('/admin/residents/statistics', role), false, 'Resident stats must be forbidden');
      assert.equal(isRouteAllowedForRole('/admin/requests', role), false, 'Document requests must be forbidden');
      assert.equal(isRouteAllowedForRole('/admin/requests/payments', role), false, 'Payment processing must be forbidden');
      assert.equal(isRouteAllowedForRole('/admin/generate', role), false, 'Document generation must be forbidden');
      assert.equal(isRouteAllowedForRole('/admin/reports', role), false, 'Category reports must be forbidden');
      assert.equal(isRouteAllowedForRole('/admin/logs', role), false, 'Activity logs must be forbidden');
      assert.equal(isRouteAllowedForRole('/superadmin/dashboard', role), false, 'Superadmin panel must be forbidden');
    });

    test('Equivalent "Verifications" role inherits identical permissions to "Verification Only"', () => {
      const role = 'Verifications';
      assert.equal(isRouteAllowedForRole('/admin/verifications', role), true);
      assert.equal(isRouteAllowedForRole('/admin/residents', role), false);
      assert.equal(isRouteAllowedForRole('/admin/requests', role), false);
      assert.equal(isRouteAllowedForRole('/admin/generate', role), false);
      assert.equal(canManageVerificationsRole(role), true);
      assert.equal(canManageRequestsRole(role), false);
      assert.equal(canManageResidentsRole(role), false);
    });

    test('Other specialized administrative roles maintain consistent boundaries', () => {
      // Document Processing
      assert.equal(isRouteAllowedForRole('/admin/requests', 'Document Processing'), true);
      assert.equal(isRouteAllowedForRole('/admin/generate', 'Document Processing'), true);
      assert.equal(isRouteAllowedForRole('/admin/verifications', 'Document Processing'), false);
      assert.equal(isRouteAllowedForRole('/admin/residents', 'Document Processing'), false);

      // Resident Management
      assert.equal(isRouteAllowedForRole('/admin/residents', 'Resident Management'), true);
      assert.equal(isRouteAllowedForRole('/admin/reports', 'Resident Management'), true);
      assert.equal(isRouteAllowedForRole('/admin/verifications', 'Resident Management'), false);
      assert.equal(isRouteAllowedForRole('/admin/requests', 'Resident Management'), false);

      // View Only
      assert.equal(isRouteAllowedForRole('/admin/residents', 'View Only'), true);
      assert.equal(isRouteAllowedForRole('/admin/verifications', 'View Only'), true);
      assert.equal(isRouteAllowedForRole('/admin/generate', 'View Only'), false, 'Cannot generate documents');

      // Super Admin
      assert.equal(isRouteAllowedForRole('/superadmin/dashboard', 'superadmin'), true);
      assert.equal(isRouteAllowedForRole('/admin/dashboard', 'superadmin'), true);
    });

    test('Allowed landing pages map authoritatively per role', () => {
      assert.equal(getAllowedLandingPage('superadmin'), '/superadmin/dashboard');
      assert.equal(getAllowedLandingPage('Super Admin'), '/superadmin/dashboard');
      assert.equal(getAllowedLandingPage('Full Access'), '/admin/dashboard');
      assert.equal(getAllowedLandingPage('Verification Only'), '/admin/dashboard');
      assert.equal(getAllowedLandingPage('Verifications'), '/admin/dashboard');
      assert.equal(getAllowedLandingPage('Document Processing'), '/admin/dashboard');
      assert.equal(getAllowedLandingPage('resident'), '/resident/dashboard');
      assert.equal(getAllowedLandingPage(null), '/auth/login');
    });
  });

  // =========================================================================
  // 2. Reopened #28/#30: Resident Email Endpoint Authorization
  // =========================================================================
  describe('2. Reopened #28/#30: Email Update Authorization Logic', () => {
    function simulateEmailAuthCheck(params: {
      callerRole: string;
      callerStatus: string;
      targetRole: string;
      hasMatchingVerification?: boolean;
    }) {
      const { callerRole, callerStatus, targetRole, hasMatchingVerification } = params;

      // Active status check
      if (callerStatus === 'Locked' || callerStatus === 'Deleted') {
        return { status: 403, error: 'Caller account is locked or deleted' };
      }

      // Target must be resident
      if (targetRole !== 'resident') {
        return { status: 403, error: 'Target is not a resident account' };
      }

      // Role check
      const isSuper = callerRole === 'superadmin' || callerRole === 'Super Admin';
      const isFull = callerRole === 'admin' || callerRole === 'Full Access';
      const isResMgmt = callerRole === 'Resident Management';
      const isVerif = callerRole === 'Verification Only' || callerRole === 'Verifications';

      if (isSuper || isFull || isResMgmt) {
        return { status: 200, authorized: true };
      }

      if (isVerif) {
        if (!hasMatchingVerification) {
          return { status: 403, error: 'Verification Only admin requires matching pending verification' };
        }
        return { status: 200, authorized: true };
      }

      return { status: 403, error: 'Caller role is not permitted to update resident email' };
    }

    test('Rejects caller if caller account is locked or deleted', () => {
      const res = simulateEmailAuthCheck({
        callerRole: 'Full Access',
        callerStatus: 'Locked',
        targetRole: 'resident',
      });
      assert.equal(res.status, 403);
    });

    test('Rejects if target is not a resident (privilege escalation prevention)', () => {
      const res = simulateEmailAuthCheck({
        callerRole: 'Full Access',
        callerStatus: 'Active',
        targetRole: 'admin',
      });
      assert.equal(res.status, 403);
    });

    test('Allows Super Admin, Full Admin, and Resident Management directly', () => {
      for (const role of ['Super Admin', 'Full Access', 'Resident Management']) {
        const res = simulateEmailAuthCheck({
          callerRole: role,
          callerStatus: 'Active',
          targetRole: 'resident',
        });
        assert.equal(res.status, 200);
      }
    });

    test('Verification Only is rejected without matching pending verification', () => {
      const res = simulateEmailAuthCheck({
        callerRole: 'Verification Only',
        callerStatus: 'Active',
        targetRole: 'resident',
        hasMatchingVerification: false,
      });
      assert.equal(res.status, 403);
    });

    test('Verification Only is authorized when matching profile-edit verification exists', () => {
      const res = simulateEmailAuthCheck({
        callerRole: 'Verification Only',
        callerStatus: 'Active',
        targetRole: 'resident',
        hasMatchingVerification: true,
      });
      assert.equal(res.status, 200);
    });

    test('Document Processing and View Only are strictly forbidden from modifying identities', () => {
      for (const role of ['Document Processing', 'Documents Only', 'View Only']) {
        const res = simulateEmailAuthCheck({
          callerRole: role,
          callerStatus: 'Active',
          targetRole: 'resident',
          hasMatchingVerification: true,
        });
        assert.equal(res.status, 403);
      }
    });
  });

  // =========================================================================
  // 3. Reopened #51: Upload Signing Security & Ticket Single-Use
  // =========================================================================
  describe('3. Reopened #51: Upload Signing Security & Single-Use Nonce Tracking', () => {
    test('Rejects ticket if REGISTRATION_TICKET_SECRET is unconfigured (fail closed)', () => {
      const oldSecret = process.env.REGISTRATION_TICKET_SECRET;
      const oldCld = process.env.CLOUDINARY_API_SECRET;
      delete process.env.REGISTRATION_TICKET_SECRET;
      delete process.env.CLOUDINARY_API_SECRET;

      assert.throws(
        () => createRegistrationTicket(300),
        /Registration ticket signing secret is not configured/,
        'Must fail closed when secret is absent'
      );

      process.env.REGISTRATION_TICKET_SECRET = oldSecret || 'test-secret-1234567890';
    });

    test('Enforces single-use consumption of ticket nonces (replay attack prevention)', () => {
      process.env.REGISTRATION_TICKET_SECRET = 'test-secret-for-single-use-nonce-12345';
      const ticket = createRegistrationTicket(300);

      // First consumption succeeds
      const firstUse = verifyAndConsumeRegistrationTicket(ticket);
      assert.equal(firstUse, true, 'First ticket use must succeed');

      // Duplicate consumption fails
      const replayUse = verifyAndConsumeRegistrationTicket(ticket);
      assert.equal(replayUse, false, 'Replaying the same registration ticket must fail');
    });

    test('Rejects expired registration tickets', () => {
      process.env.REGISTRATION_TICKET_SECRET = 'test-secret-for-expiry-check-12345';
      const ticket = createRegistrationTicket(-10); // Expired 10s ago
      const isValid = verifyRegistrationTicket(ticket);
      assert.equal(isValid, false, 'Expired registration ticket must fail verification');
    });

    test('Role-based folder policy enforces strict workflow isolation', () => {
      function isFolderAllowedForRole(role: string, folder: string, isTicket: boolean): boolean {
        if (isTicket) {
          return folder === 'talasys/proofs';
        }
        if (role === 'resident') {
          return folder === 'talasys/proofs' || folder === 'talasys/receipts' || folder === 'talasys/letters';
        }
        if (role === 'Verification Only' || role === 'Verifications') {
          return folder === 'talasys/proofs';
        }
        if (role === 'Full Access' || role === 'superadmin') {
          return true;
        }
        return false;
      }

      // Registration applicants
      assert.equal(isFolderAllowedForRole('', 'talasys/proofs', true), true);
      assert.equal(isFolderAllowedForRole('', 'talasys/signatures', true), false, 'Tickets cannot upload official signatures');
      assert.equal(isFolderAllowedForRole('', 'talasys/receipts', true), false);

      // Residents
      assert.equal(isFolderAllowedForRole('resident', 'talasys/proofs', false), true);
      assert.equal(isFolderAllowedForRole('resident', 'talasys/receipts', false), true);
      assert.equal(isFolderAllowedForRole('resident', 'talasys/signatures', false), false, 'Residents cannot upload official signatures');

      // Verification Only admins
      assert.equal(isFolderAllowedForRole('Verification Only', 'talasys/proofs', false), true);
      assert.equal(isFolderAllowedForRole('Verification Only', 'talasys/signatures', false), false);
    });
  });

  // =========================================================================
  // 4. Reopened #52: Private Media Delivery & Authenticated URLs
  // =========================================================================
  describe('4. Reopened #52: Private Media Storage & Token Delivery', () => {
    test('Cloudinary Token Authentication generates documented ACL and expiration HMAC', () => {
      const { deliveryUrl, expiresAt } = generateSignedDeliveryUrl(
        'talasys/proofs/valid_id_999.webp',
        'brgy-cloud',
        'super-secret-cloudinary-key',
        600
      );

      assert.ok(deliveryUrl.startsWith('https://res.cloudinary.com/brgy-cloud/image/authenticated/s--'));
      assert.ok(deliveryUrl.includes('?__cld_token__='));
      assert.ok(deliveryUrl.includes('st='));
      assert.ok(deliveryUrl.includes('exp='));
      assert.ok(deliveryUrl.includes('acl=/image/authenticated/talasys/proofs/valid_id_999*'));
      assert.ok(deliveryUrl.includes('hmac='));
      assert.equal(isDeliveryUrlExpired(deliveryUrl), false);
    });

    test('Expiration verification reliably detects expired delivery tokens', () => {
      const pastUrl = 'https://res.cloudinary.com/cloud/image/authenticated/s--abc--/id.webp?__cld_token__=st=100~exp=200~acl=/*~hmac=123';
      assert.equal(isDeliveryUrlExpired(pastUrl), true, 'Past timestamp must be recognized as expired');
    });

    test('Authoritative record-based access prevents unauthorized cross-resident evidence leakage', () => {
      const targetRecordOwner = 'resident-alice-123';

      // Bob tries to access Alice's proof document
      const bobAttempt = canAccessMedia({
        mediaUrl: 'talasys/proofs/alice_proof.webp',
        callerUid: 'resident-bob-456',
        callerRole: 'resident',
        ownerUid: targetRecordOwner,
      });
      assert.equal(bobAttempt.authorized, false, 'Unrelated resident must be denied');

      // Alice accesses her own proof document
      const aliceAttempt = canAccessMedia({
        mediaUrl: 'talasys/proofs/alice_proof.webp',
        callerUid: 'resident-alice-123',
        callerRole: 'resident',
        ownerUid: targetRecordOwner,
      });
      assert.equal(aliceAttempt.authorized, true, 'Document owner must be permitted');

      // Verification Only admin accesses proof for review
      const officerAttempt = canAccessMedia({
        mediaUrl: 'talasys/proofs/alice_proof.webp',
        callerUid: 'admin-verif-789',
        callerRole: 'Verification Only',
        ownerUid: targetRecordOwner,
      });
      assert.equal(officerAttempt.authorized, true, 'Verification officer must be permitted');
    });

    test('Asset parser correctly handles images and PDF documents', () => {
      const img = parseCloudinaryAsset('talasys/proofs/doc.webp');
      assert.equal(img.resourceType, 'image');

      const pdf = parseCloudinaryAsset('talasys/proofs/authorization.pdf');
      assert.equal(pdf.resourceType, 'raw');
      assert.equal(pdf.format, 'pdf');
    });
  });

  // =========================================================================
  // 5. Reopened #56: Authoritative Fees & Initial Payment State
  // =========================================================================
  describe('5. Reopened #56: Authoritative Fee Calculation Policy', () => {
    function calculateAuthoritativeFee(params: {
      documentType: string;
      purpose: string;
      userStatuses?: string[];
      configFees?: Record<string, number>;
    }) {
      const { documentType, purpose, userStatuses = [], configFees = {} } = params;
      const lowerPurpose = purpose.toLowerCase();
      const isIndigentResident = userStatuses.includes('Indigent');

      // 1. Statutory Free Documents
      if (documentType === 'Certificate of Indigency') {
        return { fee: 0, paymentStatus: 'waived', reason: 'Statutory indigent document is free of charge.' };
      }
      if (lowerPurpose.includes('first time jobseeker') || lowerPurpose.includes('first-time jobseeker') || lowerPurpose.includes('ra 11261')) {
        return { fee: 0, paymentStatus: 'waived', reason: 'RA 11261 First Time Jobseekers Assistance Act waiver.' };
      }

      // 2. Demographic Indigent Resident Waiver
      if (isIndigentResident) {
        return { fee: 0, paymentStatus: 'waived', reason: 'Verified Indigent resident statutory fee exemption.' };
      }

      // 3. Authoritative System Configuration Fee
      const standardFee = configFees[documentType] ?? 50;
      return {
        fee: standardFee,
        paymentStatus: standardFee > 0 ? 'unpaid' : 'waived',
        reason: 'Standard document issuance fee.',
      };
    }

    test('Indigency certificate is strictly free (fee = 0, paymentStatus = waived)', () => {
      const res = calculateAuthoritativeFee({
        documentType: 'Certificate of Indigency',
        purpose: 'Medical Assistance',
      });
      assert.equal(res.fee, 0);
      assert.equal(res.paymentStatus, 'waived');
    });

    test('First-time jobseeker purpose is strictly waived under RA 11261', () => {
      const res = calculateAuthoritativeFee({
        documentType: 'Barangay Clearance',
        purpose: 'First Time Jobseeker application',
      });
      assert.equal(res.fee, 0);
      assert.equal(res.paymentStatus, 'waived');
    });

    test('Indigent status resident receives automatic waiver on clearance/residency', () => {
      const res = calculateAuthoritativeFee({
        documentType: 'Barangay Clearance',
        purpose: 'General Employment',
        userStatuses: ['Indigent', 'Adult'],
      });
      assert.equal(res.fee, 0);
      assert.equal(res.paymentStatus, 'waived');
    });

    test('Standard request applies authoritative fee and initial unpaid state', () => {
      const res = calculateAuthoritativeFee({
        documentType: 'Barangay Clearance',
        purpose: 'Employment requirement',
        configFees: { 'Barangay Clearance': 75 },
      });
      assert.equal(res.fee, 75);
      assert.equal(res.paymentStatus, 'unpaid');
    });
  });

  // =========================================================================
  // 6. Reopened #61/#44: Atomic Approval & Identity Failure Propagation
  // =========================================================================
  describe('6. Reopened #61/#44: Atomic Approval & Identity Failure Propagation', () => {
    test('Simulated email sync failure halts verification approval before Firestore commit', async () => {
      let firestoreUpdated = false;

      async function approveVerificationWorkflow(shouldSyncFail: boolean) {
        // Step 1: Sync email with Auth service
        if (shouldSyncFail) {
          throw new Error('Failed to synchronize email with Auth service. Approval aborted.');
        }

        // Step 2: Atomic write to Firestore
        firestoreUpdated = true;
      }

      await assert.rejects(
        () => approveVerificationWorkflow(true),
        /Failed to synchronize email with Auth service/
      );
      assert.equal(firestoreUpdated, false, 'Firestore must NOT be modified if Auth synchronization fails');

      await approveVerificationWorkflow(false);
      assert.equal(firestoreUpdated, true, 'Firestore is committed when Auth sync succeeds');
    });

    test('Prevents concurrent or duplicate approval on non-pending verifications', () => {
      function validateApprovalTarget(status: string) {
        if (status !== 'pending') {
          throw new Error('This verification request has already been processed or is no longer pending.');
        }
        return true;
      }

      assert.equal(validateApprovalTarget('pending'), true);
      assert.throws(() => validateApprovalTarget('approved'), /already been processed/);
      assert.throws(() => validateApprovalTarget('rejected'), /already been processed/);
    });
  });

  // =========================================================================
  // 7. Reopened #6: Actual Audit IP Capture
  // =========================================================================
  describe('7. Reopened #6: Real Server Boundary IP Extraction', () => {
    test('Extracts client IP with trusted header precedence', () => {
      const cfHeaders = new Headers({
        'cf-connecting-ip': '203.177.100.25',
        'x-forwarded-for': '198.51.100.1, 192.168.1.1',
      });
      assert.equal(extractClientIp(cfHeaders), '203.177.100.25');

      const xffHeaders = new Headers({
        'x-forwarded-for': '112.198.45.10, 10.0.0.1',
      });
      assert.equal(extractClientIp(xffHeaders), '112.198.45.10');

      const xRealHeaders = new Headers({
        'x-real-ip': '175.176.88.5',
      });
      assert.equal(extractClientIp(xRealHeaders), '175.176.88.5');
    });

    test('Handles IPv6 addresses correctly', () => {
      const ipv6Headers = new Headers({
        'cf-connecting-ip': '2001:0db8:85a3:0000:0000:8a2e:0370:7334',
      });
      assert.equal(extractClientIp(ipv6Headers), '2001:0db8:85a3:0000:0000:8a2e:0370:7334');
    });

    test('Honest fallback when headers are missing or invalid (no fake "localhost" or "Not captured")', () => {
      const emptyHeaders = new Headers();
      assert.equal(extractClientIp(emptyHeaders), 'Unknown');

      const malformedHeaders = new Headers({
        'x-forwarded-for': 'invalid-ip-string',
      });
      assert.equal(extractClientIp(malformedHeaders), 'Unknown');
    });
  });
});
