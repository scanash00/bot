const fs = require('fs');
const path = require('path');

module.exports = (client) => {
    // initialize the events
    const eventsPath = path.join(process.cwd(), 'src', 'events');
    const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));

    for (const file of eventFiles) {
        const filePath = path.join(eventsPath, file);
        const event = require(filePath);
        event(client);
    };
}