import { Link } from 'react-router-dom';
import Header from '../components/Header';
import styles from './HomePage.module.css';

export default function HomePage() {
  return (
    <div className={styles.page}>
      <Header />

      <section className={styles.hero}>
        <div className={styles.heroContent}>
          <h1 className={styles.heroTitle}>
            Protect Your Home Comfort Year-Round
          </h1>
          <p className={styles.heroSubtitle}>
            Join thousands of homeowners who trust us for reliable HVAC maintenance
          </p>
          <Link to="/plans" className={styles.ctaButton}>
            View Plans
          </Link>
        </div>
      </section>

      <section className={styles.features}>
        <div className={styles.container}>
          <h2 className={styles.sectionTitle}>Why Choose Our Maintenance Plan?</h2>

          <div className={styles.featureGrid}>
            <div className={styles.featureCard}>
              <div className={styles.featureIcon}>✓</div>
              <h3 className={styles.featureTitle}>Free Work List</h3>
              <p className={styles.featureDescription}>
                Unlike other companies, we provide a detailed Free Work List with every service—showing you exactly what maintenance tasks we can perform at no additional charge during your visit.
              </p>
             <div className={styles.exampleBox}>
  <h4>Free Work List:</h4>

  <a
    href="/Plans/free-work-list.png"
    target="_blank"
    rel="noopener noreferrer"
    className={styles.workListPreviewLink}
  >
    <img
      src="/Plans/free-work-list.png"
      alt="Free Work List included with maintenance plan"
      className={styles.workListPreviewImage}
    />
  </a>

  <p className={styles.previewNote}>
    Click image to view full list.
  </p>
</div>
            </div>

            <div className={styles.featureCard}>
              <div className={styles.featureIcon}>📋</div>
              <h3 className={styles.featureTitle}>Transparent Tune-Up Process</h3>
              <p className={styles.featureDescription}>
                Our comprehensive tune-up checklist helps you understand exactly what we check, clean, and optimize during each visit. No mysteries, no surprises.
              </p>
              <div className={styles.exampleBox}>
                <h4>Sample Summary Report:</h4>
                <div className={styles.summaryReportButtons}>
<a
  href="/Plans/tuneup-summary.pdf"
  target="_blank"
  rel="noopener noreferrer"
  className={styles.reportButton}
>
  View Example Summary Tune-Up Report
</a>
                  <Link to="/plans" className={styles.reportButtonSecondary}>
                    See Detailed Tune-Up Summary Report
                  </Link>
                </div>
              </div>
            </div>

            <div className={styles.featureCard}>
              <div className={styles.featureIcon}>⚡</div>
              <h3 className={styles.featureTitle}>Priority Service</h3>
              <p className={styles.featureDescription}>
                Members get priority scheduling and faster response times when you need us most. Never wait in line during emergencies.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.benefits}>
        <div className={styles.container}>
          <h2 className={styles.sectionTitle}>Member Benefits</h2>
          <div className={styles.benefitsList}>
            <div className={styles.benefit}>
              <span className={styles.benefitIcon}>✓</span>
              <span>2 comprehensive tune-ups per year</span>
            </div>
            <div className={styles.benefit}>
              <span className={styles.benefitIcon}>✓</span>
              <span>Priority scheduling and service</span>
            </div>
            <div className={styles.benefit}>
              <span className={styles.benefitIcon}>✓</span>
              <span>Discounts on repairs and upgrades</span>
            </div>
            <div className={styles.benefit}>
              <span className={styles.benefitIcon}>✓</span>
              <span>Free Work List with every visit</span>
            </div>
            <div className={styles.benefit}>
              <span className={styles.benefitIcon}>✓</span>
              <span>Detailed service reports</span>
            </div>
            <div className={styles.benefit}>
              <span className={styles.benefitIcon}>✓</span>
              <span>Extended system warranty</span>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.cta}>
        <div className={styles.container}>
          <h2 className={styles.ctaTitle}>Ready to Get Started?</h2>
          <p className={styles.ctaText}>
            Choose a plan that fits your needs and enjoy peace of mind all year long
          </p>
          <Link to="/plans" className={styles.ctaButton}>
            View Our Plans
          </Link>
        </div>
      </section>

      <footer className={styles.footer}>
        <div className={styles.container}>
          <p>&copy; 2024 HVAC Pro. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
