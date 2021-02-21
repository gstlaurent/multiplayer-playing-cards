const assert = require('assert').strict;
const util = require('util');

const express = require('express');
const app = express();
const server = require('http').Server(app);
const io = require('socket.io')(server);

const PORT = process.env.PORT || 8081;

app.use(express.static(__dirname + '/public'));

app.get('/', function (req, res) {
  res.sendFile(__dirname + '/index.html');
});

server.listen(PORT, function () {
  console.log(`Listening on ${server.address().port}`);
});

const CARD_NAMES = [
  "10C",
  "10D",
  "10H",
  "10S",
  "2C",
  "2D",
  "2H",
  "2S",
  "3C",
  "3D",
  "3H",
  "3S",
  "4C",
  "4D",
  "4H",
  "4S",
  "5C",
  "5D",
  "5H",
  "5S",
  "6C",
  "6D",
  "6H",
  "6S",
  "7C",
  "7D",
  "7H",
  "7S",
  "8C",
  "8D",
  "8H",
  "8S",
  "9C",
  "9D",
  "9H",
  "9S",
  "AC",
  "AD",
  "AH",
  "AS",
  "JC",
  "JD",
  "JH",
  "JS",
  "KC",
  "KD",
  "KH",
  "KS",
  "QC",
  "QD",
  "QH",
  "QS",
];


// *************************************************************************************************
// ************** Card *****************************************************************************
// *************************************************************************************************

class Card {
  constructor(cardName, cardId) {
    this.id = cardId;
    this.cardName = cardName;
    this.reset();
  }

  reset() {
    this.x = 0.5;
    this.y = 0.5;
    this.ownerId = null;
    this.isFaceUp = false;
  }

  toClient(clientId) {
    return {
      id: this.id,
      x: this.x,
      y: this.y,
      cardName: (this.ownerId === clientId || this.isFaceUp) ? this.cardName : null,
      ownerId: this.ownerId
    };
  }
}

function createDeck() {
  let cards = CARD_NAMES.map((cardName, i) => new Card(cardName, i));
  shuffleCards(cards);
  return cards;
}


// *************************************************************************************************
// ************** Player *****************************************************************************
// *************************************************************************************************
class Player {
  constructor (id, colour, handOrigin) {
    this.id = id;
    this.colour = colour;
    this.handOrigin = handOrigin;
    this.x = handOrigin[0];
    this.y = handOrigin[1];
  }
}

const HAND_ORIGINS = [
  [0.5, 0.9],
  [0.5, 0.1],
  [0.95, 0.5],
  [0.05, 0.5],
  [0.5, 0.67],
  [0.5, 0.33]
]

const COLOURS = [
  0x0062ff, // blue
  0xeb7434, // orange
  0xbf1d00, // red
  0xffffff, // white
  0x00b5d1, // turqoise
  0x006600, // dark green
];

function createPlayer(id, unavailableColours, unavailableHandOrigins) {
  let colour = null;
  for (let i = 0; i < 100; i++) {
    let prelimColour = COLOURS[Math.floor(Math.random() * COLOURS.length)];
    if (!unavailableColours.includes(prelimColour)) {
      colour = prelimColour;
      break;
    }
  }
  if (colour === null) {
    colour = COLOURS[0];
  }

  let handOrigin = null;
  for (const ho of HAND_ORIGINS) {
    if (!unavailableHandOrigins.includes(ho)) {
      handOrigin = ho;
      break;
    }
  }
  if (handOrigin === null) {
    handOrigin = [0.5, 0.5];
  }

  return new Player(id, colour, handOrigin);
}



// *************************************************************************************************
// *************************************************************************************************
// *************************************************************************************************
// *************************************************************************************************
// *************************************************************************************************
// *************************************************************************************************


let cards = createDeck(); // [Card]
let players = {};

function getIPAddress(socket) {
  const xforward =  socket.handshake.headers['x-forwarded-for'];
  let ip;
  if (xforward) {
    ip = xforward[-1];
  } else {
    ip = socket.handshake.address.address;
  }
  const port = socket.request.connection.remotePort;
  return [ip, port];
}


io.on('connection', function (socket) {
  const [address, port] = getIPAddress(socket);
  console.log(`Connected: ${socket.id}, IP: ${address}:${port}. There are ${Object.entries(players).length + 1} players.`);


  players[socket.id] = createPlayer(
      socket.id,
      Object.values(players).map(p => p.colour),
      Object.values(players).map(p => p.handOrigin)
    );

  // send the players object to the new player
  socket.emit('currentPlayers', players);

  // update all other players of the new player
  socket.broadcast.emit('newPlayer', players[socket.id]);

  socket.on('playersInitialized', function () {
    // Card rendering depends on player colour, so players must be initialized
    // prior to sending cards.
    socket.emit('initializeCards', cards.map(card => card.toClient(socket.id)));
  });

  socket.on('pointermove', function (x, y) {
    let player = players[socket.id];
    if (player) {
      player.x = x;
      player.y = y;
      socket.broadcast.emit('pointermove', socket.id, x, y);
    }
  });

  socket.on('cardDragged', function (cardUpdate) {
    let card = cards[cardUpdate.cardId];   
    card.x = cardUpdate.x;
    card.y = cardUpdate.y;
    socket.broadcast.emit('moveCard', cardUpdate);
  });

  // when a player disconnects, remove them from our players object
  socket.on('disconnect', function () {
    const [address, port] = getIPAddress(socket);
    console.log(`Disconnected: ${socket.id}, IP: ${address}:${port}. There are ${Object.entries(players).length - 1} players.`);

    // remove this player from our players object
    delete players[socket.id];

    // emit a message to all players to remove this player
    io.emit('playerExit', socket.id);
  });

  socket.on('cardSelected', function (cardId) {
    socket.broadcast.emit('cardSelected', cardId);
  });

  socket.on('cardDoubleClicked', function (cardId) {
    let card = cards[cardId];
    // There are 3 states, that cycle through one another:
    //  1 - no owner and face down
    //      --click--> state 2
    //  2 - owner and face down
    //      --owner click--> state 3
    //      --non-owner click--> state 2 (with new owner)
    //  3 - no owner and face up
    //      --click--> state 1

    if (card.ownerId === null && !card.isFaceUp) {
      // State 1; Go to State 2
      card.ownerId = socket.id;
    } else if (card.ownerId !== null) {
      // State 2
      if (card.ownerId == socket.id) {
        // Go to State 3
        card.ownerId = null;
        card.isFaceUp = true;
      } else {
        // Back to State 2, with new owner
        card.ownerId = socket.id;
      }
    } else if (card.ownerId === null && card.isFaceUp) {
      // State 3; Go to State 1
      card.isFaceUp = false;
    } else {
      assert.fail(`Card not in valid state when clicked: Card has an Owner but is Face Up: ${card}`);
    }

    // Send the player a specific update incase they are now the owner
    socket.emit('cardUpdate', card.toClient(socket.id));

    // update all other players of the new state
    socket.broadcast.emit('cardUpdate', card.toClient(undefined));
  });

  socket.on('collectClicked', function () {
  });

  socket.on('shuffleClicked', function () {
    cards.forEach(c => c.reset());
    shuffleCards(cards);
    io.emit('collectCards', cards[0].x, cards[0].y);
  });

  socket.on('dealClicked', function (dealSize) {
    let hands = {};
    for (const [playerId, player] of Object.entries(players)) {
      hands[playerId] = [];
    }
    
    // assumes the cards are collected
    let i = 0; // cards index
    for (let d = 0; d < dealSize; d++) {
      for (const playerId in players) {
        if (i >= cards.length) {
          console.log("Dealing: Ran out of cards");
          break;
        }
        hands[playerId].push(cards[i]);
        i++;
      }
    }

    let dealtHands = {};    
    for (const [playerId, hand] of Object.entries(hands)) {
      const ho = players[playerId].handOrigin;
      const cardLocs = buildSpread(ho, dealSize);
      dealtHands[playerId] = hand.map( (card, i) => {
        card.ownerId = playerId;
        card.isFaceUp = false;
        card.x = cardLocs[i][0];
        card.y = cardLocs[i][1];
        return card
      });
    }

    // customize the output for each player
    for (const playerId in dealtHands) {
      // playerId is the for the player hands are being prepared for emit.
      let playerHands = {};
      for (const [pId, hand] of Object.entries(dealtHands)) {
        // pId is the player corresponding to these cards, whose properies we
        //  know based on the above playerId
        playerHands[pId] = hand.map(card => card.toClient(playerId));
      }
      io.to(playerId).emit("deal", playerHands, socket.id);
    }

  });

});


function buildSpread(origin, size) {
  // assumes origin will be centered around 0.5 either horiz or veritc
  // using trig, it would be possible to genearlize this

  // The dealt cards will take up 2/3 of the area
  const section = 0.67;
  const split = section / (size - 1);
  const start = (1 - section) / 2;

  let ordinates = [];
  for (let ord = start, i = 0; i < size; i++, ord += split) {
    ordinates.push(ord);
  }

  // The 'spread' has the cards of a hand in the order that they will be dealt
  // In order to produce a clockwise pinwheel-like animation when they are
  //  dealt, we have to make sure that cards on opposite sides of the board
  //  are dealt in opposite orders (hence the 1-x or 1-y).
  let spread = [];
  if (origin[0] === 0.5) {
    // centered around x, so cards line up on y
    if (origin[1] < 0.5) {
      spread = ordinates.map(x => [x, origin[1]]);
    } else {
      spread = ordinates.map(x => [1 - x, origin[1]]);
    }
  } else if (origin[1] === 0.5) {
    // centered around y, so cards line up on x
    if (origin[0] > 0.5) {
      spread = ordinates.map(y => [origin[0], y]);
    } else {
      spread = ordinates.map(y => [origin[0], 1 - y]);
    }
  }

  return spread;
}


function shuffleCards(cards) {
  shuffleArray(cards);
  for (let i in cards) {
    cards[i].id = i;
  }
}

// https://stackoverflow.com/a/12646864
function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
  }
}