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
} from 'lucide-react';
import AdminLayout from '../components/AdminLayout';
import apiClient from '../../../api/api';
import { categoryBadge, relatedTo, flowAmountClass, flowSign } from '../../../constants/transactionCategories';
import DateInput from '../../../components/common/DateInput';

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
		status: ''
	});

	const [reconciliationLoading, setReconciliationLoading] = useState(false);
	const [reconciliationReport, setReconciliationReport] = useState(null);

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

	const loadTransactionsForAccount = async (account, filters = transactionsFilters) => {
		try {
			setTransactionsLoading(true);
			setError('');

			const apiFilters = {};
			if (filters.start_date) apiFilters.start_date = filters.start_date;
			if (filters.end_date) apiFilters.end_date = filters.end_date;
			if (filters.status) apiFilters.status = filters.status;

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
		setTransactionsFilters({ start_date: '', end_date: '', status: '' });
		await Promise.all([
			loadTransactionsForAccount(account, { start_date: '', end_date: '', status: '' }),
			loadReconciliationForAccount(account)
		]);
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
													<p className="font-semibold text-slate-900 leading-tight">{account.account_nickname}</p>
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
														<button
															onClick={() => handleDeactivate(account)}
															title="Deactivate account"
															className="inline-flex items-center justify-center w-7 h-7 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
														>
															<Trash2 className="h-3.5 w-3.5" />
														</button>
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
									label="Reconciliation"
									value={reconciliationReport?.summary?.reconciliation_status?.replace(/_/g, ' ') || (reconciliationLoading ? '…' : '—')}
								/>
							</div>

							{/* Filters — flat inline toolbar */}
							<form onSubmit={applyTransactionFilters} className="flex flex-wrap items-end gap-3">
								<Field label="From">
									<DateInput
										value={transactionsFilters.start_date}
										onChange={(e) => setTransactionsFilters({ ...transactionsFilters, start_date: e.target.value })}
										className={inputCls}
									/>
								</Field>
								<Field label="To">
									<DateInput
										value={transactionsFilters.end_date}
										onChange={(e) => setTransactionsFilters({ ...transactionsFilters, end_date: e.target.value })}
										className={inputCls}
									/>
								</Field>
								<Field label="Status">
									<select
										value={transactionsFilters.status}
										onChange={(e) => setTransactionsFilters({ ...transactionsFilters, status: e.target.value })}
										className={inputCls}
									>
										<option value="">All Statuses</option>
										<option value="COMPLETED">Completed</option>
										<option value="PENDING">Pending</option>
										<option value="REJECTED">Rejected</option>
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
													<th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Date</th>
													<th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Party</th>
													<th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Category</th>
													<th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Method</th>
													<th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Reference</th>
													<th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
													<th className="text-right px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Amount</th>
												</tr>
											</thead>
											<tbody className="divide-y divide-slate-100">
												{transactions.map((tx) => {
													const related = relatedTo(tx);
													return (
														<tr key={tx.transaction_id} className="hover:bg-slate-50 transition-colors">
															<td className="px-4 py-2.5 text-slate-600 whitespace-nowrap">{new Date(tx.created_at).toLocaleString()}</td>
															<td className="px-4 py-2.5 text-slate-600">
																<p className="font-medium text-slate-700">{related.primary}</p>
																{related.secondary && <p className="text-xs text-slate-400">{related.secondary}</p>}
															</td>
															<td className="px-4 py-2.5 whitespace-nowrap">{categoryBadge(tx.category)}</td>
															<td className="px-4 py-2.5 text-slate-600">{tx.payment_method || '—'}</td>
															<td className="px-4 py-2.5 text-slate-500 font-mono text-xs">{tx.reference_number || '—'}</td>
															<td className="px-4 py-2.5 whitespace-nowrap"><StatusDot status={tx.status} /></td>
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
		</AdminLayout>
	);
};

export default BankAccounts;
