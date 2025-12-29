const mongoose = require('mongoose');

const appointmentSchema = new mongoose.Schema({
    appointmentId: {
        type: String,
        required: true,
        unique: true
    },
    userId: {
        type: String,
        required: true
    },
    userName: {
        type: String,
        required: true
    },
    userEmail: {
        type: String,
        required: true
    },
    service: {
        type: String,
        required: true,
        enum: [
            'Teeth Cleaning',
            'Tooth Extraction',
            'Root Canal',
            'Dental Checkup',
            'Braces',
            'Adjust'
        ]
    },
    dentist: {
        type: String,
        required: true,
        enum: [
            'Dra. Villaflor',
            'Dr. Smith',
            'Dr. Cruz',
            'Dr. Lee',
            'Dr. Santos'
        ]
    },
    date: {
        type: String, // Format: YYYY-MM-DD
        required: true
    },
    time: {
        type: String, // Format: HH:mm (24-hour)
        required: true
    },
    notes: {
        type: String,
        default: ''
    },
    status: {
        type: String,
        enum: ['Pending', 'Confirmed', 'Cancelled', 'Completed'],
        default: 'Pending'
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// Create index for faster queries
appointmentSchema.index({ userId: 1, date: 1 });
appointmentSchema.index({ date: 1, time: 1 });
appointmentSchema.index({ dentist: 1, date: 1 });

const Appointment = mongoose.model('Appointment', appointmentSchema);

module.exports = Appointment;