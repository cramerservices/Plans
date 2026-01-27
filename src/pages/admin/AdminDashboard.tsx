import { useState } from 'react';
import { Routes, Route, Link, useLocation } from 'react-router-dom';
import Header from '../../components/Header';
import CustomersPanel from './CustomersPanel';
import PlansPanel from './PlansPanel';
import ServicesPanel from './ServicesPanel';
import ContentPanel from './ContentPanel';
import styles from './AdminDashboard.module.css';

export default function AdminDashboard() {
  const location = useLocation();

  const tabs = [
    { path: '/admin', label: 'Overview', exact: true },
    { path: '/admin/customers', label: 'Customers' },
    { path: '/admin/plans', label: 'Plans' },
    { path: '/admin/services', label: 'Services' },
    { path: '/admin/content', label: 'Content' },
  ];

  return (
    <div className={styles.page}>
      <Header />

      <div className={styles.container}>
        <div className={styles.header}>
          <h1 className={styles.title}>Admin Dashboard</h1>
          <p className={styles.subtitle}>Manage your HVAC maintenance platform</p>
        </div>

        <div className={styles.tabs}>
          {tabs.map((tab) => {
            const isActive = tab.exact
              ? location.pathname === tab.path
              : location.pathname.startsWith(tab.path);

            return (
              <Link
                key={tab.path}
                to={tab.path}
                className={`${styles.tab} ${isActive ? styles.activeTab : ''}`}
              >
                {tab.label}
              </Link>
            );
          })}
        </div>

        <div className={styles.content}>
          <Routes>
            <Route path="/" element={<OverviewPanel />} />
            <Route path="/customers" element={<CustomersPanel />} />
            <Route path="/plans" element={<PlansPanel />} />
            <Route path="/services" element={<ServicesPanel />} />
            <Route path="/content" element={<ContentPanel />} />
          </Routes>
        </div>
      </div>
    </div>
  );
}

function OverviewPanel() {
  const [stats] = useState({
    totalCustomers: 0,
    activeMemberships: 0,
    totalRevenue: 0,
    servicesCompleted: 0,
  });

  return (
    <div className={styles.overview}>
      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Total Customers</div>
          <div className={styles.statValue}>{stats.totalCustomers}</div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statLabel}>Active Memberships</div>
          <div className={styles.statValue}>{stats.activeMemberships}</div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statLabel}>Services Completed</div>
          <div className={styles.statValue}>{stats.servicesCompleted}</div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statLabel}>Total Revenue</div>
          <div className={styles.statValue}>${stats.totalRevenue.toLocaleString()}</div>
        </div>
      </div>

      <div className={styles.card}>
        <h2>Quick Actions</h2>
        <div className={styles.quickActions}>
          <Link to="/admin/services" className={styles.actionButton}>
            Add New Service
          </Link>
          <Link to="/admin/customers" className={styles.actionButton}>
            View All Customers
          </Link>
          <Link to="/admin/plans" className={styles.actionButton}>
            Manage Plans
          </Link>
          <Link to="/admin/content" className={styles.actionButton}>
            Edit Content
          </Link>
        </div>
      </div>
    </div>
  );
}
