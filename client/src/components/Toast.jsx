import { CheckCircle, AlertCircle, AlertTriangle } from 'lucide-react'

export default function Toast({ toast }) {
  const icons = {
    success: <CheckCircle size={15} style={{ color:'var(--color-success)', flexShrink:0 }}/>,
    error:   <AlertCircle  size={15} style={{ color:'var(--color-danger)',  flexShrink:0 }}/>,
    warning: <AlertTriangle size={15} style={{ color:'var(--color-warning)',flexShrink:0 }}/>,
  }
  return (
    <div className={`toast ${toast.show ? 'show' : ''} toast--${toast.type}`}>
      {icons[toast.type]}
      {toast.message}
    </div>
  )
}