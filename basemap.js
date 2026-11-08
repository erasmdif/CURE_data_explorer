// Lascia vuoto per usare OpenStreetMap senza API key.
// Per mantenere CARTO Positron, richiedi la chiave su
// https://carto.com/basemaps/apikey/ e incollala tra gli apici.
// La chiave viene usata nel browser: limita i domini consentiti dal dashboard CARTO.
const CARTO_API_KEY = 'cb1_3ruy_1_f86fe36a82af8ad5ed666918';

/** Sfondo condiviso dalla home, dalle pagine di dettaglio e dalla timeline. */
export function addBaseMap(map, options = {}) {
  const key = CARTO_API_KEY.trim();
  const osmAttribution = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
  const attribution = key
    ? `${osmAttribution} &copy; <a href="https://carto.com/attributions">CARTO</a>`
    : osmAttribution;
  const url = key
    ? `https://basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png?key=${encodeURIComponent(key)}`
    : 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

  return L.tileLayer(url, {
    maxZoom: 19,
    maxNativeZoom: key ? 20 : 19,
    updateWhenIdle: true,
    ...options,
    attribution
  }).addTo(map);
}
