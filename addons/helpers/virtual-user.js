// Emulating users from chat history
var util = require(__base+'core/util.js');
var discord = require(__base+'core/discord.js');
var messages = require(__base+'core/messages.js');
var requireUncached = require('require-uncached');
var findHelper = requireUncached('./find.js');
var FuzzySet = require('fuzzyset.js');

function VirtualUser(params) {
    this.name = params.name;
    this.id = params.id;
    this.channel = params.channel;
    this.pre = `**Virtual ${params.name}**: `;
    this.exchanges = [];
    this.fuzzy = FuzzySet();
    this.responses = 0;
    this.greeting = `Hello! I'm _virtual ${this.name}._ Say some stuff to me, dude.`;
    this.goodbye = 'I have to go now, see you later!';
}

VirtualUser.prototype.prepare = function() {
    var virtual = this;
    var msgQuery = {};
    findHelper.addChannelQuery(msgQuery, this.channel);
    setTimeout(async function() {
        let allMessages = await messages.cursor(db => db.cfind(msgQuery).sort({time:1}));
        if(allMessages) for(var i = 1; i < allMessages.length; i++) {
            if(allMessages[i-1].user !== virtual.id && allMessages[i].user === virtual.id) {
                virtual.exchanges.push([allMessages[i-1].content.toLowerCase(), allMessages[i].content]);
                virtual.fuzzy.add(allMessages[i-1].content.toLowerCase());
            }
        }
        virtual.ready = true;
        if(!virtual.exchanges[0]) {
            discord.sendMessage(virtual.channel, virtual.pre + `Actually, never mind. I'm leaving.`);
            virtual = false;
        }
    }, 100);
};

VirtualUser.prototype.getResponse = function(data) {
    var matchedPrompt = this.fuzzy.get(data.message.toLowerCase());
    if(!matchedPrompt || !matchedPrompt[0]) return;
    var responses = [];
    for(var i = 0; i < this.exchanges.length; i++) {
        if(this.exchanges[i][0] == matchedPrompt[0][1]) {
            responses.push(i);
        }
    }
    if(responses.length === 0) responses.push(util.randomInt(this.exchanges.length - 1));
    return this.exchanges[util.pickInArray(responses)][1];
};

module.exports = VirtualUser;
