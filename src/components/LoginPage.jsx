
import { useState } from 'react'
import { userDb } from '../lib/userDb'


export default function LoginPage({ onLogin }) {
  const [mode, setMode] = useState('login') // 'login' | 'register' | 'prompt-register'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)

  // Validation helper
  const validateInputs = () => {
    if (!email.trim()) {
      setError('Please enter your email address')
      return false
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Please enter a valid email address')
      return false
    }
    if (!password) {
      setError('Please enter your password')
      return false
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters')
      return false
    }
    if (mode === 'register') {
      if (!fullName.trim()) {
        setError('Please enter your full name')
        return false
      }
      if (password !== confirmPassword) {
        setError('Passwords do not match')
        return false
      }
    }
    return true
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (!validateInputs()) return

    setLoading(true)

    try {
      if (mode === 'login') {
        // 1. Check if the email exists in local db
        const emailExists = userDb.checkEmailExists(email)

        // 2. If email does not exist, prompt register
        if (!emailExists) {
          setMode('prompt-register')
          setLoading(false)
          return
        }

        // 3. Email exists, attempt login in local db
        const user = userDb.loginUser(email, password)
        localStorage.setItem('lexaid_user', JSON.stringify(user))
        onLogin?.({ user })
      } else if (mode === 'register') {
        // Register in local db
        const user = userDb.registerUser(email, password, fullName)
        localStorage.setItem('lexaid_user', JSON.stringify(user))
        onLogin?.({ user })
      }
    } catch (err) {
      setError(err.message || 'An authentication error occurred. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleGoogleLogin = async () => {
    setError('')
    setSuccess('')
    setLoading(true)

    try {
      // Simulate OAuth login delay for a premium feel
      setTimeout(() => {
        const mockGoogleUser = {
          id: 'google_' + Math.random().toString(36).substring(2, 11),
          email: 'google_user@example.com',
          fullName: 'Google User',
          createdAt: new Date().toISOString()
        }
        localStorage.setItem('lexaid_user', JSON.stringify(mockGoogleUser))
        setLoading(false)
        onLogin?.({ user: mockGoogleUser })
      }, 1500)
    } catch (err) {
      setError(err.message || 'Google Sign-In failed')
      setLoading(false)
    }
  }

  const toggleMode = () => {
    setError('')
    setSuccess('')
    if (mode === 'login') {
      setMode('register')
    } else {
      setMode('login')
    }
  }

  return (
    <div className="login-container">
      <div className="login-card">
        {/* Scales Icon */}
        <div className="login-icon">⚖️</div>

        {/* Title */}
        <h1 className="login-title">LexAid</h1>

        {/* Subtitle */}
        <p className="login-subtitle">Your Digital Companion for Constitutional & Legal Knowledge</p>

        {/* Prompt Auto Register */}
        {mode === 'prompt-register' && (
          <div className="login-prompt">
            <p><strong>Account Not Found</strong></p>
            <p>The email address <code>{email}</code> is not registered. Would you like to create a new account using the password you entered?</p>
            <div className="login-prompt-actions">
              <button 
                type="button" 
                className="btn-prompt-yes"
                onClick={() => {
                  setError('')
                  setMode('register')
                }}
              >
                Yes, Register
              </button>
              <button 
                type="button" 
                className="btn-prompt-no"
                onClick={() => {
                  setMode('login')
                  setPassword('')
                }}
              >
                No, Go Back
              </button>
            </div>
          </div>
        )}

        {/* Success message */}
        {success && <div className="login-prompt" style={{ background: 'rgba(34,197,94,0.1)', borderColor: 'rgba(34,197,94,0.3)', color: '#d1fae5' }}>{success}</div>}

        {/* Form */}
        {mode !== 'prompt-register' && (
          <form onSubmit={handleSubmit} className="login-form">
            {/* Full Name (Only in Register mode) */}
            {mode === 'register' && (
              <div className="login-field">
                <label htmlFor="fullName" className="login-label">Full Name</label>
                <input
                  id="fullName"
                  type="text"
                  placeholder="Enter your full name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="login-input"
                  disabled={loading}
                  autoComplete="name"
                />
              </div>
            )}

            {/* Email */}
            <div className="login-field">
              <label htmlFor="email" className="login-label">Email Address</label>
              <input
                id="email"
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="login-input"
                disabled={loading}
                autoComplete="email"
              />
            </div>

            {/* Password */}
            <div className="login-field">
              <label htmlFor="password" className="login-label">Password</label>
              <input
                id="password"
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="login-input"
                disabled={loading}
                autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
              />
            </div>

            {/* Confirm Password (Only in Register mode) */}
            {mode === 'register' && (
              <div className="login-field">
                <label htmlFor="confirmPassword" className="login-label">Confirm Password</label>
                <input
                  id="confirmPassword"
                  type="password"
                  placeholder="Re-enter your password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="login-input"
                  disabled={loading}
                  autoComplete="new-password"
                />
              </div>
            )}

            {/* Error Message */}
            {error && <div className="login-error">{error}</div>}

            {/* Submit Button */}
            <button type="submit" className="login-button" disabled={loading}>
              {loading ? 'Processing...' : mode === 'login' ? 'Login' : 'Register'}
            </button>

            {/* Google OAuth Login Button */}
            <div className="login-divider">
              <span>or</span>
            </div>
            <button 
              type="button" 
              className="google-button" 
              onClick={handleGoogleLogin} 
              disabled={loading}
            >
              <svg className="google-icon" viewBox="0 0 24 24" width="20" height="20">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
              </svg>
              Continue with Google
            </button>
          </form>
        )}

        {/* Footer Links */}
        <div className="login-footer-links">
          {mode !== 'prompt-register' && (
            <>
              {mode === 'login' && <a href="#forgot" className="login-link forgot-link" onClick={(e) => { e.preventDefault(); setError('Forgot password functionality is managed via Supabase settings.') }}>Forgot Password?</a>}
              <a href="#toggleMode" className="login-link register-link" onClick={(e) => { e.preventDefault(); toggleMode() }}>
                {mode === 'login' ? 'Register' : 'Back to Login'}
              </a>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="login-footer">
          © 2026 <span className="login-footer-brand">LexAid</span> | Justice • Knowledge • Accessibility
        </div>
      </div>
    </div>
  )
}

