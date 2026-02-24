import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import AdminLayout from '../components/AdminLayout';
import apiClient from '../../../api/api';
import {
  User,
  Phone,
  MapPin,
  Calendar,
  Clock,
  FileText,
  DollarSign,
  Calculator,
  Send,
  AlertCircle,
  CheckCircle,
  ArrowLeft
} from 'lucide-react';

const QuoteBuilder = () => {
  const { requestId } = useParams();
  const navigate = useNavigate();
  console.log('Quote builder - requestId from params:', requestId);
  const [serviceRequest, setServiceRequest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [creatingQuote, setCreatingQuote] = useState(false);
  const [sendingPDF, setSendingPDF] = useState(false);
  const [createdQuote, setCreatedQuote] = useState(null);
  
  // Form state
  const [quoteForm, setQuoteForm] = useState({
    daily_rate: '',
    qty_days: '7',
    transport_fee: '1000'
  });

  useEffect(() => {
    if (requestId) {
      fetchServiceRequest();
    } else {
      // If no requestId, fetch new leads and show list
      fetchNewLeads();
    }
  }, [requestId]);

  const fetchServiceRequest = async () => {
    if (!requestId) {
      console.error('No requestId provided');
      setError('No service request ID provided');
      return;
    }
    
    try {
      setLoading(true);
      const response = await apiClient.getServiceRequestById(requestId);
      setServiceRequest(response.data);
    } catch (err) {
      if (err.message?.includes('404') || err.message?.includes('not found')) {
        setError('Service request not found');
      } else {
        setError('Failed to fetch service request');
      }
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchNewLeads = async () => {
    try {
      setLoading(true);
      const response = await apiClient.getNewLeads();
      const leads = response.data || [];
      if (leads.length === 0) {
        setError('No new leads found');
      } else {
        // Auto-select the first new lead
        setServiceRequest(leads[0]);
        // Update URL to include the selected request ID
        navigate(`/admin/quote-builder/${leads[0].request_id}`, { replace: true });
      }
    } catch (err) {
      setError('Failed to fetch new leads');
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setQuoteForm(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const calculateTotals = () => {
    const regFee = 10000;
    const dailyRate = parseFloat(quoteForm.daily_rate) || 0;
    const days = parseInt(quoteForm.qty_days) || 0;
    const transport = parseFloat(quoteForm.transport_fee) || 0;
    
    const item2Amount = dailyRate * days;
    const subTotal = regFee + item2Amount + transport;
    
    return {
      regFee,
      item2Amount,
      subTotal,
      total: subTotal,
      transport
    };
  };

  const handleCreateQuote = async (e) => {
    e.preventDefault();
    if (!serviceRequest) return;

    try {
      setCreatingQuote(true);
      const response = await apiClient.createQuotation({
        request_id: serviceRequest.request_id,
        daily_rate: parseFloat(quoteForm.daily_rate),
        qty_days: parseInt(quoteForm.qty_days),
        transport_fee: parseFloat(quoteForm.transport_fee)
      });
      setCreatedQuote(response.data);
    } catch (err) {
      setError('Failed to create quotation');
      console.error('Error:', err);
    } finally {
      setCreatingQuote(false);
    }
  };

  const handleSendPDF = async () => {
    if (!createdQuote) return;

    try {
      setSendingPDF(true);
      await apiClient.sendQuotePDF(createdQuote.quote_id);
      alert('Quote sent successfully via WhatsApp!');
      // Navigate back to service requests
      navigate('/admin/service-requests');
    } catch (err) {
      setError('Failed to send PDF');
      console.error('Error:', err);
    } finally {
      setSendingPDF(false);
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) {
    return (
      <AdminLayout title="Quote Builder" subtitle="Loading...">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      </AdminLayout>
    );
  }

  if (error && !serviceRequest) {
    return (
      <AdminLayout title="Quote Builder" subtitle="Error">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-600" />
            <span className="text-red-800">{error}</span>
          </div>
          <button
            onClick={() => navigate('/admin/service-requests')}
            className="mt-4 flex items-center gap-2 text-blue-600 hover:text-blue-800"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Service Requests
          </button>
        </div>
      </AdminLayout>
    );
  }

  const totals = calculateTotals();

  return (
    <AdminLayout 
      title="Quote Builder" 
      subtitle={serviceRequest ? `Quote for ${serviceRequest.patient_name}` : 'Create Quote'}
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Side - Service Request Details */}
        <div className="bg-white rounded-lg border border-slate-200">
          <div className="p-6 border-b border-slate-200">
            <div className="flex items-center gap-3">
              <FileText className="w-5 h-5 text-blue-600" />
              <h2 className="text-lg font-semibold text-slate-900">Service Request Details</h2>
            </div>
          </div>
          
          {serviceRequest && (
            <div className="p-6 space-y-6">
              {/* Payer Information */}
              <div>
                <h3 className="font-medium text-slate-900 mb-3 flex items-center gap-2">
                  <User className="w-4 h-4" />
                  Payer Information
                </h3>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm text-slate-500">Name:</span>
                    <span className="text-sm font-medium">{serviceRequest.payer_name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-slate-500">Mobile:</span>
                    <span className="text-sm font-medium">{serviceRequest.payer_mobile}</span>
                  </div>
                </div>
              </div>

              {/* Patient Information */}
              <div>
                <h3 className="font-medium text-slate-900 mb-3 flex items-center gap-2">
                  <User className="w-4 h-4" />
                  Patient Information
                </h3>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm text-slate-500">Name:</span>
                    <span className="text-sm font-medium">{serviceRequest.patient_name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-slate-500">Age:</span>
                    <span className="text-sm font-medium">{serviceRequest.patient_age} years</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-slate-500">Relationship:</span>
                    <span className="text-sm font-medium">{serviceRequest.relationship_to_client}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-slate-500">Condition:</span>
                    <span className="text-sm font-medium">{serviceRequest.patient_condition}</span>
                  </div>
                </div>
              </div>

              {/* Service Details */}
              <div>
                <h3 className="font-medium text-slate-900 mb-3 flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  Service Details
                </h3>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm text-slate-500">Service Type:</span>
                    <span className="text-sm font-medium">{serviceRequest.service_type}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-slate-500">Service Model:</span>
                    <span className="text-sm font-medium">
                      {serviceRequest.service_model?.replace('_', ' ') || 'Not specified'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-slate-500">Preferred Gender:</span>
                    <span className="text-sm font-medium">
                      {serviceRequest.preferred_gender || 'Any'}
                    </span>
                  </div>
                  {serviceRequest.preferred_staff_id && (
                    <div className="flex justify-between">
                      <span className="text-sm text-slate-500">Preferred Staff:</span>
                      <span className="text-sm font-medium">{serviceRequest.preferred_staff_id}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Location */}
              <div>
                <h3 className="font-medium text-slate-900 mb-3 flex items-center gap-2">
                  <MapPin className="w-4 h-4" />
                  Service Location
                </h3>
                <p className="text-sm text-slate-700">{serviceRequest.location_address}</p>
              </div>

              {/* Dates */}
              <div>
                <h3 className="font-medium text-slate-900 mb-3 flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  Dates
                </h3>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm text-slate-500">Start Date:</span>
                    <span className="text-sm font-medium">
                      {serviceRequest.start_date ? new Date(serviceRequest.start_date).toLocaleDateString() : 'Not set'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-slate-500">Request Date:</span>
                    <span className="text-sm font-medium">{formatDate(serviceRequest.created_at)}</span>
                  </div>
                </div>
              </div>

              {/* Remarks */}
              {serviceRequest.remarks && (
                <div>
                  <h3 className="font-medium text-slate-900 mb-3 flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    Remarks
                  </h3>
                  <p className="text-sm text-slate-700 bg-slate-50 p-3 rounded-lg">
                    {serviceRequest.remarks}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Side - Quote Form */}
        <div className="bg-white rounded-lg border border-slate-200">
          <div className="p-6 border-b border-slate-200">
            <div className="flex items-center gap-3">
              <Calculator className="w-5 h-5 text-blue-600" />
              <h2 className="text-lg font-semibold text-slate-900">Generate Quote</h2>
            </div>
          </div>

          <div className="p-6">
            {!createdQuote ? (
              <form onSubmit={handleCreateQuote} className="space-y-6">
                {/* Daily Rate */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Daily Rate (Rs.)
                  </label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="number"
                      name="daily_rate"
                      value={quoteForm.daily_rate}
                      onChange={handleInputChange}
                      required
                      className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Enter daily rate"
                    />
                  </div>
                </div>

                {/* Number of Days */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Number of Days
                  </label>
                  <input
                    type="number"
                    name="qty_days"
                    value={quoteForm.qty_days}
                    onChange={handleInputChange}
                    required
                    min="1"
                    className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                {/* Transport Fee */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Transport Fee (Rs.)
                  </label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="number"
                      name="transport_fee"
                      value={quoteForm.transport_fee}
                      onChange={handleInputChange}
                      required
                      className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>

                {/* Quote Summary */}
                <div className="bg-slate-50 rounded-lg p-4 space-y-3">
                  <h3 className="font-medium text-slate-900">Quote Summary</h3>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-600">Registration Fee:</span>
                      <span className="font-medium">Rs. {totals.regFee.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-600">Service Amount ({quoteForm.qty_days} days):</span>
                      <span className="font-medium">Rs. {totals.item2Amount.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-600">Transport Fee:</span>
                      <span className="font-medium">Rs. {totals.transport.toLocaleString()}</span>
                    </div>
                    <div className="border-t border-slate-200 pt-2">
                      <div className="flex justify-between">
                        <span className="font-semibold text-slate-900">Total Amount:</span>
                        <span className="font-bold text-blue-600 text-lg">
                          Rs. {totals.total.toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={creatingQuote || !quoteForm.daily_rate}
                  className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:bg-slate-300 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {creatingQuote ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      Creating Quote...
                    </>
                  ) : (
                    <>
                      <Calculator className="w-4 h-4" />
                      Generate Quote
                    </>
                  )}
                </button>
              </form>
            ) : (
              <div className="space-y-6">
                {/* Quote Created Success */}
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <div className="flex items-center gap-3">
                    <CheckCircle className="w-5 h-5 text-green-600" />
                    <div>
                      <h3 className="font-medium text-green-900">Quote Created Successfully!</h3>
                      <p className="text-sm text-green-700">
                        Quote Number: {createdQuote.estimate_number}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Quote Details */}
                <div className="bg-slate-50 rounded-lg p-4 space-y-3">
                  <h3 className="font-medium text-slate-900">Quote Details</h3>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-600">Quote Number:</span>
                      <span className="font-medium">{createdQuote.estimate_number}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-600">Total Amount:</span>
                      <span className="font-bold text-blue-600">
                        KES {createdQuote.total_amount?.toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="space-y-3">
                  <button
                    onClick={handleSendPDF}
                    disabled={sendingPDF}
                    className="w-full bg-green-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-green-700 transition-colors disabled:bg-slate-300 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {sendingPDF ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        Sending PDF...
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4" />
                        Send Quote via WhatsApp
                      </>
                    )}
                  </button>

                  <button
                    onClick={() => {
                      setCreatedQuote(null);
                      setQuoteForm({
                        daily_rate: '',
                        qty_days: '7',
                        transport_fee: '1000'
                      });
                    }}
                    className="w-full bg-slate-200 text-slate-700 py-3 px-4 rounded-lg font-medium hover:bg-slate-300 transition-colors"
                  >
                    Create Another Quote
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Back Button */}
      <div className="mt-6">
        <button
          onClick={() => navigate('/admin/service-requests')}
          className="flex items-center gap-2 text-slate-600 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Service Requests
        </button>
      </div>
    </AdminLayout>
  );
};

export default QuoteBuilder;