import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { onAuthStateChanged } from 'firebase/auth'
import type { User } from 'firebase/auth'
import { auth } from './firebaseConfig'
import { Toaster } from 'react-hot-toast'

// Pages
import Login from './pages/Login'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Income from './pages/Income'
import Expenses from './pages/Expenses'
import Cards from './pages/Cards'
import Debts from './pages/Debts'
import Savings from './pages/Savings'
import Remittance from './pages/Remittance'
import Budget from './pages/Budget'
import Reports from './pages/Reports'
import Health from './pages/Health'
import Settings from './pages/Settings'

export default function App() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser)
      setLoading(false)
    })
    return () => unsubscribe()
  }, [])

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        background: 'var(--bg)',
        color: 'var(--text)',
        fontSize: '18px'
      }}>
        ⏳ Loading...
      </div>
    )
  }

  return (
    <BrowserRouter>
      <Toaster
        position="top-center"
        toastOptions={{
          style: {
            background: 'var(--card)',
            color: 'var(--text)',
            border: '1px solid var(--border)',
          }
        }}
      />
      <Routes>
        {/* Public */}
        <Route
          path="/login"
          element={!user ? <Login /> : <Navigate to="/" replace />}
        />

        {/* Protected */}
        <Route
          path="/"
          element={user ? <Layout user={user} /> : <Navigate to="/login" replace />}
        >
          <Route index element={<Dashboard user={user!} />} />
          <Route path="income" element={<Income user={user!} />} />
          <Route path="expenses" element={<Expenses user={user!} />} />
          <Route path="cards" element={<Cards user={user!} />} />
          <Route path="debts" element={<Debts user={user!} />} />
          <Route path="savings" element={<Savings user={user!} />} />
          <Route path="remittance" element={<Remittance user={user!} />} />
          <Route path="budget" element={<Budget user={user!} />} />
          <Route path="reports" element={<Reports user={user!} />} />
          <Route path="health" element={<Health user={user!} />} />
          <Route path="settings" element={<Settings user={user!} />} />
        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}