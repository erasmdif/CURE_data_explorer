// utils.js
export function getRepoBasePath() {
    const path = window.location.pathname;
  
    // Ottiene il nome della repo GitHub (es. 'CURE_data_explorer')
    const repoName = "CURE_data_explorer";
  
    // Se siamo su GitHub Pages (URL contiene /<repo>/)
    if (path.includes(`/${repoName}/`)) {
      return `/${repoName}/`;
    }
  
    // In locale
    return "./";
  }
  