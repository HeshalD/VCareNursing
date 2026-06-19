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

  async getAdminClientDetail(clientId) {
    return this.request(`/client/${clientId}/detail`);
  }

  async getAdminClientBookings(clientId) {
    return this.request(`/client/${clientId}/bookings`);
  }

  async getAdminClientBookingsPaginated(clientId, { active_page = 1, recent_page = 1, page_size = 5, search = '' } = {}) {
    const params = new URLSearchParams({ active_page, recent_page, page_size });
    if (search) params.set('search', search);
    return this.request(`/client/${clientId}/bookings-paginated?${params.toString()}`);
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

  async updateServiceRequest(requestId, data) {
    return this.request(`/service-requests/${requestId}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  }

  async getServiceRequestQuotes(requestId) {
    return this.request(`/quotes/request/${requestId}`);
  }

  async getServiceRequestQuoteList(requestId) {
    return this.request(`/quotes/request/${requestId}/list`);
  }

  async getQuoteDetails(quoteId) {
    return this.request(`/quotes/${quoteId}/details`);
  }

  async getQuotePaymentProgress(quoteId) {
    return this.request(`/quotes/${quoteId}/payment-progress`);
  }

  async getQuotePayments(quoteId) {
    return this.request(`/quotes/${quoteId}/payments`);
  }

  async getBookingAssignmentFormData(bookingId) {
    return this.request(`/assignments/${bookingId}/assignment-form`);
  }

  async assignStaffToBooking(bookingId, assignmentData) {
    return this.request(`/assignments/${bookingId}/assign-staff`, {
      method: 'POST',
      body: JSON.stringify(assignmentData),
    });
  }

  async getBookingAssignments(bookingId) {
    return this.request(`/assignments/${bookingId}/assignments`);
  }

  async recordQuotePayment(quoteId, paymentData, paymentSlipFile = null) {
    if (paymentSlipFile) {
      const formData = new FormData();
      Object.entries(paymentData).forEach(([key, value]) => {
        if (value !== null && value !== undefined && value !== '') {
          formData.append(key, value);
        }
      });
      formData.append('payment_slip', paymentSlipFile);

      return this.request(`/quotes/${quoteId}/record-payment`, {
        method: 'POST',
        headers: {
          ...(this.token && { Authorization: `Bearer ${this.token}` }),
        },
        body: formData,
      });
    }

    return this.request(`/quotes/${quoteId}/record-payment`, {
      method: 'POST',
      body: JSON.stringify(paymentData),
    });
  }

  async recordBookingPayment(bookingId, paymentData, paymentSlipFile = null) {
    if (paymentSlipFile) {
      const formData = new FormData();
      Object.entries(paymentData).forEach(([key, value]) => {
        if (value !== null && value !== undefined && value !== '') {
          formData.append(key, value);
        }
      });
      formData.append('payment_slip', paymentSlipFile);

      return this.request(`/bookings/${bookingId}/record-payment`, {
        method: 'POST',
        headers: {
          ...(this.token && { Authorization: `Bearer ${this.token}` }),
        },
        body: formData,
      });
    }

    return this.request(`/bookings/${bookingId}/record-payment`, {
      method: 'POST',
      body: JSON.stringify(paymentData),
    });
  }

  async walletPayoffBooking(bookingId, amount, notes = null) {
    return this.request(`/bookings/${bookingId}/wallet-payoff`, {
      method: 'POST',
      body: JSON.stringify({ amount, notes }),
    });
  }

  async verifyQuotePayment(paymentId, verification_notes) {
    return this.request(`/payments/${paymentId}/verify`, {
      method: 'POST',
      body: JSON.stringify({ verification_notes }),
    });
  }

  async rejectQuotePayment(paymentId, rejection_reason) {
    return this.request(`/payments/${paymentId}/reject`, {
      method: 'POST',
      body: JSON.stringify({ rejection_reason }),
    });
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

  async checkQuoteBooking(quoteId) {
    return this.request(`/quotes/${quoteId}/check-booking`);
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

  async submitApplication(applicationData, documentFiles, profilePictureFile, nicFrontFile, nicBackFile) {

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

    if (nicFrontFile) {

      formData.append('nic_front', nicFrontFile);

    }

    if (nicBackFile) {

      formData.append('nic_back', nicBackFile);

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



  async verifyStaffApplicationOtp(applicationId, otpCode) {
    return this.request('/staff/verify-otp', {
      method: 'POST',
      body: JSON.stringify({ application_id: applicationId, otp_code: otpCode }),
    });
  }

  async resendStaffApplicationOtp(applicationId) {
    return this.request('/staff/resend-otp', {
      method: 'POST',
      body: JSON.stringify({ application_id: applicationId }),
    });
  }

  async getApplications() {

    return this.request('/staff/applications');

  }



  async getApplication(applicationId) {
    return this.request(`/staff/applications/${applicationId}`);
  }

  async updateApplicationDetails(applicationId, data) {
    return this.request(`/staff/applications/${applicationId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async acceptApplication(applicationId, extras = {}) {

    return this.request('/staff/accept', {

      method: 'POST',

      body: JSON.stringify({ application_id: applicationId, ...extras }),

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

  async getAdminStaffDetail(staffProfileId) {
    return this.request(`/staff/${staffProfileId}/admin-detail`);
  }

  async getStaffCurrentBooking(staffProfileId) {
    return this.request(`/staff/${staffProfileId}/current-booking`);
  }

  async getStaffBookingHistory(staffProfileId, filters = {}) {
    const queryParams = new URLSearchParams(filters).toString();
    const url = queryParams ? `/staff/${staffProfileId}/booking-history?${queryParams}` : `/staff/${staffProfileId}/booking-history`;
    return this.request(url);
  }

  async getStaffAttendanceCalendar(staffProfileId) {
    return this.request(`/staff/${staffProfileId}/attendance-calendar`);
  }

  async getStaffEarningsSummary(staffProfileId) {
    return this.request(`/staff/${staffProfileId}/earnings-summary`);
  }

  async getStaffEarningsTransactions(staffProfileId, filters = {}) {
    const queryParams = new URLSearchParams(filters).toString();
    const url = queryParams ? `/staff/${staffProfileId}/earnings-transactions?${queryParams}` : `/staff/${staffProfileId}/earnings-transactions`;
    return this.request(url);
  }

  async getStaffPayoutsSummary(staffProfileId) {
    return this.request(`/staff/${staffProfileId}/payouts/summary`);
  }

  async getStaffPayouts(staffProfileId, filters = {}) {
    const queryParams = new URLSearchParams(filters).toString();
    const url = queryParams ? `/staff/${staffProfileId}/payouts?${queryParams}` : `/staff/${staffProfileId}/payouts`;
    return this.request(url);
  }

  async createStaffPayout(staffProfileId, payoutData) {
    return this.request(`/staff/${staffProfileId}/payouts`, {
      method: 'POST',
      body: JSON.stringify(payoutData),
    });
  }

  async getStaffTotalEarningsBreakdown(staffProfileId) {
    return this.request(`/staff/${staffProfileId}/total-earnings-breakdown`);
  }

  async getStaffSalariesOverview(showAll = false) {
    return this.request(`/staff/salaries/overview${showAll ? '?all=true' : ''}`);
  }

  async getStaffSalariesExportData() {
    return this.request('/staff/salaries/full-export');
  }

  async getStaffBookingSalaryBreakdown(staffProfileId) {
    return this.request(`/staff/${staffProfileId}/booking-salary-breakdown`);
  }

  async getStaffMonthlyEarnings(staffProfileId, year, month) {
    return this.request(`/staff/${staffProfileId}/monthly-earnings?year=${year}&month=${month}`);
  }

  async getSalarySheetLedger() {
    return this.request('/staff/salary-sheets/ledger');
  }

  async resendSalarySheetNotification(staffPaymentId) {
    return this.request(`/staff/salary-sheets/${staffPaymentId}/send-notification`, { method: 'POST' });
  }

  async bulkResendSalarySheetNotifications(staffPaymentIds, mode = 'selective') {
    return this.request('/staff/salary-sheets/bulk-send-notifications', {
      method: 'POST',
      body: JSON.stringify({ staff_payment_ids: staffPaymentIds, mode }),
    });
  }

  async bulkStaffPayouts(payouts, companyBankAccountId, paymentMethod, referenceNumber, notes) {
    return this.request('/staff/salaries/bulk-payouts', {
      method: 'POST',
      body: JSON.stringify({
        payouts,
        company_bank_account_id: companyBankAccountId,
        payment_method: paymentMethod,
        reference_number: referenceNumber,
        notes,
      }),
    });
  }

  async getStaffCurrentEarningsBreakdown(staffProfileId, filters = {}) {
    const queryParams = new URLSearchParams(filters).toString();
    const url = queryParams
      ? `/staff/${staffProfileId}/current-earnings-breakdown?${queryParams}`
      : `/staff/${staffProfileId}/current-earnings-breakdown`;
    return this.request(url);
  }

  async getStaffBankAccounts(staffProfileId) {
    return this.request(`/staff/${staffProfileId}/bank-accounts`);
  }

  async createStaffBankAccount(staffProfileId, data) {
    return this.request(`/staff/${staffProfileId}/bank-accounts`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateStaffBankAccount(staffProfileId, bankAccountId, data) {
    return this.request(`/staff/${staffProfileId}/bank-accounts/${bankAccountId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteStaffBankAccount(staffProfileId, bankAccountId) {
    return this.request(`/staff/${staffProfileId}/bank-accounts/${bankAccountId}`, {
      method: 'DELETE',
    });
  }

  async getStaffDeductions(staffProfileId, filters = {}) {
    const queryParams = new URLSearchParams(filters).toString();
    const url = queryParams ? `/staff/${staffProfileId}/deductions?${queryParams}` : `/staff/${staffProfileId}/deductions`;
    return this.request(url);
  }

  async createStaffDeduction(staffProfileId, data) {
    return this.request(`/staff/${staffProfileId}/deductions`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async deactivateStaffAccount(staffProfileId) {
    return this.request(`/staff/${staffProfileId}/deactivate`, {
      method: 'PATCH',
    });
  }

  async reactivateStaffAccount(staffProfileId) {
    return this.request(`/staff/${staffProfileId}/reactivate`, {
      method: 'PATCH',
    });
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

  async getAdminBookingDetail(bookingId) {
    return this.request(`/bookings/${bookingId}/admin-detail`);
  }

  async getBookingTerminationHistory(bookingId) {
    return this.request(`/bookings/${bookingId}/termination-requests`);
  }

  async getBookingInvoiceBreakdown(bookingId) {
    return this.request(`/bookings/${bookingId}/invoice-breakdown`);
  }

  async getBookingStaffAllocationHistory(bookingId) {
    return this.request(`/bookings/${bookingId}/staff-allocation-history`);
  }

  async completeBooking(bookingId, bookingData) {
    return this.request(`/bookings/${bookingId}/complete`, {
      method: 'POST',
      body: JSON.stringify(bookingData),
    });
  }

  async adminTerminateBooking(bookingId, bookingData) {
    return this.request(`/bookings/${bookingId}/admin-terminate`, {
      method: 'POST',
      body: JSON.stringify(bookingData),
    });
  }

  async swapBookingStaff(bookingId, swapData) {
    return this.request(`/bookings/${bookingId}/swap-staff`, {
      method: 'POST',
      body: JSON.stringify(swapData),
    });
  }

  // ── Daily attendance & manual daily invoicing ──────────────────────────

  async getBookingAttendance(bookingId) {
    return this.request(`/bookings/${bookingId}/attendance`);
  }

  async upsertBookingAttendance(bookingId, attendanceData) {
    return this.request(`/bookings/${bookingId}/attendance`, {
      method: 'POST',
      body: JSON.stringify(attendanceData),
    });
  }

  async confirmAttendanceSalary(attendanceId, approve) {
    return this.request(`/bookings/attendance/${attendanceId}/confirm-salary`, {
      method: 'POST',
      body: JSON.stringify({ approve }),
    });
  }

  async getBookingDailyInvoices(bookingId) {
    return this.request(`/bookings/${bookingId}/daily-invoices`);
  }

  async confirmBookingDailyInvoice(bookingId, payload) {
    return this.request(`/bookings/${bookingId}/daily-invoices`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async updateBookingInvoicingMode(bookingId, invoicing_mode) {
    return this.request(`/bookings/${bookingId}/invoicing-mode`, {
      method: 'PATCH',
      body: JSON.stringify({ invoicing_mode }),
    });
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

  async getTerminationHistory() {
    return this.request('/bookings/terminations/history');
  }

  async approveTerminationRequest(terminationId, finalEndDate, settlementAction, settlementNote) {
    return this.request(`/bookings/terminations/approve/${terminationId}`, {
      method: 'POST',
      body: JSON.stringify({
        final_end_date: finalEndDate,
        settlement_action: settlementAction,
        settlement_note: settlementNote || null,
      }),
    });
  }

  // ── Scheduled actions / Upcoming Events ────────────────────────────────

  async getUpcomingEvents() {
    return this.request('/scheduled-actions/upcoming');
  }

  async cancelScheduledAction(actionId) {
    return this.request(`/scheduled-actions/${actionId}/cancel`, {
      method: 'POST',
    });
  }

  async executeScheduledActionNow(actionId) {
    return this.request(`/scheduled-actions/${actionId}/execute-now`, {
      method: 'POST',
    });
  }

  // Statement endpoints
  async getClientStatement(clientId, dateRange = {}) {
    const params = new URLSearchParams();
    if (dateRange.start_date) params.set('start_date', dateRange.start_date);
    if (dateRange.end_date) params.set('end_date', dateRange.end_date);
    const qs = params.toString();
    return this.request(`/statement/${clientId}${qs ? `?${qs}` : ''}`);
  }

  async getClientTransactions(clientId) {
    return this.request(`/statement/transactions/${clientId}`);
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

  async sendClientStatementToWhatsApp(clientId, dateRange) {
    return this.request(`/statement/whatsapp/${clientId}`, {
      method: 'POST',
      body: JSON.stringify(dateRange),
    });
  }

  async resendStatementWhatsApp(statementId) {
    return this.request(`/statement/whatsapp-resend/${statementId}`, {
      method: 'POST',
    });
  }

  async deleteStatement(statementId) {
    return this.request(`/statement/${statementId}`, {
      method: 'DELETE',
    });
  }

  async getSavedStatements(params = {}) {
    const qs = new URLSearchParams(params).toString();
    return this.request(`/statement/saved${qs ? '?' + qs : ''}`);
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

  async getMyWallet() {
    return this.request('/staff-wallet/my-wallet');
  }

  async requestAdvance(advanceData) {
    return this.request('/staff-wallet/request-advance', {
      method: 'POST',
      body: JSON.stringify(advanceData),
    });
  }

  async getMyAdvances() {
    return this.request('/staff-wallet/my-advances');
  }

  async getMyCurrentEarningsBreakdown(filters = {}) {
    const queryParams = new URLSearchParams(filters).toString();
    const url = queryParams ? `/staff-wallet/my-earnings-breakdown?${queryParams}` : `/staff-wallet/my-earnings-breakdown`;
    return this.request(url);
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

  async getReviewableBookings() {
    return this.request('/staff-reviews/reviewable');
  }

  async getAdminAllReviews({ page = 1, limit = 10, is_visible, search = '' } = {}) {
    const params = new URLSearchParams({ page, limit });
    if (is_visible !== undefined && is_visible !== '') params.set('is_visible', is_visible);
    if (search) params.set('search', search);
    return this.request(`/staff-reviews?${params.toString()}`);
  }

  async toggleReviewVisibility(reviewId) {
    return this.request(`/staff-reviews/${reviewId}/visibility`, { method: 'PATCH' });
  }

  async getUnreviewedBookings({ page = 1, limit = 10, search = '' } = {}) {
    const params = new URLSearchParams({ page, limit });
    if (search) params.set('search', search);
    return this.request(`/staff-reviews/unreviewed-bookings?${params.toString()}`);
  }

  async sendReviewRequest(bookingId) {
    return this.request('/staff-reviews/send-review-request', {
      method: 'POST',
      body: JSON.stringify({ booking_id: bookingId }),
    });
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

  // Bank Account Management endpoints
  async getBankAccounts() {
    return this.request('/bank-accounts');
  }

  async createBankAccount(accountData) {
    return this.request('/bank-accounts', {
      method: 'POST',
      body: JSON.stringify(accountData),
    });
  }

  async updateBankAccount(accountId, accountData) {
    return this.request(`/bank-accounts/${accountId}`, {
      method: 'PUT',
      body: JSON.stringify(accountData),
    });
  }

  async deactivateBankAccount(accountId) {
    return this.request(`/bank-accounts/${accountId}`, {
      method: 'DELETE',
    });
  }

  async getBankAccountTransactions(accountId, filters = {}) {
    const query = new URLSearchParams(filters).toString();
    const endpoint = query
      ? `/bank-accounts/${accountId}/transactions?${query}`
      : `/bank-accounts/${accountId}/transactions`;
    return this.request(endpoint);
  }

  async getBankAccountReconciliation(accountId) {
    return this.request(`/bank-accounts/${accountId}/reconciliation`);
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
    return this.request(`/assignments/staff/${staffId}/bookings`);
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
  async getAllPatients(params = {}) {
    const qs = new URLSearchParams(params).toString();
    return this.request(`/patients/all${qs ? `?${qs}` : ''}`);
  }

  async getPatientsByClient(clientId) {
    return this.request(`/patients/client/${clientId}`);
  }

  async createPatient(patientData) {
    return this.request('/patients/create', {
      method: 'POST',
      body: JSON.stringify(patientData),
    });
  }

  async updatePatient(patientId, patientData) {
    return this.request(`/patients/${patientId}`, {
      method: 'PUT',
      body: JSON.stringify(patientData),
    });
  }

  async deletePatient(patientId) {
    return this.request(`/patients/${patientId}`, {
      method: 'DELETE',
    });
  }

  async getPatientDetail(patientId) {
    return this.request(`/patients/${patientId}/detail`);
  }

  // Staff change request endpoints (staff-facing)
  async submitChangeRequest(data) {
    return this.request('/staff-change-requests', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getMyChangeRequests() {
    return this.request('/staff-change-requests/my');
  }

  // Staff change request endpoints (admin-facing)
  async getAllChangeRequests(params = {}) {
    const query = new URLSearchParams(params).toString();
    const endpoint = query ? `/staff-change-requests?${query}` : '/staff-change-requests';
    return this.request(endpoint);
  }

  async claimChangeRequest(id) {
    return this.request(`/staff-change-requests/${id}/claim`, {
      method: 'PATCH',
    });
  }

  async resolveChangeRequest(id, data) {
    return this.request(`/staff-change-requests/${id}/resolve`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async getChangeRequestLogs(id) {
    return this.request(`/staff-change-requests/${id}/logs`);
  }

  // Booking Notes endpoints
  async getBookingNotes(bookingId) {
    return this.request(`/bookings/${bookingId}/notes`);
  }

  async addBookingNote(bookingId, noteData) {
    return this.request(`/bookings/${bookingId}/notes`, {
      method: 'POST',
      body: JSON.stringify(noteData),
    });
  }

  async updateBookingNote(bookingId, noteId, noteData) {
    return this.request(`/bookings/${bookingId}/notes/${noteId}`, {
      method: 'PATCH',
      body: JSON.stringify(noteData),
    });
  }

  async deleteBookingNote(bookingId, noteId) {
    return this.request(`/bookings/${bookingId}/notes/${noteId}`, {
      method: 'DELETE',
    });
  }

  async getClientNotes(clientId, params = {}) {
    const query = new URLSearchParams(params).toString();
    const endpoint = query ? `/client/${clientId}/notes?${query}` : `/client/${clientId}/notes`;
    return this.request(endpoint);
  }

  async addClientNote(clientId, noteData) {
    return this.request(`/client/${clientId}/notes`, {
      method: 'POST',
      body: JSON.stringify(noteData),
    });
  }

  async updateClientNote(clientId, noteId, noteData) {
    return this.request(`/client/${clientId}/notes/${noteId}`, {
      method: 'PATCH',
      body: JSON.stringify(noteData),
    });
  }

  async deleteClientNote(clientId, noteId) {
    return this.request(`/client/${clientId}/notes/${noteId}`, {
      method: 'DELETE',
    });
  }

  // Client Payment Recording endpoints
  async recordClientPayment(clientId, paymentData, paymentSlipFile = null) {
    if (paymentSlipFile) {
      const formData = new FormData();
      formData.append('payment_slip', paymentSlipFile);
      const { allocations, ...rest } = paymentData;
      Object.entries(rest).forEach(([key, value]) => {
        if (value !== null && value !== undefined && value !== '') {
          formData.append(key, value);
        }
      });
      formData.append('allocations', JSON.stringify(allocations));
      return this.request(`/client-payments/${clientId}/record`, {
        method: 'POST',
        headers: { ...(this.token && { Authorization: `Bearer ${this.token}` }) },
        body: formData,
      });
    }
    return this.request(`/client-payments/${clientId}/record`, {
      method: 'POST',
      body: JSON.stringify(paymentData),
    });
  }

  async getClientPaymentRecords(clientId) {
    return this.request(`/client-payments/${clientId}`);
  }

  // Activity log endpoints
  async getActivityLog(params = {}) {
    const query = new URLSearchParams(params).toString();
    const endpoint = query ? `/activity-log?${query}` : '/activity-log';
    return this.request(endpoint);
  }

  async getActivityLogByActor(userId, params = {}) {
    const query = new URLSearchParams(params).toString();
    const endpoint = query ? `/activity-log/actor/${userId}?${query}` : `/activity-log/actor/${userId}`;
    return this.request(endpoint);
  }

  // Transactions endpoints
  async getAllTransactions(params = {}) {
    const query = new URLSearchParams(params).toString();
    const endpoint = query ? `/transactions?${query}` : '/transactions';
    return this.request(endpoint);
  }

  async getTransactionMeta() {
    return this.request('/transactions/meta');
  }

  async createManualTransaction(transactionData) {
    return this.request('/transactions/manual', {
      method: 'POST',
      body: JSON.stringify(transactionData),
    });
  }

  // Permissions endpoints
  async getPermissionsRegistry() {
    return this.request('/permissions/registry');
  }

  async getAdminUsers() {
    return this.request('/permissions/admin-users');
  }

  async getUserPermissions(userId) {
    return this.request(`/permissions/users/${userId}`);
  }

  async setUserPermissions(userId, permissions) {
    return this.request(`/permissions/users/${userId}`, {
      method: 'PUT',
      body: JSON.stringify({ permissions }),
    });
  }

  // Internal Staff endpoints
  async listInternalStaff() {
    return this.request('/internal-staff');
  }

  async createInternalStaff(data) {
    return this.request('/internal-staff', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateInternalStaff(id, data) {
    return this.request(`/internal-staff/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteInternalStaff(id) {
    return this.request(`/internal-staff/${id}`, {
      method: 'DELETE',
    });
  }
}

// Create and export a singleton instance
const apiClient = new ApiClient();
export default apiClient;
export { ApiClient };