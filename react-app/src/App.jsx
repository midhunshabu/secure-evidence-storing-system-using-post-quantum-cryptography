import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { authAPI } from './api'
import Login from './components/Login'
import Register from './components/Register'
import Dashboard from './components/Dashboard'
import Evidence from './components/Evidence'
import Admin from './components/Admin'
import CursorTrail from './components/CursorTrail'
import LoadingScreen from './components/LoadingScreen'

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('access_token')
    if (token) {
      verifyToken(token)
    } else {
      setLoading(false)
    }
  }, [])

  const verifyToken = async (token) => {
    try {
      const response = await authAPI.verifyToken(token)
      setUser(response.data.user)
      setIsAuthenticated(true)
    } catch (error) {
      localStorage.removeItem('access_token')
      setIsAuthenticated(false)
    } finally {
      setLoading(false)
    }
  }

  const handleLogin = (token, userData) => {
    localStorage.setItem('access_token', token)
    setUser(userData)
    setIsAuthenticated(true)
  }

  const handleLogout = () => {
    localStorage.removeItem('access_token')
    setUser(null)
    setIsAuthenticated(false)
  }

  useEffect(() => {
    if (!isAuthenticated) return
    const ping = () => {
      authAPI.presence().catch(() => {
        // Global interceptor handles unauthorized sessions.
      })
    }
    ping()
    const id = window.setInterval(ping, 30000)
    return () => window.clearInterval(id)
  }, [isAuthenticated])

  if (loading) {
    return (
      <LoadingScreen
        title="Verifying encrypted access"
        subtitle="Quantum hamsters are checking every key twice..."
      />
    )
  }

  return (
    <BrowserRouter>
      <CursorTrail />
      <div className={isAuthenticated ? 'main-content' : ''}>
        <Routes>
          <Route
            path="/login"
            element={
              isAuthenticated ? (
                <Navigate to={user?.role === 'admin' ? '/admin' : '/dashboard'} />
              ) : (
                <Login onLogin={handleLogin} />
              )
            }
          />
          <Route
            path="/register"
            element={
              isAuthenticated && user?.role === 'admin' ? (
                <Register onRegister={handleLogin} adminMode currentUser={user} />
              ) : isAuthenticated ? (
                <Navigate to={user?.role === 'admin' ? '/admin' : '/dashboard'} />
              ) : (
                <Navigate to="/login" />
              )
            }
          />
          <Route
            path="/dashboard"
            element={
              isAuthenticated ? (
                user?.role === 'admin' ? (
                  <Navigate to="/admin" />
                ) : (
                  <Dashboard user={user} onLogout={handleLogout} />
                )
              ) : (
                <Navigate to="/login" />
              )
            }
          />
          <Route
            path="/cases"
            element={
              isAuthenticated ? (
                user?.role === 'court_user' ? (
                  <Navigate to="/cases/created" replace />
                ) : (
                  <Evidence user={user} mode="create" />
                )
              ) : (
                <Navigate to="/login" />
              )
            }
          />
          <Route
            path="/cases/created"
            element={
              isAuthenticated ? (
                <Evidence user={user} mode="created" />
              ) : (
                <Navigate to="/login" />
              )
            }
          />
          <Route
            path="/evidence"
            element={<Navigate to="/cases/created" replace />}
          />
          <Route
            path="/admin"
            element={
              isAuthenticated && user?.role === 'admin' ? (
                <Admin user={user} onLogout={handleLogout} />
              ) : (
                <Navigate to="/dashboard" />
              )
            }
          />
          <Route
            path="/"
            element={
              <Navigate to={user?.role === 'admin' ? '/admin' : '/dashboard'} />
            }
          />
        </Routes>
      </div>
    </BrowserRouter>
  )
}
