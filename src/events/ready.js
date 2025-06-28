/**
 *
 * @param {Client} client
 */
module.exports = (client) => {
  client.once('ready', () => {
    client.user.setStatus('online');
    client.user.setActivity('/remind | /weather', { type: 0 });
    // console.log(`Logged in as ${client.user.tag}!`);
  });
};
