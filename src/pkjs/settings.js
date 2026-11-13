// All storage is phone-side. This module never sends credentials over AppMessage.
var STORE = 'ov2c.settings';
var FIELDS = ['kiaClientId', 'kiaClientSecret', 'octopusUser', 'octopusPassword'];

function load(storage) {
  var value;
  try { value = JSON.parse(storage.getItem(STORE) || '{}'); } catch (e) { value = {}; }
  if (!value || typeof value !== 'object' || Array.isArray(value)) value = {};
  var config = {};
  FIELDS.forEach(function (key) { config[key] = typeof value[key] === 'string' ? value[key] : ''; });
  return config;
}

function save(storage, response) {
  if (!response) return null; // The Android config window was cancelled.
  var data = JSON.parse(response.charAt(0) === '{' ? response : decodeURIComponent(response));
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid settings');
  var previous = load(storage);
  var config = load(storage);
  FIELDS.forEach(function (key) {
    if (!Object.prototype.hasOwnProperty.call(data, key)) return;
    var value = data[key];
    if (value && typeof value === 'object') value = value.value;
    if (typeof value !== 'string' || value.length > 2048) throw new Error('Invalid settings');
    // Passwords and secrets may intentionally contain leading/trailing spaces.
    config[key] = key === 'kiaClientId' || key === 'octopusUser' ? value.trim() : value;
  });
  // Persist only allowlisted values, after every field has been validated.
  storage.setItem(STORE, JSON.stringify(config));
  if (config.kiaClientId !== previous.kiaClientId || config.kiaClientSecret !== previous.kiaClientSecret) {
    storage.removeItem('ov2c.kia.token');
    storage.removeItem('ov2c.kia.vehicles');
  }
  if (config.octopusUser !== previous.octopusUser || config.octopusPassword !== previous.octopusPassword) {
    storage.removeItem('ov2c.octopus.token');
    storage.removeItem('ov2c.octopus.accounts');
    storage.removeItem('ov2c.octopus.devices');
  }
  return config;
}

function status(config, saved) {
  return {
    SETTINGS_SAVED: saved,
    KIA_CONFIGURED: config.kiaClientId && config.kiaClientSecret ? 1 : 0,
    OCTOPUS_CONFIGURED: config.octopusUser && config.octopusPassword ? 1 : 0
  };
}

module.exports = { load: load, save: save, status: status };
