// A comic strip generator using the message log
var util = require(__base+'core/util.js');
var Canvas = require('canvas');
var messages = require(__base+'core/messages.js');
var discord = require(__base+'core/discord.js');
var config = require(__base+'core/config.js');
var requireUncached = require('require-uncached');
var images = requireUncached('./helpers/comic/images.js');

// ✔️️ Multiple messages from the same user can clump into one frame
// ✔️ Pay attention to message times to create conversations, and insert pauses with silent frames
// ✔️ If message contains only a URL, character should be holding up a link symbol
// ✔️ Randomly transpose actors alone in frame horizontally
// Make random platforms for viper to be on, so he is in frame (separate image drawn under viper)
// Markov can show up randomly in the last frame to deliver a non-sequitur
// Create "themes" with location backgrounds and/or activities and/or outfits for the actors
// Grab linked images and draw them in the frame
// Allow generating a comic from a search term

var cWidth = 400*2, cHeight = 300*2; // Max embedded image dimensions
var fWidth = 200*2, fHeight = 150*2; // Frame dimensions
var defaultFontSize = 36;
var main = createCanvas(cWidth, cHeight),
    canvas = main.canvas,
    ctx = main.ctx;

var _commands = {};

_commands.comic = async function(data) {
    if(!config.comic) return data.reply('The comic command has not been configured!');
    // if(data.userID === '86919912156573696') return data.reply('No more comics for you, Raz');
    let query = {
        channel: config.comic.channel,
        $not: { content: '' }
    };
    let skip = 30; // Grab a pool of 30 messages
    if(data.params[0] !== 'that') { // Grab messages from a random point
        let count = await messages.cursor(db => db.ccount(query));
        skip = util.randomInt(count - skip);
    }
    let msgPool = await messages.cursor(db => db.cfind(query).sort({time:-1}).limit(30).skip(skip));

    msgPool = msgPool.map(({ content, user, time }) => ({
        text: discord.bot.fixMessage(util.emojiToText(content).replace(/<(:\w+:)\d+>/gi,'$1')),
        time, user: config.comic.users[user] || user
    }));

    var dialogue = buildDialogue(msgPool);
    //console.log(dialogue);
    var frames = placeActors(dialogue);
    frames = drawActors(frames);
    frames = drawText(frames);
    for(var f = 0; f < frames.length; f++) {
        frames[f].number = f + 1;
        //frames[f].canvas = drawFrame(frames[f]);
        drawFrameToComic(frames[f]);
    }
    fillText(ctx, (new Date(msgPool[0].time)).toLocaleDateString(), cWidth - 2, cHeight - 4, 28, 'right', 3, 1);
    discord.bot.uploadFile({
        to: data.channel, filename: `comic-${Date.now()}.png`, file: canvas.toBuffer()
    });
};

function createCanvas(width, height) {
    var newCanvas = new Canvas(width, height), newCtx = newCanvas.getContext('2d');
    newCtx.patternQuality = 'best';
    newCtx.font = defaultFontSize + 'px "SF Action Man"';
    return { canvas: newCanvas, ctx: newCtx };
}

function buildDialogue(messages) {
    var dialogue = [];
    var beat = {};
    var longestPause = 0;
    var totalPauseTime = 0;
    var addBeat = function() {
        if(dialogue.length) {
            var pauseLength = dialogue[0].time - beat.time;
            longestPause = Math.max(pauseLength,longestPause);
            totalPauseTime += pauseLength;
        }
        dialogue.unshift(beat); // Add beat to dialogue
        beat = {};
    };
    for(var m = 0; m < messages.length; m++) { // Loop through messages, newest to oldest
        if(dialogue.length === 5) break; // Stop at 5 beats (extra for first frame context)
        var message = messages[m];
        // console.log('m =',m,'user:',message.user,'message:',message.text,'time:',message.time);
        // console.log('user:',message.user);
        // console.log('message:',message.text);
        // console.log('time:',message.time);
        // console.log('beat:',beat);
        if(beat.speaker) { // If speaker already defined for this beat
            //console.log('speaker already defined:',beat.speaker);
            if(beat.speaker === message.user) { // If beat speaker matches current message speaker
                //console.log('speaker matches message user');
                var joinedText = message.text + ' \n \n ' + beat.text;
                var textFit = planText(joinedText,'left',images.genericCollisions,6); // Test fit
                if(textFit && beat.time - message.time < 180*1000) { // If fits and beat is less than 3 minutes before
                    //console.log('fits and less than 3 min, joining');
                    beat.text = message.text + ' \n \n ' + beat.text;
                    beat.time = message.time;
                } else {
                    //console.log('pause too long or doesn't fit, adding beat');
                    addBeat();
                    m--; // Run through this message again
                }
            } else { // If different speaker
                //console.log('different speaker, adding beat');
                addBeat();
                m--; // Run through this message again
            }
        }
        else { // Beat has no speaker
            //console.log('new beat, setting speaker time and text');
            beat.speaker = message.user;
            beat.text = message.text;
            beat.time = message.time;
        }
    }
    var averagePauseLength = (totalPauseTime / dialogue.length-1);
    for(var b = dialogue.length - 1; b > 0; b--) {
        // Check if pause time is more than twice the average, and at least 3 minutes
        var pauseTime = dialogue[b].time - dialogue[b-1].time;
        if(pauseTime > Math.max(180*1000,averagePauseLength * 2)) {
            dialogue.splice(b,0,{ pause: true, time: dialogue[b-1].time + pauseTime/2 });
            break; // Only one pause per comic
        }
    }
    //dialogue = dialogue.slice(-4); // Limit to 4 beats
    return dialogue;
}

function placeActors(dialogue) {
    var frames = [], actors = {};
    var placeActor = function(actor,side) {
        for(var aKey in actors) { if(!actors.hasOwnProperty(aKey)) continue;
            if(actors[aKey] === side) delete actors[aKey]; // Remove actor already on this side
        }
        actors[actor] = side;
    };
    var lastSpeaker = false;
    // Place actors (first pass)
    for(var pa = 0; pa < dialogue.length; pa++) {
        var beat = dialogue[pa];
        var frame = { actors: {}, speaker: beat.speaker, time: beat.time, text: beat.text };
        if(beat.speaker) { // If beat has a speaker
            if(pa > 0) { // If not on first frame
                if(lastSpeaker && beat.speaker !== lastSpeaker.actor) { // If different than last speaker
                    // Put new speaker on opposite side
                    placeActor(beat.speaker,util.flip(lastSpeaker.side));
                }
            } else { // First frame
                placeActor(beat.speaker,util.flip() ? 'left' : 'right'); // Put speaker on random side
            }
            lastSpeaker = { side: actors[beat.speaker], actor: beat.speaker };
        }
        for(var aKey in actors) { if(!actors.hasOwnProperty(aKey)) continue;
            if(aKey !== beat.speaker && beat[pa+1] && aKey !== beat[pa+1].speaker) {
                // If actor not speaking this frame or next frame, chance of leaving
                if(Math.random() > 0.7) delete actors[aKey];
            }
        }
        frame.actors = JSON.parse(JSON.stringify(actors)); // Write actors to frame
        // console.log('actors placed in frame',pa,frame.actors);
        frames.push(frame);
    }
    // Place actors (second pass to fill gaps)
    //for(var pa2 = 0; pa2 < frames.length; pa2++) {
    //    frame = frames[pa2];
    //    if(pa2 == 0) { // If on first frame
    //        var secondFrameActor = Object.keys(frames[pa2+1].actors)[0];
    //        frame.actors[secondFrameActor] = actors[secondFrameActor];
    //    } else { // If not on first frame
    //        var prevFrameActors = Object.keys(frames[pa2-1].actors);
    //        for(var pfa = 0; pfa < prevFrameActors.length; pfa++) { // Loop previous frame actors
    //            var thisPrevActor = prevFrameActors[pfa];
    //            if(frames[pa2+1]) { // If there is a next frame
    //                var nextFrameActor = frames[pa2+1].actors[Object.keys(frames[pa2+1].actors)[0]];
    //                if(thisPrevActor == nextFrameActor) { // If previous and next frame's actors are the same
    //                    frame.actors[nextFrameActor] = actors[nextFrameActor];
    //                }
    //            } else { // Last frame
    //                frame.actors[thisPrevActor] = actors[thisPrevActor];
    //            }
    //        }
    //    }
    //}
    // console.log(JSON.stringify(frames, null, '\t'));
    return frames;
}

function drawActors(frames) {
    var bgColor = { h: Math.random(), s: 0.15, v: 0.9 };
    // console.log('drawing actors to frames');
    // Draw actors to frames
    for(var da = 0; da < frames.length; da++) {
        // console.log('drawing frame',da-frames.length+5);
        var frame = frames[da];
        frame.bgImage = createCanvas(fWidth,fHeight);
        frame.bgImage.ctx.rect(0,0,fWidth,fHeight);
        var bgGradient = frame.bgImage.ctx.createRadialGradient(
            fWidth/2, 0, fHeight/2,
            fWidth/2, fHeight/2, fHeight
        );
        var hueOffset = 0;
        if(da === frames.length-1 && !frames[da-1].speaker) hueOffset = Math.random() * 0.3;
        var dark = util.hsvToRGB(bgColor.h+hueOffset,bgColor.s,bgColor.v),
            light = util.hsvToRGB(
                bgColor.h+hueOffset+Math.random()*0.12,
                bgColor.s-Math.random()*0.07,
                bgColor.v+Math.random()*0.07
            );
        bgGradient.addColorStop(0, 'rgba('+light.r+','+light.g+','+light.b+',1)');
        bgGradient.addColorStop(1, 'rgba('+dark.r+','+dark.g+','+dark.b+',1)');
        frame.bgImage.ctx.fillStyle = bgGradient;
        frame.bgImage.ctx.fill();
        frame.collisionMaps = [];
        frame.actorImage = createCanvas(fWidth,fHeight);
        for(var aKey in frame.actors) { if(!frame.actors.hasOwnProperty(aKey)) continue;
            var actorState = 'idle';
            if(frame.speaker) {
                if(frame.speaker === aKey) {
                    actorState = frame.text.substr(0,4) === 'http' ? 'link' : 'talk';
                } else {
                    actorState = 'listen';
                }
            } else {
                actorState = Object.keys(frame.actors).length === 1 ? 'alone' : 'idle';
            }
            var frameImage = images.getImage(aKey,actorState);
            // console.log(aKey,actorState,frame.actors[aKey]);
            if(frame.actors[aKey] === 'left') {
                frame.actorImage.ctx.translate(fWidth,0);
                frame.actorImage.ctx.scale(-1,1);
                frameImage.collisionMap = images.flipCollision(frameImage.collisionMap);
            }
            var xOffset = 0;
            if(actorState === 'alone') xOffset = util.randomInt(150);
            frame.collisionMaps.push(frameImage.collisionMap);
            frame.actorImage.ctx.drawImage(frameImage.img,0,0,fWidth,fHeight,xOffset*-1,0,fWidth,fHeight);
            if(frame.actors[aKey] === 'left') {
                frame.actorImage.ctx.translate(fWidth,0);
                frame.actorImage.ctx.scale(-1,1);
            }
        }
    }
    return frames;
}

function drawText(frames) {
    for(var f = frames.length-1; f >= 0; f--) {
        var frame = frames[f];
        if(!frame.text) continue;
        let { lines, fontSize, align } = planText(frame.text, frame.actors[frame.speaker], frame.collisionMaps,defaultFontSize);
        frame.textImage = createCanvas(fWidth,fHeight);
        for(let { text, x, y } of lines) {
            fillText(frame.textImage.ctx, text, x, y, fontSize, align, 10, 4);
        }
    }
    frames = frames.slice(-4); // Limit to 4 frames TODO: Why is this here?
    return frames;
}

function drawFrameToComic(frame) {
    // console.log('drawFrameToComic');
    // console.log('drawing:',frame.number,frame.speaker,frame.actors);
    // console.log('text plan:',JSON.stringify(frame.textPlan, null, '\t'));
    var frameX = (frame.number-1) % 2 * fWidth,
        frameY = Math.floor((frame.number-1) / 2) * fHeight;
    //ctx.fillStyle = '#eeeeee'; // Draw frame BG color
    //ctx.fillRect((frame.number-1) % 2 * fWidth, Math.floor((frame.number-1) / 2) * fHeight, fWidth, fHeight);
    ctx.drawImage(frame.bgImage.canvas, frameX, frameY);
    if(frame.textImage) ctx.drawImage(frame.textImage.canvas, frameX, frameY);
    ctx.drawImage(frame.actorImage.canvas, frameX, frameY);
    if(frame.number === 4) {  // After last frame is drawn
        // Draw frame borders
        ctx.clearRect(fWidth-4,0,8,cHeight);
        ctx.clearRect(0,fHeight-4,cWidth,8);
    }
}

function fillText(context, text, x, y, size, align, shadowBlur, shadowSpread) {
    context.font = size + 'px "SF Action Man"';
    context.textAlign = align;
    context.fillStyle = '#fff';
    context.shadowColor = '#fff';
    context.shadowBlur = shadowBlur;
    context.shadowOffsetX = 0;
    context.shadowOffsetY = 0;
    for(var t = 0; t < 5; t++) {
        var ox = 0, oy = 0;
        switch(t) {
            case 0: ox = -shadowSpread; oy = -shadowSpread; break;
            case 1: ox = shadowSpread; oy = -shadowSpread; break;
            case 2: ox = -shadowSpread; oy = shadowSpread; break;
            case 3: ox = shadowSpread; oy = shadowSpread; break;
            case 4: context.fillStyle = '#222222';
        }
        context.fillText(text, x + ox, y + oy);
    }
}

function planText(text, align, collisionMaps, maxShrink) {
    //console.log('planning text, objects:',JSON.stringify(objects, null, '\t'));
    for(var s = 0; s <= maxShrink; s++) {
        var plan = { fontSize: defaultFontSize - s, align: align, lines: [] };
        plan.lineHeight = Math.round(plan.fontSize * 0.85);
        var horizontalPadding = Math.round(plan.fontSize * 0.35);
        var ctx = createCanvas(fWidth, fHeight).ctx;
        ctx.font = plan.fontSize + 'px "SF Action Man"';
        ctx.textAlign = align;
        var words = text.split(' ');
        var line = '';
        var y = Math.round(plan.fontSize),
            textHeight = Math.round(plan.fontSize * 0.7);
        var space = images.getEmptySpace(y-textHeight, textHeight, collisionMaps);
        var x = align === 'left' ? space.left + horizontalPadding : space.right - horizontalPadding,
            maxWidth = space.right - space.left - horizontalPadding * 2;
        for(var n = 0; n < words.length; n++) {
            var urlDomain = util.getDomain(words[n]);
            var currentWord = urlDomain ? '<' + urlDomain + '>' : words[n];
            if(currentWord === '') continue;
            if(currentWord === '\n') {
                if(line !== '') plan.lines.push({ x: x, y: y, text: line });
                line = '';
                y += plan.lineHeight;
                space = images.getEmptySpace(y-textHeight, textHeight, collisionMaps);
                x = align === 'left' ? space.left + horizontalPadding : space.right - horizontalPadding;
                maxWidth = space.right - space.left - horizontalPadding * 2;
                continue;
            }
            var testLine = line + (line === '' ? '' : ' ') + currentWord;
            var testWidth = ctx.measureText(testLine).width;
            if ((!maxWidth || testWidth > maxWidth) && n > 0) {
                plan.lines.push({ x: x, y: y, text: line });
                line = currentWord;
                y += plan.lineHeight;
                space = images.getEmptySpace(y-textHeight, textHeight, collisionMaps);
                x = align === 'left' ? space.left + horizontalPadding : space.right - horizontalPadding;
                maxWidth = space.right - space.left - horizontalPadding * 2;
            } else {
                line = testLine;
            }
        }
        plan.height = y;
        plan.lines.push({ x: x, y: y, text: line });
        if(plan.height <= fHeight/1.5) {
            return plan;
        }
    }
    return false;
}


module.exports = {
    commands: _commands,
    // dev: true,
    help: {
        comic: ['Generate a comic', '', 'that']
    }
};
