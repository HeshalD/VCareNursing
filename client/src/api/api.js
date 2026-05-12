const API_BASE_URL = import.meta.env.VITE_API_URL;



class ApiClient {

  constructor(baseURL = API_BASE_URL) {

    this.baseURL = baseURL;

    this.token = localStorage.getItem('token');

  }



  setToken(token) {

    this.token = token;

    if (token) {

      localStorage.setItem('token', token);

    } else {

      localStorage.removeItem('token');

    }

  }



  async request(endpoint, options = {}) {

    const url = `${this.baseURL}${endpoint}`;

    const config = {

      headers: {

        ...(this.token && { Authorization: `Bearer ${this.token}` }),

        ...options.headers,

      },

      ...options,

    };



    // Only set Content-Type to application/json if body is not FormData

    if (options.body && !(options.body instanceof FormData)) {

      config.headers['Content-Type'] = 'application/json';

    }



    try {

      const response = await fetch(url, config);

      const data = await response.json();



      if (!response.ok) {

        throw new Error(data.message || 'API request failed');

      }



      return data;

    } catch (error) {

      console.error('API Error:', error);

      throw error;

    }

  }



  // Auth endpoints

  async registerClient(userData) {

    return this.request('/auth/register', {

      method: 'POST',

      body: JSON.stringify(userData),

    });

  }



  async login(credentials) {

    const data = await this.request('/auth/login', {

      method: 'POST',

      body: JSON.stringify({

        mobile_number: credentials.identifier,

        password: credentials.password

      }),

    });

    

    if (data.token) {

      this.setToken(data.token);

      // Return both response data and user info for AuthContext

      return {

        ...data,

        user: {

          id: data.data?.user_id,

          role: data.data?.roles,

          mobile_number: data.data?.mobile_number,

          ...data.data?.roles

        }

      };

    }

    

    return data;

  }



  async resendOtp(email) {

    return this.request('/auth/resend-otp', {

      method: 'POST',

      body: JSON.stringify({ email }),

    });

  }



  async verifyOtp(userId, otp) {

    return this.request('/auth/verify-otp', {

      method: 'POST',

      body: JSON.stringify({ user_id: userId, otp_code: otp }),

    });

  }

  // Forgot password endpoints
  async requestForgotPasswordOtp(mobileNumber) {
    return this.request('/auth/forgot-password/request-otp', {
      method: 'POST',
      body: JSON.stringify({ mobile_number: mobileNumber }),
    });
  }

  async verifyForgotPasswordOtp(userId, otp) {
    return this.request('/auth/forgot-password/verify-otp', {
      method: 'POST',
      body: JSON.stringify({ user_id: userId, otp_code: otp }),
    });
  }

  async resetPassword(userId, otp, newPassword, confirmPassword) {
    return this.request('/auth/forgot-password/reset', {
      method: 'POST',
      body: JSON.stringify({ 
        user_id: userId, 
        otp_code: otp, 
        new_password: newPassword, 
        confirm_password: confirmPassword 
      }),
    });
  }



  async getUnifiedOverview() {

    return this.request('/auth/unified-overview');

  }



  async getAllUsers() {

    return this.request('/auth/users');

  }



  // Client endpoints

  async updateMe(userData) {

    return this.request('/client/update-me', {

      method: 'PATCH',

      body: JSON.stringify(userData),

    });

  }



  async deleteMe() {

    return this.request('/client/delete-me', {

      method: 'DELETE',

    });

  }



  async getAllClients() {

    return this.request('/client');

  }



  async getClientProfile(clientId) {

    return this.request(`/client/${clientId}`);

  }

  async getClientProfileByUserId(userId) {
    try {
      return this.request(`/client/profile/user/${userId}`);
    } catch (error) {
      throw error;
    }
  }

  // Product endpoints

  async getAllProducts() {

    return this.request('/products');

  }



  async createProduct(productData, imageFile) {

    const formData = new FormData();

    

    // Append all product data fields

    Object.keys(productData).forEach(key => {

      formData.append(key, productData[key]);

    });

    

    // Append image file if provided

    if (imageFile) {

      formData.append('image', imageFile);

    }



    return this.request('/products', {

      method: 'POST',

      headers: {

        // Remove Content-Type to let browser set it with boundary for FormData

        ...(this.token && { Authorization: `Bearer ${this.token}` }),

      },

      body: formData,

    });

  }



  // Service Request endpoints

  async submitServiceRequest(requestData) {

    return this.request('/service-requests/submit-request', {

      method: 'POST',

      body: JSON.stringify(requestData),

    });

  }



  async getAllServiceRequests() {

    return this.request('/service-requests/all-leads');

  }



  async getNewLeads() {

    return this.request('/service-requests/new_leads');

  }



  async getServiceRequestById(requestId) {

    return this.request(`/service-requests/${requestId}`);

  }

  async updateServiceRequestStatus(requestId, status) {
    return this.request(`/service-requests/${requestId}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status })

    });

  }

  async getServiceRequestQuotes(requestId) {
    return this.request(`/quotes/request/${requestId}`);
  }

  async convertToBooking(bookingData, paymentSlipFile) {
    const formData = new FormData();
    
    // Append all booking data fields
    Object.keys(bookingData).forEach(key => {
      formData.append(key, bookingData[key]);
    });
    
    // Append payment slip file if provided
    if (paymentSlipFile) {
      formData.append('payment_slip', paymentSlipFile);
    }

    return this.request('/bookings/convert', {
      method: 'POST',
      headers: {
        // Remove Content-Type to let browser set it with boundary for FormData
        ...(this.token && { Authorization: `Bearer ${this.token}` }),
      },
      body: formData,
    });
  }

  async createQuotation(quoteData) {
    return this.request('/quotes/create', {

      method: 'POST',

      body: JSON.stringify(quoteData),

    });

  }

  async sendQuotePDF(quoteId) {

    return this.request(`/quotes/send-pdf/${quoteId}`, {

      method: 'POST',

    });

  }



  // Staff endpoints

  async submitApplication(applicationData, documentFiles, profilePictureFile) {

    const formData = new FormData();

    

    // Append all application data fields

    Object.keys(applicationData).forEach(key => {

      if (key === 'applied_roles' && Array.isArray(applicationData[key])) {

        formData.append(key, JSON.stringify(applicationData[key]));

      } else {

        formData.append(key, applicationData[key]);

      }

    });

    

    // Append document files if provided

    if (documentFiles && documentFiles.length > 0) {

      documentFiles.forEach(file => {

        formData.append('documents', file);

      });

    }

    // Append profile picture if provided

    if (profilePictureFile) {

      formData.append('profile_picture', profilePictureFile);

    }



    return this.request('/staff/apply', {

      method: 'POST',

      headers: {

        // Remove Content-Type to let browser set it with boundary for FormData

        ...(this.token && { Authorization: `Bearer ${this.token}` }),

      },

      body: formData,

    });

  }



  async getApplications() {

    return this.request('/staff/applications');

  }



  async acceptApplication(applicationId) {

    return this.request('/staff/accept', {

      method: 'POST',

      body: JSON.stringify({ application_id: applicationId }),

    });

  }



  async rejectApplication(applicationId, reason) {

    return this.request('/staff/reject', {

      method: 'POST',

      body: JSON.stringify({ application_id: applicationId, reason }),

    });

  }



  async getAvailableStaffByRole(role) {

    const queryParams = role ? `?role=${encodeURIComponent(role)}` : '';

    return this.request(`/staff/available${queryParams}`);

  }


  async staffLogin(credentials) {
    const data = await this.request('/staff/login', {
      method: 'POST',
      body: JSON.stringify({
        email: credentials.identifier,
        password: credentials.password
      }),
    });
    
    if (data.token) {
      this.setToken(data.token);
      // Return both response data and user info for AuthContext
      return {
        ...data,
        user: {
          id: data.data?.user_id,
          staff_id: data.data?.staff_info?.staff_id,
          role: data.data?.staff_info,
          email: data.data?.email,
          requires_password_change: data.requires_password_change,
          ...data.data?.staff_info
        }
      };
    }
    
    return data;
  }

  async changeStaffPassword(passwordData) {
    const data = await this.request('/staff/change-password', {
      method: 'POST',
      body: JSON.stringify({
        current_password: passwordData.current_password,
        new_password: passwordData.new_password
      }),
    });
    
    if (data.token) {
      this.setToken(data.token);
    }
    
    return data;
  }

  async getStaffByID(staffId) {
    return this.request(`/staff/${staffId}`);
  }

  async getStaffByUserID(userId) {
    return this.request(`/staff/user/${userId}`);
  }

  async getAllStaff(filters = {}) {
    const queryParams = new URLSearchParams(filters).toString();
    const url = queryParams ? `/staff?${queryParams}` : '/staff';
    return this.request(url);
  }

  async updateStaffToUnavailable(staffProfileId) {
    return this.request(`/staff/${staffProfileId}/unavailable`, {
      method: 'PUT'
    });
  }

  async updateStaffStatus(staffProfileId, status) {
    return this.request(`/staff/${staffProfileId}/status`, {
      method: 'PUT',
      body: JSON.stringify({ current_status: status })
    });
  }

  async getStaffByRole(role, filters = {}) {
    const queryParams = new URLSearchParams(filters).toString();
    const url = queryParams ? `/staff/role/${role}?${queryParams}` : `/staff/role/${role}`;
    return this.request(url);
  }

  async getStaffByGender(gender, filters = {}) {
    const queryParams = new URLSearchParams(filters).toString();
    const url = queryParams ? `/staff/gender/${gender}?${queryParams}` : `/staff/gender/${gender}`;
    return this.request(url);
  }

  async getStaffWillingToLiveIn(filters = {}) {
    const queryParams = new URLSearchParams(filters).toString();
    const url = queryParams ? `/staff/willing-to-live-in?${queryParams}` : '/staff/willing-to-live-in';
    return this.request(url);
  }

  // Booking endpoints
  async createBooking(bookingData) {
    return this.request('/bookings', {
      method: 'POST',
      body: JSON.stringify(bookingData),
    });
  }

  async getMyBookings() {
    return this.request('/bookings/my-bookings');
  }

  async getActiveBookings() {
    // used by admin to fetch all active bookings
    return this.request('/bookings/active-bookings');
  }

  async getAllBookings() {
    // used by admin to fetch all bookings (active, terminated, etc.)
    return this.request('/bookings');
  }

  async getBookingById(bookingId) {
    return this.request(`/bookings/${bookingId}`);
  }

  async getActiveBookingByClientID(clientId = '') {
    const endpoint = clientId ? `/client/active-bookings/${clientId}` : '/client/active-bookings';
    return this.request(endpoint);
  }

  async getAllBookingsForClient(clientId = '') {
    const endpoint = clientId ? `/client/all-bookings/${clientId}` : '/client/all-bookings';
    return this.request(endpoint);
  }

  async updateBookingStatus(bookingId, status) {
    return this.request(`/bookings/${bookingId}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status }),
    });
  }

  async requestBookingTermination(bookingId, terminationData) {
    return this.request(`/bookings/terminate/${bookingId}`, {
      method: 'POST',
      body: JSON.stringify(terminationData),
    });
  }

  async getPendingTerminationRequests() {
    return this.request('/bookings/terminations/pending');
  }

  async approveTerminationRequest(terminationId, finalEndDate) {
    return this.request(`/bookings/terminations/approve/${terminationId}`, {
      method: 'POST',
      body: JSON.stringify({ final_end_date: finalEndDate }),
    });
  }

  // Statement endpoints
  async getClientStatement(clientId, dateRange) {
    return this.request(`/statement/${clientId}`, {
      method: 'POST',
      body: JSON.stringify(dateRange),
    });
  }

  async downloadClientStatement(clientId, dateRange) {
    const url = `${this.baseURL}/statement/download/${clientId}`;
    
    const config = {
      method: 'POST',
      headers: {
        ...(this.token && { Authorization: `Bearer ${this.token}` }),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(dateRange),
    };

    try {
      const response = await fetch(url, config);
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'PDF download failed');
      }

      // Return the PDF blob directly
      return await response.blob();
    } catch (error) {
      console.error('PDF Download Error:', error);
      throw error;
    }
  }

  // Admin Staff Management endpoints
  async createStaffProfile(staffData) {
    return this.request('/staff/proxy-create', {
      method: 'POST',
      body: staffData, // Pass FormData directly without JSON.stringify
    });
  }

  async updateStaffProfile(staffProfileId, staffData) {
    return this.request(`/staff/${staffProfileId}`, {
      method: 'PUT',
      body: staffData, // Pass FormData directly without JSON.stringify
    });
  }

  async deleteStaffProfile(staffProfileId) {
    return this.request(`/staff/${staffProfileId}`, {
      method: 'DELETE',
    });
  }

  // Admin Service Request Management endpoints
  async createProxyServiceRequest(requestData) {
    return this.request('/service-requests/proxy-service-request', {
      method: 'POST',
      body: JSON.stringify(requestData),
    });
  }

  async requestAdvance(advanceData) {
    return this.request('/staff-wallet/request-advance', {
      method: 'POST',
      body: JSON.stringify(advanceData),
    });
  }

  async getAllAdvances() {
    return this.request('/staff-wallet/advances');
  }

  async approveAdvance(advanceId) {
    return this.request(`/staff-wallet/approve-advance/${advanceId}`, {
      method: 'POST',
    });
  }

  async rejectAdvance(advanceId, reason) {
    return this.request(`/staff-wallet/reject-advance/${advanceId}`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  }

  async updateAdvanceThreshold(staffProfileId, thresholdData) {
    return this.request(`/staff-wallet/threshold/${staffProfileId}`, {
      method: 'PATCH',
      body: JSON.stringify(thresholdData),
    });
  }

  async getPendingAdvances() {
    return this.request('/staff-wallet/advances/pending');
  }

  // Staff Review endpoints
  async createStaffReview(reviewData) {
    return this.request('/staff-reviews', {
      method: 'POST',
      body: JSON.stringify(reviewData),
    });
  }

  async getClientReviews(clientProfileId, page = 1, limit = 10) {
    return this.request(`/staff-reviews/client/${clientProfileId}?page=${page}&limit=${limit}`);
  }

  // Finances endpoints
  async getFinancesOverview() {
    return this.request('/finances/overview');
  }

  async getFinancesTransactions(params = {}) {
    const queryParams = new URLSearchParams(params).toString();
    const url = queryParams ? `/finances/transactions?${queryParams}` : '/finances/transactions';
    return this.request(url);
  }

  async getAdvancesSummary() {
    return this.request('/finances/advances-summary');
  }

  async getStaffWalletsSummary() {
    return this.request('/finances/staff-wallets-summary');
  }

  async getCreditAlertsSummary() {
    return this.request('/finances/credit-alerts-summary');
  }

  async getStoreSummary() {
    return this.request('/finances/store-summary');
  }

  async getRevenueChart(period) {
    const queryParams = period ? `?period=${encodeURIComponent(period)}` : '';
    const url = `/finances/revenue-chart${queryParams}`;
    return this.request(url);
  }

  async getTransactionCategoriesChart() {
    return this.request('/finances/transaction-categories-chart');
  }

  // Client-specific endpoints
  async getClientProfileByUserId(userId) {
    return this.request(`/client/profile/user/${userId}`);
  }

  async getClientServiceHistory(clientId) {
    return this.request(`/client/service-history/${clientId}`);
  }

  async getClientServiceRequests(clientId) {
    return this.request(`/service-requests/client/${clientId}`);
  }

  async getClientServiceRequestsWithQuotes(clientId) {
    return this.request(`/service-requests/client/${clientId}/with-quotes`);
  }

  async getClientServiceRequestsWithPayments(clientId) {
    return this.request(`/service-requests/client/${clientId}/with-payments`);
  }

  async getClientQuotes(clientId) {
    return this.request(`/quotes/client/${clientId}`);
  }

  async getClientPaymentSlips(clientId) {
    return this.request(`/payment-slips/client/${clientId}`);
  }

  async getClientBookings(clientId) {
    return this.request(`/bookings/client/${clientId}`);
  }

  async getStaffBookings(staffId) {
    return this.request(`/bookings/staff/${staffId}`);
  }

  // Financial endpoints
  async getClientWalletBalance(clientId) {
    return this.request(`/client/wallet-balance/${clientId}`);
  }

  async getClientPaymentHistory(clientId, queryParams = {}) {
    const queryString = new URLSearchParams(queryParams).toString();
    const url = queryString ? `/client/payment-history/${clientId}?${queryString}` : `/client/payment-history/${clientId}`;
    return this.request(url);
  }

  async getClientOverduePayments(clientId) {
    return this.request(`/client/overdue-payments/${clientId}`);
  }

  // ==================== MODULAR QUOTE ENDPOINTS ====================

  // Preset Items Management
  async getPresetItems() {
    return this.request('/quotes/presets');
  }

  async createPresetItem(presetData) {
    return this.request('/quotes/presets', {
      method: 'POST',
      body: JSON.stringify(presetData),
    });
  }

  async updatePresetItem(presetId, presetData) {
    return this.request(`/quotes/presets/${presetId}`, {
      method: 'PUT',
      body: JSON.stringify(presetData),
    });
  }

  async deletePresetItem(presetId) {
    return this.request(`/quotes/presets/${presetId}`, {
      method: 'DELETE',
    });
  }

  // Modular Quote Operations
  async createModularQuotation(quoteData) {
    return this.request('/quotes/create-modular', {
      method: 'POST',
      body: JSON.stringify(quoteData),
    });
  }

  async getQuoteWithLineItems(quoteId) {
    return this.request(`/quotes/${quoteId}/details`);
  }

  async updateQuoteLineItems(quoteId, lineItemsData) {
    return this.request(`/quotes/${quoteId}/line-items`, {
      method: 'PUT',
      body: JSON.stringify(lineItemsData),
    });
  }

  // Patient endpoints
  async getPatientsByClient(clientId) {
    return this.request(`/patients/client/${clientId}`);
  }
}

// Create and export a singleton instance
const apiClient = new ApiClient();
export default apiClient;
export { ApiClient };