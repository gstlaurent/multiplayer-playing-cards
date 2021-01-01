// *****************************************************************************
// ************** CONSTANTS ****************************************************
// *****************************************************************************

let CARD_SCALE = 0.5;
const DYNAMIC_SCALING = true; // when true, CARD_SCALE is set based
                              // on the screen dimensions
const DECK_STYLE = 'blue2';
 
const PLAYING_CARDS_TEXTURE = 'playingCards';
const CARD_BACK_TEXTURE = 'playingCardBacks';

const CIRCLE_SIZE = 32;
const BUFFER =  5;
const TEXT_SIZE = CIRCLE_SIZE;

const CLICK_SPEED = 200;
const CLICK_DISTANCE = 10;

const DEAL_SIZE = 9;

// *****************************************************************************
// ************** CONFIG *******************************************************
// *****************************************************************************


var config = {
  type: Phaser.AUTO,
  parent: 'phaser-example',
  width: 1400,
  height: 800,
  scale : {
   mode: Phaser.Scale.RESIZE,
   autoCenter: Phaser.Scale.CENTER_BOTH
  },
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

function setCardScale(screenWidth, screenHeight) {
  if (DYNAMIC_SCALING) {
    // Card Dimensions are 140 x 190
    // Let's make sure the cards are small enough to fit this many cards:
    let minAcross = 14
    let minHigh = 8;
    let wscale = (screenWidth / minAcross) / 140;
    let hscale = (screenHeight / minHigh) / 190;
    CARD_SCALE = Math.min(wscale, hscale);
  }
  console.log(`Card Scale: ${CARD_SCALE}`);
}

function create() {
  setCardScale(this.scale.width, this.scale.height);

  let self = this;  
  this.socket = io();
  this.id = null;
  this.cards = {};
  this.players = {};
  this.circle = self.add.graphics();
  
  this.socket.on('connect', function () {
    console.log(`Connected with id ${self.socket.id}`);
    self.id = self.socket.id;
  }); 
  this.socket.on('currentPlayers', function (players) {
    self.players = players;
    self.circle.clear();
    self.circle.fillStyle(players[self.id].colour);
    self.circle.fillCircle(CIRCLE_SIZE, CIRCLE_SIZE, CIRCLE_SIZE - BUFFER);
    self.socket.emit('playersInitialized');
  });
  this.socket.on('newPlayer', (player) => this.players[player.id] = player);
  this.socket.on('playerExit', (player) => delete this.players[player.id]);


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
    card.setNormalizedLocation(cardUpdate.x, cardUpdate.y);
  });

  this.socket.on('cardUpdate', function (newCard) {
    let card = self.cards[newCard.id]
    card.update(newCard);
  });

  // Brings a card to the top when it is selected
  this.input.on('dragstart', function (pointer, gameObject) {
    let card = findCard(self, gameObject);
    self.children.bringToTop(card.image);
    self.children.bringToTop(card.eyes);
  });

  // Brings a card to the top when it is selected
  this.input.on('dragend', function (pointer, gameObject) {
    // console.log(`${pointer.getDuration()}, ${pointer.distance}`);
    const isQuick = pointer.getDuration() < CLICK_SPEED;
    const isClose = pointer.distance < CLICK_SPEED;
    const isClick = isQuick && isClose;

    if (isClick) {
      let card = findCard(self, gameObject);
      self.socket.emit('cardClicked', card.id)
    }
  });

// *************************************************************************************************
// ************** SHUFFLE *****************************************************************************
// *************************************************************************************************

  this.shuffleText = this.add.text(
    (CIRCLE_SIZE + BUFFER) * 2,
    CIRCLE_SIZE - (TEXT_SIZE / 2),
      ['SHUFFLE']
    )
    .setFontSize(TEXT_SIZE)
    .setFontFamily('Trebuchet MS')
    .setColor('#00ffff')
    .setInteractive({useHandCursor: true});

    
    this.shuffleText.on('pointerover', function () {
      self.shuffleText.setColor('#ff69b4');
    });
    
    this.shuffleText.on('pointerout', function () {
      self.shuffleText.setColor('#00ffff');
    });
    
    this.shuffleText.on('pointerup', function () {
      self.socket.emit("shuffleClicked");
    });

    this.socket.on('collectCards', function (normalizedX, normalizedY) {
    const x = denormalizeX(self, normalizedX);
    const y = denormalizeY(self, normalizedY);

    const cards = Object.values(self.cards)
    cards.forEach( card => {
      card.showBack();
      card.setOwner(null);
    });

    self.tweens.add({
      targets: cards.map(c => c.image),
      duration: 200,
      x: x,
      y: y,
      onComplete: () => cards.forEach(c => c.setLocation(x, y))
    });
  });

// *************************************************************************************************
// ************** DEAL *****************************************************************************
// *************************************************************************************************

  this.dealText = this.add.text(
    self.scale.width - (TEXT_SIZE * 4),
    CIRCLE_SIZE - (TEXT_SIZE / 2),
      [`DEAL ${DEAL_SIZE}`]
    )
    .setFontSize(TEXT_SIZE)
    .setFontFamily('Trebuchet MS')
    .setColor('#00ffff')
    .setInteractive({useHandCursor: true});

  
  this.dealText.on('pointerover', function () {
    self.dealText.setColor('#ff69b4');
  });
  
  this.dealText.on('pointerout', function () {
    self.dealText.setColor('#00ffff');
  });
  
  this.dealText.on('pointerup', function () {
    self.socket.emit("dealClicked", DEAL_SIZE);
  });

  this.socket.on('deal', function (dealtCards) {
    for (newCard of dealtCards) {
      let card = self.cards[newCard.id]
      card.update(newCard);
    }

    // const x = denormalizeX(self, normalizedX);
    // const y = denormalizeY(self, normalizedY);

    // const cards = Object.values(self.cards)
    // cards.forEach( card => {
    //   card.showBack();
    //   card.setOwner(null);
    // });

    // self.tweens.add({
    //   targets: cards.map(c => c.image),
    //   duration: 200,
    //   x: x,
    //   y: y,
    //   onComplete: () => cards.forEach(c => c.setLocation(x, y))
    });

} // END OF CREATE
////////////////////////////////////////////////////////////////////////////////

// *************************************************************************************************
// ************** Normalize *****************************************************************************
// *************************************************************************************************



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
  constructor(cardId, scene, normalizedX, normalizedY, faceName, ownerId) {
    this.scene = scene;
    this.id = cardId;
    this.ownerId = ownerId;
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
    this.eyes.visible = false;

    // To ensure eyes are in the correct place
    this.setLocation(x, y);

    this.setOwner(ownerId);

  }

  showFace(faceName) {
    this.image.setTexture(PLAYING_CARDS_TEXTURE, faceName);
  }

  showBack() {
    this.image.setTexture(CARD_BACK_TEXTURE, DECK_STYLE);
  }

  setNormalizedLocation(normalizedX, normalizedY) {
    let x = denormalizeX(this.scene, normalizedX);
    let y = denormalizeY(this.scene, normalizedY);  
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

  setOwner(ownerId) {
    if (ownerId === null) {
      // this will be null if everyone can see it, or no one can see it
      this.eyes.visible = false;
    } else {
      if (ownerId in this.scene.players) {
        this.eyes.setTintFill(this.scene.players[ownerId].colour);
        this.eyes.visible = true;
      }
    }
  }

  update(newCard) {
    this.setOwner(newCard.ownerId);
    this.setNormalizedLocation(newCard.x, newCard.y);
    
    if (newCard.cardName != null) {
      this.showFace(newCard.cardName);
    } else {
      this.showBack();
    }
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
