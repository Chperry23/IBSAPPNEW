# Cabinet PM - React Frontend

Modern React + Tailwind CSS frontend for the Cabinet PM Tablet Application.

## Development

### Prerequisites
- Node.js 16+ installed
- Backend server running on port 3000

### Setup
```bash
cd frontend-react
npm install
```

### Run Development Server
```bash
npm run dev
```

The development server will run on `http://localhost:5173` with API proxy to backend on port 3000.

### Build for Production
```bash
npm run build
```

This creates an optimized production build in the `dist/` directory.

## Tech Stack

- **React 18** - UI framework
- **Vite** - Build tool and dev server
- **Tailwind CSS** - Utility-first CSS framework
- **React Router** - Client-side routing

## Project Structure

```
src/
├── components/      # Reusable UI components
│   ├── Layout.jsx
│   └── ProtectedRoute.jsx
├── pages/          # Page components
│   ├── Login.jsx
│   ├── Dashboard.jsx
│   ├── Sessions.jsx
│   └── Customers.jsx
├── contexts/       # React contexts (Auth, etc.)
│   └── AuthContext.jsx
├── services/       # API service layer
│   └── api.js
├── App.jsx         # Main app component with routing
├── main.jsx        # Entry point
└── index.css       # Tailwind imports and global styles
```

## Features

- ✅ Modern, responsive UI with Tailwind CSS
- ✅ Component-based architecture
- ✅ Protected routes with authentication
- ✅ API service layer for backend communication
- ✅ Context-based state management
- ✅ Modal dialogs and form validation
- ✅ Search and filtering functionality
- ✅ Success/error messaging

## API Integration

The React app communicates with the backend through the API service layer (`src/services/api.js`). In development, Vite proxies API requests to the backend server.

## Deployment

The backend server automatically serves the React build when available. Simply build the React app and restart the backend:

```bash
cd frontend-react
npm run build
cd ..
npm start
```

The server will detect the build and serve it at `http://localhost:3000`.
