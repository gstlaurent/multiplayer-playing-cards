// *****************************************************************************
// ************** CONSTANTS ****************************************************
// *****************************************************************************

const CARD_SCALE = 0.5;
const DECK_STYLE = 'blue2';
 
const PLAYING_CARDS_TEXTURE = 'playingCards';
const CARD_BACK_TEXTURE = 'playingCardBacks';

// *****************************************************************************
// ************** CONFIG *******************************************************
// *****************************************************************************


var config = {
  type: Phaser.AUTO,
  parent: 'phaser-example',
  width: 1400,
  height: 800,
  // scale : {
  //   mode: Phaser.Scale.RESISZE,
  //   autoCenter: Phaser.Scale.CENTER_BOTH
  // },
  backgroundColor: 'rgba(0, 190, 0, 0)',
  scene: {
    preload: preload,
    create: create,
    update: update
  } 
};
  
let game = new Phaser.Game(config);

// *****************************************************************************
// ************** PRELOAD *******************************************************
// *****************************************************************************

function preload() {
  this.load.atlasXML(PLAYING_CARDS_TEXTURE, 'assets/playingCards.png', 'assets/playingCards.xml');
  this.load.atlasXML(CARD_BACK_TEXTURE, 'assets/playingCardBacks.png', 'assets/playingCardBacks.xml');
  this.load.image('eyes', 'assets/eyes.png');
}


// *****************************************************************************
// ************** CREATE *******************************************************
// *****************************************************************************


function create() {
  var self = this;  
  this.socket = io();
  this.myId = this.socket.id;
  this.cards = {};
  
  this.socket.on('connect', () => console.log('connected'));

  this.socket.on('initializeCards', function (cards) {
    cards.forEach( card => {
      self.cards[card.id] = new Card(card.id, self, card.x, card.y, card.cardName, card.ownerId);
    });
  });

  this.input.on('drag', function (pointer, gameObject, dragX, dragY) {
    let card = findCard(self, gameObject);
    card.setLocation(dragX, dragY);
    
    self.socket.emit('cardDragged', {
      cardId: card.id,
      x: normalizeX(self, dragX),
      y: normalizeY(self, dragY)
    });
  });
  this.socket.on('moveCard', function (cardUpdate) {
    let card = self.cards[cardUpdate.cardId];
    card.setNormalizedLocation(self, cardUpdate.x, cardUpdate.y);
  });



  // Brings a card to the top when it is selected
  this.input.on('dragstart', function (pointer, gameObject) {
    let card = findCard(self, gameObject);
    self.children.bringToTop(card.image);
    self.children.bringToTop(card.eyes);
  });

}

// // this.input.on('dragend', function (pointer, gameObject, dropped) {

  
// //     // if (dropped) {
// //     //     gameObject.
// //     // }
// // })

// this.input.on('drop', function (pointer, gameObject, dropZone) {
//   if (gameObject.isCard) {
//     gameObject.showFace();
//   }

//   //self.socket.emit('cardPlayed', gameObject, self.isPlayerA);
// })
  
// }

function normalizeX(scene, denormalizedX) {
  return denormalizedX / scene.scale.width;
}

function normalizeY(scene, denoramlizedY) {
  return denoramlizedY / scene.scale.height;
}

function denormalizeX(scene, normalizedX) {
  return Math.round(scene.scale.width * normalizedX);
}

function denormalizeY(scene, normalizedY) {
  return Math.round(scene.scale.height * normalizedY);
}

function findCard(scene, gameObject) {
    return scene.cards[gameObject.data.values.cardId];
}

// *************************************************************************************************
// ************** Card *****************************************************************************
// *************************************************************************************************

class Card {
  constructor(cardId, scene, normalizedX, normalizedY, faceName, visibleTo) {
    this.id = cardId;
    let x = denormalizeX(scene, normalizedX);
    let y = denormalizeY(scene, normalizedY);    
    this.image = faceName === null
       ? scene.add.image(x, y, CARD_BACK_TEXTURE, DECK_STYLE)
       : scene.add.image(x, y, PLAYING_CARDS_TEXTURE, faceName);
    this.image.setScale(CARD_SCALE).setInteractive();
    this.image.setData('cardId', cardId);
    scene.input.setDraggable(this.image);

    // Create eyes that are half the width of the card and along its top
    this.eyes = scene.add.image(x, y, 'eyes')
    let eyesScale = (this.image.displayWidth / 2) / this.eyes.width;
    this.eyes.setScale(eyesScale);

    if (visibleTo === null) {
      // this will be null if everyone can see it, or no one can see it
      this.eyes.visible = false;
    } else {
      // get tint for visibleTo id.
      this.eyes.setTintFill(0xeb7434);
    }

    // To ensure eyes are in the correct place
    this.setLocation(x, y);
  }

  showFace(faceName) {
    this.image.setTexture(PLAYING_CARDS_TEXTURE, faceName);
  }

  showBack() {
    this.image.setTexture(CARD_BACK_TEXTURE, DECK_STYLE);
  }

  setNormalizedLocation(scene, normalizedX, normalizedY) {
    let x = denormalizeX(scene, normalizedX);
    let y = denormalizeY(scene, normalizedY);  
    this.setLocation(x, y);
  }

  setLocation(x, y) {
    this.image.x = x;
    this.image.y = y;
    this.eyes.x = x;
    this.eyes.y = y - (this.getHeight() / 2);
  }

  getHeight() {
    return this.image.displayHeight;
  }

  getNormalizedX(scene) {
    return normalize(scene, this.image.x)
  }

  getNormalizedY(scene) {
    return normalize(scene, this.image.y)
  }
}


// *************************************************************************************************
// ************** Card *****************************************************************************
// *************************************************************************************************


//   this.socket.on('currentPlayers', function (players) {
//     Object.keys(players).forEach(function (id) {
//       if (players[id].playerId === self.socket.id) {
//         addPlayer(self, players[id]);
//       } else {
//         addOtherPlayers(self, players[id]);
//       }
//     });
//   });

//   this.socket.on('newPlayer', function (playerInfo) {
//     addOtherPlayers(self, playerInfo);
//   });

//   this.socket.on('disconnected', function (playerId) {
//     self.otherPlayers.getChildren().forEach(function (otherPlayer) {
//       if (playerId === otherPlayer.playerId) {
//         otherPlayer.destroy();
//       }
//     })
//   });

//   this.socket.on('playerMoved', function (playerInfo) {
//     self.otherPlayers.getChildren().forEach(function (otherPlayer) {
//       if (playerInfo.playerId === otherPlayer.playerId) {
//         otherPlayer.setRotation(playerInfo.rotation);
//         otherPlayer.setPosition(playerInfo.x, playerInfo.y);
//       }
//     });
//   });

//   this.socket.on('starLocation', function (starLocation) {
//     if (self.star) self.star.destroy();
//     self.star = self.physics.add.image(starLocation.x, starLocation.y, 'star');
//     self.physics.add.overlap(self.ship, self.star, function () {
//       this.socket.emit('starCollected');
//     }, null, self);
//   });

//   this.blueScoreText = this.add.text(16, 16, '', { fontSize: '32px', fill: '#0000FF' });
//   this.redScoreText = this.add.text(584, 16, '', { fontSize: '32px', fill: '#FF0000' });
    
//   this.socket.on('scoreUpdate', function (scores) {
//     self.blueScoreText.setText('Blue: ' + scores.blue);
//     self.redScoreText.setText('Red: ' + scores.red);
//   });

//   this.cursors = this.input.keyboard.createCursorKeys();
// }
  
function update() {
}
//   if (this.ship) {
//     if (this.cursors.left.isDown) {
//       this.ship.setAngularVelocity(-150);
//     } else if (this.cursors.right.isDown) {
//       this.ship.setAngularVelocity(150);
//     } else {
//       this.ship.setAngularVelocity(0);
//     }
  
//     if (this.cursors.up.isDown) {
//       this.physics.velocityFromRotation(this.ship.rotation + 1.5, 100, this.ship.body.acceleration);
//     } else {
//       this.ship.setAcceleration(0);
//     }
  
  
//     // emit player movement
//     var x = this.ship.x;
//     var y = this.ship.y;
//     var r = this.ship.rotation;
//     if (this.ship.oldPosition && (x !== this.ship.oldPosition.x || y !== this.ship.oldPosition.y || r !== this.ship.oldPosition.rotation)) {
//       this.socket.emit('playerMovement', { x: this.ship.x, y: this.ship.y, rotation: this.ship.rotation });
//     }
    
//     // save old position data
//     this.ship.oldPosition = {
//       x: this.ship.x,
//       y: this.ship.y,
//       rotation: this.ship.rotation
//     };
  
//     this.physics.world.wrap(this.ship, 5);
//   }
// }


// function addPlayer(self, playerInfo) {
//   self.ship = self.physics.add.image(playerInfo.x, playerInfo.y, 'ship')
//     .setOrigin(0.5, 0.5).setDisplaySize(53, 40);
//   if (playerInfo.team === 'blue') {
//     self.ship.setTint(0x0000ff);
//   } else {
//     self.ship.setTint(0xff0000);
//   }
//   self.ship.setDrag(100);
//   self.ship.setAngularDrag(100);
//   self.ship.setMaxVelocity(200);
// }

// function addOtherPlayers(self, playerInfo) {
//   const otherPlayer = self.add.sprite(playerInfo.x, playerInfo.y, 'otherPlayer').setOrigin(0.5, 0.5).setDisplaySize(53, 40);
//   if (playerInfo.team === 'blue') {
//     otherPlayer.setTint(0x0000ff);
//   } else {
//     otherPlayer.setTint(0xff0000);
//   }
//   otherPlayer.playerId = playerInfo.playerId;
//   self.otherPlayers.add(otherPlayer);
// }
