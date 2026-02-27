import { Routes, Route, Navigate } from 'react-router-dom'
import { Topbar } from './components/Topbar'
import OverviewPage from './pages/OverviewPage'
import UsersPage from './pages/UsersPage'

export default function App() {
  return (
    <div className="min-h-screen bg-black text-zinc-100">
      <Topbar />
      <Routes>
        <Route path="/" element={<OverviewPage />} />
        <Route path="/users" element={<UsersPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  )
}
