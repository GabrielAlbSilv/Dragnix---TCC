
const CHALLENGE_TYPES = Object.freeze({
  tempo: {
    id: 'tempo',
    name: 'Contra o tempo',
    icon: 'zap',
    questionType: 'multipla',
    timed: true
  },

  precisao: {
    id: 'precisao',
    name: 'Precisão',
    icon: 'target',
    questionType: 'multipla',
    timed: false
  },

  quebra_cabeca: {
    id: 'quebra_cabeca',
    name: 'Quebra-cabeça',
    icon: 'puzzle',
    questionType: 'ordenar',
    timed: false
  },

  resistencia: {
    id: 'resistencia',
    name: 'Resistência',
    icon: 'flame',
    questionType: 'multipla',
    timed: false
  }
});

function getChallengeType(type) {
  return CHALLENGE_TYPES[type] || null;
}

function isValidChallengeType(type) {
  return Object.hasOwn(CHALLENGE_TYPES, type);
}

module.exports = {
  CHALLENGE_TYPES,
  getChallengeType,
  isValidChallengeType
};
