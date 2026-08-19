export interface Card {
  suit: string;
  value: number;
  name: string;
}

export class Deck {
  private cards: Card[] = [];

  constructor() {
    this.reset();
  }

  public reset(): void {
    this.cards = [];
    const suits = ['♠️', '♥️', '♦️', '♣️'];
    const values = [
      { value: 1, name: 'A' },
      { value: 2, name: '2' },
      { value: 3, name: '3' },
      { value: 4, name: '4' },
      { value: 5, name: '5' },
      { value: 6, name: '6' },
      { value: 7, name: '7' },
      { value: 8, name: '8' },
      { value: 9, name: '9' },
      { value: 10, name: '10' },
      { value: 10, name: 'J' },
      { value: 10, name: 'Q' },
      { value: 10, name: 'K' }
    ];

    for (const suit of suits) {
      for (const value of values) {
        this.cards.push({
          suit,
          value: value.value,
          name: value.name
        });
      }
    }

    this.shuffle();
  }

  public shuffle(): void {
    for (let i = this.cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
    }
  }

  public drawCard(): Card | undefined {
    return this.cards.pop();
  }

  public getRemainingCards(): number {
    return this.cards.length;
  }
}

export class BlackjackGame {
  private deck: Deck;
  private playerHand: Card[] = [];
  private dealerHand: Card[] = [];
  private gameOver: boolean = false;

  constructor() {
    this.deck = new Deck();
    this.startGame();
  }

  private startGame(): void {
    // Deal initial cards
    this.playerHand = [];
    this.dealerHand = [];
    
    this.playerHand.push(this.deck.drawCard()!);
    this.dealerHand.push(this.deck.drawCard()!);
    this.playerHand.push(this.deck.drawCard()!);
    this.dealerHand.push(this.deck.drawCard()!);
  }

  public hit(): Card {
    const card = this.deck.drawCard()!;
    this.playerHand.push(card);
    return card;
  }

  public stand(): void {
    // Dealer draws until 17 or busts
    while (this.getDealerScore() < 17) {
      this.dealerHand.push(this.deck.drawCard()!);
    }
    this.gameOver = true;
  }

  public getPlayerHand(): Card[] {
    return this.playerHand;
  }

  public getDealerHand(): Card[] {
    return this.dealerHand;
  }

  public getPlayerScore(): number {
    return this.calculateScore(this.playerHand);
  }

  public getDealerScore(): number {
    return this.calculateScore(this.dealerHand);
  }

  private calculateScore(hand: Card[]): number {
    let score = 0;
    let aces = 0;

    for (const card of hand) {
      if (card.name === 'A') {
        aces++;
        score += 11;
      } else {
        score += card.value;
      }
    }

    // Adjust for aces
    while (score > 21 && aces > 0) {
      score -= 10;
      aces--;
    }

    return score;
  }

  public isPlayerBust(): boolean {
    return this.getPlayerScore() > 21;
  }

  public isDealerBust(): boolean {
    return this.getDealerScore() > 21;
  }

  public isPlayerBlackjack(): boolean {
    return this.playerHand.length === 2 && this.getPlayerScore() === 21;
  }

  public isDealerBlackjack(): boolean {
    return this.dealerHand.length === 2 && this.getDealerScore() === 21;
  }

  public getGameResult(): 'win' | 'lose' | 'tie' | 'playing' {
    if (!this.gameOver && !this.isPlayerBust()) return 'playing';
    
    const playerScore = this.getPlayerScore();
    const dealerScore = this.getDealerScore();

    if (this.isPlayerBust()) return 'lose';
    if (this.isDealerBust()) return 'win';
    if (this.isPlayerBlackjack() && !this.isDealerBlackjack()) return 'win';
    if (this.isDealerBlackjack() && !this.isPlayerBlackjack()) return 'lose';
    
    if (playerScore > dealerScore) return 'win';
    if (playerScore < dealerScore) return 'lose';
    return 'tie';
  }

  public formatHand(hand: Card[], hideFirst: boolean = false): string {
    return hand.map((card, index) => {
      if (hideFirst && index === 0) return '🂠';
      return `${card.name}${card.suit}`;
    }).join(' ');
  }
}