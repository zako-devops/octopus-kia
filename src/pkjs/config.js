// Clay renders this bundled form inside the Pebble Android configuration view.
module.exports = [
  { type: 'heading', defaultValue: 'octopus-kia' },
  { type: 'text', defaultValue: 'Configura tu Kia y tu cuenta de Octopus España. ' +
    'Consulta la batería y ajusta la carga desde el reloj, incluida la carga inmediata y su parada. Guardar estos datos no inicia una carga.' },
  { type: 'section', items: [
    { type: 'heading', defaultValue: 'Kia · Pleos' },
    { type: 'input', messageKey: 'kiaClientId', label: 'Client ID de Kia',
      defaultValue: '', attributes: { autocapitalize: 'off', autocorrect: 'off', spellcheck: false } },
    { type: 'input', messageKey: 'kiaClientSecret', label: 'Client Secret de Kia',
      defaultValue: '', attributes: { type: 'password', autocapitalize: 'off', autocorrect: 'off', spellcheck: false } }
  ] },
  { type: 'section', items: [
    { type: 'heading', defaultValue: 'Octopus España' },
    { type: 'input', messageKey: 'octopusUser', label: 'Correo de Octopus',
      defaultValue: '', attributes: { type: 'email', autocapitalize: 'off', autocorrect: 'off', spellcheck: false } },
    { type: 'input', messageKey: 'octopusPassword', label: 'Contraseña de Octopus',
      defaultValue: '', attributes: { type: 'password', autocapitalize: 'off', autocorrect: 'off', spellcheck: false } }
  ] },
  { type: 'text', defaultValue: 'Las credenciales se guardan en la app Pebble de este teléfono. ' +
    'Nunca se envían al reloj. Puedes dejar campos vacíos para borrar sus valores guardados.' },
  { type: 'submit', defaultValue: 'Guardar configuración' }
];
