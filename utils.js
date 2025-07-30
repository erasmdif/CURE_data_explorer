// utils.js
export function getRepoBasePath() {
    const path = window.location.pathname;
  
    // Sostituisci con il nome esatto della tua repo se cambi
    const repoName = "CURE_data_explorer";
  
    if (path.includes(`/${repoName}/`)) {
      return `/${repoName}/`;
    }
  
    return "./";
  }
  