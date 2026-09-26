import { useNavigate } from 'react-router-dom';
import '../styles/EmptyState.css';

export default function EmptyState({ title, children, action = 'Browse PROtv', onAction }) {
  const navigate = useNavigate();
  return (
    <div className="premium-empty-state">
      <span className="empty-state-mark" aria-hidden="true">✦</span>
      <h3>{title}</h3>
      <p>{children}</p>
      <button type="button" onClick={onAction || (() => navigate('/#categories'))}>{action}</button>
    </div>
  );
}
