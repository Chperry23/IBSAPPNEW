import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Sessions from './pages/Sessions';
import SessionDetailFull from './pages/SessionDetailFull';
import IISession from './pages/IISession';
import IIDocumentDetail from './pages/IIDocumentDetail';
import Customers from './pages/Customers';
import CustomerDetail from './pages/CustomerDetail';
import CabinetInspectionFull from './pages/CabinetInspectionFull';
import Nodes from './pages/Nodes';
import Sync from './pages/Sync';
import CSVTracking from './pages/CSVTracking';

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Public Routes */}
          <Route path="/" element={<Login />} />
          
          {/* Protected Routes */}
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/sessions"
            element={
              <ProtectedRoute>
                <Sessions />
              </ProtectedRoute>
            }
          />
          <Route
            path="/session/:id"
            element={
              <ProtectedRoute>
                <SessionDetailFull />
              </ProtectedRoute>
            }
          />
          <Route
            path="/ii-session/:id"
            element={
              <ProtectedRoute>
                <IISession />
              </ProtectedRoute>
            }
          />
          <Route
            path="/ii-document/:id"
            element={
              <ProtectedRoute>
                <IIDocumentDetail />
              </ProtectedRoute>
            }
          />
          <Route
            path="/customers"
            element={
              <ProtectedRoute>
                <Customers />
              </ProtectedRoute>
            }
          />
          <Route
            path="/customer/:id"
            element={
              <ProtectedRoute>
                <CustomerDetail />
              </ProtectedRoute>
            }
          />
          <Route
            path="/cabinet/:id"
            element={
              <ProtectedRoute>
                <CabinetInspectionFull />
              </ProtectedRoute>
            }
          />
          <Route
            path="/nodes/:customerId"
            element={
              <ProtectedRoute>
                <Nodes />
              </ProtectedRoute>
            }
          />
          <Route
            path="/sync"
            element={
              <ProtectedRoute>
                <Sync />
              </ProtectedRoute>
            }
          />
          <Route
            path="/csv-tracking"
            element={
              <ProtectedRoute>
                <CSVTracking />
              </ProtectedRoute>
            }
          />
          
          {/* Catch all - redirect to login */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
