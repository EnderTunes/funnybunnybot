var util = require(__base+'core/util.js');
var Canvas = require('canvas');

// TODO: allow for random slight variation, and modifiers like dark, light, pale, etc
const COLORS = {
    DEFAULT: '#CCCCCC',
    RED: '#F44336',
    PINK: '#E91E63',
    PURPLE: '#9C27B0',
    INDIGO: '#3F51B5',
    BLUE: '#2196F3',
    CYAN: '#00BCD4',
    TEAL: '#009688',
    GREEN: '#4CAF50',
    LIME: '#CDDC39',
    YELLOW: '#FFEB3B',
    AMBER: '#FFC107',
    ORANGE: '#FF9800',
    BROWN: '#795548',
    GRAY: '#9E9E9E',
    GREY: '#9E9E9E',
    WHITE: '#FFFFFF',
    BLACK: '#000000'
};

const SHAPES = {
    CIRCLE: 'circle',
    SQUARE: 'square',
    RECTANGLE: 'rectangle'
};

const SIZE_SHAPE = {
    circle: size => ({ size, radius: size / 2, width: size, height: size }),
    square: size => ({ size, width: size, height: size }),
    rectangle: size => {
        let width = size;
        let height = util.randomIntRange(size/5, size/1.3);
        if(util.flip()) {
            width = height;
            height = size;
        }
        return { size, width, height };
    }
};

const DRAW_SHAPE = {
    circle: (ctx, { radius }) => {
        ctx.beginPath();
        ctx.arc(radius, radius, radius, 0, 2 * Math.PI, false);
        ctx.fill();
    },
    square: (ctx, { size }) => {
        ctx.fillRect(0, 0, size, size);
    },
    rectangle: (ctx, { width, height }) => {
        ctx.fillRect(0, 0, width, height);
    }
};

function cropCanvas(canvas, padding) {
    padding = padding || 0;
    let ctx = canvas.getContext('2d');
    let imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let top = canvas.height, bottom = 0, left = canvas.width, right = 0;
    for(let i = 3; i < imgData.data.length; i += 4) {
        if(imgData.data[i] === 0) continue;
        let x = (i - 3) / 4 % canvas.width;
        let y = Math.floor(i / 4 / canvas.width);
        top = Math.min(y, top);
        bottom = y; // Always going to be higher or equal to previous bottom
        left = Math.min(x, left);
        right = Math.max(x, right);
    }
    let boundingW = right - left + 1;
    let boundingH = bottom - top + 1;
    if(boundingW > 0 && boundingH > 0) {
        let newCanvas = new Canvas(boundingW + padding * 2, boundingH + padding * 2);
        let newCtx = newCanvas.getContext('2d');
        newCtx.drawImage(canvas, left, top, boundingW, boundingH, padding, padding, boundingW, boundingH);
        return newCanvas;
    } else return canvas;
}

module.exports = {
    COLORS,
    SHAPES,
    DRAW_SHAPE,
    SIZE_SHAPE,
    cropCanvas
};