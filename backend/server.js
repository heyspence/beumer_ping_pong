const express = require("express");
const fs = require("fs");
const path = require("path");
const cors = require("cors");
const bodyParser = require("body-parser");
const { v4: uuidv4 } = require("uuid");

const app = express();
const PORT = 3001;
const DATA_FILE = path.join(__dirname, "data", "predictions.json");

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Create data directory if needed and initialize predictions file
const DATA_DIR = path.join(__dirname, "data");
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, JSON.stringify([]));
}

// Get all players (from tournament data file)
app.get("/api/players", (req, res) => {
  try {
    const dataPath = path.join(__dirname, "data", "tournament_players.json");
    if (!fs.existsSync(dataPath)) {
      // Fallback to generated names
      return res.json(Array.from({ length: 36 }, (_, i) => `Player ${i + 1}`));
    }
    const players = JSON.parse(fs.readFileSync(dataPath, "utf8"));
    res.json(players);
  } catch (err) {
    console.error("Error reading player data:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Submit a complete bracket prediction
app.post("/api/predictions", (req, res) => {
  const { playerName, betType, bracket } = req.body;

  if (!playerName || !betType || !bracket) {
    return res
      .status(400)
      .json({ error: "Player name, bet type and bracket required" });
  }

  let predictions = [];
  try {
    const data = fs.readFileSync(DATA_FILE);
    predictions = JSON.parse(data);
  } catch (err) {
    console.error("Error reading predictions:", err);
    return res.status(500).json({ error: "Server error" });
  }

  // Check if player already has a prediction (by matching name and bracket)
  const { playerId: submittedPlayerId } = req.body;
  let existingIndex = -1;

  if (submittedPlayerId) {
    existingIndex = predictions.findIndex((p) => p.id === submittedPlayerId);
  } else {
    // No player ID provided, check for duplicate by name and bracket similarity
    existingIndex = predictions.findIndex(
      (p) =>
        p.playerName === playerName &&
        JSON.stringify(p.bracket) === JSON.stringify(bracket),
    );
  }

  // Use existing ID if found, otherwise generate new one
  const predictionId =
    existingIndex >= 0 ? predictions[existingIndex].id : uuidv4();

  const newPrediction = {
    id: predictionId,
    playerName,
    betType,
    bracket,
    timestamp: new Date().toISOString(),
  };

  if (existingIndex >= 0) {
    predictions[existingIndex] = newPrediction;
  } else {
    predictions.push(newPrediction);
  }

  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(predictions, null, 2));
    res.json({ success: true, prediction: newPrediction });
  } catch (err) {
    console.error("Error writing predictions:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Get all predictions
app.get("/api/predictions", (req, res) => {
  try {
    const data = fs.readFileSync(DATA_FILE);
    const predictions = JSON.parse(data);
    res.json(predictions);
  } catch (err) {
    console.error("Error reading predictions:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Get prediction by player ID
app.get("/api/predictions/:playerId", (req, res) => {
  try {
    const data = fs.readFileSync(DATA_FILE);
    const predictions = JSON.parse(data);
    const prediction = predictions.find(
      (p) => p.playerId === req.params.playerId,
    );

    if (!prediction) {
      return res.status(404).json({ error: "Prediction not found" });
    }

    res.json(prediction);
  } catch (err) {
    console.error("Error reading predictions:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Get bracket structure info
app.get("/api/bracket-structure", (req, res) => {
  const structure = generateBracketStructure();
  res.json(structure);
});

// Get total predictions count
app.get("/api/stats/total-predictions", (req, res) => {
  try {
    const data = fs.readFileSync(DATA_FILE);
    const predictions = JSON.parse(data);
    res.json({ totalPredictions: predictions.length });
  } catch (err) {
    console.error("Error reading predictions:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Get most predicted winner across all rounds with breakdown
app.get("/api/stats/most-predicted-winner", (req, res) => {
  try {
    const data = fs.readFileSync(DATA_FILE);
    const predictions = JSON.parse(data);

    if (predictions.length === 0) {
      return res.json({
        totalPredictions: 0,
        mostPredictedWinner: "No data yet",
        winCount: 0,
        breakdown: [],
      });
    }

    // Count how many times each player is predicted to win each match by round
    const roundStats = [];
    const allPlayerWins = {};

    predictions.forEach((prediction) => {
      const bracket = prediction.bracket;

      if (bracket.rounds && Array.isArray(bracket.rounds)) {
        bracket.rounds.forEach((round, roundIdx) => {
          if (!roundStats[roundIdx]) {
            roundStats[roundIdx] = {
              roundName: round.name || `Round ${roundIdx + 1}`,
              playerCounts: {},
              totalMatches: 0,
            };
          }

          if (round.matches && Array.isArray(round.matches)) {
            round.matches.forEach((match) => {
              const winner = match.winner;
              if (winner && !match.isBye) {
                // Count per round
                roundStats[roundIdx].playerCounts[winner] =
                  (roundStats[roundIdx].playerCounts[winner] || 0) + 1;
                roundStats[roundIdx].totalMatches++;

                // Count across all rounds for overall winner
                allPlayerWins[winner] = (allPlayerWins[winner] || 0) + 1;
              }
            });
          }
        });
      }
    });

    // Build breakdown array with per-round data
    const breakdown = roundStats.map((roundData, idx) => {
      let mostPredictedInRound = null;
      let maxCountInRound = 0;

      for (const [player, count] of Object.entries(roundData.playerCounts)) {
        if (count > maxCountInRound) {
          maxCountInRound = count;
          mostPredictedInRound = player;
        }
      }

      return {
        round: roundData.roundName,
        playerName: mostPredictedInRound || "N/A",
        count: maxCountInRound,
        totalPlayers: Object.keys(roundData.playerCounts).length,
        percent:
          roundData.totalMatches > 0
            ? Math.round((maxCountInRound / roundData.totalMatches) * 100)
            : 0,
      };
    });

    // Find overall most predicted winner
    let mostPredictedPlayer = null;
    let maxOverallCount = 0;

    for (const [player, count] of Object.entries(allPlayerWins)) {
      if (count > maxOverallCount) {
        maxOverallCount = count;
        mostPredictedPlayer = player;
      }
    }

    res.json({
      totalPredictions: predictions.length,
      mostPredictedWinner: mostPredictedPlayer || "No data yet",
      winCount: maxOverallCount,
      breakdown: breakdown,
    });
  } catch (err) {
    console.error("Error calculating stats:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Get upset alerts - least predicted winners by round
app.get("/api/stats/upset-alerts", (req, res) => {
  try {
    const data = fs.readFileSync(DATA_FILE);
    const predictions = JSON.parse(data);

    if (predictions.length === 0) {
      return res.json({
        totalPredictions: 0,
        upsetAlerts: [],
      });
    }

    // Count how many times each player is predicted to win each match by round
    const roundStats = [];

    predictions.forEach((prediction) => {
      const bracket = prediction.bracket;

      if (bracket.rounds && Array.isArray(bracket.rounds)) {
        bracket.rounds.forEach((round, roundIdx) => {
          if (!roundStats[roundIdx]) {
            roundStats[roundIdx] = {
              roundName: round.name || `Round ${roundIdx + 1}`,
              playerCounts: {},
              totalMatches: 0,
            };
          }

          if (round.matches && Array.isArray(round.matches)) {
            round.matches.forEach((match) => {
              const winner = match.winner;
              if (winner && !match.isBye) {
                // Count per round
                roundStats[roundIdx].playerCounts[winner] =
                  (roundStats[roundIdx].playerCounts[winner] || 0) + 1;
                roundStats[roundIdx].totalMatches++;
              }
            });
          }
        });
      }
    });

    // Build upset alerts - find least predicted winners in each round
    const upsetAlerts = roundStats
      .filter((roundData, idx) => {
        // Only show rounds with actual predictions (not byes only)
        return Object.keys(roundData.playerCounts).length > 0;
      })
      .map((roundData) => {
        let leastPredictedPlayer = null;
        let minCountInRound = Infinity;

        for (const [player, count] of Object.entries(roundData.playerCounts)) {
          if (count < minCountInRound) {
            minCountInRound = count;
            leastPredictedPlayer = player;
          }
        }

        return {
          round: roundData.roundName,
          playerName: leastPredictedPlayer || "N/A",
          count: minCountInRound === Infinity ? 0 : minCountInRound,
          totalMatches: roundData.totalMatches,
          percent:
            roundData.totalMatches > 0
              ? Math.round((minCountInRound / roundData.totalMatches) * 100)
              : 0,
        };
      });

    res.json({
      totalPredictions: predictions.length,
      upsetAlerts: upsetAlerts.sort((a, b) => a.percent - b.percent), // Sort by least predicted
    });
  } catch (err) {
    console.error("Error calculating upset alerts:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Get popular matchups - most discussed matches by round
app.get("/api/stats/popular-matchups", (req, res) => {
  try {
    const data = fs.readFileSync(DATA_FILE);
    const predictions = JSON.parse(data);

    if (predictions.length === 0) {
      return res.json({
        totalPredictions: 0,
        popularMatchups: [],
      });
    }

    // Count how many times each matchup is predicted by round
    const matchupStats = [];

    predictions.forEach((prediction) => {
      const bracket = prediction.bracket;

      if (bracket.rounds && Array.isArray(bracket.rounds)) {
        bracket.rounds.forEach((round, roundIdx) => {
          if (!matchupStats[roundIdx]) {
            matchupStats[roundIdx] = {
              roundName: round.name || `Round ${roundIdx + 1}`,
              matchups: {},
            };
          }

          if (round.matches && Array.isArray(round.matches)) {
            round.matches.forEach((match) => {
              const playerA = match.playerA;
              const playerB = match.playerB;
              if (!playerA || !playerB) return;

              // Create matchup key (sorted to avoid duplicates like A vs B and B vs A)
              const matchupKey = [playerA, playerB].sort().join(" vs ");
              matchupStats[roundIdx].matchups[matchupKey] =
                (matchupStats[roundIdx].matchups[matchupKey] || 0) + 1;
            });
          }
        });
      }
    });

    // Build popular matchups list - top matchups by prediction count per round
    const popularMatchups = matchupStats
      .filter((data, idx) => {
        return Object.keys(data.matchups).length > 0;
      })
      .map((roundData) => {
        // Sort matchups by count and get top ones from this round
        const sortedMatches = Object.entries(roundData.matchups)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3); // Top 3 per round

        return sortedMatches.map(([matchup, count]) => ({
          round: roundData.roundName,
          matchup: matchup.replace(" vs ", " vs "),
          count,
        }));
      })
      .flat()
      .sort((a, b) => b.count - a.count); // Sort by overall popularity

    res.json({
      totalPredictions: predictions.length,
      popularMatchups: popularMatchups.slice(0, 10), // Top 10 overall
    });
  } catch (err) {
    console.error("Error calculating popular matchups:", err);
    res.status(500).json({ error: "Server error" });
  }
});

function generateBracketStructure() {
  // 36 players: 16 first round matches + 20 byes to round of 16
  return {
    totalPlayers: 36,
    rounds: [
      {
        name: "Round 1",
        matches: Array.from({ length: 16 }, (_, i) => ({
          id: `r1_m${i + 1}`,
          playerA: `player_${i * 2 + 1}`,
          playerB: `player_${i * 2 + 2}`,
        })),
      },
      {
        name: "Round of 32",
        matches: Array.from({ length: 32 }, (_, i) => ({
          id: `r2_m${i + 1}`,
          playerA: `player_${i * 2 + 1}`,
          playerB: `player_${i * 2 + 2}`,
        })),
      },
    ],
  };
}

// Create initial tournament_players.json if it doesn't exist
const dataDir = path.join(__dirname, "data");
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const playersDataPath = path.join(dataDir, "tournament_players.json");
if (!fs.existsSync(playersDataPath)) {
  const initialPlayers = [
    "Kevin Blum",
    "Bye",
    "Keith Morris",
    "Ben Schnelker",
    "Daniel White",
    "Henrik Christensen",
    "Carlo Aclao",
    "Izabella Ksiazek",
    "Tom Slawinski",
    "Bye",
    "Lihong Wu",
    "Jundy Lacuata",
    "Andrew Rears",
    "Pedro de Resende",
    "Xin Liu",
    "Bye",
    "Bill Tamashunas",
    "Bye",
    "Drew Rodriguez",
    "Matt De La Hoz",
    "Vishal Ahuja",
    "Dvir Hizkiyahu",
    "Spencer Heywood",
    "Bye",
    "Adam Zukowski",
    "Gautam Agarwal",
    "Lorenz Nunag",
    "John Manalo",
    "Andre de Resende",
    "Brian McMahon",
    "Pierre Damis",
    "Bye",
  ];
  fs.writeFileSync(playersDataPath, JSON.stringify(initialPlayers, null, 2));
  console.log("Created tournament_players.json");
}

// Frontend static files
app.use(express.static(path.join(__dirname, "../frontend/public")));

app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});
