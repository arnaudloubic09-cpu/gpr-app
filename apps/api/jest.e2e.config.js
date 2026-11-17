/** Tests d'intégration (API + PostgreSQL réel, base gpr_test). */
module.exports = {
  ...require('./jest.config.js'),
  testRegex: 'test/.*\\.e2e-spec\\.ts$',
  testTimeout: 30000,
};
