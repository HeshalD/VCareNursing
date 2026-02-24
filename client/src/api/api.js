const API_BASE_URL = 'http://localhost:5000/api';



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

        'Content-Type': 'application/json',

        ...(this.token && { Authorization: `Bearer ${this.token}` }),

        ...options.headers,

      },

      ...options,

    };



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

  async updateBookingStatus(bookingId, status) {
    return this.request(`/bookings/${bookingId}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status }),
    });
  }
}

// Create and export a singleton instance
const apiClient = new ApiClient();

export default apiClient;
export { ApiClient };