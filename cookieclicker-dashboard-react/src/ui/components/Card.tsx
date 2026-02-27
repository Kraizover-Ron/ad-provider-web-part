import React from 'react'

export function Card(props: { title: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-zinc-900/60 border border-zinc-800 p-4 shadow-sm">
      <div className="text-sm text-zinc-400">{props.title}</div>
      <div className="mt-1 text-2xl font-semibold text-zinc-100">{props.value}</div>
      {props.sub ? <div className="mt-1 text-xs text-zinc-500">{props.sub}</div> : null}
    </div>
  )
}
