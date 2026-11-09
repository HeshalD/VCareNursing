// Request-scoped "this payment is being taken at the frontdesk register" context.
//
// The payment endpoints (client payment, quotation payment, invoice payment, booking
// payment) are shared with the normal admin screens and create their receipt through
// services/receiptService.createPaymentReceipt, often after the HTTP response has been
// queued. Rather than thread a register argument through every one of them, the
// attachRegisterSession middleware runs the handler inside an AsyncLocalStorage scope
// and createPaymentReceipt reads the scope when it writes the receipt row. The receipt
// is the unit the register reconciles on (one receipt = one payment taken at the desk).

const { AsyncLocalStorage } = require('async_hooks');

const storage = new AsyncLocalStorage();

// Runs `fn` with the register session in scope for everything it awaits / schedules.
function runInRegisterScope(scope, fn) {
  return storage.run(scope, fn);
}

// { sessionId, cashierId } or null when the payment is not a register payment.
function getRegisterScope() {
  return storage.getStore() || null;
}

module.exports = { runInRegisterScope, getRegisterScope };
