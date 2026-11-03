import { Link } from 'react-router-dom';
import { EmptyState } from '../components/ui.jsx';
import uz from '../lib/uz.js';

export default function NotFound() {
  return (
    <div className="card">
      <EmptyState
        variant="notfound"
        title={uz.not_found_title}
        message={uz.not_found_text}
        action={
          <Link className="btn btn-primary" to="/">
            {uz.back_home}
          </Link>
        }
      />
    </div>
  );
}
