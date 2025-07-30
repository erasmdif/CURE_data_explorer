export function getRepoBasePath() {
  const fullPath = window.location.pathname;
  const repo = "CURE_data_explorer";

  // Se siamo su GitHub Pages
  if (fullPath.includes(`/${repo}/`)) {
    return `/${repo}/`;
  }

  // Calcola la profondità (numero di cartelle dopo la root)
  const pathSegments = fullPath.split("/").filter(Boolean); // rimuove stringhe vuote
  const depth = Math.max(0, pathSegments.length - 1); // assicura che non sia < 0

  return "../".repeat(depth);
}
