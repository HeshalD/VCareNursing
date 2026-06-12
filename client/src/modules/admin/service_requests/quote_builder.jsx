import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import AdminLayout from '../components/AdminLayout';
import apiClient from '../../../api/api';
import {
  User,
  Phone,
  MapPin,
  Calendar,
  FileText,
  Calculator,
  Send,
  AlertCircle,
  CheckCircle,
  ArrowLeft,
  Plus,
  Minus
} from 'lucide-react';
import QuoteLineItem from '../service_quotes/QuoteLineItem';
import PresetItemSelector from '../service_quotes/PresetItemSelector';
import QuoteSummary from '../service_quotes/QuoteSummary';
import PresetManager from '../service_quotes/PresetManager';

const QuoteBuilder = () => {
  const { requestId } = useParams();
  const navigate = useNavigate();
  
  // State
  const [serviceRequest, setServiceRequest] = useState(null);
  const [clientProfile, setClientProfile] = useState(null);
  const [presets, setPresets] = useState([]);
  const [lineItems, setLineItems] = useState([]);
  const [termsConditions, setTermsConditions] = useState('The initial estimated amount is non-refundable.');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [creatingQuote, setCreatingQuote] = useState(false);
  const [sendingPDF, setSendingPDF] = useState(false);
  const [createdQuote, setCreatedQuote] = useState(null);
  const [showPresetManager, setShowPresetManager] = useState(false);

  useEffect(() => {
    if (requestId) {
      fetchServiceRequest();
      fetchPresets();
    } else {
      fetchNewLeads();
    }
  }, [requestId]);

  const fetchServiceRequest = async () => {
    if (!requestId) {
      setError('No service request ID provided');
      return;
    }
    
    try {
      setLoading(true);
      const response = await apiClient.getServiceRequestById(requestId);
      setServiceRequest(response.data);
      
      if (response.data.client_id) {
        try {
          const clientResponse = await apiClient.getClientProfile(response.data.client_id);
          setClientProfile(clientResponse.data);
        } catch (clientErr) {
          console.warn('Failed to fetch client profile:', clientErr);
        }
      }
    } catch (err) {
      if (err.message?.includes('404') || err.message?.includes('not found')) {
        setError('Service request not found');
      } else {
        setError('Failed to fetch service request');
      }
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
        setServiceRequest(leads[0]);
        navigate(`/admin/quote-builder/${leads[0].request_id}`, { replace: true });
      }
    } catch (err) {
      setError('Failed to fetch new leads');
    } finally {
      setLoading(false);
    }
  };

  const fetchPresets = async () => {
    try {
      const response = await fetch('/api/quotes/presets', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      const data = await response.json();
      setPresets(data.data || []);
    } catch (err) {
      console.warn('Failed to fetch presets:', err);
    }
  };

  const addPresetItem = (presetItem) => {
    const newItem = {
      ...presetItem,
      sort_order: lineItems.length
    };
    setLineItems([...lineItems, newItem]);
  };

  const addCustomItem = (type) => {
    const newItem = {
      item_type: type,
      description: '',
      quantity: 1,
      unit_price: 0,
      sort_order: lineItems.length
    };
    setLineItems([...lineItems, newItem]);
  };

  const updateLineItem = (index, updatedItem) => {
    const newItems = [...lineItems];
    newItems[index] = updatedItem;
    setLineItems(newItems);
  };

  const deleteLineItem = (index) => {
    const newItems = lineItems.filter((_, i) => i !== index);
    const reorderedItems = newItems.map((item, i) => ({
      ...item,
      sort_order: i
    }));
    setLineItems(reorderedItems);
  };

  const moveLineItem = (index, direction) => {
    const newItems = [...lineItems];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    
    if (targetIndex < 0 || targetIndex >= lineItems.length) return;
    
    [newItems[index], newItems[targetIndex]] = [newItems[targetIndex], newItems[index]];
    
    const reorderedItems = newItems.map((item, i) => ({
      ...item,
      sort_order: i
    }));
    
    setLineItems(reorderedItems);
  };

  const calculateTotals = () => {
    let totalCharges = 0;
    let totalDiscounts = 0;
    
    lineItems.forEach(item => {
      if (item.item_type === 'CHARGE') {
        totalCharges += parseFloat(item.amount) || 0;
      } else if (item.item_type === 'DISCOUNT') {
        totalDiscounts += Math.abs(parseFloat(item.amount) || 0);
      }
    });

    return {
      totalCharges,
      totalDiscounts,
      subtotal: totalCharges - totalDiscounts
    };
  };

  const handleCreateQuote = async (e) => {
    e.preventDefault();
    if (!serviceRequest || lineItems.length === 0) return;

    const totals = calculateTotals();
    if (totals.subtotal <= 0) {
      setError('Quote total must be greater than zero');
      return;
    }

    try {
      setCreatingQuote(true);
      setError('');

      const response = await fetch('/api/quotes/create-modular', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          request_id: serviceRequest.request_id,
          line_items: lineItems,
          terms_conditions: termsConditions
        })
      });

      if (!response.ok) {
        throw new Error('Failed to create quote');
      }

      const data = await response.json();
      setCreatedQuote(data.data);
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
      <AdminLayout title="Modular Quote Builder" subtitle="Loading...">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      </AdminLayout>
    );
  }

  if (error && !serviceRequest) {
    return (
      <AdminLayout title="Modular Quote Builder" subtitle="Error">
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
      title="Modular Quote Builder" 
      subtitle={serviceRequest ? `Quote for ${serviceRequest.patient_name}` : 'Create Quote'}
    >
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Left Side - Service Request Details */}
        <div className="xl:col-span-1">
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
                    Care Profile Information
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

                {/* Registration Fee Status */}
                {clientProfile && (
                  <div>
                    <h3 className="font-medium text-slate-900 mb-3">Client Status</h3>
                    {clientProfile.is_registration_fee_paid ? (
                      <div className="flex items-center gap-2 text-sm text-green-600 bg-green-50 px-3 py-2 rounded-lg border border-green-200">
                        <CheckCircle className="w-4 h-4" />
                        <span>Registration fee already paid</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-sm text-amber-600 bg-amber-50 px-3 py-2 rounded-lg border border-amber-200">
                        <AlertCircle className="w-4 h-4" />
                        <span>Registration fee pending</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right Side - Quote Builder */}
        <div className="xl:col-span-2 space-y-6">
          {!createdQuote ? (
            <>
              {/* Preset Selector */}
              <div className="bg-white rounded-lg border border-slate-200 p-6">
                <PresetItemSelector
                  presets={presets}
                  onSelectPreset={addPresetItem}
                  onManagePresets={() => setShowPresetManager(true)}
                />
              </div>

              {/* Custom Item Buttons */}
              <div className="bg-white rounded-lg border border-slate-200 p-6">
                <h3 className="font-medium text-slate-900 mb-4">Add Custom Items</h3>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => addCustomItem('CHARGE')}
                    className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    Add Charge
                  </button>
                  <button
                    type="button"
                    onClick={() => addCustomItem('DISCOUNT')}
                    className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                  >
                    <Minus className="w-4 h-4" />
                    Add Discount
                  </button>
                </div>
              </div>

              {/* Line Items */}
              <div className="bg-white rounded-lg border border-slate-200">
                <div className="p-6 border-b border-slate-200">
                  <h3 className="font-medium text-slate-900">Quote Items ({lineItems.length})</h3>
                </div>
                
                <div className="p-6">
                  {lineItems.length === 0 ? (
                    <div className="text-center py-8 text-slate-500">
                      <Calculator className="w-12 h-12 mx-auto mb-4 text-slate-300" />
                      <p>No items added yet. Add preset items or create custom charges/discounts.</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {lineItems.map((item, index) => (
                        <QuoteLineItem
                          key={index}
                          item={item}
                          index={index}
                          onUpdate={(updated) => updateLineItem(index, updated)}
                          onDelete={() => deleteLineItem(index)}
                          onMoveUp={() => moveLineItem(index, 'up')}
                          onMoveDown={() => moveLineItem(index, 'down')}
                          isFirst={index === 0}
                          isLast={index === lineItems.length - 1}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Quote Summary */}
              <QuoteSummary
                lineItems={lineItems}
                termsConditions={termsConditions}
                onTermsChange={setTermsConditions}
              />

              {/* Error Message */}
              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <div className="flex items-center gap-3">
                    <AlertCircle className="w-5 h-5 text-red-600" />
                    <span className="text-red-800">{error}</span>
                  </div>
                </div>
              )}

              {/* Submit Button */}
              <button
                onClick={handleCreateQuote}
                disabled={creatingQuote || lineItems.length === 0 || totals.subtotal <= 0}
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
                    Create Quote
                  </>
                )}
              </button>
            </>
          ) : (
            /* Quote Created Success */
            <div className="bg-white rounded-lg border border-slate-200 p-6">
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
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
              <div className="bg-slate-50 rounded-lg p-4 space-y-3 mb-6">
                <h3 className="font-medium text-slate-900">Quote Details</h3>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-600">Quote Number:</span>
                    <span className="font-medium">{createdQuote.estimate_number}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-600">Total Amount:</span>
                    <span className="font-bold text-blue-600">
                      Rs. {createdQuote.total_amount?.toLocaleString()}
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
                    setLineItems([]);
                    setTermsConditions('The initial estimated amount is non-refundable.');
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

      {/* Preset Manager Modal */}
      <PresetManager
        isOpen={showPresetManager}
        onClose={() => setShowPresetManager(false)}
        onSave={() => {
          setShowPresetManager(false);
          fetchPresets();
        }}
      />
    </AdminLayout>
  );
};

export default QuoteBuilder;