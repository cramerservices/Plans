import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import styles from './Header.module.css';

export default function Header() {
  const { user, isAdmin, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const isHomePage = location.pathname === '/';

  const handleSignOut = async () => {
    try {
      await signOut();
      navigate('/');
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  const logoImage = (
    <img
      src="/Plans/LogoNameTrans.png"
      alt="Cramer Services"
      className={styles.logoImage}
    />
  );

  return (
    <header className={styles.header}>
      <div className={styles.container}>
        {isHomePage ? (
          <a
            href="https://cramerservicesllc.com"
            className={styles.logo}
          >
            {logoImage}
          </a>
        ) : (
          <Link to="/" className={styles.logo}>
            {logoImage}
          </Link>
        )}

        <nav className={styles.nav}>
          <Link to="/plans" className={styles.navLink}>Plans</Link>

          {user ? (
            <>
              <Link to="/dashboard" className={styles.navLink}>Dashboard</Link>
              {isAdmin && (
                <Link to="/admin" className={styles.navLink}>Admin</Link>
              )}
              <button onClick={handleSignOut} className={styles.signOutBtn}>
                Sign Out
              </button>
            </>
          ) : (
            <Link to="/login" className={styles.navLink}>Login</Link>
          )}
        </nav>
      </div>
    </header>
  );
}
