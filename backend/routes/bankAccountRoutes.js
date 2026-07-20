const express = require('express');
const router = express.Router();
const bankAccountController = require('../controllers/bankAccountController');
const { protect, restrictTo } = require('../middleware/authMiddleware');

/**
 * Bank Account Routes
 * All routes require authentication via protect middleware
 */

/**
 * @route   GET /api/bank-accounts
 * @desc    Get all active bank accounts
 * @access  Private (SUPER_ADMIN, ACCOUNTS, COORDINATOR)
 */
router.get(
  '/',
  protect,
  restrictTo('SUPER_ADMIN', 'ACCOUNTS', 'COORDINATOR'),
  bankAccountController.getAllBankAccounts
);

/**
 * @route   POST /api/bank-accounts
 * @desc    Create a new bank account
 * @access  Private (SUPER_ADMIN, ACCOUNTS)
 */
router.post(
  '/',
  protect,
  restrictTo('SUPER_ADMIN', 'ACCOUNTS'),
  bankAccountController.createBankAccount
);

/**
 * @route   GET /api/bank-accounts/:account_id
 * @desc    Get a specific bank account by ID
 * @access  Private (SUPER_ADMIN, ACCOUNTS, COORDINATOR)
 */
router.get(
  '/:account_id',
  protect,
  restrictTo('SUPER_ADMIN', 'ACCOUNTS', 'COORDINATOR'),
  bankAccountController.getBankAccountById
);

/**
 * @route   PUT /api/bank-accounts/:account_id
 * @desc    Update a bank account
 * @access  Private (SUPER_ADMIN, ACCOUNTS)
 */
router.put(
  '/:account_id',
  protect,
  restrictTo('SUPER_ADMIN', 'ACCOUNTS'),
  bankAccountController.updateBankAccount
);

/**
 * @route   DELETE /api/bank-accounts/:account_id
 * @desc    Deactivate a bank account (soft delete)
 * @access  Private (SUPER_ADMIN, ACCOUNTS)
 */
router.delete(
  '/:account_id',
  protect,
  restrictTo('SUPER_ADMIN', 'ACCOUNTS'),
  bankAccountController.deactivateBankAccount
);

/**
 * @route   GET /api/bank-accounts/:account_id/transactions
 * @desc    Get all transactions for a specific bank account
 * @access  Private (SUPER_ADMIN, ACCOUNTS, COORDINATOR)
 * @query   start_date, end_date, status
 */
router.get(
  '/:account_id/transactions',
  protect,
  restrictTo('SUPER_ADMIN', 'ACCOUNTS', 'COORDINATOR'),
  bankAccountController.getAccountTransactions
);

/**
 * @route   PATCH /api/bank-accounts/:account_id/transactions/:transaction_id/verify
 * @desc    Mark a transaction as bank-verified/unverified (audit against bank statement)
 * @access  Private (SUPER_ADMIN only)
 * @body    verified: boolean
 */
router.patch(
  '/:account_id/transactions/:transaction_id/verify',
  protect,
  restrictTo('SUPER_ADMIN'),
  bankAccountController.verifyAccountTransaction
);

/**
 * @route   GET /api/bank-accounts/:account_id/reconciliation
 * @desc    Get reconciliation report for a bank account
 * @access  Private (SUPER_ADMIN, ACCOUNTS)
 */
router.get(
  '/:account_id/reconciliation',
  protect,
  restrictTo('SUPER_ADMIN', 'ACCOUNTS'),
  bankAccountController.getAccountReconciliation
);

module.exports = router;
