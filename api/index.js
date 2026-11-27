const { createApp, initDatabase } = require("../server");

let initPromise = null;

module.exports = async (req, res) => {
  if (!initPromise) {
    initPromise = initDatabase().catch((err) => {
      initPromise = null;
      throw err;
    });
  }
  await initPromise;
  const app = createApp();
  return app(req, res);
};
