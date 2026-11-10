// The game: a port of js/mahjong-engine.js createGame, startHand, the legal
// options, applying actions, settlement and runHand/playHand, for hands with
// no human seat (simulation). The order of every draw, check and call is the
// JS's, so a seeded hand plays out exactly as it does there.
#pragma once
#include "core.h"
#include "scoring.h"
#include "shanten.h"
#include <memory>

namespace lcm {

enum MeldType : uint8_t { CHOW, PUNG, KONG };

struct Meld {
  MeldType type;
  std::vector<int8_t> tiles;
  int from = -1;       // -1: JS null (a concealed kong)
  int claimed = NO_TILE;
  bool concealed = false;
  bool added = false;  // a pung made a kong
  int at = 0;          // discards thrown when it was melded
};

struct Discard { int8_t tile; bool claimed; };

// What a strategy keeps on a seat for the hand (plan commitment, a lock): opaque here.
struct BotSeatState {
  virtual ~BotSeatState() {}
  virtual std::shared_ptr<BotSeatState> clone() const { return nullptr; }  // a replay's own copy
};

struct Seat {
  std::vector<int8_t> hand, flowers;
  std::vector<Meld> melds;
  std::vector<Discard> discards;
  mutable std::shared_ptr<BotSeatState> botState;
};

// The wall: draws from the front (shift) and replacements from the back (pop).
struct Wall {
  std::vector<int8_t> t;
  int head = 0, tail = 0;  // live tiles are t[head, tail)
  int size() const { return tail - head; }
  bool empty() const { return tail == head; }
  int8_t shift() { return t[head++]; }
  int8_t pop() { return t[--tail]; }
  int8_t at(int i) const { return t[head + i]; }  // i-th tile from the front
  int8_t& atRef(int i) { return t[head + i]; }
};

struct LastDiscard { int tile = NO_TILE; int from = -1; };

struct Hand {
  uint32_t seed = 0;
  int dealer = 0, round = 1;
  Wall wall;
  Seat seats[4];
  int turn = 0, discardCount = 0, claimsMade = 0, kongChain = 0;
  bool hasLastDiscard = false;
  LastDiscard lastDiscard;
  int drawnTile = NO_TILE;
  bool canSelfDraw = true;
  int backDrawn = 0;
  // A number that changes with every change to the hand (unique across hands):
  // what a strategy may cache its reads of the table by.
  uint64_t version = 0;
  std::vector<std::string>* trace = nullptr;  // parity mode: every action, as the JS logs it
};

struct Game {
  uint32_t seed = 0;
  Rng rng;
  int points[4] = {0, 0, 0, 0};
  int round = 1, dealer = 0, firstDealer = 0, handNumber = 0, dealerRepeat = 0;
  bool over = false;
  int minFaan = 3;
  Hand hand;
};

struct GameOptions { uint32_t seed = 0; int dealer = -1; int startPoints = 2000; };
Game createGame(const GameOptions& o);
void startHand(Game& g);
inline int windOf(int dealer, int seat) { return ((seat - dealer + 4) % 4) + 1; }
inline int seatWind(const Game& g, int seat) { return windOf(g.dealer, seat); }

struct WinFlags { bool selfDraw = false, lastTile = false, robKong = false, kongWin = false, doubleKong = false, heavenly = false, earthly = false; };
// null in the JS: score.valid == false and scored == false
struct WinCheck { bool scored = false; Score score; };
WinCheck scoreWin(const Game& g, int seat, int tile, const WinFlags& f);
WinFlags selfDrawFlags(const Game& g, int seat);
WinFlags discardFlags(const Game& g, int seat, int from);

struct KongOption { int tile; bool added; };  // added: to a pung; else concealed
struct TurnOptions {
  bool hasWin = false; Score win;            // a win that may be declared
  bool hasShort = false; Score completeButShort;
  std::vector<KongOption> kongs;
  bool justClaimed = false;
};
TurnOptions turnOptions(const Game& g, int seat);

struct ClaimOptions {
  int tile = NO_TILE, from = -1;
  bool hasWin = false; Score win;
  bool hasShort = false; Score completeButShort;
  bool pung = false, kong = false, robKong = false;
  std::vector<std::array<int8_t, 2>> chows;
};
ClaimOptions claimOptions(const Game& g, int seat, int tile, int from, bool robbing);
std::vector<std::array<int8_t, 2>> chowOptions(const std::vector<int8_t>& hand, int tile);
inline bool hasAnyClaim(const ClaimOptions& o) { return o.hasWin || o.pung || o.kong || !o.chows.empty(); }

enum ActType : uint8_t { A_PASS, A_DISCARD, A_WIN, A_KONG, A_PUNG, A_CHOW };
struct Decision {
  ActType type = A_PASS;
  int tile = NO_TILE;
  std::array<int8_t, 2> tiles{{NO_TILE, NO_TILE}};  // a chow's two tiles from the hand
};

struct Agent {
  virtual ~Agent() {}
  virtual Decision turn(Game& g, int seat, const TurnOptions& o) = 0;
  virtual Decision claim(Game& g, int seat, const ClaimOptions& o) = 0;
};

enum How : uint8_t { H_SELF_DRAW, H_DISCARD, H_ROB_KONG, H_FLOWERS };
struct Result {
  bool win = false;  // else a drawn hand
  int winner = -1, payer = -1, tile = NO_TILE;
  How how = H_SELF_DRAW;
  Score score;
  int deltas[4] = {0, 0, 0, 0};
};

// Plays one hand from a fresh deal (game.hand). trace (optional) gets every action.
Result runHand(Game& g, Agent* agents[4], std::vector<std::string>* trace = nullptr);
// A replay: the hand in `g` goes on from `seat` throwing `tile` (its turn, the tile not thrown yet).
Result continueAfterDiscard(Game& g, Agent* agents[4], int seat, int tile);
// A replay from a decision point: `seat`'s turn as it stands (the tile drawn or claimed,
// nothing thrown yet), or `from`'s `tile` thrown with the claims on it not yet asked.
Result continueAtTurn(Game& g, Agent* agents[4], int seat);
Result continueAtClaims(Game& g, Agent* agents[4], int from, int tile);
// A claim applied to the hand: the tiles moved and the meld made (the engine's own step).
void applyClaim(Game& g, int seat, const Decision& d);
void touch(Hand& h);  // a new version

// Helpers the bots share with the engine.
void removeTiles(std::vector<int8_t>& arr, std::initializer_list<int> ids);
int countIn(const std::vector<int8_t>& arr, int id);
int indexOf(const std::vector<int8_t>& arr, int id);
std::vector<int8_t> sortTiles(std::vector<int8_t> ids);
Counts visibleCounts(const Game& g, int seat);
Counts unseenCounts(const Game& g, int seat);
std::string traceText(const Result& r);  // the result line of a parity trace

}  // namespace lcm
