const assert = require('assert').strict;
const util = require('util');

const express = require('express');
let app = express();
let server = require('http').Server(app);
let io = require('socket.io')(server);

app.use(express.static(__dirname + '/public'));

app.get('/', function (req, res) {
  res.sendFile(__dirname + '/index.html');
});



const CARD_NAMES = [
  "Clubs10",
  "Clubs2",
  "Clubs3",
  "Clubs4",
  "Clubs5",
  "Clubs6",
  "Clubs7",
  "Clubs8",
  "Clubs9",
  "ClubsA",
  "ClubsJ",
  "ClubsK",
  "ClubsQ",
  "Diamonds10",
  "Diamonds2", 
  "Diamonds3", 
  "Diamonds4", 
  "Diamonds5", 
  "Diamonds6", 
  "Diamonds7", 
  "Diamonds8", 
  "Diamonds9", 
  "DiamondsA", 
  "DiamondsJ", 
  "DiamondsK", 
  "DiamondsQ", 
  "Hearts10",
  "Hearts2",
  "Hearts3",
  "Hearts4",
  "Hearts5",
  "Hearts6",
  "Hearts7",
  "Hearts8",
  "Hearts9",
  "HeartsA",
  "HeartsJ",
  "HeartsK",
  "HeartsQ",
  "Spades10",
  "Spades2",
  "Spades3",
  "Spades4",
  "Spades5",
  "Spades6",
  "Spades7",
  "Spades8",
  "Spades9",
  "SpadesA",
  "SpadesJ",
  "SpadesK",
  "SpadesQ",
  //"Joker",
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
  }
}

const HAND_ORIGINS = [
  [0.5, 0.9],
  [0.5, 0.1],
  [0.95, 0.5],
  [0.05, 0.5]
]

const COLOURS = [
  0x000000, // black
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
    handOrigin = [0, 0];
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



io.on('connection', function (socket) {
  console.log('a user connected: ' + socket.id);
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

  socket.on('cardDragged', function (cardUpdate) {
    let card = cards[cardUpdate.cardId];   
    card.x = cardUpdate.x;
    card.y = cardUpdate.y;
    socket.broadcast.emit('moveCard', cardUpdate);
  });

  // when a player disconnects, remove them from our players object
  socket.on('disconnect', function () {
    console.log(`user disconnected: ${socket.id}`);

    // remove this player from our players object
    delete players[socket.id];

    // emit a message to all players to remove this player
    io.emit('playerExit', socket.id);
  });

  socket.on('cardClicked', function (cardId) {
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

    let flatHands = [];    
    for (const [playerId, hand] of Object.entries(hands)) {
      const ho = players[playerId].handOrigin;
      const hos = buildSpread(ho, dealSize);
      hand.forEach( (card, i) => {
        card.ownerId = playerId;
        card.isFaceUp = false;
        card.x = hos[i][0];
        card.y = hos[i][1];
        flatHands.push(card);
      });
    }

    // customize the output for each player
    for (const playerId in players) {
      let dealtCards = flatHands.map(card => card.toClient(playerId));
      io.to(playerId).emit("deal", dealtCards);
    }

  });

});



server.listen(8081, function () {
  console.log(`Listening on ${server.address().port}`);
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

  let spread = [];
  if (origin[0] === 0.5) {
    // centered around x, so cards line up on y
    spread = ordinates.map(x => [x, origin[1]]);
  } else if (origin[1] === 0.5) {
    // centered around y, so cards line up on x
    spread = ordinates.map(y => [origin[0], y]);
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