import { useState, useEffect } from "react";
import apiClient from "../../../api/api";
import { useAuth } from "../../../context/AuthContext";

const Earnings = () => {
  const [wallet, setWallet] = useState(null);
  const [staffData, setStaffData] = useState(null);
  const [advances, setAdvances] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);
  const { user } = useAuth();

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        // Try to get staff_id from user object, fallback to id if staff_id is not available
        const staffId = user?.staff_id || user?.id;
        if (staffId) {
          console.log("Fetching data for staffId:", staffId);
          const [walletResponse, staffResponse] = await Promise.all([
            apiClient.getMyWallet(),
            user?.staff_id ? apiClient.getStaffByID(user.staff_id) : apiClient.getStaffByUserID(user.id)
          ]);
          console.log("Wallet API response:", walletResponse);
          console.log("Staff API response:", staffResponse);
          setWallet(walletResponse.data);
          setStaffData(staffResponse.data);
        }
        // Dummy advance history for now
        setAdvances([
          {
            advance_id: "1",
            amount_requested: 5000,
            status: "APPROVED",
            requested_at: "2025-03-01T10:00:00Z",
            approved_at: "2025-03-02T09:00:00Z",
          },
          {
            advance_id: "2",
            amount_requested: 3000,
            status: "PENDING",
            requested_at: "2025-03-20T14:00:00Z",
            approved_at: null,
          },
          {
            advance_id: "3",
            amount_requested: 7000,
            status: "REJECTED",
            requested_at: "2025-02-15T11:00:00Z",
            approved_at: null,
          },
        ]);
      } catch (err) {
        setError("Failed to load data.");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [user?.staff_id, user?.id]);

  const handleRequestAdvance = async () => {
    if (!amount || isNaN(amount) || parseFloat(amount) <= 0) {
      setError("Please enter a valid amount.");
      return;
    }
    try {
      setSubmitting(true);
      setError(null);
      await apiClient.requestAdvance({ amount_requested: parseFloat(amount) });
      setSuccessMsg("Advance request submitted successfully.");
      setShowModal(false);
      setAmount("");
      // Refresh wallet data
      const walletResponse = await apiClient.getMyWallet();
      console.log("Wallet response after advance request:", walletResponse);
      setWallet(walletResponse.data);
    } catch (err) {
      console.error("Advance request error:", err);
      setError(err.message || "Failed to submit advance request.");
    } finally {
      setSubmitting(false);
    }
  };

  const canRequestAdvance =
    wallet && parseFloat(wallet.balance) >= parseFloat(wallet.advance_threshold_amount);

  const statusStyles = {
    APPROVED: {
      bg: "bg-green-100",
      text: "text-green-700",
      label: "Approved",
    },
    PENDING: {
      bg: "bg-yellow-100",
      text: "text-yellow-700",
      label: "Pending",
    },
    REJECTED: {
      bg: "bg-red-100",
      text: "text-red-700",
      label: "Rejected",
    },
  };

  return (
    <div className="p-6 space-y-6">
      {/* Page Header with Staff Info */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-800">Earnings</h1>
          <p className="text-sm text-gray-500 mt-1">
            Track your earnings and manage advance requests.
          </p>
        </div>
        {staffData && (
          <div className="text-right">
            <p className="text-sm text-gray-500">Staff Member</p>
            <p className="text-lg font-semibold text-gray-800">{staffData.full_name || user?.name}</p>
            <p className="text-xs text-gray-500">
              {staffData.verification_status === 'VERIFIED' ? 'Verified' : 'Pending Verification'}
            </p>
          </div>
        )}
      </div>

      {/* Top Stats Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Wallet Balance */}
        <div className="bg-indigo-600 rounded-2xl p-5 text-white shadow">
          <p className="text-sm opacity-80">Wallet Balance</p>
          {loading ? (
            <p className="text-2xl font-bold mt-1">Loading...</p>
          ) : (
            <>
              <p className="text-3xl font-bold mt-1">
                LKR {parseFloat(wallet?.balance || 0).toLocaleString()}
              </p>
              <p className="text-xs opacity-70 mt-1">
                Advance threshold: LKR{" "}
                {parseFloat(wallet?.advance_threshold_amount || 15000).toLocaleString()}
              </p>
              {/* Debug info 
              <p className="text-xs opacity-50 mt-1">
                Debug: wallet={JSON.stringify(wallet)}
              </p>*/}
            </>
          )}
        </div>

        {/* Dummy — Total Earned This Month */}
        <div className="bg-white rounded-2xl p-5 shadow border border-gray-100">
          <p className="text-sm text-gray-500">Total Earned · This Month</p>
          <p className="text-3xl font-bold text-gray-800 mt-1">LKR 45,000</p>
          <p className="text-xs text-green-500 mt-1">↑ +12% from last month</p>
        </div>

        {/* Dummy — Completed Shifts */}
        <div className="bg-white rounded-2xl p-5 shadow border border-gray-100">
          <p className="text-sm text-gray-500">Completed Shifts · This Month</p>
          <p className="text-3xl font-bold text-gray-800 mt-1">12</p>
          <p className="text-xs text-green-500 mt-1">↑ +2 upcoming</p>
        </div>
      </div>

      {/* Advance Requests Section */}
      <div className="bg-white rounded-2xl shadow border border-gray-100">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <div>
            <h2 className="text-base font-semibold text-gray-800">
              Advance Requests
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Your advance request history
            </p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <button
              onClick={() => {
                setError(null);
                setSuccessMsg(null);
                setShowModal(true);
              }}
              disabled={!canRequestAdvance || loading}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition ${
                canRequestAdvance && !loading
                  ? "bg-indigo-600 text-white hover:bg-indigo-700"
                  : "bg-gray-100 text-gray-400 cursor-not-allowed"
              }`}
            >
              Request Advance
            </button>
            {!loading && !canRequestAdvance && (
              <p className="text-xs text-red-400">
                Min. LKR{" "}
                {parseFloat(
                  wallet?.advance_threshold_amount || 15000
                ).toLocaleString()}{" "}
                balance required
              </p>
            )}
          </div>
        </div>

        {/* Success message */}
        {successMsg && (
          <div className="mx-5 mt-4 p-3 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700">
            {successMsg}
          </div>
        )}

        {/* Advances Table */}
        <div className="overflow-x-auto">
          {advances.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-10">
              No advance requests yet.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
                  <th className="px-5 py-3 font-medium">Amount</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Requested</th>
                  <th className="px-5 py-3 font-medium">Actioned</th>
                </tr>
              </thead>
              <tbody>
                {advances.map((adv) => {
                  const style = statusStyles[adv.status];
                  return (
                    <tr
                      key={adv.advance_id}
                      className="border-b border-gray-50 hover:bg-gray-50 transition"
                    >
                      <td className="px-5 py-4 font-semibold text-gray-800">
                        LKR {parseFloat(adv.amount_requested).toLocaleString()}
                      </td>
                      <td className="px-5 py-4">
                        <span
                          className={`px-3 py-1 rounded-full text-xs font-medium ${style.bg} ${style.text}`}
                        >
                          {style.label}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-gray-500">
                        {new Date(adv.requested_at).toLocaleDateString(
                          "en-GB",
                          { day: "numeric", month: "short", year: "numeric" }
                        )}
                      </td>
                      <td className="px-5 py-4 text-gray-500">
                        {adv.approved_at
                          ? new Date(adv.approved_at).toLocaleDateString(
                              "en-GB",
                              {
                                day: "numeric",
                                month: "short",
                                year: "numeric",
                              }
                            )
                          : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Request Advance Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-1">
              Request Advance
            </h2>
            <p className="text-sm text-gray-400 mb-5">
              Your current balance: LKR{" "}
              {parseFloat(wallet?.balance || 0).toLocaleString()}
            </p>

            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
                {error}
              </div>
            )}

            <label className="block text-sm font-medium text-gray-700 mb-1">
              Amount (LKR)
            </label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="e.g. 5000"
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 mb-5"
            />

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowModal(false);
                  setError(null);
                  setAmount("");
                }}
                className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleRequestAdvance}
                disabled={submitting}
                className="flex-1 px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition disabled:opacity-50"
              >
                {submitting ? "Submitting..." : "Submit Request"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Earnings;