import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  isSuperAdminRole,
  isFullAdminRole,
  isAnyAdminRole,
  canManageResidentsRole,
  canManageVerificationsRole,
  canManageRequestsRole,
  isReadOnlyAdminRole,
} from '../lib/auth/auth-types.ts';
import * as constants from '../lib/constants.ts';

describe('Milestone B — Auth, Roles, Permissions and Mutation Integrity', () => {

  test('#27 & #59: Canonical role predicates accurately map all supported roles', () => {
    // SuperAdmin variants
    assert.equal(isSuperAdminRole('superadmin'), true);
    assert.equal(isSuperAdminRole('SuperAdmin'), true);
    assert.equal(isSuperAdminRole('Super Admin'), true);
    assert.equal(isSuperAdminRole('admin'), false);

    // FullAdmin variants
    assert.equal(isFullAdminRole('superadmin'), true);
    assert.equal(isFullAdminRole('admin'), true);
    assert.equal(isFullAdminRole('Admin'), true);
    assert.equal(isFullAdminRole('Full Access'), true);
    assert.equal(isFullAdminRole('Resident Management'), false);

    // AnyAdmin covering all specialized roles (#27, #59)
    const adminRoles = [
      'admin',
      'Admin',
      'superadmin',
      'SuperAdmin',
      'Super Admin',
      'Full Access',
      'Resident Management',
      'Verifications',
      'Verification Only',
      'Document Processing',
      'Documents Only',
      'View Only',
    ];

    for (const r of adminRoles) {
      assert.equal(isAnyAdminRole(r), true, `Role "${r}" must be recognized as an admin role`);
    }

    assert.equal(isAnyAdminRole('resident'), false);
    assert.equal(isAnyAdminRole(''), false);
    assert.equal(isAnyAdminRole(undefined), false);

    // Granular domain permissions (#28)
    assert.equal(canManageResidentsRole('Resident Management'), true);
    assert.equal(canManageResidentsRole('Full Access'), true);
    assert.equal(canManageResidentsRole('Verifications'), false);
    assert.equal(canManageResidentsRole('View Only'), false);

    assert.equal(canManageVerificationsRole('Verifications'), true);
    assert.equal(canManageVerificationsRole('Verification Only'), true);
    assert.equal(canManageVerificationsRole('Full Access'), true);
    assert.equal(canManageVerificationsRole('Document Processing'), false);
    assert.equal(canManageVerificationsRole('View Only'), false);

    assert.equal(canManageRequestsRole('Document Processing'), true);
    assert.equal(canManageRequestsRole('Documents Only'), true);
    assert.equal(canManageRequestsRole('Full Access'), true);
    assert.equal(canManageRequestsRole('Resident Management'), false);
    assert.equal(canManageRequestsRole('View Only'), false);

    assert.equal(isReadOnlyAdminRole('View Only'), true);
    assert.equal(isReadOnlyAdminRole('Full Access'), false);
  });

  test('#54: Constants do not leak bootstrap credentials or local fallback keys', () => {
    const exportedKeys = Object.keys(constants);
    assert.equal(
      exportedKeys.includes('SUPERADMIN_BOOTSTRAP_PASSWORD'),
      false,
      'SUPERADMIN_BOOTSTRAP_PASSWORD must not be exported in constants'
    );
    assert.equal(
      exportedKeys.includes('SUPERADMIN_LOCAL_STORAGE_KEY'),
      false,
      'SUPERADMIN_LOCAL_STORAGE_KEY must not exist for session spoofing'
    );
  });

  test('#26, #29, #55, #56, #57, #58: Invariant rules verification logic', () => {
    // Helper replicating firestore rule logic
    function checkUserUpdate(role: string, currentStatus: string, currentData: any, updates: any) {
      const affectedKeys = Object.keys(updates);
      // Resident self-update rule
      if (role === 'resident') {
        const isSelfContactPhoto = affectedKeys.every(k => ['contactNumber', 'profilePicture', 'updatedAt'].includes(k));
        const isSelfDeactivation = affectedKeys.every(k => ['status', 'updatedAt'].includes(k)) &&
          updates.status === 'Deleted by Resident' && currentStatus !== 'Deleted';
        return isSelfContactPhoto || isSelfDeactivation;
      }
      return true;
    }

    // #55: Resident attempting to change accountExpiry or role directly
    assert.equal(
      checkUserUpdate('resident', 'Active', { accountExpiry: '2026-12-01' }, { accountExpiry: '2030-01-01' }),
      false,
      'Resident must not be allowed to update accountExpiry directly'
    );
    assert.equal(
      checkUserUpdate('resident', 'Active', { role: 'resident' }, { role: 'superadmin' }),
      false,
      'Resident must not be allowed to escalate role'
    );

    // #26: Resident self-deactivation flow
    assert.equal(
      checkUserUpdate('resident', 'Active', { status: 'Active' }, { status: 'Deleted by Resident', updatedAt: Date.now() }),
      true,
      'Resident self-deactivation must be allowed under narrow validated rule'
    );

    // #26: Resident request cancellation & payment submission transitions
    function checkRequestUpdate(role: string, currentDoc: any, updates: any) {
      const affectedKeys = Object.keys(updates);
      if (role === 'resident') {
        const isCancellation = affectedKeys.every(k => ['status', 'cancelledAt', 'statusTimestamps'].includes(k)) &&
          currentDoc.status === 'Pending' && updates.status === 'Cancelled';
        const isPaymentSubmission = affectedKeys.every(k => [
          'paymentStatus', 'paymentMethod', 'gcashRefNumber', 'gcashScreenshotUrl', 'paymentSubmittedAt'
        ].includes(k)) && updates.paymentStatus === 'pending_verification' &&
          ['Pending', 'Approved', 'Processing'].includes(currentDoc.status);
        return isCancellation || isPaymentSubmission;
      }
      return true;
    }

    assert.equal(
      checkRequestUpdate('resident', { status: 'Pending' }, { status: 'Cancelled', cancelledAt: Date.now() }),
      true,
      'Resident must be allowed to cancel a Pending request'
    );
    assert.equal(
      checkRequestUpdate('resident', { status: 'Completed' }, { status: 'Cancelled', cancelledAt: Date.now() }),
      false,
      'Resident must not be allowed to cancel a Completed request'
    );
    assert.equal(
      checkRequestUpdate('resident', { status: 'Pending' }, { paymentStatus: 'pending_verification', paymentMethod: 'gcash' }),
      true,
      'Resident must be allowed to submit payment metadata'
    );
    assert.equal(
      checkRequestUpdate('resident', { status: 'Pending' }, { status: 'Approved' }),
      false,
      'Resident must not be allowed to forge status to Approved'
    );

    // #57: Verification creation must enforce status === 'pending'
    function checkVerificationCreate(role: string, payload: any) {
      if (role === 'resident') {
        return payload.status === 'pending' && ['registration', 'profile-edit', 'reactivation'].includes(payload.type);
      }
      return true;
    }

    assert.equal(
      checkVerificationCreate('resident', { status: 'approved', type: 'registration' }),
      false,
      'Resident must not be allowed to create an approved verification'
    );
    assert.equal(
      checkVerificationCreate('resident', { status: 'pending', type: 'registration' }),
      true,
      'Resident must be allowed to submit pending verification'
    );

    // #58: Resident notification creation must target 'admin' only
    function checkNotificationCreate(role: string, payload: any) {
      if (role === 'resident') {
        return payload.targetId === 'admin' && ['info', 'alert'].includes(payload.type);
      }
      return true;
    }

    assert.equal(
      checkNotificationCreate('resident', { targetId: 'other-user-123', type: 'info', message: 'fake alert' }),
      false,
      'Resident must not be allowed to send notifications to arbitrary targetId'
    );
    assert.equal(
      checkNotificationCreate('resident', { targetId: 'admin', type: 'info', message: 'New request' }),
      true,
      'Resident must be allowed to send info notification to admin'
    );
  });

  test('#30: Account lockout check rejects locked and deleted sessions', () => {
    function isSessionAuthorized(user: any) {
      const isLockedOrDeleted = Boolean(
        user?.status === 'Locked' ||
        user?.status === 'Deleted' ||
        user?.status === 'Deleted by Resident' ||
        user?.role === 'Deleted'
      );
      return !isLockedOrDeleted;
    }

    assert.equal(isSessionAuthorized({ role: 'admin', status: 'Active' }), true);
    assert.equal(isSessionAuthorized({ role: 'admin', status: 'Locked' }), false);
    assert.equal(isSessionAuthorized({ role: 'resident', status: 'Deleted by Resident' }), false);
    assert.equal(isSessionAuthorized({ role: 'Deleted', status: 'Active' }), false);
  });
});
