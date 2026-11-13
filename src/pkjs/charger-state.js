// These are provider states, not an inference from SOC or an empty dispatch list.
// SMART_CONTROL_CAPABLE is also seen after a completed session, but does not
// prove that the requested percentage was delivered or the car reached a target.
function phase(status) {
  status = status || {};
  if (status.current === 'RETIRED' || status.currentState === 'RETIRED') {
    return {id:8,label:'Dispositivo retirado',empty:'Dispositivo retirado\nRevisa Octopus'};
  }
  if (status.isSuspended === true || status.currentState === 'SMART_CONTROL_OFF') {
    return {id:4,label:'Control en pausa',empty:'Control en pausa\nRevisa Octopus'};
  }
  switch (status.currentState) {
    case 'SMART_CONTROL_IN_PROGRESS':
      return {id:1,label:'Carga inteligente',empty:'Carga inteligente\nSin tramos publicados'};
    case 'SMART_CONTROL_CAPABLE':
      return {id:2,label:'Control listo',empty:'Control listo\nSin carga programada'};
    case 'SMART_CONTROL_NOT_AVAILABLE':
      return {id:3,label:'No conectado en casa',empty:'No conectado en casa\nConecta el coche\npara cargar en casa'};
    case 'LOST_CONNECTION':
      return {id:5,label:'Sin conexión V2C',empty:'Sin conexión V2C\nRevisa el cargador'};
    case 'BOOSTING':
      return {id:6,label:'Carga rápida',empty:'Carga rápida\nFuera del plan'};
    case 'AUTHENTICATION_PENDING':
    case 'AUTHENTICATION_COMPLETE':
    case 'TEST_CHARGE_IN_PROGRESS':
    case 'TEST_CHARGE_NOT_AVAILABLE':
    case 'SETUP_COMPLETE':
      return {id:7,label:'Preparando control',empty:'Preparando control\nRevisa Octopus'};
    case 'AUTHENTICATION_FAILED':
    case 'TEST_CHARGE_FAILED':
      return {id:8,label:'Revisa el acceso V2C',empty:'Revisa el acceso V2C\nen la app Octopus'};
    default:
      return {id:0,label:'Estado desconocido',empty:'Sin tramos previstos\nEstado desconocido'};
  }
}

function planText(state, windows, error) {
  // Do not display cached/provider dispatches as an actionable plan when the
  // device explicitly cannot currently participate in smart control.
  if ([3,4,5,7,8].indexOf(state.id) !== -1) return state.empty;
  if (error) return 'Plan no disponible';
  return windows === 'Sin tramos previstos' || !windows ? state.empty : windows;
}

module.exports = {phase:phase,planText:planText};
