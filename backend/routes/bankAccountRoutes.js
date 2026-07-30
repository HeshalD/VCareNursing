const express = require('express');
const router = express.Router();
const bankAccountController = require('../controllers/bankAccountController');
const { protect, restrictTo, requirePermission } = require('../middleware/authMiddleware');

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
  requirePermission('VIEW_BANK_ACCOUNTS'),
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
  requirePermission('BANK_ACCOUNT_CREATE'),
  bankAccountController.createBankAccount
);

/**
 * @route   POST /api/bank-accounts/transfer
 * @desc    Transfer funds between two active bank accounts (including Petty Cash)
 * @access  Private (SUPER_ADMIN, ACCOUNTS)
 */
router.post(
  '/transfer',
  protect,
  requirePermission('BANK_ACCOUNT_TRANSFER'),
  bankAccountController.transferFunds
);

/**
 * @route   POST /api/bank-accounts/petty-cash/transactions
 * @desc    Record a manual CASH transaction against the Petty Cash account
 * @access  Private (SUPER_ADMIN, or any user granted PETTY_CASH_RECORD_TRANSACTION)
 */
router.post(
  '/petty-cash/transactions',
  protect,
  requirePermission('PETTY_CASH_RECORD_TRANSACTION'),
  bankAccountController.recordPettyCashTransaction
);

/**
 * @route   GET /api/bank-accounts/:account_id
 * @desc    Get a specific bank account by ID
 * @access  Private (SUPER_ADMIN, ACCOUNTS, COORDINATOR)
 */
router.get(
  '/:account_id',
  protect,
  requirePermission('VIEW_BANK_ACCOUNTS'),
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
  requirePermission('BANK_ACCOUNT_EDIT'),
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
  requirePermission('BANK_ACCOUNT_DEACTIVATE'),
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
  requirePermission('VIEW_BANK_ACCOUNTS'),
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
  requirePermission('BANK_TRANSACTION_VERIFY'),
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
  requirePermission('VIEW_BANK_ACCOUNTS'),
  bankAccountController.getAccountReconciliation
);

module.exports = router;
