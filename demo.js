/**
 * Region Share - Interactive Demo Page Script
 * Eliminates CSP violations by separating JS into an external file.
 */
document.addEventListener('DOMContentLoaded', () => {
  const triggerBtn = document.getElementById('trigger-crop-btn');
  if (triggerBtn) {
    triggerBtn.addEventListener('click', () => {
      if (typeof window.__regionShareStart === 'function') {
        window.__regionShareStart();
      } else {
        window.dispatchEvent(new CustomEvent('region-share-start'));
      }
    });
  }
});
