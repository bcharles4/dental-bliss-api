require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const app = express();

const appointmentRoutes = require('./routes/Appointments');

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB Connection with better configuration
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://charlesb614_db_user:Go7rjh4TBBaLVWjI@cluster0.ngxwt9s.mongodb.net/bliss_dental?retryWrites=true&w=majority';

// Connection options
const mongooseOptions = {
    serverSelectionTimeoutMS: 10000,
    socketTimeoutMS: 45000,
    maxPoolSize: 10,
    minPoolSize: 5,
    connectTimeoutMS: 10000,
    family: 4,
    retryWrites: true,
    w: 'majority'
};

// Connect to MongoDB
const connectWithRetry = () => {
    console.log('Attempting MongoDB connection...');
    
    mongoose.connect(MONGODB_URI, mongooseOptions)
    .then(() => {
        console.log('✅ MongoDB Connected Successfully');
    })
    .catch(err => {
        console.error('❌ MongoDB Connection Error:', err.message);
        console.log('🔄 Retrying connection in 5 seconds...');
        setTimeout(connectWithRetry, 5000);
    });
};

// Initial connection
connectWithRetry();

// MongoDB event listeners
mongoose.connection.on('error', err => {
    console.error('MongoDB connection error:', err.message);
});

mongoose.connection.on('disconnected', () => {
    console.log('MongoDB disconnected. Attempting to reconnect...');
    setTimeout(connectWithRetry, 5000);
});

mongoose.connection.on('reconnected', () => {
    console.log('✅ MongoDB reconnected');
});

// User Schema
const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true
    },
    password: {
        type: String,
        required: true,
        minlength: 6
    },
    phone: {
        type: String,
        trim: true
    },
    role: {
        type: String,
        enum: ['patient', 'doctor', 'admin'],
        default: 'patient'
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

const User = mongoose.model('User', userSchema);

// Health check endpoint
app.get('/api/health', (req, res) => {
    const dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
    
    res.status(200).json({
        success: true,
        status: 'API is running',
        database: dbStatus,
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// Home route
app.get('/', (req, res) => {
    res.json({ 
        message: 'Dental Bliss API is running!',
        version: '1.0.0',
        endpoints: {
            health: 'GET /api/health',
            register: 'POST /api/register',
            login: 'POST /api/login',
            users: 'GET /api/users',
            checkEmail: 'GET /api/check-email/:email',
            bookAppointment: 'POST /api/appointments/book',
            getUserAppointments: 'GET /api/appointments/user/:userId',
            checkAvailability: 'GET /api/appointments/availability',
            cancelAppointment: 'PUT /api/appointments/cancel/:appointmentId',
            updateAppointment: 'PUT /api/appointments/:appointmentId',
            getAppointment: 'GET /api/appointments/:appointmentId'
        }
    });
});

// Register Route
app.post('/api/register', async (req, res) => {
    try {
        const { name, email, password, phone } = req.body;

        // Validation
        if (!name || !email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Name, email, and password are required'
            });
        }

        if (password.length < 6) {
            return res.status(400).json({
                success: false,
                message: 'Password must be at least 6 characters'
            });
        }

        // Check if user exists
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: 'User already exists with this email'
            });
        }

        // Create user
        const user = new User({
            name,
            email,
            password,
            phone: phone || '',
            role: 'patient'
        });

        await user.save();

        res.status(201).json({
            success: true,
            message: 'Registration successful',
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                phone: user.phone,
                role: user.role
            }
        });

    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error: ' + error.message
        });
    }
});

// Login Route
app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        // Validation
        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Email and password are required'
            });
        }

        // Find user
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password'
            });
        }

        // Check password
        if (user.password !== password) {
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password'
            });
        }

        res.status(200).json({
            success: true,
            message: 'Login successful',
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                phone: user.phone,
                role: user.role
            }
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error: ' + error.message
        });
    }
});

// Get all users (for testing)
app.get('/api/users', async (req, res) => {
    try {
        const users = await User.find().select('-password');
        res.json({
            success: true,
            count: users.length,
            users
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Server error: ' + error.message
        });
    }
});

// Check if email exists
app.get('/api/check-email/:email', async (req, res) => {
    try {
        const { email } = req.params;
        const user = await User.findOne({ email });
        
        res.json({
            success: true,
            exists: !!user
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

// Add appointment routes
app.use('/api/appointments', appointmentRoutes);

// 404 handler - FIXED VERSION
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: 'Route not found'
    });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({
        success: false,
        message: 'Internal server error'
    });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});