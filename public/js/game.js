// *****************************************************************************
// ************** CONSTANTS ****************************************************
// *****************************************************************************

let cardScale = 0.75;
const DYNAMIC_SCALING = true; // when true, cardScale is set based
                              // on the screen dimensions
const DECK_STYLE = 'blue2';
 
const PLAYING_CARDS_TEXTURE = 'playingCards';
const CARD_BACK_TEXTURE = 'playingCardBacks';

const CIRCLE_SIZE = 32;
const BUFFER =  5;
const TEXT_SIZE = CIRCLE_SIZE;

const DOUBLE_CLICK_DELAY = 350;

let dealSize = 9;

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
    cardScale = Math.min(wscale, hscale);
  }
  console.log(`Card Scale: ${cardScale}`);
}

function create() {
  setCardScale(this.scale.width, this.scale.height);
  this.originalCardScale = cardScale;
  this.selectedCardSize = 2; // default size is 2 of (1,2,3)

  let self = this;  
  this.socket = io();
  this.id = null;
  this.cards = {};
  this.players = {};
  this.circle = self.add.graphics();  // displays current player's colour
  this.rectangle = self.add.graphics(); // displays colour of last dealer
  
  
  this.socket.on('connect', function () {
    console.log(`Connected with id ${self.socket.id}`);
    self.id = self.socket.id;
  }); 
  this.socket.on('currentPlayers', function (players) {
    self.players = players;
    self.circle.clear();
    self.circle.fillStyle(getPlayerColour(self, self.id));
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

  this.shuffleText = new Text(this,
    (CIRCLE_SIZE + BUFFER) * 2,
    CIRCLE_SIZE - (TEXT_SIZE / 2),
    'SHUFFLE',
    function () {
      self.socket.emit("shuffleClicked");
    }
  );

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
      delay: () => Phaser.Math.Between(0, 200),
      ease: 'sine',
      x: () => x + Phaser.Math.Between(-25, 25),
      y: () => y + Phaser.Math.Between(-25, 25),
      onComplete: () => {
        cards[Phaser.Math.Between(0, cards.length - 1)].bringToTop();
        self.tweens.add({
          targets: cards.map(c => c.image),
          duration: 200,
          delay: 0,
          ease: 'sine',
          x: x,
          y: y,
          onComplete: () => cards.forEach(c => c.setLocation(x, y))
        });
      }
    });
  });

  // *************************************************************************************************
  // ************** Deal Size *****************************************************************************
  // *************************************************************************************************

  this.dealSize = new Text(this,
    self.scale.width - TEXT_SIZE,
    CIRCLE_SIZE - (TEXT_SIZE / 2),
    `${dealSize}`,
    () => {});



// *************************************************************************************************
// ************** DEAL *****************************************************************************
// *************************************************************************************************

  this.dealText = new Text(this,
    self.scale.width - (TEXT_SIZE * 4),
    CIRCLE_SIZE - (TEXT_SIZE / 2),
      `DEAL`,
      function () {
        self.socket.emit("dealClicked", dealSize);
      }
    );

  this.socket.on('deal', function (playerHands, dealerId) {
    // Add dealer-indicating rectangle under the deck
    self.rectangle.clear();
    self.rectangle.fillStyle(getPlayerColour(self, dealerId));
    let topLeft = [];
    self.dealText.text.getTopLeft(topLeft);
    self.rectangle.fillRect(
      topLeft.x,
      topLeft.y,
      self.dealText.text.width,
      self.dealText.text.height);
  
    // Now distribute the cards
    let hands = Object.values(playerHands);
    let flatHands = [];
    let maxHandSize = hands.reduce((max, hand) => Math.max(max, hand.length), 0);
    for (let c = 0; c < maxHandSize; c++) {
      for (let p = 0; p < hands.length; p++) {
        let dealtCard = hands[p][c]
        if (dealtCard) {
          flatHands.push(dealtCard);
        }
      }
    }

    flatHands.reverse().forEach(c => self.cards[c.id].bringToTop());
    flatHands.reverse();

    flatHands.forEach( (newCard, i) => {
      let card = self.cards[newCard.id]

      const x = denormalizeX(self, newCard.x);
      const y = denormalizeY(self, newCard.y);

      self.tweens.add({
        targets: card.image,
        delay: i * 25,
        duration: 200,
        x: x,
        y: y,
        onComplete: () => card.update(newCard)
      });
    });
  });

  // *************************************************************************************************
  // ************** Card Size *****************************************************************************
  // *************************************************************************************************
  this.cardSize = this.add.text(
    (self.scale.width / 2) - (TEXT_SIZE * 4),
    CIRCLE_SIZE - (TEXT_SIZE / 2),
      ['Card Size:']
    )
    .setFontSize(TEXT_SIZE)
    .setFontFamily('Trebuchet MS')
    .setColor('#000000');

  this.cardSize_1 = this.add.text(
    (self.scale.width / 2) + (TEXT_SIZE),
    CIRCLE_SIZE - (TEXT_SIZE / 2),
      ['1']
    )
    .setFontSize(TEXT_SIZE)
    .setFontFamily('Trebuchet MS')
    .setColor('#00ffff')
    .setInteractive({useHandCursor: true});

  
  this.cardSize_1.on('pointerover', function () {
    if (self.selectedCardSize !== 1) {
      self.cardSize_1.setColor('#ff69b4');
    }
  });
  
  this.cardSize_1.on('pointerout', function () {
    if (self.selectedCardSize !== 1) {
      self.cardSize_1.setColor('#00ffff');
    }
  });
  
  this.cardSize_1.on('pointerdown', function () {
    self.selectedCardSize = 1;
    updateCardScale(self.originalCardScale / 2, self.cards);
    self.cardSize_1.setColor('#000000');
    self.cardSize_2.setColor('#00ffff');
    self.cardSize_3.setColor('#00ffff');
  });

  this.cardSize_2 = this.add.text(
    (self.scale.width / 2 ) + ((TEXT_SIZE) * 2),
    CIRCLE_SIZE - (TEXT_SIZE / 2),
      ['2']
    )
    .setFontSize(TEXT_SIZE)
    .setFontFamily('Trebuchet MS')
    .setColor('#000000')
    .setInteractive({useHandCursor: true});

  
  this.cardSize_2.on('pointerover', function () {
    if (self.selectedCardSize !== 2) {
      self.cardSize_2.setColor('#ff69b4');
    }
  });
  
  this.cardSize_2.on('pointerout', function () {
    if (self.selectedCardSize !== 2) {
      self.cardSize_2.setColor('#00ffff');
    }
  });
  
  this.cardSize_2.on('pointerdown', function () {
    self.selectedCardSize = 2;
    updateCardScale(self.originalCardScale, self.cards);
    self.cardSize_1.setColor('#00ffff');
    self.cardSize_2.setColor('#000000');
    self.cardSize_3.setColor('#00ffff');
  });

  this.cardSize_3 = this.add.text(
    (self.scale.width / 2 ) + ((TEXT_SIZE) * 3),
    CIRCLE_SIZE - (TEXT_SIZE / 2),
      ['3']
    )
    .setFontSize(TEXT_SIZE)
    .setFontFamily('Trebuchet MS')
    .setColor('#00ffff')
    .setInteractive({useHandCursor: true});

  
  this.cardSize_3.on('pointerover', function () {
    if (self.selectedCardSize !== 3) {
      self.cardSize_3.setColor('#ff69b4');
    }
  });
  
  this.cardSize_3.on('pointerout', function () {
    if (self.selectedCardSize !== 3) {
      self.cardSize_3.setColor('#00ffff');
    }
  });
  
  this.cardSize_3.on('pointerdown', function () {
    self.selectedCardSize = 3;
    updateCardScale(self.originalCardScale * 2, self.cards);
    self.cardSize_1.setColor('#00ffff');
    self.cardSize_2.setColor('#00ffff');
    self.cardSize_3.setColor('#000000');
  });
} // END OF CREATE
////////////////////////////////////////////////////////////////////////////////

// *************************************************************************************************
// ************** Normalize *****************************************************************************
// *************************************************************************************************

function updateCardScale(newScale, cards) {
  cardScale = newScale;
  for (let card of Object.values(cards)) {
    card.setCardScale(newScale);
  }
}

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
    this.image.setInteractive();
    this.image.setData('cardId', cardId);
    scene.input.setDraggable(this.image);

    this.eyes = scene.add.image(x, y, 'eyes')
    this.eyes.visible = false;

    this.setCardScale(cardScale);

    this.setOwner(ownerId);

  }


  setCardScale(newScale) {
    this.image.setScale(newScale);
    
    // Create eyes that are half the width of the card and along its top
    let eyesScale = (this.image.displayWidth / 2) / this.eyes.width;
    this.eyes.setScale(eyesScale);
    
    // To ensure eyes are in the correct place
    this.setLocation(this.image.x, this.image.y);  
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
        this.eyes.setTintFill(getPlayerColour(this.scene, ownerId));
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

function getPlayerColour (scene, playerId) {
  if (scene.players[playerId]) {
    return scene.players[playerId].colour;
  } else {
    return 0x000000; // black
  }
}

// *************************************************************************************************
// ************** Text *****************************************************************************
// *************************************************************************************************

class Text {
  constructor (scene, x, y, text, onClick) {
    let self = this;
    
    this.text = scene.add.text(x, y, [text])
      .setFontSize(TEXT_SIZE)
      .setFontFamily('Trebuchet MS')
      .setColor('#00ffff')
      .setInteractive({useHandCursor: true});

    this.text.on('pointerover', function () {
      self.text.setColor('#ff69b4');
    });
    
    this.text.on('pointerout', function () {
      self.text.setColor('#00ffff');
    });
    
    this.text.on('pointerup', onClick);    

  }
}
