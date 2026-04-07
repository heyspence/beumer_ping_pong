const express = require("express");
const fs = require("fs");
const path = require("path");
const cors = require("cors");
const bodyParser = require("body-parser");
const path = require("path");
const { v4: uuidv4 } = require("uuid");

const app = express();
const PORT = 3001;
const DATA_FILE = path.join(__dirname, "data", "predictions.json");

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Initialize predictions file if it doesn't exist
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
  const { playerId, bracket } = req.body;

  if (!playerId || !bracket) {
    return res.status(400).json({ error: "Player ID and bracket required" });
  }

  let predictions = [];
  try {
    const data = fs.readFileSync(DATA_FILE);
    predictions = JSON.parse(data);
  } catch (err) {
    console.error("Error reading predictions:", err);
    return res.status(500).json({ error: "Server error" });
  }

  // Check if player already has a prediction
  const existingIndex = predictions.findIndex((p) => p.playerId === playerId);

  const newPrediction = {
    id: uuidv4(),
    playerId,
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

app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});
