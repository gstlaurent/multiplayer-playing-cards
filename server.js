var express = require('express');
var app = express();
var server = require('http').Server(app);
var io = require('socket.io')(server);

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
    this.ownerId = null;
    this.x = 0.5;
    this.y = 0.5;
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
  return cards;
}


// *************************************************************************************************
// ************** Player *****************************************************************************
// *************************************************************************************************
class Player {
  constructor (id, colour) {
    this.id = id;
    this.colour = colour;
  }
}

const COLOURS = [
  0x0062ff, // blue
  0xeb7434, // orange
  0xbf1d00, // red
  0x000000, // black
  0xffffff, // white
  0x00b5d1, // turqoise
];

function createPlayer(id, unavailableColours) {
  var colour = null;
  for (var i = 0; i < 100; i++) {
    let prelimColour = COLOURS[Math.floor(Math.random() * COLOURS.length)];
    if (!unavailableColours.includes(prelimColour)) {
      colour = prelimColour;
      break;
    }
  }
  if (colour === null) {
    colour = COLOURS[0];
  }

  return new Player(id, colour);
}



// *************************************************************************************************
// *************************************************************************************************
// *************************************************************************************************
// *************************************************************************************************
// *************************************************************************************************
// *************************************************************************************************


let cards = createDeck();
let players = {};

io.on('connection', function (socket) {
  console.log('a user connected: ' + socket.id);
  players[socket.id] = createPlayer(socket.id, Object.values(players).map(p => p.colour));

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
    card.ownerId = socket.id;

    // The player now owns this card. Send its face value to the player;
    socket.emit('cardUpdate', card.toClient(socket.id));

    // update all other players of the new owner
    socket.broadcast.emit('cardUpdate', card.toClient(undefined));
  });
  
  // // create a new player and add it to our players object
  // players[socket.id] = {
  //   rotation: 0,
  //   x: Math.floor(Math.random() * 700) + 50,
  //   y: Math.floor(Math.random() * 500) + 50,
  //   playerId: socket.id,
  //   team: (Math.floor(Math.random() * 2) == 0) ? 'red' : 'blue'
  // };
  
  // // send the players object to the new player
  // socket.emit('currentPlayers', players);

  // // send the star object to the new player
  // socket.emit('starLocation', star);

  // // send the current scores
  // socket.emit('scoreUpdate', scores);

  // // update all other players of the new player
  // socket.broadcast.emit('newPlayer', players[socket.id]);


  // // when a player moves, update the player data
  // socket.on('playerMovement', function (movementData) {
  //   players[socket.id].x = movementData.x;
  //   players[socket.id].y = movementData.y;
  //   players[socket.id].rotation = movementData.rotation;
  //   // emit a message to all players about the player that moved
  //   socket.broadcast.emit('playerMoved', players[socket.id]);
  // });

  // socket.on('starCollected', function () {
  //   if (players[socket.id].team === 'red') {
  //     scores.red += 10;
  //   } else {
  //     scores.blue += 10;
  //   }
  //   star.x = Math.floor(Math.random() * 700) + 50;
  //   star.y = Math.floor(Math.random() * 500) + 50;
  //   io.emit('starLocation', star);
  //   io.emit('scoreUpdate', scores);
  // });
});

server.listen(8081, function () {
  console.log(`Listening on ${server.address().port}`);
});
