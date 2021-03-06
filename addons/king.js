// Find out who has used a word or phrase the most
var util = require(__base+'core/util.js');
var messages = require(__base+'core/messages.js');
var discord = require(__base+'core/discord.js');

var _commands = {};

_commands.king = async function(data) {
    if(!data.paramStr.length) return data.reply('Please specify a word or phrase');
    let kingRX = util.regExpify(data.paramStr);
    let allMessages = await messages.cursor(db => db.cfind({ content: kingRX }));
    if(!allMessages) return data.reply(`Nobody is the king of _${data.paramStr}_`);
    var rankings = new Map();
    for(let { content: text, user } of allMessages) {
        let occurrences = util.getRegExpMatches(text, kingRX).length;
        if(occurrences === 0) continue;
        rankings.set(user, (rankings.get(user) || 0) + occurrences);
    }
    let kingCount = 0;
    let kings = [];
    rankings.forEach((count, user) => {
        if(count > kingCount) {
            kingCount = count;
            kings = [user];
        } else if(count === kingCount) kings.push(user);
    });
    let userList = kings.map(u => discord.getUsernameFromID(u) || '<Missing User>');
    if(kings.length > 1) userList = userList.slice(0, userList.length - 1).join(', ') + ', and ' + userList.pop();
    let message = `The kings of _${data.paramStr}_ are **${userList}**, who each said it **`;
    if(kings.length === 1) message = `The king of _${data.paramStr}_ is **${userList[0]}**, who said it **`;
    message += kingCount.toLocaleString() + '** time' + (kingCount > 1 ? 's' : '');
    data.reply(message, true);
};

_commands.regicide = async function(data) { // Find words that have changed kings the most
    let allMessages = await messages.cursor(db => db.cfind().sort({ time: 1 }));
    if(!allMessages) return data.reply(`No messages in database`);
    let dictionary = new Map();
    for(let { content: text, user } of allMessages) {
        let words = util.getRegExpMatches(text.toLowerCase(), new RegExp(`(?:\\S{0}|^|[^a-z])(\\S+)(?![a-z])`, 'gi'));
        if(!words || words.length === 0 || !words[0]) continue;
        for(let word of words) {
            if(!dictionary.has(word)) dictionary.set(word, { overthrows: 0, users: new Map() });
            let users = dictionary.get(word).users;
            let newCount = (users.get(user) || 0) + 1;
            users.set(user, newCount);
            if(users.size === 1) continue;
            if(Array.from(users).every(([u, c]) => u === user || c + 1 === newCount)) {
                dictionary.get(word).overthrows++;
            }
        }
    }
    let overthrows = Array.from(dictionary).sort((a, b) => b[1].overthrows - a[1].overthrows);
    overthrows.length = Math.min(overthrows.length, 15);
    data.reply(`__Most contested king words__\n` +
        overthrows.map(o => `${o[1].overthrows} overthrows — **${o[0]}**`).join('\n'));
};

_commands.kingofkings = async function(data) {
    let allMessages = await messages.cursor(db => db.cfind());
    if(!allMessages) return data.reply(`No messages in database`);
    let dictionary = new Map();
    for(let { content: text, user } of allMessages) {
        let words = util.getRegExpMatches(text.toLowerCase(), new RegExp(`(?:\\S{0}|^|[^a-z])(\\S+)(?![a-z])`, 'gi'));
        if(!words || words.length === 0 || !words[0]) continue;
        for(let word of words) {
            if(!dictionary.has(word)) dictionary.set(word, new Map() );
            let users = dictionary.get(word);
            users.set(user, (users.get(user) || 0) + 1);
        }
    }
    let kings = new Map();
    for(let [word, wordUsers] of dictionary) {
        if(wordUsers.size < 2) continue;
        let king = [[], 0];
        for(let [user, count] of wordUsers) {
            if(count < 2) continue;
            if(count === king[1]) {
                king[0].push(user);
            } else if(count > king[1]) {
                king = [[user], count];
            }
        }
        if(king[1] === 0) continue;
        for(let kingUser of king[0]) {
            if(!kings.has(kingUser)) {
                kings.set(kingUser, 1);
            } else {
                kings.set(kingUser, kings.get(kingUser) + 1);
            }
        }
    }
    kings = Array.from(kings)
        .map(([id, count]) => [discord.getUsernameFromID(id), count])
        .filter(([name]) => name)
        .sort((a, b) => b[1] - a[1]);
    let kingList = '**Top Kings**```xl\n';
    let longestKingName = Math.max(...kings.map(([name]) => name.length));
    kingList += 'User'.padEnd(longestKingName) + '   King Count\n';
    kingList += ''.padEnd(longestKingName + 13, '-') + '\n';
    kingList += kings.map(king => king[0].padEnd(longestKingName) + '   ' + king[1].toString().padStart(10)).join('\n');
    kingList += '```';
    data.reply(kingList);
};

module.exports = {
    commands: _commands,
    help: {
        king: ['Find the "king" of a word or phrase', 'candy']
    }
};
