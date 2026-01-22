// API Service Layer - handles all backend communication
const API_BASE = '';  // Empty since we're on the same server

class ApiService {
  async request(endpoint, options = {}) {
    try {
      const response = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        credentials: 'include', // Always include cookies for session auth
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('API Error:', error);
      throw error;
    }
  }

  // Auth
  async login(username, password) {
    return this.request('/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
  }

  async register(userData) {
    return this.request('/register', {
      method: 'POST',
      body: JSON.stringify(userData),
    });
  }

  async logout() {
    return this.request('/logout', { method: 'POST' });
  }

  // Dashboard
  async getDashboardStats() {
    return this.request('/api/dashboard/stats');
  }

  // Customers
  async getCustomers() {
    return this.request('/api/customers');
  }

  async getCustomersWithCounts() {
    return this.request('/api/customers/with-counts');
  }

  async getCustomer(id) {
    return this.request(`/api/customers/${id}`);
  }

  async createCustomer(customerData) {
    return this.request('/api/customers', {
      method: 'POST',
      body: JSON.stringify(customerData),
    });
  }

  async updateCustomer(id, customerData) {
    return this.request(`/api/customers/${id}`, {
      method: 'PUT',
      body: JSON.stringify(customerData),
    });
  }

  async deleteCustomer(id) {
    return this.request(`/api/customers/${id}`, { method: 'DELETE' });
  }

  async bulkImportCustomers(customersData) {
    return this.request('/api/customers/bulk-import', {
      method: 'POST',
      body: JSON.stringify(customersData),
    });
  }

  // Sessions
  async getSessions() {
    return this.request('/api/sessions/all');
  }

  async getSession(id) {
    return this.request(`/api/sessions/${id}`);
  }

  async createSession(sessionData) {
    return this.request('/api/sessions', {
      method: 'POST',
      body: JSON.stringify(sessionData),
    });
  }

  async updateSession(id, sessionData) {
    return this.request(`/api/sessions/${id}`, {
      method: 'PUT',
      body: JSON.stringify(sessionData),
    });
  }

  async deleteSession(id) {
    return this.request(`/api/sessions/${id}`, { method: 'DELETE' });
  }

  async completeSession(id) {
    return this.request(`/api/sessions/${id}/complete`, { method: 'PUT' });
  }

  async duplicateSession(id, newSessionName) {
    return this.request(`/api/sessions/${id}/duplicate`, {
      method: 'POST',
      body: JSON.stringify({ session_name: newSessionName }),
    });
  }

  // Cabinets
  async getCabinet(cabinetId) {
    return this.request(`/api/cabinets/${cabinetId}`);
  }

  async createCabinet(cabinetData) {
    return this.request('/api/cabinets', {
      method: 'POST',
      body: JSON.stringify(cabinetData),
    });
  }

  async updateCabinet(id, cabinetData) {
    return this.request(`/api/cabinets/${id}`, {
      method: 'PUT',
      body: JSON.stringify(cabinetData),
    });
  }

  async deleteCabinet(id) {
    return this.request(`/api/cabinets/${id}`, { method: 'DELETE' });
  }

  async bulkImportCabinets(sessionId, cabinetsData) {
    return this.request('/api/cabinets/bulk-import', {
      method: 'POST',
      body: JSON.stringify({ session_id: sessionId, cabinets: cabinetsData }),
    });
  }

  // Nodes
  async getNodes(customerId) {
    return this.request(`/api/customers/${customerId}/nodes`);
  }

  async createNode(customerId, nodeData) {
    return this.request(`/api/customers/${customerId}/nodes/import`, {
      method: 'POST',
      body: JSON.stringify({ nodes: [nodeData], merge: true }),
    });
  }

  async updateNode(id, nodeData) {
    return this.request(`/api/nodes/${id}`, {
      method: 'PUT',
      body: JSON.stringify(nodeData),
    });
  }

  async deleteNode(id) {
    return this.request(`/api/nodes/${id}`, { method: 'DELETE' });
  }

  async deleteAllNodes(customerId) {
    return this.request(`/api/customers/${customerId}/nodes`, { method: 'DELETE' });
  }

  async bulkImportNodes(customerId, nodesData) {
    return this.request(`/api/customers/${customerId}/nodes/import`, {
      method: 'POST',
      body: JSON.stringify({ nodes: nodesData, merge: true }),
    });
  }

  // PDF Generation
  async generateSessionPDF(sessionId) {
    return this.request(`/api/sessions/${sessionId}/pdf`, { method: 'POST' });
  }

  async generateCabinetPDF(cabinetId) {
    return this.request(`/api/cabinets/${cabinetId}/pdf`, { method: 'POST' });
  }
}

export default new ApiService();
