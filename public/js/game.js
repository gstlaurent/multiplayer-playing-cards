// *****************************************************************************
// ************** CONSTANTS ****************************************************
// *****************************************************************************

let CARD_SCALE = 0.75;
const DYNAMIC_SCALING = true; // when true, CARD_SCALE is set based
                              // on the screen dimensions
const DECK_STYLE = 'blue2';
 
const PLAYING_CARDS_TEXTURE = 'playingCards';
const CARD_BACK_TEXTURE = 'playingCardBacks';

const CIRCLE_SIZE = 32;
const BUFFER =  5;
const TEXT_SIZE = CIRCLE_SIZE;

const DOUBLE_CLICK_DELAY = 350;

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
    if (card === null) return;

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
    if (card === null) return;

    card.bringToTop();
    self.socket.emit('cardSelected', card.id);
  });
  this.socket.on('cardSelected', cardId => self.cards[cardId].bringToTop());

  // Detecting a Double-Click
  // https://phaser.discourse.group/t/double-tap/3051/2
  let lastTime = 0;
  this.input.on("pointerdown", (pointer, gameObjects)=>{
    let clickDelay = this.time.now - lastTime;
    lastTime = this.time.now;
    if(clickDelay < DOUBLE_CLICK_DELAY) {
      // It is a double-click, so let's move the card to the next state.
      let card = findCard(self, gameObjects[0]);
      if (card === null) return;

      self.socket.emit('cardDoubleClicked', card.id)
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
  let cardId = gameObject.getData('cardId');
  if (cardId !== undefined) {
    return scene.cards[cardId];
  } else {
    return null;
  }
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
    if (this.ownerId === this.scene.id) {
      this.image.setTint(0xaaaaaa)
    }
  }

  showBack() {
    this.image.setTexture(CARD_BACK_TEXTURE, DECK_STYLE);
    this.image.clearTint();
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
    this.ownerId = ownerId;
    if (ownerId === null) {
      // this will be null if everyone can see it, or no one can see it
      this.eyes.visible = false;
      this.image.clearTint();
    } else {
      if (ownerId in this.scene.players) {
        this.eyes.setTintFill(this.scene.players[ownerId].colour);
        this.eyes.visible = ownerId != this.scene.id;
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

  bringToTop() {
    this.scene.children.bringToTop(this.image);
    this.scene.children.bringToTop(this.eyes);
  }
}


function update() {
}

