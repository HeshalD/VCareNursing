import { useEffect, useMemo, useState } from 'react';
import {
	Landmark,
	Plus,
	Pencil,
	Trash2,
	RefreshCw,
	X,
	FileSpreadsheet,
	AlertTriangle
} from 'lucide-react';
import AdminLayout from '../components/AdminLayout';
import apiClient from '../../../api/api';

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
		setSelectedAccount(account);
		setTransactionsFilters({ start_date: '', end_date: '', status: '' });
		await Promise.all([
			loadTransactionsForAccount(account, { start_date: '', end_date: '', status: '' }),
			loadReconciliationForAccount(account)
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
					<button
						onClick={loadAccounts}
						className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
					>
						<RefreshCw className="h-4 w-4" />
						Refresh
					</button>
					<button
						onClick={handleOpenCreate}
						className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
					>
						<Plus className="h-4 w-4" />
						New Account
					</button>
				</div>
			}
		>
			{error && (
				<div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
			)}

			{successMessage && (
				<div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">{successMessage}</div>
			)}

			{showForm && (
				<div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
					<div className="mb-4 flex items-center justify-between">
						<h2 className="text-base font-semibold text-slate-900">
							{editingAccount ? 'Edit Bank Account' : 'Create Bank Account'}
						</h2>
						<button
							onClick={resetForm}
							className="rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
							aria-label="Close"
						>
							<X className="h-4 w-4" />
						</button>
					</div>

					<form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 md:grid-cols-2">
						<label className="space-y-1 text-sm">
							<span className="font-medium text-slate-700">Account Nickname</span>
							<input
								required
								value={formData.account_nickname}
								onChange={(e) => setFormData({ ...formData, account_nickname: e.target.value })}
								className="w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-blue-500"
							/>
						</label>

						<label className="space-y-1 text-sm">
							<span className="font-medium text-slate-700">Account Number</span>
							<input
								required
								value={formData.account_number}
								onChange={(e) => setFormData({ ...formData, account_number: e.target.value })}
								className="w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-blue-500"
							/>
						</label>

						<label className="space-y-1 text-sm">
							<span className="font-medium text-slate-700">Account Holder Name</span>
							<input
								required
								value={formData.account_holder_name}
								onChange={(e) => setFormData({ ...formData, account_holder_name: e.target.value })}
								className="w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-blue-500"
							/>
						</label>

						<label className="space-y-1 text-sm">
							<span className="font-medium text-slate-700">Bank Name</span>
							<input
								required
								value={formData.bank_name}
								onChange={(e) => setFormData({ ...formData, bank_name: e.target.value })}
								className="w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-blue-500"
							/>
						</label>

						<label className="space-y-1 text-sm">
							<span className="font-medium text-slate-700">Branch Name</span>
							<input
								value={formData.branch_name}
								onChange={(e) => setFormData({ ...formData, branch_name: e.target.value })}
								className="w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-blue-500"
							/>
						</label>

						<label className="space-y-1 text-sm">
							<span className="font-medium text-slate-700">Currency</span>
							<input
								value={formData.currency}
								onChange={(e) => setFormData({ ...formData, currency: e.target.value.toUpperCase() })}
								className="w-full rounded-lg border border-slate-200 px-3 py-2 uppercase outline-none focus:border-blue-500"
							/>
						</label>

						{!editingAccount && (
							<>
								<label className="space-y-1 text-sm">
									<span className="font-medium text-slate-700">Opening Balance</span>
									<input
										type="number"
										step="0.01"
										value={formData.opening_balance}
										onChange={(e) => setFormData({ ...formData, opening_balance: e.target.value })}
										className="w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-blue-500"
									/>
								</label>

								<label className="space-y-1 text-sm">
									<span className="font-medium text-slate-700">Opening Balance Date</span>
									<input
										type="date"
										value={formData.opening_balance_date}
										onChange={(e) => setFormData({ ...formData, opening_balance_date: e.target.value })}
										className="w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-blue-500"
									/>
								</label>
							</>
						)}

						<div className="md:col-span-2 flex items-center gap-2 pt-1">
							<button
								type="submit"
								disabled={submitting}
								className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
							>
								{submitting ? 'Saving...' : editingAccount ? 'Save Changes' : 'Create Account'}
							</button>
							<button
								type="button"
								onClick={resetForm}
								className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
							>
								Cancel
							</button>
						</div>
					</form>
				</div>
			)}

			<div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
				<div className="border-b border-slate-200 px-5 py-4">
					<h2 className="text-base font-semibold text-slate-900">Active Bank Accounts ({accountCount})</h2>
				</div>

				{loading ? (
					<div className="p-5 text-sm text-slate-500">Loading bank accounts...</div>
				) : accounts.length === 0 ? (
					<div className="flex flex-col items-center gap-2 p-8 text-slate-500">
						<Landmark className="h-8 w-8" />
						<p className="text-sm">No active bank accounts found.</p>
					</div>
				) : (
					<div className="overflow-x-auto">
						<table className="min-w-full text-sm">
							<thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
								<tr>
									<th className="px-5 py-3">Nickname</th>
									<th className="px-5 py-3">Bank</th>
									<th className="px-5 py-3">Account Number</th>
									<th className="px-5 py-3">Holder</th>
									<th className="px-5 py-3">Currency</th>
									<th className="px-5 py-3 text-right">Opening Balance</th>
									<th className="px-5 py-3 text-right">Actions</th>
								</tr>
							</thead>
							<tbody>
								{accounts.map((account) => (
									<tr key={account.account_id} className="border-t border-slate-100">
										<td className="px-5 py-3 font-medium text-slate-900">{account.account_nickname}</td>
										<td className="px-5 py-3 text-slate-700">{account.bank_name}</td>
										<td className="px-5 py-3 text-slate-700">{account.account_number}</td>
										<td className="px-5 py-3 text-slate-700">{account.account_holder_name}</td>
										<td className="px-5 py-3 text-slate-700">{account.currency}</td>
										<td className="px-5 py-3 text-right text-slate-700">{formatMoney(account.opening_balance)}</td>
										<td className="px-5 py-3">
											<div className="flex items-center justify-end gap-2">
												<button
													onClick={() => handleViewAccount(account)}
													className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
												>
													View
												</button>
												<button
													onClick={() => handleOpenEdit(account)}
													className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
												>
													<Pencil className="h-3.5 w-3.5" /> Edit
												</button>
												<button
													onClick={() => handleDeactivate(account)}
													className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
												>
													<Trash2 className="h-3.5 w-3.5" /> Deactivate
												</button>
											</div>
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				)}
			</div>

			{selectedAccount && (
				<div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
					<div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
						<div className="mb-4 flex items-start justify-between">
							<div>
								<h3 className="text-base font-semibold text-slate-900">Transactions</h3>
								<p className="text-sm text-slate-500">
									{selectedAccount.account_nickname} ({selectedAccount.account_number})
								</p>
							</div>
							<button
								onClick={() => loadTransactionsForAccount(selectedAccount)}
								className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
							>
								<RefreshCw className="h-3.5 w-3.5" /> Refresh
							</button>
						</div>

						<form onSubmit={applyTransactionFilters} className="mb-4 grid grid-cols-1 gap-2 md:grid-cols-4">
							<input
								type="date"
								value={transactionsFilters.start_date}
								onChange={(e) => setTransactionsFilters({ ...transactionsFilters, start_date: e.target.value })}
								className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500"
							/>
							<input
								type="date"
								value={transactionsFilters.end_date}
								onChange={(e) => setTransactionsFilters({ ...transactionsFilters, end_date: e.target.value })}
								className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500"
							/>
							<select
								value={transactionsFilters.status}
								onChange={(e) => setTransactionsFilters({ ...transactionsFilters, status: e.target.value })}
								className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500"
							>
								<option value="">All Statuses</option>
								<option value="COMPLETED">Completed</option>
								<option value="PENDING">Pending</option>
								<option value="REJECTED">Rejected</option>
							</select>
							<button
								type="submit"
								className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
							>
								Apply Filters
							</button>
						</form>

						{transactionsSummary && (
							<div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
								<div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
									<p className="text-xs text-slate-500">Transactions</p>
									<p className="text-base font-semibold text-slate-900">{transactionsSummary.transaction_count}</p>
								</div>
								<div className="rounded-xl border border-slate-200 bg-green-50 p-3">
									<p className="text-xs text-green-700">Completed</p>
									<p className="text-base font-semibold text-green-800">{formatMoney(transactionsSummary.total_completed)}</p>
								</div>
								<div className="rounded-xl border border-slate-200 bg-amber-50 p-3">
									<p className="text-xs text-amber-700">Pending</p>
									<p className="text-base font-semibold text-amber-800">{formatMoney(transactionsSummary.total_pending)}</p>
								</div>
							</div>
						)}

						{transactionsLoading ? (
							<p className="text-sm text-slate-500">Loading transactions...</p>
						) : transactions.length === 0 ? (
							<p className="text-sm text-slate-500">No transactions found for this account.</p>
						) : (
							<div className="overflow-x-auto">
								<table className="min-w-full text-sm">
									<thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
										<tr>
											<th className="px-4 py-2">Date</th>
											<th className="px-4 py-2">Client</th>
											<th className="px-4 py-2">Category</th>
											<th className="px-4 py-2">Method</th>
											<th className="px-4 py-2">Reference</th>
											<th className="px-4 py-2">Status</th>
											<th className="px-4 py-2 text-right">Amount</th>
										</tr>
									</thead>
									<tbody>
										{transactions.map((tx) => (
											<tr key={tx.transaction_id} className="border-t border-slate-100">
												<td className="px-4 py-2 text-slate-700">{new Date(tx.created_at).toLocaleString()}</td>
												<td className="px-4 py-2 text-slate-700">{tx.client_name || '-'}</td>
												<td className="px-4 py-2 text-slate-700">{tx.category}</td>
												<td className="px-4 py-2 text-slate-700">{tx.payment_method || '-'}</td>
												<td className="px-4 py-2 text-slate-700">{tx.reference_number || '-'}</td>
												<td className="px-4 py-2">
													<span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">
														{tx.status}
													</span>
												</td>
												<td className="px-4 py-2 text-right font-medium text-slate-900">{formatMoney(tx.amount)}</td>
											</tr>
										))}
									</tbody>
								</table>
							</div>
						)}
					</div>

					<div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
						<div className="mb-3 flex items-center gap-2">
							<FileSpreadsheet className="h-4 w-4 text-slate-600" />
							<h3 className="text-base font-semibold text-slate-900">Reconciliation</h3>
						</div>

						{reconciliationLoading ? (
							<p className="text-sm text-slate-500">Loading reconciliation...</p>
						) : !reconciliationReport ? (
							<div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
								No reconciliation report loaded.
							</div>
						) : (
							<div className="space-y-3">
								<div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
									<p className="text-xs text-slate-500">Opening Balance</p>
									<p className="text-base font-semibold text-slate-900">
										{formatMoney(reconciliationReport.summary?.opening_balance)}
									</p>
								</div>
								<div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
									<p className="text-xs text-slate-500">Total Deposits</p>
									<p className="text-base font-semibold text-slate-900">
										{formatMoney(reconciliationReport.summary?.total_deposits)}
									</p>
								</div>
								<div className="rounded-xl border border-green-200 bg-green-50 p-3">
									<p className="text-xs text-green-700">Closing Balance</p>
									<p className="text-base font-semibold text-green-800">
										{formatMoney(reconciliationReport.summary?.closing_balance)}
									</p>
								</div>
								<div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
									<p className="text-xs text-slate-500">Transaction Count</p>
									<p className="text-base font-semibold text-slate-900">
										{reconciliationReport.summary?.transaction_count || 0}
									</p>
								</div>
								<div className="rounded-xl border border-blue-200 bg-blue-50 p-3">
									<p className="text-xs text-blue-700">Status</p>
									<p className="text-base font-semibold text-blue-800">
										{reconciliationReport.summary?.reconciliation_status || 'READY_FOR_REVIEW'}
									</p>
								</div>

								<div className="pt-1">
									<h4 className="mb-2 text-sm font-semibold text-slate-800">Reconciliation Details</h4>

									{reconciliationReport.transactions?.length ? (
										<div className="max-h-80 overflow-auto rounded-lg border border-slate-200">
											<table className="min-w-full text-xs">
												<thead className="bg-slate-50 text-left uppercase tracking-wide text-slate-500">
													<tr>
														<th className="px-3 py-2">Date</th>
														<th className="px-3 py-2">Category</th>
														<th className="px-3 py-2">Method</th>
														<th className="px-3 py-2 text-right">Amount</th>
													</tr>
												</thead>
												<tbody>
													{reconciliationReport.transactions.map((item) => (
														<tr key={item.transaction_id} className="border-t border-slate-100">
															<td className="px-3 py-2 text-slate-700">{new Date(item.date).toLocaleString()}</td>
															<td className="px-3 py-2 text-slate-700">{item.category || '-'}</td>
															<td className="px-3 py-2 text-slate-700">{item.payment_method || '-'}</td>
															<td className="px-3 py-2 text-right font-medium text-slate-900">{formatMoney(item.amount)}</td>
														</tr>
													))}
												</tbody>
											</table>
										</div>
									) : (
										<p className="text-xs text-slate-500">No transaction entries in the reconciliation report.</p>
									)}
								</div>
							</div>
						)}

						<button
							onClick={() => loadReconciliationForAccount(selectedAccount)}
							className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
						>
							<RefreshCw className="h-4 w-4" /> Refresh Reconciliation
						</button>
					</div>
				</div>
			)}

			{!selectedAccount && !loading && accounts.length > 0 && (
				<div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-800">
					<AlertTriangle className="mt-0.5 h-4 w-4" />
					<p className="text-sm">Select an account from the list to view transactions and reconciliation details.</p>
				</div>
			)}
		</AdminLayout>
	);
};

export default BankAccounts;
