const express = require('express');
const cors = require('cors');
const http = require('http');
const socketIO = require('socket.io');
const axios = require('axios');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
app.use(cors({
  origin: [
    'http://localhost:5173',
    'https://pathfinding-simulator-jet.vercel.app/'  // ← Add your Vercel URL
  ],
  credentials: true
}));
const io = socketIO(server, {
  cors: {
    origin: [
      'http://localhost:5173',
      'https://pathfinding-simulator-jet.vercel.app/'  // ← Add your Vercel URL
    ],
    methods: ["GET", "POST"],
    credentials: true
  }
});

// Middleware

app.use(express.json());

// Python service URL
const PYTHON_SERVICE_URL = process.env.PYTHON_SERVICE_URL || 'http://localhost:8000';

// Test route
app.get('/', (req, res) => {
  res.json({ message: 'Pathfinding Simulator API is running!' });
});

// Get available algorithms
app.get('/api/algorithms', async (req, res) => {
  try {
    const response = await axios.get(`${PYTHON_SERVICE_URL}/algorithms`);
    res.json(response.data);
  } catch (error) {
    console.error('Error fetching algorithms:', error.message);
    res.status(500).json({ error: 'Failed to fetch algorithms' });
  }
});

// Execute algorithm (non-realtime)
app.post('/api/execute', async (req, res) => {
  try {
    const { grid, start, goal, algorithm } = req.body;
    
    console.log(`Executing ${algorithm} algorithm...`);
    
    // Call Python service
    const response = await axios.post(`${PYTHON_SERVICE_URL}/execute`, {
      grid,
      start,
      goal,
      algorithm
    });
    
    res.json(response.data);
  } catch (error) {
    console.error('Error executing algorithm:', error.message);
    res.status(500).json({ 
      error: 'Failed to execute algorithm',
      details: error.response?.data || error.message
    });
  }
});

// Socket.IO connection
io.on('connection', (socket) => {
  console.log('New client connected:', socket.id);

  // Execute algorithm with real-time updates
  socket.on('execute-algorithm', async (data) => {
    try {
      const { grid, start, goal, algorithm, speed } = data;
      
      console.log(`Socket: Executing ${algorithm} for client ${socket.id}`);
      
      // Call Python service
      const response = await axios.post(`${PYTHON_SERVICE_URL}/execute`, {
        grid,
        start: [start.row, start.col],
        goal: [goal.row, goal.col],
        algorithm
      });
      
      const result = response.data;
      
      // Send result immediately if no path found
      if (!result.success) {
        socket.emit('algorithm-complete', {
          success: false,
          path: [],
          stats: result.stats,
          runtime: result.runtime
        });
        return;
      }
      
      // Send steps with delay for visualization
      const steps = result.steps || [];
      
      for (let i = 0; i < steps.length; i++) {
        // Check if client is still connected
        if (!socket.connected) break;
        
        // Send current step
        socket.emit('algorithm-step', {
          step: i + 1,
          totalSteps: steps.length,
          current: steps[i].current,
          openList: steps[i].open_list,
          closedList: steps[i].closed_list,
          nodesExplored: steps[i].nodes_explored
        });
        
        // Wait based on speed setting
        await new Promise(resolve => setTimeout(resolve, speed || 50));
      }
      
      // Send final result
      socket.emit('algorithm-complete', {
        success: true,
        path: result.path,
        stats: result.stats,
        runtime: result.runtime
      });
      
      console.log(`Algorithm completed for client ${socket.id}`);
      
    } catch (error) {
      console.error('Socket error:', error.message);
      socket.emit('algorithm-error', {
        error: 'Failed to execute algorithm',
        details: error.response?.data || error.message
      });
    }
  });

  // Pause algorithm
  socket.on('pause-algorithm', () => {
    console.log(`Client ${socket.id} paused algorithm`);
    // TODO: Implement pause logic
  });

  // Resume algorithm
  socket.on('resume-algorithm', () => {
    console.log(`Client ${socket.id} resumed algorithm`);
    // TODO: Implement resume logic
  });

  // Stop algorithm
  socket.on('stop-algorithm', () => {
    console.log(`Client ${socket.id} stopped algorithm`);
    socket.emit('algorithm-stopped');
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Python service URL: ${PYTHON_SERVICE_URL}`);
});