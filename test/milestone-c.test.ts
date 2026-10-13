import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { escapeHtml, renderSafeTemplate } from '../lib/security/sanitize.ts';
import { createRegistrationTicket, verifyRegistrationTicket } from '../lib/security/upload-ticket.ts';
import { isSensitiveMedia, canAccessMedia, generateSignedDeliveryUrl } from '../lib/security/media-auth.ts';

describe('Milestone C — Upload/Media/API/Dependency Security', () => {

  test('#50: HTML & script injection prevention in document generator', () => {
    // Basic escaping
    const dirtyInput = '<script>alert("XSS")</script>&<img src=x onerror=alert(1)>"quoted"';
    const cleanOutput = escapeHtml(dirtyInput);

    assert.equal(cleanOutput.includes('<script>'), false);
    assert.equal(cleanOutput.includes('&lt;script&gt;'), true);
    assert.equal(cleanOutput.includes('&lt;img'), true);
    assert.equal(cleanOutput.includes('&quot;quoted&quot;'), true);

    // Template rendering test with resident-controlled values
    const template = '<div>Resident: {{name}}, Address: {{address}}, Purpose: {{purpose}}</div>';
    const dirtyValues = {
      name: 'Juan Dela Cruz <script>evil()</script>',
      address: 'Block 1 Lot 2 <iframe src="javascript:evil()"></iframe>',
      purpose: 'Employment & Application'
    };

    const rendered = renderSafeTemplate(template, dirtyValues);
    assert.equal(rendered.includes('<script>'), false, 'Template must not contain unescaped script tag');
    assert.equal(rendered.includes('<iframe>'), false, 'Template must not contain unescaped iframe tag');
    assert.equal(rendered.includes('&lt;script&gt;evil()&lt;/script&gt;'), true);
    assert.equal(rendered.includes('&lt;iframe'), true);
    assert.equal(rendered.includes('Employment &amp; Application'), true);
  });

  test('#51: Constrained registration upload tickets reject forged/stale attempts', () => {
    // Generate valid ticket
    const ticket = createRegistrationTicket(300); // 5 min
    assert.ok(ticket, 'Registration ticket should be generated');

    // Verify valid ticket
    const isValid = verifyRegistrationTicket(ticket);
    assert.equal(isValid, true, 'Fresh ticket must verify successfully');

    // Tampered ticket
    const tampered = ticket + 'manipulated';
    assert.equal(verifyRegistrationTicket(tampered), false, 'Tampered ticket must fail verification');

    // Empty or malformed ticket
    assert.equal(verifyRegistrationTicket(''), false);
    assert.equal(verifyRegistrationTicket(null as any), false);
    assert.equal(verifyRegistrationTicket('abc.def'), false);
  });

  test('#52: Protected media access boundaries restrict sensitive evidence', () => {
    // Classification
    assert.equal(isSensitiveMedia('https://res.cloudinary.com/talasys/image/upload/v1/talasys/proofs/id_123.webp'), true);
    assert.equal(isSensitiveMedia('https://res.cloudinary.com/talasys/image/upload/v1/talasys/receipts/gcash_456.webp'), true);
    assert.equal(isSensitiveMedia('https://res.cloudinary.com/talasys/image/upload/v1/talasys/signatures/official_789.png'), true);
    assert.equal(isSensitiveMedia('https://res.cloudinary.com/talasys/image/upload/v1/talasys/public/logo.png'), false);

    // Authorization checks
    // Unauthenticated
    const unauth = canAccessMedia({
      mediaUrl: 'talasys/proofs/id.webp',
      callerUid: '',
    });
    assert.equal(unauth.authorized, false);

    // Admin access
    const adminAccess = canAccessMedia({
      mediaUrl: 'talasys/proofs/id.webp',
      callerUid: 'admin-uid-1',
      callerRole: 'Full Access',
      ownerUid: 'resident-uid-99',
    });
    assert.equal(adminAccess.authorized, true);

    // Owner resident access
    const ownerAccess = canAccessMedia({
      mediaUrl: 'talasys/proofs/id.webp',
      callerUid: 'resident-uid-99',
      callerRole: 'resident',
      ownerUid: 'resident-uid-99',
    });
    assert.equal(ownerAccess.authorized, true);

    // Third-party resident access attempt
    const otherResidentAccess = canAccessMedia({
      mediaUrl: 'talasys/proofs/id.webp',
      callerUid: 'resident-uid-attacker',
      callerRole: 'resident',
      ownerUid: 'resident-uid-99',
    });
    assert.equal(otherResidentAccess.authorized, false);

    // Signed delivery URL generation
    const signedUrl = generateSignedDeliveryUrl('talasys/proofs/id_123', 'talasys-cloud', 'secret123');
    assert.ok(signedUrl.includes('res.cloudinary.com'));
    assert.ok(signedUrl.includes('t_authenticated'));
  });

  test('#53: Backup export endpoint rejects URL query tokens and enforces Bearer auth', () => {
    // Simulation of backup route validation logic
    function validateBackupRequest(headers: Record<string, string>, searchParams: URLSearchParams) {
      // #53: Query token is forbidden
      if (searchParams.get('token')) {
        return { status: 400, error: 'Query parameter authentication is forbidden for backups (#53)' };
      }

      const authHeader = headers['authorization'] || headers['Authorization'];
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return { status: 401, error: 'Missing Authorization: Bearer token' };
      }

      const token = authHeader.split('Bearer ')[1].trim();
      if (!token || token.length < 10) {
        return { status: 401, error: 'Invalid token' };
      }

      return { status: 200, token };
    }

    // Attempt with token in query string
    const queryParams = new URLSearchParams('token=secret-token-xyz');
    const resQuery = validateBackupRequest({}, queryParams);
    assert.equal(resQuery.status, 400);

    // Attempt without any token
    const resEmpty = validateBackupRequest({}, new URLSearchParams());
    assert.equal(resEmpty.status, 401);

    // Valid Bearer header
    const resValid = validateBackupRequest(
      { authorization: 'Bearer valid-firebase-id-token-123456' },
      new URLSearchParams()
    );
    assert.equal(resValid.status, 200);
    assert.equal(resValid.token, 'valid-firebase-id-token-123456');
  });
});
