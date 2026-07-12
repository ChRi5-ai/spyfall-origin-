// ============================================================
// SERVER/LOCATIONS.JS — Fixed location lists per map
// ============================================================
// Pure data plus one small pure function. Each of the four maps from
// server/settings.js has its own fixed list of 5 possible in-game
// locations. This module doesn't know about rooms, players, or
// sockets — it just answers "given a map, what are its locations?"
// and "pick one at random."
// ------------------------------------------------------------

const LOCATIONS_BY_MAP = {
  Garden: ['Gazebo', 'Pond', 'Flower Garden', 'Greenhouse', 'Playground'],
  Office: ['Reception', 'Meeting Room', 'Cafeteria', 'CEO Office', 'Break Room'],
  Rooftop: ['Helipad', 'Water Tank', 'Observation Deck', 'Billboard', 'Maintenance Area'],
  City: ['Café', 'Bus Stop', 'Park', 'Shopping Street', 'Subway Entrance'],
};

function getLocationsForMap(map) {
  return LOCATIONS_BY_MAP[map] || [];
}

function pickRandomLocation(map) {
  const locations = getLocationsForMap(map);
  if (locations.length === 0) return null;
  return locations[Math.floor(Math.random() * locations.length)];
}

module.exports = { LOCATIONS_BY_MAP, getLocationsForMap, pickRandomLocation };
