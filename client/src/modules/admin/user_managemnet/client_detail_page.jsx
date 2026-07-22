import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import DateInput from '../../../components/common/DateInput';
import {
  ArrowLeft,
  ArrowRight,
  Activity,
  AlertCircle,
  ChevronDown,
  BadgeDollarSign,
  BookOpen,
  Briefcase,
  CalendarDays,
  ClipboardList,
  FileText,
  HeartPulse,
  Home,
  Loader2,
  MapPin,
  MessageCircle,
  Phone,
  Plus,
  ReceiptText,
  ShieldAlert,
  Star,
  Users,
  Wallet,
  Crown,
  Download,
  SendHorizontal,
  StickyNote,
  Pencil,
  Check,
  Trash2,
  X,
  Building2,
  Receipt,
  ArrowLeftRight,
  Upload,
  Package,
  RotateCcw,
} from 'lucide-react';

const NOTE_TYPE_META = {
  GENERAL: { label: 'General', classes: 'bg-gray-100 text-gray-700' },
  MEDICAL: { label: 'Medical', classes: 'bg-blue-100 text-blue-700' },
  BILLING: { label: 'Billing', classes: 'bg-amber-100 text-amber-700' },
  URGENT:  { label: 'Urgent',  classes: 'bg-red-100 text-red-700' },
};
import AdminLayout from '../components/AdminLayout';
import apiClient from '../../../api/api';
import { RefundDepositModal, ForfeitDepositModal } from '../products/ProductsPage';
import AdminDirectBookingDrawer from '../bookings/AdminDirectBookingDrawer';
import RegFeeDrawer from './RegFeeDrawer';
import CreateQuotationDrawer from './CreateQuotationDrawer';
import CreateProductInvoiceDrawer from './CreateProductInvoiceDrawer';
import RecordPaymentDrawer from './RecordPaymentDrawer';
import AddCareProfileDrawer from './AddCareProfileDrawer';
import { AddRequestDrawer as AddServiceRequestDrawer } from '../service_requests/proxy_service_request';

const money = new Intl.NumberFormat('en-LK', {
  style: 'currency',
  currency: 'LKR',
  maximumFractionDigits: 2,
});

const formatMoney = (value) => money.format(Number(value || 0));

// Mirrors backend quoteController.expandProductLineItemsForDisplay: a rental
// item's billing cadence (and specific unit, if chosen) is appended to its
// description, and its own deposit is shown as a separate line right after
// it — same shape the merged PDF and ModularQuoteBuilder's preview show.
const expandProductLineItems = (items) => {
  const out = [];
  for (const li of items || []) {
    if (li.rental_billing_type) {
      const billingLabel = li.rental_billing_type === 'RECURRING' ? 'Billed monthly' : 'One-time, fixed period';
      const unitLabel = li.unit_code ? ` — Unit ${li.unit_code}` : '';
      out.push({ ...li, description: `${li.description}${unitLabel} (${billingLabel})`, isProductItem: true });

      const depositAmt = parseFloat(li.deposit_amount) || 0;
      if (depositAmt > 0) {
        out.push({
          line_item_id: `${li.line_item_id}-deposit`,
          description: `Refundable Deposit for ${li.description} (fully refundable on return)`,
          quantity: 1,
          unit_price: depositAmt,
          amount: depositAmt,
          isProductItem: true,
        });
      }
    } else {
      out.push({ ...li, isProductItem: true });
    }
  }
  return out;
};

const TX_PAGE_SIZE = 10;


const formatDate = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
};

const formatDateTime = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};

const toDateInputValue = (value = new Date()) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
};

const addDays = (date, days) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

const SideNavItem = ({ active, icon: Icon, label, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-[13px] transition-all border-l-2 ${
      active
        ? 'border-blue-600 bg-blue-50 text-blue-700 font-semibold'
        : 'border-transparent text-gray-600 font-medium hover:bg-gray-50 hover:text-gray-900'
    }`}
  >
    <Icon className="h-4 w-4 shrink-0" />
    <span>{label}</span>
  </button>
);

const StatCard = ({ icon: Icon, label, value, tone = 'slate' }) => {
  const iconColor = {
    slate:   'text-gray-500',
    blue:    'text-blue-600',
    emerald: 'text-emerald-600',
    amber:   'text-amber-600',
    rose:    'text-rose-600',
    violet:  'text-violet-600',
  };
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon className={`h-4 w-4 ${iconColor[tone] || 'text-gray-500'}`} />
        <p className="text-[11px] font-medium uppercase tracking-wider text-gray-400">{label}</p>
      </div>
      <p className="text-xl font-semibold text-gray-900">{value}</p>
    </div>
  );
};

const InfoRow = ({ label, value }) => (
  <div>
    <p className="text-[11px] font-medium uppercase tracking-wider text-gray-400">{label}</p>
    <p className="mt-0.5 text-sm text-gray-800 font-medium">{value || '-'}</p>
  </div>
);

const ClientDetailPage = () => {
  const { clientId } = useParams();
  const navigate = useNavigate();

  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeSection, setActiveSection] = useState('overview');
  const [statementStartDate, setStatementStartDate] = useState(toDateInputValue(addDays(new Date(), -30)));
  const [statementEndDate, setStatementEndDate] = useState(toDateInputValue(new Date()));
  const [statementActionLoading, setStatementActionLoading] = useState('');
  const [clientTransactions, setClientTransactions] = useState([]);
  const [transactionsLoading, setTransactionsLoading] = useState(false);
  const [txPage, setTxPage] = useState(1);

  const [receipts, setReceipts] = useState([]);
  const [receiptsLoading, setReceiptsLoading] = useState(false);
  const [receiptBusy, setReceiptBusy] = useState('');
  const [showReceiptSendPopup, setShowReceiptSendPopup] = useState(false);
  const [receiptSendBusy, setReceiptSendBusy] = useState(false);

  const [notes, setNotes] = useState([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [noteType, setNoteType] = useState('GENERAL');
  const [noteSubmitting, setNoteSubmitting] = useState(false);
  const [noteError, setNoteError] = useState('');
  const [editingNoteId, setEditingNoteId] = useState(null);
  const [editNoteText, setEditNoteText] = useState('');
  const [editNoteType, setEditNoteType] = useState('GENERAL');

  const [bookingsPag, setBookingsPag] = useState(null);
  const [bookingsPagLoading, setBookingsPagLoading] = useState(false);
  const [activeBkPage, setActiveBkPage] = useState(1);
  const [recentBkPage, setRecentBkPage] = useState(1);
  const [bookingSearch, setBookingSearch] = useState('');

  const [showRecordPayment, setShowRecordPayment] = useState(false);
  const [sendingReviewId, setSendingReviewId] = useState(null);
  const [showDirectBooking, setShowDirectBooking] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const actionsDropdownRef = useRef(null);
  const [showRegFeeDrawer, setShowRegFeeDrawer] = useState(false);

  const [clientInvoices, setClientInvoices] = useState([]);
  const [invoicesLoading, setInvoicesLoading] = useState(false);
  const [invoiceStatusFilter, setInvoiceStatusFilter] = useState('');
  const [invoiceDateFrom, setInvoiceDateFrom] = useState('');
  const [invoiceDateTo, setInvoiceDateTo] = useState('');
  const [invoiceTypeView, setInvoiceTypeView] = useState('REG_FEE');
  const [quoteTypeView, setQuoteTypeView] = useState('SERVICE');
  const [invoiceActionBusyId, setInvoiceActionBusyId] = useState('');
  const [invoiceActionError, setInvoiceActionError] = useState('');

  const [regFeeInvoices, setRegFeeInvoices] = useState([]);
  const [regFeeInvoicesLoading, setRegFeeInvoicesLoading] = useState(false);

  const [combinedInvoices, setCombinedInvoices] = useState([]);
  const [combinedInvoicesLoading, setCombinedInvoicesLoading] = useState(false);

  const [productQuotes, setProductQuotes] = useState([]);
  const [productQuotesLoading, setProductQuotesLoading] = useState(false);
  const [productInvoices, setProductInvoices] = useState([]);
  const [productInvoicesLoading, setProductInvoicesLoading] = useState(false);
  const [rentedItems, setRentedItems] = useState([]);
  const [rentedItemsLoading, setRentedItemsLoading] = useState(false);
  const [productQuotePdfBusy, setProductQuotePdfBusy] = useState('');
  const [deposits, setDeposits] = useState([]);
  const [depositsLoading, setDepositsLoading] = useState(false);
  const [depositError, setDepositError] = useState('');
  const [forfeitDepositTarget, setForfeitDepositTarget] = useState(null);
  const [refundDepositTarget, setRefundDepositTarget] = useState(null);

  const [editingBilling, setEditingBilling] = useState(false);
  const [billingForm, setBillingForm] = useState({ company_name: '', honorific: '', display_name_source: 'FULL_NAME' });
  const [billingLoading, setBillingLoading] = useState(false);
  const [billingError, setBillingError] = useState('');

  const [editingProfile, setEditingProfile] = useState(false);
  const [profileForm, setProfileForm] = useState({ full_name: '', mobile_number: '', email: '', primary_address: '', gender: '' });
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [sentReviewIds, setSentReviewIds] = useState(new Set());

  const [quoteStatusBusy, setQuoteStatusBusy] = useState('');
  const [quotePdfBusy, setQuotePdfBusy] = useState('');
  const [showQuoteDrawer, setShowQuoteDrawer] = useState(false);
  const [editingQuoteId, setEditingQuoteId] = useState(null);
  const [showProductInvoiceDrawer, setShowProductInvoiceDrawer] = useState(false);
  const [showServiceRequestDrawer, setShowServiceRequestDrawer] = useState(false);

  // Per-quote line items (service quote's own + a companion PRODUCT quote's,
  // if one exists — see fetchQuoteLineItems / expandProductLineItems above).
  const [quoteItemsMap, setQuoteItemsMap] = useState({});
  const [quoteItemsLoading, setQuoteItemsLoading] = useState(false);

  const [regFeeLoading, setRegFeeLoading] = useState(false);
  const [regFeeError, setRegFeeError] = useState('');
  const [regFeeAmount, setRegFeeAmount] = useState('10000.00');
  const [selectedBankAccountId, setSelectedBankAccountId] = useState('');
  const [bankAccounts, setBankAccounts] = useState([]);
  const [bankAccountsLoading, setBankAccountsLoading] = useState(false);
  const [lastInvoicePdfUrl, setLastInvoicePdfUrl] = useState(null);
  const [uploadingRegFeeReceipt, setUploadingRegFeeReceipt] = useState(false);
  const regFeeReceiptInputRef = useRef(null);

  // Salesperson who brought/manages this client's registration (separate metric from booking crediting).
  const [salespersonsList, setSalespersonsList] = useState([]);
  const [clientSalesperson, setClientSalesperson] = useState(null); // { current, origin, history }
  const [salespersonForCredit, setSalespersonForCredit] = useState(''); // picked before Mark Paid / Verify Payment
  const [switchSalespersonId, setSwitchSalespersonId] = useState('');
  const [salespersonActionLoading, setSalespersonActionLoading] = useState(false);
  const [salespersonError, setSalespersonError] = useState('');

  const [showAddPatient, setShowAddPatient] = useState(false);
  const [linkedStaffProfileId, setLinkedStaffProfileId] = useState(null);

  const [deletePatientTarget, setDeletePatientTarget] = useState(null);
  const [deletePatientConfirmText, setDeletePatientConfirmText] = useState('');
  const [deletingPatient, setDeletingPatient] = useState(false);
  const [deletePatientError, setDeletePatientError] = useState('');

  const closeDeletePatientModal = () => {
    setDeletePatientTarget(null);
    setDeletePatientConfirmText('');
    setDeletePatientError('');
  };

  const handleDeletePatient = async () => {
    if (!deletePatientTarget) return;
    setDeletingPatient(true);
    setDeletePatientError('');
    try {
      await apiClient.deletePatient(deletePatientTarget.patient_id);
      const refreshed = await apiClient.getAdminClientDetail(clientId);
      setDetail(refreshed.data || null);
      closeDeletePatientModal();
    } catch (err) {
      setDeletePatientError(err.message || 'Failed to delete care profile');
    } finally {
      setDeletingPatient(false);
    }
  };

  useEffect(() => {
    const loadDetail = async () => {
      try {
        setLoading(true);
        setError('');
        const response = await apiClient.getAdminClientDetail(clientId);
        const data = response.data || null;
        setDetail(data);
        if (data?.client_profile) {
          setBillingForm({
            company_name: data.client_profile.company_name || '',
            honorific: data.client_profile.honorific || '',
          });
        }

        // This client may also hold a staff account (e.g. a caregiver who
        // registered as a client too) — check so we can offer a view switch.
        if (data?.client_profile?.user_id) {
          try {
            const staffRes = await apiClient.getStaffByUserID(data.client_profile.user_id);
            setLinkedStaffProfileId(staffRes?.data?.staff_profile_id || null);
          } catch {
            setLinkedStaffProfileId(null);
          }
        }
      } catch (err) {
        console.error('Error loading client detail:', err);
        setError(err.message || 'Failed to load client details');
      } finally {
        setLoading(false);
      }
    };

    const loadTransactions = async () => {
      try {
        setTransactionsLoading(true);
        const response = await apiClient.getClientTransactions(clientId);
        setClientTransactions(response.data || []);
      } catch (err) {
        console.error('Error loading client transactions:', err);
        setClientTransactions([]);
      } finally {
        setTransactionsLoading(false);
      }
    };

    const loadNotes = async () => {
      try {
        setNotesLoading(true);
        const response = await apiClient.getClientNotes(clientId);
        setNotes(response.data || []);
      } catch {
        // non-fatal
      } finally {
        setNotesLoading(false);
      }
    };

    const loadBankAccounts = async () => {
      try {
        setBankAccountsLoading(true);
        const res = await apiClient.getBankAccounts();
        const accounts = Array.isArray(res?.data) ? res.data : [];
        setBankAccounts(accounts.filter(a => a.is_active));
        if (accounts.length > 0) setSelectedBankAccountId(accounts[0].account_id);
      } catch {
        // non-fatal
      } finally {
        setBankAccountsLoading(false);
      }
    };

    const loadSalespersonInfo = async () => {
      try {
        const [listRes, currentRes] = await Promise.all([
          apiClient.getSalespersons(),
          apiClient.getClientSalesperson(clientId).catch(() => null),
        ]);
        setSalespersonsList(Array.isArray(listRes?.data) ? listRes.data : []);
        if (currentRes) setClientSalesperson(currentRes.data);
      } catch {
        // non-fatal
      }
    };

    if (clientId) {
      loadDetail();
      loadTransactions();
      loadNotes();
      fetchReceipts();
      loadBankAccounts();
      loadSalespersonInfo();
    }
  }, [clientId]);

  useEffect(() => { setTxPage(1); }, [clientTransactions]);

  const fetchClientInvoices = async ({ status = invoiceStatusFilter, date_from = invoiceDateFrom, date_to = invoiceDateTo } = {}) => {
    if (!clientId) return;
    try {
      setInvoicesLoading(true);
      const filters = {};
      if (status) filters.status = status;
      if (date_from) filters.date_from = date_from;
      if (date_to) filters.date_to = date_to;
      filters.limit = 200;
      const res = await apiClient.getClientInvoices(clientId, filters);
      setClientInvoices(Array.isArray(res?.data) ? res.data : []);
    } catch {
      // non-fatal
    } finally {
      setInvoicesLoading(false);
    }
  };

  const fetchRegFeeInvoices = async () => {
    if (!clientId) return;
    try {
      setRegFeeInvoicesLoading(true);
      const res = await apiClient.getClientRegFeeInvoices(clientId);
      setRegFeeInvoices(Array.isArray(res?.data) ? res.data : []);
    } catch {
      // non-fatal
    } finally {
      setRegFeeInvoicesLoading(false);
    }
  };

  const fetchCombinedInvoices = async () => {
    if (!clientId) return;
    try {
      setCombinedInvoicesLoading(true);
      const res = await apiClient.getCombinedInvoices({ client_id: clientId });
      setCombinedInvoices(Array.isArray(res?.data) ? res.data : []);
    } catch {
      // non-fatal
    } finally {
      setCombinedInvoicesLoading(false);
    }
  };

  const handleResendRegFeeInvoice = async (invoiceId) => {
    setInvoiceActionBusyId(invoiceId);
    setInvoiceActionError('');
    try {
      await apiClient.resendRegFeeInvoice(invoiceId);
      await fetchRegFeeInvoices();
    } catch (err) {
      setInvoiceActionError(err.message || 'Failed to resend invoice.');
    } finally {
      setInvoiceActionBusyId('');
    }
  };

  const handleDownloadDailyInvoice = async (inv) => {
    setInvoiceActionBusyId(inv.daily_invoice_id);
    setInvoiceActionError('');
    try {
      const blob = await apiClient.downloadDailyInvoicePdf(inv.daily_invoice_id);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Invoice_${inv.booking_code || inv.booking_id?.slice(0, 8)}_${inv.service_date}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setInvoiceActionError(err.message || 'Failed to download invoice PDF.');
    } finally {
      setInvoiceActionBusyId('');
    }
  };

  const handleResendDailyInvoice = async (inv) => {
    setInvoiceActionBusyId(inv.daily_invoice_id);
    setInvoiceActionError('');
    try {
      await apiClient.resendDailyInvoice(inv.daily_invoice_id);
      await fetchClientInvoices();
    } catch (err) {
      setInvoiceActionError(err.message || 'Failed to resend invoice.');
    } finally {
      setInvoiceActionBusyId('');
    }
  };

  const handleDownloadProductInvoice = async (inv) => {
    setInvoiceActionBusyId(inv.invoice_id);
    setInvoiceActionError('');
    try {
      const res = await apiClient.getProductInvoicePdf(inv.invoice_id);
      if (res?.pdf_url) window.open(res.pdf_url, '_blank', 'noopener');
    } catch (err) {
      setInvoiceActionError(err.message || 'Failed to generate invoice PDF.');
    } finally {
      setInvoiceActionBusyId('');
    }
  };

  const handleResendProductInvoice = async (inv) => {
    setInvoiceActionBusyId(inv.invoice_id);
    setInvoiceActionError('');
    try {
      await apiClient.resendProductInvoice(inv.invoice_id);
      await fetchProductInvoices();
    } catch (err) {
      setInvoiceActionError(err.message || 'Failed to resend invoice.');
    } finally {
      setInvoiceActionBusyId('');
    }
  };

  const handleResendCombinedInvoice = async (inv) => {
    setInvoiceActionBusyId(inv.quote_id);
    setInvoiceActionError('');
    try {
      await apiClient.sendCombinedInvoice(inv.quote_id);
      await fetchCombinedInvoices();
    } catch (err) {
      setInvoiceActionError(err.message || 'Failed to resend invoice.');
    } finally {
      setInvoiceActionBusyId('');
    }
  };

  const fetchProductQuotes = async () => {
    if (!clientId) return;
    try {
      setProductQuotesLoading(true);
      const res = await apiClient.getProductQuotes({ client_id: clientId });
      setProductQuotes(Array.isArray(res?.data) ? res.data : []);
    } catch {
      // non-fatal
    } finally {
      setProductQuotesLoading(false);
    }
  };

  const fetchProductInvoices = async () => {
    if (!clientId) return;
    try {
      setProductInvoicesLoading(true);
      const res = await apiClient.getProductInvoices({ client_id: clientId });
      setProductInvoices(Array.isArray(res?.data) ? res.data : []);
    } catch {
      // non-fatal
    } finally {
      setProductInvoicesLoading(false);
    }
  };

  const fetchRentedItems = async () => {
    if (!clientId) return;
    try {
      setRentedItemsLoading(true);
      const res = await apiClient.getRentalAgreements({ client_id: clientId, status: 'ACTIVE' });
      setRentedItems(Array.isArray(res?.data) ? res.data : []);
    } catch {
      // non-fatal
    } finally {
      setRentedItemsLoading(false);
    }
  };

  // Every refundable deposit ever held against this client — both per-rental
  // deposits (tied to a rental_agreement) and standalone deposits (a
  // DEPOSIT-type line item on a quote, independent of any rental item), in
  // every status (HELD/REFUNDED/FORFEITED), not just the currently-held ones
  // already summarized on the Currently Rented Items rows above.
  const fetchDeposits = async () => {
    if (!clientId) return;
    try {
      setDepositsLoading(true);
      const res = await apiClient.getDeposits({ client_id: clientId });
      setDeposits(Array.isArray(res?.data) ? res.data : []);
    } catch {
      // non-fatal
    } finally {
      setDepositsLoading(false);
    }
  };

  const handleDownloadProductQuotePdf = async (quoteId) => {
    setProductQuotePdfBusy(quoteId);
    try {
      const res = await apiClient.generateProductQuotePdf(quoteId);
      const url = res?.pdf_url || res?.data?.pdf_url;
      if (url) window.open(url, '_blank', 'noopener');
    } catch (err) {
      setError(err.message || 'Failed to generate quotation PDF');
    } finally {
      setProductQuotePdfBusy('');
    }
  };

  const fetchBookingsPag = async ({ active_page: ap = activeBkPage, recent_page: rp = recentBkPage, search: s = bookingSearch } = {}) => {
    if (!clientId) return;
    try {
      setBookingsPagLoading(true);
      const response = await apiClient.getAdminClientBookingsPaginated(clientId, { active_page: ap, recent_page: rp, search: s });
      setBookingsPag(response);
    } catch {
      // non-fatal
    } finally {
      setBookingsPagLoading(false);
    }
  };

  // Line items aren't included in the quote summary the client-detail
  // endpoint returns — fetch each quotation's own detail, plus its companion
  // PRODUCT quote's items (products/rentals added via ModularQuoteBuilder's
  // Products & Rentals section, linked via quotations.linked_quote_id — see
  // clientController.getAdminClientDetail), so the Quotes tab can show every
  // line item and the true combined total, matching what's actually sent.
  const fetchQuoteLineItems = async () => {
    if (recentQuotes.length === 0) return;
    try {
      setQuoteItemsLoading(true);
      const entries = await Promise.all(
        recentQuotes.map(async (q) => {
          try {
            const detail = await apiClient.getQuoteWithLineItems(q.quote_id);
            const line_items = Array.isArray(detail?.data?.line_items) ? detail.data.line_items : [];
            let product_line_items = [];
            let product_total = 0;
            if (q.product_quote_id) {
              try {
                const productDetail = await apiClient.getProductQuote(q.product_quote_id);
                product_line_items = expandProductLineItems(productDetail?.data?.line_items);
                product_total = product_line_items.reduce((s, li) => s + (parseFloat(li.amount) || 0), 0);
              } catch { /* non-critical */ }
            }
            return [q.quote_id, {
              line_items,
              product_line_items,
              product_total,
              combined_total: Number(q.total_amount || 0) + product_total,
            }];
          } catch {
            return [q.quote_id, { line_items: [], product_line_items: [], product_total: 0, combined_total: Number(q.total_amount || 0) }];
          }
        })
      );
      setQuoteItemsMap(Object.fromEntries(entries));
    } finally {
      setQuoteItemsLoading(false);
    }
  };

  useEffect(() => {
    if (activeSection === 'bookings') fetchBookingsPag();
    if (activeSection === 'invoices') { fetchClientInvoices(); fetchRegFeeInvoices(); fetchProductInvoices(); fetchCombinedInvoices(); }
    if (activeSection === 'products') { fetchProductInvoices(); fetchRentedItems(); fetchDeposits(); }
    if (activeSection === 'quotes') { fetchQuoteLineItems(); fetchProductQuotes(); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSection]);

  useEffect(() => {
    if (!actionsOpen) return;
    const handleClickOutside = (e) => {
      if (actionsDropdownRef.current && !actionsDropdownRef.current.contains(e.target)) {
        setActionsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [actionsOpen]);

  const handleAddNote = async () => {
    if (!noteText.trim()) return;
    try {
      setNoteSubmitting(true);
      setNoteError('');
      const response = await apiClient.addClientNote(clientId, { note_text: noteText, note_type: noteType });
      setNotes((prev) => [response.data, ...prev]);
      setNoteText('');
      setNoteType('GENERAL');
    } catch (err) {
      setNoteError(err.message || 'Failed to add note');
    } finally {
      setNoteSubmitting(false);
    }
  };

  const handleDeleteNote = async (noteId) => {
    try {
      setNoteError('');
      await apiClient.deleteClientNote(clientId, noteId);
      setNotes((prev) => prev.filter((n) => n.note_id !== noteId));
    } catch (err) {
      setNoteError(err.message || 'Failed to delete note');
    }
  };

  const startEdit = (note) => {
    setEditingNoteId(note.note_id);
    setEditNoteText(note.note_text);
    setEditNoteType(note.note_type || 'GENERAL');
  };

  const cancelEdit = () => {
    setEditingNoteId(null);
    setEditNoteText('');
    setEditNoteType('GENERAL');
  };

  const handleSaveEdit = async (noteId) => {
    if (!editNoteText.trim()) return;
    try {
      setNoteError('');
      const response = await apiClient.updateClientNote(clientId, noteId, {
        note_text: editNoteText,
        note_type: editNoteType,
      });
      setNotes((prev) => prev.map((n) => (n.note_id === noteId ? response.data : n)));
      cancelEdit();
    } catch (err) {
      setNoteError(err.message || 'Failed to update note');
    }
  };

  const saveBilling = async () => {
    setBillingLoading(true);
    setBillingError('');
    try {
      const res = await apiClient.updateClientBilling(clientId, billingForm);
      setDetail((prev) => ({
        ...prev,
        client_profile: { ...prev.client_profile, ...res.data },
      }));
      setEditingBilling(false);
    } catch (err) {
      setBillingError(err.message || 'Failed to save billing details');
    } finally {
      setBillingLoading(false);
    }
  };

  const openEditProfile = () => {
    setProfileForm({
      full_name: clientProfile.full_name || '',
      mobile_number: clientProfile.mobile_number || '',
      email: clientProfile.email || '',
      primary_address: clientProfile.primary_address || '',
      gender: clientProfile.gender || '',
    });
    setProfileError('');
    setEditingProfile(true);
  };

  const saveProfile = async () => {
    if (!profileForm.full_name.trim()) { setProfileError('Full name is required.'); return; }
    if (!/^0\d{9}$/.test(profileForm.mobile_number.trim())) { setProfileError('Enter a valid 10-digit mobile number.'); return; }
    setProfileLoading(true);
    setProfileError('');
    try {
      const res = await apiClient.updateClientProfile(clientId, profileForm);
      setDetail((prev) => ({
        ...prev,
        client_profile: { ...prev.client_profile, ...res.data },
      }));
      setEditingProfile(false);
    } catch (err) {
      setProfileError(err.message || 'Failed to save client details');
    } finally {
      setProfileLoading(false);
    }
  };

  const handleSendRegFeeInvoice = async () => {
    if (!selectedBankAccountId) { setRegFeeError('Please select a bank account.'); return; }
    setRegFeeLoading(true);
    setRegFeeError('');
    try {
      const res = await apiClient.sendRegFeeInvoice(clientId, { amount: regFeeAmount, bank_account_id: selectedBankAccountId });
      if (res.data?.invoice_pdf_url) setLastInvoicePdfUrl(res.data.invoice_pdf_url);
      setDetail((prev) => ({
        ...prev,
        client_profile: { ...prev.client_profile, ...res.data },
      }));
      fetchRegFeeInvoices();
    } catch (err) {
      setRegFeeError(err.message || 'Failed to send registration fee invoice.');
    } finally {
      setRegFeeLoading(false);
    }
  };

  // Marking the registration fee PAID also records a transaction server-side —
  // refresh the client detail (payment summary) and transaction list so the
  // new "Payments Made By Client" total and ledger row show up immediately.
  const refreshAfterPaymentChange = async () => {
    try {
      const [refreshed, txRefreshed] = await Promise.all([
        apiClient.getAdminClientDetail(clientId),
        apiClient.getClientTransactions(clientId),
      ]);
      setDetail(refreshed.data || null);
      setClientTransactions(txRefreshed.data || []);
      fetchRegFeeInvoices();
    } catch {
      // non-fatal — the reg_fee_status change itself already succeeded
    }
  };

  const reloadClientSalesperson = async () => {
    try {
      const res = await apiClient.getClientSalesperson(clientId);
      setClientSalesperson(res.data);
    } catch {
      // non-fatal
    }
  };

  const handleRegFeeStatusUpdate = async (status) => {
    setRegFeeLoading(true);
    setRegFeeError('');
    try {
      await apiClient.updateRegFeeStatus(clientId, status, status === 'PAID' ? (salespersonForCredit || null) : null);
      await refreshAfterPaymentChange();
      if (status === 'PAID' && salespersonForCredit) await reloadClientSalesperson();
    } catch (err) {
      setRegFeeError(err.message || 'Failed to update registration fee status.');
    } finally {
      setRegFeeLoading(false);
    }
  };

  const handleVerifyRegFeePayment = async () => {
    setRegFeeLoading(true);
    setRegFeeError('');
    try {
      await apiClient.verifyRegFeePayment(clientId, salespersonForCredit || null);
      await refreshAfterPaymentChange();
      if (salespersonForCredit) await reloadClientSalesperson();
    } catch (err) {
      setRegFeeError(err.message || 'Failed to verify registration fee payment.');
    } finally {
      setRegFeeLoading(false);
    }
  };

  const handleSwitchClientSalesperson = async () => {
    if (!switchSalespersonId) return;
    setSalespersonActionLoading(true);
    setSalespersonError('');
    try {
      await apiClient.switchClientSalesperson(clientId, switchSalespersonId);
      setSwitchSalespersonId('');
      await reloadClientSalesperson();
    } catch (err) {
      setSalespersonError(err.message || 'Failed to switch salesperson.');
    } finally {
      setSalespersonActionLoading(false);
    }
  };

  const handleAdminUploadRegFeeReceipt = async (file) => {
    if (!file) return;
    setUploadingRegFeeReceipt(true);
    setRegFeeError('');
    try {
      await apiClient.adminUploadRegFeeReceipt(clientId, file);
      await refreshAfterPaymentChange();
    } catch (err) {
      setRegFeeError(err.message || 'Failed to upload registration fee receipt.');
    } finally {
      setUploadingRegFeeReceipt(false);
      if (regFeeReceiptInputRef.current) regFeeReceiptInputRef.current.value = '';
    }
  };

  const clientProfile = detail?.client_profile || {};
  const paymentSummary = detail?.payment_summary || {};
  const bookingSummary = detail?.booking_summary || {};
  const quotationSummary = detail?.quotation_summary || {};
  const staffSummary = detail?.staff_summary || {};
  const reviewSummary = detail?.review_summary || {};
  const patientSummary = detail?.patient_summary || {};
  const statementSummary = detail?.statement_summary || {};
  const overdueSummary = detail?.overdue_summary || {};
  const recentActivity = detail?.recent_activity || {};

  // The client's chosen "bill to" name — company name if they've opted into
  // company billing, else their own full name. Mirrors the backend CASE
  // expression used to resolve display_name_source across quotes/invoices.
  const billedToName = clientProfile.display_name_source === 'COMPANY_NAME' && clientProfile.company_name
    ? clientProfile.company_name
    : (clientProfile.full_name || '-');

  const activeBookings = useMemo(() => recentActivity.bookings || [], [recentActivity.bookings]);
  const recentQuotes = useMemo(() => recentActivity.quotations || [], [recentActivity.quotations]);
  const recentAssignments = useMemo(() => recentActivity.staff_assignments || [], [recentActivity.staff_assignments]);
  const recentReviews = useMemo(() => recentActivity.reviews || [], [recentActivity.reviews]);
  const patients = Array.isArray(patientSummary.data) ? patientSummary.data : [];

  const statementDateRange = useMemo(() => ({
    start_date: statementStartDate,
    end_date: statementEndDate,
  }), [statementStartDate, statementEndDate]);

  const downloadStatement = async () => {
    try {
      setStatementActionLoading('download');
      const blob = await apiClient.downloadClientStatement(clientId, statementDateRange);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Statement_${(clientProfile.full_name || 'client').replace(/\s+/g, '_')}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (downloadError) {
      console.error('Error downloading statement:', downloadError);
      setError(downloadError.message || 'Failed to download statement');
    } finally {
      setStatementActionLoading('');
    }
  };

  const sendStatementToWhatsApp = async () => {
    try {
      setStatementActionLoading('whatsapp');
      await apiClient.sendClientStatementToWhatsApp(clientId, statementDateRange);
    } catch (sendError) {
      console.error('Error sending statement to WhatsApp:', sendError);
      setError(sendError.message || 'Failed to send statement via WhatsApp');
    } finally {
      setStatementActionLoading('');
    }
  };

  const fetchReceipts = async () => {
    try {
      setReceiptsLoading(true);
      const res = await apiClient.getClientReceipts(clientId);
      setReceipts(Array.isArray(res?.receipts) ? res.receipts : []);
    } catch {
      // non-fatal
    } finally {
      setReceiptsLoading(false);
    }
  };

  const handleSendReceipt = async (receiptId) => {
    try {
      setReceiptBusy(receiptId);
      setError('');
      await apiClient.sendPaymentReceipt(receiptId);
      await fetchReceipts();
    } catch (err) {
      setError(err.message || 'Failed to send receipt');
    } finally {
      setReceiptBusy('');
    }
  };

  const handlePaymentRecorded = async () => {
    setShowRecordPayment(false);
    setShowReceiptSendPopup(true);
    try {
      const [refreshed, txRefreshed] = await Promise.all([
        apiClient.getAdminClientDetail(clientId),
        apiClient.getClientTransactions(clientId),
      ]);
      setDetail(refreshed.data || null);
      setClientTransactions(txRefreshed.data || []);
      await fetchReceipts();
      setTimeout(fetchReceipts, 2500);
    } catch {
      // non-fatal
    }
  };

  const handleSendLatestReceipt = async () => {
    setReceiptSendBusy(true);
    try {
      const res = await apiClient.getClientReceipts(clientId);
      const fresh = Array.isArray(res?.receipts) ? res.receipts : [];
      setReceipts(fresh);
      const latest = fresh[0];
      if (latest) {
        await apiClient.sendPaymentReceipt(latest.receipt_id);
        const res2 = await apiClient.getClientReceipts(clientId);
        setReceipts(Array.isArray(res2?.receipts) ? res2.receipts : []);
      }
      setShowReceiptSendPopup(false);
    } catch (err) {
      setError(err.message || 'Failed to send receipt');
      setShowReceiptSendPopup(false);
    } finally {
      setReceiptSendBusy(false);
    }
  };

  const handleQuoteStatusUpdate = async (quoteId, status) => {
    setQuoteStatusBusy(quoteId);
    try {
      await apiClient.updateQuoteStatus(quoteId, status);
      // Optimistically update the local quote list
      const refreshed = await apiClient.getAdminClientDetail(clientId);
      setDetail(refreshed.data || null);
    } catch (err) {
      setError(err.message || 'Failed to update quotation status');
    } finally {
      setQuoteStatusBusy('');
    }
  };

  // productQuoteId folds the companion PRODUCT quote's items (products/
  // rentals added via ModularQuoteBuilder's Products & Rentals section) into
  // this same PDF server-side (see quoteController.mergeProductQuoteIntoData)
  // — without it, only the service quote's own charges would be included.
  const handleDownloadQuotePdf = async (quoteId, estimateNumber, productQuoteId) => {
    setQuotePdfBusy(quoteId);
    try {
      const res = await apiClient.generateQuotePdf(quoteId, productQuoteId);
      const url = res?.pdf_url || res?.data?.pdf_url;
      if (url) {
        const link = document.createElement('a');
        link.href = url;
        link.download = `${estimateNumber || 'Quotation'}.pdf`;
        link.target = '_blank';
        link.rel = 'noreferrer';
        document.body.appendChild(link);
        link.click();
        link.remove();
      }
    } catch (err) {
      setError(err.message || 'Failed to generate quotation PDF');
    } finally {
      setQuotePdfBusy('');
    }
  };

  const handleSendReviewRequest = async (bookingId) => {
    setSendingReviewId(bookingId);
    try {
      await apiClient.sendReviewRequest(bookingId);
      setSentReviewIds((prev) => new Set([...prev, bookingId]));
    } catch (err) {
      setError(err.message || 'Failed to send review request');
    } finally {
      setSendingReviewId(null);
    }
  };

  const sectionConfig = [
    { id: 'overview',  label: 'Overview',      icon: Users },
    { id: 'payments',  label: 'Payments',       icon: BadgeDollarSign },
    { id: 'bookings',  label: 'Bookings',       icon: CalendarDays },
    { id: 'invoices',  label: 'Invoices',       icon: Receipt },
    { id: 'quotes',    label: 'Quotes',         icon: FileText },
    { id: 'products',  label: 'Products',       icon: Package },
    { id: 'staff',     label: 'Staff',          icon: Briefcase },
    { id: 'reviews',   label: 'Reviews',        icon: Star },
    { id: 'patients',  label: 'Care Profiles',  icon: HeartPulse },
    { id: 'notes',     label: 'Notes',          icon: StickyNote },
    { id: 'statement', label: 'Statement',      icon: ReceiptText },
    { id: 'overdue',   label: 'Overdue',        icon: ShieldAlert },
  ];

  const overdueAmount = Number(overdueSummary.total_overdue_amount || 0);
  const isOverdue = overdueAmount < 0;
  const overdueDisplayValue = isOverdue ? formatMoney(Math.abs(overdueAmount)) : formatMoney(0);
  const overdueTone = isOverdue ? 'rose' : 'emerald';

  const topStats = [
    { icon: BadgeDollarSign, label: 'Payments Made By Client',         value: formatMoney(paymentSummary.total_paid),               tone: 'emerald' },
    { icon: Wallet,          label: 'Invoiced Amount', value: formatMoney(statementSummary.total_invoiced),          tone: 'blue' },
    { icon: ShieldAlert,     label: 'Overdue Amount',                   value: overdueDisplayValue,                                  tone: overdueTone },
    { icon: CalendarDays,    label: 'Bookings',                         value: bookingSummary.total_bookings || 0,                   tone: 'violet' },
    { icon: Wallet,          label: 'Wallet Balance',                   value: formatMoney(clientProfile.wallet_balance),            tone: 'amber' },
  ];

  const transactionSummary = detail?.transaction_summary || {};

  const renderSection = () => {
    switch (activeSection) {
      case 'payments':
        return receiptsLoading && receipts.length === 0 ? (
          <div className="flex items-center gap-2 py-10 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading payments...
          </div>
        ) : receipts.length === 0 ? (
          <EmptyState title="No payments recorded yet" />
        ) : (
          <SectionList>
            {receipts.map((rcpt, index) => {
              const busy = receiptBusy === rcpt.receipt_id;
              const items = Array.isArray(rcpt.line_items) ? rcpt.line_items : [];
              return (
                <ExpandableRow
                  key={rcpt.receipt_id || index}
                  summary={
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
                      <span className="font-semibold text-gray-900 text-sm">{rcpt.receipt_code}</span>
                      <span className="font-bold text-gray-800 text-sm">{formatMoney(rcpt.total_amount)}</span>
                      {rcpt.whatsapp_sent ? (
                        <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200">
                          <Check className="h-3 w-3" /> Sent
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-500">Not sent</span>
                      )}
                      {rcpt.payment_method && <span className="text-sm text-gray-500">{rcpt.payment_method.replace(/_/g, ' ')}</span>}
                      <span className="text-xs text-gray-400">{formatDateTime(rcpt.payment_date || rcpt.created_at)}</span>
                    </div>
                  }
                >
                  <div className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      <InfoRow label="Billed To" value={rcpt.received_from || billedToName} />
                      <InfoRow label="Receipt No." value={rcpt.receipt_code} />
                      <InfoRow label="Date" value={formatDateTime(rcpt.payment_date || rcpt.created_at)} />
                      <InfoRow label="Amount" value={formatMoney(rcpt.total_amount)} />
                      <InfoRow label="Method" value={(rcpt.payment_method || '-').replace(/_/g, ' ')} />
                      <InfoRow label="Reference" value={rcpt.reference_number || '-'} />
                      <InfoRow label="Delivery" value={rcpt.whatsapp_sent ? `Sent ${formatDateTime(rcpt.whatsapp_sent_at)}` : 'Not sent'} />
                    </div>

                    {items.length > 0 && (
                      <div className="overflow-hidden rounded-md border border-gray-200">
                        <div className="bg-gray-50 px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Payment for</div>
                        {items.map((it, i) => (
                          <div key={i} className="flex items-center justify-between border-t border-gray-100 px-4 py-2.5">
                            <div>
                              <div className="text-sm font-medium text-gray-800">{it.label}</div>
                              {it.description && <div className="text-xs text-gray-500">{it.description}</div>}
                            </div>
                            <div className="text-sm font-semibold text-gray-700">{formatMoney(it.amount)}</div>
                          </div>
                        ))}
                      </div>
                    )}

                    {rcpt.send_error && (
                      <p className="text-xs text-red-600">Last WhatsApp send failed â€” try sending again.</p>
                    )}

                    <div className="flex flex-wrap items-center gap-2">
                      {rcpt.pdf_url ? (
                        <a
                          href={rcpt.pdf_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 rounded border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                        >
                          <Download className="h-3.5 w-3.5" /> Download Receipt
                        </a>
                      ) : (
                        <span className="text-xs text-amber-600">Receipt PDF generatingâ€¦</span>
                      )}
                      <button
                        type="button"
                        onClick={() => handleSendReceipt(rcpt.receipt_id)}
                        disabled={busy || !clientProfile.mobile_number}
                        title={!clientProfile.mobile_number ? 'Client has no mobile number on record' : 'Send receipt via WhatsApp'}
                        className="inline-flex items-center gap-1.5 rounded bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <MessageCircle className="h-3.5 w-3.5" />
                        {busy ? 'Sendingâ€¦' : rcpt.whatsapp_sent ? 'Resend Receipt' : 'Send Receipt'}
                      </button>
                    </div>
                  </div>
                </ExpandableRow>
              );
            })}
          </SectionList>
        );

      case 'bookings': {
        if (bookingsPagLoading) {
          return (
            <div className="flex items-center gap-2 py-10 text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading bookings...
            </div>
          );
        }

        const renderBookingRow = (booking, index, { showSwapStaff = false } = {}) => {
          const bookingEnd = booking.actual_end_time || booking.scheduled_end_time;
          const bookingDays = booking.start_date
            ? Math.max(1, Math.ceil((new Date(bookingEnd || new Date()) - new Date(booking.start_date)) / 86400000))
            : null;
          return (
            <ExpandableRow
              key={booking.booking_id || index}
              summary={
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
                  <span className="font-semibold text-gray-900 text-sm">{booking.service_type || 'Booking'}</span>
                  <StatusBadge status={booking.status} />
                  <span className="text-sm text-gray-500">{formatDate(booking.start_date)}</span>
                  <span className="text-sm text-gray-500">{booking.current_staff_name || 'No staff assigned'}</span>
                  <span className="font-semibold text-gray-700 text-sm">{formatMoney(booking.amount_quotated || booking.total_amount || 0)}</span>
                  {booking.is_reviewed ? (
                    <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200">
                      <Check className="h-3 w-3" /> Reviewed
                    </span>
                  ) : ['COMPLETED', 'TERMINATED'].includes((booking.status || '').toUpperCase()) ? (
                    <span className="inline-flex items-center rounded bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700 ring-1 ring-inset ring-amber-200">
                      Not Reviewed
                    </span>
                  ) : null}
                </div>
              }
            >
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <InfoRow label="Booking ID" value={booking.booking_id} />
                <InfoRow label="Status" value={booking.status || '-'} />
                <InfoRow label="Service Model" value={booking.service_model || '-'} />
                <InfoRow label="Start Date" value={formatDate(booking.start_date)} />
                <InfoRow label="Patient" value={booking.patient_name || '-'} />
                <InfoRow label="Assigned Staff" value={booking.current_staff_name || 'Not assigned'} />
                <InfoRow label="Quoted Amount" value={formatMoney(booking.amount_quotated || booking.total_amount || 0)} />
                <InfoRow label="Paid" value={formatMoney(booking.amount_paid || 0)} />
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wider text-gray-400">Days Worked</p>
                  <div className="mt-1">
                    {bookingDays !== null ? (
                      <span className="inline-flex items-center gap-1 rounded bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 ring-1 ring-inset ring-blue-100">
                        {bookingDays} {bookingDays === 1 ? 'day' : 'days'}
                        {!bookingEnd && <span className="text-blue-400"> (ongoing)</span>}
                      </span>
                    ) : (
                      <span className="text-sm font-medium text-gray-400">-</span>
                    )}
                  </div>
                </div>
              </div>
              {booking.booking_id && (
                <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-gray-100 pt-4">
                  <button
                    type="button"
                    onClick={() => navigate(`/admin/bookings/${booking.booking_id}/detail`)}
                    className="inline-flex items-center gap-1.5 rounded border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                  >
                    <ArrowRight className="h-3.5 w-3.5" /> View Booking
                  </button>
                  {showSwapStaff && (
                    <button
                      type="button"
                      onClick={() => navigate(`/admin/bookings/${booking.booking_id}/detail?section=staff`)}
                      className="inline-flex items-center gap-1.5 rounded bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-700"
                    >
                      <ArrowRight className="h-3.5 w-3.5" /> Swap Staff Member
                    </button>
                  )}
                  {!['TERMINATED', 'COMPLETED', 'CANCELLED'].includes((booking.status || '').toUpperCase()) && (
                    <button
                      type="button"
                      onClick={() => navigate(`/admin/bookings/${booking.booking_id}/detail?section=actions`)}
                      className="inline-flex items-center gap-1.5 rounded bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700"
                    >
                      <ArrowRight className="h-3.5 w-3.5" /> End Booking
                    </button>
                  )}
                  {['TERMINATED', 'COMPLETED'].includes((booking.status || '').toUpperCase()) && !booking.is_reviewed && (
                    sentReviewIds.has(booking.booking_id) ? (
                      <span className="inline-flex items-center gap-1.5 rounded bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200">
                        <Check className="h-3.5 w-3.5" /> Review request sent
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleSendReviewRequest(booking.booking_id)}
                        disabled={sendingReviewId === booking.booking_id || !clientProfile.mobile_number}
                        title={!clientProfile.mobile_number ? 'Client has no mobile number on record' : 'Send WhatsApp review request'}
                        className="inline-flex items-center gap-1.5 rounded bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <MessageCircle className="h-3.5 w-3.5" />
                        {sendingReviewId === booking.booking_id ? 'Sendingâ€¦' : 'Send Review Request'}
                      </button>
                    )
                  )}
                </div>
              )}
            </ExpandableRow>
          );
        };

        const renderPager = ({ total, page, total_pages }, onPrev, onNext) => (
          total_pages > 1 && (
            <div className="flex items-center justify-between border-t border-gray-100 px-4 py-3">
              <p className="text-xs text-gray-500">
                Page {page} of {total_pages} &middot; {total} total
              </p>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={onPrev}
                  disabled={page === 1}
                  className="inline-flex items-center gap-1 rounded border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ArrowLeft className="h-3.5 w-3.5" /> Prev
                </button>
                <button
                  type="button"
                  onClick={onNext}
                  disabled={page === total_pages}
                  className="inline-flex items-center gap-1 rounded border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Next <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )
        );

        const activePag = bookingsPag?.active_bookings;
        const recentPag = bookingsPag?.recent_bookings;

        return (
          <div className="space-y-6">
            {/* Header row with New Booking button */}
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-gray-700">Bookings</h3>
              <button
                type="button"
                onClick={() => setShowDirectBooking(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
              >
                <Plus className="h-3.5 w-3.5" />
                New Booking
              </button>
            </div>
            {/* Search */}
            <div className="relative">
              <input
                type="text"
                value={bookingSearch}
                onChange={(e) => {
                  const s = e.target.value;
                  setBookingSearch(s);
                  setActiveBkPage(1);
                  setRecentBkPage(1);
                  fetchBookingsPag({ active_page: 1, recent_page: 1, search: s });
                }}
                placeholder="Search by ID, service, patient, or staff..."
                className="w-full rounded-md border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
              <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              {bookingSearch && (
                <button
                  type="button"
                  onClick={() => {
                    setBookingSearch('');
                    setActiveBkPage(1);
                    setRecentBkPage(1);
                    fetchBookingsPag({ active_page: 1, recent_page: 1, search: '' });
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {/* Active bookings */}
            <div>
              <div className="mb-3 flex items-center gap-2">
                <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                <h3 className="text-[13px] font-semibold text-gray-800">Active Bookings</h3>
                {activePag && <span className="text-xs text-gray-400">({activePag.total} total)</span>}
              </div>
              {!activePag || activePag.total === 0 ? (
                <EmptyState title="No active bookings" />
              ) : (
                <div className="overflow-hidden rounded-md border border-gray-200 bg-white divide-y divide-gray-100">
                  {activePag.data.map((b, i) => renderBookingRow(b, i, { showSwapStaff: true }))}
                  {renderPager(
                    activePag,
                    () => { const p = activeBkPage - 1; setActiveBkPage(p); fetchBookingsPag({ active_page: p, recent_page: recentBkPage }); },
                    () => { const p = activeBkPage + 1; setActiveBkPage(p); fetchBookingsPag({ active_page: p, recent_page: recentBkPage }); },
                  )}
                </div>
              )}
            </div>

            {/* Recent / past bookings */}
            <div>
              <div className="mb-3 flex items-center gap-2">
                <span className="inline-flex h-2 w-2 rounded-full bg-gray-400" />
                <h3 className="text-[13px] font-semibold text-gray-800">Recent Bookings</h3>
                {recentPag && <span className="text-xs text-gray-400">({recentPag.total} total)</span>}
              </div>
              {!recentPag || recentPag.total === 0 ? (
                <EmptyState title="No past bookings" />
              ) : (
                <div className="overflow-hidden rounded-md border border-gray-200 bg-white divide-y divide-gray-100">
                  {recentPag.data.map((b, i) => renderBookingRow(b, i, { showSwapStaff: false }))}
                  {renderPager(
                    recentPag,
                    () => { const p = recentBkPage - 1; setRecentBkPage(p); fetchBookingsPag({ active_page: activeBkPage, recent_page: p }); },
                    () => { const p = recentBkPage + 1; setRecentBkPage(p); fetchBookingsPag({ active_page: activeBkPage, recent_page: p }); },
                  )}
                </div>
              )}
            </div>
          </div>
        );
      }

      case 'invoices': {
        const INVOICE_STATUS_COLORS = {
          APPROVED: 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200',
          REJECTED: 'bg-red-50 text-red-700 ring-1 ring-inset ring-red-200',
          PENDING:  'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200',
        };
        const hasInvoiceFilter = invoiceStatusFilter || invoiceDateFrom || invoiceDateTo;
        const REG_FEE_INVOICE_STATUS_COLORS = {
          SENT: 'bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-200',
          PAID: 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200',
        };
        const PRODUCT_INVOICE_STATUS_COLORS = {
          PENDING: 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200',
          PAID:    'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200',
        };
        const INVOICE_TYPE_TABS = [
          { id: 'REG_FEE',   label: 'Registration Fee', count: regFeeInvoices.length },
          { id: 'DAILY',     label: 'Daily Invoices',    count: clientInvoices.length },
          { id: 'PRODUCT',   label: 'Product Invoices',  count: productInvoices.length },
          { id: 'COMBINED',  label: 'Combined Invoices', count: combinedInvoices.length },
        ];
        const invoicesRefreshing = regFeeInvoicesLoading || invoicesLoading || productInvoicesLoading || combinedInvoicesLoading;
        return (
          <div className="space-y-6">
            {/* Invoice type toggle */}
            <div className="flex items-center justify-between gap-3">
              <div className="inline-flex rounded-md border border-gray-200 bg-gray-50 p-1">
                {INVOICE_TYPE_TABS.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setInvoiceTypeView(tab.id)}
                    className={`inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-semibold transition-colors ${
                      invoiceTypeView === tab.id
                        ? 'bg-white text-gray-900 shadow-sm ring-1 ring-inset ring-gray-200'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {tab.label}
                    <span className={`rounded-full px-1.5 text-[10px] ${invoiceTypeView === tab.id ? 'bg-gray-100 text-gray-600' : 'bg-gray-200 text-gray-500'}`}>
                      {tab.count}
                    </span>
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => { fetchClientInvoices(); fetchRegFeeInvoices(); fetchProductInvoices(); fetchCombinedInvoices(); }}
                disabled={invoicesRefreshing}
                className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-60"
              >
                {invoicesRefreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                Refresh
              </button>
            </div>

            {invoiceActionError && (
              <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {invoiceActionError}
              </div>
            )}

            {/* Registration Fee Invoices */}
            {invoiceTypeView === 'REG_FEE' && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Registration Fee Invoices</h3>
              {regFeeInvoicesLoading ? (
                <div className="flex items-center gap-2 py-6 text-sm text-gray-500">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading registration fee invoicesâ€¦
                </div>
              ) : regFeeInvoices.length === 0 ? (
                <EmptyState title="No registration fee invoices sent yet" />
              ) : (
                <div className="overflow-x-auto rounded-md border border-gray-200">
                  <table className="min-w-full divide-y divide-gray-100 text-sm">
                    <thead className="bg-gray-50 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                      <tr>
                        <th className="px-4 py-3 text-left">Date Sent</th>
                        <th className="px-4 py-3 text-left">Invoice Code</th>
                        <th className="px-4 py-3 text-left">Billed To</th>
                        <th className="px-4 py-3 text-left">Bank Account</th>
                        <th className="px-4 py-3 text-left">Status</th>
                        <th className="px-4 py-3 text-right">Amount</th>
                        <th className="px-4 py-3 text-left">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 bg-white">
                      {regFeeInvoices.map((inv) => {
                        const busy = invoiceActionBusyId === inv.invoice_id;
                        return (
                        <tr key={inv.invoice_id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3 font-medium text-gray-800 whitespace-nowrap">{formatDateTime(inv.created_at)}</td>
                          <td className="px-4 py-3 font-mono text-xs text-gray-600">{inv.invoice_code}</td>
                          <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{inv.billed_to_name || '-'}</td>
                          <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                            {[inv.bank_account_nickname, inv.bank_name].filter(Boolean).join(' â€” ') || 'â€”'}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${REG_FEE_INVOICE_STATUS_COLORS[inv.status] || 'bg-gray-100 text-gray-600'}`}>
                              {inv.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right font-semibold text-gray-800 whitespace-nowrap">{formatMoney(inv.amount)}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5">
                              <a
                                href={inv.pdf_url}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1.5 rounded border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                              >
                                <Download className="h-3.5 w-3.5" /> Download
                              </a>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => handleResendRegFeeInvoice(inv.invoice_id)}
                                title="Resend invoice via WhatsApp"
                                className="inline-flex items-center gap-1.5 rounded bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MessageCircle className="h-3.5 w-3.5" />}
                                Resend
                              </button>
                            </div>
                          </td>
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            )}

            {/* Daily Invoices */}
            {invoiceTypeView === 'DAILY' && (
            <div className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-700">Daily Invoices</h3>
            {/* Filters */}
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="block text-[11px] font-medium text-gray-500 mb-1">Status</label>
                <select
                  value={invoiceStatusFilter}
                  onChange={(e) => setInvoiceStatusFilter(e.target.value)}
                  className="rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                >
                  <option value="">All statuses</option>
                  <option value="APPROVED">Approved</option>
                  <option value="REJECTED">Rejected</option>
                  <option value="PENDING">Pending</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-gray-500 mb-1">From</label>
                <DateInput
                  value={invoiceDateFrom}
                  onChange={(e) => setInvoiceDateFrom(e.target.value)}
                  className="rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-gray-500 mb-1">To</label>
                <DateInput
                  value={invoiceDateTo}
                  onChange={(e) => setInvoiceDateTo(e.target.value)}
                  className="rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </div>
              <div className="flex items-end gap-2">
                <button
                  type="button"
                  onClick={() => fetchClientInvoices()}
                  className="inline-flex items-center gap-1 rounded bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
                >
                  Apply
                </button>
                {hasInvoiceFilter && (
                  <button
                    type="button"
                    onClick={() => {
                      setInvoiceStatusFilter('');
                      setInvoiceDateFrom('');
                      setInvoiceDateTo('');
                      fetchClientInvoices({ status: '', date_from: '', date_to: '' });
                    }}
                    className="inline-flex items-center gap-1 rounded border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-50"
                  >
                    <X className="h-3.5 w-3.5" /> Clear
                  </button>
                )}
              </div>
            </div>

            {invoicesLoading ? (
              <div className="flex items-center gap-2 py-10 text-sm text-gray-500">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading invoicesâ€¦
              </div>
            ) : clientInvoices.length === 0 ? (
              <EmptyState title="No invoices found" />
            ) : (
              <div className="overflow-x-auto rounded-md border border-gray-200">
                <table className="min-w-full divide-y divide-gray-100 text-sm">
                  <thead className="bg-gray-50 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                    <tr>
                      <th className="px-4 py-3 text-left">Date</th>
                      <th className="px-4 py-3 text-left">Billed To</th>
                      <th className="px-4 py-3 text-left">Booking</th>
                      <th className="px-4 py-3 text-left">Shift</th>
                      <th className="px-4 py-3 text-left">Status</th>
                      <th className="px-4 py-3 text-right">Amount</th>
                      <th className="px-4 py-3 text-left">Decided By</th>
                      <th className="px-4 py-3 text-left">Notes</th>
                      <th className="px-4 py-3 text-left">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 bg-white">
                    {clientInvoices.map((inv) => {
                      const busy = invoiceActionBusyId === inv.daily_invoice_id;
                      return (
                      <tr key={inv.daily_invoice_id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 font-medium text-gray-800 whitespace-nowrap">{formatDate(inv.service_date)}</td>
                        <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{inv.client_name || '-'}</td>
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            onClick={() => navigate(`/admin/bookings/${inv.booking_id}/detail`)}
                            className="text-blue-600 hover:underline font-medium"
                          >
                            {inv.booking_code || inv.booking_id?.slice(0, 8)}
                          </button>
                          {inv.service_type && <span className="ml-1.5 text-gray-400 text-xs">({inv.service_type})</span>}
                        </td>
                        <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                          {inv.shift_label || (inv.shift_number ? `Shift ${inv.shift_number}` : 'â€”')}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${INVOICE_STATUS_COLORS[inv.status] || 'bg-gray-100 text-gray-600'}`}>
                            {inv.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-gray-800 whitespace-nowrap">
                          {inv.amount != null ? formatMoney(inv.amount) : 'â€”'}
                        </td>
                        <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                          {inv.decided_by_name || 'â€”'}
                          {inv.decided_at && <span className="block text-[11px] text-gray-400">{formatDate(inv.decided_at)}</span>}
                        </td>
                        <td className="px-4 py-3 text-gray-500 max-w-[180px] truncate">{inv.notes || 'â€”'}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => handleDownloadDailyInvoice(inv)}
                              title="Download invoice PDF"
                              className="inline-flex items-center gap-1.5 rounded border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => handleResendDailyInvoice(inv)}
                              title="Resend invoice via WhatsApp"
                              className="inline-flex items-center gap-1.5 rounded bg-green-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MessageCircle className="h-3.5 w-3.5" />}
                            </button>
                          </div>
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            </div>
            )}

            {/* Product Invoices */}
            {invoiceTypeView === 'PRODUCT' && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Product Invoices</h3>
              {productInvoicesLoading ? (
                <div className="flex items-center gap-2 py-6 text-sm text-gray-500">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading product invoicesâ€¦
                </div>
              ) : productInvoices.length === 0 ? (
                <EmptyState title="No product invoices found" />
              ) : (
                <div className="overflow-x-auto rounded-md border border-gray-200">
                  <table className="min-w-full divide-y divide-gray-100 text-sm">
                    <thead className="bg-gray-50 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                      <tr>
                        <th className="px-4 py-3 text-left">Invoice Code</th>
                        <th className="px-4 py-3 text-left">Billed To</th>
                        <th className="px-4 py-3 text-left">Category</th>
                        <th className="px-4 py-3 text-left">Status</th>
                        <th className="px-4 py-3 text-right">Amount</th>
                        <th className="px-4 py-3 text-left">Created</th>
                        <th className="px-4 py-3 text-left">Paid</th>
                        <th className="px-4 py-3 text-left">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 bg-white">
                      {productInvoices.map((inv) => {
                        const busy = invoiceActionBusyId === inv.invoice_id;
                        return (
                        <tr key={inv.invoice_id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3 font-mono text-xs text-gray-600 whitespace-nowrap">{inv.invoice_code}</td>
                          <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{inv.client_name || inv.walk_in_name || '-'}</td>
                          <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{inv.category}</td>
                          <td className="px-4 py-3">
                            <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${PRODUCT_INVOICE_STATUS_COLORS[inv.status] || 'bg-gray-100 text-gray-600'}`}>
                              {inv.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right font-semibold text-gray-800 whitespace-nowrap">{formatMoney(inv.amount)}</td>
                          <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{formatDate(inv.created_at)}</td>
                          <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{inv.paid_at ? formatDate(inv.paid_at) : '—'}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => handleDownloadProductInvoice(inv)}
                                title="Download invoice PDF"
                                className="inline-flex items-center gap-1.5 rounded border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                              </button>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => handleResendProductInvoice(inv)}
                                title="Resend invoice via WhatsApp"
                                className="inline-flex items-center gap-1.5 rounded bg-green-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MessageCircle className="h-3.5 w-3.5" />}
                              </button>
                            </div>
                          </td>
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="mt-2 text-[11px] text-gray-400">Payments are recorded from the Products page.</p>
            </div>
            )}

            {/* Combined Invoices */}
            {invoiceTypeView === 'COMBINED' && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Combined Invoices</h3>
              <p className="mb-3 text-[11px] text-gray-400">
                Auto-generated the first time a payment is recorded against a service quotation (registration fee + shift/daily charges, plus any linked product quote).
              </p>
              {combinedInvoicesLoading ? (
                <div className="flex items-center gap-2 py-6 text-sm text-gray-500">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading combined invoices…
                </div>
              ) : combinedInvoices.length === 0 ? (
                <EmptyState title="No combined invoices generated yet" />
              ) : (
                <div className="overflow-x-auto rounded-md border border-gray-200">
                  <table className="min-w-full divide-y divide-gray-100 text-sm">
                    <thead className="bg-gray-50 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                      <tr>
                        <th className="px-4 py-3 text-left">Generated</th>
                        <th className="px-4 py-3 text-left">Invoice Code</th>
                        <th className="px-4 py-3 text-left">Billed To</th>
                        <th className="px-4 py-3 text-left">Estimate No.</th>
                        <th className="px-4 py-3 text-right">Amount</th>
                        <th className="px-4 py-3 text-left">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 bg-white">
                      {combinedInvoices.map((inv) => {
                        const busy = invoiceActionBusyId === inv.quote_id;
                        return (
                        <tr key={inv.quote_id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3 font-medium text-gray-800 whitespace-nowrap">{formatDateTime(inv.invoice_generated_at)}</td>
                          <td className="px-4 py-3 font-mono text-xs text-gray-600">{inv.invoice_code}</td>
                          <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{inv.billed_to_name || inv.payer_name || '-'}</td>
                          <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{inv.estimate_number || '—'}</td>
                          <td className="px-4 py-3 text-right font-semibold text-gray-800 whitespace-nowrap">{formatMoney(inv.total_amount)}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5">
                              <a
                                href={inv.invoice_pdf_url}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1.5 rounded border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                              >
                                <Download className="h-3.5 w-3.5" /> Download
                              </a>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => handleResendCombinedInvoice(inv)}
                                title="Resend invoice via WhatsApp"
                                className="inline-flex items-center gap-1.5 rounded bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MessageCircle className="h-3.5 w-3.5" />}
                                Resend
                              </button>
                            </div>
                          </td>
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            )}
          </div>
        );
      }

      case 'quotes': {
        const PRODUCT_QUOTE_STATUS_COLORS = {
          SENT:     'bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-200',
          ACCEPTED: 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200',
          REJECTED: 'bg-red-50 text-red-700 ring-1 ring-inset ring-red-200',
        };
        const QUOTE_TYPE_TABS = [
          { id: 'SERVICE', label: 'Service Quotes', count: recentQuotes.length },
          { id: 'PRODUCT', label: 'Product Quotes',  count: productQuotes.length },
        ];
        return (
          <div className="space-y-6">
            {/* Quote type toggle */}
            <div className="inline-flex rounded-md border border-gray-200 bg-gray-50 p-1">
              {QUOTE_TYPE_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setQuoteTypeView(tab.id)}
                  className={`inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-semibold transition-colors ${
                    quoteTypeView === tab.id
                      ? 'bg-white text-gray-900 shadow-sm ring-1 ring-inset ring-gray-200'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {tab.label}
                  <span className={`rounded-full px-1.5 text-[10px] ${quoteTypeView === tab.id ? 'bg-gray-100 text-gray-600' : 'bg-gray-200 text-gray-500'}`}>
                    {tab.count}
                  </span>
                </button>
              ))}
            </div>

            {quoteTypeView === 'PRODUCT' && (
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Product Quotations</h3>
                {productQuotesLoading ? (
                  <div className="flex items-center gap-2 py-6 text-sm text-gray-500">
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading product quotations…
                  </div>
                ) : productQuotes.length === 0 ? (
                  <EmptyState title="No product quotations found" />
                ) : (
                  <div className="overflow-x-auto rounded-md border border-gray-200">
                    <table className="min-w-full divide-y divide-gray-100 text-sm">
                      <thead className="bg-gray-50 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                        <tr>
                          <th className="px-4 py-3 text-left">Estimate No.</th>
                          <th className="px-4 py-3 text-left">Billed To</th>
                          <th className="px-4 py-3 text-left">Status</th>
                          <th className="px-4 py-3 text-right">Total</th>
                          <th className="px-4 py-3 text-right">Deposit</th>
                          <th className="px-4 py-3 text-left">Created</th>
                          <th className="px-4 py-3 text-left">Download</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 bg-white">
                        {productQuotes.map((q) => (
                          <tr key={q.quote_id} className="hover:bg-gray-50 transition-colors">
                            <td className="px-4 py-3 font-semibold text-gray-900 whitespace-nowrap">{q.estimate_number}</td>
                            <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{q.client_name || q.walk_in_name || '-'}</td>
                            <td className="px-4 py-3">
                              <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${PRODUCT_QUOTE_STATUS_COLORS[q.status] || 'bg-gray-100 text-gray-600'}`}>
                                {q.status}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right font-semibold text-gray-800 whitespace-nowrap">{formatMoney(q.total_amount)}</td>
                            <td className="px-4 py-3 text-right text-gray-600 whitespace-nowrap">
                              {Number(q.total_deposit_amount || 0) > 0 ? formatMoney(q.total_deposit_amount) : '—'}
                            </td>
                            <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{formatDate(q.created_at)}</td>
                            <td className="px-4 py-3">
                              <button
                                type="button"
                                onClick={() => handleDownloadProductQuotePdf(q.quote_id)}
                                disabled={productQuotePdfBusy === q.quote_id}
                                className="inline-flex items-center gap-1.5 rounded border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-60"
                              >
                                {productQuotePdfBusy === q.quote_id
                                  ? <Loader2 className="h-3 w-3 animate-spin" />
                                  : <Download className="h-3 w-3" />}
                                Download
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {quoteTypeView === 'SERVICE' && (
            recentQuotes.length === 0 ? (
          <EmptyState title="No quotations found" />
        ) : (
          <SectionList>
            {recentQuotes.map((quote, index) => {
              const hasPaid = Number(quote.total_paid || 0) > 0;
              const effectiveStatus = hasPaid ? 'ACCEPTED' : (quote.status || 'SENT');
              const isBusy = quoteStatusBusy === quote.quote_id;
              const canAction = !hasPaid && !['ACCEPTED', 'REJECTED'].includes(quote.status);
              const quoteItems = quoteItemsMap[quote.quote_id];
              const combinedTotal = quoteItems ? quoteItems.combined_total : Number(quote.total_amount || 0);
              const allItems = quoteItems ? [...quoteItems.line_items, ...quoteItems.product_line_items] : [];

              return (
                <ExpandableRow
                  key={quote.quote_id || index}
                  summary={
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
                      <span className="font-semibold text-gray-900 text-sm">{quote.estimate_number || 'Quotation'}</span>
                      <StatusBadge status={effectiveStatus} />
                      <span className="font-bold text-gray-800 text-sm">{formatMoney(combinedTotal)}</span>
                      {quote.qty_days && <span className="text-sm text-gray-500">{quote.qty_days} days</span>}
                      {quote.service_request_code && (
                        <span className="text-xs text-gray-400 font-mono">{quote.service_request_code}</span>
                      )}
                      {quote.booking_code && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); navigate(`/admin/bookings/${quote.booking_id}/detail`); }}
                          className="inline-flex items-center gap-1 rounded bg-violet-50 px-2 py-0.5 text-xs font-semibold text-violet-700 hover:bg-violet-100 ring-1 ring-inset ring-violet-200"
                        >
                          {quote.booking_code}
                        </button>
                      )}
                    </div>
                  }
                >
                  <div className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      <InfoRow label="Billed To" value={quote.billed_to_name || quote.payer_name || '-'} />
                      <InfoRow label="Estimate No." value={quote.estimate_number || '-'} />
                      <InfoRow label="Service Request" value={quote.service_request_code || quote.request_id || '-'} />
                      <InfoRow label="Booking" value={quote.booking_code || 'â€”'} />
                      <InfoRow label="Status" value={effectiveStatus} />
                      <InfoRow label="Total Amount" value={formatMoney(combinedTotal)} />
                      <InfoRow label="Amount Paid" value={formatMoney(quote.total_paid)} />
                      <InfoRow label="Daily Rate" value={formatMoney(quote.daily_rate)} />
                      <InfoRow label="Days" value={quote.qty_days || '-'} />
                      <InfoRow label="Patient" value={quote.patient_name || '-'} />
                      <InfoRow label="Service Type" value={quote.service_type || '-'} />
                      <InfoRow label="Estimate Date" value={formatDate(quote.estimate_date)} />
                      <InfoRow label="Created" value={formatDate(quote.created_at)} />
                    </div>

                    {/* Quotation items — the service quote's own charges/discounts,
                        plus a companion PRODUCT quote's items (products/rentals/
                        deposits added via ModularQuoteBuilder), if one exists. These
                        are two separate quotation records merged into one PDF/message
                        when sent (see quoteController.mergeProductQuoteIntoData). */}
                    {quoteItemsLoading && !quoteItems ? (
                      <div className="flex items-center gap-2 border-t border-gray-100 pt-4 text-xs text-gray-400">
                        <Loader2 className="h-3 w-3 animate-spin" /> Loading line items…
                      </div>
                    ) : allItems.length > 0 && (
                      <div className="border-t border-gray-100 pt-4">
                        <div className="overflow-x-auto rounded-md border border-gray-200">
                          <table className="min-w-full divide-y divide-gray-100 text-xs">
                            <thead className="bg-gray-50 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                              <tr>
                                <th className="px-3 py-2 text-left">Item &amp; Description</th>
                                <th className="px-3 py-2 text-right w-16">Qty</th>
                                <th className="px-3 py-2 text-right w-24">Rate</th>
                                <th className="px-3 py-2 text-right w-28">Amount</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 bg-white">
                              {allItems.map((li) => {
                                const isDiscount = li.item_type === 'DISCOUNT';
                                const amount = Math.abs(parseFloat(li.amount) || 0);
                                return (
                                  <tr key={li.line_item_id}>
                                    <td className={`px-3 py-2 ${li.isProductItem ? 'text-purple-700' : 'text-gray-700'}`}>
                                      {li.description}
                                      {isDiscount && <span className="ml-1.5 text-[10px] text-gray-400">(Discount)</span>}
                                    </td>
                                    <td className="px-3 py-2 text-right text-gray-500 tabular-nums">{parseFloat(li.quantity) || 1}</td>
                                    <td className="px-3 py-2 text-right text-gray-500 tabular-nums">{formatMoney(li.unit_price)}</td>
                                    <td className={`px-3 py-2 text-right font-medium tabular-nums ${isDiscount ? 'text-red-600' : li.isProductItem ? 'text-purple-800' : 'text-gray-800'}`}>
                                      {isDiscount ? `(${formatMoney(amount)})` : formatMoney(amount)}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {canAction && (
                      <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 pt-4">
                        <span className="text-xs text-gray-500 mr-1">No payment recorded â€”</span>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleQuoteStatusUpdate(quote.quote_id, 'ACCEPTED')}
                          className="inline-flex items-center gap-1.5 rounded border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-60"
                        >
                          {isBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                          Mark as Accepted
                        </button>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleQuoteStatusUpdate(quote.quote_id, 'REJECTED')}
                          className="inline-flex items-center gap-1.5 rounded border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-100 disabled:opacity-60"
                        >
                          {isBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
                          Mark as Rejected
                        </button>
                      </div>
                    )}

                    {!canAction && quote.status === 'REJECTED' && (
                      <div className="flex items-center gap-2 border-t border-gray-100 pt-4">
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleQuoteStatusUpdate(quote.quote_id, 'SENT')}
                          className="inline-flex items-center gap-1.5 rounded border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-60"
                        >
                          {isBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                          Reset to Pending
                        </button>
                      </div>
                    )}

                    <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 pt-4">
                      <button
                        type="button"
                        onClick={() => handleDownloadQuotePdf(quote.quote_id, quote.estimate_number, quote.product_quote_id)}
                        disabled={quotePdfBusy === quote.quote_id}
                        className="inline-flex items-center gap-1.5 rounded border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-60"
                      >
                        {quotePdfBusy === quote.quote_id
                          ? <Loader2 className="h-3 w-3 animate-spin" />
                          : <Download className="h-3 w-3" />}
                        {quotePdfBusy === quote.quote_id ? 'Generatingâ€¦' : 'Download PDF'}
                      </button>
                      <button
                        type="button"
                        onClick={() => { setEditingQuoteId(quote.quote_id); setShowQuoteDrawer(true); }}
                        className="inline-flex items-center gap-1.5 rounded border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
                      >
                        <Pencil className="h-3 w-3" /> Edit Line Items
                      </button>
                    </div>
                  </div>
                </ExpandableRow>
              );
            })}
          </SectionList>
            )
            )}
          </div>
        );
      }

      case 'products': {
        const PRODUCT_INVOICE_STATUS_COLORS = {
          PENDING: 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200',
          PAID:    'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200',
        };
        const DEPOSIT_STATUS_COLORS = {
          HELD:               'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200',
          REFUNDED:           'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200',
          PARTIALLY_REFUNDED: 'bg-violet-50 text-violet-700 ring-1 ring-inset ring-violet-200',
          FORFEITED:          'bg-red-50 text-red-700 ring-1 ring-inset ring-red-200',
        };
        return (
          <div className="space-y-6">
            {invoiceActionError && (
              <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {invoiceActionError}
              </div>
            )}

            {/* Product Invoices */}
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Product Invoices</h3>
              {productInvoicesLoading ? (
                <div className="flex items-center gap-2 py-6 text-sm text-gray-500">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading product invoices…
                </div>
              ) : productInvoices.length === 0 ? (
                <EmptyState title="No product invoices found" />
              ) : (
                <div className="overflow-x-auto rounded-md border border-gray-200">
                  <table className="min-w-full divide-y divide-gray-100 text-sm">
                    <thead className="bg-gray-50 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                      <tr>
                        <th className="px-4 py-3 text-left">Invoice Code</th>
                        <th className="px-4 py-3 text-left">Billed To</th>
                        <th className="px-4 py-3 text-left">Category</th>
                        <th className="px-4 py-3 text-left">Status</th>
                        <th className="px-4 py-3 text-right">Amount</th>
                        <th className="px-4 py-3 text-left">Created</th>
                        <th className="px-4 py-3 text-left">Paid</th>
                        <th className="px-4 py-3 text-left">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 bg-white">
                      {productInvoices.map((inv) => {
                        const busy = invoiceActionBusyId === inv.invoice_id;
                        return (
                        <tr key={inv.invoice_id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3 font-mono text-xs text-gray-600 whitespace-nowrap">{inv.invoice_code}</td>
                          <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{inv.client_name || inv.walk_in_name || '-'}</td>
                          <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{inv.category}</td>
                          <td className="px-4 py-3">
                            <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${PRODUCT_INVOICE_STATUS_COLORS[inv.status] || 'bg-gray-100 text-gray-600'}`}>
                              {inv.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right font-semibold text-gray-800 whitespace-nowrap">{formatMoney(inv.amount)}</td>
                          <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{formatDate(inv.created_at)}</td>
                          <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{inv.paid_at ? formatDate(inv.paid_at) : '—'}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => handleDownloadProductInvoice(inv)}
                                title="Download invoice PDF"
                                className="inline-flex items-center gap-1.5 rounded border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                              </button>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => handleResendProductInvoice(inv)}
                                title="Resend invoice via WhatsApp"
                                className="inline-flex items-center gap-1.5 rounded bg-green-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MessageCircle className="h-3.5 w-3.5" />}
                              </button>
                            </div>
                          </td>
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="mt-2 text-[11px] text-gray-400">Payments are recorded from the Products page.</p>
            </div>

            {/* Currently Rented Items */}
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Currently Rented Items</h3>
              {rentedItemsLoading ? (
                <div className="flex items-center gap-2 py-6 text-sm text-gray-500">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading rented items…
                </div>
              ) : rentedItems.length === 0 ? (
                <EmptyState title="No items currently rented" />
              ) : (
                <div className="overflow-x-auto rounded-md border border-gray-200">
                  <table className="min-w-full divide-y divide-gray-100 text-sm">
                    <thead className="bg-gray-50 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                      <tr>
                        <th className="px-4 py-3 text-left">Product</th>
                        <th className="px-4 py-3 text-left">Item Code</th>
                        <th className="px-4 py-3 text-left">Billing</th>
                        <th className="px-4 py-3 text-right">Rate</th>
                        <th className="px-4 py-3 text-left">Start Date</th>
                        <th className="px-4 py-3 text-left">End Date</th>
                        <th className="px-4 py-3 text-left">Deposit</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 bg-white">
                      {rentedItems.map((ra) => (
                        <tr key={ra.rental_agreement_id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3 font-semibold text-gray-900 whitespace-nowrap">{ra.product_name}</td>
                          <td className="px-4 py-3 font-mono text-xs text-gray-600 whitespace-nowrap">{ra.unit_code}</td>
                          <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                            {ra.billing_type === 'RECURRING' ? 'Monthly' : 'One-time'}
                          </td>
                          <td className="px-4 py-3 text-right font-semibold text-gray-800 whitespace-nowrap">{formatMoney(ra.rate)}</td>
                          <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{formatDate(ra.start_date)}</td>
                          <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{ra.end_date ? formatDate(ra.end_date) : '—'}</td>
                          <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                            {ra.deposit_status
                              ? <span className="rounded px-1.5 py-0.5 text-[11px] font-semibold bg-purple-50 text-purple-700 ring-1 ring-inset ring-purple-200">{ra.deposit_status} · {formatMoney(ra.deposit_collected_amount)}</span>
                              : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Refundable Deposits — every deposit ever held against this
                client, in any status, both per-rental (tied to a rental_agreement)
                and standalone (a DEPOSIT-type line item on a quote, independent
                of any rental item). Unlike the Deposit column on Currently
                Rented Items above (which only shows the currently-held state
                for active rentals), this covers the full history. */}
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Refundable Deposits</h3>
              {depositError && (
                <div className="mb-3 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {depositError}
                </div>
              )}
              {depositsLoading ? (
                <div className="flex items-center gap-2 py-6 text-sm text-gray-500">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading deposits…
                </div>
              ) : deposits.length === 0 ? (
                <EmptyState title="No deposits held for this client" />
              ) : (
                <div className="overflow-x-auto rounded-md border border-gray-200">
                  <table className="min-w-full divide-y divide-gray-100 text-sm">
                    <thead className="bg-gray-50 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                      <tr>
                        <th className="px-4 py-3 text-left">Held Since</th>
                        <th className="px-4 py-3 text-left">Product / Description</th>
                        <th className="px-4 py-3 text-right">Amount</th>
                        <th className="px-4 py-3 text-left">Status</th>
                        <th className="px-4 py-3 text-left">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 bg-white">
                      {deposits.map((d) => (
                          <tr key={d.deposit_id} className="hover:bg-gray-50 transition-colors">
                            <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{formatDate(d.held_at)}</td>
                            <td className="px-4 py-3">
                              {d.product_name ? (
                                <>
                                  <span className="font-semibold text-gray-900">{d.product_name}</span>
                                  <span className="block text-[11px] text-gray-400">{d.unit_code || '—'}</span>
                                </>
                              ) : (
                                <>
                                  <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-semibold text-amber-700">General Deposit</span>
                                  <span className="block text-[11px] text-gray-400">{d.description || '—'}{d.estimate_number ? ` · ${d.estimate_number}` : ''}</span>
                                </>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right font-semibold text-gray-800 whitespace-nowrap">{formatMoney(d.amount)}</td>
                            <td className="px-4 py-3">
                              <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${DEPOSIT_STATUS_COLORS[d.status] || 'bg-gray-100 text-gray-600'}`}>
                                {d.status}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              {d.status === 'HELD' ? (
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => setRefundDepositTarget(d)}
                                    className="inline-flex items-center gap-1 rounded bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-700"
                                  >
                                    <RotateCcw className="h-3 w-3" /> Refund
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setForfeitDepositTarget(d)}
                                    className="inline-flex items-center gap-1 rounded border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-600 hover:bg-red-100"
                                  >
                                    Forfeit
                                  </button>
                                </div>
                              ) : d.status === 'REFUNDED' ? (
                                <span className="text-emerald-600 text-xs font-medium">Refunded {formatDate(d.refunded_at)}</span>
                              ) : d.status === 'PARTIALLY_REFUNDED' ? (
                                <span className="text-violet-600 text-xs font-medium">
                                  Refunded {formatMoney(d.refunded_amount)}, kept {formatMoney(d.forfeited_amount)}
                                </span>
                              ) : (
                                <span className="text-gray-400 text-xs">Forfeited{d.notes ? ` — ${d.notes}` : ''}</span>
                              )}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {forfeitDepositTarget && (
              <ForfeitDepositModal
                deposit={forfeitDepositTarget}
                onClose={() => setForfeitDepositTarget(null)}
                onForfeited={() => { setForfeitDepositTarget(null); fetchDeposits(); }}
              />
            )}

            {refundDepositTarget && (
              <RefundDepositModal
                deposit={refundDepositTarget}
                onClose={() => setRefundDepositTarget(null)}
                onRefunded={() => { setRefundDepositTarget(null); fetchDeposits(); }}
              />
            )}
          </div>
        );
      }

      case 'staff':
        return recentAssignments.length === 0 ? (
          <EmptyState title="No staff assignment history" />
        ) : (
          <SectionList>
            {recentAssignments.map((assignment, index) => {
              const assignStart = assignment.service_start_date;
              const assignEnd = assignment.service_end_date;
              const assignDays = assignStart
                ? Math.max(1, Math.ceil((new Date(assignEnd || new Date()) - new Date(assignStart)) / 86400000))
                : null;
              return (
                <ExpandableRow
                  key={assignment.assignment_id || index}
                  summary={
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
                      <span className="font-semibold text-gray-900 text-sm">{assignment.staff_name || 'Staff'}</span>
                      {assignment.designation && <span className="text-sm text-gray-500">{assignment.designation}</span>}
                      <StatusBadge status={assignment.status} />
                      <span className="text-sm text-gray-500">{formatMoney(assignment.daily_rate)}/day</span>
                      {assignDays !== null && (
                        <span className="text-xs text-gray-400">{assignDays} {assignDays === 1 ? 'day' : 'days'}{!assignEnd ? ' (ongoing)' : ''}</span>
                      )}
                    </div>
                  }
                >
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <InfoRow label="Staff" value={assignment.staff_name || '-'} />
                    <InfoRow label="Designation" value={assignment.designation || '-'} />
                    <InfoRow label="Patient" value={assignment.patient_name || '-'} />
                    <InfoRow label="Status" value={assignment.status || '-'} />
                    <InfoRow label="Assigned On" value={formatDateTime(assignment.assigned_on)} />
                    <InfoRow label="Daily Rate" value={formatMoney(assignment.daily_rate)} />
                    <div>
                      <p className="text-[11px] font-medium uppercase tracking-wider text-gray-400">Days Worked</p>
                      <div className="mt-1">
                        {assignDays !== null ? (
                          <span className="inline-flex items-center gap-1 rounded bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 ring-1 ring-inset ring-blue-100">
                            {assignDays} {assignDays === 1 ? 'day' : 'days'}
                            {!assignEnd && <span className="text-blue-400"> (ongoing)</span>}
                          </span>
                        ) : (
                          <span className="text-sm font-medium text-gray-400">-</span>
                        )}
                      </div>
                    </div>
                  </div>
                </ExpandableRow>
              );
            })}
          </SectionList>
        );

      case 'reviews':
        return (
          <div className="space-y-5">
            {reviewSummary.total_reviews ? (
              <div className="grid gap-4 md:grid-cols-3">
                <StatCard icon={Star}     label="Average Rating" value={reviewSummary.average_rating || 0} tone="amber" />
                <StatCard icon={Users}    label="Total Reviews"  value={reviewSummary.total_reviews || 0}  tone="violet" />
                <StatCard icon={Activity} label="Rating Spread"  value={Object.keys(reviewSummary.rating_distribution || {}).length || 0} tone="slate" />
              </div>
            ) : null}
            {recentReviews.length === 0 ? (
              <EmptyState title="No reviews yet" />
            ) : (
              <SectionList>
                {recentReviews.map((review, index) => (
                  <ExpandableRow
                    key={review.review_id || index}
                    summary={
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
                        <span className="font-semibold text-gray-900 text-sm">{review.staff_name || 'Review'}</span>
                        <span className="flex items-center gap-1">
                          <Star className="h-3.5 w-3.5 fill-amber-400 stroke-amber-400" />
                          <span className="font-bold text-gray-900 text-sm">{review.rating}</span>
                        </span>
                        <span className={`text-xs font-medium ${review.is_visible ? 'text-emerald-600' : 'text-gray-400'}`}>
                          {review.is_visible ? 'Visible' : 'Hidden'}
                        </span>
                      </div>
                    }
                  >
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      <InfoRow label="Staff"   value={review.staff_name || '-'} />
                      <InfoRow label="Rating"  value={review.rating || '-'} />
                      <InfoRow label="Visible" value={review.is_visible ? 'Yes' : 'No'} />
                      <div className="sm:col-span-2 lg:col-span-3">
                        <InfoRow label="Comment" value={review.review_text || '-'} />
                      </div>
                    </div>
                  </ExpandableRow>
                ))}
              </SectionList>
            )}
          </div>
        );

      case 'patients':
        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-500">{patients.length} care profile{patients.length !== 1 ? 's' : ''} registered</p>
              <button
                type="button"
                onClick={() => setShowAddPatient(true)}
                className="inline-flex items-center gap-1.5 rounded bg-blue-600 px-3.5 py-2 text-[13px] font-semibold text-white hover:bg-blue-700"
              >
                <Plus className="h-4 w-4" /> Add Care Profile
              </button>
            </div>

            {patients.length === 0 ? (
              <EmptyState title="No care profiles registered under this client" />
            ) : (
              <SectionList>
                {patients.map((patient, index) => (
                  <ExpandableRow
                    key={patient.patient_id || index}
                    summary={
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
                        <span className="font-semibold text-gray-900 text-sm">{patient.full_name || 'Care Profile'}</span>
                        {patient.age && <span className="text-sm text-gray-500">{patient.age} yrs</span>}
                        {patient.gender && <span className="text-sm text-gray-500">{patient.gender.charAt(0) + patient.gender.slice(1).toLowerCase()}</span>}
                        {patient.relationship_to_client && <span className="text-sm text-gray-400">{patient.relationship_to_client}</span>}
                      </div>
                    }
                    actions={
                      <button
                        type="button"
                        onClick={() => { setDeletePatientTarget(patient); setDeletePatientConfirmText(''); setDeletePatientError(''); }}
                        title="Delete Care Profile"
                        className="shrink-0 rounded p-1.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    }
                  >
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      <InfoRow label="Name"         value={patient.full_name} />
                      <InfoRow label="Age"          value={patient.age || '-'} />
                      <InfoRow label="Gender"       value={patient.gender ? patient.gender.charAt(0) + patient.gender.slice(1).toLowerCase() : '-'} />
                      <InfoRow label="Relationship" value={patient.relationship_to_client || '-'} />
                      {(() => {
                        const ecNames   = (patient.emergency_contact_name   || '').split(' | ').filter(Boolean);
                        const ecNumbers = (patient.emergency_contact_number || '').split(' | ');
                        if (ecNames.length === 0) return <InfoRow label="Emergency Contact" value="-" />;
                        return ecNames.map((name, i) => (
                          <React.Fragment key={i}>
                            <InfoRow label={ecNames.length > 1 ? `Emergency Contact ${i + 1}` : 'Emergency Contact'} value={name} />
                            <InfoRow label={ecNames.length > 1 ? `Contact Number ${i + 1}` : 'Contact Number'} value={ecNumbers[i] || '-'} />
                          </React.Fragment>
                        ));
                      })()}
                      <div className="sm:col-span-2 lg:col-span-3">
                        <InfoRow label="Condition / Remarks" value={patient.medical_condition || patient.special_remarks || '-'} />
                      </div>
                    </div>
                  </ExpandableRow>
                ))}
              </SectionList>
            )}
          </div>
        );

      case 'notes':
        return (
          <div className="space-y-5">
            <div>
              <p className="text-sm font-medium text-gray-700">All notes for this client</p>
              <p className="mt-0.5 text-xs text-gray-400">Includes general profile notes and notes attached to specific bookings.</p>
            </div>

            {/* Add note form */}
            <div className="rounded-md border border-gray-200 bg-gray-50 p-4 space-y-3">
              <p className="text-[13px] font-semibold text-gray-700">Add a new note</p>
              {noteError && (
                <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{noteError}</div>
              )}
              <textarea
                rows={3}
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="Write a note about this client..."
                className="w-full resize-none rounded-md border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
              <div className="flex items-center gap-3">
                <select
                  value={noteType}
                  onChange={(e) => setNoteType(e.target.value)}
                  className="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                >
                  <option value="GENERAL">General</option>
                  <option value="MEDICAL">Medical</option>
                  <option value="BILLING">Billing</option>
                  <option value="URGENT">Urgent</option>
                </select>
                <button
                  type="button"
                  onClick={handleAddNote}
                  disabled={noteSubmitting || !noteText.trim()}
                  className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-[13px] font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                >
                  {noteSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  {noteSubmitting ? 'Adding...' : 'Add Note'}
                </button>
              </div>
            </div>

            {/* Notes list */}
            {notesLoading ? (
              <div className="flex items-center gap-2 py-6 text-sm text-gray-500">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading notes...
              </div>
            ) : notes.length === 0 ? (
              <EmptyState title="No notes yet for this client" />
            ) : (
              <div className="space-y-2">
                {notes.map((note) => {
                  const meta = NOTE_TYPE_META[note.note_type] || NOTE_TYPE_META.GENERAL;
                  const isEditing = editingNoteId === note.note_id;
                  const isEdited = note.updated_at && note.updated_at !== note.created_at;

                  return (
                    <div key={note.note_id} className="rounded-md border border-gray-200 bg-white p-4">
                      {isEditing ? (
                        <div className="space-y-3">
                          <textarea
                            rows={3}
                            value={editNoteText}
                            onChange={(e) => setEditNoteText(e.target.value)}
                            className="w-full resize-none rounded-md border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                          />
                          <div className="flex items-center gap-2">
                            <select
                              value={editNoteType}
                              onChange={(e) => setEditNoteType(e.target.value)}
                              className="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                            >
                              <option value="GENERAL">General</option>
                              <option value="MEDICAL">Medical</option>
                              <option value="BILLING">Billing</option>
                              <option value="URGENT">Urgent</option>
                            </select>
                            <button
                              type="button"
                              onClick={() => handleSaveEdit(note.note_id)}
                              className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                            >
                              <Check className="h-3.5 w-3.5" /> Save
                            </button>
                            <button
                              type="button"
                              onClick={cancelEdit}
                              className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-100"
                            >
                              <X className="h-3.5 w-3.5" /> Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-start justify-between gap-3">
                            <p className="text-sm leading-relaxed text-gray-800">{note.note_text}</p>
                            <div className="flex shrink-0 items-center gap-1">
                              <button
                                type="button"
                                onClick={() => startEdit(note)}
                                className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                                title="Edit note"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteNote(note.note_id)}
                                className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
                                title="Delete note"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                          <div className="mt-2.5 flex flex-wrap items-center gap-2">
                            <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-semibold ${meta.classes}`}>
                              {meta.label}
                            </span>
                            {note.booking_id ? (
                              <button
                                type="button"
                                onClick={() => navigate(`/admin/bookings/${note.booking_id}/detail`)}
                                className="inline-flex items-center gap-1 rounded bg-violet-50 px-2 py-0.5 text-xs font-semibold text-violet-700 hover:bg-violet-100 ring-1 ring-inset ring-violet-200"
                              >
                                <BookOpen className="h-3 w-3" />
                                {note.booking_service_type || 'Booking'} &middot; {note.booking_status || 'â€”'}
                              </button>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200">
                                <Users className="h-3 w-3" /> Client Profile
                              </span>
                            )}
                            <span className="text-xs text-gray-400">
                              {note.created_by_name} &middot; {formatDateTime(note.created_at)}
                            </span>
                            {isEdited && (
                              <span className="text-xs italic text-gray-400">(edited)</span>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );

      case 'statement':
        return (
          <div className="space-y-5">
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <span className="text-[11px] font-medium uppercase tracking-wider text-gray-400">Billed To</span>
              <span className="font-semibold text-gray-900">{billedToName}</span>
            </div>
            <div className="rounded-md border border-gray-200 bg-gray-50 p-4">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wider text-gray-400 mb-1">Start date</p>
                  <DateInput
                    value={statementStartDate}
                    onChange={(e) => setStatementStartDate(e.target.value)}
                    className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </div>
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wider text-gray-400 mb-1">End date</p>
                  <DateInput
                    value={statementEndDate}
                    onChange={(e) => setStatementEndDate(e.target.value)}
                    className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </div>
                <div className="flex items-end gap-3 md:col-span-2 xl:justify-end">
                  <button
                    type="button"
                    onClick={downloadStatement}
                    disabled={statementActionLoading === 'download'}
                    className="inline-flex items-center gap-1.5 rounded bg-gray-800 px-4 py-2 text-[13px] font-semibold text-white hover:bg-gray-900 disabled:opacity-60"
                  >
                    {statementActionLoading === 'download' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                    Download Statement
                  </button>
                  <button
                    type="button"
                    onClick={sendStatementToWhatsApp}
                    disabled={statementActionLoading === 'whatsapp' || !clientProfile.mobile_number}
                    className="inline-flex items-center gap-1.5 rounded bg-emerald-600 px-4 py-2 text-[13px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                    title={clientProfile.mobile_number ? 'Send statement to WhatsApp' : 'Client has no phone number'}
                  >
                    {statementActionLoading === 'whatsapp' ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendHorizontal className="h-4 w-4" />}
                    Send WhatsApp
                  </button>
                </div>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <StatCard icon={ReceiptText}     label="Transactions"                   value={statementSummary.transaction_count || 0}             tone="slate" />
              <StatCard icon={Wallet}          label="Payments Made By Client"         value={formatMoney(paymentSummary.total_paid)}              tone="blue" />
              <StatCard icon={BadgeDollarSign} label="Invoiced Through Daily Invoicing" value={formatMoney(statementSummary.total_invoiced)}        tone="emerald" />
              <StatCard icon={FileText}        label="Overdue Amount"                  value={overdueDisplayValue}                                  tone={overdueTone} />
              <StatCard icon={Activity}        label="Net Transaction Balance"         value={formatMoney(transactionSummary.net_balance)}         tone="violet" />
            </div>

            <div className="overflow-hidden rounded-md border border-gray-200 bg-white">
              <div className="border-b border-gray-100 px-5 py-3.5 bg-gray-50">
                <h3 className="text-[13px] font-semibold text-gray-800">All Client Transactions</h3>
                <p className="text-xs text-gray-400 mt-0.5">Fetched from the statement transaction endpoint for this client</p>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-100 text-sm">
                  <thead className="bg-gray-50">
                    <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                      <th className="px-5 py-3">Date</th>
                      <th className="px-5 py-3">Category</th>
                      <th className="px-5 py-3 text-right">Debit</th>
                      <th className="px-5 py-3 text-right">Credit</th>
                      <th className="px-5 py-3 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 bg-white">
                    {transactionsLoading ? (
                      <tr>
                        <td colSpan="5" className="px-5 py-10 text-center text-gray-400 text-sm">
                          Loading transactions...
                        </td>
                      </tr>
                    ) : clientTransactions.length === 0 ? (
                      <tr>
                        <td colSpan="5" className="px-5 py-10 text-center text-gray-400 text-sm">
                          No transaction rows available yet
                        </td>
                      </tr>
                    ) : (
                      (() => {
                        const txTotalPages = Math.max(1, Math.ceil(clientTransactions.length / TX_PAGE_SIZE));
                        const safePage = Math.min(txPage, txTotalPages);
                        const txStart = (safePage - 1) * TX_PAGE_SIZE;
                        const pagedTransactions = clientTransactions.slice(txStart, txStart + TX_PAGE_SIZE);
                        return pagedTransactions.map((transaction, index) => {
                          const isDebit  = transaction.transaction_type === 'DEBIT';
                          const isCredit = transaction.transaction_type === 'CREDIT';
                          return (
                            <tr key={transaction.transaction_id || index} className="align-top hover:bg-gray-50/70">
                              <td className="px-5 py-3.5 text-gray-600 text-[13px]">{formatDateTime(transaction.created_at)}</td>
                              <td className="px-5 py-3.5">
                                <span className={`inline-flex rounded px-2 py-0.5 text-xs font-semibold ${isDebit ? 'bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-100' : 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-100'}`}>
                                  {transaction.category || transaction.transaction_type || 'Transaction'}
                                </span>
                              </td>
                              <td className="px-5 py-3.5 text-right font-semibold text-gray-900 text-[13px]">{formatMoney(isDebit ? transaction.amount : 0)}</td>
                              <td className="px-5 py-3.5 text-right font-semibold text-emerald-700 text-[13px]">{formatMoney(isCredit ? transaction.amount : 0)}</td>
                              <td className="px-5 py-3.5 text-right font-semibold text-rose-700 text-[13px]">{formatMoney(transaction.amount)}</td>
                            </tr>
                          );
                        });
                      })()
                    )}
                  </tbody>
                </table>
              </div>
              {!transactionsLoading && clientTransactions.length > TX_PAGE_SIZE && (() => {
                const txTotalPages = Math.ceil(clientTransactions.length / TX_PAGE_SIZE);
                const safePage = Math.min(txPage, txTotalPages);
                const txStart = (safePage - 1) * TX_PAGE_SIZE;
                return (
                  <div className="flex items-center justify-between border-t border-gray-100 px-5 py-3">
                    <p className="text-xs text-gray-400">
                      Showing {txStart + 1}â€“{Math.min(txStart + TX_PAGE_SIZE, clientTransactions.length)} of {clientTransactions.length}
                    </p>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setTxPage((p) => Math.max(1, p - 1))}
                        disabled={safePage === 1}
                        className="inline-flex items-center gap-1.5 rounded border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <ArrowLeft className="h-3.5 w-3.5" /> Prev
                      </button>
                      <span className="min-w-[90px] text-center text-xs text-gray-400">
                        Page {safePage} of {txTotalPages}
                      </span>
                      <button
                        type="button"
                        onClick={() => setTxPage((p) => Math.min(txTotalPages, p + 1))}
                        disabled={safePage === txTotalPages}
                        className="inline-flex items-center gap-1.5 rounded border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Next <ArrowRight className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        );

      case 'overdue':
        return (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <StatCard icon={ShieldAlert}  label="Overdue Amount"       value={overdueDisplayValue}                             tone={overdueTone} />
            <StatCard icon={CalendarDays} label="Overdue Invoices"      value={overdueSummary.total_outstanding_invoices || 0}  tone="amber" />
            <StatCard icon={Activity}     label="Overdue Count"         value={overdueSummary.overdue_payments_count || 0}      tone="slate" />
          </div>
        );

      case 'overview':
      default:
        return (
          <div className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {topStats.map((stat) => (
                <StatCard key={stat.label} {...stat} />
              ))}
            </div>

            {/* Registration Fee */}
            {(() => {
              const feeStatus = clientProfile.reg_fee_status || 'PENDING';
              const statusMeta = {
                PENDING:          { label: 'Pending',          cls: 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200' },
                INVOICED:         { label: 'Invoiced',         cls: 'bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-200' },
                RECEIPT_UPLOADED: { label: 'Receipt Uploaded', cls: 'bg-violet-50 text-violet-700 ring-1 ring-inset ring-violet-200' },
                PAID:             { label: 'Paid',             cls: 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200' },
                WAIVED:           { label: 'Waived',           cls: 'bg-gray-100 text-gray-600 ring-1 ring-inset ring-gray-200' },
                EXPIRED:          { label: 'Expired',          cls: 'bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200' },
              };
              const badge = statusMeta[feeStatus] || statusMeta.PENDING;
              const canSendInvoice = ['PENDING', 'INVOICED', 'EXPIRED'].includes(feeStatus);
              const canViewReceipt = feeStatus === 'RECEIPT_UPLOADED' && clientProfile.reg_fee_receipt_url;
              const isSettled = ['PAID', 'WAIVED'].includes(feeStatus);

              // Membership is valid for 365 days from payment (see
              // backend/cron/regFeeExpiry.js) — once reg_fee_expires_at
              // passes, the daily cron flips reg_fee_status to EXPIRED (a
              // distinct state from PENDING/never-registered) so the client
              // re-enters the admin's re-invoicing queue.
              const daysUntilReset = (feeStatus === 'PAID' && clientProfile.reg_fee_expires_at)
                ? Math.ceil((new Date(clientProfile.reg_fee_expires_at) - Date.now()) / (1000 * 60 * 60 * 24))
                : null;

              return (
                <DataCard title="Registration Fee">
                  <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
                    <div>
                      <p className="text-[11px] font-medium uppercase tracking-wider text-gray-400 mb-1">Status</p>
                      <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-semibold ${badge.cls}`}>{badge.label}</span>
                    </div>
                    <div>
                      <p className="text-[11px] font-medium uppercase tracking-wider text-gray-400 mb-1">Current Amount</p>
                      <p className="text-sm font-bold text-gray-800">{formatMoney(clientProfile.reg_fee_amount || 10000)}</p>
                    </div>
                    {clientProfile.reg_fee_invoiced_at && (
                      <div>
                        <p className="text-[11px] font-medium uppercase tracking-wider text-gray-400 mb-1">Invoiced On</p>
                        <p className="text-sm font-medium text-gray-700">{formatDateTime(clientProfile.reg_fee_invoiced_at)}</p>
                      </div>
                    )}
                    {daysUntilReset !== null && (
                      <div>
                        <p className="text-[11px] font-medium uppercase tracking-wider text-gray-400 mb-1">Membership Expires In</p>
                        <p className={`text-sm font-bold ${daysUntilReset <= 30 ? 'text-amber-600' : 'text-gray-800'} ${daysUntilReset < 0 ? 'text-rose-600' : ''}`}>
                          {daysUntilReset > 0
                            ? `${daysUntilReset} day${daysUntilReset === 1 ? '' : 's'}`
                            : daysUntilReset === 0
                              ? 'Today'
                              : `Expired ${Math.abs(daysUntilReset)} day${Math.abs(daysUntilReset) === 1 ? '' : 's'} ago`}
                        </p>
                        <p className="text-[11px] text-gray-400 mt-0.5">on {formatDateTime(clientProfile.reg_fee_expires_at)}</p>
                      </div>
                    )}
                    {feeStatus === 'EXPIRED' && clientProfile.reg_fee_expires_at && (
                      <div>
                        <p className="text-[11px] font-medium uppercase tracking-wider text-gray-400 mb-1">Expired On</p>
                        <p className="text-sm font-bold text-rose-600">{formatDateTime(clientProfile.reg_fee_expires_at)}</p>
                        <p className="text-[11px] text-gray-400 mt-0.5">Send a new invoice to renew membership</p>
                      </div>
                    )}
                    <div>
                      <p className="text-[11px] font-medium uppercase tracking-wider text-gray-400 mb-1">Managed By</p>
                      <p className="text-sm font-medium text-gray-700">
                        {clientSalesperson?.current?.salesperson_name || 'Unassigned'}
                      </p>
                    </div>
                  </div>

                  {salespersonsList.length > 0 && (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <select
                        value={switchSalespersonId}
                        onChange={(e) => setSwitchSalespersonId(e.target.value)}
                        className="px-2.5 py-1.5 text-xs border border-gray-200 rounded-md outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 bg-white"
                      >
                        <option value="">
                          {clientSalesperson?.current ? '— Reassign to —' : '— No salesperson assigned —'}
                        </option>
                        {salespersonsList
                          .filter((sp) => sp.id !== clientSalesperson?.current?.salesperson_id)
                          .map((sp) => (
                            <option key={sp.id} value={sp.id}>{sp.full_name}</option>
                          ))}
                      </select>
                      <button
                        type="button"
                        onClick={handleSwitchClientSalesperson}
                        disabled={!switchSalespersonId || !clientSalesperson?.current || salespersonActionLoading}
                        title={!clientSalesperson?.current ? 'Pick a salesperson below when confirming payment first' : ''}
                        className="inline-flex items-center gap-1.5 rounded border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                      >
                        {salespersonActionLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                        Reassign
                      </button>
                    </div>
                  )}

                  {salespersonError && (
                    <p className="mt-2 text-xs text-red-600">{salespersonError}</p>
                  )}

                  {regFeeError && (
                    <p className="mt-3 text-xs text-red-600">{regFeeError}</p>
                  )}

                  {lastInvoicePdfUrl && (
                    <div className="mt-3">
                      <a
                        href={lastInvoicePdfUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 rounded border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100"
                      >
                        <Download className="h-3.5 w-3.5" /> Download Invoice PDF
                      </a>
                    </div>
                  )}

                  {canViewReceipt && (
                    <div className="mt-4 rounded-md border border-violet-200 bg-violet-50 p-3">
                      <p className="text-xs font-semibold text-violet-700 mb-2">Receipt submitted â€” review before verifying</p>
                      {!clientSalesperson?.origin && salespersonsList.length > 0 && (
                        <select
                          value={salespersonForCredit}
                          onChange={(e) => setSalespersonForCredit(e.target.value)}
                          className="mb-2 px-2.5 py-1.5 text-xs border border-gray-200 rounded-md outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 bg-white"
                        >
                          <option value="">Credit registration to salesperson (optional)</option>
                          {salespersonsList.map((sp) => (
                            <option key={sp.id} value={sp.id}>{sp.full_name}</option>
                          ))}
                        </select>
                      )}
                      <div className="flex flex-wrap items-center gap-2">
                        <a
                          href={clientProfile.reg_fee_receipt_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 rounded border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                        >
                          <Download className="h-3.5 w-3.5" /> View Receipt
                        </a>
                        <button
                          type="button"
                          onClick={handleVerifyRegFeePayment}
                          disabled={regFeeLoading}
                          className="inline-flex items-center gap-1.5 rounded bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                        >
                          {regFeeLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                          Verify Payment
                        </button>
                      </div>
                    </div>
                  )}

                  {!isSettled && (
                    <div className="mt-4 rounded-md border border-gray-200 bg-gray-50 p-3">
                      <p className="text-xs font-semibold text-gray-700 mb-2">
                        {canViewReceipt ? 'Received a different proof of payment? Replace the receipt' : 'Upload the payment receipt on the client\'s behalf'}
                      </p>
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          ref={regFeeReceiptInputRef}
                          type="file"
                          accept="image/*,.pdf"
                          className="hidden"
                          id="admin-reg-fee-receipt-upload"
                          onChange={(e) => handleAdminUploadRegFeeReceipt(e.target.files?.[0])}
                        />
                        <label
                          htmlFor="admin-reg-fee-receipt-upload"
                          className={`inline-flex items-center gap-1.5 rounded border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 cursor-pointer ${uploadingRegFeeReceipt ? 'opacity-60 pointer-events-none' : ''}`}
                        >
                          {uploadingRegFeeReceipt ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                          {uploadingRegFeeReceipt ? 'Uploadingâ€¦' : canViewReceipt ? 'Replace Receipt' : 'Upload Receipt'}
                        </label>
                      </div>
                    </div>
                  )}

                  {!isSettled && canSendInvoice && (
                    <div className="mt-4 space-y-3 border-t border-gray-100 pt-4">
                      {!clientSalesperson?.origin && salespersonsList.length > 0 && (
                        <div>
                          <label className="text-[11px] font-medium uppercase tracking-wider text-gray-400 block mb-1">Credit Registration To (optional)</label>
                          <select
                            value={salespersonForCredit}
                            onChange={(e) => setSalespersonForCredit(e.target.value)}
                            className="w-full sm:w-64 px-3 py-2 text-sm border border-gray-200 rounded-md outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 bg-white"
                          >
                            <option value="">â€” No salesperson â€”</option>
                            {salespersonsList.map((sp) => (
                              <option key={sp.id} value={sp.id}>{sp.full_name}</option>
                            ))}
                          </select>
                        </div>
                      )}
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                          <label className="text-[11px] font-medium uppercase tracking-wider text-gray-400 block mb-1">Fee Amount (LKR)</label>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={regFeeAmount}
                            onChange={(e) => setRegFeeAmount(e.target.value)}
                            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 bg-white"
                          />
                        </div>
                        <div>
                          <label className="text-[11px] font-medium uppercase tracking-wider text-gray-400 block mb-1">Bank Account</label>
                          {bankAccountsLoading ? (
                            <p className="text-xs text-gray-400 py-2">Loading accountsâ€¦</p>
                          ) : (
                            <select
                              value={selectedBankAccountId}
                              onChange={(e) => setSelectedBankAccountId(e.target.value)}
                              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 bg-white"
                            >
                              <option value="">â€” Select account â€”</option>
                              {bankAccounts.map((acc) => (
                                <option key={acc.account_id} value={acc.account_id}>
                                  {acc.account_nickname} Â· {acc.bank_name} Â· {acc.account_number}
                                </option>
                              ))}
                            </select>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={handleSendRegFeeInvoice}
                          disabled={regFeeLoading || !selectedBankAccountId || !clientProfile.mobile_number}
                          title={!clientProfile.mobile_number ? 'Client has no mobile number on record' : ''}
                          className="inline-flex items-center gap-1.5 rounded bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          {regFeeLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <SendHorizontal className="h-3 w-3" />}
                          Send Invoice via WhatsApp
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRegFeeStatusUpdate('WAIVED')}
                          disabled={regFeeLoading}
                          className="inline-flex items-center gap-1.5 rounded border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-60"
                        >
                          {regFeeLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
                          Mark as Waived
                        </button>
                        {feeStatus !== 'PENDING' && (
                          <button
                            type="button"
                            onClick={() => handleRegFeeStatusUpdate('PAID')}
                            disabled={regFeeLoading}
                            className="inline-flex items-center gap-1.5 rounded border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-60"
                          >
                            {regFeeLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                            Mark as Paid
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {isSettled && (
                    <div className="mt-3">
                      <button
                        type="button"
                        onClick={() => handleRegFeeStatusUpdate('PENDING')}
                        disabled={regFeeLoading}
                        className="inline-flex items-center gap-1.5 rounded border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-60"
                      >
                        Reset to Pending
                      </button>
                    </div>
                  )}
                </DataCard>
              );
            })()}

            <div className="grid gap-4 lg:grid-cols-2">
              <DataCard title="Client Information">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Contact &amp; Personal Details</span>
                  {!editingProfile && (
                    <button
                      onClick={openEditProfile}
                      className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-semibold"
                    >
                      <Pencil className="w-3 h-3" /> Edit
                    </button>
                  )}
                </div>

                {editingProfile ? (
                  <div className="space-y-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider block mb-1">Full Name</label>
                        <input
                          type="text"
                          value={profileForm.full_name}
                          onChange={(e) => setProfileForm(f => ({ ...f, full_name: e.target.value }))}
                          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 bg-white"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider block mb-1">Phone</label>
                        <input
                          type="tel"
                          value={profileForm.mobile_number}
                          onChange={(e) => setProfileForm(f => ({ ...f, mobile_number: e.target.value }))}
                          placeholder="07XXXXXXXX"
                          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 bg-white"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider block mb-1">Email</label>
                        <input
                          type="email"
                          value={profileForm.email}
                          onChange={(e) => setProfileForm(f => ({ ...f, email: e.target.value }))}
                          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 bg-white"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider block mb-1">Gender</label>
                        <select
                          value={profileForm.gender}
                          onChange={(e) => setProfileForm(f => ({ ...f, gender: e.target.value }))}
                          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 bg-white"
                        >
                          <option value="">-</option>
                          <option value="MALE">Male</option>
                          <option value="FEMALE">Female</option>
                          <option value="OTHER">Other</option>
                        </select>
                      </div>
                      <div className="sm:col-span-2">
                        <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider block mb-1">Address</label>
                        <input
                          type="text"
                          value={profileForm.primary_address}
                          onChange={(e) => setProfileForm(f => ({ ...f, primary_address: e.target.value }))}
                          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 bg-white"
                        />
                      </div>
                    </div>
                    {profileError && <p className="text-xs text-red-500">{profileError}</p>}
                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={saveProfile}
                        disabled={profileLoading}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-md hover:bg-blue-700 disabled:opacity-60"
                      >
                        {profileLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                        Save
                      </button>
                      <button
                        onClick={() => setEditingProfile(false)}
                        disabled={profileLoading}
                        className="px-3 py-1.5 border border-gray-200 text-xs font-medium text-gray-600 rounded-md hover:bg-gray-50 disabled:opacity-60"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <InfoRow label="Client Code" value={clientProfile.client_code || clientProfile.client_profile_id} />
                    <InfoRow label="User ID"     value={clientProfile.user_id} />
                    <InfoRow label="Full Name"   value={clientProfile.full_name || '-'} />
                    <InfoRow label="Email"       value={clientProfile.email || '-'} />
                    <InfoRow label="Phone"       value={clientProfile.mobile_number || '-'} />
                    <InfoRow label="Address"     value={clientProfile.primary_address || '-'} />
                    <InfoRow label="Type"        value={clientProfile.client_type || '-'} />
                    <InfoRow label="Gender"      value={clientProfile.gender || '-'} />
                    <InfoRow label="Active"      value={clientProfile.is_active ? 'Yes' : 'No'} />
                  </div>
                )}

                {/* Billing Details */}
                <div className="mt-5 pt-4 border-t border-gray-100">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Building2 className="w-3.5 h-3.5 text-gray-400" />
                      <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Billing Details</span>
                    </div>
                    {!editingBilling && (
                      <button
                        onClick={() => {
                          setBillingForm({
                            company_name: clientProfile.company_name || '',
                            honorific: clientProfile.honorific || '',
                            display_name_source: clientProfile.display_name_source === 'COMPANY_NAME' ? 'COMPANY_NAME' : 'FULL_NAME',
                          });
                          setBillingError('');
                          setEditingBilling(true);
                        }}
                        className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-semibold"
                      >
                        <Pencil className="w-3 h-3" /> Edit
                      </button>
                    )}
                  </div>

                  {editingBilling ? (
                    <div className="space-y-3">
                      <div>
                        <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider block mb-1">Company Name</label>
                        <input
                          type="text"
                          value={billingForm.company_name}
                          onChange={(e) => {
                            const value = e.target.value;
                            setBillingForm(f => ({
                              ...f,
                              company_name: value,
                              display_name_source: value ? f.display_name_source : 'FULL_NAME',
                            }));
                          }}
                          placeholder="Leave blank for personal billing"
                          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 bg-white"
                        />
                      </div>
                      {billingForm.company_name && (
                        <div>
                          <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider block mb-1">Display Name</label>
                          <p className="text-xs text-gray-400 mb-1.5">Name used on this client's receipts, invoices, statements and quotations.</p>
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() => setBillingForm(f => ({ ...f, display_name_source: 'FULL_NAME' }))}
                              className={`px-3 py-2 rounded-md border text-left text-xs font-medium transition-all ${
                                billingForm.display_name_source === 'FULL_NAME'
                                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                                  : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                              }`}
                            >
                              <p className="font-semibold">Client's Name</p>
                              <p className="truncate text-gray-400">{clientProfile.full_name || 'Personal name'}</p>
                            </button>
                            <button
                              type="button"
                              onClick={() => setBillingForm(f => ({ ...f, display_name_source: 'COMPANY_NAME' }))}
                              className={`px-3 py-2 rounded-md border text-left text-xs font-medium transition-all ${
                                billingForm.display_name_source === 'COMPANY_NAME'
                                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                                  : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                              }`}
                            >
                              <p className="font-semibold">Company Name</p>
                              <p className="truncate text-gray-400">{billingForm.company_name}</p>
                            </button>
                          </div>
                        </div>
                      )}
                      <div>
                        <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider block mb-1">Title / Honorific</label>
                        <div className="flex flex-wrap gap-2">
                          {['', 'Mr', 'Mrs', 'Miss', 'Doc', 'Prof'].map(h => (
                            <button
                              key={h}
                              type="button"
                              onClick={() => setBillingForm(f => ({ ...f, honorific: h }))}
                              className={`px-3 py-1.5 rounded-md border text-xs font-medium transition-all ${
                                billingForm.honorific === h
                                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                                  : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                              }`}
                            >
                              {h || 'None'}
                            </button>
                          ))}
                        </div>
                      </div>
                      {billingError && <p className="text-xs text-red-500">{billingError}</p>}
                      <div className="flex gap-2 pt-1">
                        <button
                          onClick={saveBilling}
                          disabled={billingLoading}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-md hover:bg-blue-700 disabled:opacity-60"
                        >
                          {billingLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                          Save
                        </button>
                        <button
                          onClick={() => setEditingBilling(false)}
                          disabled={billingLoading}
                          className="px-3 py-1.5 border border-gray-200 text-xs font-medium text-gray-600 rounded-md hover:bg-gray-50 disabled:opacity-60"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <p className="text-[11px] text-gray-400 mb-0.5">Company Name</p>
                        <p className="text-sm font-medium text-gray-800">{clientProfile.company_name || <span className="text-gray-400 italic">Not set (personal billing)</span>}</p>
                      </div>
                      <div>
                        <p className="text-[11px] text-gray-400 mb-0.5">Title</p>
                        <p className="text-sm font-medium text-gray-800">{clientProfile.honorific || <span className="text-gray-400 italic">None</span>}</p>
                      </div>
                      {clientProfile.company_name && (
                        <div className="sm:col-span-2">
                          <p className="text-[11px] text-gray-400 mb-0.5">Display Name (on documents)</p>
                          <p className="text-sm font-medium text-gray-800">
                            {clientProfile.display_name_source === 'COMPANY_NAME' ? clientProfile.company_name : clientProfile.full_name}
                            <span className="text-gray-400 font-normal ml-1">
                              ({clientProfile.display_name_source === 'COMPANY_NAME' ? 'Company' : "Client's name"})
                            </span>
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </DataCard>

              <DataCard title="Quick Summary">
                <div className="grid gap-4 sm:grid-cols-2">
                  <InfoRow label="Bookings"         value={`${bookingSummary.total_bookings || 0} total`} />
                  <InfoRow label="Care Profiles"    value={patientSummary.total_patients || 0} />
                  <InfoRow label="Quotes"           value={quotationSummary.total_quotes || 0} />
                  <InfoRow label="Current Staff"    value={staffSummary.active_assignment_count || 0} />
                  <InfoRow label="Reviews"          value={reviewSummary.total_reviews || 0} />
                  <InfoRow label="Last Transaction" value={formatDateTime(statementSummary.last_transaction_at)} />
                </div>
              </DataCard>
            </div>
          </div>
        );
    }
  };

  if (loading) {
    return (
      <AdminLayout title="Client Details" subtitle="Loading client profile...">
        <div className="flex min-h-[45vh] items-center justify-center rounded-lg border border-gray-200 bg-white">
          <div className="flex items-center gap-3 text-gray-500">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">Loading client details...</span>
          </div>
        </div>
      </AdminLayout>
    );
  }

  if (error) {
    return (
      <AdminLayout title="Client Details" subtitle="Unable to load client profile">
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-red-700">
          <p className="font-semibold text-sm">{error}</p>
          <button
            type="button"
            onClick={() => navigate('/admin/users')}
            className="mt-4 inline-flex items-center gap-1.5 rounded bg-red-600 px-4 py-2 text-[13px] font-semibold text-white hover:bg-red-700"
          >
            <ArrowLeft className="h-4 w-4" /> Back to users
          </button>
        </div>
      </AdminLayout>
    );
  }

  const activeNavSection = sectionConfig.find((s) => s.id === activeSection);
  const ActiveSectionIcon = activeNavSection?.icon;

  return (
    <AdminLayout
      title={clientProfile.full_name || 'Client Details'}
      subtitle={`Client Code: ${clientProfile.client_code || clientProfile.client_profile_id || 'â€”'}`}
    >
      <div className="space-y-4">
        {/* â”€â”€ Top action bar â”€â”€ */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => navigate('/admin/users')}
              className="inline-flex items-center gap-1.5 rounded border border-gray-200 bg-white px-3 py-1.5 text-[13px] font-medium text-gray-600 hover:bg-gray-50"
            >
              <ArrowLeft className="h-4 w-4" /> Back
            </button>
            {linkedStaffProfileId && (
              <button
                type="button"
                onClick={() => navigate(`/admin/staff/${linkedStaffProfileId}/detail`)}
                className="inline-flex items-center gap-1.5 rounded border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-[13px] font-medium text-indigo-700 hover:bg-indigo-100"
              >
                <ArrowLeftRight className="h-4 w-4" /> Switch to Staff View
              </button>
            )}
          </div>

          {/* Actions dropdown */}
          <div className="relative" ref={actionsDropdownRef}>
            <button
              type="button"
              onClick={() => setActionsOpen((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded bg-blue-600 px-4 py-1.5 text-[13px] font-semibold text-white hover:bg-blue-700"
            >
              Actions <ChevronDown className="h-4 w-4" />
            </button>

            {actionsOpen && (
              <div className="absolute right-0 top-full z-30 mt-1 w-52 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
                {[
                  { label: 'Record Payment',       action: () => { setShowRecordPayment(true); setActionsOpen(false); } },
                  { label: 'Record Registration Fee', action: () => { setShowRegFeeDrawer(true); setActionsOpen(false); } },
                  { label: 'Create Quotation',      action: () => { setEditingQuoteId(null); setShowQuoteDrawer(true); setActionsOpen(false); } },
                  { label: 'Create Booking',        action: () => { setShowDirectBooking(true); setActionsOpen(false); } },
                  { label: 'Create Service Request', action: () => { setShowServiceRequestDrawer(true); setActionsOpen(false); } },
                  { label: 'Create Product Invoice', action: () => { setShowProductInvoiceDrawer(true); setActionsOpen(false); } },
                  { label: 'Add Care Profiles',     action: () => { setActiveSection('patients'); setShowAddPatient(true); setActionsOpen(false); } },
                  { label: 'Add Note',              action: () => { setActiveSection('notes'); setActionsOpen(false); } },
                ].map(({ label, action }) => (
                  <button
                    key={label}
                    type="button"
                    onClick={action}
                    className="w-full px-4 py-2 text-left text-[13px] text-gray-700 hover:bg-gray-50"
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* â”€â”€ Zoho Books-style profile header â”€â”€ */}
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          {/* Top row: identity + actions */}
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-100 px-6 py-4">
            <div className="flex items-center gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blue-600 text-lg font-bold text-white">
                {(clientProfile.full_name || 'C').charAt(0).toUpperCase()}
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-[17px] font-semibold text-gray-900">
                    {clientProfile.honorific ? `${clientProfile.honorific} ` : ''}{clientProfile.full_name || 'Client Profile'}
                  </h1>
                  {clientProfile.company_name && (
                    <span className="inline-flex items-center gap-1 rounded bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">
                      <Building2 className="h-3 w-3" />{clientProfile.company_name}
                    </span>
                  )}
                  <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${clientProfile.is_active ? 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200' : 'bg-red-50 text-red-700 ring-1 ring-inset ring-red-200'}`}>
                    {clientProfile.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <div className="mt-1.5 flex flex-wrap gap-x-5 gap-y-1 text-[13px] text-gray-400">
                  <span className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" />{clientProfile.mobile_number || 'â€”'}</span>
                  <span className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" />{clientProfile.primary_address || 'â€”'}</span>
                  <span className="flex items-center gap-1.5"><Crown className="h-3.5 w-3.5" />{clientProfile.client_type || 'â€”'}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Financial snapshot strip */}
          <div className="grid grid-cols-2 divide-x divide-gray-100 sm:grid-cols-5">
            <div className="px-5 py-3">
              <p className="text-[11px] font-medium uppercase tracking-wider text-gray-400">Payments Made</p>
              <p className="mt-0.5 text-sm font-semibold text-gray-900">{formatMoney(paymentSummary.total_paid)}</p>
            </div>
            <div className="px-5 py-3">
              <p className="text-[11px] font-medium uppercase tracking-wider text-gray-400">Total Invoiced</p>
              <p className="mt-0.5 text-sm font-semibold text-gray-900">{formatMoney(statementSummary.total_invoiced)}</p>
            </div>
            <div className="px-5 py-3">
              <p className="text-[11px] font-medium uppercase tracking-wider text-gray-400">Overdue Amount</p>
              <p className={`mt-0.5 text-sm font-semibold ${isOverdue ? 'text-red-600' : 'text-gray-900'}`}>
                {overdueDisplayValue}
              </p>
            </div>
            <div className="px-5 py-3">
              <p className="text-[11px] font-medium uppercase tracking-wider text-gray-400">Total Bookings</p>
              <p className="mt-0.5 text-sm font-semibold text-gray-900">{bookingSummary.total_bookings || 0}</p>
            </div>
            <div className="px-5 py-3">
              <p className="text-[11px] font-medium uppercase tracking-wider text-gray-400">Wallet Balance</p>
              <p className="mt-0.5 text-sm font-semibold text-amber-600">{formatMoney(clientProfile.wallet_balance)}</p>
            </div>
          </div>
        </div>

        {/* â”€â”€ Sidebar + content â”€â”€ */}
        <div className="flex items-start gap-4">
          {/* Vertical nav */}
          <aside className="w-48 shrink-0">
            <div className="sticky top-6 overflow-hidden rounded-lg border border-gray-200 bg-white">
              <div className="border-b border-gray-100 px-4 py-2.5">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Sections</p>
              </div>
              <nav className="py-1">
                {sectionConfig.map((section) => (
                  <SideNavItem
                    key={section.id}
                    active={activeSection === section.id}
                    icon={section.icon}
                    label={section.label}
                    onClick={() => setActiveSection(section.id)}
                  />
                ))}
              </nav>
            </div>
          </aside>

          {/* Main content */}
          <div className="min-w-0 flex-1">
            <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
              <div className="flex items-center gap-2.5 border-b border-gray-100 bg-gray-50 px-5 py-3">
                {ActiveSectionIcon && <ActiveSectionIcon className="h-4 w-4 text-gray-400" />}
                <h2 className="text-[13px] font-semibold text-gray-700">{activeNavSection?.label}</h2>
              </div>
              <div className="p-5">
                {renderSection()}
              </div>
            </div>
          </div>
        </div>
      </div>

      <RecordPaymentDrawer
        open={showRecordPayment}
        clientId={clientId}
        bookings={activeBookings}
        patients={patients}
        onClose={() => setShowRecordPayment(false)}
        onSuccess={handlePaymentRecorded}
      />

      <AddCareProfileDrawer
        open={showAddPatient}
        onClose={() => setShowAddPatient(false)}
        clientProfileId={clientProfile.client_profile_id}
        onSuccess={async () => {
          const refreshed = await apiClient.getAdminClientDetail(clientId);
          setDetail(refreshed.data || null);
        }}
      />

      <AdminDirectBookingDrawer
        open={showDirectBooking}
        onClose={() => setShowDirectBooking(false)}
        onSuccess={() => fetchBookingsPag()}
        preselectedClientId={clientId}
        preselectedClientName={detail?.client_profile?.full_name}
      />

      <RegFeeDrawer
        open={showRegFeeDrawer}
        onClose={() => setShowRegFeeDrawer(false)}
        clientId={clientId}
        clientProfile={clientProfile}
        onSuccess={async () => {
          const refreshed = await apiClient.getAdminClientDetail(clientId);
          setDetail(refreshed.data || null);
        }}
      />

      <CreateQuotationDrawer
        open={showQuoteDrawer}
        onClose={() => setShowQuoteDrawer(false)}
        clientId={clientId}
        clientProfile={clientProfile}
        quoteId={editingQuoteId}
        onSuccess={async () => {
          const refreshed = await apiClient.getAdminClientDetail(clientId);
          setDetail(refreshed.data || null);
        }}
      />

      <CreateProductInvoiceDrawer
        open={showProductInvoiceDrawer}
        onClose={() => setShowProductInvoiceDrawer(false)}
        clientId={clientId}
        clientProfile={clientProfile}
        onSuccess={async () => {
          const refreshed = await apiClient.getAdminClientDetail(clientId);
          setDetail(refreshed.data || null);
        }}
      />

      <AddServiceRequestDrawer
        open={showServiceRequestDrawer}
        onClose={() => setShowServiceRequestDrawer(false)}
        presetClient={{
          client_profile_id: clientId,
          full_name: clientProfile.full_name,
          mobile_number: clientProfile.mobile_number,
        }}
        onSuccess={async () => {
          const refreshed = await apiClient.getAdminClientDetail(clientId);
          setDetail(refreshed.data || null);
        }}
      />

      {showReceiptSendPopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-100">
                  <MessageCircle className="h-4 w-4 text-green-600" />
                </div>
                <h3 className="text-sm font-semibold text-gray-900">Send Payment Receipt?</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowReceiptSendPopup(false)}
                className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="px-5 py-4">
              <p className="text-sm text-gray-600">
                Payment recorded. Would you like to send the receipt to{' '}
                <span className="font-semibold text-gray-900">
                  {clientProfile.full_name || 'the client'}
                </span>{' '}
                via WhatsApp?
              </p>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-gray-100 px-5 py-3">
              <button
                type="button"
                onClick={() => setShowReceiptSendPopup(false)}
                className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
              >
                Skip for now
              </button>
              <button
                type="button"
                onClick={handleSendLatestReceipt}
                disabled={receiptSendBusy}
                className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-4 py-2 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-60"
              >
                {receiptSendBusy ? (
                  <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Sendingâ€¦</>
                ) : (
                  <><SendHorizontal className="h-3.5 w-3.5" /> Yes, send now</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {deletePatientTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-red-100">
                  <Trash2 className="h-4 w-4 text-red-600" />
                </div>
                <h3 className="text-sm font-semibold text-gray-900">Delete Care Profile</h3>
              </div>
              <button
                type="button"
                onClick={closeDeletePatientModal}
                className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="px-5 py-4">
              {deletePatientError && (
                <div className="mb-3 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {deletePatientError}
                </div>
              )}
              <p className="text-sm text-gray-600">
                Are you sure you want to delete{' '}
                <span className="font-semibold text-gray-900">{deletePatientTarget.full_name || 'this care profile'}</span>?
                This action cannot be undone. Care Profiles with active bookings cannot be deleted.
              </p>
              <label className="mt-4 block text-xs font-medium text-gray-600">
                Type <span className="font-semibold text-gray-900">{deletePatientTarget.full_name}</span> to confirm
              </label>
              <input
                type="text"
                value={deletePatientConfirmText}
                onChange={(e) => setDeletePatientConfirmText(e.target.value)}
                placeholder={deletePatientTarget.full_name}
                autoFocus
                className="mt-1.5 w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100"
              />
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-gray-100 px-5 py-3">
              <button
                type="button"
                onClick={closeDeletePatientModal}
                className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeletePatient}
                disabled={deletingPatient || deletePatientConfirmText.trim() !== (deletePatientTarget.full_name || '').trim()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {deletingPatient && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
};

const DataCard = ({ title, children }) => (
  <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
    <div className="border-b border-gray-100 bg-gray-50 px-5 py-3">
      <h3 className="text-[13px] font-semibold text-gray-700">{title}</h3>
    </div>
    <div className="p-5">{children}</div>
  </div>
);

const EmptyState = ({ title }) => (
  <div className="rounded-md border border-dashed border-gray-200 bg-gray-50 p-10 text-center">
    <p className="text-sm text-gray-400">{title}</p>
  </div>
);

const SectionList = ({ children }) => (
  <div className="divide-y divide-gray-100 overflow-hidden rounded-md border border-gray-200 bg-white">
    {children}
  </div>
);

const ExpandableRow = ({ summary, actions, children }) => {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <div className="flex w-full items-center gap-2 px-5 py-3.5 transition-colors hover:bg-gray-50">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex min-w-0 flex-1 items-center gap-4 text-left"
        >
          <div className="min-w-0 flex-1">{summary}</div>
          <ChevronDown className={`h-4 w-4 shrink-0 text-gray-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
        </button>
        {actions}
      </div>
      {open && (
        <div className="border-t border-gray-100 bg-gray-50 px-5 py-4">
          {children}
        </div>
      )}
    </div>
  );
};

const StatusBadge = ({ status }) => {
  if (!status) return <span className="text-gray-400">â€”</span>;
  const s = status.toUpperCase();
  const cls =
    ['ACTIVE', 'COMPLETED', 'PAID', 'APPROVED', 'VISIBLE'].includes(s)
      ? 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200'
      : ['PENDING', 'IN_PROGRESS', 'ONGOING', 'DRAFT'].includes(s)
      ? 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200'
      : ['CANCELLED', 'TERMINATED', 'OVERDUE', 'FAILED', 'INACTIVE'].includes(s)
      ? 'bg-red-50 text-red-700 ring-1 ring-inset ring-red-200'
      : 'bg-gray-100 text-gray-600 ring-1 ring-inset ring-gray-200';
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-semibold ${cls}`}>
      {status}
    </span>
  );
};

export default ClientDetailPage;
