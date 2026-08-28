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

        const error = new Error(data.message || 'API request failed');

        error.code = data.code;

        error.status = response.status;

        throw error;

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

        password: credentials.password,

        ...(credentials.device_id && { device_id: credentials.device_id })

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



  async resendOtp(mobileNumber) {

    return this.request('/auth/resend-otp', {

      method: 'POST',

      body: JSON.stringify({ mobile_number: mobileNumber }),

    });

  }



  async verifyOtp(mobileNumber, otp) {

    return this.request('/auth/verify-otp', {

      method: 'POST',

      body: JSON.stringify({ mobile_number: mobileNumber, otp_code: otp }),

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

  async getMyAccountInfo() {
    return this.request('/auth/me');
  }

  async createClientProfileForExistingUser(payload) {
    return this.request('/auth/create-client-profile', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
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



  async getAllClients(filters = {}) {
    const queryParams = new URLSearchParams(filters).toString();
    const url = queryParams ? `/client?${queryParams}` : '/client';
    return this.request(url);
  }

  async deleteClientProfile(clientId) {
    return this.request(`/client/${clientId}`, {
      method: 'DELETE',
    });
  }

  async createClientProfile(data) {
    return this.request('/client/proxy-create', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }



  async getClientProfile(clientId) {

    return this.request(`/client/${clientId}`);

  }

  async getAdminClientDetail(clientId) {
    return this.request(`/client/${clientId}/detail`);
  }

  async updateClientBilling(clientId, { company_name, honorific, display_name_source }) {
    return this.request(`/client/${clientId}/billing`, {
      method: 'PATCH',
      body: JSON.stringify({ company_name, honorific, display_name_source }),
    });
  }

  async updateClientProfile(clientId, { full_name, mobile_number, email, primary_address, gender, secondary_phone_numbers }) {
    return this.request(`/client/${clientId}/profile`, {
      method: 'PATCH',
      body: JSON.stringify({ full_name, mobile_number, email, primary_address, gender, secondary_phone_numbers }),
    });
  }

  async adminUploadRegFeeReceipt(clientId, file) {
    const formData = new FormData();
    formData.append('receipt', file);
    return this.request(`/client/${clientId}/admin-upload-reg-fee-receipt`, {
      method: 'POST',
      body: formData,
    });
  }

  async sendRegFeeInvoice(clientId, { amount, bank_account_id, salesperson_id }) {
    return this.request(`/client/${clientId}/send-reg-fee-invoice`, {
      method: 'POST',
      body: JSON.stringify({ amount, bank_account_id, salesperson_id }),
    });
  }

  async updateRegFeeStatus(clientId, status, salespersonId = null) {
    return this.request(`/client/${clientId}/reg-fee-status`, {
      method: 'PATCH',
      body: JSON.stringify({ status, salesperson_id: salespersonId }),
    });
  }
  async verifyRegFeePayment(clientId, salespersonId = null) {
    return this.request(`/client/${clientId}/verify-reg-fee-payment`, {
      method: 'POST',
      body: JSON.stringify({ salesperson_id: salespersonId }),
    });
  }

  async backdateRegFeePayment(clientId, { amount, payment_date, salesperson_id }) {
    return this.request(`/client/${clientId}/backdate-reg-fee-payment`, {
      method: 'POST',
      body: JSON.stringify({ amount, payment_date, salesperson_id }),
    });
  }

  async getReceiptUploadPortal(token) {
    return this.request(`/client-receipt-upload/${token}`);
  }

  async uploadPaymentReceipt(token, formData) {
    return this.request(`/client-receipt-upload/${token}`, {
      method: 'POST',
      body: formData,
    });
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

  async getSentCandidates(requestId) {
    return this.request(`/service-requests/${requestId}/sent-candidates`);
  }

  async sendCandidateProfile(requestId, staffProfileId) {
    return this.request(`/service-requests/${requestId}/send-candidate`, {
      method: 'POST',
      body: JSON.stringify({ staff_profile_id: staffProfileId }),
    });
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

  async getCombinedInvoices(filters = {}) {
    const qs = new URLSearchParams(filters).toString();
    return this.request(qs ? `/quotes/invoices/list?${qs}` : '/quotes/invoices/list');
  }

  async sendCombinedInvoice(quoteId) {
    return this.request(`/quotes/${quoteId}/send-invoice`, { method: 'POST' });
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

  // ── Salesperson crediting ──
  async getSalespersons() {
    return this.request('/salespersons');
  }

  async getBookingSalesperson(bookingId) {
    return this.request(`/salespersons/booking/${bookingId}`);
  }

  async getSalespersonBookings(salespersonId) {
    return this.request(`/salespersons/${salespersonId}/bookings`);
  }

  async creditBookingSalesperson(bookingId, salespersonId) {
    return this.request(`/salespersons/booking/${bookingId}/credit`, {
      method: 'POST',
      body: JSON.stringify({ salesperson_id: salespersonId }),
    });
  }

  async switchBookingSalesperson(bookingId, salespersonId, switchReason = null) {
    return this.request(`/salespersons/booking/${bookingId}/switch`, {
      method: 'PUT',
      body: JSON.stringify({ salesperson_id: salespersonId, switch_reason: switchReason }),
    });
  }

  // ── Salesperson crediting — client registrations (separate metric from bookings) ──
  async getClientSalesperson(clientId) {
    return this.request(`/salespersons/client/${clientId}`);
  }

  async getSalespersonClients(salespersonId) {
    return this.request(`/salespersons/${salespersonId}/clients`);
  }

  async creditClientSalesperson(clientId, salespersonId) {
    return this.request(`/salespersons/client/${clientId}/credit`, {
      method: 'POST',
      body: JSON.stringify({ salesperson_id: salespersonId }),
    });
  }

  async switchClientSalesperson(clientId, salespersonId, switchReason = null) {
    return this.request(`/salespersons/client/${clientId}/switch`, {
      method: 'PUT',
      body: JSON.stringify({ salesperson_id: salespersonId, switch_reason: switchReason }),
    });
  }

  // ── Recruiter crediting (staff hires — mirrors salesperson crediting above) ──
  async getRecruiters() {
    return this.request('/recruiters');
  }

  async getStaffRecruiter(staffProfileId) {
    return this.request(`/recruiters/staff/${staffProfileId}`);
  }

  async creditStaffRecruiter(staffProfileId, recruiterId) {
    return this.request(`/recruiters/staff/${staffProfileId}/credit`, {
      method: 'POST',
      body: JSON.stringify({ recruiter_id: recruiterId }),
    });
  }

  async switchStaffRecruiter(staffProfileId, recruiterId, switchReason = null) {
    return this.request(`/recruiters/staff/${staffProfileId}/switch`, {
      method: 'PUT',
      body: JSON.stringify({ recruiter_id: recruiterId, switch_reason: switchReason }),
    });
  }

  // ── Bulk data migration (spreadsheet import) ──
  async downloadImportTemplate() {
    const url = `${this.baseURL}/bulk-import/template`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        ...(this.token && { Authorization: `Bearer ${this.token}` }),
      },
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || 'Template download failed');
    }
    return await response.blob();
  }

  // Preview/commit start a background job on the server and return a job id
  // immediately; we poll for real per-row progress until it finishes.
  async pollImportJob(jobId, onProgress) {
    for (;;) {
      const res = await this.request(`/bulk-import/jobs/${jobId}`);
      const job = res.data;
      if (onProgress) onProgress(job.processed, job.total);
      if (job.status === 'done') return { data: job.result };
      if (job.status === 'error') throw new Error(job.message || 'Import job failed');
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  async previewBulkImport(file, onProgress) {
    const formData = new FormData();
    formData.append('file', file);
    const started = await this.request('/bulk-import/preview', { method: 'POST', body: formData });
    return this.pollImportJob(started.data.job_id, onProgress);
  }

  async commitBulkImport(file, onProgress) {
    const formData = new FormData();
    formData.append('file', file);
    const started = await this.request('/bulk-import/commit', { method: 'POST', body: formData });
    return this.pollImportJob(started.data.job_id, onProgress);
  }

  async getImportBatches() {
    return this.request('/bulk-import/batches');
  }

  async getImportBatch(batchId) {
    return this.request(`/bulk-import/batches/${batchId}`);
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

  // amount_received: number, allocations: { reg_fee, service, products },
  // overflow (optional): { type: 'WALLET' } | { type: 'BOOKING_PAYOFF', booking_id }.
  // Backend expects allocations/overflow as JSON strings when sent via
  // multipart (paymentSlipFile present), and accepts them as plain objects otherwise.
  async recordAllocatedQuotePayment(quoteId, paymentData, paymentSlipFile = null) {
    if (paymentSlipFile) {
      const formData = new FormData();
      Object.entries(paymentData).forEach(([key, value]) => {
        if (value === null || value === undefined || value === '') return;
        formData.append(key, ['allocations', 'overflow'].includes(key) ? JSON.stringify(value) : value);
      });
      formData.append('payment_slip', paymentSlipFile);

      return this.request(`/quotes/${quoteId}/record-payment-allocated`, {
        method: 'POST',
        headers: {
          ...(this.token && { Authorization: `Bearer ${this.token}` }),
        },
        body: formData,
      });
    }

    return this.request(`/quotes/${quoteId}/record-payment-allocated`, {
      method: 'POST',
      body: JSON.stringify(paymentData),
    });
  }

  // Generates a standalone invoice for each given quote line item — shown as
  // an admin-triggered picker after recording a payment, independent of the
  // combined invoice (see quoteController.ensureCombinedInvoice).
  async createLineItemInvoices(quoteId, lineItemIds) {
    return this.request(`/quotes/${quoteId}/line-item-invoices`, {
      method: 'POST',
      body: JSON.stringify({ line_item_ids: lineItemIds }),
    });
  }

  // Generates (or returns the already-cached) combined Invoice PDF for this quote
  // without sending it anywhere — separate from resendCombinedInvoice/WhatsApp send.
  async generateCombinedInvoice(quoteId) {
    return this.request(`/quotes/${quoteId}/generate-combined-invoice`, {
      method: 'POST',
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

  async updateQuoteStatus(quoteId, status) {
    return this.request(`/quotes/${quoteId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  }

  async createQuotation(quoteData) {
    return this.request('/quotes/create', {

      method: 'POST',

      body: JSON.stringify(quoteData),

    });

  }

  async sendQuotePDF(quoteId, productQuoteId = null) {

    return this.request(`/quotes/send-pdf/${quoteId}`, {

      method: 'POST',
      body: JSON.stringify(productQuoteId ? { product_quote_id: productQuoteId } : {}),

    });

  }



  // Staff endpoints

  async checkMobileAvailability(mobile) {
    return this.request(`/staff/check-mobile/${encodeURIComponent(mobile)}`);
  }

  async checkStaffCode(code) {
    return this.request(`/staff/check-staff-code/${encodeURIComponent(code)}`);
  }

  async checkStaffMobile(mobile) {
    return this.request(`/staff/check-staff-mobile/${encodeURIComponent(mobile)}`);
  }

  async adminUploadComplianceDocs(applicationId, field, file) {
    const formData = new FormData();
    formData.append(field, file);
    return this.request(`/staff/applications/${applicationId}/admin-upload-docs`, {
      method: 'POST',
      body: formData,
    });
  }

  async submitApplication(applicationData, documentFiles, profilePictureFile, nicFrontFile, nicBackFile) {

    const formData = new FormData();

    

    // Append all application data fields

    Object.keys(applicationData).forEach(key => {

      if ((key === 'applied_roles' || key === 'languages') && Array.isArray(applicationData[key])) {

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

  async updateApplicationDetails(applicationId, data, profilePictureFile = null) {
    const formData = new FormData();
    Object.keys(data).forEach(key => {
      if ((key === 'applied_roles' || key === 'languages') && Array.isArray(data[key])) {
        formData.append(key, JSON.stringify(data[key]));
      } else {
        formData.append(key, data[key] ?? '');
      }
    });
    if (profilePictureFile) {
      formData.append('profile_picture', profilePictureFile);
    }

    return this.request(`/staff/applications/${applicationId}`, {
      method: 'PUT',
      headers: {
        // Let the browser set Content-Type with the multipart boundary
        ...(this.token && { Authorization: `Bearer ${this.token}` }),
      },
      body: formData,
    });
  }

  async getNextStaffCode(start) {
    return this.request(`/staff/next-staff-code${start ? `?start=${start}` : ''}`);
  }

  async sendDocumentRequest(applicationId) {
    return this.request(`/staff/applications/${applicationId}/send-document-request`, {
      method: 'POST',
    });
  }

  async getDocUploadPortal(token) {
    return this.request(`/staff/doc-upload/${token}`);
  }

  async uploadComplianceDocs(token, formData) {
    return this.request(`/staff/doc-upload/${token}`, {
      method: 'POST',
      body: formData,
    });
  }

  async sendApplicationAgreement(applicationId) {
    return this.request(`/staff/applications/${applicationId}/send-agreement`, {
      method: 'POST',
    });
  }

  async sendStaffAgreement(staffProfileId) {
    return this.request(`/staff/${staffProfileId}/send-agreement`, {
      method: 'POST',
    });
  }

  async sendStaffDocumentRequest(staffProfileId) {
    return this.request(`/staff/${staffProfileId}/send-document-request`, {
      method: 'POST',
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

  async updateStaffExperienceLevel(staffProfileId, experienceLevel) {
    return this.request(`/staff/${staffProfileId}/experience-level`, {
      method: 'PATCH',
      body: JSON.stringify({ experience_level: experienceLevel })
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

  async getStaffFutureBookings(staffProfileId) {
    return this.request(`/staff/${staffProfileId}/future-bookings`);
  }

  async getStaffSchedules(staffProfileIds) {
    const ids = [...new Set((staffProfileIds || []).filter(Boolean))];
    if (ids.length === 0) return { status: 'success', data: {} };
    return this.request('/staff/schedules', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    });
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

  async getStaffAdminNotes(staffProfileId) {
    return this.request(`/staff/${staffProfileId}/admin-notes`);
  }

  async createStaffAdminNote(staffProfileId, note) {
    return this.request(`/staff/${staffProfileId}/admin-notes`, {
      method: 'POST',
      body: JSON.stringify({ note }),
    });
  }

  async updateStaffAdminNote(staffProfileId, noteId, note) {
    return this.request(`/staff/${staffProfileId}/admin-notes/${noteId}`, {
      method: 'PUT',
      body: JSON.stringify({ note }),
    });
  }

  async deleteStaffAdminNote(staffProfileId, noteId) {
    return this.request(`/staff/${staffProfileId}/admin-notes/${noteId}`, {
      method: 'DELETE',
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

  async adminDirectBooking(data) {
    return this.request('/bookings/admin-direct', {
      method: 'POST',
      body: JSON.stringify(data),
    });
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

  async pauseBooking(bookingId, pauseData) {
    return this.request(`/bookings/${bookingId}/pause`, {
      method: 'POST',
      body: JSON.stringify(pauseData || {}),
    });
  }

  async resumeBooking(bookingId) {
    return this.request(`/bookings/${bookingId}/resume`, { method: 'POST' });
  }

  async getBookingPauses(bookingId) {
    return this.request(`/bookings/${bookingId}/pauses`);
  }

  async swapBookingStaff(bookingId, swapData) {
    return this.request(`/bookings/${bookingId}/swap-staff`, {
      method: 'POST',
      body: JSON.stringify(swapData),
    });
  }

  // Share a staff member's profile with the booking's client on WhatsApp — used by the
  // swap/assign modal to introduce a replacement carer to the client.
  async sendBookingStaffProfile(bookingId, staffProfileId) {
    return this.request(`/bookings/${bookingId}/send-staff-profile`, {
      method: 'POST',
      body: JSON.stringify({ staff_profile_id: staffProfileId }),
    });
  }

  // ── Shift patterns & per-shift staff assignment (SHIFT_BASED only) ────

  async getShiftPattern(bookingId) {
    return this.request(`/bookings/${bookingId}/shift-pattern`);
  }

  async getShiftPatternHistory(bookingId) {
    return this.request(`/bookings/${bookingId}/shift-pattern/history`);
  }

  async createShiftPattern(bookingId, payload) {
    return this.request(`/bookings/${bookingId}/shift-pattern`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async getShiftSlots(bookingId) {
    return this.request(`/bookings/${bookingId}/shift-slots`);
  }

  async assignStaffToShiftSlot(bookingId, shiftSlotId, payload) {
    return this.request(`/bookings/${bookingId}/shift-slots/${shiftSlotId}/assign-staff`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async reassignShiftSlotStaff(bookingId, shiftSlotId, payload) {
    return this.request(`/bookings/${bookingId}/shift-slots/${shiftSlotId}/reassign-staff`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  // ── Daily attendance & manual daily invoicing ──────────────────────────

  async getBookingAttendance(bookingId) {
    return this.request(`/bookings/${bookingId}/attendance`);
  }

  async getAttendanceHistory(bookingId) {
    return this.request(`/bookings/${bookingId}/attendance/history`);
  }

  async upsertBookingAttendance(bookingId, attendanceData) {
    return this.request(`/bookings/${bookingId}/attendance`, {
      method: 'POST',
      body: JSON.stringify(attendanceData),
    });
  }

  // Sets/edits just in_time and/or out_time on one assignment's day — used for
  // staff-swap out/in time capture and for editing a past swap's recorded times.
  async setAttendanceTime(bookingId, payload) {
    return this.request(`/bookings/${bookingId}/attendance/time`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  }

  async markAttendanceAbsent(bookingId, attendanceData) {
    return this.request(`/bookings/${bookingId}/attendance/absent`, {
      method: 'POST',
      body: JSON.stringify(attendanceData),
    });
  }

  async confirmAttendanceSalary(attendanceId, approve, amount) {
    return this.request(`/bookings/attendance/${attendanceId}/confirm-salary`, {
      method: 'POST',
      body: JSON.stringify({ approve, ...(amount !== undefined ? { amount } : {}) }),
    });
  }

  async getBookingDailyInvoices(bookingId) {
    return this.request(`/bookings/${bookingId}/daily-invoices`);
  }

  async revokeAttendanceDays(bookingId, { targets, reason, password, settlement_action }) {
    return this.request(`/bookings/${bookingId}/attendance/revoke`, {
      method: 'POST',
      body: JSON.stringify({ targets, reason, password, settlement_action }),
    });
  }

  // ── Day drafts (Draft -> Preview -> Confirm staging for the Day Detail modal) ──

  async getBookingDayDrafts(bookingId) {
    return this.request(`/bookings/${bookingId}/day-drafts`);
  }

  async getDayDraft(bookingId, serviceDate) {
    const qs = new URLSearchParams({ service_date: serviceDate }).toString();
    return this.request(`/bookings/${bookingId}/day-draft?${qs}`);
  }

  async upsertDayDraft(bookingId, { service_date, payload }) {
    return this.request(`/bookings/${bookingId}/day-draft`, {
      method: 'PUT',
      body: JSON.stringify({ service_date, payload }),
    });
  }

  async discardDayDraft(bookingId, service_date) {
    return this.request(`/bookings/${bookingId}/day-draft`, {
      method: 'DELETE',
      body: JSON.stringify({ service_date }),
    });
  }

  async confirmDayDraft(bookingId, service_date) {
    return this.request(`/bookings/${bookingId}/day-draft/confirm`, {
      method: 'POST',
      body: JSON.stringify({ service_date }),
    });
  }

  async getClientInvoices(clientId, filters = {}) {
    const qs = new URLSearchParams(filters).toString();
    return this.request(qs ? `/client/${clientId}/invoices?${qs}` : `/client/${clientId}/invoices`);
  }

  async getAdminInvoices(filters = {}) {
    const qs = new URLSearchParams(filters).toString();
    return this.request(qs ? `/client/all-invoices?${qs}` : '/client/all-invoices');
  }

  async downloadDailyInvoicePdf(dailyInvoiceId) {
    const url = `${this.baseURL}/client/invoice-pdf/${dailyInvoiceId}`;
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          ...(this.token && { Authorization: `Bearer ${this.token}` }),
        },
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Invoice PDF download failed');
      }
      return await response.blob();
    } catch (error) {
      console.error('Invoice PDF Download Error:', error);
      throw error;
    }
  }

  async getClientRegFeeInvoices(clientId) {
    return this.request(`/client/${clientId}/reg-fee-invoices`);
  }

  async resendRegFeeInvoice(invoiceId) {
    return this.request(`/client/reg-fee-invoices/${invoiceId}/resend`, { method: 'POST' });
  }

  async resendDailyInvoice(dailyInvoiceId) {
    return this.request(`/client/invoice/${dailyInvoiceId}/resend`, { method: 'POST' });
  }

  async getAllRegFeeInvoices(filters = {}) {
    const qs = new URLSearchParams(filters).toString();
    return this.request(qs ? `/client/all-reg-fee-invoices?${qs}` : '/client/all-reg-fee-invoices');
  }

  async getClientOverdueInvoices(clientId) {
    return this.request(`/client/${clientId}/overdue-invoices`);
  }

  async getAllOverdueInvoices(filters = {}) {
    const qs = new URLSearchParams(filters).toString();
    return this.request(qs ? `/client/all-overdue-invoices?${qs}` : '/client/all-overdue-invoices');
  }

  // ── Payment receipts ──────────────────────────────────────────────
  async getAllReceipts(filters = {}) {
    const queryParams = new URLSearchParams(filters).toString();
    return this.request(queryParams ? `/payment-receipts?${queryParams}` : '/payment-receipts');
  }

  async getBookingReceipts(bookingId) {
    return this.request(`/payment-receipts/booking/${bookingId}`);
  }

  async getClientReceipts(clientId) {
    return this.request(`/payment-receipts/client/${clientId}`);
  }

  async sendPaymentReceipt(receiptId) {
    return this.request(`/payment-receipts/${receiptId}/send`, { method: 'POST' });
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

  async updateBookingHospitalization(bookingId, { is_hospitalized, hospital_name }) {
    return this.request(`/bookings/${bookingId}/hospitalization`, {
      method: 'PATCH',
      body: JSON.stringify({ is_hospitalized, hospital_name }),
    });
  }

  // Updates the CLIENT-facing billing rate(s) on a booking (daily_rate/shift_rate/ot_rate).
  async updateBookingRates(bookingId, payload) {
    return this.request(`/bookings/${bookingId}/rates`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  }

  // Updates a specific staff assignment's pay rate (and/or dates/notes).
  async updateStaffAssignment(assignmentId, payload) {
    return this.request(`/assignments/assignment/${assignmentId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  }

  // ── Per-shift billing (SHIFT_BASED bookings) ──────────────────────
  async getBookingShiftSchedule(bookingId, from, to) {
    const qs = new URLSearchParams({ from, to }).toString();
    return this.request(`/bookings/${bookingId}/shift-schedule?${qs}`);
  }

  async getBookingShiftReschedules(bookingId) {
    return this.request(`/bookings/${bookingId}/shift-reschedules`);
  }

  async waiveShiftOccurrence(bookingId, payload) {
    return this.request(`/bookings/${bookingId}/shift-occurrences/waive`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async rescheduleShiftOccurrence(bookingId, payload) {
    return this.request(`/bookings/${bookingId}/shift-occurrences/reschedule`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async cancelShiftReschedule(bookingId, rescheduleId) {
    return this.request(`/bookings/${bookingId}/shift-occurrences/${rescheduleId}/cancel`, {
      method: 'POST',
    });
  }

  async markBookingOverdue(bookingId, payload) {
    return this.request(`/bookings/${bookingId}/mark-overdue`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async resolveBookingOverdue(bookingId, payload = {}) {
    return this.request(`/bookings/${bookingId}/resolve-overdue`, {
      method: 'POST',
      body: JSON.stringify(payload),
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

  async rejectTerminationRequest(terminationId, reason) {
    return this.request(`/bookings/terminations/reject/${terminationId}`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  }

  // ── Scheduled actions / Upcoming Events ────────────────────────────────

  async getUpcomingEvents() {
    return this.request('/scheduled-actions/upcoming');
  }

  async getBookingScheduledEvents(bookingId) {
    return this.request(`/scheduled-actions/booking/${bookingId}`);
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

  // Staff Leave endpoints
  async getMyLeaves() {
    return this.request('/staff-leave/my-leaves');
  }

  async requestLeave(leaveData) {
    return this.request('/staff-leave/request', {
      method: 'POST',
      body: JSON.stringify(leaveData),
    });
  }

  async getAllLeaves(status) {
    const url = status ? `/staff-leave/all?status=${encodeURIComponent(status)}` : '/staff-leave/all';
    return this.request(url);
  }

  async getPendingLeaves() {
    return this.request('/staff-leave/pending');
  }

  async getLeaveConflicts(leaveId) {
    return this.request(`/staff-leave/${leaveId}/conflicts`);
  }

  async getLeaveReplacementCandidates(leaveId) {
    return this.request(`/staff-leave/${leaveId}/candidates`);
  }

  async approveLeave(leaveId) {
    return this.request(`/staff-leave/approve/${leaveId}`, {
      method: 'POST',
    });
  }

  async rejectLeave(leaveId, reason) {
    return this.request(`/staff-leave/reject/${leaveId}`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  }

  async getStaffLeaveSummary(staffProfileId) {
    return this.request(`/staff-leave/summary/${staffProfileId}`);
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

  async getReviewableBookingsForClient(clientId) {
    return this.request(`/staff-reviews/admin/reviewable/${clientId}`);
  }

  async getClientBookingsForAdmin(clientId) {
    return this.request(`/staff-reviews/admin/bookings/${clientId}`);
  }

  async getBookingStaffForReview(bookingId) {
    return this.request(`/staff-reviews/admin/booking/${bookingId}/staff`);
  }

  async adminCreateReview(reviewData) {
    return this.request('/staff-reviews/admin/create', {
      method: 'POST',
      body: JSON.stringify(reviewData),
    });
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

  // Dashboard endpoints
  async getDashboardOverview(tab) {
    const queryParams = tab ? `?tab=${encodeURIComponent(tab)}` : '';
    return this.request(`/dashboard/overview${queryParams}`);
  }

  // Finances endpoints
  async getFinancesOverview() {
    return this.request('/finances/overview');
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

  async getReceivablesAging() {
    return this.request('/finances/receivables-aging');
  }

  async getPayablesAging() {
    return this.request('/finances/payables-aging');
  }

  async getProfitLoss({ mode = 'month', date } = {}) {
    const qs = new URLSearchParams({ mode, ...(date && { date }) }).toString();
    return this.request(`/finances/profit-loss?${qs}`);
  }

  async downloadProfitLossPdf({ mode = 'month', date } = {}) {
    const qs = new URLSearchParams({ mode, ...(date && { date }) }).toString();
    const url = `${this.baseURL}/finances/profit-loss/pdf?${qs}`;
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          ...(this.token && { Authorization: `Bearer ${this.token}` }),
        },
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Profit & Loss PDF download failed');
      }
      return await response.blob();
    } catch (error) {
      console.error('Profit & Loss PDF Download Error:', error);
      throw error;
    }
  }

  async getBalanceSheet({ date } = {}) {
    const qs = new URLSearchParams({ ...(date && { date }) }).toString();
    return this.request(`/finances/balance-sheet${qs ? `?${qs}` : ''}`);
  }

  async downloadBalanceSheetPdf({ date } = {}) {
    const qs = new URLSearchParams({ ...(date && { date }) }).toString();
    const url = `${this.baseURL}/finances/balance-sheet/pdf${qs ? `?${qs}` : ''}`;
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          ...(this.token && { Authorization: `Bearer ${this.token}` }),
        },
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Balance Sheet PDF download failed');
      }
      return await response.blob();
    } catch (error) {
      console.error('Balance Sheet PDF Download Error:', error);
      throw error;
    }
  }

  async getSalesByCustomer({ from, to } = {}) {
    const qs = new URLSearchParams({ ...(from && { from }), ...(to && { to }) }).toString();
    return this.request(`/finances/sales-by-customer${qs ? `?${qs}` : ''}`);
  }

  async downloadSalesByCustomerPdf({ from, to } = {}) {
    const qs = new URLSearchParams({ ...(from && { from }), ...(to && { to }) }).toString();
    const url = `${this.baseURL}/finances/sales-by-customer/pdf${qs ? `?${qs}` : ''}`;
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          ...(this.token && { Authorization: `Bearer ${this.token}` }),
        },
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Sales by Customer PDF download failed');
      }
      return await response.blob();
    } catch (error) {
      console.error('Sales by Customer PDF Download Error:', error);
      throw error;
    }
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

  async recordPettyCashTransaction(data) {
    return this.request('/bank-accounts/petty-cash/transactions', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async transferBankFunds(data) {
    return this.request('/bank-accounts/transfer', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async verifyBankAccountTransaction(accountId, transactionId, verified) {
    return this.request(`/bank-accounts/${accountId}/transactions/${transactionId}/verify`, {
      method: 'PATCH',
      body: JSON.stringify({ verified }),
    });
  }

  async getVendors(filters = {}) {
    const query = new URLSearchParams(filters).toString();
    return this.request(query ? `/vendors?${query}` : '/vendors');
  }

  async getVendor(vendorId) {
    return this.request(`/vendors/${vendorId}`);
  }

  async createVendor(data) {
    return this.request('/vendors', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateVendor(vendorId, data) {
    return this.request(`/vendors/${vendorId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deactivateVendor(vendorId) {
    return this.request(`/vendors/${vendorId}`, {
      method: 'DELETE',
    });
  }

  async getVendorBills(vendorId) {
    return this.request(`/vendors/${vendorId}/bills`);
  }

  async createVendorBill(vendorId, data) {
    return this.request(`/vendors/${vendorId}/bills`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async payVendorBill(billId, data) {
    return this.request(`/vendors/bills/${billId}/payments`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
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

  async getCashFlowSummary({ period = 'this_fiscal_year' } = {}) {
    const qs = new URLSearchParams({ period }).toString();
    return this.request(`/finances/cash-flow?${qs}`);
  }

  async getIncomeExpenseChart({ period = 'this_fiscal_year' } = {}) {
    const qs = new URLSearchParams({ period }).toString();
    return this.request(`/finances/income-expense-chart?${qs}`);
  }

  async getTopExpenses({ period = 'this_fiscal_year' } = {}) {
    const qs = new URLSearchParams({ period }).toString();
    return this.request(`/finances/top-expenses?${qs}`);
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

  async getClientOverdueBookings(clientId) {
    return this.request(`/bookings/client/${clientId}/overdue-bookings`);
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

  async generateQuotePdf(quoteId, productQuoteId = null) {
    return this.request(`/quotes/${quoteId}/generate-pdf`, {
      method: 'POST',
      body: JSON.stringify(productQuoteId ? { product_quote_id: productQuoteId } : {}),
    });
  }

  async updateQuoteLineItems(quoteId, lineItemsData) {
    return this.request(`/quotes/${quoteId}/line-items`, {
      method: 'PUT',
      body: JSON.stringify(lineItemsData),
    });
  }

  // Product quotes (quote_type = 'PRODUCT' — no service_request involved)
  async createProductQuotation(quoteData) {
    return this.request('/quotes/create-modular', {
      method: 'POST',
      body: JSON.stringify({ ...quoteData, quote_type: 'PRODUCT' }),
    });
  }

  async getProductQuote(quoteId) {
    return this.request(`/quotes/product/${quoteId}`);
  }

  async getProductQuotes(filters = {}) {
    const qs = new URLSearchParams(filters).toString();
    return this.request(qs ? `/quotes/product/list?${qs}` : '/quotes/product/list');
  }

  async generateProductQuotePdf(quoteId) {
    return this.request(`/quotes/product/${quoteId}/generate-pdf`, { method: 'POST' });
  }

  async sendProductQuotePDF(quoteId) {
    return this.request(`/quotes/product/${quoteId}/send`, { method: 'POST' });
  }

  // The single "accept" action for any PRODUCT quote — creates a rental
  // agreement for each rental line item (using its own quoted terms) and a
  // combined invoice for any remaining non-rental items, in one call.
  async acceptProductQuote(quoteId, data) {
    return this.request(`/quotes/product/${quoteId}/accept`, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  // Client portal: express interest in a catalog product
  async submitProductInterest(productId, quantity = 1) {
    return this.request('/quotes/product/request', {
      method: 'POST',
      body: JSON.stringify({ product_id: productId, quantity }),
    });
  }

  // ==================== PRODUCTS / CATALOG ====================

  async getProducts(filters = {}) {
    const qs = new URLSearchParams(filters).toString();
    return this.request(qs ? `/products?${qs}` : '/products');
  }

  async getProduct(productId) {
    return this.request(`/products/${productId}`);
  }

  async getProductCategories() {
    return this.request('/products/categories');
  }

  async getProductPurchaseHistory(productId) {
    return this.request(`/products/${productId}/purchase-history`);
  }

  // Client portal: the logged-in client's own purchased/rented products + deposits
  async getMyProductOrders() {
    return this.request('/products/mine');
  }

  async createProductCategory(categoryData) {
    return this.request('/products/categories', {
      method: 'POST',
      body: JSON.stringify(categoryData),
    });
  }

  async createProduct(productData, imageFile = null) {
    const formData = new FormData();
    Object.entries(productData).forEach(([key, value]) => {
      if (value !== null && value !== undefined && value !== '') {
        formData.append(key, value);
      }
    });
    if (imageFile) formData.append('image', imageFile);

    return this.request('/products', {
      method: 'POST',
      headers: { ...(this.token && { Authorization: `Bearer ${this.token}` }) },
      body: formData,
    });
  }

  async updateProduct(productId, productData, imageFile = null) {
    const formData = new FormData();
    Object.entries(productData).forEach(([key, value]) => {
      if (value !== null && value !== undefined && value !== '') {
        formData.append(key, value);
      }
    });
    if (imageFile) formData.append('image', imageFile);

    return this.request(`/products/${productId}`, {
      method: 'PUT',
      headers: { ...(this.token && { Authorization: `Bearer ${this.token}` }) },
      body: formData,
    });
  }

  async deactivateProduct(productId) {
    return this.request(`/products/${productId}/deactivate`, { method: 'PATCH' });
  }

  // ==================== WALK-IN CUSTOMERS ====================

  async searchWalkInCustomers(query = '') {
    const qs = query ? `?q=${encodeURIComponent(query)}` : '';
    return this.request(`/walk-in-customers${qs}`);
  }

  async createWalkInCustomer(customerData) {
    return this.request('/walk-in-customers', {
      method: 'POST',
      body: JSON.stringify(customerData),
    });
  }

  // ==================== PRODUCT INVOICES ====================

  async getProductInvoices(filters = {}) {
    const qs = new URLSearchParams(filters).toString();
    return this.request(qs ? `/product-invoices?${qs}` : '/product-invoices');
  }

  // Per-line-item invoices (category: 'LINE_ITEM') share the same generic
  // `invoices` table/listing endpoint as product invoices.
  async getLineItemInvoices(quoteId) {
    return this.getProductInvoices({ quote_id: quoteId, category: 'LINE_ITEM' });
  }

  async getProductInvoice(invoiceId) {
    return this.request(`/product-invoices/${invoiceId}`);
  }

  async getProductInvoicePdf(invoiceId) {
    return this.request(`/product-invoices/${invoiceId}/pdf`);
  }

  async resendProductInvoice(invoiceId) {
    return this.request(`/product-invoices/${invoiceId}/resend`, { method: 'POST' });
  }

  async createInvoiceFromQuote(quoteId, dueDate = null) {
    return this.request(`/product-invoices/from-quote/${quoteId}`, {
      method: 'POST',
      body: JSON.stringify(dueDate ? { due_date: dueDate } : {}),
    });
  }

  async recordProductInvoicePayment(invoiceId, paymentData, paymentSlipFile = null) {
    if (paymentSlipFile) {
      const formData = new FormData();
      Object.entries(paymentData).forEach(([key, value]) => {
        if (value !== null && value !== undefined && value !== '') {
          formData.append(key, value);
        }
      });
      formData.append('payment_slip', paymentSlipFile);

      return this.request(`/product-invoices/${invoiceId}/record-payment`, {
        method: 'POST',
        headers: { ...(this.token && { Authorization: `Bearer ${this.token}` }) },
        body: formData,
      });
    }

    return this.request(`/product-invoices/${invoiceId}/record-payment`, {
      method: 'POST',
      body: JSON.stringify(paymentData),
    });
  }

  // ==================== RENTALS (units, agreements, deposits) ====================

  async getRentalUnits(filters = {}) {
    const qs = new URLSearchParams(filters).toString();
    return this.request(qs ? `/rentals/units?${qs}` : '/rentals/units');
  }

  async createRentalUnit(unitData) {
    return this.request('/rentals/units', {
      method: 'POST',
      body: JSON.stringify(unitData),
    });
  }

  async updateRentalUnitStatus(unitId, status, notes) {
    return this.request(`/rentals/units/${unitId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status, notes }),
    });
  }

  async getRentalAgreements(filters = {}) {
    const qs = new URLSearchParams(filters).toString();
    return this.request(qs ? `/rentals/agreements?${qs}` : '/rentals/agreements');
  }

  async getRentalAgreement(rentalAgreementId) {
    return this.request(`/rentals/agreements/${rentalAgreementId}`);
  }

  async createRentalAgreement(agreementData) {
    return this.request('/rentals/agreements', {
      method: 'POST',
      body: JSON.stringify(agreementData),
    });
  }

  async returnRentalUnit(rentalAgreementId) {
    return this.request(`/rentals/agreements/${rentalAgreementId}/return`, { method: 'POST' });
  }

  async getDeposits(filters = {}) {
    const qs = new URLSearchParams(filters).toString();
    return this.request(qs ? `/rentals/deposits?${qs}` : '/rentals/deposits');
  }

  async refundDeposit(depositId, paymentData) {
    return this.request(`/rentals/deposits/${depositId}/refund`, {
      method: 'POST',
      body: JSON.stringify(paymentData),
    });
  }

  async forfeitDeposit(depositId, payload) {
    const body = typeof payload === 'string' || payload === undefined ? { notes: payload } : payload;
    return this.request(`/rentals/deposits/${depositId}/forfeit`, {
      method: 'POST',
      body: JSON.stringify(body),
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

  async exportTransactionsPdf(params = {}) {
    const query = new URLSearchParams(params).toString();
    const url = `${this.baseURL}/transactions/export/pdf${query ? `?${query}` : ''}`;
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          ...(this.token && { Authorization: `Bearer ${this.token}` }),
        },
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Transactions PDF download failed');
      }
      return await response.blob();
    } catch (error) {
      console.error('Transactions PDF Download Error:', error);
      throw error;
    }
  }

  async createManualTransaction(transactionData) {
    return this.request('/transactions/manual', {
      method: 'POST',
      body: JSON.stringify(transactionData),
    });
  }

  async getManualCategories() {
    return this.request('/transactions/manual-categories');
  }

  async createManualCategory(categoryData) {
    return this.request('/transactions/manual-categories', {
      method: 'POST',
      body: JSON.stringify(categoryData),
    });
  }

  // Permissions endpoints
  async getMyPermissions() {
    return this.request('/permissions/my-permissions');
  }

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

  // Custom Roles endpoints
  async listCustomRoles() {
    return this.request('/custom-roles');
  }

  async getCustomRole(roleId) {
    return this.request(`/custom-roles/${roleId}`);
  }

  async createCustomRole(data) {
    return this.request('/custom-roles', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateCustomRole(roleId, data) {
    return this.request(`/custom-roles/${roleId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteCustomRole(roleId) {
    return this.request(`/custom-roles/${roleId}`, { method: 'DELETE' });
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

  async getInternalStaff(id) {
    return this.request(`/internal-staff/${id}`);
  }

  // Internal Staff Salary endpoints
  async listSalaryPresets() {
    return this.request('/internal-staff-salary/presets');
  }

  async createSalaryPreset(data) {
    return this.request('/internal-staff-salary/presets', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateSalaryPreset(id, data) {
    return this.request(`/internal-staff-salary/presets/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteSalaryPreset(id) {
    return this.request(`/internal-staff-salary/presets/${id}`, {
      method: 'DELETE',
    });
  }

  async listSalarySheets(params = {}) {
    const qs = new URLSearchParams(params).toString();
    return this.request(`/internal-staff-salary/sheets${qs ? `?${qs}` : ''}`);
  }

  async getInternalStaffSalaryProfile(staffId) {
    return this.request(`/internal-staff-salary/staff/${staffId}/profile`);
  }

  async getSalesAttribution(staffId, month) {
    return this.request(`/internal-staff-salary/staff/${staffId}/sales-attribution?month=${month}`);
  }

  async createSalarySheet(staffId, month) {
    return this.request(`/internal-staff-salary/staff/${staffId}/sheets`, {
      method: 'POST',
      body: JSON.stringify({ month }),
    });
  }

  async getSalarySheet(sheetId) {
    return this.request(`/internal-staff-salary/sheets/${sheetId}`);
  }

  async updateSalarySheet(sheetId, data) {
    return this.request(`/internal-staff-salary/sheets/${sheetId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async previewSalarySheet(sheetId) {
    return this.request(`/internal-staff-salary/sheets/${sheetId}/preview`);
  }

  async finalizeSalarySheet(sheetId) {
    return this.request(`/internal-staff-salary/sheets/${sheetId}/finalize`, {
      method: 'POST',
    });
  }

  // Device binding endpoints
  async assignDevice(userId, label) {
    return this.request('/devices/assign', {
      method: 'POST',
      body: JSON.stringify({ user_id: userId, label }),
    });
  }

  async activateDevice({ activation_code, device_id, password }) {
    return this.request('/devices/activate', {
      method: 'POST',
      body: JSON.stringify({ activation_code, device_id, password }),
    });
  }

  async revokeDevice(deviceRowId) {
    return this.request(`/devices/${deviceRowId}`, {
      method: 'DELETE',
    });
  }

  async listDevicesForUser(userId) {
    return this.request(`/devices/user/${userId}`);
  }

  async listAllSessions() {
    return this.request('/devices/sessions');
  }

  async forceLogoutSession(sessionId) {
    return this.request(`/devices/sessions/${sessionId}/force-logout`, {
      method: 'POST',
    });
  }

  async deviceLogout() {
    return this.request('/devices/logout', {
      method: 'POST',
    });
  }
}

// Create and export a singleton instance
const apiClient = new ApiClient();
export default apiClient;
export { ApiClient };