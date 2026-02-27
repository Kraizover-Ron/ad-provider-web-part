import { Activity, Users } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { getBaseUrl } from '../../api/client'

function Item(props: { to: string; icon: React.ReactNode; label: string }) {
  return (
    <NavLink
      to={props.to}
      className={({ isActive }) =>
        `flex items-center gap-2 rounded-xl px-3 py-2 text-sm border ${
          isActive ? 'bg-zinc-800 border-zinc-700 text-zinc-100' : 'bg-zinc-900/30 border-zinc-800 text-zinc-300 hover:bg-zinc-900'
        }`
      }
    >
      {props.icon}
      {props.label}
    </NavLink>
  )
}

export function Topbar() {
  return (
    <div className="sticky top-0 z-10 backdrop-blur bg-black/40 border-b border-zinc-900">
      <div className="mx-auto max-w-6xl px-4 py-4 flex items-center justify-between">
        <div>
          <div className="text-lg font-semibold text-zinc-100">AD Provider API Dashboard</div>
          <div className="text-xs text-zinc-500">API: {getBaseUrl() || 'not configured'}</div>
        </div>
        <div className="flex gap-2">
          <Item to="/" icon={<Activity size={16} />} label="Overview" />
          <Item to="/users" icon={<Users size={16} />} label="Users" />
        </div>
      </div>
    </div>
  )
}
