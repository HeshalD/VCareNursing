import { useEffect, useMemo, useState } from 'react';
import {
	Truck,
	Plus,
	Pencil,
	Trash2,
	RefreshCw,
	X,
	ChevronRight,
	AlertTriangle,
	AlertCircle,
	Receipt,
	CreditCard,
	Loader2,
} from 'lucide-react';
import AdminLayout from '../components/AdminLayout';
import apiClient from '../../../api/api';
import { formatMobileNumber } from '../../../utils/phoneFormat';
import DateInput from '../../../components/common/DateInput';
import PhoneInput from '../../../components/common/PhoneInput';

const VENDOR_TYPES = [
	{ value: 'SUPPLIER', label: 'Supplier' },
	{ value: 'UTILITY', label: 'Utility / Expense' },
	{ value: 'OTHER', label: 'Other' },
];

const PAYMENT_METHODS = ['CASH', 'BANK_TRANSFER', 'CASH_DEPOSIT', 'CHEQUE'];

const initialVendorForm = {
	name: '',
	vendor_type: 'SUPPLIER',
	contact_person: '',
	phone: '',
	email: '',
	address: '',
	notes: '',
};

const initialBillForm = {
	source_type: 'OTHER',
	amount: '',
	description: '',
};

const formatMoney = (value) => {
	const amount = parseFloat(value || 0);
	return `LKR ${amount.toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const formatDate = (v) => {
	if (!v) return '—';
	const d = new Date(v);
	return isNaN(d) ? '—' : d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
};

const VENDOR_TYPE_BADGE = {
	SUPPLIER: 'bg-blue-50 text-blue-700',
	UTILITY: 'bg-amber-50 text-amber-700',
	OTHER: 'bg-slate-100 text-slate-600',
};

const BILL_STATUS_CONFIG = {
	UNPAID: { dot: 'bg-red-400', text: 'text-red-700', label: 'Unpaid' },
	PARTIALLY_PAID: { dot: 'bg-amber-400', text: 'text-amber-700', label: 'Partially Paid' },
	PAID: { dot: 'bg-emerald-500', text: 'text-emerald-700', label: 'Paid' },
};

const StatusDot = ({ status }) => {
	const cfg = BILL_STATUS_CONFIG[status] || { dot: 'bg-slate-400', text: 'text-slate-600', label: status || '—' };
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

const Field = ({ label, required, children }) => (
	<div>
		<label className="block text-xs font-medium text-slate-600 mb-1">
			{label}{required && <span className="text-red-500 ml-0.5">*</span>}
		</label>
		{children}
	</div>
);

const StatTile = ({ label, value, tone = 'slate' }) => {
	const tones = {
		slate: 'text-slate-900',
		emerald: 'text-emerald-700',
		red: 'text-red-700',
	};
	return (
		<div className="bg-white border border-slate-200 rounded-xl p-3.5">
			<p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{label}</p>
			<p className={`mt-1 text-base font-semibold ${tones[tone]}`}>{value}</p>
		</div>
	);
};

const VendorsPage = () => {
	const [vendors, setVendors] = useState([]);
	const [loading, setLoading] = useState(true);
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState('');
	const [successMessage, setSuccessMessage] = useState('');

	const [showForm, setShowForm] = useState(false);
	const [editingVendor, setEditingVendor] = useState(null);
	const [formData, setFormData] = useState(initialVendorForm);

	const [selectedVendor, setSelectedVendor] = useState(null);
	const [vendorDetail, setVendorDetail] = useState(null);
	const [bills, setBills] = useState([]);
	const [detailLoading, setDetailLoading] = useState(false);

	const [showBillForm, setShowBillForm] = useState(false);
	const [billForm, setBillForm] = useState(initialBillForm);
	const [billSubmitting, setBillSubmitting] = useState(false);
	const [billError, setBillError] = useState('');

	const [payingBill, setPayingBill] = useState(null);

	const loadVendors = async () => {
		try {
			setLoading(true);
			setError('');
			const response = await apiClient.getVendors();
			setVendors(response.data || []);
		} catch (err) {
			setError(err.message || 'Failed to load vendors');
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		loadVendors();
	}, []);

	const resetForm = () => {
		setFormData(initialVendorForm);
		setEditingVendor(null);
		setShowForm(false);
	};

	const handleOpenCreate = () => {
		setSuccessMessage('');
		setError('');
		setEditingVendor(null);
		setFormData(initialVendorForm);
		setShowForm(true);
	};

	const handleOpenEdit = (vendor) => {
		setSuccessMessage('');
		setError('');
		setEditingVendor(vendor);
		setFormData({
			name: vendor.name || '',
			vendor_type: vendor.vendor_type || 'SUPPLIER',
			contact_person: vendor.contact_person || '',
			phone: vendor.phone || '',
			email: vendor.email || '',
			address: vendor.address || '',
			notes: vendor.notes || '',
		});
		setShowForm(true);
	};

	const handleSubmit = async (e) => {
		e.preventDefault();
		try {
			setSubmitting(true);
			setError('');
			setSuccessMessage('');

			if (editingVendor) {
				await apiClient.updateVendor(editingVendor.vendor_id, formData);
				setSuccessMessage('Vendor updated successfully.');
			} else {
				await apiClient.createVendor(formData);
				setSuccessMessage('Vendor created successfully.');
			}

			resetForm();
			await loadVendors();
		} catch (err) {
			setError(err.message || 'Failed to save vendor');
		} finally {
			setSubmitting(false);
		}
	};

	const handleDeactivate = async (vendor) => {
		const confirmed = window.confirm(`Deactivate vendor "${vendor.name}"?`);
		if (!confirmed) return;

		try {
			setError('');
			setSuccessMessage('');
			await apiClient.deactivateVendor(vendor.vendor_id);
			setSuccessMessage('Vendor deactivated successfully.');

			if (selectedVendor?.vendor_id === vendor.vendor_id) {
				setSelectedVendor(null);
				setVendorDetail(null);
				setBills([]);
			}

			await loadVendors();
		} catch (err) {
			setError(err.message || 'Failed to deactivate vendor');
		}
	};

	const loadDetail = async (vendor) => {
		try {
			setDetailLoading(true);
			setError('');
			const [detailRes, billsRes] = await Promise.all([
				apiClient.getVendor(vendor.vendor_id),
				apiClient.getVendorBills(vendor.vendor_id),
			]);
			setVendorDetail(detailRes.data || null);
			setBills(billsRes.data || []);
		} catch (err) {
			setError(err.message || 'Failed to load vendor detail');
			setVendorDetail(null);
			setBills([]);
		} finally {
			setDetailLoading(false);
		}
	};

	const handleViewVendor = async (vendor) => {
		if (selectedVendor?.vendor_id === vendor.vendor_id) {
			setSelectedVendor(null);
			setVendorDetail(null);
			setBills([]);
			return;
		}
		setSelectedVendor(vendor);
		await loadDetail(vendor);
	};

	const refreshDetail = async () => {
		if (!selectedVendor) return;
		await loadDetail(selectedVendor);
	};

	const handleOpenBillForm = () => {
		setBillError('');
		setBillForm(initialBillForm);
		setShowBillForm(true);
	};

	const handleSubmitBill = async (e) => {
		e.preventDefault();
		if (!selectedVendor) return;
		try {
			setBillSubmitting(true);
			setBillError('');
			await apiClient.createVendorBill(selectedVendor.vendor_id, billForm);
			setShowBillForm(false);
			setSuccessMessage('Vendor bill recorded successfully.');
			await refreshDetail();
			await loadVendors();
		} catch (err) {
			setBillError(err.message || 'Failed to record vendor bill');
		} finally {
			setBillSubmitting(false);
		}
	};

	return (
		<AdminLayout
			title="Vendor Management"
			subtitle="Track suppliers and recurring-expense vendors, and settle what's owed to each of them."
			actions={
				<div className="flex items-center gap-2">
					<button onClick={loadVendors} title="Refresh" className={iconBtnCls}>
						<RefreshCw className="h-4 w-4" />
					</button>
					<button onClick={handleOpenCreate} className={primaryBtnCls}>
						<Plus className="h-4 w-4" />
						New Vendor
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

				{/* ── Vendors list ─────────────────────────────────────────────── */}
				<div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
					<div className="border-b border-slate-100 px-5 py-3.5">
						<h2 className="text-sm font-semibold text-slate-900">Vendors</h2>
						<p className="text-xs text-slate-400 mt-0.5">Click a row to view bills and payment history.</p>
					</div>

					{loading ? (
						<div className="flex items-center justify-center h-40">
							<div className="text-sm text-slate-400">Loading vendors…</div>
						</div>
					) : vendors.length === 0 ? (
						<div className="flex flex-col items-center gap-2 py-16 text-slate-400">
							<Truck className="h-8 w-8" />
							<p className="text-sm">No vendors found.</p>
						</div>
					) : (
						<div className="overflow-x-auto">
							<table className="w-full text-sm">
								<thead>
									<tr className="border-b border-slate-200 bg-slate-50">
										<th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Vendor</th>
										<th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Type</th>
										<th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Contact</th>
										<th className="text-right px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Outstanding Balance</th>
										<th className="px-5 py-3" />
									</tr>
								</thead>
								<tbody className="divide-y divide-slate-100">
									{vendors.map((vendor) => {
										const isSelected = selectedVendor?.vendor_id === vendor.vendor_id;
										const outstanding = parseFloat(vendor.outstanding_balance || 0);
										return (
											<tr
												key={vendor.vendor_id}
												onClick={() => handleViewVendor(vendor)}
												className={`cursor-pointer transition-colors ${isSelected ? 'bg-blue-50/60' : 'hover:bg-slate-50'}`}
											>
												<td className="px-5 py-3">
													<p className="font-semibold text-slate-900 leading-tight">{vendor.name}</p>
													{!vendor.is_active && (
														<span className="inline-flex items-center gap-1 rounded-full bg-slate-100 text-slate-500 text-[10px] font-semibold px-1.5 py-0.5">Deactivated</span>
													)}
												</td>
												<td className="px-5 py-3">
													<span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${VENDOR_TYPE_BADGE[vendor.vendor_type] || 'bg-slate-100 text-slate-600'}`}>
														{VENDOR_TYPES.find((t) => t.value === vendor.vendor_type)?.label || vendor.vendor_type}
													</span>
												</td>
												<td className="px-5 py-3 text-slate-600">
													{vendor.contact_person || '—'}
													{vendor.phone && <span className="block text-xs text-slate-400">{formatMobileNumber(vendor.phone)}</span>}
												</td>
												<td className={`px-5 py-3 text-right font-medium ${outstanding > 0 ? 'text-red-600' : 'text-slate-500'}`}>
													{formatMoney(outstanding)}
												</td>
												<td className="px-5 py-3">
													<div className="flex items-center justify-end gap-0.5" onClick={(e) => e.stopPropagation()}>
														<button onClick={() => handleOpenEdit(vendor)} title="Edit vendor" className={iconBtnCls}>
															<Pencil className="h-3.5 w-3.5" />
														</button>
														{vendor.is_active && (
															<button
																onClick={() => handleDeactivate(vendor)}
																title="Deactivate vendor"
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

				{/* ── Selected vendor detail ───────────────────────────────────── */}
				{selectedVendor && (
					<div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
						<div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-3.5">
							<div>
								<h3 className="text-sm font-semibold text-slate-900">{selectedVendor.name}</h3>
								<p className="text-xs text-slate-400 mt-0.5">Bills and payment history for this vendor</p>
							</div>
							<div className="flex items-center gap-1 shrink-0">
								<button onClick={handleOpenBillForm} className={ghostBtnCls}>
									<Receipt className="h-3.5 w-3.5" />
									Record Bill
								</button>
								<button onClick={refreshDetail} title="Refresh" className={iconBtnCls}>
									<RefreshCw className={`h-4 w-4 ${detailLoading ? 'animate-spin' : ''}`} />
								</button>
								<button onClick={() => setSelectedVendor(null)} title="Close" className={iconBtnCls}>
									<X className="h-4 w-4" />
								</button>
							</div>
						</div>

						<div className="p-5 space-y-4">
							<div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
								<StatTile label="Total Billed" value={formatMoney(vendorDetail?.total_billed)} />
								<StatTile label="Total Paid" value={formatMoney(vendorDetail?.total_paid)} tone="emerald" />
								<StatTile label="Outstanding" value={formatMoney(vendorDetail?.outstanding_balance)} tone={parseFloat(vendorDetail?.outstanding_balance || 0) > 0 ? 'red' : 'slate'} />
							</div>

							{detailLoading ? (
								<div className="flex items-center justify-center h-32">
									<div className="text-sm text-slate-400">Loading bills…</div>
								</div>
							) : bills.length === 0 ? (
								<div className="flex flex-col items-center justify-center gap-2 py-12 text-slate-400">
									<Receipt className="w-6 h-6" />
									<p className="text-sm">No bills recorded for this vendor yet.</p>
								</div>
							) : (
								<div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
									<div className="overflow-x-auto">
										<table className="w-full text-sm">
											<thead>
												<tr className="border-b border-slate-200 bg-slate-50">
													<th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Date</th>
													<th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Source</th>
													<th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Description</th>
													<th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
													<th className="text-right px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Amount</th>
													<th className="text-right px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Paid</th>
													<th className="px-4 py-2.5" />
												</tr>
											</thead>
											<tbody className="divide-y divide-slate-100">
												{bills.map((bill) => (
													<tr key={bill.vendor_bill_id} className="hover:bg-slate-50 transition-colors">
														<td className="px-4 py-2.5 text-slate-600 whitespace-nowrap">{formatDate(bill.created_at)}</td>
														<td className="px-4 py-2.5 text-slate-600">
															{bill.source_type.replace('_', ' ')}
															{bill.product_name && <span className="block text-xs text-slate-400">{bill.product_name}</span>}
														</td>
														<td className="px-4 py-2.5 text-slate-500">{bill.description || '—'}</td>
														<td className="px-4 py-2.5 whitespace-nowrap"><StatusDot status={bill.status} /></td>
														<td className="px-4 py-2.5 text-right font-medium text-slate-800 whitespace-nowrap">{formatMoney(bill.amount)}</td>
														<td className="px-4 py-2.5 text-right text-slate-500 whitespace-nowrap">{formatMoney(bill.amount_paid)}</td>
														<td className="px-4 py-2.5 text-right">
															{bill.status !== 'PAID' && (
																<button
																	onClick={() => setPayingBill(bill)}
																	className="inline-flex items-center gap-1 rounded bg-blue-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-blue-700"
																>
																	<CreditCard className="h-3 w-3" /> Pay
																</button>
															)}
														</td>
													</tr>
												))}
											</tbody>
										</table>
									</div>
								</div>
							)}
						</div>
					</div>
				)}

				{!selectedVendor && !loading && vendors.length > 0 && (
					<div className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 text-slate-600">
						<AlertTriangle className="mt-0.5 h-4 w-4 text-slate-400 shrink-0" />
						<p className="text-sm">Select a vendor from the list above to view its bills and payment history.</p>
					</div>
				)}
			</div>

			{/* ── Create / Edit vendor drawer ───────────────────────────────── */}
			{showForm && (
				<div className="fixed inset-0 z-50 flex">
					<div className="flex-1 bg-black/30" onClick={resetForm} />

					<div className="w-full max-w-md bg-white flex flex-col shadow-2xl overflow-hidden">
						<div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 flex-shrink-0">
							<h2 className="text-sm font-semibold text-slate-900">
								{editingVendor ? 'Edit Vendor' : 'Create Vendor'}
							</h2>
							<button onClick={resetForm} className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-md transition-colors">
								<X className="w-4 h-4" />
							</button>
						</div>

						<form onSubmit={handleSubmit} id="vendor-form" className="flex-1 overflow-y-auto">
							<div className="px-5 pt-4 pb-6 space-y-3">
								<Field label="Vendor Name" required>
									<input
										required
										value={formData.name}
										onChange={(e) => setFormData({ ...formData, name: e.target.value })}
										className={inputCls}
									/>
								</Field>
								<Field label="Vendor Type" required>
									<select
										value={formData.vendor_type}
										onChange={(e) => setFormData({ ...formData, vendor_type: e.target.value })}
										className={inputCls}
									>
										{VENDOR_TYPES.map((t) => (
											<option key={t.value} value={t.value}>{t.label}</option>
										))}
									</select>
								</Field>
								<Field label="Contact Person">
									<input
										value={formData.contact_person}
										onChange={(e) => setFormData({ ...formData, contact_person: e.target.value })}
										className={inputCls}
									/>
								</Field>
								<div className="grid grid-cols-2 gap-3">
									<Field label="Phone">
										<PhoneInput
											value={formData.phone}
											onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
										/>
									</Field>
									<Field label="Email">
										<input
											type="email"
											value={formData.email}
											onChange={(e) => setFormData({ ...formData, email: e.target.value })}
											className={inputCls}
										/>
									</Field>
								</div>
								<Field label="Address">
									<textarea
										rows={2}
										value={formData.address}
										onChange={(e) => setFormData({ ...formData, address: e.target.value })}
										className={inputCls}
									/>
								</Field>
								<Field label="Notes">
									<textarea
										rows={2}
										value={formData.notes}
										onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
										className={inputCls}
									/>
								</Field>

								{error && (
									<div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>
								)}
							</div>
						</form>

						<div className="flex items-center gap-2 px-5 py-4 border-t border-slate-200 bg-slate-50 flex-shrink-0">
							<button type="button" onClick={resetForm}
								className="flex-1 px-4 py-2 border border-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-100 transition-colors">
								Cancel
							</button>
							<button
								type="submit"
								form="vendor-form"
								disabled={submitting}
								className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
							>
								{submitting ? 'Saving…' : editingVendor ? 'Save Changes' : 'Create Vendor'}
							</button>
						</div>
					</div>
				</div>
			)}

			{/* ── Record Bill drawer ────────────────────────────────────────── */}
			{showBillForm && (
				<div className="fixed inset-0 z-50 flex">
					<div className="flex-1 bg-black/30" onClick={() => setShowBillForm(false)} />

					<div className="w-full max-w-md bg-white flex flex-col shadow-2xl overflow-hidden">
						<div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 flex-shrink-0">
							<h2 className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
								<Receipt className="h-4 w-4 text-blue-600" />
								Record Bill — {selectedVendor?.name}
							</h2>
							<button onClick={() => setShowBillForm(false)} className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-md transition-colors">
								<X className="w-4 h-4" />
							</button>
						</div>

						<form onSubmit={handleSubmitBill} id="vendor-bill-form" className="flex-1 overflow-y-auto">
							<div className="px-5 pt-4 pb-6 space-y-3">
								<Field label="Bill Type" required>
									<select
										required
										value={billForm.source_type}
										onChange={(e) => setBillForm({ ...billForm, source_type: e.target.value })}
										className={inputCls}
									>
										<option value="UTILITY">Utility (WiFi, Electricity, Water, etc.)</option>
										<option value="OTHER">Other Expense</option>
									</select>
								</Field>
								<Field label="Amount" required>
									<input
										required
										type="number"
										step="0.01"
										min="0.01"
										value={billForm.amount}
										onChange={(e) => setBillForm({ ...billForm, amount: e.target.value })}
										onWheel={(e) => e.target.blur()}
										className={inputCls}
									/>
								</Field>
								<Field label="Description">
									<input
										value={billForm.description}
										onChange={(e) => setBillForm({ ...billForm, description: e.target.value })}
										placeholder="e.g. July WiFi bill"
										className={inputCls}
									/>
								</Field>

								{billError && (
									<div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{billError}</div>
								)}
							</div>
						</form>

						<div className="flex items-center gap-2 px-5 py-4 border-t border-slate-200 bg-slate-50 flex-shrink-0">
							<button type="button" onClick={() => setShowBillForm(false)}
								className="flex-1 px-4 py-2 border border-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-100 transition-colors">
								Cancel
							</button>
							<button
								type="submit"
								form="vendor-bill-form"
								disabled={billSubmitting}
								className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
							>
								{billSubmitting ? 'Saving…' : 'Record Bill'}
							</button>
						</div>
					</div>
				</div>
			)}

			{/* ── Pay Bill modal ────────────────────────────────────────────── */}
			{payingBill && (
				<PayVendorBillModal
					bill={payingBill}
					onClose={() => setPayingBill(null)}
					onPaid={async () => {
						setPayingBill(null);
						setSuccessMessage('Vendor bill payment recorded successfully.');
						await refreshDetail();
						await loadVendors();
					}}
				/>
			)}
		</AdminLayout>
	);
};

function PayVendorBillModal({ bill, onClose, onPaid }) {
	const [bankAccounts, setBankAccounts] = useState([]);
	const remaining = parseFloat(bill.amount) - parseFloat(bill.amount_paid || 0);
	const [amount, setAmount] = useState(remaining.toFixed(2));
	const [paymentMethod, setPaymentMethod] = useState('CASH');
	const [bankAccountId, setBankAccountId] = useState('');
	const [chequeNumber, setChequeNumber] = useState('');
	const [chequeDate, setChequeDate] = useState('');
	const [referenceNumber, setReferenceNumber] = useState('');
	const [notes, setNotes] = useState('');
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState('');

	useEffect(() => {
		apiClient.getBankAccounts().then((res) => setBankAccounts(Array.isArray(res?.data) ? res.data : [])).catch(() => setBankAccounts([]));
	}, []);

	const handleSubmit = async (e) => {
		e.preventDefault();
		setError('');

		if (['BANK_TRANSFER', 'CASH_DEPOSIT'].includes(paymentMethod) && !bankAccountId) {
			setError('Please select a bank account');
			return;
		}
		if (paymentMethod === 'CHEQUE' && (!chequeNumber || !chequeDate)) {
			setError('Cheque number and date are required');
			return;
		}

		setSaving(true);
		try {
			await apiClient.payVendorBill(bill.vendor_bill_id, {
				amount,
				payment_method: paymentMethod,
				bank_account_id: bankAccountId || undefined,
				cheque_number: chequeNumber || undefined,
				cheque_date: chequeDate || undefined,
				reference_number: referenceNumber || undefined,
				notes: notes || undefined,
			});
			onPaid();
		} catch (err) {
			setError(err.message || 'Failed to record payment');
		} finally {
			setSaving(false);
		}
	};

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
			<div className="w-full max-w-md rounded-lg bg-white shadow-xl">
				<div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
					<h3 className="text-sm font-semibold text-slate-800">
						Pay Vendor Bill ({formatMoney(remaining)} remaining)
					</h3>
					<button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">
						<X className="h-4 w-4" />
					</button>
				</div>
				<form onSubmit={handleSubmit} className="space-y-3 px-5 py-4">
					{error && (
						<div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
							<AlertCircle className="h-3.5 w-3.5 shrink-0" /> {error}
						</div>
					)}

					<Field label="Amount" required>
						<input
							required
							type="number"
							step="0.01"
							min="0.01"
							value={amount}
							onChange={(e) => setAmount(e.target.value)}
							onWheel={(e) => e.target.blur()}
							className={inputCls}
						/>
					</Field>

					<Field label="Payment Method" required>
						<select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className={inputCls}>
							{PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m.replace('_', ' ')}</option>)}
						</select>
					</Field>

					{['BANK_TRANSFER', 'CASH_DEPOSIT'].includes(paymentMethod) && (
						<Field label="Bank Account" required>
							<select value={bankAccountId} onChange={(e) => setBankAccountId(e.target.value)} className={inputCls}>
								<option value="">Select…</option>
								{bankAccounts.map((b) => (
									<option key={b.account_id} value={b.account_id}>{b.account_nickname} — {b.bank_name}</option>
								))}
							</select>
						</Field>
					)}

					{paymentMethod === 'CHEQUE' && (
						<div className="grid grid-cols-2 gap-3">
							<input
								type="text"
								placeholder="Cheque number"
								value={chequeNumber}
								onChange={(e) => setChequeNumber(e.target.value)}
								className={inputCls}
							/>
							<DateInput value={chequeDate} onChange={(e) => setChequeDate(e.target.value)} className={inputCls} />
						</div>
					)}

					<Field label="Reference Number">
						<input value={referenceNumber} onChange={(e) => setReferenceNumber(e.target.value)} className={inputCls} />
					</Field>

					<Field label="Notes">
						<textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className={inputCls} />
					</Field>

					<div className="flex justify-end gap-2 pt-2">
						<button type="button" onClick={onClose} className="rounded border border-slate-200 bg-white px-4 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50">
							Cancel
						</button>
						<button
							type="submit"
							disabled={saving}
							className="inline-flex items-center gap-1.5 rounded bg-emerald-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
						>
							{saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
							Record Payment
						</button>
					</div>
				</form>
			</div>
		</div>
	);
}

export default VendorsPage;
