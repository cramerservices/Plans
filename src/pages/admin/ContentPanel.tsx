import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { ContentPage } from '../../types';
import styles from './AdminPanel.module.css';

export default function ContentPanel() {
  const [contentPages, setContentPages] = useState<ContentPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingPage, setEditingPage] = useState<ContentPage | null>(null);

  useEffect(() => {
    fetchContentPages();
  }, []);

  const fetchContentPages = async () => {
    try {
      const { data, error } = await supabase
        .from('content_pages')
        .select('*')
        .order('page_key');

      if (error) throw error;
      setContentPages(data || []);
    } catch (error) {
      console.error('Error fetching content pages:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (page: ContentPage) => {
    try {
      const { error } = await supabase
        .from('content_pages')
        .update({
          title: page.title,
          content: page.content,
          updated_at: new Date().toISOString(),
        })
        .eq('id', page.id);

      if (error) throw error;

      alert('Content updated successfully!');
      setEditingPage(null);
      fetchContentPages();
    } catch (error) {
      console.error('Error updating content:', error);
      alert('Failed to update content');
    }
  };

  if (loading) {
    return <div className={styles.loading}>Loading content...</div>;
  }

  return (
    <div className={styles.panel}>
      <div className={styles.panelHeader}>
        <h2>Content Management</h2>
        <p className={styles.helpText}>
          Edit marketing content and page copy that appears on your website
        </p>
      </div>

      <div className={styles.contentList}>
        {contentPages.map((page) => (
          <div key={page.id} className={styles.contentCard}>
            <div className={styles.contentCardHeader}>
              <div>
                <h3>{page.title}</h3>
                <span className={styles.pageKey}>{page.page_key}</span>
              </div>
              <button
                onClick={() => setEditingPage(page)}
                className={styles.buttonPrimary}
              >
                Edit
              </button>
            </div>

            <div className={styles.contentPreview}>
              <pre>{JSON.stringify(page.content, null, 2)}</pre>
            </div>

            <div className={styles.contentMeta}>
              Last updated: {new Date(page.updated_at).toLocaleString()}
            </div>
          </div>
        ))}
      </div>

      {editingPage && (
        <div className={styles.modal} onClick={() => setEditingPage(null)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <h2>Edit Content: {editingPage.title}</h2>

            <div className={styles.formGroup}>
              <label>Title</label>
              <input
                type="text"
                value={editingPage.title}
                onChange={(e) =>
                  setEditingPage({ ...editingPage, title: e.target.value })
                }
              />
            </div>

            <div className={styles.formGroup}>
              <label>Content (JSON)</label>
              <textarea
                value={JSON.stringify(editingPage.content, null, 2)}
                onChange={(e) => {
                  try {
                    const parsed = JSON.parse(e.target.value);
                    setEditingPage({ ...editingPage, content: parsed });
                  } catch (err) {
                  }
                }}
                rows={15}
                className={styles.jsonEditor}
              />
            </div>

            <div className={styles.modalActions}>
              <button
                onClick={() => handleSave(editingPage)}
                className={styles.buttonPrimary}
              >
                Save Changes
              </button>
              <button
                onClick={() => setEditingPage(null)}
                className={styles.buttonSecondary}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
