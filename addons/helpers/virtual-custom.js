// Custom-built bots
var util = require(__base+'core/util.js');
var discord = require(__base+'core/discord.js');
var storage = require(__base+'core/storage.js');

var virtualStorage = storage.json('customs', { profiles: {}, maintenance: {} }, '\t');
var profiles = virtualStorage.get('profiles');
var maintenance = virtualStorage.get('maintenance');

var timeouts = {};

const EXPLAIN = 'Send responses to me, **one per line**. You can send as many as you want in one message, but make sure each one is on a new line.' +
    '\n\nSet a custom greeting with `/greet <message>` and a goodbye with `/bye <message>`' +
    '\nYou can remove the last submitted response with `/undo`' +
    '\nYou can delete the entire virtual profile with `/delete`' +
    '\n\nI\'ll stop listening after 1 minute of silence.';

function finishMaintenance(userID) {
    let profile = maintenance[userID];
    if(profiles[profile]) {
        discord.sendMessage(profiles[profile].maintained,
            `Thanks for adding responses to _virtual ${util.toProperCase(profile)}!_`);
        profiles[profile].maintained = false;
    }
    maintenance[userID] = false;
    virtualStorage.save();
    delete timeouts[profile];
}

function refreshTime(userID) {
    let profile = maintenance[userID];
    if(timeouts[profile]) clearTimeout(timeouts[profile]);
    if(profiles[profile]) timeouts[profile] = setTimeout(() => finishMaintenance(userID), 60000);
    else finishMaintenance(userID);
}

module.exports = {
    startMaintenance(data) {
        if(maintenance[data.userID]) return data.reply(`You're already editing _virtual ${util.toProperCase(maintenance[data.userID])}!_`);
        var name = data.paramStr.toLowerCase();
        var properName = util.toProperCase(name);
        if(discord.getIDFromUsername(name)) {
            return data.reply(`That's a real person! _They're already virtual!_`);
        }
        if(profiles[name]) { // Virtual person exists
            var profile = profiles[name];
            if(profile.maintained && profile.maintained !== data.userID) {
                return data.reply(`Virtual ${properName} is currently being edited by someone.`);
            }
            data.reply(`_Virtual ${properName}_ already exists, but you can add more responses! ` + EXPLAIN + `\nYou can add more responses later by invoking \`/virtual ${name}\` in this conversation again.`);
            profiles[name].maintained = data.userID;
            maintenance[data.userID] = name;
        } else if(name) { // New virtual person
            profiles[name] = {
                responses: [],
                creator: data.userID,
                usedResponses: [],
                maintained: data.userID,
                greeting: `Hello! I'm _virtual ${util.toProperCase(name)}._ Say some stuff to me, dude.`,
                goodbye: 'I have to go now, see you later!'
            };
            maintenance[data.userID] = name;
            data.reply(`Let's create _virtual ${properName}!_ ` + EXPLAIN);
            refreshTime(name);
        }
        virtualStorage.save();
    },
    maintain(data) {
        if(maintenance[data.userID]) {
            var profile = profiles[maintenance[data.userID]];
            if(data.command === 'greet') {
                profile.greeting = data.paramStr;
                data.reply(`Greeting updated`);
            } else if(data.command === 'bye') {
                profile.goodbye = data.paramStr;
                data.reply(`Goodbye updated`);
            }else if(data.command === 'undo') {
                var removed = profile.responses.pop();
                data.reply(`Removed _"${removed}"_`);
            }else if(data.command === 'delete') {
                if(profile.creator === data.userID) {
                    delete profiles[maintenance[data.userID]];
                    data.reply(`Virtual profile deleted!`);
                } else data.reply(`Only **${discord.getUsernameFromID(profile.creator)}** can delete this profile!`);
            } else if(!data.command) {
                var addedResponses = data.message.split('\n');
                var added = 0, skipped = 0;
                for(var i = 0; i < addedResponses.length; i++) {
                    if(profile.responses.includes(addedResponses[i])) {
                        skipped++;
                    } else {
                        added++;
                        profile.responses.push(addedResponses[i]);
                    }
                }
                data.reply(`${added} response(s) added` +
                    (skipped ? `, ${skipped} duplicate(s) skipped` : '' ));
            }
            refreshTime(data.userID);
            virtualStorage.save();
        } else if(data.command === 'undo' || data.command === 'delete') {
            data.reply('You aren\'t working on a virtual person, use `/virtual` to get started.');
        }
    },
    newSession(params) {
        if(!profiles[params.name.toLowerCase()]) return false;
        return {
            name: params.name.toLowerCase(),
            id: params.id,
            ready: true,
            channel: params.channel,
            pre: `**Virtual ${util.toProperCase(params.name)}**: `,
            responses: 0,
            greeting: profiles[params.name.toLowerCase()].greeting,
            goodbye: profiles[params.name.toLowerCase()].goodbye,
            prepare() { },
            getResponse(data) {
                var pickedResponse = util.randomInt(profiles[this.name].responses.length - 1);
                pickedResponse = profiles[this.name].responses.splice(pickedResponse, 1)[0];
                profiles[this.name].usedResponses.push(pickedResponse);
                if(profiles[this.name].responses.length === 0) {
                    profiles[this.name].responses = profiles[this.name].usedResponses;
                    profiles[this.name].usedResponses = [];
                }
                virtualStorage.save();
                return pickedResponse;
            }
        }
    },
    getProfileSummary() {
        var response = '__Virtual Profiles__';
        for(var key in profiles) {
            if(!profiles.hasOwnProperty(key)) continue;
            response += `\n**${util.toProperCase(key)}**: ` +
                (profiles[key].responses.length + profiles[key].usedResponses.length) + ' responses';
        }
        return response;
    }
};
