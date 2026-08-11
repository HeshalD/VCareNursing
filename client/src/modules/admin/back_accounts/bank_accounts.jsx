import { useEffect, useMemo, useState } from 'react';
import {
	Landmark,
	Plus,
	Pencil,
	Trash2,
	RefreshCw,
	X,
	AlertTriangle,
	ChevronRight,
	Wallet,
	ShieldCheck,
	Download,
	CheckCircle2,
	Coins,
	ArrowRightLeft,
	Loader2,
} from 'lucide-react';
import AdminLayout from '../components/AdminLayout';
import apiClient from '../../../api/api';
import { categoryBadge, relatedTo, flowAmountClass, flowSign } from '../../../constants/transactionCategories';
import DateInput from '../../../components/common/DateInput';
import { useAdminAuth } from '../../../context/AdminAuthContext';

const parseToken = (token) => {
	try {
		return JSON.parse(atob(token.split('.')[1]));
	} catch {
		return null;
	}
};

const monthOptions = () => {
	const options = [];
	const now = new Date();
	for (let i = 0; i < 12; i++) {
		const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
		const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
		const label = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
		options.push({ value, label });
	}
	return options;
};

const monthToRange = (monthValue) => {
	const [year, month] = monthValue.split('-').map(Number);
	const start = new Date(year, month - 1, 1);
	const end = new Date(year, month, 0);
	const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
	return { start_date: fmt(start), end_date: fmt(end) };
};

const csvEscape = (value) => {
	const str = String(value ?? '');
	return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
};

// Mirrors backend/utils/transactionFlow.js MANUAL_CATEGORIES — categories an
// admin may record by hand (system-generated categories aren't offered here).
const MANUAL_CATEGORIES = [
	{ value: 'OTHER_INCOME', label: 'Other Income', direction: 'CREDIT' },
	{ value: 'OTHER_EXPENSE', label: 'Other Expense', direction: 'DEBIT' },
	{ value: 'AGENCY_FEE', label: 'Agency Fee', direction: 'DEBIT' },
	{ value: 'INTERNAL_STAFF_SALARY', label: 'Internal Staff Salary', direction: 'DEBIT' },
];

const initialTransferForm = {
	from_account_id: '',
	to_account_id: '',
	amount: '',
	reference_number: '',
	transfer_date: '',
	notes: '',
};

const initialPettyCashForm = {
	category: 'OTHER_EXPENSE',
	direction: 'DEBIT',
	amount: '',
	external_party: '',
	reference_number: '',
	transaction_date: '',
	notes: '',
};

const initialFormState = {
	account_nickname: '',
	account_number: '',
	account_holder_name: '',
	bank_name: '',
	branch_name: '',
	currency: 'LKR',
	opening_balance: '0',
	opening_balance_date: ''
};

const formatMoney = (value) => {
	const amount = parseFloat(value || 0);
	return `LKR ${amount.toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const TX_STATUS_CONFIG = {
	COMPLETED: { dot: 'bg-emerald-500', text: 'text-emerald-700', label: 'Completed' },
	PENDING: { dot: 'bg-amber-400', text: 'text-amber-700', label: 'Pending' },
	REJECTED: { dot: 'bg-red-400', text: 'text-red-700', label: 'Rejected' },
};

const StatusDot = ({ status }) => {
	const cfg = TX_STATUS_CONFIG[status] || { dot: 'bg-slate-400', text: 'text-slate-600', label: status || '—' };
	return (
		<span className={`inline-flex items-center gap-1.5 text-xs font-medium ${cfg.text}`}>
			<span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${cfg.dot}`} />
			{cfg.label}
		</span>
	);
};

const inputCls = 'w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white text-slate-800 placeholder-slate-400 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-colors';
const primaryBtnCls = 'inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
const ghostBtnCls = 'inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors';
const iconBtnCls = 'inline-flex items-center justify-center w-7 h-7 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors';

const SectionHeader = ({ title }) => (
	<div className="px-5 pt-5 pb-2.5 border-b border-slate-100">
		<p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{title}</p>
	</div>
);

const Field = ({ label, required, children }) => (
	<div>
		<label className="block text-xs font-medium text-slate-600 mb-1">
			{label}{required && <span className="text-red-500 ml-0.5">*</span>}
		</label>
		{children}
	</div>
);

// Small stat tile used in the account detail panel — keeps every summary number
// (transaction counts, balances, reconciliation status) in one glanceable row
// instead of splitting them across two separate panels.
const StatTile = ({ label, value, tone = 'slate' }) => {
	const tones = {
		slate: 'text-slate-900',
		emerald: 'text-emerald-700',
		amber: 'text-amber-700',
		blue: 'text-blue-700',
	};
	return (
		<div className="bg-white border border-slate-200 rounded-xl p-3.5">
			<p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{label}</p>
			<p className={`mt-1 text-base font-semibold ${tones[tone]}`}>{value}</p>
		</div>
	);
};

const BankAccounts = () => {
	const { adminToken } = useAdminAuth();
	const isSuperAdmin = useMemo(() => {
		if (!adminToken) return false;
		const payload = parseToken(adminToken);
		const rawRole = typeof payload?.role === 'string'
			? payload.role.replace(/[{}]/g, '').split(',')[0].trim()
			: '';
		return rawRole === 'SUPER_ADMIN';
	}, [adminToken]);

	const [accounts, setAccounts] = useState([]);
	const [loading, setLoading] = useState(true);
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState('');
	const [successMessage, setSuccessMessage] = useState('');

	const [showForm, setShowForm] = useState(false);
	const [editingAccount, setEditingAccount] = useState(null);
	const [formData, setFormData] = useState(initialFormState);

	const [selectedAccount, setSelectedAccount] = useState(null);
	const [transactionsLoading, setTransactionsLoading] = useState(false);
	const [transactions, setTransactions] = useState([]);
	const [transactionsSummary, setTransactionsSummary] = useState(null);
	const [transactionsFilters, setTransactionsFilters] = useState({
		start_date: '',
		end_date: '',
		verified: ''
	});
	const [monthFilter, setMonthFilter] = useState('');
	const [auditMode, setAuditMode] = useState(false);
	const [verifyingId, setVerifyingId] = useState(null);

	const [reconciliationLoading, setReconciliationLoading] = useState(false);
	const [reconciliationReport, setReconciliationReport] = useState(null);

	const [showPettyCashForm, setShowPettyCashForm] = useState(false);
	const [pettyCashForm, setPettyCashForm] = useState(initialPettyCashForm);
	const [pettyCashSubmitting, setPettyCashSubmitting] = useState(false);
	const [pettyCashError, setPettyCashError] = useState('');

	const pettyCashAccount = useMemo(() => accounts.find((a) => a.is_petty_cash), [accounts]);

	const [showTransferForm, setShowTransferForm] = useState(false);
	const [transferForm, setTransferForm] = useState(initialTransferForm);
	const [transferSubmitting, setTransferSubmitting] = useState(false);
	const [transferError, setTransferError] = useState('');

	const transferFromAccount = useMemo(
		() => accounts.find((a) => a.account_id === transferForm.from_account_id),
		[accounts, transferForm.from_account_id]
	);
	const transferToAccount = useMemo(
		() => accounts.find((a) => a.account_id === transferForm.to_account_id),
		[accounts, transferForm.to_account_id]
	);
	const transferFromBalance = parseFloat(transferFromAccount?.current_balance ?? transferFromAccount?.opening_balance ?? 0);
	const transferAmountValue = parseFloat(transferForm.amount) || 0;
	const transferExceedsBalance = !!transferFromAccount && transferAmountValue > transferFromBalance + 0.01;

	const accountCount = useMemo(() => accounts.length, [accounts]);
	const detailLoading = transactionsLoading || reconciliationLoading;

	const loadAccounts = async () => {
		try {
			setLoading(true);
			setError('');
			const response = await apiClient.getBankAccounts();
			setAccounts(response.data || []);
		} catch (err) {
			setError(err.message || 'Failed to load bank accounts');
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		loadAccounts();
	}, []);

	const resetForm = () => {
		setFormData(initialFormState);
		setEditingAccount(null);
		setShowForm(false);
	};

	const handleOpenCreate = () => {
		setSuccessMessage('');
		setError('');
		setEditingAccount(null);
		setFormData(initialFormState);
		setShowForm(true);
	};

	const handleOpenEdit = (account) => {
		setSuccessMessage('');
		setError('');
		setEditingAccount(account);
		setFormData({
			account_nickname: account.account_nickname || '',
			account_number: account.account_number || '',
			account_holder_name: account.account_holder_name || '',
			bank_name: account.bank_name || '',
			branch_name: account.branch_name || '',
			currency: account.currency || 'LKR',
			opening_balance: account.opening_balance ?? '0',
			opening_balance_date: account.opening_balance_date ? account.opening_balance_date.slice(0, 10) : ''
		});
		setShowForm(true);
	};

	const handleSubmit = async (e) => {
		e.preventDefault();
		try {
			setSubmitting(true);
			setError('');
			setSuccessMessage('');

			if (editingAccount) {
				await apiClient.updateBankAccount(editingAccount.account_id, formData);
				setSuccessMessage('Bank account updated successfully.');
			} else {
				await apiClient.createBankAccount(formData);
				setSuccessMessage('Bank account created successfully.');
			}

			resetForm();
			await loadAccounts();
		} catch (err) {
			setError(err.message || 'Failed to save bank account');
		} finally {
			setSubmitting(false);
		}
	};

	const handleDeactivate = async (account) => {
		const confirmed = window.confirm(
			`Deactivate ${account.account_nickname} (${account.account_number})?`
		);
		if (!confirmed) return;

		try {
			setError('');
			setSuccessMessage('');
			await apiClient.deactivateBankAccount(account.account_id);
			setSuccessMessage('Bank account deactivated successfully.');

			if (selectedAccount?.account_id === account.account_id) {
				setSelectedAccount(null);
				setTransactions([]);
				setTransactionsSummary(null);
				setReconciliationReport(null);
			}

			await loadAccounts();
		} catch (err) {
			setError(err.message || 'Failed to deactivate bank account');
		}
	};

	const handleOpenPettyCashForm = () => {
		setPettyCashError('');
		setPettyCashForm(initialPettyCashForm);
		setShowPettyCashForm(true);
	};

	const handlePettyCashCategoryChange = (category) => {
		const cfg = MANUAL_CATEGORIES.find((c) => c.value === category);
		setPettyCashForm((prev) => ({ ...prev, category, direction: cfg?.direction || prev.direction }));
	};

	const handleSubmitPettyCash = async (e) => {
		e.preventDefault();
		try {
			setPettyCashSubmitting(true);
			setPettyCashError('');
			await apiClient.recordPettyCashTransaction(pettyCashForm);
			setShowPettyCashForm(false);
			setSuccessMessage('Petty cash transaction recorded successfully.');
			await loadAccounts();
			if (selectedAccount?.account_id === pettyCashAccount?.account_id) {
				await refreshDetail();
			}
		} catch (err) {
			setPettyCashError(err.message || 'Failed to record petty cash transaction');
		} finally {
			setPettyCashSubmitting(false);
		}
	};

	const handleOpenTransferForm = () => {
		setTransferError('');
		setTransferForm(initialTransferForm);
		setShowTransferForm(true);
	};

	const handleSubmitTransfer = async (e) => {
		e.preventDefault();
		if (transferForm.from_account_id && transferForm.from_account_id === transferForm.to_account_id) {
			setTransferError('Source and destination accounts must be different.');
			return;
		}
		try {
			setTransferSubmitting(true);
			setTransferError('');
			await apiClient.transferBankFunds(transferForm);
			setShowTransferForm(false);
			setSuccessMessage(`Transferred ${formatMoney(transferForm.amount)} from ${transferFromAccount?.account_nickname} to ${transferToAccount?.account_nickname}.`);
			await loadAccounts();
			if (selectedAccount && [transferForm.from_account_id, transferForm.to_account_id].includes(selectedAccount.account_id)) {
				await refreshDetail();
			}
		} catch (err) {
			setTransferError(err.message || 'Failed to transfer funds');
		} finally {
			setTransferSubmitting(false);
		}
	};

	const loadTransactionsForAccount = async (account, filters = transactionsFilters) => {
		try {
			setTransactionsLoading(true);
			setError('');

			const apiFilters = {};
			if (filters.start_date) apiFilters.start_date = filters.start_date;
			if (filters.end_date) apiFilters.end_date = filters.end_date;
			if (filters.verified) apiFilters.verified = filters.verified;

			const response = await apiClient.getBankAccountTransactions(account.account_id, apiFilters);
			setSelectedAccount(response.account || account);
			setTransactions(response.transactions || []);
			setTransactionsSummary(response.summary || null);
		} catch (err) {
			setError(err.message || 'Failed to load account transactions');
			setTransactions([]);
			setTransactionsSummary(null);
		} finally {
			setTransactionsLoading(false);
		}
	};

	const loadReconciliationForAccount = async (account) => {
		try {
			setReconciliationLoading(true);
			setError('');
			const response = await apiClient.getBankAccountReconciliation(account.account_id);
			setReconciliationReport(response);
		} catch (err) {
			setError(err.message || 'Failed to load reconciliation report');
			setReconciliationReport(null);
		} finally {
			setReconciliationLoading(false);
		}
	};

	const handleViewAccount = async (account) => {
		if (selectedAccount?.account_id === account.account_id) {
			setSelectedAccount(null);
			return;
		}
		setSelectedAccount(account);
		setAuditMode(false);
		setMonthFilter('');
		const resetFilters = { start_date: '', end_date: '', verified: '' };
		setTransactionsFilters(resetFilters);
		await Promise.all([
			loadTransactionsForAccount(account, resetFilters),
			loadReconciliationForAccount(account)
		]);
	};

	const handleMonthFilterChange = async (value) => {
		setMonthFilter(value);
		const nextFilters = value
			? { ...transactionsFilters, ...monthToRange(value) }
			: { ...transactionsFilters, start_date: '', end_date: '' };
		setTransactionsFilters(nextFilters);
		if (selectedAccount) {
			await loadTransactionsForAccount(selectedAccount, nextFilters);
		}
	};

	const handleVerifyTransaction = async (tx, verified) => {
		if (!selectedAccount) return;
		try {
			setVerifyingId(tx.transaction_id);
			setError('');
			const response = await apiClient.verifyBankAccountTransaction(selectedAccount.account_id, tx.transaction_id, verified);
			setTransactions((prev) => prev.map((t) => (
				t.transaction_id === tx.transaction_id
					? { ...t, ...response.data, bank_verified_by_name: verified ? t.bank_verified_by_name : null }
					: t
			)));
			setTransactionsSummary((prev) => prev && ({
				...prev,
				verified_count: prev.verified_count + (verified ? 1 : -1),
				unverified_count: prev.unverified_count + (verified ? -1 : 1),
			}));
		} catch (err) {
			setError(err.message || 'Failed to update verification status');
		} finally {
			setVerifyingId(null);
		}
	};

	const handleDownloadSheet = () => {
		if (!selectedAccount || transactions.length === 0) return;
		const headers = ['Date', 'Party', 'Category', 'Method', 'Reference', 'Status', 'Bank Verified', 'Verified By', 'Amount'];
		const rows = transactions.map((tx) => {
			const related = relatedTo(tx);
			return [
				new Date(tx.created_at).toLocaleString(),
				[related.primary, related.secondary].filter(Boolean).join(' - '),
				tx.category,
				tx.payment_method || '',
				tx.reference_number || '',
				tx.status,
				tx.bank_verified ? 'Yes' : 'No',
				tx.bank_verified_by_name || '',
				`${flowSign(tx.category, tx.transaction_type)}${parseFloat(tx.amount || 0).toFixed(2)}`
			];
		});
		const csv = [headers, ...rows].map((row) => row.map(csvEscape).join(',')).join('\n');
		const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
		const url = URL.createObjectURL(blob);
		const link = document.createElement('a');
		const suffix = monthFilter || `${transactionsFilters.start_date || 'all'}_to_${transactionsFilters.end_date || 'all'}`;
		link.href = url;
		link.download = `${selectedAccount.account_nickname.replace(/\s+/g, '_')}_${suffix}.csv`;
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);
		URL.revokeObjectURL(url);
	};

	const refreshDetail = async () => {
		if (!selectedAccount) return;
		await Promise.all([
			loadTransactionsForAccount(selectedAccount),
			loadReconciliationForAccount(selectedAccount)
		]);
	};

	const applyTransactionFilters = async (e) => {
		e.preventDefault();
		if (!selectedAccount) return;
		await loadTransactionsForAccount(selectedAccount);
	};

	return (
		<AdminLayout
			title="Bank Account Management"
			subtitle="Manage receiving accounts, inspect account transactions, and review reconciliation summaries."
			actions={
				<div className="flex items-center gap-2">
					<button onClick={loadAccounts} title="Refresh" className={iconBtnCls}>
						<RefreshCw className="h-4 w-4" />
					</button>
					{accounts.length >= 2 && (
						<button onClick={handleOpenTransferForm} className={ghostBtnCls}>
							<ArrowRightLeft className="h-4 w-4" />
							Transfer Funds
						</button>
					)}
					{pettyCashAccount && (
						<button onClick={handleOpenPettyCashForm} className={ghostBtnCls}>
							<Coins className="h-4 w-4" />
							Record Petty Cash Transaction
						</button>
					)}
					<button onClick={handleOpenCreate} className={primaryBtnCls}>
						<Plus className="h-4 w-4" />
						New Account
					</button>
				</div>
			}
		>
			<div className="space-y-5">
				{error && (
					<div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">{error}</div>
				)}

				{successMessage && (
					<div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-700">{successMessage}</div>
				)}

				{/* ── Accounts list ────────────────────────────────────────────── */}
				<div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
					<div className="border-b border-slate-100 px-5 py-3.5">
						<h2 className="text-sm font-semibold text-slate-900">Active Bank Accounts</h2>
						<p className="text-xs text-slate-400 mt-0.5">Click a row to view its transactions and reconciliation status.</p>
					</div>

					{loading ? (
						<div className="flex items-center justify-center h-40">
							<div className="text-sm text-slate-400">Loading bank accounts…</div>
						</div>
					) : accounts.length === 0 ? (
						<div className="flex flex-col items-center gap-2 py-16 text-slate-400">
							<Landmark className="h-8 w-8" />
							<p className="text-sm">No active bank accounts found.</p>
						</div>
					) : (
						<div className="overflow-x-auto">
							<table className="w-full text-sm">
								<thead>
									<tr className="border-b border-slate-200 bg-slate-50">
										<th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Account</th>
										<th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Bank</th>
										<th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Holder</th>
										<th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Currency</th>
										<th className="text-right px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Opening Balance</th>
										<th className="text-right px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Current Balance</th>
										<th className="px-5 py-3" />
									</tr>
								</thead>
								<tbody className="divide-y divide-slate-100">
									{accounts.map((account) => {
										const isSelected = selectedAccount?.account_id === account.account_id;
										return (
											<tr
												key={account.account_id}
												onClick={() => handleViewAccount(account)}
												className={`cursor-pointer transition-colors ${isSelected ? 'bg-blue-50/60' : 'hover:bg-slate-50'}`}
											>
												<td className="px-5 py-3">
													<p className="font-semibold text-slate-900 leading-tight flex items-center gap-1.5">
														{account.account_nickname}
														{account.is_petty_cash && (
															<span className="inline-flex items-center gap-1 rounded-full bg-amber-50 text-amber-700 text-[10px] font-semibold px-1.5 py-0.5">
																<Coins className="h-2.5 w-2.5" />
																Petty Cash
															</span>
														)}
													</p>
													<p className="text-xs text-slate-400 font-mono">{account.account_number}</p>
												</td>
												<td className="px-5 py-3 text-slate-600">
													{account.bank_name}
													{account.branch_name && <span className="block text-xs text-slate-400">{account.branch_name}</span>}
												</td>
												<td className="px-5 py-3 text-slate-600">{account.account_holder_name}</td>
												<td className="px-5 py-3 text-slate-600">{account.currency}</td>
												<td className="px-5 py-3 text-right text-slate-500">{formatMoney(account.opening_balance)}</td>
												<td className="px-5 py-3 text-right font-medium text-slate-900">{formatMoney(account.current_balance ?? account.opening_balance)}</td>
												<td className="px-5 py-3">
													<div className="flex items-center justify-end gap-0.5" onClick={(e) => e.stopPropagation()}>
														<button onClick={() => handleOpenEdit(account)} title="Edit account" className={iconBtnCls}>
															<Pencil className="h-3.5 w-3.5" />
														</button>
														{!account.is_petty_cash && (
															<button
																onClick={() => handleDeactivate(account)}
																title="Deactivate account"
																className="inline-flex items-center justify-center w-7 h-7 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
															>
																<Trash2 className="h-3.5 w-3.5" />
															</button>
														)}
														<ChevronRight className={`w-4 h-4 ml-1 transition-transform ${isSelected ? 'rotate-90 text-blue-500' : 'text-slate-300'}`} />
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

				{/* ── Selected account detail ──────────────────────────────────── */}
				{selectedAccount && (
					<div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
						<div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-3.5">
							<div>
								<h3 className="text-sm font-semibold text-slate-900">
									{selectedAccount.account_nickname}
									<span className="ml-2 font-mono text-xs font-normal text-slate-400">{selectedAccount.account_number}</span>
								</h3>
								<p className="text-xs text-slate-400 mt-0.5">Transactions and reconciliation status for this account</p>
							</div>
							<div className="flex items-center gap-1 shrink-0">
								<button
									onClick={handleDownloadSheet}
									title="Download bank sheet (CSV)"
									disabled={transactions.length === 0}
									className={`${ghostBtnCls} disabled:opacity-50 disabled:cursor-not-allowed`}
								>
									<Download className="h-3.5 w-3.5" />
									Download
								</button>
								{isSuperAdmin && (
									<button
										onClick={() => setAuditMode((prev) => !prev)}
										title="Toggle audit mode"
										className={auditMode
											? 'inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-500 transition-colors'
											: ghostBtnCls}
									>
										<ShieldCheck className="h-3.5 w-3.5" />
										Audit Mode
									</button>
								)}
								<button onClick={refreshDetail} title="Refresh" className={iconBtnCls}>
									<RefreshCw className={`h-4 w-4 ${detailLoading ? 'animate-spin' : ''}`} />
								</button>
								<button onClick={() => setSelectedAccount(null)} title="Close" className={iconBtnCls}>
									<X className="h-4 w-4" />
								</button>
							</div>
						</div>

						<div className="p-5 space-y-4">
							{/* One merged summary row — replaces two separate stat panels that used to repeat the same numbers */}
							<div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
								<StatTile label="Transactions" value={transactionsSummary?.transaction_count ?? '—'} />
								<StatTile label="Completed" value={formatMoney(transactionsSummary?.total_completed)} tone="emerald" />
								<StatTile label="Pending" value={formatMoney(transactionsSummary?.total_pending)} tone="amber" />
								<StatTile label="Closing Balance" value={formatMoney(reconciliationReport?.summary?.closing_balance)} tone="blue" />
								<StatTile
									label="Bank Verified"
									value={transactionsSummary ? `${transactionsSummary.verified_count} / ${transactionsSummary.transaction_count}` : '—'}
									tone="emerald"
								/>
							</div>

							{/* Filters — flat inline toolbar */}
							<form onSubmit={applyTransactionFilters} className="flex flex-wrap items-end gap-3">
								<Field label="Month">
									<select
										value={monthFilter}
										onChange={(e) => handleMonthFilterChange(e.target.value)}
										className={inputCls}
									>
										<option value="">Custom range</option>
										{monthOptions().map((m) => (
											<option key={m.value} value={m.value}>{m.label}</option>
										))}
									</select>
								</Field>
								<Field label="From">
									<DateInput
										value={transactionsFilters.start_date}
										onChange={(e) => { setMonthFilter(''); setTransactionsFilters({ ...transactionsFilters, start_date: e.target.value }); }}
										className={inputCls}
									/>
								</Field>
								<Field label="To">
									<DateInput
										value={transactionsFilters.end_date}
										onChange={(e) => { setMonthFilter(''); setTransactionsFilters({ ...transactionsFilters, end_date: e.target.value }); }}
										className={inputCls}
									/>
								</Field>
								<Field label="Verification">
									<select
										value={transactionsFilters.verified}
										onChange={(e) => setTransactionsFilters({ ...transactionsFilters, verified: e.target.value })}
										className={inputCls}
									>
										<option value="">All</option>
										<option value="true">Verified</option>
										<option value="false">Unverified</option>
									</select>
								</Field>
								<button type="submit" className={primaryBtnCls}>Apply</button>
							</form>

							{/* Transactions table — single source of truth; the reconciliation
							    panel used to render this exact same data a second time. */}
							{transactionsLoading ? (
								<div className="flex items-center justify-center h-32">
									<div className="text-sm text-slate-400">Loading transactions…</div>
								</div>
							) : transactions.length === 0 ? (
								<div className="flex flex-col items-center justify-center gap-2 py-12 text-slate-400">
									<Wallet className="w-6 h-6" />
									<p className="text-sm">No transactions found for this account.</p>
								</div>
							) : (
								<div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
									<div className="overflow-x-auto">
										<table className="w-full text-sm">
											<thead>
												<tr className="border-b border-slate-200 bg-slate-50">
													{auditMode && isSuperAdmin && (
														<th className="px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Verify</th>
													)}
													<th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Date</th>
													<th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Party</th>
													<th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Category</th>
													<th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Method</th>
													<th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Reference</th>
													<th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
													{!auditMode && (
														<th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Bank Verified</th>
													)}
													<th className="text-right px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Amount</th>
												</tr>
											</thead>
											<tbody className="divide-y divide-slate-100">
												{transactions.map((tx) => {
													const related = relatedTo(tx);
													return (
														<tr key={tx.transaction_id} className={`hover:bg-slate-50 transition-colors ${tx.bank_verified ? 'bg-emerald-50/30' : ''}`}>
															{auditMode && isSuperAdmin && (
																<td className="px-4 py-2.5">
																	<input
																		type="checkbox"
																		checked={!!tx.bank_verified}
																		disabled={verifyingId === tx.transaction_id}
																		onChange={(e) => handleVerifyTransaction(tx, e.target.checked)}
																		className="h-4 w-4 rounded border-slate-300 text-violet-600 focus:ring-violet-400 cursor-pointer disabled:opacity-50"
																	/>
																</td>
															)}
															<td className="px-4 py-2.5 text-slate-600 whitespace-nowrap">{new Date(tx.created_at).toLocaleString()}</td>
															<td className="px-4 py-2.5 text-slate-600">
																<p className="font-medium text-slate-700">{related.primary}</p>
																{related.secondary && <p className="text-xs text-slate-400">{related.secondary}</p>}
															</td>
															<td className="px-4 py-2.5 whitespace-nowrap">{categoryBadge(tx.category, tx.custom_category_label)}</td>
															<td className="px-4 py-2.5 text-slate-600">{tx.payment_method || '—'}</td>
															<td className="px-4 py-2.5 text-slate-500 font-mono text-xs">{tx.reference_number || '—'}</td>
															<td className="px-4 py-2.5 whitespace-nowrap"><StatusDot status={tx.status} /></td>
															{!auditMode && (
																<td className="px-4 py-2.5 whitespace-nowrap">
																	{tx.bank_verified ? (
																		<span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
																			<CheckCircle2 className="w-3.5 h-3.5" />
																			Verified
																		</span>
																	) : (
																		<span className="text-xs text-slate-400">—</span>
																	)}
																</td>
															)}
															<td className={`px-4 py-2.5 text-right font-medium ${flowAmountClass(tx.category, tx.transaction_type)}`}>
																{flowSign(tx.category, tx.transaction_type)}{formatMoney(tx.amount)}
															</td>
														</tr>
													);
												})}
											</tbody>
										</table>
									</div>
								</div>
							)}
						</div>
					</div>
				)}

				{!selectedAccount && !loading && accounts.length > 0 && (
					<div className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 text-slate-600">
						<AlertTriangle className="mt-0.5 h-4 w-4 text-slate-400 shrink-0" />
						<p className="text-sm">Select an account from the list above to view its transactions and reconciliation status.</p>
					</div>
				)}
			</div>

			{/* ── Create / Edit drawer ─────────────────────────────────────────── */}
			{showForm && (
				<div className="fixed inset-0 z-50 flex">
					<div className="flex-1 bg-black/30" onClick={resetForm} />

					<div className="w-full max-w-md bg-white flex flex-col shadow-2xl overflow-hidden">
						<div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 flex-shrink-0">
							<h2 className="text-sm font-semibold text-slate-900">
								{editingAccount ? 'Edit Bank Account' : 'Create Bank Account'}
							</h2>
							<button onClick={resetForm} className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-md transition-colors">
								<X className="w-4 h-4" />
							</button>
						</div>

						<form onSubmit={handleSubmit} id="bank-account-form" className="flex-1 overflow-y-auto">
							<SectionHeader title="Account Details" />
							<div className="px-5 pt-4 pb-2 space-y-3">
								<Field label="Account Nickname" required>
									<input
										required
										value={formData.account_nickname}
										onChange={(e) => setFormData({ ...formData, account_nickname: e.target.value })}
										className={inputCls}
									/>
								</Field>
								<Field label="Account Number" required>
									<input
										required
										value={formData.account_number}
										onChange={(e) => setFormData({ ...formData, account_number: e.target.value })}
										className={inputCls}
									/>
								</Field>
								<Field label="Account Holder Name" required>
									<input
										required
										value={formData.account_holder_name}
										onChange={(e) => setFormData({ ...formData, account_holder_name: e.target.value })}
										className={inputCls}
									/>
								</Field>
								<div className="grid grid-cols-2 gap-3">
									<Field label="Bank Name" required>
										<input
											required
											value={formData.bank_name}
											onChange={(e) => setFormData({ ...formData, bank_name: e.target.value })}
											className={inputCls}
										/>
									</Field>
									<Field label="Branch Name">
										<input
											value={formData.branch_name}
											onChange={(e) => setFormData({ ...formData, branch_name: e.target.value })}
											className={inputCls}
										/>
									</Field>
								</div>
								<Field label="Currency">
									<input
										value={formData.currency}
										onChange={(e) => setFormData({ ...formData, currency: e.target.value.toUpperCase() })}
										className={`${inputCls} uppercase`}
									/>
								</Field>
							</div>

							{!editingAccount && (
								<>
									<SectionHeader title="Opening Balance" />
									<div className="px-5 pt-4 pb-6 space-y-3">
										<Field label="Opening Balance">
											<input
												type="number"
												step="0.01"
												value={formData.opening_balance}
												onChange={(e) => setFormData({ ...formData, opening_balance: e.target.value })}
												onWheel={(e) => e.target.blur()}
												className={inputCls}
											/>
										</Field>
										<Field label="Opening Balance Date">
											<DateInput
												value={formData.opening_balance_date}
												onChange={(e) => setFormData({ ...formData, opening_balance_date: e.target.value })}
												className={inputCls}
											/>
										</Field>
									</div>
								</>
							)}
						</form>

						<div className="flex items-center gap-2 px-5 py-4 border-t border-slate-200 bg-slate-50 flex-shrink-0">
							<button type="button" onClick={resetForm}
								className="flex-1 px-4 py-2 border border-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-100 transition-colors">
								Cancel
							</button>
							<button
								type="submit"
								form="bank-account-form"
								disabled={submitting}
								className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
							>
								{submitting ? 'Saving…' : editingAccount ? 'Save Changes' : 'Create Account'}
							</button>
						</div>
					</div>
				</div>
			)}

			{/* ── Petty Cash transaction drawer ──────────────────────────────── */}
			{showPettyCashForm && (
				<div className="fixed inset-0 z-50 flex">
					<div className="flex-1 bg-black/30" onClick={() => setShowPettyCashForm(false)} />

					<div className="w-full max-w-md bg-white flex flex-col shadow-2xl overflow-hidden">
						<div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 flex-shrink-0">
							<h2 className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
								<Coins className="h-4 w-4 text-amber-500" />
								Record Petty Cash Transaction
							</h2>
							<button onClick={() => setShowPettyCashForm(false)} className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-md transition-colors">
								<X className="w-4 h-4" />
							</button>
						</div>

						{pettyCashError && (
							<div className="mx-5 mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{pettyCashError}</div>
						)}

						<form onSubmit={handleSubmitPettyCash} id="petty-cash-form" className="flex-1 overflow-y-auto">
							<div className="px-5 pt-4 pb-6 space-y-3">
								<Field label="Category" required>
									<select
										required
										value={pettyCashForm.category}
										onChange={(e) => handlePettyCashCategoryChange(e.target.value)}
										className={inputCls}
									>
										{MANUAL_CATEGORIES.map((c) => (
											<option key={c.value} value={c.value}>{c.label}</option>
										))}
									</select>
								</Field>
								<Field label="Direction" required>
									<select
										required
										value={pettyCashForm.direction}
										onChange={(e) => setPettyCashForm({ ...pettyCashForm, direction: e.target.value })}
										className={inputCls}
									>
										<option value="CREDIT">Cash In (deposit)</option>
										<option value="DEBIT">Cash Out (expense)</option>
									</select>
								</Field>
								<Field label="Amount" required>
									<input
										required
										type="number"
										step="0.01"
										min="0.01"
										value={pettyCashForm.amount}
										onChange={(e) => setPettyCashForm({ ...pettyCashForm, amount: e.target.value })}
										onWheel={(e) => e.target.blur()}
										className={inputCls}
									/>
								</Field>
								<Field label="Paid To / Received From" required>
									<input
										required
										value={pettyCashForm.external_party}
										onChange={(e) => setPettyCashForm({ ...pettyCashForm, external_party: e.target.value })}
										className={inputCls}
									/>
								</Field>
								<Field label="Reference Number">
									<input
										value={pettyCashForm.reference_number}
										onChange={(e) => setPettyCashForm({ ...pettyCashForm, reference_number: e.target.value })}
										className={inputCls}
									/>
								</Field>
								<Field label="Transaction Date">
									<DateInput
										value={pettyCashForm.transaction_date}
										onChange={(e) => setPettyCashForm({ ...pettyCashForm, transaction_date: e.target.value })}
										className={inputCls}
									/>
								</Field>
								<Field label="Notes">
									<textarea
										rows={3}
										value={pettyCashForm.notes}
										onChange={(e) => setPettyCashForm({ ...pettyCashForm, notes: e.target.value })}
										className={inputCls}
									/>
								</Field>
							</div>
						</form>

						<div className="flex items-center gap-2 px-5 py-4 border-t border-slate-200 bg-slate-50 flex-shrink-0">
							<button type="button" onClick={() => setShowPettyCashForm(false)}
								className="flex-1 px-4 py-2 border border-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-100 transition-colors">
								Cancel
							</button>
							<button
								type="submit"
								form="petty-cash-form"
								disabled={pettyCashSubmitting}
								className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
							>
								{pettyCashSubmitting ? 'Saving…' : 'Record Transaction'}
							</button>
						</div>
					</div>
				</div>
			)}

			{/* ── Transfer Funds modal ─────────────────────────────────────────── */}
			{showTransferForm && (
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
					<div className="w-full max-w-lg rounded-xl bg-white border border-slate-200 shadow-2xl max-h-[90vh] overflow-y-auto">
						<div className="flex items-start justify-between border-b border-slate-100 px-5 py-4">
							<div className="min-w-0">
								<h3 className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
									<ArrowRightLeft className="h-4 w-4 text-blue-600" />
									Transfer Funds
								</h3>
								<p className="text-xs text-slate-400 mt-0.5">Move money between two company accounts, including Petty Cash.</p>
							</div>
							<button type="button" onClick={() => setShowTransferForm(false)} className="shrink-0 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
								<X className="h-4 w-4" />
							</button>
						</div>

						<form onSubmit={handleSubmitTransfer} className="px-5 py-4 space-y-5">
							{transferError && (
								<div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-700">{transferError}</div>
							)}

							{/* From / To account pickers with a swap shortcut in between */}
							<div>
								<p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Accounts</p>
								<div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
									<div>
										<label className="mb-1 block text-[11px] font-medium text-slate-500">From</label>
										<select
											required
											value={transferForm.from_account_id}
											onChange={(e) => setTransferForm({ ...transferForm, from_account_id: e.target.value })}
											className={inputCls}
										>
											<option value="">Select account</option>
											{accounts.map((a) => (
												<option key={a.account_id} value={a.account_id} disabled={a.account_id === transferForm.to_account_id}>
													{a.account_nickname}{a.is_petty_cash ? ' (Petty Cash)' : ''}
												</option>
											))}
										</select>
									</div>

									<button
										type="button"
										title="Swap accounts"
										disabled={!transferForm.from_account_id && !transferForm.to_account_id}
										onClick={() => setTransferForm((prev) => ({ ...prev, from_account_id: prev.to_account_id, to_account_id: prev.from_account_id }))}
										className="inline-flex items-center justify-center w-8 h-8 mb-0.5 rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-blue-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
									>
										<ArrowRightLeft className="h-3.5 w-3.5" />
									</button>

									<div>
										<label className="mb-1 block text-[11px] font-medium text-slate-500">To</label>
										<select
											required
											value={transferForm.to_account_id}
											onChange={(e) => setTransferForm({ ...transferForm, to_account_id: e.target.value })}
											className={inputCls}
										>
											<option value="">Select account</option>
											{accounts.map((a) => (
												<option key={a.account_id} value={a.account_id} disabled={a.account_id === transferForm.from_account_id}>
													{a.account_nickname}{a.is_petty_cash ? ' (Petty Cash)' : ''}
												</option>
											))}
										</select>
									</div>
								</div>
							</div>

							{/* Amount — big, prominent input matching PaymentAllocationModal's style */}
							<div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
								<label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
									Amount to Transfer
								</label>
								<div className="flex items-center gap-2">
									<span className="text-lg font-semibold text-slate-400">LKR</span>
									<input
										required
										type="number"
										min="0.01"
										step="0.01"
										value={transferForm.amount}
										onChange={(e) => setTransferForm({ ...transferForm, amount: e.target.value })}
										onWheel={(e) => e.target.blur()}
										placeholder="0.00"
										className="w-full bg-transparent text-2xl font-semibold text-slate-900 outline-none placeholder-slate-300"
									/>
								</div>
								{transferFromAccount && (
									<p className={`mt-1.5 text-xs ${transferExceedsBalance ? 'text-red-600' : 'text-slate-400'}`}>
										Available in {transferFromAccount.account_nickname}: {formatMoney(transferFromBalance)}
										{transferExceedsBalance && ' — exceeds available balance'}
									</p>
								)}
							</div>

							<div>
								<p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Details</p>
								<div className="space-y-3">
									<Field label="Reference Number">
										<input
											value={transferForm.reference_number}
											onChange={(e) => setTransferForm({ ...transferForm, reference_number: e.target.value })}
											className={inputCls}
										/>
									</Field>
									<Field label="Transfer Date">
										<DateInput
											value={transferForm.transfer_date}
											onChange={(e) => setTransferForm({ ...transferForm, transfer_date: e.target.value })}
											className={inputCls}
										/>
									</Field>
									<Field label="Notes">
										<textarea
											rows={2}
											value={transferForm.notes}
											onChange={(e) => setTransferForm({ ...transferForm, notes: e.target.value })}
											placeholder="Notes (optional)"
											className={inputCls}
										/>
									</Field>
								</div>
							</div>

							<div className="flex items-center gap-2">
								<button
									type="button"
									onClick={() => setShowTransferForm(false)}
									className="flex-1 px-4 py-2 border border-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-100 transition-colors"
								>
									Cancel
								</button>
								<button
									type="submit"
									disabled={transferSubmitting || transferExceedsBalance}
									className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
								>
									{transferSubmitting ? (<><Loader2 className="h-4 w-4 animate-spin" /> Transferring…</>) : 'Transfer Funds'}
								</button>
							</div>
						</form>
					</div>
				</div>
			)}
		</AdminLayout>
	);
};

export default BankAccounts;
